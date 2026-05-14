import { SdfTextRenderer, WebGlCoreRenderer } from "@lightningjs/renderer/webgl";
import { CanvasCoreRenderer, CanvasTextRenderer } from "@lightningjs/renderer/canvas";
import { Inspector } from "@lightningjs/renderer/inspector";
import { DeviceCommon } from "./device";
import { detectDeviceProfile, rendererTuning } from "./capabilities";

const profile = detectDeviceProfile();
const tuning = rendererTuning(profile);

// Fall back to the Canvas2D rendering pipeline when WebGL is unavailable
// (1st-gen Fire TV Stick after a Fire OS update sometimes loses GL).
const renderEngine = profile.hasWebGL ? WebGlCoreRenderer : CanvasCoreRenderer;
const fontEngines = profile.hasWebGL ? [SdfTextRenderer, CanvasTextRenderer] : [CanvasTextRenderer];

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
      // Compute from the actual viewport so the same 1920×1080 lógico fits
      // any TV without page refactor — same pattern as @lightningtv/solid-demo-app.
      deviceLogicalPixelRatio: typeof window === "undefined" ? 1 : window.innerHeight / 1080,
      devicePhysicalPixelRatio: typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
      // Off-screen preload window. Tighter on legacy hardware so we don't
      // decode/upload textures that won't be seen for several rows.
      boundsMargin: tuning.boundsMargin,
      // Transparent background for video playback (allows HTML5 video to show through)
      clearColor: 0x00000000,
      // Texture Memory Manager — tuned per device profile (capabilities.ts).
      textureMemory: {
        criticalThreshold: tuning.criticalThresholdMB * 1e6,
        targetThresholdLevel: tuning.cleanupTargetLevel,
        cleanupInterval: tuning.cleanupIntervalMs,
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
  keyHoldOptions: {
    userKeyHoldMap: {
      EnterHold: ["Enter", 13],
      BackHold: ["b", 66],
    },
    holdThreshold: 1000,
  },
  initialize: function (): Promise<DeviceCommon> {
    return DeviceCommon.initialize();
  },
};
