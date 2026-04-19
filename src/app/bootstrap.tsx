import { FocusStackProvider, HashRouter } from "@lightningtv/solid/primitives";
import { config } from "#devices/common";
import { isDebugOverlayEnabled } from "@/debug/overlayState";
import { getAppRenderer } from "./lightning";
import AppShell from "./AppShell";
import AppRoutes from "./routes";
import { createLogger } from "@/shared/logging/logger";
import { focusRuntimeWindow, isTizenRuntime } from "@/platform/runtime";

const logger = createLogger("AppBootstrap");

export async function bootstrapApp() {
  if (isDebugOverlayEnabled) {
    const { installDebugCapture } = await import("../components/DebugOverlay");
    installDebugCapture();
  }

  try {
    await config.initialize();
    logger.debug("Device initialized", { tizen: isTizenRuntime() });
    if (isTizenRuntime()) {
      focusRuntimeWindow();
    }
  } catch (error) {
    logger.warn("Device initialization failed", error);
  }

  const { render, renderer } = getAppRenderer();

  render(() => (
    <FocusStackProvider>
      <HashRouter root={AppShell}>
        <AppRoutes />
      </HashRouter>
    </FocusStackProvider>
  ));

  // Dismiss the HTML splash once Lightning has painted its first frame. We
  // wait for either an `idle` event from the renderer (canvas settled) or a
  // safety timeout so a broken init can't leave the splash up forever. The
  // CSS transition on #splash fades it out smoothly; we remove it from the
  // DOM afterwards so it can't intercept pointer/key events.
  const dismissSplash = () => {
    if (document.body.classList.contains("app-ready")) return;
    document.body.classList.add("app-ready");
    setTimeout(() => {
      document.getElementById("splash")?.remove();
    }, 500);
  };

  let dismissed = false;
  const markReady = () => {
    if (dismissed) return;
    dismissed = true;
    dismissSplash();
  };

  // Primary signal — the Home page (or any other first-route page) fires a
  // `streamix:ready` event once its first batch of data is on screen. This
  // covers slow networks where /catalog/home can take 2s+ and avoids the
  // user seeing a black canvas between the splash fading and rails painting.
  window.addEventListener("streamix:ready", markReady, { once: true });
  // Fallback — on auth/login flows there's no home data, so also dismiss
  // shortly after Lightning settles its first idle frame.
  renderer?.once?.("idle", () => {
    setTimeout(markReady, 1200);
  });
  // Hard safety net: if idle never fires (e.g. init failure), drop splash
  // after 6s so the user isn't left staring at "CARREGANDO" forever.
  setTimeout(markReady, 6000);
}
