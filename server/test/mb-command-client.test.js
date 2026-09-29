import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import { LineFramer } from "../line-framer.js";
import { MbCommandClient } from "../mb-command-client.js";

test("MbCommandClient consumes the welcome line and serializes commands", async (context) => {
  const received = [];
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    const framer = new LineFramer();
    socket.write("Welcome on ClassX TCP connection\n");
    socket.on("data", (chunk) => {
      for (const line of framer.push(chunk)) {
        received.push(line);
        setTimeout(() => socket.write(`${line === "PING" ? "Ok" : "reply"}\n`), line === "PING" ? 15 : 0);
      }
    });
  });
  await listen(server);

  const client = new MbCommandClient({ connectTimeoutMs: 500, commandTimeoutMs: 500 });
  client.on("error", () => undefined);
  context.after(async () => {
    client.close();
    for (const socket of sockets) socket.destroy();
    await closeServer(server);
  });
  await client.connect("127.0.0.1", server.address().port);

  const first = client.send("PING");
  const second = client.send("HELP");
  assert.equal(await first, "Ok");
  assert.equal(await second, "reply");
  assert.deepEqual(received, ["PING", "HELP"]);
});

test("MbCommandClient times out an unanswered command and closes the socket", async (context) => {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await listen(server);

  const client = new MbCommandClient({ connectTimeoutMs: 500, commandTimeoutMs: 30 });
  client.on("error", () => undefined);
  context.after(async () => {
    client.close();
    for (const socket of sockets) socket.destroy();
    await closeServer(server);
  });

  await client.connect("127.0.0.1", server.address().port);
  await assert.rejects(client.send("PING"), /timed out/u);
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}
