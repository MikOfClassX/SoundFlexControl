import { CHANNELS, TRACKS } from "./validation.js";

const CHANNEL_SET = new Set(CHANNELS);
const TRACK_SET = new Set(TRACKS);

export function parseEventRecord(line) {
  if (typeof line !== "string") return null;
  const separator = line.indexOf(" ");
  if (separator <= 0) return null;

  const prefix = line.slice(0, separator);
  if (!new Set(["MIXBOARDEVENT", "VIDEOINPUTEVENT", "AUDIOEVENT"]).has(prefix)) return null;

  const fields = {};
  for (const token of splitFields(line.slice(separator + 1))) {
    const equals = token.indexOf("=");
    if (equals <= 0) continue;
    const key = token.slice(0, equals).trim();
    const rawValue = token.slice(equals + 1).trim();
    if (key) fields[key] = decodeValue(rawValue);
  }

  return { prefix, fields, raw: line };
}

export function reduceEvent(snapshot, event) {
  if (!snapshot || !event) return { snapshot, changed: false, reconcile: null };

  const next = clone(snapshot);
  let changed = false;
  let reconcile = null;

  if (event.prefix === "MIXBOARDEVENT") {
    ({ changed, reconcile } = reduceMixBoardEvent(next, event.fields));
  } else if (event.prefix === "VIDEOINPUTEVENT") {
    ({ changed, reconcile } = reduceVideoInputEvent(next, event.fields));
  } else if (event.prefix === "AUDIOEVENT") {
    ({ changed, reconcile } = reduceAudioEvent(next, event.fields));
  }

  if (changed) next.receivedAt = new Date().toISOString();
  return { snapshot: changed ? next : snapshot, changed, reconcile };
}

function reduceMixBoardEvent(snapshot, fields) {
  const channel = CHANNEL_SET.has(fields.CHANNEL) ? fields.CHANNEL : null;
  const channelState = channel ? snapshot.channels?.[channel] : null;

  switch (fields.TYPE) {
    case "SELECT_CHANNEL":
    case "CHANNEL_CHANGED":
      if (!channel || !snapshot.soundFlex) return unchanged("full");
      snapshot.soundFlex.CURRENT_CHANNEL = channel;
      return changed();
    case "PREVIEW_CHANGED":
      return setInteger(channelState, "PREVIEW", fields.VIDEOINPUTID);
    case "PROGRAM_CHANGED":
      return setInteger(channelState, "PROGRAM", fields.VIDEOINPUTID);
    case "KEYER_VIDEOINPUTID_CHANGED":
      return setKeyerInteger(channelState, fields.KEYERID, "VIDEOINPUTID", fields.VIDEOINPUTID);
    case "KEYER_STATUS_CHANGED":
      return setKeyerValue(channelState, fields.KEYERID, "STATUS", fields.STATUS);
    case "KEYER_TRANSITIONLINK_CHANGED": {
      const value = parseBoolean(fields.LINK);
      return value === null ? unchanged("full") : setKeyerValue(channelState, fields.KEYERID, "LINK", value);
    }
    case "TRANSITION_STATUS_CHANGED":
      if (!channelState || !fields.STATUS) return unchanged("full");
      channelState.TRANSITION_STATUS = fields.STATUS;
      return changed();
    default:
      return unchanged(null);
  }
}

