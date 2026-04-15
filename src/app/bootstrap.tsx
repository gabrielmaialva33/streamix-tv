import { FocusStackProvider, HashRouter } from "@lightningtv/solid/primitives";
import { config } from "#devices/common";
import { installDebugCapture } from "../components/DebugOverlay";
import { getAppRenderer } from "./lightning";
import AppShell from "./AppShell";
import AppRoutes from "./routes";
import { createLogger } from "../shared/logging/logger";
import { focusRuntimeWindow, isTizenRuntime } from "../platform/runtime";

const logger = createLogger("AppBootstrap");

export async function bootstrapApp() {
  installDebugCapture();

  try {
    await config.initialize();
    logger.debug("Device initialized", { tizen: isTizenRuntime() });
    if (isTizenRuntime()) {
      focusRuntimeWindow();
    }
  } catch (error) {
    logger.warn("Device initialization failed", error);
  }

  const { render } = getAppRenderer();

  render(() => (
    <FocusStackProvider>
      <HashRouter root={AppShell}>
        <AppRoutes />
      </HashRouter>
    </FocusStackProvider>
  ));
}
