import { createLogger } from "./logging/logger";

const logger = createLogger("BootTiming");

/**
 * How long the app takes to put its first screen up, in phases.
 *
 * What the zero point is, precisely: `performance.now()` counts from the
 * document's navigation, not from the moment the viewer pressed the remote. On
 * Tizen and Fire TV the platform spends time launching the process and handing
 * the WebView its first byte, and nothing in the page can see that gap. So this
 * measures the half the app owns, and a number from here is never the whole
 * wait — read it as "document start → first screen", and compare it against
 * itself across builds rather than against a stopwatch.
 *
 * Phases are recorded rather than just a total because a regression is only
 * actionable once you know which half moved: the renderer coming up (GL
 * context, shaders, fonts) or the first screen's data arriving.
 */
interface BootPhase {
  name: string;
  at: number;
}

const phases: BootPhase[] = [];
let reported = false;

declare global {
  interface Window {
    /** Read by the dev tooling over CDP; absent until the first phase lands. */
    __BOOT?: { phases: BootPhase[]; totalMs: number | null };
  }
}

function publish(totalMs: number | null): void {
  if (typeof window === "undefined") return;
  window.__BOOT = { phases: [...phases], totalMs };
}

/** Record a named point in the boot sequence. Safe to call before the DOM. */
export function markBootPhase(name: string): void {
  if (typeof performance === "undefined" || typeof performance.now !== "function") return;
  phases.push({ name, at: Math.round(performance.now()) });
  publish(null);
}

/**
 * Close the measurement and log it once.
 *
 * Idempotent on purpose: the ready signal is dispatched by whichever route
 * paints first *and* re-dispatched by the bootstrap safety net, so this is
 * reached more than once on a normal boot.
 */
export function reportBootTiming(): void {
  if (reported) return;
  if (typeof performance === "undefined" || typeof performance.now !== "function") return;
  reported = true;

  markBootPhase("ready");
  const total = phases[phases.length - 1].at;
  publish(total);

  const deltas: Record<string, number> = {};
  let previous = 0;
  for (const phase of phases) {
    deltas[phase.name] = phase.at - previous;
    previous = phase.at;
  }

  logger.info("Boot timing", { totalMs: total, phasesMs: deltas });
}

/** Test seam: the module keeps one boot's worth of state per page load. */
export function resetBootTimingForTests(): void {
  phases.length = 0;
  reported = false;
  if (typeof window !== "undefined") delete window.__BOOT;
}
