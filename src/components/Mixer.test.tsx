// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SoundFlexSnapshot, VideoInputAudioInfo } from "../types";
import Mixer from "./Mixer";

afterEach(cleanup);

describe("SoundFlex mixer", () => {
  it("renders native control groups and keeps audio settings disabled", () => {
    render(<Mixer meters={null} onAction={() => undefined} snapshot={createSnapshot()} />);

    expect(screen.getByRole("slider", { name: "Preview monitor volume" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Preview T0" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Camera 1 audio follows video" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Camera 1 solo preview" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Camera 1 assign T3" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Camera 1 audio settings (not available)" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("slider", { name: "T0 output volume" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Camera 1 volume on CH_1" })).toBeTruthy();
  });

  it("maps visible controls to their exact scoped actions", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<Mixer meters={null} onAction={onAction} snapshot={createSnapshot()} />);

    fireEvent.change(screen.getByRole("slider", { name: "Preview monitor volume" }), { target: { value: "0.3" } });
    expect(onAction).toHaveBeenLastCalledWith({ name: "setPreviewVolume", payload: { volume: 0.3 } });

    await user.click(screen.getByRole("button", { name: "Preview T2" }));
    expect(onAction).toHaveBeenLastCalledWith({ name: "setPreviewTrack", payload: { track: "T2" } });

    await user.click(screen.getByRole("button", { name: "CH_2" }));
    expect(onAction).toHaveBeenLastCalledWith({ name: "selectChannel", payload: { channel: "CH_2" } });

    await user.click(screen.getByRole("button", { name: /Camera 1: CAMERA/u }));
    expect(onAction).toHaveBeenLastCalledWith({
      name: "setAudioEnabled",
      payload: { channel: "CH_1", videoInputId: 0, enabled: false },
    });

    await user.click(screen.getByRole("button", { name: "Camera 1 audio follows video" }));
    expect(onAction).toHaveBeenLastCalledWith({
      name: "setAudioFollowVideo",
      payload: { channel: "CH_1", videoInputId: 0, enabled: false },
    });

    await user.click(screen.getByRole("button", { name: "Camera 1 solo preview" }));
    expect(onAction).toHaveBeenLastCalledWith({ name: "setSoloPreview", payload: { videoInputId: 0, enabled: true } });

    await user.click(screen.getByRole("button", { name: "Camera 1 assign T2" }));
    expect(onAction).toHaveBeenLastCalledWith({
      name: "setTrackEnabled",
      payload: { videoInputId: 0, track: "T2", enabled: true },
    });

    fireEvent.change(screen.getByRole("slider", { name: "Camera 1 volume on CH_1" }), { target: { value: "-12" } });
    expect(onAction.mock.calls.at(-1)?.[0]).toMatchObject({
      name: "setInputVolume",
      payload: { channel: "CH_1", videoInputId: 0 },
    });

    fireEvent.change(screen.getByRole("slider", { name: "T1 output volume" }), { target: { value: "-6" } });
    expect(onAction.mock.calls.at(-1)?.[0]).toMatchObject({ name: "setTrackVolume", payload: { track: "T1" } });
  });

  it("renders every discovered slot and disables unconfigured inputs", () => {
    render(<Mixer meters={null} onAction={() => undefined} snapshot={createSnapshot()} />);

    expect((screen.getByRole("button", { name: /Camera 1: CAMERA/u }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: /IN 1: NONE/u }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the maximum 24 inputs in the reference two-row composition", () => {
    const snapshot = createSnapshot();
    snapshot.videoInputs.MAX_SUPPORTED_INPUTS = 24;
    const { container } = render(<Mixer meters={null} onAction={() => undefined} snapshot={snapshot} />);
    const grid = container.querySelector<HTMLElement>(".input-grid");

    expect(grid?.children).toHaveLength(24);
    expect(grid?.style.getPropertyValue("--input-columns")).toBe("12");
    expect(grid?.style.getPropertyValue("--input-count")).toBe("24");
  });
});

function createSnapshot(): SoundFlexSnapshot {
  const audioInfo: VideoInputAudioInfo = {
    AUDIO_ENABLED: { CH_0: false, CH_1: true, CH_2: false, CH_3: false },
    MASTER_VOLUME_PER_CHANNEL: { CH_0: 1, CH_1: 0.5, CH_2: 1, CH_3: 1 },
    AUDIO_FOLLOW_VIDEO: { CH_0: false, CH_1: true, CH_2: false, CH_3: false },
    AUDIO_TRACK_ENABLED: { T0: true, T1: false, T2: false, T3: false },
    MASTER_VOLUME: 1,
    CHANNEL_VOLUME: [],
    SOLO: false,
    EQUALIZER_GAIN: { LOW: 0, MID: 0, HIGH: 0 },
  };
  return {
    videoInputs: {
      VIDEOINPUT: [
        { NAME: "Camera 1", TALLY_STATUS: "", VIDEOINPUTID: 0, TYPE: "CAMERA" },
        { NAME: "IN 1", TALLY_STATUS: "", VIDEOINPUTID: 1, TYPE: "NONE" },
      ],
      MAX_SUPPORTED_INPUTS: 2,
    },
    soundFlex: {
      CURRENT_CHANNEL: "CH_1",
      PREVIEW_TRACK: "T0",
      PREVIEW_VOLUME: 0.8,
      SOLO_ENABLED: false,
      TRACK_VOLUME: { T0: 1, T1: 0.5, T2: 1, T3: 1 },
      VIDEOINPUT_AUDIOINFO: [audioInfo, audioInfo],
    },
    channels: {
      CH_0: channel("CH_0"),
      CH_1: { ...channel("CH_1"), PREVIEW: 0 },
      CH_2: channel("CH_2"),
      CH_3: channel("CH_3"),
    },
    receivedAt: "2026-09-29T00:00:00.000Z",
  };
}

function channel(id: "CH_0" | "CH_1" | "CH_2" | "CH_3") {
  return { ID: id, NAME: id, PREVIEW: -1, PROGRAM: -1, KEYER: [], TRANSITION_STATUS: "TRANSITION_FINISHED" };
}
