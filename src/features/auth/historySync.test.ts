import { beforeEach, describe, expect, it, vi } from "vitest";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  localStorage.clear();
  vi.stubEnv("VITE_API_URL", "https://api.test/api/v1/catalog");
  vi.stubEnv("VITE_API_KEY", "test-api-key");
});

describe("remote history sync", () => {
  it("hydrates a server-only movie into local continue watching", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/history")) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: 99,
                content_type: "movie",
                content_id: 12,
                progress_seconds: 300,
                duration_seconds: 600,
                completed: false,
                watched_at: "2026-08-05T12:00:00Z",
              },
            ],
          }),
        );
      }
      if (url.includes("/catalog/movies/12")) {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 12,
              name: "Server Movie",
              title: "Server Movie",
              year: 2026,
              duration: "10min",
              genre: null,
              rating: null,
              poster: "https://images.example.test/movie.jpg",
              provider: { id: 7, name: "Provider 7", type: "xtream" },
            },
          }),
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { syncHistoryFromRemote } = await import("./historySync");
    const { history } = await import("@/lib/storage");

    await syncHistoryFromRemote("session-token");

    expect(history.getProgress("12", "movie")).toMatchObject({
      title: "Server Movie",
      progress: 50,
      currentTime: 300,
      duration: 600,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
