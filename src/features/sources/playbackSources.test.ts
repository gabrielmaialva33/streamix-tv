import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";

const { getPlaybackSources } = vi.hoisted(() => ({ getPlaybackSources: vi.fn() }));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, default: { getPlaybackSources } };
});

import {
  fallbackSource,
  fetchPlaybackSources,
  hasSourceChoice,
  type PlaybackSource,
  distinctDetails,
  sourceDetails,
  versionBadges,
} from "./playbackSources";

beforeEach(() => {
  getPlaybackSources.mockReset();
});

describe("versionBadges", () => {
  // The server's own examples for StreamixWeb.Content.SourceBadges: the
  // fallback must read every one of them exactly as the server does.
  it("matches the server's reading of real catalogue names", () => {
    expect(versionBadges("Uma Ideia de Você [L]", "mp4")).toEqual(["MP4", "LEG"]);
    expect(versionBadges("1 Bordadeira [LEG]")).toEqual(["LEG"]);
    expect(versionBadges("101 Dálmatas (1) 1961 Dublado 720p")).toEqual(["720p", "DUB"]);
    expect(versionBadges("Filme 1080p WEB-DL DUAL", "mkv")).toEqual(["MKV", "1080p", "DUAL"]);
    expect(versionBadges("Filme UHD HDR10")).toEqual(["4K", "HDR"]);
  });

  it("only matches whole words", () => {
    expect(versionBadges("4Kids Dubladores Legendary")).toEqual([]);
    expect(versionBadges("Ação Dublada")).toEqual(["DUB"]);
  });

  it("keeps only the highest resolution, and DUAL alone for audio", () => {
    expect(versionBadges("Duna 2160p 1080p")).toEqual(["4K"]);
    expect(versionBadges("Filme DUAL Dublado [L]")).toEqual(["DUAL"]);
    expect(versionBadges("Filme Dublado Legendado")).toEqual(["LEG", "DUB"]);
  });

  it("leaves out containers that tell a viewer nothing", () => {
    expect(versionBadges("Filme", "m3u8")).toEqual([]);
    expect(versionBadges("Filme", "txt")).toEqual([]);
  });
});