function reduceVideoInputEvent(snapshot, fields) {
  const videoInputId = parseInteger(fields.VIDEOINPUTID);
  if (videoInputId === null) return unchanged(null);

  const summary = snapshot.videoInputs?.VIDEOINPUT?.find((input) => input.VIDEOINPUTID === videoInputId);
  const audioInfo = snapshot.soundFlex?.VIDEOINPUT_AUDIOINFO?.[videoInputId];

  switch (fields.TYPE) {
    case "NAME_CHANGED":
      if (!summary) return unchanged("full");
      summary.NAME = fields.VALUE ?? "";
      return changed();
    case "TALLY_STATUS_CHANGED":
      if (!summary) return unchanged("full");
      summary.TALLY_STATUS = fields.VALUE ?? "";
      return changed();
    case "VIDEOINPUT_CHANGED":
      if (!summary) return unchanged("full");
      summary.TYPE = fields.VALUE ?? "";
      return { changed: true, reconcile: "full" };
    case "AUDIO_SOLO_ENABLED": {
      const value = parseBoolean(fields.VALUE);
      if (!audioInfo || value === null) return unchanged("soundFlex");
      audioInfo.SOLO = value;
      return changed();
    }
    case "AUDIO_TRACK_ENABLED": {
      const mask = parseInteger(fields.VALUE);
      if (!audioInfo || mask === null) return unchanged("soundFlex");
      for (let index = 0; index < TRACKS.length; index += 1) {
        audioInfo.AUDIO_TRACK_ENABLED[TRACKS[index]] = (mask & (1 << index)) !== 0;
      }
      return changed();
    }
    case "AUDIO_ENABLED":
    case "AUDIO_FOLLOW_VIDEO_ENABLED":
    case "AUDIO_VOLUME_CHANGED":
      return unchanged("soundFlex");
    default:
      return unchanged(null);
  }
}

function reduceAudioEvent(snapshot, fields) {
  if (!snapshot.soundFlex) return unchanged("soundFlex");

  switch (fields.TYPE) {
    case "CHANNEL_CHANGED":
      if (!CHANNEL_SET.has(fields.VALUE)) return unchanged("soundFlex");
      snapshot.soundFlex.CURRENT_CHANNEL = fields.VALUE;
      return changed();
    case "TRACK_CHANGED":
      if (!TRACK_SET.has(fields.VALUE)) return unchanged("soundFlex");
      snapshot.soundFlex.PREVIEW_TRACK = fields.VALUE;
      return changed();
    case "VOLUME_CHANGED": {
      const value = parseNumber(fields.VALUE);
      if (value === null) return unchanged("soundFlex");
      if (fields.AUDIO_TRACK === "PRV") snapshot.soundFlex.PREVIEW_VOLUME = value;
      else if (TRACK_SET.has(fields.AUDIO_TRACK)) snapshot.soundFlex.TRACK_VOLUME[fields.AUDIO_TRACK] = value;
      else return unchanged("soundFlex");
      return changed();
    }
    case "SOLO_MODE_CHANGED": {
      const value = parseBoolean(fields.VALUE);
      if (value === null) return unchanged("soundFlex");
      snapshot.soundFlex.SOLO_ENABLED = value;
      return changed();
    }
    default:
      return unchanged(null);
  }
}

function setInteger(target, key, value) {
  const parsed = parseInteger(value);
  if (!target || parsed === null) return unchanged("full");
  target[key] = parsed;
  return changed();
}

function setKeyerInteger(channelState, keyerId, key, value) {
  const parsed = parseInteger(value);
  if (parsed === null) return unchanged("full");
  return setKeyerValue(channelState, keyerId, key, parsed);
}

function setKeyerValue(channelState, keyerId, key, value) {
  const parsedKeyerId = parseInteger(keyerId);
  const keyer = channelState?.KEYER?.find((candidate) => candidate.KEYERID === parsedKeyerId);
  if (!keyer || value === undefined) return unchanged("full");
  keyer[key] = value;
  return changed();
}

function splitFields(value) {
  const fields = [];
  let current = "";
  let quoted = false;
  let escaped = false;

  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\" && quoted) {
      current += character;
      escaped = true;
    } else if (character === '"') {
      current += character;
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      fields.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim()) fields.push(current.trim());
  return fields;
}

function decodeValue(value) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(["\\])/gu, "$1");
  }
  return value;
}

function parseInteger(value) {
  if (!/^-?\d+$/u.test(String(value))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseNumber(value) {
  const text = String(value).trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value) {
  if (String(value).toLowerCase() === "true") return true;
  if (String(value).toLowerCase() === "false") return false;
  return null;
}

function clone(value) {
  return structuredClone(value);
}

function changed() {
  return { changed: true, reconcile: null };
}

function unchanged(reconcile) {
  return { changed: false, reconcile };
}
