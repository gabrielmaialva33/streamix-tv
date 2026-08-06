import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("VITE_API_URL", "https://api.test/api/v1/catalog");
});

describe("image URL authentication", () => {
  it("uses the protected resize endpoint without leaking its credential", async () => {
    vi.stubEnv("VITE_API_KEY", "header-only-key");
    const { pickPoster, proxyImageUrl } = await import("./imageUrl");
    const raw = "https://images.example.test/poster.jpg";
    const variant = "https://api.test/api/v1/catalog/images/resize?url=poster&w=240";

    expect(
      pickPoster({
        poster: raw,
        poster_w240: variant,
      }),
    ).toBe(variant);
    expect(proxyImageUrl(raw)).toBe(
      "https://api.test/api/v1/catalog/images/resize?url=https%3A%2F%2Fimages.example.test%2Fposter.jpg&w=480",
    );
    expect(proxyImageUrl(raw)).not.toContain("header-only-key");
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
