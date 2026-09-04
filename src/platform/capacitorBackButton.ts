import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { createLogger } from "@/shared/logging/logger";
import { dispatchBackKey } from "./backKey";

const logger = createLogger("CapacitorBackButton");

let installed = false;

/**
 * On Android (Fire TV / phone / tablet), the hardware Back key fires through
 * Capacitor's `App.backButton` event, *not* through `window.keydown`. Without
 * a listener, Capacitor falls back to `webview.canGoBack()` and, finding no
 * history (we use HashRouter), calls `App.exitApp()` — the app vanishes
 * before LightningJS' `handleBack` in MainLayout ever fires.
 *
 * Forward the event to the Lightning runtime so the existing keymap
 * (`Back: [27, 8, 166]` in devices/firetv) and the existing exit dialog flow
 * take over. `dispatchBackKey` reports whether any page consumed it.
 */
export function installCapacitorBackButton() {
  if (installed) return;
  if (!Capacitor.isNativePlatform()) return;
  installed = true;

  App.addListener("backButton", ({ canGoBack }) => {
    logger.debug("Capacitor backButton", { canGoBack, hash: location.hash });

    // Hand the key to the focus tree first, so each page's own onBack runs:
    // PlayerPage tears down the backend before navigating, the sidebar closes
    // its provider list, the player closes its track picker, MainLayout opens
    // the exit dialog at the root.
    //
    // Only pop the route when nothing claimed the key, so that dismissing an
    // overlay dismisses the overlay and nothing else. Falling through
    // regardless is what made Back unpredictable here: the dialog closed and
    // the route jumped in the same press.
    if (!dispatchBackKey()) return;

    if (window.history.length > 1) {
      window.history.back();
    } else {
      void App.exitApp();
    }
  }).catch(error => {
    logger.warn("Failed to install Capacitor backButton listener", error);
  });
}
