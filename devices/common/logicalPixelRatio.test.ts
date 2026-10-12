import { afterEach, describe, expect, it } from "vitest";
import { logicalPixelRatio } from "./index";

const original = { width: window.innerWidth, height: window.innerHeight };

function viewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
}

afterEach(() => {
  viewport(original.width, original.height);
});

describe("logicalPixelRatio", () => {
  it("is 1 on a 1080p panel", () => {
    viewport(1920, 1080);
    expect(logicalPixelRatio()).toBe(1);
  });

  it("scales for 720p and 4K", () => {
    viewport(1280, 720);
    expect(logicalPixelRatio()).toBeCloseTo(0.6667, 4);
    viewport(3840, 2160);
    expect(logicalPixelRatio()).toBe(2);
  });

  it("fits by height when the viewport is wider than 16:9", () => {
    // Measured on the Tizen TV emulator, which inherits the host display's
    // shape: 2520x1080. Height is already the tighter axis here.
    viewport(2520, 1080);
    expect(logicalPixelRatio()).toBe(1);
  });

  it("fits by width when the viewport is taller than 16:9", () => {
    // The case the fit exists for, and the one no panel here can produce.
    // Scaling on height alone would give 1200/1080 = 1.111 and render a stage
    // 2133px wide into a 1920px viewport — silently clipping the right-hand
    // side, which is where the sidebar-relative layout puts content.
    viewport(1920, 1200);
    expect(logicalPixelRatio()).toBe(1);
    expect(logicalPixelRatio()).not.toBeCloseTo(1200 / 1080, 3);
  });

  it("never collapses the stage on a viewport reported as zero", () => {
    // Some WebViews report 0 before first layout; a 0 ratio renders nothing.
    viewport(0, 1080);
    expect(logicalPixelRatio()).toBe(1);
    viewport(0, 0);
    expect(logicalPixelRatio()).toBe(1);
  });
});
