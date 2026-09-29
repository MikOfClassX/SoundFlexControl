import { EventEmitter } from "node:events";
import net from "node:net";
import { LineFramer } from "./line-framer.js";

export class MbEventClient extends EventEmitter {
  #connectTimeoutMs;
  #framer = new LineFramer();
  #socket = null;
  #intentionalClose = false;

  constructor({ connectTimeoutMs = 4000 } = {}) {
    super();
    this.#connectTimeoutMs = connectTimeoutMs;
  }

  get connected() {
    return Boolean(this.#socket && !this.#socket.destroyed);
  }

  connect(host, port) {
    if (this.connected) return Promise.resolve();

    this.#intentionalClose = false;
    this.#framer.reset();

    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      this.#socket = socket;
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        socket.off("error", onInitialError);
        if (error) reject(error);
        else resolve();
      };
      const timeout = setTimeout(() => {
        socket.destroy();
        finish(new Error(`Timed out connecting to MBControl events at ${host}:${port}`));
      }, this.#connectTimeoutMs);
      const onInitialError = (error) => finish(error);

      socket.once("error", onInitialError);
      socket.once("connect", () => {
        this.#attachSocket(socket);
        finish();
      });
    });
  }

  close() {
    this.#intentionalClose = true;
    this.#socket?.destroy();
    this.#socket = null;
    this.#framer.reset();
  }

  #attachSocket(socket) {
    socket.on("data", (chunk) => {
      for (const line of this.#framer.push(chunk)) {
        if (line !== "PING" && line !== "") this.emit("event", line);
      }
    });
    socket.on("error", (error) => this.emit("error", error));
    socket.on("close", () => {
      const wasIntentional = this.#intentionalClose;
      this.#socket = null;
      this.emit("close", { intentional: wasIntentional });
    });
  }
}
