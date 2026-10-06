import type { Channel } from "./types";

export function readWindowChannel(url: string = window.location.href): Channel {
  const channel = new URL(url).searchParams.get("channel");
  return channel === "CH_0" || channel === "CH_1" || channel === "CH_2" || channel === "CH_3" ? channel : "CH_0";
}

export function saveWindowChannel(channel: Channel): void {
  const url = new URL(window.location.href);
  url.searchParams.set("channel", channel);
  window.history.replaceState(window.history.state, "", url);
}
