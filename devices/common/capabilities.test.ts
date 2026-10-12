import { afterEach, describe, expect, it, vi } from "vitest";
import { type DeviceProfile, hasPointerInput, rendererBudget } from "./capabilities";

function profile(overrides: Partial<DeviceProfile> = {}): DeviceProfile {
  return {
    isFireTV: false,
    isLegacyFireTV: false,
    isTizen: true,
    tizenVersion: 6.0,
    deviceMemoryGB: 2,
    hasWebGL: true,
    hasWebGL2: true,
    ...overrides,
  };
}

describe("rendererBudget", () => {
  it("gives 1GB devices the tightest budget", () => {
    // Fire TV Stick Lite / Stick 3rd gen, and the oldest Tizen sets.
    const budget = rendererBudget(profile({ deviceMemoryGB: 1 }));
    expect(budget.criticalThresholdMB).toBe(56);
    expect(budget.textureProcessingTimeLimit).toBe(4);
  });

  it("keeps the validated budget for 2GB devices", () => {
    const budget = rendererBudget(profile({ deviceMemoryGB: 2 }));
    expect(budget.criticalThresholdMB).toBe(80);
    expect(budget.boundsMargin).toBe(560);
  });

  it("opens headroom above 2GB", () => {
    for (const ram of [3, 4, 8]) {
      expect(rendererBudget(profile({ deviceMemoryGB: ram })).criticalThresholdMB).toBe(140);
    }
  });

  it("never gives a smaller device a larger budget", () => {
    const ramSteps = [0.5, 1, 2, 3, 4, 8];
    const budgets = ramSteps.map(ram => rendererBudget(profile({ deviceMemoryGB: ram })));
    for (let i = 1; i < budgets.length; i += 1) {
      expect(budgets[i].criticalThresholdMB).toBeGreaterThanOrEqual(budgets[i - 1].criticalThresholdMB);
      expect(budgets[i].boundsMargin).toBeGreaterThanOrEqual(budgets[i - 1].boundsMargin);
    }
  });

  describe("when the WebView is too old to report memory", () => {
    it("treats legacy Fire TV sticks as 1GB", () => {
      const budget = rendererBudget(
        profile({ deviceMemoryGB: null, isFireTV: true, isLegacyFireTV: true, isTizen: false }),
      );
      expect(budget.criticalThresholdMB).toBe(56);
    });

    it("treats pre-6.0 Tizen sets as 1GB", () => {
      // Tizen 4.0 is Chromium M56, which predates navigator.deviceMemory.
      const budget = rendererBudget(profile({ deviceMemoryGB: null, tizenVersion: 4.0 }));
      expect(budget.criticalThresholdMB).toBe(56);
    });

    it("falls back to the validated middle tier for anything else", () => {
      // Guessing high on an unknown device is the expensive mistake; guessing
      // the tier we have actually run on is the cheap one.
      const budget = rendererBudget(profile({ deviceMemoryGB: null, tizenVersion: null, isTizen: false }));
      expect(budget.criticalThresholdMB).toBe(80);
    });
  });

  it("prefers the measured value over the platform heuristic", () => {
    // A 4GB Fire TV Cube must not be squeezed into the legacy stick bracket
    // just because it is a Fire TV, and vice versa.
    expect(rendererBudget(profile({ deviceMemoryGB: 4, isFireTV: true })).criticalThresholdMB).toBe(140);
    expect(rendererBudget(profile({ deviceMemoryGB: 1, tizenVersion: 10.0 })).criticalThresholdMB).toBe(56);
  });
});

function withPointerQueries(matching: string[]): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({ matches: matching.includes(query) })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("hasPointerInput", () => {
  it("is false on a remote-only TV", () => {
    // What the Android TV / Fire TV WebView reports: pointer none.
    withPointerQueries([]);
    expect(hasPointerInput()).toBe(false);
  });

  it("is true for a pointer remote", () => {
    // An LG magic remote moves a cursor and wants click-to-Enter translation.
    withPointerQueries(["(any-pointer: fine)"]);
    expect(hasPointerInput()).toBe(true);
  });

  it("is true for a touch screen", () => {
    withPointerQueries(["(any-pointer: coarse)"]);
    expect(hasPointerInput()).toBe(true);
  });

  it("assumes no pointer when the WebView cannot answer", () => {
    // Too old to support matchMedia: a TV app's safe default is remote-only.
    vi.stubGlobal("matchMedia", undefined);
    expect(hasPointerInput()).toBe(false);
  });
});