describe("fetchPlaybackSources", () => {
  it("normalises the server's list and keeps its order", async () => {
    getPlaybackSources.mockResolvedValue([
      {
        id: 1,
        provider_id: 4,
        provider_name: "GIndex",
        provider_status: "healthy",
        title: "Filme 1080p DUAL",
        badges: ["1080p", "DUAL"],
        recommended: true,
        current: true,
      },
      {
        id: 2,
        provider_id: 3,
        provider_name: "Streamix Global",
        provider_status: "degraded",
        title: "Filme [LEG]",
      },
    ]);

    const result = await fetchPlaybackSources("movie", 1);

    expect(result).toEqual({
      status: "ready",
      sources: [
        {
          id: 1,
          providerId: 4,
          providerName: "GIndex",
          providerStatus: "healthy",
          rawTitle: "Filme 1080p DUAL",
          badges: ["1080p", "DUAL"],
          recommended: true,
          current: true,
          seasonCount: null,
          episodeCount: null,
        },
        // No badges from the server, so they are derived from the name.
        {
          id: 2,
          providerId: 3,
          providerName: "Streamix Global",
          providerStatus: "degraded",
          rawTitle: "Filme [LEG]",
          badges: ["LEG"],
          recommended: false,
          current: false,
          seasonCount: null,
          episodeCount: null,
        },
      ],
    });
  });

  it("puts a provider that is down last", async () => {
    // Offering it first makes the viewer's first choice the likeliest to fail.
    getPlaybackSources.mockResolvedValue([
      { id: 1, provider_name: "Fora", provider_status: "unhealthy", recommended: true },
      { id: 2, provider_name: "No ar", provider_status: "healthy" },
    ]);

    const result = await fetchPlaybackSources("movie", 1);

    expect(result.status === "ready" && result.sources.map(s => s.id)).toEqual([2, 1]);
    // RECOMENDADA at the end of the row would contradict the order.
    expect(result.status === "ready" && result.sources.map(s => s.recommended)).toEqual([true, false]);
  });

  it("keeps the server's order among providers that are up, unknown included", async () => {
    // The server ranks by playback signals and may put "healthy" below "unknown".
    getPlaybackSources.mockResolvedValue([
      { id: 1, provider_name: "A", provider_status: "unknown", recommended: true },
      { id: 2, provider_name: "B", provider_status: "healthy" },
      { id: 3, provider_name: "C", provider_status: "degraded" },
    ]);
    const result = await fetchPlaybackSources("movie", 1);
    expect(result.status === "ready" && result.sources.map(s => s.id)).toEqual([1, 2, 3]);
    expect(result.status === "ready" && result.sources.map(s => s.recommended)).toEqual([true, false, false]);
  });

  it("keeps the label on a copy that is down when nothing else is up", async () => {
    getPlaybackSources.mockResolvedValue([
      { id: 1, provider_name: "A", provider_status: "unhealthy", recommended: true },
      { id: 2, provider_name: "B", provider_status: "unhealthy" },
    ]);
    const result = await fetchPlaybackSources("movie", 1);
    expect(result.status === "ready" && result.sources.map(s => s.recommended)).toEqual([true, false]);
  });

  it("marks the first source recommended when the server marked none", async () => {
    getPlaybackSources.mockResolvedValue([
      { id: 7, provider_name: "A" },
      { id: 8, provider_name: "B" },
    ]);
    const result = await fetchPlaybackSources("movie", 1);
    expect(result.status === "ready" && result.sources.map(s => s.recommended)).toEqual([true, false]);
  });

  it("drops entries without a playable id", async () => {
    getPlaybackSources.mockResolvedValue([{ provider_name: "sem id" }, { id: 3, provider_name: "ok" }]);
    const result = await fetchPlaybackSources("movie", 1);
    expect(result.status === "ready" && result.sources.map(s => s.id)).toEqual([3]);
  });

  it("treats a missing endpoint as nothing to offer, not as a failure", async () => {
    // A backend without the route answers 404; the page must keep working as
    // it did before the feature existed.
    getPlaybackSources.mockRejectedValue(new ApiError(404, "Not found"));
    expect(await fetchPlaybackSources("movie", 1)).toEqual({ status: "unavailable" });
  });

  it("treats a malformed id as nothing to offer", async () => {
    getPlaybackSources.mockRejectedValue(new ApiError(400, "Bad request"));
    expect(await fetchPlaybackSources("movie", "abc")).toEqual({ status: "unavailable" });
  });

  it("reports other failures as errors", async () => {
    getPlaybackSources.mockRejectedValue(new ApiError(500, "boom"));
    expect(await fetchPlaybackSources("movie", 1)).toEqual({ status: "error" });
  });

  it("reads how much of a series each copy has", async () => {
    getPlaybackSources.mockResolvedValue([
      { id: 5, provider_name: "MegaEmbed", badges: ["DUB"], season_count: 3, episode_count: 24 },
      { id: 6, provider_name: "GIndex", badges: [], season_count: 0, episode_count: null },
    ]);
    const result = await fetchPlaybackSources("series", 5);
    expect(result.status === "ready" && result.sources.map(s => [s.seasonCount, s.episodeCount])).toEqual([
      [3, 24],
      [null, null],
    ]);
    expect(getPlaybackSources).toHaveBeenCalledWith("series", 5);
  });

  it("asks for the episode route for episodes", async () => {
    getPlaybackSources.mockResolvedValue([]);
    await fetchPlaybackSources("episode", 42);
    expect(getPlaybackSources).toHaveBeenCalledWith("episode", 42);
  });
});

describe("hasSourceChoice", () => {
  const one: PlaybackSource = {
    id: 1,
    providerId: 1,
    providerName: "A",
    providerStatus: "healthy",
    rawTitle: "",
    badges: [],
    recommended: true,
    current: true,
    seasonCount: null,
    episodeCount: null,
  };

  it("offers nothing when the only copy is the one on screen", () => {
    expect(hasSourceChoice({ status: "ready", sources: [one] }, 1)).toBe(false);
    expect(hasSourceChoice({ status: "ready", sources: [] }, 1)).toBe(false);
    expect(hasSourceChoice({ status: "unavailable" }, 1)).toBe(false);
  });

  it("offers a choice when another copy exists", () => {
    expect(hasSourceChoice({ status: "ready", sources: [one, { ...one, id: 2, current: false }] }, "1")).toBe(
      true,
    );
  });

  it("offers a single copy when it is not the one on screen", () => {
    // A series list can leave the requested copy out: one copy per provider.
    expect(hasSourceChoice({ status: "ready", sources: [{ ...one, id: 2, current: false }] }, 1)).toBe(true);
  });
});

