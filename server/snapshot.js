import { CHANNELS } from "./validation.js";

export async function readSnapshot(commandClient) {
  const videoInputs = await queryJson(commandClient, "MBC_GETVIDEOINPUTLIST");
  const soundFlex = await readSoundFlex(commandClient);
  const channels = {};

  for (const channel of CHANNELS) {
    channels[channel] = await queryJson(commandClient, `MBC_GETMIXBOARDINFO CHANNEL=${channel}`);
  }

  return {
    videoInputs,
    soundFlex,
    channels,
    receivedAt: new Date().toISOString(),
  };
}

export async function readSoundFlex(commandClient) {
  return queryJson(commandClient, "MBC_GETSOUNDFLEXINFO");
}

export async function readMeters(commandClient, channels, sequence) {
  // Source RMS is shared; only output RMS requires one query per distinct bus.
  const videoInputs = await queryJson(commandClient, "MBC_GETVIDEOINPUTRMS");
  const samples = [];
  for (const channel of channels) {
    const outputTracks = await queryJson(commandClient, `MBC_GETAUDIOTRACKRMS CHANNEL=${channel}`);
    samples.push({ channel, videoInputs, outputTracks, sequence, receivedAt: new Date().toISOString() });
  }
  return samples;
}

export async function queryJson(commandClient, command) {
  const result = await commandClient.send(command);
  if (/^Error\s+\d+$/u.test(result)) {
    throw new Error(`${command} failed: ${result}`);
  }
  return decodeBase64Json(result, command);
}

export function decodeBase64Json(encoded, source = "MBControl result") {
  if (typeof encoded !== "string" || encoded.length === 0 || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)) {
    throw new Error(`${source} is not valid standard Base64`);
  }

  const padded = encoded.padEnd(encoded.length + ((4 - (encoded.length % 4)) % 4), "=");
  let text;
  try {
    text = Buffer.from(padded, "base64").toString("utf8");
  } catch (error) {
    throw new Error(`${source} could not be Base64-decoded`, { cause: error });
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${source} did not contain valid JSON`, { cause: error });
  }
}
