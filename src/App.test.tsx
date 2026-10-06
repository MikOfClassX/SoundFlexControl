// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Channel, ServerMessage, SoundFlexAction, SoundFlexSnapshot } from "./types";
import App from "./App";

interface MockApi {
  emit: (message: ServerMessage) => void;
  actions: SoundFlexAction[];
  subscriptions: Array<{ active: boolean; channel: Channel }>;
}
const { instances } = vi.hoisted(() => ({ instances: [] as MockApi[] }));
vi.mock("./api", () => ({
  loadSettings: () => ({ host: "localhost", commandPort: 701, eventPort: 801 }),
  saveSettings: vi.fn(),
  SoundFlexApi: class {
    listeners = new Set<(message: ServerMessage) => void>();
    actions: SoundFlexAction[] = [];
    subscriptions: Array<{ active: boolean; channel: Channel }> = [];
    constructor() { instances.push(this); }
    open() { return Promise.resolve(); }
    close() {}
    subscribe(listener: (message: ServerMessage) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    emit(message: ServerMessage) { this.listeners.forEach(listener => listener(message)); }
    setMetersActive(active: boolean, channel: Channel) { this.subscriptions.push({ active, channel }); }
    sendAction(action: SoundFlexAction) { this.actions.push(action); return Promise.resolve(); }
  },
}));
afterEach(() => { cleanup(); instances.length = 0; window.history.replaceState(null, "", "/"); });

it("keeps two windows independent from each other and from native channel events", async () => {
  window.history.replaceState(null, "", "/?channel=CH_0");
  const first = render(<App />);
  window.history.replaceState(null, "", "/?channel=CH_2");
  const second = render(<App />);
  await act(async () => {
    for (const api of instances) {
      api.emit({ type: "connection", payload: { status: "connected" } });
      api.emit({ type: "snapshot", payload: snapshot() });
    }
  });
  const one = within(first.container);
  const two = within(second.container);
  expect(one.getByRole("button", { name: "CH_0" }).getAttribute("aria-pressed")).toBe("true");
  expect(two.getByRole("button", { name: "CH_2" }).getAttribute("aria-pressed")).toBe("true");

  fireEvent.click(one.getByRole("button", { name: "CH_1" }), { ctrlKey: true });
  expect(one.getByRole("button", { name: "CH_1" }).getAttribute("aria-pressed")).toBe("true");
  expect(two.getByRole("button", { name: "CH_2" }).getAttribute("aria-pressed")).toBe("true");
  expect(instances[0].subscriptions.at(-1)?.channel).toBe("CH_1");
  expect(instances[1].subscriptions.at(-1)?.channel).toBe("CH_2");
  expect(instances.every(api => api.actions.length === 0)).toBe(true);

  act(() => instances.forEach(api => api.emit({ type: "state", payload: snapshot() })));
  expect(one.getByRole("button", { name: "CH_1" }).getAttribute("aria-pressed")).toBe("true");
  expect(two.getByRole("button", { name: "CH_2" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(one.getByRole("button", { name: "IN 0: CAMERA" }));
  fireEvent.click(two.getByRole("button", { name: "IN 0: CAMERA" }));
  expect(instances[0].actions[0]).toMatchObject({ name: "setAudioEnabled", payload: { channel: "CH_1" } });
  expect(instances[1].actions[0]).toMatchObject({ name: "setAudioEnabled", payload: { channel: "CH_2" } });
  expect(one.getByTitle("Global preview monitor: CH_3; Preview volume 100%")).toBeTruthy();
  expect(one.getByRole("slider", { name: "Preview monitor volume" }).getAttribute("aria-description")).toContain("CH_3");

  act(() => instances[0].emit({ type: "meters", payload: { channel: "CH_1", outputTracks: [.1, .1], videoInputs: [], sequence: 1 } }));
  const meter = one.getByRole("meter", { name: "T0 output left level" });
  expect(meter.getAttribute("aria-valuenow")).toBe("67");
  act(() => instances[0].emit({ type: "meters", payload: { channel: "CH_2", outputTracks: [1, 1], videoInputs: [], sequence: 99 } }));
  expect(meter.getAttribute("aria-valuenow")).toBe("67");
  fireEvent.click(one.getByRole("button", { name: "CH_0" }), { ctrlKey: true });
  expect(meter.getAttribute("aria-valuenow")).toBe("0");
  act(() => instances[0].emit({ type: "meters", payload: { channel: "CH_0", outputTracks: [.1, .1], videoInputs: [], sequence: 2 } }));
  expect(meter.getAttribute("aria-valuenow")).toBe("67");
});

function snapshot(): SoundFlexSnapshot {
  const channel = (id: Channel) => ({ ID: id, NAME: id, PROGRAM: 0, PREVIEW: 0, KEYER: [], TRANSITION_STATUS: "TRANSITION_FINISHED" });
  return {
    receivedAt: "", videoInputs: { MAX_SUPPORTED_INPUTS: 1, VIDEOINPUT: [{ VIDEOINPUTID: 0, NAME: "IN 0", TYPE: "CAMERA", TALLY_STATUS: "" }] },
    channels: { CH_0: channel("CH_0"), CH_1: channel("CH_1"), CH_2: channel("CH_2"), CH_3: channel("CH_3") },
    soundFlex: {
      CURRENT_CHANNEL: "CH_3", PREVIEW_TRACK: "T0", PREVIEW_VOLUME: 1, SOLO_ENABLED: false,
      TRACK_VOLUME: { T0: 1, T1: 1, T2: 1, T3: 1 },
      VIDEOINPUT_AUDIOINFO: [{
        AUDIO_ENABLED: { CH_0: true, CH_1: true, CH_2: false, CH_3: false },
        MASTER_VOLUME_PER_CHANNEL: { CH_0: 1, CH_1: 1, CH_2: .5, CH_3: 1 },
        AUDIO_FOLLOW_VIDEO: { CH_0: false, CH_1: false, CH_2: false, CH_3: false },
        AUDIO_TRACK_ENABLED: { T0: true, T1: true, T2: false, T3: false },
        MASTER_VOLUME: 1, CHANNEL_VOLUME: [], SOLO: false, EQUALIZER_GAIN: { LOW: 0, MID: 0, HIGH: 0 },
      }],
    },
  };
}
