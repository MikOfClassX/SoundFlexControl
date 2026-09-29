import { EventEmitter } from "node:events";
import net from "node:net";
import { LineFramer } from "./line-framer.js";

const WELCOME_PREFIX = "Welcome";

export class MbCommandClient extends EventEmitter {
  #connectTimeoutMs;
  #commandTimeoutMs;
  #framer = new LineFramer();
  #socket = null;
  #current = null;
  #queueTail = Promise.resolve();
  #intentionalClose = false;

  constructor({ connectTimeoutMs = 4000, commandTimeoutMs = 4000 } = {}) {
    super();
    this.#connectTimeoutMs = connectTimeoutMs;
    this.#commandTimeoutMs = commandTimeoutMs;
  }

  get connected() {
    return Boolean(this.#socket && !this.#socket.destroyed);
  }

  connect(host, port) {
    if (this.connected) {
      return Promise.resolve();
    }

    this.#intentionalClose = false;
    this.#framer.reset();

    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      this.#socket = socket;
      let settled = false;

      const timeout = setTimeout(() => {
        finish(new Error(`Timed out connecting to MBControl at ${host}:${port}`));
        socket.destroy();
      }, this.#connectTimeoutMs);

      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        socket.off("error", onInitialError);
        if (error) reject(error);
        else resolve();
      };

      const onInitialError = (error) => finish(error);
      socket.once("error", onInitialError);
      socket.once("connect", () => {
        this.#attachSocket(socket);
        setTimeout(() => finish(), 30);
      });
    });
  }

  send(command) {
    if (typeof command !== "string" || command.length === 0 || /[\r\n]/u.test(command)) {
      return Promise.reject(new TypeError("MBControl command must be one non-empty line"));
    }

    const operation = this.#queueTail.catch(() => undefined).then(() => this.#sendOne(command));
    this.#queueTail = operation;
    return operation;
  }

  close() {
    this.#intentionalClose = true;
    this.#rejectCurrent(new Error("MBControl command connection closed"));
    this.#socket?.destroy();
    this.#socket = null;
    this.#framer.reset();
  }

  #attachSocket(socket) {
    socket.on("data", (chunk) => {
      for (const line of this.#framer.push(chunk)) {
        this.#handleLine(line);
      }
    });
    socket.on("error", (error) => this.emit("error", error));
    socket.on("close", () => {
      const wasIntentional = this.#intentionalClose;
      this.#socket = null;
      this.#rejectCurrent(new Error("MBControl command connection was lost"));
      this.emit("close", { intentional: wasIntentional });
    });
  }

  #sendOne(command) {
    if (!this.connected || this.#current) {
      return Promise.reject(new Error("MBControl command connection is not ready"));
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#current = null;
        reject(new Error(`MBControl command timed out: ${command.split(" ", 1)[0]}`));
        this.#socket?.destroy();
      }, this.#commandTimeoutMs);

      this.#current = { resolve, reject, timeout };
      this.#socket.write(`${command}\n`, "utf8", (error) => {
        if (error) this.#rejectCurrent(error);
      });
    });
  }

  #handleLine(line) {
    if (line.startsWith(WELCOME_PREFIX)) {
      this.emit("welcome", line);
      return;
    }

    if (!this.#current) {
      this.emit("unmatchedLine", line);
      return;
    }

    const { resolve, timeout } = this.#current;
    this.#current = null;
    clearTimeout(timeout);
    resolve(line);
  }

  #rejectCurrent(error) {
    if (!this.#current) return;
    const { reject, timeout } = this.#current;
    this.#current = null;
    clearTimeout(timeout);
    reject(error);
  }
}
