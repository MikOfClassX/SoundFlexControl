import assert from "node:assert/strict";
import test from "node:test";
import { ACTION_NAMES, buildActionCommands } from "../actions.js";

test("all exposed SoundFlex actions produce constrained MBControl commands", () => {
  const cases = {
    selectChannel: [{ channel: "CH_2" }, ["MBC_SELECTCHANNEL CHANNEL=CH_2", "MBC_SETAUDIOPREVIEWCHANNEL CHANNEL=CH_2"]],
    setPreviewTrack: [{ track: "T3" }, ["MBC_SETAUDIOPREVIEWTRACK AUDIO_TRACK=T3"]],
    setPreviewVolume: [{ volume: 0.5 }, ["MBC_SETAUDIOPREVIEWVOLUME VOLUME=0.5"]],
    setTrackVolume: [{ track: "T1", volume: 0.25 }, ["MBC_SETAUDIOTRACKVOLUME AUDIO_TRACK=T1 VOLUME=0.25"]],
    setAudioEnabled: [{ channel: "CH_1", videoInputId: 2, enabled: true }, ["MBC_SETAUDIOENABLED CHANNEL=CH_1 VIDEOINPUTID=2 ENABLED=TRUE"]],
    setAudioFollowVideo: [{ channel: "CH_3", videoInputId: 3, enabled: false }, ["MBC_SETAUDIOFOLLOWVIDEO CHANNEL=CH_3 VIDEOINPUTID=3 ENABLED=FALSE"]],
    setTrackEnabled: [{ videoInputId: 4, track: "T2", enabled: true }, ["MBC_SETAUDIOTRACKENABLED VIDEOINPUTID=4 AUDIO_TRACK=T2 ENABLED=TRUE"]],
    setSoloPreview: [{ videoInputId: 5, enabled: false }, ["MBC_SETAUDIOSOLOPREVIEW VIDEOINPUTID=5 ENABLED=FALSE"]],
    setInputVolume: [{ channel: "CH_0", videoInputId: 6, volume: 0.75 }, ["MBC_SETAUDIOMASTERVOLUMEPERCHANNEL CHANNEL=CH_0 VIDEOINPUTID=6 VOLUME=0.75"]],
  };

  assert.deepEqual(Object.keys(cases).sort(), [...ACTION_NAMES].sort());
  for (const [name, [payload, expected]] of Object.entries(cases)) {
    assert.deepEqual(buildActionCommands(name, payload, 24), expected);
  }
});

test("input/output faders accept native +10 dB gain while preview remains limited to unity", () => {
  const gain = 10 ** (10 / 20);
  assert.deepEqual(buildActionCommands("setTrackVolume", { track: "T1", volume: gain }, 24), [`MBC_SETAUDIOTRACKVOLUME AUDIO_TRACK=T1 VOLUME=${gain}`]);
  assert.deepEqual(buildActionCommands("setInputVolume", { channel: "CH_0", videoInputId: 0, volume: gain }, 24), [`MBC_SETAUDIOMASTERVOLUMEPERCHANNEL CHANNEL=CH_0 VIDEOINPUTID=0 VOLUME=${gain}`]);
  for (const volume of [gain + 0.001, -1, NaN, Infinity, "2"]) {
    assert.throws(() => buildActionCommands("setTrackVolume", { track: "T1", volume }, 24), /Volume/u);
    assert.throws(() => buildActionCommands("setInputVolume", { channel: "CH_0", videoInputId: 0, volume }, 24), /Volume/u);
  }
  assert.throws(() => buildActionCommands("setPreviewVolume", { volume: gain }, 24), /0 to 1/u);
});

test("action validation blocks command injection and invalid ranges", () => {
  assert.throws(() => buildActionCommands("selectChannel", { channel: "CH_0\nQUIT" }, 24), /Invalid channel/u);
  assert.throws(() => buildActionCommands("setPreviewVolume", { volume: 1.1 }, 24), /0 to 1/u);
  assert.throws(() => buildActionCommands("setSoloPreview", { videoInputId: 24, enabled: true }, 24), /VideoInput/u);
  assert.throws(() => buildActionCommands("unknown", {}, 24), /Unsupported/u);
});
