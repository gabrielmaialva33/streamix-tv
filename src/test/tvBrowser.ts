import { test as base, expect, type Page } from "playwright/test";
import type { Movie, Series, Channel } from "@/lib/api";

const provider = { id: 1, name: "Test catalog", type: "xtream" as const };
const movies: Movie[] = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  name: `Movie ${index + 1}`,
  title: `Movie ${index + 1}`,
  year: 2026,
  duration: "1h 30min",
  genre: "Drama",
  rating: 8,
  poster: null,
  provider,
}));
const series: Series[] = [{ ...movies[0], id: 101, name: "Test series", title: "Test series" }];
const channels: Channel[] = [{ id: 201, name: "Test channel", icon: null, provider }];

/** Inspect the real Lightning scene: there are no DOM buttons in this renderer. */
export async function scene(page: Page) {
  return page.evaluate(async () => {
    const modulePath = "/src/test/tvScene.ts";
    const probe: typeof import("./tvScene") = await import(/* @vite-ignore */ modulePath);
    return probe.readScene();
  });
}

export class TvRemote {
  constructor(
    readonly page: Page,
    readonly target: string,
  ) {}

  async open(route = "/") {
    await this.page.goto(`/#${route}`);
    await expect.poll(async () => (await scene(this.page)).hasFocus).toBe(true);
    await expect.poll(async () => (await scene(this.page)).text).toContain("STREAMIX");
    await expect.poll(async () => (await scene(this.page)).focusText).not.toBe("");
  }

  async press(key: string) {
    await this.page.keyboard.press(key);
    await this.page.evaluate(
      () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
  }

  async back() {
    if (this.target === "firetv") {
      // Exercise the same dispatch/consumption contract as the Capacitor bridge,
      // including its fallback. A dismissed modal must not pop history too.
      return this.page.evaluate(async () => {
        const modulePath = "/src/platform/backKey.ts";
        const { dispatchBackKey }: typeof import("@/platform/backKey") = await import(
          /* @vite-ignore */ modulePath
        );
        const unhandled: boolean = dispatchBackKey();
        if (unhandled) history.back();
        return unhandled;
      });
    }
    await this.page.evaluate(
      keyCode => {
        for (const type of ["keydown", "keyup"]) {
          document.dispatchEvent(
            new KeyboardEvent(type, { key: "Unidentified", keyCode, bubbles: true, cancelable: true }),
          );
        }
      },
      this.target === "tizen" ? 10009 : 461,
    );
  }

  async focusIn(id: string) {
    await expect
      .poll(() => scene(this.page))
      .toMatchObject({
        hasFocus: true,
        focusIds: expect.arrayContaining([id]),
      });
  }

  async textVisible(text: string) {
    await expect.poll(async () => (await scene(this.page)).text).toContain(text);
  }
}

export const test = base.extend<{ remote: TvRemote }>({
  remote: async ({ page, baseURL }, use, testInfo) => {
    const unexpected: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.routeWebSocket(/:9999\//, () => {});
    await page.addInitScript(hasPointer => {
      localStorage.setItem(
        "streamix_auth_session",
        JSON.stringify({ token: "test-session", user: { id: 1, email: "tv@example.test", role: "user" } }),
      );
      localStorage.setItem("streamix_preferences", JSON.stringify({ announcer: false }));
      const matchMedia = window.matchMedia.bind(window);
      window.matchMedia = query => {
        const result = matchMedia(query);
        if (query.includes("pointer:")) {
          Object.defineProperty(result, "matches", {
            value: hasPointer ? query.includes("fine") : query.includes("none"),
          });
        }
        return result;
      };
    }, testInfo.project.name !== "firetv");

    await page.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      // No fixture is allowed to reach production or depend on remote images.
      if (url.origin !== baseURL) {
        unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
        return route.abort();
      }
      if (url.pathname === "/$WEBAPIS/webapis/webapis.js") {
        return route.fulfill({
          contentType: "application/javascript",
          body: "window.tizen = { tvinputdevice: { registerKey() {} } };",
        });
      }
      if (!url.pathname.startsWith("/api/")) return route.continue();

      const path = url.pathname;
      let json: unknown;
      if (path === "/api/v1/auth/me") {
        json = { user: { id: 1, email: "tv@example.test", name: "TV Viewer", role: "user" } };
      } else if (path === "/api/v1/history") {
        json = { items: [] };
      } else if (path === "/api/v1/favorites") {
        json = { favorites: [] };
      } else if (path === "/api/v1/providers/status") {
        json = { overall: { status: "healthy" }, providers: [] };
      } else if (path === "/api/v1/catalog/providers") {
        json = {
          data: [
            {
              ...provider,
              content_types: ["movies", "series", "channels"],
              catalog_counts: { movies: 12, series: 1, channels: 1 },
            },
          ],
        };
      } else if (path === "/api/v1/catalog/categories") {
        json = { data: [{ id: 10, name: "Documentaries", type: "live", provider }] };
      } else if (path === "/api/v1/catalog/home") {
        json = {
          data: {
            featured: { ...movies[0], type: "movie" },
            trending_movies: movies,
            recent_movies: movies.slice(3),
            top_rated_movies: movies.slice(6),
            trending_series: series,
          },
        };
      } else if (
        ["/api/v1/catalog/movies", "/api/v1/catalog/series", "/api/v1/catalog/channels"].includes(path)
      ) {
        const data = path.endsWith("movies") ? movies : path.endsWith("series") ? series : channels;
        json = { data, meta: { pagination: { total: data.length, offset: 0, limit: 30, has_more: false } } };
      } else if (/^\/api\/v1\/catalog\/movies\/\d+$/.test(path)) {
        json = { data: movies.find(movie => movie.id === Number(path.split("/").pop())) };
      } else if (path === "/api/v1/catalog/series/101") {
        json = { data: { ...series[0], seasons: [] } };
      } else if (path.startsWith("/api/v1/search/similar/")) {
        json = { items: [] };
      } else if (path.startsWith("/api/v1/recommendations")) {
        json = { recommendations: [], similar: [], channels: [] };
      } else if (path === "/api/v1/epg/programs") {
        json = { programs: {} };
      } else if (path === "/api/v1/epg/now") {
        json = { now: {} };
      } else if (path === "/api/v1/catalog/trending") {
        json = { data: movies, meta: { type: "movie" } };
      } else {
        unexpected.push(`${request.method()} ${path}`);
        return route.fulfill({ status: 404, json: { error: { code: "unmocked_test_request" } } });
      }
      await route.fulfill({ json });
    });

    await use(new TvRemote(page, testInfo.project.name));
    expect(unexpected, "All requests must be covered by local fixtures").toEqual([]);
    expect(errors, "Navigation must not log errors or lose its focus context").toEqual([]);
  },
});

export { expect };
