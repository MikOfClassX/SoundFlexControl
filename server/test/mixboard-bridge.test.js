import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import { LineFramer } from "../line-framer.js";
import { MixBoardBridge } from "../mixboard-bridge.js";

const encode = (value) => Buffer.from(JSON.stringify(value), "utf8").toString("base64");

test("MixBoardBridge snapshots, executes actions, forwards events, and reconnects", async (context) => {
  const commandSockets = new Set();
  const commands = [];
  let inventoryQueries = 0;
  let soundFlexQueries = 0;

  const commandServer = net.createServer((socket) => {
    commandSockets.add(socket);
    socket.on("close", () => commandSockets.delete(socket));
    socket.write("Welcome on ClassX TCP connection\n");
    const framer = new LineFramer();
    socket.on("data", (chunk) => {
      for (const command of framer.push(chunk)) {
        commands.push(command);
        if (command === "MBC_GETVIDEOINPUTLIST") {
          inventoryQueries += 1;
          socket.write(`${encode({ VIDEOINPUT: [], MAX_SUPPORTED_INPUTS: 24 })}\n`);
        } else if (command === "MBC_GETSOUNDFLEXINFO") {
          soundFlexQueries += 1;
          const result = `${encode({ CURRENT_CHANNEL: "CH_0", PREVIEW_TRACK: "T0", PREVIEW_VOLUME: 1, SOLO_ENABLED: false, TRACK_VOLUME: {}, VIDEOINPUT_AUDIOINFO: [] })}\n`;
          if (soundFlexQueries === 1) {
            for (const eventSocket of eventSockets) {
              eventSocket.write('AUDIOEVENT TYPE=TRACK_CHANGED, AUDIO_TRACK=PRV, VALUE="T2"\n');
            }
            setTimeout(() => socket.write(result), 10);
          } else {
            socket.write(result);
          }
        } else if (command.startsWith("MBC_GETMIXBOARDINFO")) {
          const channel = command.match(/CHANNEL=(CH_\d)/u)?.[1];
          socket.write(`${encode({ ID: channel, NAME: channel, PREVIEW: 0, PROGRAM: 1, KEYER: [], TRANSITION_STATUS: "TRANSITION_FINISHED" })}\n`);
        } else {
          socket.write("Ok\n");
        }
      }
    });
  });

  const eventSockets = new Set();
  const eventServer = net.createServer((socket) => {
    eventSockets.add(socket);
    socket.on("close", () => eventSockets.delete(socket));
    socket.write("PING\n");
  });

  await Promise.all([listen(commandServer), listen(eventServer)]);
  context.after(async () => {
    for (const socket of commandSockets) socket.destroy();
    for (const socket of eventSockets) socket.destroy();
    await Promise.all([closeServer(commandServer), closeServer(eventServer)]);
  });

  const bridge = new MixBoardBridge({
    commandOptions: { connectTimeoutMs: 500, commandTimeoutMs: 500 },
    eventOptions: { connectTimeoutMs: 500 },
    reconnectDelays: [20],
    meterIntervalMs: 0,
    reconcileIntervalMs: 0,
  });
  context.after(() => bridge.disconnect());
  bridge.on("bridgeError", () => undefined);

  const snapshot = await bridge.connect({
    host: "127.0.0.1",
    commandPort: commandServer.address().port,
    eventPort: eventServer.address().port,
  });
  assert.equal(snapshot.videoInputs.MAX_SUPPORTED_INPUTS, 24);
  assert.equal(snapshot.soundFlex.PREVIEW_TRACK, "T2", "an event received during the snapshot was overwritten");
  assert.deepEqual(Object.keys(snapshot.channels), ["CH_0", "CH_1", "CH_2", "CH_3"]);

  const eventPromise = onceBridgeEvent(bridge, "event");
  for (const socket of eventSockets) socket.write("AUDIOEVENT TYPE=TRACK_CHANGED, AUDIO_TRACK=T1, VALUE=\"T1\"\n");
  assert.match(await eventPromise, /^AUDIOEVENT/u);
  assert.equal(bridge.snapshot.soundFlex.PREVIEW_TRACK, "T1");

  await bridge.executeAction("setInputVolume", { channel: "CH_2", videoInputId: 3, volume: 0.4 });
  assert.ok(commands.includes("MBC_SETAUDIOMASTERVOLUMEPERCHANNEL CHANNEL=CH_2 VIDEOINPUTID=3 VOLUME=0.4"));

  const firstFader = bridge.executeAction("setInputVolume", { channel: "CH_2", videoInputId: 3, volume: 0.1 });
  const supersededFader = bridge.executeAction("setInputVolume", { channel: "CH_2", videoInputId: 3, volume: 0.2 });
  const latestFader = bridge.executeAction("setInputVolume", { channel: "CH_2", videoInputId: 3, volume: 0.3 });
  assert.equal((await supersededFader).coalesced, true);
  await Promise.all([firstFader, latestFader]);
  assert.ok(commands.includes("MBC_SETAUDIOMASTERVOLUMEPERCHANNEL CHANNEL=CH_2 VIDEOINPUTID=3 VOLUME=0.1"));
  assert.ok(!commands.includes("MBC_SETAUDIOMASTERVOLUMEPERCHANNEL CHANNEL=CH_2 VIDEOINPUTID=3 VOLUME=0.2"));
  assert.ok(commands.includes("MBC_SETAUDIOMASTERVOLUMEPERCHANNEL CHANNEL=CH_2 VIDEOINPUTID=3 VOLUME=0.3"));
  await waitUntil(() => soundFlexQueries >= 2, 1000);

  const reconnected = waitUntil(() => inventoryQueries >= 2, 1500);
  for (const socket of commandSockets) socket.destroy();
  await reconnected;
  assert.equal(bridge.snapshot.videoInputs.MAX_SUPPORTED_INPUTS, 24);
});