describe("fallbackSource", () => {
  const source = (id: number, providerStatus: PlaybackSource["providerStatus"]): PlaybackSource => ({
    id,
    providerId: id,
    providerName: `P${id}`,
    providerStatus,
    rawTitle: "",
    badges: [],
    recommended: false,
    current: false,
    seasonCount: null,
    episodeCount: null,
  });

  it("plays the first copy that is up when the one on screen is down", () => {
    // As ranked: copies that are up first, the one that is down last.
    const result = {
      status: "ready" as const,
      sources: [source(2, "unknown"), source(3, "healthy"), source(1, "unhealthy")],
    };
    expect(fallbackSource(result, "1")?.id).toBe(2);
  });

  it("leaves Play alone when the copy on screen is up", () => {
    const result = { status: "ready" as const, sources: [source(1, "degraded"), source(2, "healthy")] };
    expect(fallbackSource(result, 1)).toBeNull();
  });

  it("leaves Play alone when every copy is down or there is no list", () => {
    expect(
      fallbackSource({ status: "ready", sources: [source(1, "unhealthy"), source(2, "unhealthy")] }, 1),
    ).toBeNull();
    expect(fallbackSource({ status: "unavailable" }, 1)).toBeNull();
    expect(fallbackSource(undefined, 1)).toBeNull();
  });
});

describe("sourceDetails", () => {
  const base: PlaybackSource = {
    id: 1,
    providerId: 1,
    providerName: "A",
    providerStatus: "healthy",
    rawTitle: "",
    badges: [],
    recommended: false,
    current: false,
    seasonCount: null,
    episodeCount: null,
  };

  it("shows the badges of a film", () => {
    expect(sourceDetails({ ...base, badges: ["1080p", "DUAL"] })).toBe("1080p  ·  DUAL");
  });

  it("shows how much of a series a copy has, seasons only when there is room", () => {
    expect(sourceDetails({ ...base, seasonCount: 3, episodeCount: 24 })).toBe(
      "3 temporadas  ·  24 episódios",
    );
    expect(sourceDetails({ ...base, badges: ["LEG"], seasonCount: 1, episodeCount: 1 })).toBe(
      "LEG  ·  1 episódio",
    );
  });

  it("is empty when there is nothing to tell copies apart", () => {
    expect(sourceDetails(base)).toBe("");
  });
});

describe("distinctDetails", () => {
  const copy = (id: number, providerName: string, badges: string[], rawTitle = ""): PlaybackSource => ({
    id,
    providerId: null,
    providerName,
    providerStatus: "healthy",
    rawTitle,
    badges,
    recommended: false,
    current: false,
    seasonCount: null,
    episodeCount: null,
  });

  it("leaves copies that already read differently alone", () => {
    expect(
      distinctDetails([
        copy(1, "Streamix Global", ["MP4", "4K"], "Uma Ideia de Você 4K"),
        copy(2, "Streamix Global", ["MP4"], "Uma Ideia de Você (2024)"),
        copy(3, "Streamix Fallback", ["MP4"], "Uma Ideia de Você (2024)"),
      ]),
    ).toEqual(["MP4  ·  4K", "MP4", "MP4"]);
  });

  it("shows what only that copy's name has when the badges tie", () => {
    expect(
      distinctDetails([
        copy(1, "Streamix Global", ["MP4"], "Duna (2021)"),
        copy(2, "Streamix Global", ["MP4"], "Duna Versão Estendida"),
      ]),
    ).toEqual(["MP4  ·  (2021)", "MP4  ·  Versão Estendida"]);
  });

  it("numbers copies only when the names say nothing either", () => {
    expect(
      distinctDetails([copy(1, "A", [], "Duna"), copy(2, "A", [], "duna"), copy(3, "A", [], "Duna")]),
    ).toEqual(["", "cópia 2", "cópia 3"]);
  });
});
