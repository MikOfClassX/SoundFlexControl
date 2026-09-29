export const CHANNELS = Object.freeze(["CH_0", "CH_1", "CH_2", "CH_3"]);
export const TRACKS = Object.freeze(["T0", "T1", "T2", "T3"]);

export function validateSettings(value) {
  if (!value || typeof value !== "object") {
    throw new TypeError("Connection settings are required");
  }

  const host = String(value.host ?? "").trim();
  if (!host || /[\r\n\0]/u.test(host)) {
    throw new RangeError("Host must be a non-empty hostname or IP address");
  }

  return {
    host,
    commandPort: validatePort(value.commandPort, "Command port"),
    eventPort: validatePort(value.eventPort, "Event port"),
  };
}

export function validateChannel(value) {
  if (!CHANNELS.includes(value)) {
    throw new RangeError(`Invalid channel: ${String(value)}`);
  }
  return value;
}

export function validateTrack(value) {
  if (!TRACKS.includes(value)) {
    throw new RangeError(`Invalid audio track: ${String(value)}`);
  }
  return value;
}

export function validateVideoInputId(value, maxInputs) {
  if (!Number.isInteger(value) || value < 0 || (Number.isInteger(maxInputs) && value >= maxInputs)) {
    throw new RangeError(`Invalid VideoInput ID: ${String(value)}`);
  }
  return value;
}

export function validateVolume(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError("Volume must be a finite number from 0 to 1");
  }
  return value;
}

export function validateBoolean(value, name = "Value") {
  if (typeof value !== "boolean") {
    throw new TypeError(`${name} must be Boolean`);
  }
  return value;
}

function validatePort(value, name) {
  const port = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RangeError(`${name} must be an integer from 1 to 65535`);
  }
  return port;
}