test("MixBoardBridge bounds meter polling while replies are slow", async (context) => {
  const commandSockets = new Set();
  let inputMeterQueries = 0;
  const inputMeterQueryTimes = [];
  const commandServer = net.createServer((socket) => {
    commandSockets.add(socket);
    socket.on("close", () => commandSockets.delete(socket));
    const framer = new LineFramer();
    socket.on("data", (chunk) => {
      for (const command of framer.push(chunk)) {
        if (command === "MBC_GETVIDEOINPUTLIST") {
          socket.write(`${encode({ VIDEOINPUT: [], MAX_SUPPORTED_INPUTS: 1 })}\n`);
        } else if (command === "MBC_GETSOUNDFLEXINFO") {
          socket.write(`${encode({ CURRENT_CHANNEL: "CH_1", PREVIEW_TRACK: "T0", PREVIEW_VOLUME: 1, SOLO_ENABLED: false, TRACK_VOLUME: {}, VIDEOINPUT_AUDIOINFO: [] })}\n`);
        } else if (command.startsWith("MBC_GETMIXBOARDINFO")) {
          const channel = command.match(/CHANNEL=(CH_\d)/u)?.[1];
          socket.write(`${encode({ ID: channel, NAME: channel, PREVIEW: 0, PROGRAM: 0, KEYER: [], TRANSITION_STATUS: "TRANSITION_FINISHED" })}\n`);
        } else if (command === "MBC_GETVIDEOINPUTRMS") {
          inputMeterQueries += 1;
          inputMeterQueryTimes.push(Date.now());
          const value = Math.min(inputMeterQueries, 2) / 10;
          setTimeout(() => socket.write(`${encode([[value, 0.2]])}\n`), 35);
        } else if (command === "MBC_GETAUDIOTRACKRMS CHANNEL=CH_1") {
          setTimeout(() => socket.write(`${encode([0.3, 0.4, 0, 0, 0, 0, 0, 0])}\n`), 35);
        }
      }
    });
  });

  const eventSockets = new Set();
  const eventServer = net.createServer((socket) => {
    eventSockets.add(socket);
    socket.on("close", () => eventSockets.delete(socket));
  });
  await Promise.all([listen(commandServer), listen(eventServer)]);
  context.after(async () => {
    for (const socket of commandSockets) socket.destroy();
    for (const socket of eventSockets) socket.destroy();
    await Promise.all([closeServer(commandServer), closeServer(eventServer)]);
  });

  const bridge = new MixBoardBridge({
    commandOptions: { connectTimeoutMs: 500, commandTimeoutMs: 500 },
    eventOptions: { connectTimeoutMs: 500 },
    reconnectDelays: [20],
    meterIntervalMs: 5,
    reconcileIntervalMs: 0,
  });
  bridge.on("bridgeError", () => undefined);
  context.after(() => bridge.disconnect());

  const meters = [];
  bridge.on("meters", (value) => meters.push(value));
  await bridge.connect({
    host: "127.0.0.1",
    commandPort: commandServer.address().port,
    eventPort: eventServer.address().port,
  });
  await delay(40);
  assert.equal(inputMeterQueries, 0, "meters were queried without an active viewer");

  bridge.setMeterActive(true);
  await waitUntil(() => meters.length >= 2, 1000);

  assert.equal(meters[0].channel, "CH_1");
  assert.deepEqual(meters[0].videoInputs, [[0.1, 0.2]]);
  assert.ok(meters[1].sequence > meters[0].sequence);
  assert.ok(inputMeterQueries <= meters.length + 1, "meter polling queued obsolete cycles");
  await waitUntil(() => inputMeterQueries >= 4, 1000);
  assert.equal(meters.length, 2, "unchanged meter samples were emitted");
  assert.ok(inputMeterQueryTimes.slice(1).every((time, index) => time - inputMeterQueryTimes[index] >= 60), "slow replies did not apply backpressure to the query rate");

  const beforeReconnect = inputMeterQueries;
  for (const socket of commandSockets) socket.destroy();
  await waitUntil(() => inputMeterQueries > beforeReconnect, 1500);

  bridge.setMeterActive(false);
  const stoppedAt = inputMeterQueries;
  await delay(100);
  assert.equal(inputMeterQueries, stoppedAt, "meter polling continued after the last viewer suspended");
});

