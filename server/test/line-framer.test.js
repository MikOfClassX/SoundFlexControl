import assert from "node:assert/strict";
import test from "node:test";
import { LineFramer } from "../line-framer.js";
import { decodeBase64Json } from "../snapshot.js";

test("LineFramer retains partial data and accepts LF or CRLF", () => {
  const framer = new LineFramer();
  assert.deepEqual(framer.push(Buffer.from("one\r\ntw")), ["one"]);
  assert.deepEqual(framer.push(Buffer.from("o\nthree\n")), ["two", "three"]);
});

test("decodeBase64Json decodes standard Base64 JSON and rejects invalid replies", () => {
  const encoded = Buffer.from(JSON.stringify({ value: 7 }), "utf8").toString("base64");
  assert.deepEqual(decodeBase64Json(encoded), { value: 7 });
  assert.deepEqual(decodeBase64Json(encoded.replace(/=+$/u, "")), { value: 7 });
  assert.throws(() => decodeBase64Json("***"), /Base64/u);
  assert.throws(() => decodeBase64Json(Buffer.from("not-json").toString("base64")), /valid JSON/u);
});
