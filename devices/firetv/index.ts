import { DeviceConfig } from "#devices/devices";
import { merge } from "lodash-es";
import { config as common } from "#devices/common";
import { FireTVDevice } from "./device";

// Fire TV remote keycodes as delivered through the Android WebView (Capacitor).
// Directional keys come through as standard DOM ArrowKeys, but the Back button
// fires as Escape (27), and media keys follow the Android KeyEvent mapping.
export const config: DeviceConfig = merge({}, common, <Partial<DeviceConfig>>{
  name: "firetv",
  lightning: {
    rendererOptions: {
      numImageWorkers: 0,
    },
  },
  keys: {
    Back: [27, 8, 166],
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
  keyHoldOptions: {
    userKeyHoldMap: {
      EnterHold: 13,
      BackHold: [27, 8, 166],
    },
    holdThreshold: 1000,
  },
  initialize: async function () {
    return await FireTVDevice.initialize();
  },
});
