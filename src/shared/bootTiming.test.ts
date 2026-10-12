import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markBootPhase, reportBootTiming, resetBootTimingForTests } from "./bootTiming";

let clock = 0;

beforeEach(() => {
  resetBootTimingForTests();
  clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});

afterEach(() => {
  vi.restoreAllMocks();
  resetBootTimingForTests();
});

describe("boot timing", () => {
  it("reports the total and each phase's own share", () => {
    clock = 400;
    markBootPhase("device");
    clock = 1500;
    markBootPhase("renderer");
    clock = 2600;
    reportBootTiming();

    expect(window.__BOOT).toEqual({
      totalMs: 2600,
      phases: [
        { name: "device", at: 400 },
        { name: "renderer", at: 1500 },
        { name: "ready", at: 2600 },
      ],
    });
  });

  it("reports once, however many times the ready signal arrives", () => {
    // The first painted route dispatches it and the bootstrap safety net
    // re-dispatches, so a normal boot reaches this more than once.
    clock = 900;
    reportBootTiming();
    clock = 5000;
    reportBootTiming();

    expect(window.__BOOT?.totalMs).toBe(900);
  });

  it("publishes phases before the boot finishes, so a hang is still legible", () => {
    clock = 700;
    markBootPhase("device");

    expect(window.__BOOT).toEqual({ totalMs: null, phases: [{ name: "device", at: 700 }] });
  });

  it("stays quiet when the engine has no clock", () => {
    // Guards the oldest WebViews rather than throwing during boot of all things.
    const original = performance.now;
    // @ts-expect-error — deliberately removing the API the guard checks for.
    performance.now = undefined;
    expect(() => markBootPhase("device")).not.toThrow();
    expect(() => reportBootTiming()).not.toThrow();
    performance.now = original;
    expect(window.__BOOT).toBeUndefined();
  });
});