test("continuous native audio events cannot starve button reconciliation", async (context) => {
  const mock = await audioMock(context);
  await mock.connect();
  mock.enabled = true;
  const stream = setInterval(() => mock.emitAudioEvent(), 5);
  context.after(() => clearInterval(stream));
  try {
    await waitUntil(() => mock.bridge.snapshot.soundFlex.VIDEOINPUT_AUDIOINFO[0].AUDIO_ENABLED.CH_0, 500);
    assert.ok(mock.queries >= 2, "no snapshot was requested while events continued");
  } finally {
    clearInterval(stream);
  }
});

test("web button mutation during an old snapshot triggers a fresh confirmed state", async (context) => {
  const mock = await audioMock(context);
  await mock.connect();
  // Hold the old state reply while a browser action is queued behind it.
  mock.holdNext = true;
  const oldRefresh = mock.bridge.refreshSnapshot();
  await waitUntil(() => Boolean(mock.release), 500);
  const action = mock.bridge.executeAction("setAudioEnabled", { channel: "CH_0", videoInputId: 0, enabled: true });
  mock.emitAudioEvent();
  mock.release();
  await Promise.all([oldRefresh, action]);
  await waitUntil(() => mock.queries >= 3 && mock.bridge.snapshot.soundFlex.VIDEOINPUT_AUDIOINFO[0].AUDIO_ENABLED.CH_0, 500);
  assert.ok(mock.queries >= 3, "mutation was lost behind the active refresh");
});

test("web disable stays off across fade-active snapshots and can be reversed", async (context) => {
  const mock = await audioMock(context);
  mock.enabled = true;
  mock.fadeOutMs = 250;
  await mock.connect();
  await mock.bridge.executeAction("setAudioEnabled", { channel: "CH_0", videoInputId: 0, enabled: false });
  assert.equal(mock.bridge.snapshot.soundFlex.VIDEOINPUT_AUDIOINFO[0].AUDIO_ENABLED.CH_0, false);
  await waitUntil(() => mock.queries >= 2, 500);
  assert.equal(mock.bridge.snapshot.soundFlex.VIDEOINPUT_AUDIOINFO[0].AUDIO_ENABLED.CH_0, false, "fade-active snapshot reverted the confirmed button");
  await mock.bridge.executeAction("setAudioEnabled", { channel: "CH_0", videoInputId: 0, enabled: true });
  assert.equal(mock.bridge.snapshot.soundFlex.VIDEOINPUT_AUDIOINFO[0].AUDIO_ENABLED.CH_0, true);
});

