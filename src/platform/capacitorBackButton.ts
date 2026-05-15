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

    // Forward to Lightning's focusManager (which listens on `document` keydown)
    // so each page's own onBack handler runs first — PlayerPage cleans up the
    // backend before navigating, MainLayout opens the ExitDialog at the root,
    // etc. Lightning's keymap binds Back to [27, 8, 166]; Escape (27) matches.
    //
    // If a focused node returns true from onBack, Lightning calls
    // preventDefault on the event; in that case we don't fall through to
    // history.back(). Otherwise we still pop the route so the user is never
    // stuck.
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    if (event.defaultPrevented) {
      return;
    }

    if (window.history.length > 1) {
      window.history.back();
    } else {
      void App.exitApp();
    }
  }).catch(error => {
    logger.warn("Failed to install Capacitor backButton listener", error);
  });
}
