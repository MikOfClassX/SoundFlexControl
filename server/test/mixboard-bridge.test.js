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
          setTimeout(() => socket.write(`${encode([[0.1, 0.2]])}\n`), 35);
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
  await waitUntil(() => meters.length >= 2, 1000);

  assert.equal(meters[0].channel, "CH_1");
  assert.deepEqual(meters[0].videoInputs, [[0.1, 0.2]]);
  assert.ok(meters[1].sequence > meters[0].sequence);
  assert.ok(inputMeterQueries <= meters.length + 1, "meter polling queued obsolete cycles");
});

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
