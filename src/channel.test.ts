// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readWindowChannel, saveWindowChannel } from "./channel";

afterEach(() => window.history.replaceState(null, "", "/"));

describe("window-local channel URL", () => {
  it.each(["CH_0", "CH_1", "CH_2", "CH_3"] as const)("restores %s", channel => {
    expect(readWindowChannel(`http://localhost/?channel=${channel}`)).toBe(channel);
  });
  it.each(["", "?channel=CH_9", "?channel=ch_1", "?channel=CH_0%0AQUIT"])("defaults invalid/missing channel %s to CH_0", query => {
    expect(readWindowChannel(`http://localhost/${query}`)).toBe("CH_0");
  });
  it("updates only the channel URL parameter and restores it on reload", () => {
    localStorage.clear();
    window.history.replaceState({ test: true }, "", "/?other=keep#section");
    saveWindowChannel("CH_3");
    expect(readWindowChannel()).toBe("CH_3");
    expect(window.location.search).toBe("?other=keep&channel=CH_3");
    expect(window.location.hash).toBe("#section");
    expect(window.history.state).toEqual({ test: true });
    expect(localStorage.length).toBe(0);
  });
});
