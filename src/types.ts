export type Channel = "CH_0" | "CH_1" | "CH_2" | "CH_3";
export type AudioTrack = "T0" | "T1" | "T2" | "T3";

export interface ConnectionSettings {
  host: string;
  commandPort: number;
  eventPort: number;
}

export interface VideoInputSummary {
  NAME: string;
  TALLY_STATUS: string;
  VIDEOINPUTID: number;
  TYPE: string;
}

export interface VideoInputList {
  VIDEOINPUT: VideoInputSummary[];
  MAX_SUPPORTED_INPUTS: number;
}

export interface VideoInputAudioInfo {
  AUDIO_ENABLED: Record<Channel, boolean>;
  MASTER_VOLUME_PER_CHANNEL: Record<Channel, number>;
  AUDIO_FOLLOW_VIDEO: Record<Channel, boolean>;
  AUDIO_TRACK_ENABLED: Record<AudioTrack, boolean>;
  MASTER_VOLUME: number;
  CHANNEL_VOLUME: number[];
  SOLO: boolean;
  EQUALIZER_GAIN: { LOW: number; MID: number; HIGH: number };
}

export interface SoundFlexInfo {
  CURRENT_CHANNEL: Channel;
  PREVIEW_TRACK: AudioTrack;
  PREVIEW_VOLUME: number;
  SOLO_ENABLED: boolean;
  TRACK_VOLUME: Record<AudioTrack, number>;
  VIDEOINPUT_AUDIOINFO: VideoInputAudioInfo[];
}

export interface MixBoardChannelInfo {
  ID: Channel;
  NAME: string;
  PREVIEW: number;
  PROGRAM: number;
  KEYER: unknown[];
  TRANSITION_STATUS: string;
}

export interface SoundFlexSnapshot {
  videoInputs: VideoInputList;
  soundFlex: SoundFlexInfo;
  channels: Record<Channel, MixBoardChannelInfo>;
  receivedAt: string;
}

export interface SoundFlexMeters {
  channel: Channel;
  videoInputs: number[][];
  outputTracks: number[];
  sequence: number;
  receivedAt: string;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

export interface ServerMessage {
  type: "settings" | "connection" | "snapshot" | "state" | "meters" | "event" | "request.result" | "error";
  requestId?: string;
  payload: unknown;
}

export type SoundFlexAction =
  | { name: "selectChannel"; payload: { channel: Channel } }
  | { name: "setPreviewTrack"; payload: { track: AudioTrack } }
  | { name: "setPreviewVolume"; payload: { volume: number } }
  | { name: "setTrackVolume"; payload: { track: AudioTrack; volume: number } }
  | { name: "setAudioEnabled"; payload: { channel: Channel; videoInputId: number; enabled: boolean } }
  | { name: "setAudioFollowVideo"; payload: { channel: Channel; videoInputId: number; enabled: boolean } }
  | { name: "setTrackEnabled"; payload: { videoInputId: number; track: AudioTrack; enabled: boolean } }
  | { name: "setSoloPreview"; payload: { videoInputId: number; enabled: boolean } }
  | { name: "setInputVolume"; payload: { channel: Channel; videoInputId: number; volume: number } };
