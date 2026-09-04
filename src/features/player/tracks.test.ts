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
    // Shape verified against production: GET /api/gindex-tracks/movie/99313
    getGindexTracks.mockResolvedValue({
      audio: [
        { index: 1, codec: "mp3", language: "por", title: null, channels: 2, default: true, forced: false },
        { index: 2, codec: "dts", language: "eng", title: null, channels: 6, default: false, forced: false },
      ],
      subtitle: [
        {
          index: 3,
          codec: "subrip",
          language: "por",
          title: null,
          channels: null,
          default: false,
          forced: false,
        },
      ],
      probed_at: "2026-09-04T18:32:16.910144Z",
    });

    const result = await resolveWithTimers(fetchMediaTracks("movie", 1));

    expect(result).toEqual({
      status: "ready",
      tracks: [
        { index: 1, kind: "audio", label: "Português · 2.0", language: "por", isDefault: true },
        { index: 2, kind: "audio", label: "Inglês · 5.1", language: "eng", isDefault: false },
        { index: 3, kind: "subtitle", label: "Português", language: "por", isDefault: false },
      ],
    });
  });

  it("falls back to a positional label when the file names nothing", async () => {
    // "und" plus no title is the degenerate case (verified on id 82175).
    getGindexTracks.mockResolvedValue({ audio: [{ index: 0, language: "und", title: null }], subtitle: [] });
    const result = await resolveWithTimers(fetchMediaTracks("movie", 1));
    expect(result).toEqual({
      status: "ready",
      tracks: [{ index: 0, kind: "audio", label: "Faixa 1", language: "und", isDefault: false }],
    });
  });

  it("retries while the backend reports a probe in flight, then succeeds", async () => {
    getGindexTracks
      .mockResolvedValueOnce({ status: "probing", retry_after: 5 })
      .mockResolvedValueOnce({ status: "probing", retry_after: 5 })
      .mockResolvedValueOnce({ audio: [{ index: 1, language: "por" }], subtitle: [] });

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
    getGindexTracks.mockResolvedValue({ audio: [], subtitle: [] });
    await resolveWithTimers(fetchMediaTracks("series", 42));
    expect(getGindexTracks).toHaveBeenCalledWith("episode", 42);
  });

  it("drops entries the picker could not act on", async () => {
    getGindexTracks.mockResolvedValue({
      audio: [
        { index: "nope" as unknown as number, language: "por" },
        { index: 4, language: "por" },
      ],
      subtitle: [],
    });
    const result = await resolveWithTimers(fetchMediaTracks("movie", 1));
    expect(result).toEqual({
      status: "ready",
      tracks: [{ index: 4, kind: "audio", label: "Português", language: "por", isDefault: false }],
    });
  });
  it("ignores release-group branding in the track title", async () => {
    // Real titles carry things like "WWW.BLUDV.COM 5.1 [BR]"; the language the
    // container declares is what a viewer actually chooses by.
    getGindexTracks.mockResolvedValue({
      audio: [{ index: 1, language: "por", title: "WWW.BLUDV.COM 5.1 [BR]", channels: 6 }],
      subtitle: [],
    });
    const result = await resolveWithTimers(fetchMediaTracks("movie", 1));
    expect(result).toEqual({
      status: "ready",
      tracks: [{ index: 1, kind: "audio", label: "Português · 5.1", language: "por", isDefault: false }],
    });
  });

  it("keeps a meaningful title when the container declares no language", async () => {
    getGindexTracks.mockResolvedValue({
      audio: [{ index: 1, language: "und", title: "Comentários do diretor" }],
      subtitle: [],
    });
    const result = await resolveWithTimers(fetchMediaTracks("movie", 1));
    expect((result as { tracks: Array<{ label: string }> }).tracks[0].label).toBe("Comentários do diretor");
  });

  it("marks forced subtitles so they are not mistaken for a full track", async () => {
    getGindexTracks.mockResolvedValue({
      audio: [],
      subtitle: [{ index: 3, language: "por", forced: true, channels: null }],
    });
    const result = await resolveWithTimers(fetchMediaTracks("movie", 1));
    expect((result as { tracks: Array<{ label: string }> }).tracks[0].label).toBe("Português (forçada)");
  });
});

describe("hasSelectableTracks", () => {
  const audio = (index: number) => ({
    index,
    kind: "audio" as const,
    label: `a${index}`,
    language: null,
    isDefault: false,
  });
  const subtitle = (index: number) => ({
    index,
    kind: "subtitle" as const,
    label: `s${index}`,
    language: null,
    isDefault: false,
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
