import { describe, expect, it } from "vitest";
import type { ProviderHealthResponse } from "@/lib/api";
import {
  catalogBrowseConfigForPath,
  catalogSidebarModeAfterBack,
  centeredWindowStart,
  isGridRowStart,
} from "./catalogBrowse";
import { combinedProviderHealthStatus } from "./providerHealth";

describe("catalog browse sidebar", () => {
  it("uses the wide contextual rail only on catalog roots", () => {
    expect(catalogBrowseConfigForPath("/movies")).toMatchObject({
      contentType: "movies",
      categoryType: "vod",
    });
    expect(catalogBrowseConfigForPath("/series/12")).toBeUndefined();
    expect(catalogBrowseConfigForPath("/player/channel/8")).toBeUndefined();
  });

  it("drills back from providers to filters and then to global navigation", () => {
    expect(catalogSidebarModeAfterBack("providers")).toBe("catalog");
    expect(catalogSidebarModeAfterBack("catalog")).toBe("navigation");
    expect(catalogSidebarModeAfterBack("navigation")).toBeUndefined();
  });

  it("keeps a category window full while moving through long lists", () => {
    expect(centeredWindowStart(0, 24, 9)).toBe(0);
    expect(centeredWindowStart(4, 24, 9)).toBe(0);
    expect(centeredWindowStart(5, 24, 9)).toBe(1);
    expect(centeredWindowStart(23, 24, 9)).toBe(15);
  });

  it("leaves a grid to the sidebar only from the first visual column", () => {
    expect(isGridRowStart(0, 6)).toBe(true);
    expect(isGridRowStart(6, 6)).toBe(true);
    expect(isGridRowStart(12, 6)).toBe(true);
    expect(isGridRowStart(7, 6)).toBe(false);
    expect(isGridRowStart(undefined, 6)).toBe(false);
  });

  it("keeps the combined catalog usable when only one provider is down", () => {
    const health = {
      overall: { status: "unhealthy" as const, counts: {} },
      providers: [
        ["Fallback", "healthy"],
        ["Global", "unhealthy"],
      ] as const,
    };
    const response = {
      overall: health.overall,
      providers: health.providers.map(([name, status], index) => ({
        id: index + 1,
        name,
        provider_type: "xtream",
        visibility: "public",
        is_active: true,
        status,
        circuit_state: null,
        last_error_at: null,
        last_success_at: null,
        error_count: 0,
        dimensions: {},
        capabilities: null,
        capacity: {},
        message: "",
      })),
    } satisfies ProviderHealthResponse;
    expect(combinedProviderHealthStatus(response)).toBe("degraded");
  });
});
