import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("VITE_API_URL", "https://api.test/api/v1/catalog");
});

describe("image URL authentication", () => {
  it("uses the public origin when the protected resize endpoint needs a header", async () => {
    vi.stubEnv("VITE_API_KEY", "header-only-key");
    const { pickPoster, proxyImageUrl } = await import("./imageUrl");
    const raw = "https://images.example.test/poster.jpg";

    expect(
      pickPoster({
        poster: raw,
        poster_w240: "https://api.test/api/v1/catalog/images/resize?url=poster&w=240",
      }),
    ).toBe(raw);
    expect(proxyImageUrl(raw)).toBe(raw);
    expect(proxyImageUrl(raw)).not.toContain("api_key");
  });

  it("uses backend resize variants in keyless development", async () => {
    vi.stubEnv("VITE_API_KEY", "");
    const { pickPoster } = await import("./imageUrl");
    const variant = "https://api.test/api/v1/catalog/images/resize?url=poster&w=240";

    expect(pickPoster({ poster: "https://images.example.test/poster.jpg", poster_w240: variant })).toBe(
      variant,
    );
  });
});
