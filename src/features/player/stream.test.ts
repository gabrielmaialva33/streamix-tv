import { describe, expect, it } from "vitest";
import { pickStreamUrl } from "./stream";

describe("pickStreamUrl", () => {
  const source = {
    stream_url: "https://media.test/direct",
    browser_stream_url: "https://media.test/browser-proxy",
  };

  it("prefers the direct stream for native TV playback", () => {
    expect(pickStreamUrl(source, "direct")).toBe(source.stream_url);
  });

  it("prefers the browser proxy for HTML playback", () => {
    expect(pickStreamUrl(source, "browser")).toBe(source.browser_stream_url);
  });

  it("falls back when only the legacy URL is available", () => {
    expect(pickStreamUrl({ url: "https://media.test/legacy" }, "direct")).toBe("https://media.test/legacy");
  });
});
