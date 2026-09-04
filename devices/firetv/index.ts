import { DeviceConfig } from "#devices/devices";
import { config as common } from "#devices/common";
import { mergeConfig } from "#devices/common/mergeConfig";
import { rendererBudget } from "#devices/common/capabilities";
import { FireTVDevice } from "./device";

// Fire TV remote keycodes as delivered through the Android WebView (Capacitor).
// Directional keys come through as standard DOM ArrowKeys, but the Back button
// fires as Escape (27), and media keys follow the Android KeyEvent mapping.
//
// Back lists "Escape" by name as well as its code because the focus manager
// resolves `keyMapEntries[event.key]` before `keyMapEntries[event.keyCode]`,
// and it ships a default binding of `Escape: 'Escape'`. A code-only entry
// therefore never wins: the string lookup succeeds first and the press is
// delivered as an Escape event that nothing listens for. Naming the string
// here overrides that default, which is what makes the hardware Back button
// reach each page's onBack at all.
const budget = rendererBudget();

export const config: DeviceConfig = mergeConfig<DeviceConfig>(common, <Partial<DeviceConfig>>{
  name: "firetv",
  lightning: {
    rendererOptions: {
      // Older Fire OS WebViews crash with image workers, so decode runs on the
      // main thread across the whole family.
      numImageWorkers: 0,
      // Which makes the per-frame decode cap matter here for the same reason it
      // does on Tizen, and makes the hard ceiling worth enforcing: the family
      // still includes 1GB sticks (Stick Lite, Stick 3rd gen) where overshooting
      // the texture budget is what pushes the WebView into a kill.
      textureProcessingTimeLimit: budget.textureProcessingTimeLimit,
      textureMemory: {
        doNotExceedCriticalThreshold: true,
      },
    },
  },
  keys: {
    Back: ["Escape", 27, 8, 166],
    Left: 37,
    Right: 39,
    Up: 38,
    Down: 40,
    Enter: 13,
    Play: 179,
    Pause: 19,
    PlayPause: 179,
    FastForward: 228,
    Rewind: 227,
    Stop: 178,
  },
  initialize: async function () {
    return await FireTVDevice.initialize();
  },
});
