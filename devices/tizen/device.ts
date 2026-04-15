import { EDeviceType } from "#devices/devices";
import { DeviceCommon } from "#devices/common/device";
import { createLogger } from "../../src/shared/logging/logger";

declare const tizen: any;

const logger = createLogger("TizenDevice");

// Register the remote keys required for in-app navigation and playback control.
const TIZEN_KEYS_TO_REGISTER = [
  "Back",
  "MediaPlay",
  "MediaPause",
  "MediaPlayPause",
  "MediaStop",
  "MediaFastForward",
  "MediaRewind",
  "MediaTrackPrevious",
  "MediaTrackNext",
  "ColorF0Red",
  "ColorF1Green",
  "ColorF2Yellow",
  "ColorF3Blue",
  "Exit",
];

export class TizenDevice extends DeviceCommon {
  static addScript(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "$WEBAPIS/webapis/webapis.js";
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error("Failed load device Script $WEBAPIS/webapis/webapis.js"));
      document.body.appendChild(script);
    });
  }

  static registerKeys() {
    try {
      TIZEN_KEYS_TO_REGISTER.forEach(key => {
        try {
          tizen.tvinputdevice.registerKey(key);
        } catch (e) {
          logger.warn(`Failed to register key: ${key}`, e);
        }
      });
      logger.debug("Tizen keys registered successfully");
    } catch (e) {
      logger.error("Failed to register Tizen keys", e);
    }
  }

  static async initialize() {
    await TizenDevice.addScript();
    TizenDevice.registerKeys();
    return new TizenDevice(EDeviceType.TIZEN);
  }

  async closeApp() {
    tizen.application.getCurrentApplication().exit();
  }
}
