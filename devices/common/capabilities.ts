/**
 * Runtime probes for the host TV / WebView. Used to tune the LightningJS
 * renderer config so the same code works on a 4K Cube and a 2014 Fire TV
 * Stick (Adreno 320, 2 GB RAM, Fire OS 5, Chromium ~50) without crashing
 * the latter or starving the former.
 *
 * Fire TV model codes: https://developer.amazon.com/docs/fire-tv/identify-amazon-fire-tv-devices.html
 *   AFT*  → all Fire TV devices
 *   AFTM  → Fire TV (1st gen, 2014)              <- the target of the
 *   AFTT  → Fire TV Stick (1st gen, 2014)           "low-end profile"
 *   AFTS  → Fire TV (2nd gen, 2015)
 *   AFTRS → Fire TV (Edition, 2017)
 *   AFTN  → Fire TV (3rd gen, 2017)
 *   AFTKA → Fire TV Stick 4K Max (2021)
 *   …and many more
 */

const LEGACY_FIRE_TV_MODELS = ["AFTM", "AFTT", "AFTRS"];

export type DeviceProfile = {
  isFireTV: boolean;
  isLegacyFireTV: boolean;
  isTizen: boolean;
  /**
   * Approximate RAM in GB from `navigator.deviceMemory`, or null where the
   * WebView predates it (Chrome 63 — so Fire OS 5/6 and Tizen 4.0 lack it).
   * The spec quantises this to 0.25/0.5/1/2/4/8, which is exactly the
   * granularity the texture budget needs.
   */
  deviceMemoryGB: number | null;
  /** Platform version parsed from the UA (5.0, 6.5, 10.0...), null off-Tizen. */
  tizenVersion: number | null;
  hasWebGL: boolean;
  hasWebGL2: boolean;
};

let cached: DeviceProfile | null = null;

export function detectDeviceProfile(): DeviceProfile {
  if (cached) return cached;

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isFireTV = /AFT/.test(ua);
  const isLegacyFireTV = LEGACY_FIRE_TV_MODELS.some(model => ua.includes(model));
  // Samsung sets report e.g. "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) ...".
  const tizenMatch = ua.match(/Tizen (\d+(?:\.\d+)?)/);
  const tizenVersion = tizenMatch ? Number(tizenMatch[1]) : null;
  const isTizen = tizenVersion !== null || /Tizen/.test(ua);
  const reportedMemory =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
      : undefined;
  const deviceMemoryGB = typeof reportedMemory === "number" && reportedMemory > 0 ? reportedMemory : null;

  let hasWebGL = false;
  let hasWebGL2 = false;
  if (typeof document !== "undefined") {
    try {
      const probe = document.createElement("canvas");
      hasWebGL = !!(probe.getContext("webgl") || probe.getContext("experimental-webgl"));
      hasWebGL2 = !!probe.getContext("webgl2");
    } catch {
      // Some embedded WebViews throw on getContext when accelerated GL is off.
    }
  }

  cached = { isFireTV, isLegacyFireTV, isTizen, tizenVersion, deviceMemoryGB, hasWebGL, hasWebGL2 };
  return cached;
}

export interface RendererBudget {
  criticalThresholdMB: number;
  cleanupTargetLevel: number;
  boundsMargin: number;
  cleanupIntervalMs: number;
  textureProcessingTimeLimit: number;
}

const BUDGET_BY_RAM: ReadonlyArray<{ maxGB: number; budget: RendererBudget }> = [
  {
    maxGB: 1,
    budget: {
      criticalThresholdMB: 56,
      cleanupTargetLevel: 0.5,
      boundsMargin: 320,
      cleanupIntervalMs: 20000,
      textureProcessingTimeLimit: 4,
    },
  },
  {
    maxGB: 2,
    budget: {
      criticalThresholdMB: 80,
      cleanupTargetLevel: 0.55,
      boundsMargin: 560,
      cleanupIntervalMs: 30000,
      textureProcessingTimeLimit: 6,
    },
  },
  {
    maxGB: Number.POSITIVE_INFINITY,
    budget: {
      criticalThresholdMB: 140,
      cleanupTargetLevel: 0.6,
      boundsMargin: 720,
      cleanupIntervalMs: 30000,
      textureProcessingTimeLimit: 8,
    },
  },
];

/** RAM the device most likely has when `navigator.deviceMemory` is missing. */
function estimatedMemoryGB(profile: DeviceProfile): number {
  // Pre-Chrome-63 WebViews: Fire OS 5/6 sticks and Tizen 4.0 sets. Both eras
  // shipped 1-1.5GB, and guessing high there is the expensive mistake.
  if (profile.isLegacyFireTV) return 1;
  if (profile.isFireTV) return 1;
  if (profile.tizenVersion !== null && profile.tizenVersion < 6.0) return 1;
  // Unknown platform with a WebView too old to report: assume the middle tier,
  // which is the only one exercised on real hardware.
  return 2;
}

/**
 * Texture/preload budget sized to the device's actual RAM.
 *
 * Model codes and OS versions both looked like usable proxies and both are
 * wrong: Amazon ships a 1GB Fire TV Stick Lite on Fire OS 7 (2020) alongside a
 * 1.5GB Stick 4K on Fire OS 6 (2018), so a newer OS can mean *less* memory —
 * and the Fire TV model list runs to dozens of codes with no stable pattern.
 * `navigator.deviceMemory` measures the thing we actually care about, and it
 * reports correctly on both Tizen and Fire OS WebViews. Model/version
 * heuristics survive only as the fallback for WebViews too old to expose it.
 *
 * The three tiers are conservative brackets, not measurements: only the middle
 * one has run on real hardware. Re-measure before widening either end.
 */
export function rendererBudget(profile = detectDeviceProfile()): RendererBudget {
  const ram = profile.deviceMemoryGB ?? estimatedMemoryGB(profile);
  const tier = BUDGET_BY_RAM.find(entry => ram <= entry.maxGB);
  // The last bracket is unbounded, so `find` always matches; the fallback only
  // exists to keep the return type non-optional.
  return tier ? tier.budget : BUDGET_BY_RAM[BUDGET_BY_RAM.length - 1].budget;
}

/**
 * Whether the device has a pointing device the viewer can actually move.
 *
 * `useMouse` exists to let a cursor drive a focus-based UI: it turns a click
 * into a synthetic Enter. On a remote-only TV that trade runs backwards.
 * Pressing Enter makes the browser fire its own activation click, `useMouse`
 * turns that click back into a second Enter, and every button activates twice
 * — measured on the Android TV WebView as keydown(Enter) → click → synthetic
 * keydown(Enter). The visible symptom is a two-step flow collapsing into one
 * press: the audio track picker opened and confirmed the current track in the
 * same keystroke, so no other track could ever be chosen.
 *
 * A Fire TV / Android TV WebView reports `pointer: none`, while an LG magic
 * remote reports a fine pointer and does want the translation — so ask the
 * platform rather than naming devices.
 */
export function hasPointerInput(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return ["(any-pointer: fine)", "(any-pointer: coarse)"].some(query => window.matchMedia(query).matches);
}
