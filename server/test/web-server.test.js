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

  const meterBroadcast = waitForType(socket, "meters");
  bridge.emit("meters", { channel: "CH_0", videoInputs: [], outputTracks: [], sequence: 1 });
  assert.equal((await meterBroadcast).payload.sequence, 1);
});

class FakeBridge extends EventEmitter {
  settings = null;
  snapshot = null;
  actions = [];
  status = "disconnected";

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
