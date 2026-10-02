import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { WebSocket } from "ws";
import { createWebServer } from "../web-server.js";

test("web server exposes typed connect and action requests over WebSocket", async (context) => {
  const bridge = new FakeBridge();
  const application = createWebServer({ bridge });
  await new Promise((resolve) => application.server.listen(0, "127.0.0.1", resolve));
  context.after(() => application.close());

  const socket = new WebSocket(`ws://127.0.0.1:${application.server.address().port}/ws`);
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  context.after(() => socket.close());

  const connectResult = waitForRequest(socket, "connect-1");
  socket.send(JSON.stringify({
    type: "connect",
    requestId: "connect-1",
    payload: { host: "mixboard.local", commandPort: 701, eventPort: 801 },
  }));
  assert.equal((await connectResult).payload.videoInputs.MAX_SUPPORTED_INPUTS, 2);

  const actionResult = waitForRequest(socket, "action-1");
  socket.send(JSON.stringify({
    type: "action",
    requestId: "action-1",
    payload: { name: "setPreviewVolume", payload: { volume: 0.4 } },
  }));
  assert.deepEqual((await actionResult).payload, { name: "setPreviewVolume", results: ["Ok"] });
  assert.deepEqual(bridge.actions, [["setPreviewVolume", { volume: 0.4 }]]);

  const stateBroadcast = waitForType(socket, "state");
  bridge.emit("state", bridge.snapshot);
  assert.equal((await stateBroadcast).payload.videoInputs.MAX_SUPPORTED_INPUTS, 2);

  socket.send(JSON.stringify({ type: "meters.subscription", payload: { active: true } }));
  await waitUntil(() => bridge.meterActive);
  const meterBroadcast = waitForType(socket, "meters");
  bridge.emit("meters", { channel: "CH_0", videoInputs: [], outputTracks: [], sequence: 1 });
  assert.equal((await meterBroadcast).payload.sequence, 1);
});

test("web server shares meter demand, scopes broadcasts, and serves the cached sample", async (context) => {
  const bridge = new FakeBridge();
  bridge.latestMeters = { channel: "CH_0", videoInputs: [[0.1, 0.2]], outputTracks: [], sequence: 7 };
  const application = createWebServer({ bridge });
  await new Promise((resolve) => application.server.listen(0, "127.0.0.1", resolve));
  context.after(() => application.close());

  const url = `ws://127.0.0.1:${application.server.address().port}/ws`;
  const first = await openSocket(url);
  const second = await openSocket(url);
  context.after(() => {
    first.close();
    second.close();
  });

  const firstCached = waitForType(first, "meters");
  first.send(JSON.stringify({ type: "meters.subscription", payload: { active: true } }));
  assert.equal((await firstCached).payload.sequence, 7);
  await waitUntil(() => bridge.meterActive);

  const firstLive = waitForType(first, "meters");
  const secondLive = expectNoType(second, "meters", 100);
  bridge.emit("meters", { ...bridge.latestMeters, sequence: 8 });
  assert.equal((await firstLive).payload.sequence, 8);
  await secondLive;

  const secondCached = waitForType(second, "meters");
  second.send(JSON.stringify({ type: "meters.subscription", payload: { active: true } }));
  assert.equal((await secondCached).payload.sequence, 7);
  assert.equal(bridge.meterActiveChanges.filter(Boolean).length, 1, "a second viewer started another meter stream");

  first.send(JSON.stringify({ type: "meters.subscription", payload: { active: false } }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(bridge.meterActive, true);
  second.send(JSON.stringify({ type: "meters.subscription", payload: { active: false } }));
  await waitUntil(() => !bridge.meterActive);
});

class FakeBridge extends EventEmitter {
  settings = null;
  snapshot = null;
  actions = [];
  status = "disconnected";
  latestMeters = null;
  meterActive = false;
  meterActiveChanges = [];

  setMeterActive(active) {
    if (active === this.meterActive) return;
    this.meterActive = active;
    this.meterActiveChanges.push(active);
  }

  async connect(settings) {
    this.settings = settings;
    this.status = "connected";
    this.snapshot = {
      videoInputs: { VIDEOINPUT: [], MAX_SUPPORTED_INPUTS: 2 },
      soundFlex: {},
      channels: {},
      receivedAt: new Date().toISOString(),
    };
    this.emit("status", { status: "connected", settings });
    this.emit("snapshot", this.snapshot);
    return this.snapshot;
  }

  disconnect() {
    this.status = "disconnected";
    this.emit("status", { status: "disconnected", settings: this.settings });
  }

  async refreshSnapshot() {
    return this.snapshot;
  }

  async executeAction(name, payload) {
    this.actions.push([name, payload]);
    return { name, results: ["Ok"] };
  }
}

function openSocket(url) {
  const socket = new WebSocket(url);
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function expectNoType(socket, type, milliseconds) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("message", onMessage);
      resolve();
    }, milliseconds);
    const onMessage = (data) => {
      const message = JSON.parse(data.toString("utf8"));
      if (message.type !== type) return;
      clearTimeout(timeout);
      socket.off("message", onMessage);
      reject(new Error(`Unexpected ${type} message`));
    };
    socket.on("message", onMessage);
  });
}

function waitUntil(predicate, timeoutMs = 1000) {
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
    }, 5);
  });
}

function waitForType(socket, type) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error(`Timed out waiting for ${type}`));
    }, 1000);
    const onMessage = (data) => {
      const message = JSON.parse(data.toString("utf8"));
      if (message.type !== type) return;
      clearTimeout(timeout);
      socket.off("message", onMessage);
      resolve(message);
    };
    socket.on("message", onMessage);
  });
}

function waitForRequest(socket, requestId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error(`Timed out waiting for ${requestId}`));
    }, 1000);
    const onMessage = (data) => {
      const message = JSON.parse(data.toString("utf8"));
      if (message.requestId !== requestId) return;
      clearTimeout(timeout);
      socket.off("message", onMessage);
      if (message.type === "error") reject(new Error(message.payload.message));
      else resolve(message);
    };
    socket.on("message", onMessage);
  });
}
