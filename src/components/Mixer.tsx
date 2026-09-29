import { useState } from "react";
import type { CSSProperties } from "react";
import type {
  AudioTrack,
  Channel,
  SoundFlexAction,
  SoundFlexMeters,
  SoundFlexSnapshot,
  VideoInputAudioInfo,
  VideoInputSummary,
} from "../types";
import AssetIcon from "./AssetIcon";
import Fader from "./Fader";
import VuMeter from "./VuMeter";

const CHANNELS: Channel[] = ["CH_0", "CH_1", "CH_2", "CH_3"];
const TRACKS: AudioTrack[] = ["T0", "T1", "T2", "T3"];

interface MixerProps {
  snapshot: SoundFlexSnapshot;
  meters: SoundFlexMeters | null;
  onAction: (action: SoundFlexAction) => void;
}

export default function Mixer({ snapshot, meters, onAction }: MixerProps) {
  const selectedChannel = snapshot.soundFlex.CURRENT_CHANNEL;
  const [meterTracks, setMeterTracks] = useState<Record<number, AudioTrack>>({});
  const videoInputs = buildVideoInputSlots(snapshot);
  const gridStyle = {
    "--input-columns": Math.ceil(videoInputs.length / 2),
    "--input-count": videoInputs.length,
  } as CSSProperties;

  return (
    <section className="mixer" aria-label="SoundFlex audio mixer">
      <MixerHeader snapshot={snapshot} onAction={onAction} />
      <div className="mixer-divider" />
      <div className="mixer-body">
        <OutputTracks snapshot={snapshot} meters={meters} onAction={onAction} />
        <div className="mixer-separator" aria-hidden="true" />
        <div className="input-scroll" tabIndex={0} aria-label="VideoInput mixer strips">
          <div className="input-grid" style={gridStyle}>
            {videoInputs.map(({ summary, audioInfo }) => (
              <InputStrip
                audioInfo={audioInfo}
                key={summary.VIDEOINPUTID}
                meterTrack={meterTracks[summary.VIDEOINPUTID] ?? "T0"}
                meters={meters}
                onAction={onAction}
                onMeterTrackChange={(track) => setMeterTracks((current) => ({ ...current, [summary.VIDEOINPUTID]: track }))}
                selectedChannel={selectedChannel}
                snapshot={snapshot}
                summary={summary}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MixerHeader({ snapshot, onAction }: Pick<MixerProps, "snapshot" | "onAction">) {
  const info = snapshot.soundFlex;
  return (
    <div className="mixer-header">
      <PreviewKnob
        value={info.PREVIEW_VOLUME}
        onChange={(volume) => onAction({ name: "setPreviewVolume", payload: { volume } })}
      />
      <div className="preview-tracks" aria-label="Preview audio track">
        <div className="preview-track-grid">
          {TRACKS.map((track) => (
            <button
              aria-label={`Preview ${track}`}
              aria-pressed={!info.SOLO_ENABLED && info.PREVIEW_TRACK === track}
              className="icon-choice"
              disabled={info.SOLO_ENABLED}
              key={track}
              onClick={() => onAction({ name: "setPreviewTrack", payload: { track } })}
              type="button"
            >
              <AssetIcon name={`track_${track.slice(1)}`} />
            </button>
          ))}
        </div>
        <AssetIcon className={info.SOLO_ENABLED ? "active" : ""} label="Solo preview mode" name="solo_icon" />
      </div>
      <div className="header-spacer" />
      <div className="channel-rail" aria-label="Output channel">
        {CHANNELS.map((channel, index) => {
          const selected = info.CURRENT_CHANNEL === channel;
          return (
            <button
              aria-pressed={selected}
              className="channel-choice"
              key={channel}
              onClick={() => onAction({ name: "selectChannel", payload: { channel } })}
              type="button"
            >
              <AssetIcon name={`channel_${index}`} />
              <span>{snapshot.channels[channel]?.NAME || channel.replace("_", " ")}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PreviewKnob({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const rotation = -135 + Math.max(0, Math.min(1, value)) * 270;
  return (
    <div className="preview-knob" title={`Preview volume ${Math.round(value * 100)}%`}>
      <div className="knob-face" aria-hidden="true">
        <span style={{ transform: `rotate(${rotation}deg)` }} />
      </div>
      <input
        aria-label="Preview monitor volume"
        max="1"
        min="0"
        onChange={(event) => onChange(Number(event.target.value))}
        step="0.01"
        type="range"
        value={value}
      />
    </div>
  );
}

function OutputTracks({ snapshot, meters, onAction }: MixerProps) {
  const selectedChannel = snapshot.soundFlex.CURRENT_CHANNEL;
  const freshMeters = meters?.channel === selectedChannel ? meters.outputTracks : [];
  return (
    <div className="output-grid" aria-label="Output tracks">
      {TRACKS.map((track, index) => {
        const volume = snapshot.soundFlex.TRACK_VOLUME[track] ?? 0;
        return (
          <article className="output-strip" key={track}>
            <h3>{track}</h3>
            <div className="strip-core">
              <VuMeter
                label={`${track} output`}
                left={(freshMeters[index * 2] ?? 0) * volume}
                right={(freshMeters[index * 2 + 1] ?? 0) * volume}
              />
              <Fader
                label={`${track} output volume`}
                onChange={(next) => onAction({ name: "setTrackVolume", payload: { track, volume: next } })}
                value={volume}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}

interface InputStripProps {
  summary: VideoInputSummary;
  audioInfo: VideoInputAudioInfo;
  snapshot: SoundFlexSnapshot;
  meters: SoundFlexMeters | null;
  selectedChannel: Channel;
  meterTrack: AudioTrack;
  onMeterTrackChange: (track: AudioTrack) => void;
  onAction: (action: SoundFlexAction) => void;
}

function InputStrip({
  summary,
  audioInfo,
  snapshot,
  meters,
  selectedChannel,
  meterTrack,
  onMeterTrackChange,
  onAction,
}: InputStripProps) {
  const id = summary.VIDEOINPUTID;
  const enabled = summary.TYPE !== "NONE";
  const channelState = snapshot.channels[selectedChannel];
  const status = channelState?.PROGRAM === id ? "program" : channelState?.PREVIEW === id ? "preview" : "default";
  const volume = audioInfo.MASTER_VOLUME_PER_CHANNEL[selectedChannel] ?? 0;
  const meterOffset = audioInfo.SOLO ? 8 : TRACKS.indexOf(meterTrack) * 2;
  const inputMeters = meters?.channel === selectedChannel ? meters.videoInputs[id] ?? [] : [];

  return (
    <article className={`input-strip status-${status} ${enabled ? "" : "input-disabled"}`}>
      <span className="input-status" aria-label={`${summary.NAME} ${status}`} />
      <button
        aria-label={`${summary.NAME}: ${summary.TYPE}`}
        aria-pressed={audioInfo.AUDIO_ENABLED[selectedChannel]}
        className="input-title control-button"
        disabled={!enabled}
        onClick={() => onAction({
          name: "setAudioEnabled",
          payload: { channel: selectedChannel, videoInputId: id, enabled: !audioInfo.AUDIO_ENABLED[selectedChannel] },
        })}
        title={`${summary.NAME}: ${summary.TYPE}`}
        type="button"
      >
        <span className="source-mark" aria-hidden="true">{enabled ? "▣" : "×"}</span>
        <strong>{summary.NAME || `IN ${id}`}</strong>
        <AssetIcon name="audio_small" />
      </button>
      <div className="input-content">
        <div className="strip-core input-strip-core">
          <VuMeter
            label={`${summary.NAME} input`}
            left={(inputMeters[meterOffset] ?? 0) * volume}
            right={(inputMeters[meterOffset + 1] ?? 0) * volume}
          />
          <Fader
            disabled={!enabled}
            label={`${summary.NAME} volume on ${selectedChannel}`}
            onChange={(next) => onAction({
              name: "setInputVolume",
              payload: { channel: selectedChannel, videoInputId: id, volume: next },
            })}
            value={volume}
          />
        </div>
        <div className="strip-controls">
          <ToggleIconButton
            active={audioInfo.AUDIO_FOLLOW_VIDEO[selectedChannel]}
            disabled={!enabled}
            label={`${summary.NAME} audio follows video`}
            name="link_symbol"
            onClick={() => onAction({
              name: "setAudioFollowVideo",
              payload: { channel: selectedChannel, videoInputId: id, enabled: !audioInfo.AUDIO_FOLLOW_VIDEO[selectedChannel] },
            })}
          />
          <ToggleIconButton
            active={audioInfo.SOLO}
            disabled={!enabled}
            label={`${summary.NAME} solo preview`}
            name="solo_icon"
            onClick={() => onAction({ name: "setSoloPreview", payload: { videoInputId: id, enabled: !audioInfo.SOLO } })}
          />
          <button aria-label={`${summary.NAME} audio settings (not available)`} className="square-button" disabled title="Audio settings are not available in the web controller" type="button">
            <AssetIcon name="audio_settings" />
          </button>
          <div className="control-spacer" />
          {TRACKS.map((track) => (
            <button
              aria-label={`${summary.NAME} assign ${track}`}
              aria-pressed={audioInfo.AUDIO_TRACK_ENABLED[track]}
              className={`track-toggle ${!audioInfo.SOLO && meterTrack === track ? "meter-source" : ""}`}
              disabled={!enabled}
              key={track}
              onClick={() => onAction({
                name: "setTrackEnabled",
                payload: { videoInputId: id, track, enabled: !audioInfo.AUDIO_TRACK_ENABLED[track] },
              })}
              onContextMenu={(event) => {
                event.preventDefault();
                if (!audioInfo.SOLO && enabled) onMeterTrackChange(track);
              }}
              title={`Toggle ${track}; right-click to meter this track`}
              type="button"
            >
              {track}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

function ToggleIconButton({ active, disabled, label, name, onClick }: {
  active: boolean;
  disabled: boolean;
  label: string;
  name: string;
  onClick: () => void;
}) {
  return (
    <button aria-label={label} aria-pressed={active} className="square-button" disabled={disabled} onClick={onClick} type="button">
      <AssetIcon name={name} />
    </button>
  );
}

function buildVideoInputSlots(snapshot: SoundFlexSnapshot): Array<{ summary: VideoInputSummary; audioInfo: VideoInputAudioInfo }> {
  const summaries = new Map(snapshot.videoInputs.VIDEOINPUT.map((input) => [input.VIDEOINPUTID, input]));
  const count = snapshot.videoInputs.MAX_SUPPORTED_INPUTS;
  return Array.from({ length: count }, (_, id) => ({
    summary: summaries.get(id) ?? { NAME: `IN ${id}`, TALLY_STATUS: "", VIDEOINPUTID: id, TYPE: "NONE" },
    audioInfo: snapshot.soundFlex.VIDEOINPUT_AUDIOINFO[id] ?? emptyAudioInfo(),
  }));
}

function emptyAudioInfo(): VideoInputAudioInfo {
  return {
    AUDIO_ENABLED: { CH_0: false, CH_1: false, CH_2: false, CH_3: false },
    MASTER_VOLUME_PER_CHANNEL: { CH_0: 0, CH_1: 0, CH_2: 0, CH_3: 0 },
    AUDIO_FOLLOW_VIDEO: { CH_0: false, CH_1: false, CH_2: false, CH_3: false },
    AUDIO_TRACK_ENABLED: { T0: false, T1: false, T2: false, T3: false },
    MASTER_VOLUME: 0,
    CHANNEL_VOLUME: [],
    SOLO: false,
    EQUALIZER_GAIN: { LOW: 0, MID: 0, HIGH: 0 },
  };
}
