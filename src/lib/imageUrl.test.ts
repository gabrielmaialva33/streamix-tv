import { describe, expect, it } from "vitest";
import { proxyImageUrl } from "./imageUrl";

describe("proxyImageUrl", () => {
  it("routes a raw URL through the resize cache", () => {
    const url = proxyImageUrl("https://image.tmdb.org/t/p/original/abc.jpg", 240);
    expect(url).toContain("/images/resize?url=");
    expect(url).toContain("w=240");
    expect(url).toContain(encodeURIComponent("https://image.tmdb.org/t/p/original/abc.jpg"));
  });

  it("snaps an odd width up to the resize ladder", () => {
    expect(proxyImageUrl("https://example.test/a.jpg", 200)).toContain("w=240");
  });

  it("re-widths an already proxied URL instead of wrapping it twice", () => {
    // Stored records keep the URL they were rendered with, so a history poster
    // arrives already proxied. Wrapping again fed the resize endpoint its own
    // output and the image came back blank.
    const once = proxyImageUrl("https://image.tmdb.org/t/p/original/abc.jpg", 240) as string;
    const twice = proxyImageUrl(once, 120) as string;

    expect(twice.match(/\/images\/resize/g)).toHaveLength(1);
    expect(twice).toContain("w=120");
    expect(twice).not.toContain("%26w%3D");
    expect(twice).toContain(encodeURIComponent("https://image.tmdb.org/t/p/original/abc.jpg"));
  });

  it("is stable when applied repeatedly at the same width", () => {
    const once = proxyImageUrl("https://example.test/a.jpg", 480) as string;
    expect(proxyImageUrl(once, 480)).toBe(once);
  });

  it("passes nothing through for an absent URL", () => {
    expect(proxyImageUrl(undefined)).toBeUndefined();
    expect(proxyImageUrl("")).toBeUndefined();
  });
});