test("native disable settles after fade without waiting for the five-second snapshot", async (context) => {
  const mock = await audioMock(context);
  mock.enabled = true;
  await mock.connect();
  mock.enabled = false;
  mock.fadeUntil = Date.now() + 200;
  mock.emitAudioEvent(false);
  await waitUntil(() => mock.queries >= 2, 500);
  assert.equal(mock.bridge.snapshot.soundFlex.VIDEOINPUT_AUDIOINFO[0].AUDIO_ENABLED.CH_0, true, "snapshot should reflect active Java fade");
  await waitUntil(() => !mock.bridge.snapshot.soundFlex.VIDEOINPUT_AUDIOINFO[0].AUDIO_ENABLED.CH_0, 800);
  assert.ok(mock.queries >= 3, "no post-fade snapshot was taken");
});

async function audioMock(context) {
  const sockets = new Set();
  const eventSockets = new Set();
  const mock = { enabled: false, fadeOutMs: 0, fadeUntil: 0, queries: 0, holdNext: false, release: null };
  const commandServer = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    const framer = new LineFramer();
    socket.on("data", (chunk) => {
      for (const command of framer.push(chunk)) {
        if (command === "MBC_GETVIDEOINPUTLIST") {
          socket.write(`${encode({ VIDEOINPUT: [], MAX_SUPPORTED_INPUTS: 1 })}\n`);
        } else if (command === "MBC_GETSOUNDFLEXINFO") {
          mock.queries += 1;
          const reply = `${encode({ CURRENT_CHANNEL: "CH_0", VIDEOINPUT_AUDIOINFO: [{ AUDIO_ENABLED: { CH_0: mock.enabled || Date.now() < mock.fadeUntil, CH_1: false, CH_2: false, CH_3: false } }] })}\n`;
          if (mock.holdNext) {
            mock.holdNext = false;
            mock.release = () => socket.write(reply);
          } else socket.write(reply);
        } else if (command.startsWith("MBC_GETMIXBOARDINFO")) {
          socket.write(`${encode({ KEYER: [] })}\n`);
        } else if (command.startsWith("MBC_SETAUDIOENABLED")) {
          mock.enabled = command.includes("ENABLED=TRUE");
          mock.fadeUntil = mock.enabled ? 0 : Date.now() + mock.fadeOutMs;
          socket.write("Ok\n");
        } else socket.write("Ok\n");
      }
    });
  });
  const eventServer = net.createServer((socket) => {
    eventSockets.add(socket);
    socket.on("close", () => eventSockets.delete(socket));
  });
  await Promise.all([listen(commandServer), listen(eventServer)]);
  mock.bridge = new MixBoardBridge({ meterIntervalMs: 0, reconcileIntervalMs: 0, reconcileDebounceMs: 30 });
  context.after(async () => {
    mock.bridge.disconnect();
    for (const socket of [...sockets, ...eventSockets]) socket.destroy();
    await Promise.all([closeServer(commandServer), closeServer(eventServer)]);
  });
  mock.connect = () => mock.bridge.connect({ host: "127.0.0.1", commandPort: commandServer.address().port, eventPort: eventServer.address().port });
  mock.emitAudioEvent = (enabled = true) => {
    for (const socket of eventSockets) socket.write(`VIDEOINPUTEVENT VIDEOINPUTID=0, TYPE=AUDIO_ENABLED, VALUE="${enabled}"\n`);
  };
  return mock;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function onceBridgeEvent(emitter, event) {
  return new Promise((resolve) => emitter.once(event, resolve));
}

function waitUntil(predicate, timeoutMs) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for condition"));
      }
    }, 10);
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}
