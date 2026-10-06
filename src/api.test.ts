// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { SoundFlexApi } from "./api";

class TestSocket extends EventTarget {
  static OPEN = 1;
  static instances: TestSocket[] = [];
  readyState = 1;
  sent: string[] = [];
  constructor() {
    super();
    TestSocket.instances.push(this);
    queueMicrotask(() => this.dispatchEvent(new Event("open")));
  }
  send(value: string) { this.sent.push(value); }
  close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
}
afterEach(() => { vi.unstubAllGlobals(); TestSocket.instances.length = 0; });

it("sends the local meter channel on open, channel changes and visibility suspension", async () => {
  vi.stubGlobal("WebSocket", TestSocket);
  const api = new SoundFlexApi();
  api.setMetersActive(true, "CH_2");
  await api.open();
  api.setMetersActive(true, "CH_1");
  api.setMetersActive(false, "CH_1");
  api.setMetersActive(true, "CH_1");
  const socket = TestSocket.instances[0];
  expect(socket.sent.map(raw => JSON.parse(raw))).toEqual([
    { type: "meters.subscription", payload: { active: true, channel: "CH_2" } },
    { type: "meters.subscription", payload: { active: true, channel: "CH_1" } },
    { type: "meters.subscription", payload: { active: false, channel: "CH_1" } },
    { type: "meters.subscription", payload: { active: true, channel: "CH_1" } },
  ]);
  api.close();
});
