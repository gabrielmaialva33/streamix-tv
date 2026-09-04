import { DeviceConfig } from "#devices/devices";
import { config as common } from "#devices/common";
import { mergeConfig } from "#devices/common/mergeConfig";
import { rendererBudget } from "#devices/common/capabilities";
import { TizenDevice } from "./device";

const budget = rendererBudget();

export const config: DeviceConfig = mergeConfig<DeviceConfig>(common, <Partial<DeviceConfig>>{
  name: "tizen",
  quality: {
    image: {
      ratio: 1,
      quality: 80,
    },
  },
  lightning: {
    rendererOptions: {
      numImageWorkers: 0,
      // Sized from the set's actual RAM (see rendererBudget): the package
      // installs from Tizen 5.0 up, and one fixed budget would either starve a
      // 2025 set or over-commit a 2019 one. boundsMargin keeps roughly two
      // poster pitches decoded ahead of horizontal focus; textureProcessingTimeLimit
      // caps per-frame decode work because image decode runs on the main thread.
      boundsMargin: budget.boundsMargin,
      textureProcessingTimeLimit: budget.textureProcessingTimeLimit,
      textureMemory: {
        criticalThreshold: budget.criticalThresholdMB * 1e6,
        targetThresholdLevel: budget.cleanupTargetLevel,
        cleanupInterval: budget.cleanupIntervalMs,
        doNotExceedCriticalThreshold: true,
        debugLogging: import.meta.env.DEV,
      },
    },
  },
  keys: {
    Back: 10009,
    Left: 37,
    Right: 39,
    Up: 38,
    Down: 40,
    Enter: 13,
    Play: 415,
    Pause: 19,
    PlayPause: 10252,
    FastForward: 417,
    FastForward10: 10233,
    Rewind: 412,
    Rewind10: 10232,
    Stop: 413,
    Key0: -1,
    Key1: -1,
    Key2: -1,
    Key3: -1,
    Key4: -1,
    Key5: -1,
    Key6: -1,
    Key7: -1,
    Key8: -1,
    Key9: -1,
  },
  initialize: async function () {
    return await TizenDevice.initialize();
  },
});
