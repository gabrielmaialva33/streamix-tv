import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";

const { getGindexTracks } = vi.hoisted(() => ({ getGindexTracks: vi.fn() }));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, default: { getGindexTracks } };
});

import { fetchMediaTracks, hasSelectableTracks, splitByKind } from "./tracks";

beforeEach(() => {
  getGindexTracks.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Drive the polling loop without waiting out its real retry delays. */
async function resolveWithTimers<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

describe("fetchMediaTracks", () => {
  it("normalises a probed track list", async () => {
    getGindexTracks.mockResolvedValue([
      { index: 1, type: "audio", language: "por", title: "Dublado" },
      { index: 2, type: "audio", language: "eng" },
      { index: 3, type: "subtitle", language: "por" },
    ]);

    const result = await resolveWithTimers(fetchMediaTracks("movie", 1));

    expect(result).toEqual({
      status: "ready",
      tracks: [
        { index: 1, kind: "audio", label: "Dublado", language: "por" },
        { index: 2, kind: "audio", label: "eng", language: "eng" },
        { index: 3, kind: "subtitle", label: "por", language: "por" },
      ],
    });
  });

  it("falls back to a positional label when the file names nothing", async () => {
    getGindexTracks.mockResolvedValue([{ index: 0, type: "audio" }]);
    const result = await resolveWithTimers(fetchMediaTracks("movie", 1));
    expect(result).toEqual({
      status: "ready",
      tracks: [{ index: 0, kind: "audio", label: "Faixa 1", language: null }],
    });
  });

  it("retries while the backend reports a probe in flight, then succeeds", async () => {
    getGindexTracks
      .mockResolvedValueOnce({ status: "probing", retry_after: 5 })
      .mockResolvedValueOnce({ status: "probing", retry_after: 5 })
      .mockResolvedValueOnce([{ index: 1, type: "audio", language: "por" }]);

    const result = await resolveWithTimers(fetchMediaTracks("movie", 1));

    expect(getGindexTracks).toHaveBeenCalledTimes(3);
    expect(result.status).toBe("ready");
  });

  it("gives up rather than polling forever", async () => {
    // The upstream this probes can be rate limited for hours; a picker that
    // never opens beats a request loop that never ends.
    getGindexTracks.mockResolvedValue({ status: "probing", retry_after: 5 });

    const result = await resolveWithTimers(fetchMediaTracks("movie", 1));

    expect(result).toEqual({ status: "unknown" });
    expect(getGindexTracks).toHaveBeenCalledTimes(4);
  });

  it("treats the backend's 404 as an answer, not a failure", async () => {
    // `tracks_not_available` means non-GIndex content — nothing to probe.
    getGindexTracks.mockRejectedValue(new ApiError(404, "Tracks not available", "tracks_not_available"));
    const result = await resolveWithTimers(fetchMediaTracks("movie", 1));
    expect(result).toEqual({ status: "unavailable" });
  });

  it("reports other failures as unknown", async () => {
    getGindexTracks.mockRejectedValue(new ApiError(500, "boom"));
    const result = await resolveWithTimers(fetchMediaTracks("movie", 1));
    expect(result).toEqual({ status: "unknown" });
  });

  it("never probes live channels", async () => {
    const result = await fetchMediaTracks("channel", 1);
    expect(result).toEqual({ status: "unavailable" });
    expect(getGindexTracks).not.toHaveBeenCalled();
  });

  it("asks for the episode probe type for series content", async () => {
    getGindexTracks.mockResolvedValue([]);
    await resolveWithTimers(fetchMediaTracks("series", 42));
    expect(getGindexTracks).toHaveBeenCalledWith("episode", 42);
  });

  it("drops entries the picker could not act on", async () => {
    getGindexTracks.mockResolvedValue([
      { index: 0, type: "video" },
      { index: "nope" as unknown as number, type: "audio" },
      { index: 4, type: "audio", language: "por" },
    ]);
    const result = await resolveWithTimers(fetchMediaTracks("movie", 1));
    expect(result).toEqual({
      status: "ready",
      tracks: [{ index: 4, kind: "audio", label: "por", language: "por" }],
    });
  });
});

describe("hasSelectableTracks", () => {
  const audio = (index: number) => ({ index, kind: "audio" as const, label: `a${index}`, language: null });
  const subtitle = (index: number) => ({
    index,
    kind: "subtitle" as const,
    label: `s${index}`,
    language: null,
  });

  it("stays quiet when there is nothing to choose between", () => {
    expect(hasSelectableTracks([])).toBe(false);
    expect(hasSelectableTracks([audio(1)])).toBe(false);
  });

  it("offers a choice for multiple audio tracks", () => {
    expect(hasSelectableTracks([audio(1), audio(2)])).toBe(true);
  });

  it("offers a choice when subtitles exist at all, since off is a choice", () => {
    expect(hasSelectableTracks([audio(1), subtitle(2)])).toBe(true);
  });

  it("splits the list per picker", () => {
    expect(splitByKind([audio(1), subtitle(2), audio(3)])).toEqual({
      audio: [audio(1), audio(3)],
      subtitle: [subtitle(2)],
    });
  });
});
