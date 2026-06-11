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
  hasWebGL: boolean;
  hasWebGL2: boolean;
};

let cached: DeviceProfile | null = null;

export function detectDeviceProfile(): DeviceProfile {
  if (cached) return cached;

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isFireTV = /AFT/.test(ua);
  const isLegacyFireTV = LEGACY_FIRE_TV_MODELS.some(model => ua.includes(model));

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

  cached = { isFireTV, isLegacyFireTV, hasWebGL, hasWebGL2 };
  return cached;
}

/**
 * Returns memory/perf settings tuned for the detected profile. These get
 * spread into LightningJS `rendererOptions` so the device-specific bits
 * stay in one place.
 */
export function rendererTuning(profile = detectDeviceProfile()) {
  if (profile.isLegacyFireTV) {
    return {
      criticalThresholdMB: 64, // 2 GB RAM total, share with Fire OS + WebView
      cleanupTargetLevel: 0.5, // free more aggressively after cleanup
      boundsMargin: 100, // smaller off-screen preload
      cleanupIntervalMs: 3500, // sweep more often
    };
  }

  return {
    // Bumped 100→180MB: at 100MB a few 1280px backdrops (~3.7MB each in VRAM)
    // plus a screenful of posters tripped the critical threshold, so rapid
    // detail→detail navigation churned the texture cache — evicted posters got
    // re-fetched in bursts and some loads failed (net::ERR_FAILED) with the
    // main-thread image loader (numImageWorkers:0). 180MB gives headroom on
    // 2GB+ Tizen/webOS/modern Fire TV without risking the legacy 2GB profile,
    // which keeps its tighter 64MB budget above.
    criticalThresholdMB: 180, // mid/high-end Fire TV / Tizen / webOS
    cleanupTargetLevel: 0.6,
    boundsMargin: 240,
    cleanupIntervalMs: 5000,
  };
}
