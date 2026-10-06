import { EventEmitter } from "node:events";
import { buildActionCommands } from "./actions.js";
import { parseEventRecord, reduceEvent } from "./event-state.js";
import { MbCommandClient } from "./mb-command-client.js";
import { MbEventClient } from "./mb-event-client.js";
import { readMeters, readSnapshot, readSoundFlex } from "./snapshot.js";
import { CHANNELS, validateChannel, validateSettings } from "./validation.js";

const COALESCED_ACTIONS = new Set(["setPreviewVolume", "setTrackVolume", "setInputVolume"]);

export class MixBoardBridge extends EventEmitter {
  #commandOptions;
  #eventOptions;
  #reconnectDelays;
  #meterIntervalMs;
  #reconcileIntervalMs;
  #reconcileDebounceMs;
  #commandClient = null;
  #eventClient = null;
  #settings = null;
  #snapshot = null;
  #desired = false;
  #establishing = null;
  #reconnectTimer = null;
  #retryIndex = 0;
  #generation = 0;
  #status = "disconnected";
  #meterTimer = null;
  #meterInFlight = false;
  #meterChannels = new Set();
  #meterSequence = 0;
  #latestMeters = new Map();
  #periodicReconcileTimer = null;
  #reconcileTimer = null;
  #pendingReconcile = null;
  #refreshOperation = null;
  #refreshKind = null;
  #eventsDuringRefresh = [];
  #actionSlots = new Map();
  #audioEnableTargets = new Map();
  #audioSettleUntil = 0;
  #audioSettleTimer = null;

  constructor({
    commandOptions,
    eventOptions,
    reconnectDelays = [250, 500, 1000, 2000, 5000],
    meterIntervalMs = 150,
    reconcileIntervalMs = 5000,
    reconcileDebounceMs = 50,
  } = {}) {
    super();
    this.#commandOptions = commandOptions;
    this.#eventOptions = eventOptions;
    this.#reconnectDelays = reconnectDelays;
    this.#meterIntervalMs = meterIntervalMs;
    this.#reconcileIntervalMs = reconcileIntervalMs;
    this.#reconcileDebounceMs = reconcileDebounceMs;
  }

  get settings() {
    return this.#settings ? { ...this.#settings } : null;
  }

  get snapshot() {
    return this.#snapshot;
  }

  get status() {
    return this.#status;
  }

  getCachedMeters(channel) {
    validateChannel(channel);
    return this.#status === "connected" ? this.#latestMeters.get(channel) ?? null : null;
  }

