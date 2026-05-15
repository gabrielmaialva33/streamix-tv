import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { createLogger } from "@/shared/logging/logger";

const logger = createLogger("CapacitorBackButton");

let installed = false;

/**
 * On Android (Fire TV / phone / tablet), the hardware Back key fires through
 * Capacitor's `App.backButton` event, *not* through `window.keydown`. Without
 * a listener, Capacitor falls back to `webview.canGoBack()` and, finding no
 * history (we use HashRouter), calls `App.exitApp()` — the app vanishes
 * before LightningJS' `handleBack` in MainLayout ever fires.
 *
 * Forward the event to the Lightning runtime by synthesising a Backspace/Escape
 * keydown so the existing keymap (`Back: [27, 8, 166]` in devices/firetv) and
 * the existing exit dialog flow take over.
 */
export function installCapacitorBackButton() {
  if (installed) return;
  if (!Capacitor.isNativePlatform()) return;
  installed = true;

  App.addListener("backButton", ({ canGoBack }) => {
    logger.debug("Capacitor backButton", { canGoBack, hash: location.hash });
    // Pure back navigation: rewind the hash router stack one step. If we're
    // already at the top (no history), close the app instead of doing nothing.
    if (window.history.length > 1) {
      window.history.back();
    } else {
      void App.exitApp();
    }
  }).catch(error => {
    logger.warn("Failed to install Capacitor backButton listener", error);
  });
}
