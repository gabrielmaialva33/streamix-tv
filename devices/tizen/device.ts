import { EDeviceType } from "#devices/devices";
import { DeviceCommon } from "#devices/common/device";
import { createLogger } from "../../src/shared/logging/logger";

declare const tizen: any;

const logger = createLogger("TizenDevice");

// Keys this app wants to receive. Which of them a set actually offers varies by
// model, so this is a wish list, filtered against the platform below.
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

  /**
   * Claim the remote keys this app handles, asking only for the ones the set
   * actually offers.
   *
   * `getSupportedKeys()` is the platform's own list of *registerable* keys, and
   * it is both model-specific and narrower than the remote: a 2023 BE55C-H
   * (Tizen 9.0) reports 46 entries and none of them is "Back". That is not a
   * missing capability — Return is a default key, delivered as
   * `XF86Back` / 10009 without registration — so asking for it threw a
   * WebAPIException on every single boot. Filtering first keeps the log honest
   * and the wish list portable across models.
   */
  static registerKeys() {
    try {
      // Older firmware predates getSupportedKeys. Asking for everything is the
      // right fallback there: the per-key catch below already absorbs a refusal,
      // and registering nothing would cost the app its media keys.
      const canFilter = typeof tizen.tvinputdevice.getSupportedKeys === "function";
      const offered = canFilter
        ? new Set<string>(
            (tizen.tvinputdevice.getSupportedKeys() ?? []).map((key: { name: string }) => key.name),
          )
        : null;
      const wanted = offered
        ? TIZEN_KEYS_TO_REGISTER.filter(key => offered.has(key))
        : TIZEN_KEYS_TO_REGISTER;
      const unavailable = offered ? TIZEN_KEYS_TO_REGISTER.filter(key => !offered.has(key)) : [];

      for (const key of wanted) {
        try {
          tizen.tvinputdevice.registerKey(key);
        } catch (e) {
          logger.warn(`Failed to register key: ${key}`, e);
        }
      }

      logger.debug("Tizen keys registered", { registered: wanted.length, unavailable });
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
