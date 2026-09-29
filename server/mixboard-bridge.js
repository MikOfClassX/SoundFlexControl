import { EventEmitter } from "node:events";
import { buildActionCommands } from "./actions.js";
import { parseEventRecord, reduceEvent } from "./event-state.js";
import { MbCommandClient } from "./mb-command-client.js";
import { MbEventClient } from "./mb-event-client.js";
import { readMeters, readSnapshot, readSoundFlex } from "./snapshot.js";
import { CHANNELS, validateSettings } from "./validation.js";

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
  #meterSequence = 0;
  #periodicReconcileTimer = null;
  #reconcileTimer = null;
  #pendingReconcile = null;
  #refreshOperation = null;
  #refreshKind = null;
  #eventsDuringRefresh = [];
  #actionSlots = new Map();

  constructor({
    commandOptions,
    eventOptions,
    reconnectDelays = [250, 500, 1000, 2000, 5000],
    meterIntervalMs = 100,
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
      }
    }).catch(() => undefined);
    return operation;
  }

  #scheduleReconcile(kind) {
    if (!this.#desired || !this.#commandClient?.connected) return;
    if (kind === "full" || !this.#pendingReconcile) this.#pendingReconcile = kind;
    clearTimeout(this.#reconcileTimer);
    this.#reconcileTimer = setTimeout(() => {
      this.#reconcileTimer = null;
      const requested = this.#pendingReconcile;
      this.#pendingReconcile = null;
      const refresh = requested === "full" ? this.refreshSnapshot() : this.#refreshSoundFlex();
      refresh.catch((error) => this.#reportCoordinationError(error));
    }, this.#reconcileDebounceMs);
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

  #startCoordination(generation) {
    if (this.#meterIntervalMs > 0) {
      this.#meterTimer = setInterval(() => this.#pollMeters(generation), this.#meterIntervalMs);
      this.#meterTimer.unref?.();
      this.#pollMeters(generation);
    }
    if (this.#reconcileIntervalMs > 0) {
      this.#periodicReconcileTimer = setInterval(() => {
        this.refreshSnapshot().catch((error) => this.#reportCoordinationError(error));
      }, this.#reconcileIntervalMs);
      this.#periodicReconcileTimer.unref?.();
    }
  }

  #stopCoordination() {
    clearInterval(this.#meterTimer);
    clearInterval(this.#periodicReconcileTimer);
    clearTimeout(this.#reconcileTimer);
    this.#meterTimer = null;
    this.#periodicReconcileTimer = null;
    this.#reconcileTimer = null;
    this.#pendingReconcile = null;
    this.#meterInFlight = false;
  }

  async #pollMeters(generation) {
    if (this.#meterInFlight || !this.#desired || generation !== this.#generation || !this.#commandClient?.connected) return;
    const channel = this.#snapshot?.soundFlex?.CURRENT_CHANNEL;
    if (!CHANNELS.includes(channel)) return;

    this.#meterInFlight = true;
    const commandClient = this.#commandClient;
    const sequence = ++this.#meterSequence;
    try {
      const meters = await readMeters(commandClient, channel, sequence);
      if (this.#desired && generation === this.#generation && commandClient === this.#commandClient && channel === this.#snapshot?.soundFlex?.CURRENT_CHANNEL) {
        this.emit("meters", meters);
      }
    } catch (error) {
      this.#reportCoordinationError(error);
    } finally {
      if (generation === this.#generation) this.#meterInFlight = false;
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
    this.#scheduleReconcile("soundFlex");
    return { name, results, coalesced: false };
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

function coalescingKey(name, payload) {
  if (!COALESCED_ACTIONS.has(name)) return null;
  if (name === "setPreviewVolume") return name;
  if (name === "setTrackVolume") return `${name}:${String(payload?.track)}`;
  return `${name}:${String(payload?.channel)}:${String(payload?.videoInputId)}`;
}
