import { SdfTextRenderer, WebGlCoreRenderer } from "@solidtv/renderer/webgl";
import { CanvasCoreRenderer, CanvasTextRenderer } from "@solidtv/renderer/canvas";
import { Inspector } from "@solidtv/renderer/inspector";
import { DeviceCommon } from "./device";
import { detectDeviceProfile, rendererBudget } from "./capabilities";

const profile = detectDeviceProfile();
const budget = rendererBudget(profile);

// Fall back to the Canvas2D rendering pipeline when WebGL is unavailable
// (1st-gen Fire TV Stick after a Fire OS update sometimes loses GL).
const renderEngine = profile.hasWebGL ? WebGlCoreRenderer : CanvasCoreRenderer;
const fontEngines = profile.hasWebGL ? [SdfTextRenderer, CanvasTextRenderer] : [CanvasTextRenderer];

function logicalPixelRatio(): number {
  if (typeof window === "undefined") return 1;
  const byHeight = window.innerHeight / 1080;
  const byWidth = window.innerWidth / 1920;
  const fitted = Math.min(byWidth, byHeight);
  // A zero/NaN viewport (some WebViews report 0 before first layout) must not
  // collapse the stage; fall back to the height-only ratio, then to 1.
  return fitted > 0 ? fitted : byHeight > 0 ? byHeight : 1;
}

export const config = {
  name: "common",
  quality: {
    image: {
      ratio: 1,
      quality: 80,
    },
  },
  timing: {
    hero: 500,
  },
  lightning: {
    debug: false,
    focusDebug: false,
    fontSettings: { fontFamily: "NotoSans", color: 0xffffffff, fontSize: 40 },
    fontWeightAlias: {
      300: "300",
      400: "",
      500: "500",
      700: "700",
    },
    animationSettings: { easing: "ease-in-out", duration: 250 },
    rendererOptions: {
      appHeight: 1080,
      appWidth: 1920,
      // Disable image workers — older Fire OS WebViews crash with them.
      numImageWorkers: 0,
      // SDF first when WebGL is available; Canvas-only on legacy/no-GL fallback.
      fontEngines,
      renderEngine,
      inspector: import.meta.env.DEV ? Inspector : undefined,
      // 720p = 0.666667, 1080p = 1, 1440p = 1.5, 2160p = 2.
      // Fit the fixed 1920x1080 logical stage inside whatever viewport the set
      // reports, so one layout serves every panel without a page refactor.
      // Scaling on height alone (the previous behaviour) only holds on exact
      // 16:9 output: anything narrower renders a stage wider than the panel and
      // silently clips the right-hand side, which is where the sidebar-relative
      // layout puts content. Taking the smaller ratio letterboxes instead of
      // cropping, and is identical to the old value on true 16:9 sets.
      deviceLogicalPixelRatio: logicalPixelRatio(),
      devicePhysicalPixelRatio: typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
      // Off-screen preload window. Tighter on legacy hardware so we don't
      // decode/upload textures that won't be seen for several rows.
      boundsMargin: budget.boundsMargin,
      // Transparent background for video playback (allows HTML5 video to show through)
      clearColor: 0x00000000,
      // Texture Memory Manager — tuned per device profile (capabilities.ts).
      textureMemory: {
        criticalThreshold: budget.criticalThresholdMB * 1e6,
        targetThresholdLevel: budget.cleanupTargetLevel,
        cleanupInterval: budget.cleanupIntervalMs,
        debugLogging: import.meta.env.DEV,
      },
    },
  },
  keys: {
    Back: ["b", 66],
    Left: ["ArrowLeft", 37],
    Right: ["ArrowRight", 39],
    Up: ["ArrowUp", 38],
    Down: ["ArrowDown", 40],
    Enter: ["Enter", 13],
    Play: ["p", 80],
    Pause: ["a", 65],
    Menu: ["m"],
    PlayPause: ["t", 84],
    FastForward: ["f", 70],
    FastForward10: ["d", 68],
    Rewind: ["r", 82],
    Rewind10: ["e", 69],
    Stop: ["s", 83],
    Key0: ["0", 96, 48],
    Key1: ["1", 97, 49],
    Key2: ["2", 98, 50],
    Key3: ["3", 99, 51],
    Key4: ["4", 100, 52],
    Key5: ["5", 101, 53],
    Key6: ["6", 102, 54],
    Key7: ["7", 103, 55],
    Key8: ["8", 104, 56],
    Key9: ["9", 105, 57],
  },
  initialize: function (): Promise<DeviceCommon> {
    return DeviceCommon.initialize();
  },
};
