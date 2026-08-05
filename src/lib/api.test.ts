import { beforeEach, describe, expect, it, vi } from "vitest";

const API_V1 = "https://api.test/api/v1";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const movie = (id: number) => ({
  id,
  name: `Movie ${id}`,
  title: `Movie ${id}`,
  year: 2026,
  duration: null,
  genre: null,
  rating: null,
  poster: null,
});

const series = (id: number) => ({
  id,
  name: `Series ${id}`,
  title: `Series ${id}`,
  year: 2026,
  genre: null,
  rating: null,
  poster: null,
});

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  localStorage.clear();
  vi.stubEnv("VITE_API_URL", `${API_V1}/catalog`);
  vi.stubEnv("VITE_EPG_URL", `${API_V1}/epg`);
  vi.stubEnv("VITE_API_KEY", "test-api-key");
});

describe("Streamix API contracts", () => {
  it("unwraps the v1 favorite envelope and sends both auth headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          data: { content_type: "movie", content_id: 42 },
          meta: { version: "v1" },
        },
        201,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { default: api } = await import("./api");

    await expect(api.addFavorite("movie", 42, "session-token")).resolves.toEqual({
      content_type: "movie",
      content_id: 42,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_V1}/favorites`);
    expect(init.headers).toMatchObject({
      Authorization: "Bearer session-token",
      "X-API-Key": "test-api-key",
    });
    expect(JSON.parse(String(init.body))).toEqual({ type: "movie", content_id: 42 });
  });

  it("keeps API keys off credential-handling auth routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ token: "session-token", user: { id: 1, email: "dev@example.com", role: "user" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { default: api } = await import("./api");

    await api.login({ email: "dev@example.com", password: "password123" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_V1}/auth/login`);
    expect(init.headers).not.toHaveProperty("X-API-Key");
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("combines semantic movie and series hits with ranked catalog results", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/catalog/search")) {
        return Promise.resolve(
          jsonResponse({ query: "space", movies: [movie(1)], series: [series(1)], channels: [] }),
        );
      }
      if (url.includes("/search/movies")) {
        return Promise.resolve(jsonResponse({ query: "space", semantic: true, movies: [movie(2)] }));
      }
      if (url.includes("/search/series")) {
        return Promise.resolve(jsonResponse({ query: "space", semantic: true, series: [series(2)] }));
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { default: api } = await import("./api");

    const result = await api.search("space", 10);

    expect(result.movies.map(item => item.id)).toEqual([2, 1]);
    expect(result.series.map(item => item.id)).toEqual([2, 1]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("sends playback QoE through the canonical metrics batch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ accepted: 1, batch_id: "batch-1" }, 202));
    vi.stubGlobal("fetch", fetchMock);
    const { default: api } = await import("./api");

    await api.sendPlaybackTelemetry(
      {
        kind: "playback",
        event: "playback_session",
        outcome: "started",
        engine: "avplayer",
        content_type: "movie",
        time_to_first_frame_ms: 850,
      },
      "batch-1",
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_V1}/telemetry/playback`);
    expect(JSON.parse(String(init.body))).toEqual({
      batch_id: "batch-1",
      metrics: [
        {
          kind: "playback",
          event: "playback_session",
          outcome: "started",
          engine: "avplayer",
          content_type: "movie",
          time_to_first_frame_ms: 850,
        },
      ],
    });
  });

  it("covers EPG now and provider status at their current routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ now: { "7": null } }))
      .mockResolvedValueOnce(
        jsonResponse({ overall: { status: "healthy", counts: { healthy: 1 } }, providers: [] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { default: api } = await import("./api");

    await expect(api.getEpgNow([7])).resolves.toEqual({ "7": null });
    await expect(api.getProviderStatus()).resolves.toMatchObject({ overall: { status: "healthy" } });

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_V1}/epg/now?channel_ids=7`);
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_V1}/providers/status`);
  });
});
