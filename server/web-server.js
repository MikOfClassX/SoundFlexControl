import { existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { ACTION_NAMES } from "./actions.js";
import { MixBoardBridge } from "./mixboard-bridge.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function createWebServer({ bridge = new MixBoardBridge() } = {}) {
  const app = express();
  const server = createServer(app);
  const webSockets = new WebSocketServer({ server, path: "/ws" });
  const distPath = path.join(projectRoot, "dist");

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("/{*path}", (_request, response) => response.sendFile(path.join(distPath, "index.html")));
  }

  const broadcast = (message) => {
    const serialized = JSON.stringify(message);
    for (const client of webSockets.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(serialized);
    }
  };

  bridge.on("status", (payload) => broadcast({ type: "connection", payload }));
  bridge.on("snapshot", (payload) => broadcast({ type: "snapshot", payload }));
  bridge.on("state", (payload) => broadcast({ type: "state", payload }));
  bridge.on("meters", (payload) => broadcast({ type: "meters", payload }));
  bridge.on("event", (payload) => broadcast({ type: "event", payload }));
  bridge.on("bridgeError", (error) => broadcastError(broadcast, error));

  webSockets.on("connection", (socket) => {
    send(socket, { type: "settings", payload: bridge.settings });
    send(socket, { type: "connection", payload: { status: bridge.status, settings: bridge.settings } });
    if (bridge.snapshot) send(socket, { type: "snapshot", payload: bridge.snapshot });

    socket.on("message", async (data, isBinary) => {
      if (isBinary) {
        sendError(socket, new TypeError("Binary WebSocket messages are not supported"));
        return;
      }

      let message;
      try {
        message = JSON.parse(data.toString("utf8"));
        await handleMessage(message, bridge, socket);
      } catch (error) {
        sendError(socket, error, message?.requestId);
      }
    });
  });

  return {
    app,
    bridge,
    server,
    webSockets,
    async close() {
      bridge.disconnect();
      for (const client of webSockets.clients) client.close();
      await new Promise((resolve) => webSockets.close(resolve));
      if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

async function handleMessage(message, bridge, socket) {
  if (!message || typeof message !== "object" || typeof message.type !== "string") {
    throw new TypeError("WebSocket message requires a string type");
  }

  switch (message.type) {
    case "connect": {
      const snapshot = await bridge.connect(message.payload);
      send(socket, { type: "request.result", requestId: message.requestId, payload: snapshot });
      break;
    }
    case "disconnect":
      bridge.disconnect();
      send(socket, { type: "request.result", requestId: message.requestId, payload: null });
      break;
    case "snapshot.request": {
      const snapshot = await bridge.refreshSnapshot();
      send(socket, { type: "request.result", requestId: message.requestId, payload: snapshot });
      break;
    }
    case "action": {
      if (!ACTION_NAMES.includes(message.payload?.name)) {
        throw new RangeError(`Unsupported SoundFlex action: ${String(message.payload?.name)}`);
      }
      const result = await bridge.executeAction(message.payload.name, message.payload.payload);
      send(socket, { type: "request.result", requestId: message.requestId, payload: result });
      break;
    }
    default:
      throw new RangeError(`Unsupported WebSocket message type: ${message.type}`);
  }
}

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function sendError(socket, error, requestId) {
  send(socket, {
    type: "error",
    requestId,
    payload: { message: error instanceof Error ? error.message : String(error) },
  });
}

function broadcastError(broadcast, error) {
  broadcast({
    type: "error",
    payload: { message: error instanceof Error ? error.message : String(error) },
  });
}