  setMeterChannels(channels) {
    const next = new Set(channels.map(validateChannel));
    for (const channel of this.#meterChannels) {
      if (!next.has(channel)) this.#latestMeters.delete(channel);
    }
    this.#meterChannels = next;
    if (next.size > 0) {
      this.#scheduleMeterPoll(0);
    } else {
      clearTimeout(this.#meterTimer);
      this.#meterTimer = null;
    }
  }

  async connect(settings) {
    const validated = validateSettings(settings);
    this.disconnect();
    this.#settings = validated;
    this.#desired = true;
    this.#retryIndex = 0;
    return this.#establish(this.#generation);
  }

  disconnect() {
    this.#generation += 1;
    this.#desired = false;
    this.#stopCoordination();
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    this.#commandClient?.close();
    this.#eventClient?.close();
    this.#commandClient = null;
    this.#eventClient = null;
    this.#establishing = null;
    this.#refreshOperation = null;
    this.#refreshKind = null;
    this.#eventsDuringRefresh = [];
    this.#cancelPendingActions();
    this.#snapshot = null;
    this.#latestMeters.clear();
    this.#emitStatus("disconnected");
  }

  async refreshSnapshot() {
    if (!this.#commandClient?.connected) throw new Error("MixBoard is not connected");

    if (this.#refreshOperation) {
      const activeKind = this.#refreshKind;
      const activeOperation = this.#refreshOperation;
      await activeOperation;
      if (activeKind === "full") return this.#snapshot;
      if (this.#refreshOperation && this.#refreshOperation !== activeOperation) return this.refreshSnapshot();
    }
    return this.#startRefresh("full");
  }

  async executeAction(name, payload) {
    if (!this.#commandClient?.connected) throw new Error("MixBoard is not connected");
    buildActionCommands(name, payload, this.#snapshot?.videoInputs?.MAX_SUPPORTED_INPUTS);
    const key = coalescingKey(name, payload);
    if (!key) return this.#executeActionNow(name, payload);
    return this.#enqueueCoalescedAction(key, name, payload);
  }

  #establish(generation) {
    if (this.#establishing) return this.#establishing;

    const operation = this.#establishImpl(generation);
    this.#establishing = operation;
    operation.finally(() => {
      if (this.#establishing === operation) this.#establishing = null;
    }).catch(() => undefined);
    return operation;
  }

  async #establishImpl(generation) {
    if (!this.#desired || !this.#settings || generation !== this.#generation) return null;

    this.#emitStatus("connecting");
    const commandClient = new MbCommandClient(this.#commandOptions);
    const eventClient = new MbEventClient(this.#eventOptions);
    this.#commandClient = commandClient;
    this.#eventClient = eventClient;
    this.#wireClients(commandClient, eventClient);

    try {
      await eventClient.connect(this.#settings.host, this.#settings.eventPort);
      if (!this.#desired || generation !== this.#generation) return null;
      await commandClient.connect(this.#settings.host, this.#settings.commandPort);
      if (!this.#desired || generation !== this.#generation) return null;
      this.#retryIndex = 0;
      this.#stopCoordination();
      const snapshot = await this.refreshSnapshot();
      if (!this.#desired || generation !== this.#generation) return null;
      this.#startCoordination(generation);
      this.#emitStatus("connected");
      return snapshot;
    } catch (error) {
      commandClient.close();
      eventClient.close();
      if (!this.#desired || generation !== this.#generation) return null;
      this.emit("bridgeError", error);
      this.#scheduleReconnect(generation);
      throw error;
    }
  }

  #wireClients(commandClient, eventClient) {
    commandClient.on("error", (error) => this.emit("bridgeError", error));
    eventClient.on("error", (error) => this.emit("bridgeError", error));
    eventClient.on("event", (line) => this.#handleEvent(line));

    const generation = this.#generation;
    const onClose = ({ intentional }) => {
      if (!intentional && this.#desired && generation === this.#generation) {
        this.#stopCoordination();
        this.#latestMeters.clear();
        commandClient.close();
        eventClient.close();
        this.#emitStatus("reconnecting");
        this.#scheduleReconnect(generation);
      }
    };

    commandClient.on("close", onClose);
    eventClient.on("close", onClose);
  }

  #handleEvent(line) {
    this.emit("event", line);
    const event = parseEventRecord(line);
    if (!event) return;

    if (event.prefix === "VIDEOINPUTEVENT" && event.fields.TYPE === "AUDIO_ENABLED") {
      // Native AUDIO_ENABLED snapshots include active fade-out, not just the
      // requested switch state. Follow the fade through its maximum 2s duration.
      this.#audioSettleUntil = Date.now() + 2500;
    }
    if (this.#refreshOperation) this.#eventsDuringRefresh.push(event);
    const result = reduceEvent(this.#snapshot, event);
    if (result.changed) {
      this.#snapshot = result.snapshot;
      this.emit("state", this.#snapshot);
    }
    if (result.reconcile) this.#scheduleReconcile(result.reconcile);
  }

  #startRefresh(kind) {
    const commandClient = this.#commandClient;
    const generation = this.#generation;
    this.#refreshKind = kind;
    this.#eventsDuringRefresh = [];

    const operation = (async () => {
      if (kind === "full") {
        this.#snapshot = await readSnapshot(commandClient);
      } else {
        const soundFlex = await readSoundFlex(commandClient);
        if (!this.#snapshot) throw new Error("Cannot reconcile SoundFlex before the initial snapshot");
        this.#snapshot = { ...this.#snapshot, soundFlex, receivedAt: new Date().toISOString() };
      }

      if (!this.#desired || generation !== this.#generation || commandClient !== this.#commandClient) return null;
      let followup = null;
      for (const event of this.#eventsDuringRefresh) {
        const reduced = reduceEvent(this.#snapshot, event);
        this.#snapshot = reduced.snapshot;
        if (reduced.reconcile === "full" || (!followup && reduced.reconcile)) followup = reduced.reconcile;
      }
      // A disable refreshed during fade-out needs another native GUI read once
      // the real model confirms that the fade has finished.
      const nativeRefreshNeeded = this.#applyAudioEnableTargets();
      if (nativeRefreshNeeded) {
        await this.#requestNativeGuiRefresh(commandClient);
        if (!this.#desired || generation !== this.#generation || commandClient !== this.#commandClient) return null;
      }
      this.#scheduleAudioSettle();
      this.emit(kind === "full" ? "snapshot" : "state", this.#snapshot);
      if (followup) this.#scheduleReconcile(followup);
      return this.#snapshot;
    })();

    this.#refreshOperation = operation;
    operation.finally(() => {
      if (this.#refreshOperation === operation) {
        this.#refreshOperation = null;
        this.#refreshKind = null;
        this.#eventsDuringRefresh = [];
        if (this.#pendingReconcile) this.#scheduleReconcile(this.#pendingReconcile, 0);
      }
    }).catch(() => undefined);
    return operation;
  }

  #scheduleReconcile(kind, delay = this.#reconcileDebounceMs) {
    if (!this.#desired || !this.#commandClient?.connected) return;
    if (kind === "full" || !this.#pendingReconcile) this.#pendingReconcile = kind;
    // Bound the wait from the FIRST event, not the last. Continuous native audio
    // events must not keep postponing state updates indefinitely.
    if (this.#reconcileTimer || this.#refreshOperation) return;
    this.#reconcileTimer = setTimeout(() => {
      this.#reconcileTimer = null;
      // Keep the request pending if another refresh started in the meantime.
      // Its completion will drain it rather than silently dropping the update.
      if (this.#refreshOperation) return;
      const requested = this.#pendingReconcile;
      this.#pendingReconcile = null;
      const refresh = requested === "full" ? this.refreshSnapshot() : this.#refreshSoundFlex();
      refresh.catch((error) => this.#reportCoordinationError(error));
    }, delay);
    this.#reconcileTimer.unref?.();
  }

  async #refreshSoundFlex() {
    if (!this.#commandClient?.connected) throw new Error("MixBoard is not connected");
    if (this.#refreshOperation) {
      await this.#refreshOperation;
      return this.#snapshot?.soundFlex;
    }
    const snapshot = await this.#startRefresh("soundFlex");
    return snapshot?.soundFlex;
  }

  #applyAudioEnableTargets() {
    let nativeRefreshNeeded = false;
    for (const [key, target] of this.#audioEnableTargets) {
      const enabled = this.#snapshot?.soundFlex?.VIDEOINPUT_AUDIOINFO?.[target.videoInputId]?.AUDIO_ENABLED;
      if (!enabled || enabled[target.channel] === target.enabled || Date.now() >= target.expiresAt) {
        if (!target.enabled && enabled?.[target.channel] === false) nativeRefreshNeeded = true;
        this.#audioEnableTargets.delete(key);
      } else {
        // Only a successful, explicitly scoped web command can override a
        // fade-active snapshot. Unscoped Java events never guess the channel.
        enabled[target.channel] = target.enabled;
      }
    }
    return nativeRefreshNeeded;
  }

  #scheduleAudioSettle() {
    if (!this.#desired || this.#audioSettleTimer || Date.now() >= this.#audioSettleUntil) return;
    this.#audioSettleTimer = setTimeout(() => {
      this.#audioSettleTimer = null;
      this.#scheduleReconcile("soundFlex", 0);
    }, 100);
    this.#audioSettleTimer.unref?.();
  }

  #startCoordination() {
    this.#scheduleMeterPoll(0);
    if (this.#reconcileIntervalMs > 0) {
      this.#periodicReconcileTimer = setInterval(() => {
        this.refreshSnapshot().catch((error) => this.#reportCoordinationError(error));
      }, this.#reconcileIntervalMs);
      this.#periodicReconcileTimer.unref?.();
    }
  }

  #stopCoordination() {
    clearTimeout(this.#meterTimer);
    clearInterval(this.#periodicReconcileTimer);
    clearTimeout(this.#reconcileTimer);
    clearTimeout(this.#audioSettleTimer);
    this.#audioSettleTimer = null;
    this.#audioSettleUntil = 0;
    this.#audioEnableTargets.clear();
    this.#meterTimer = null;
    this.#periodicReconcileTimer = null;
    this.#reconcileTimer = null;
    this.#pendingReconcile = null;
    this.#meterInFlight = false;
  }

  #scheduleMeterPoll(delay = this.#meterIntervalMs) {
    if (this.#meterChannels.size === 0 || this.#meterIntervalMs <= 0 || this.#meterTimer || this.#meterInFlight || !this.#desired || !this.#commandClient?.connected) return;
    const generation = this.#generation;
    this.#meterTimer = setTimeout(() => {
      this.#meterTimer = null;
      this.#pollMeters(generation);
    }, delay);
    this.#meterTimer.unref?.();
  }

  async #pollMeters(generation) {
    if (this.#meterInFlight || this.#meterChannels.size === 0 || !this.#desired || generation !== this.#generation || !this.#commandClient?.connected) return;
    const channels = CHANNELS.filter(channel => this.#meterChannels.has(channel));

    // State changes take precedence over starting another background meter cycle.
    if (this.#pendingReconcile || this.#refreshOperation) {
      this.#scheduleMeterPoll();
      return;
    }

    this.#meterInFlight = true;
    const commandClient = this.#commandClient;
    const sequence = ++this.#meterSequence;
    try {
      const samples = await readMeters(commandClient, channels, sequence);
      if (this.#desired && generation === this.#generation && commandClient === this.#commandClient) {
        for (const meters of samples) {
          if (!this.#meterChannels.has(meters.channel)) continue;
          if (!sameMeterValues(this.#latestMeters.get(meters.channel), meters)) {
            this.#latestMeters.set(meters.channel, meters);
            this.emit("meters", meters);
          }
        }
      }
    } catch (error) {
      this.#reportCoordinationError(error);
    } finally {
      if (generation === this.#generation && commandClient === this.#commandClient) {
        this.#meterInFlight = false;
        this.#scheduleMeterPoll();
      }
    }
  }

  #enqueueCoalescedAction(key, name, payload) {
    return new Promise((resolve, reject) => {
      const entry = { name, payload, resolve, reject };
      const slot = this.#actionSlots.get(key);
      if (!slot) {
        const created = { pending: null };
        this.#actionSlots.set(key, created);
        this.#runActionEntry(key, created, entry);
        return;
      }
      if (slot.pending) slot.pending.resolve({ name: slot.pending.name, results: [], coalesced: true });
      slot.pending = entry;
    });
  }

  async #runActionEntry(key, slot, entry) {
    try {
      entry.resolve(await this.#executeActionNow(entry.name, entry.payload));
    } catch (error) {
      entry.reject(error);
    } finally {
      if (this.#actionSlots.get(key) !== slot) return;
      if (slot.pending) {
        const pending = slot.pending;
        slot.pending = null;
        this.#runActionEntry(key, slot, pending);
      } else {
        this.#actionSlots.delete(key);
      }
    }
  }

  #cancelPendingActions() {
    for (const slot of this.#actionSlots.values()) {
      slot.pending?.reject(new Error("MixBoard connection closed before the action was sent"));
    }
    this.#actionSlots.clear();
  }

  async #executeActionNow(name, payload) {
    if (!this.#commandClient?.connected) throw new Error("MixBoard is not connected");

    const maxInputs = this.#snapshot?.videoInputs?.MAX_SUPPORTED_INPUTS;
    const commands = buildActionCommands(name, payload, maxInputs);
    const results = [];
    for (const command of commands) {
      const result = await this.#commandClient.send(command);
      if (result !== "Ok") throw new Error(`${command.split(" ", 1)[0]} failed: ${result}`);
      results.push(result);
    }
    if (name === "setAudioEnabled" && this.#snapshot) {
      const expiresAt = Date.now() + 2500;
      this.#audioEnableTargets.set(`${payload.channel}:${payload.videoInputId}`, { ...payload, expiresAt });
      this.#audioSettleUntil = expiresAt;
      this.#snapshot = structuredClone(this.#snapshot);
      const enabled = this.#snapshot.soundFlex.VIDEOINPUT_AUDIOINFO?.[payload.videoInputId]?.AUDIO_ENABLED;
      if (enabled) {
        enabled[payload.channel] = payload.enabled;
        this.#snapshot.receivedAt = new Date().toISOString();
        this.emit("state", this.#snapshot);
      }
    }
    // Refresh native controls only after all mutation commands succeed. Keep
    // this out of results: it acknowledges a visual request, not an audio edit.
    await this.#requestNativeGuiRefresh(this.#commandClient);
    this.#scheduleReconcile("soundFlex", 0);
    return { name, results, coalesced: false };
  }

  async #requestNativeGuiRefresh(commandClient) {
    if (!this.#desired || commandClient !== this.#commandClient || !commandClient?.connected) return;
    try {
      const result = await commandClient.send("MBC_UPDATESOUNDFLEXGUI");
      if (result !== "Ok") throw new Error(`MBC_UPDATESOUNDFLEXGUI failed: ${result}`);
    } catch (error) {
      // The mutation is already confirmed; report refresh failure separately
      // rather than falsely claiming that the audio command failed.
      this.#reportCoordinationError(error);
    }
  }

  #reportCoordinationError(error) {
    if (this.#desired && this.#commandClient?.connected) this.emit("bridgeError", error);
  }

  #scheduleReconnect(generation) {
    if (!this.#desired || this.#reconnectTimer || generation !== this.#generation) return;

    const delay = this.#reconnectDelays[Math.min(this.#retryIndex, this.#reconnectDelays.length - 1)];
    this.#retryIndex += 1;
    this.#emitStatus("reconnecting", { retryInMs: delay });
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#establish(generation).catch(() => undefined);
    }, delay);
  }

  #emitStatus(status, extra = {}) {
    this.#status = status;
    this.emit("status", { status, settings: this.settings, ...extra });
  }
}

function sameMeterValues(previous, next) {
  return previous?.channel === next.channel
    && JSON.stringify(previous.videoInputs) === JSON.stringify(next.videoInputs)
    && JSON.stringify(previous.outputTracks) === JSON.stringify(next.outputTracks);
}

function coalescingKey(name, payload) {
  if (!COALESCED_ACTIONS.has(name)) return null;
  if (name === "setPreviewVolume") return name;
  if (name === "setTrackVolume") return `${name}:${String(payload?.track)}`;
  return `${name}:${String(payload?.channel)}:${String(payload?.videoInputId)}`;
}
