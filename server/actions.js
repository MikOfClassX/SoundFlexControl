import {
  MAX_FADER_VOLUME,
  validateBoolean,
  validateChannel,
  validateTrack,
  validateVideoInputId,
  validateVolume,
} from "./validation.js";

export const ACTION_NAMES = Object.freeze([
  "setPreviewTrack",
  "setPreviewVolume",
  "setTrackVolume",
  "setAudioEnabled",
  "setAudioFollowVideo",
  "setTrackEnabled",
  "setSoloPreview",
  "setInputVolume",
]);

export function buildActionCommands(name, payload, maxInputs) {
  const value = payload && typeof payload === "object" ? payload : {};

  switch (name) {
    case "setPreviewTrack":
      return [`MBC_SETAUDIOPREVIEWTRACK AUDIO_TRACK=${validateTrack(value.track)}`];
    case "setPreviewVolume":
      return [`MBC_SETAUDIOPREVIEWVOLUME VOLUME=${validateVolume(value.volume)}`];
    case "setTrackVolume":
      return [
        `MBC_SETAUDIOTRACKVOLUME AUDIO_TRACK=${validateTrack(value.track)} VOLUME=${validateVolume(value.volume, MAX_FADER_VOLUME)}`,
      ];
    case "setAudioEnabled":
      return [buildInputBooleanCommand("MBC_SETAUDIOENABLED", value, maxInputs, true)];
    case "setAudioFollowVideo":
      return [buildInputBooleanCommand("MBC_SETAUDIOFOLLOWVIDEO", value, maxInputs, true)];
    case "setTrackEnabled":
      return [
        `MBC_SETAUDIOTRACKENABLED VIDEOINPUTID=${validateVideoInputId(value.videoInputId, maxInputs)} AUDIO_TRACK=${validateTrack(value.track)} ENABLED=${wireBoolean(validateBoolean(value.enabled, "Enabled"))}`,
      ];
    case "setSoloPreview":
      return [
        `MBC_SETAUDIOSOLOPREVIEW VIDEOINPUTID=${validateVideoInputId(value.videoInputId, maxInputs)} ENABLED=${wireBoolean(validateBoolean(value.enabled, "Enabled"))}`,
      ];
    case "setInputVolume":
      return [
        `MBC_SETAUDIOMASTERVOLUMEPERCHANNEL CHANNEL=${validateChannel(value.channel)} VIDEOINPUTID=${validateVideoInputId(value.videoInputId, maxInputs)} VOLUME=${validateVolume(value.volume, MAX_FADER_VOLUME)}`,
      ];
    default:
      throw new RangeError(`Unsupported SoundFlex action: ${String(name)}`);
  }
}

function buildInputBooleanCommand(command, value, maxInputs, includeChannel) {
  const channel = includeChannel ? ` CHANNEL=${validateChannel(value.channel)}` : "";
  const videoInputId = validateVideoInputId(value.videoInputId, maxInputs);
  const enabled = wireBoolean(validateBoolean(value.enabled, "Enabled"));
  return `${command}${channel} VIDEOINPUTID=${videoInputId} ENABLED=${enabled}`;
}

function wireBoolean(value) {
  return value ? "TRUE" : "FALSE";
}
