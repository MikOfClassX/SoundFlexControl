import { createRoot } from "react-dom/client";
import Mixer from "../components/Mixer";
import type { Channel, SoundFlexSnapshot, VideoInputAudioInfo } from "../types";
import "../styles.css";

const count = Number(new URLSearchParams(location.search).get("count") ?? 24);
function channel(id: Channel) {
  return { ID: id, NAME: id.replace("_", " "), PROGRAM: 0, PREVIEW: 1, KEYER: [], TRANSITION_STATUS: "TRANSITION_FINISHED" };
}
const audio: VideoInputAudioInfo = {
  AUDIO_ENABLED: { CH_0: true, CH_1: false, CH_2: false, CH_3: false },
  MASTER_VOLUME_PER_CHANNEL: { CH_0: 1, CH_1: 1, CH_2: 1, CH_3: 1 },
  AUDIO_FOLLOW_VIDEO: { CH_0: true, CH_1: false, CH_2: false, CH_3: false },
  AUDIO_TRACK_ENABLED: { T0: true, T1: true, T2: true, T3: true },
  MASTER_VOLUME: 1, CHANNEL_VOLUME: [], SOLO: false,
  EQUALIZER_GAIN: { LOW: 0, MID: 0, HIGH: 0 },
};
const snapshot: SoundFlexSnapshot = {
  videoInputs: {
    MAX_SUPPORTED_INPUTS: count,
    VIDEOINPUT: Array.from({ length: count }, (_, id) => ({
      VIDEOINPUTID: id, NAME: `IN ${id}`, TYPE: id < 2 ? "CAMERA" : "NONE", TALLY_STATUS: "",
    })),
  },
  soundFlex: {
    CURRENT_CHANNEL: "CH_0", PREVIEW_TRACK: "T0", PREVIEW_VOLUME: .8,
    SOLO_ENABLED: false, TRACK_VOLUME: { T0: 1, T1: 1, T2: 1, T3: 1 },
    VIDEOINPUT_AUDIOINFO: Array.from({ length: count }, (_, id) => id < 2 ? audio : {
      ...audio,
      AUDIO_ENABLED: { CH_0: false, CH_1: false, CH_2: false, CH_3: false },
      AUDIO_FOLLOW_VIDEO: { CH_0: false, CH_1: false, CH_2: false, CH_3: false },
      AUDIO_TRACK_ENABLED: { T0: false, T1: false, T2: false, T3: false },
    }),
  },
  channels: { CH_0: channel("CH_0"), CH_1: channel("CH_1"), CH_2: channel("CH_2"), CH_3: channel("CH_3") },
  receivedAt: new Date().toISOString(),
};

createRoot(document.getElementById("root")!).render(
  <div className="app-shell">
    <header className="app-bar">
      <div className="app-title"><img className="classx-mark" src="/assets/classx_icon.png" /><span>SoundFlex v1.0 - (C) ClassX 2026</span></div>
      <img className="soundflex-logo" src="/assets/soundflex_logo.svg" />
      <span className="status status-connected">Connected</span>
      <button className="connection-toggle">Connection</button>
    </header>
    <Mixer snapshot={snapshot} meters={null} onAction={() => undefined} selectedChannel="CH_0" onChannelChange={() => undefined} />
  </div>,
);
