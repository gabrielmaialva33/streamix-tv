import { createContext, useContext } from "solid-js";
import { createLogger } from "@/shared/logging/logger";

const logger = createLogger("LayoutFocus");

export interface LayoutFocusController {
  focusSidebar: () => boolean;
}

export const LayoutFocusContext = createContext<LayoutFocusController>();

export function useLayoutFocus(): LayoutFocusController | undefined {
  return useContext(LayoutFocusContext);
}

/**
 * Returns the "send focus back to the sidebar" handler for a page.
 *
 * Pages used to call `layoutFocus?.focusSidebar() ?? false` directly, which
 * swallows a missing provider: the handler quietly reports "I did not consume
 * this key", the D-pad falls through to default navigation, and on a screen
 * with nothing to the left the focus simply stops moving. That is how a broken
 * provider stayed invisible across seven pages — the symptom on a TV is a
 * remote that seems to ignore Left, with nothing in the console.
 *
 * Routing every page through here keeps the `?? false` fallback (a dead end is
 * still better than a crash in front of a viewer) but makes the cause loud, so
 * the next wiring mistake announces itself instead of hiding.
 */
export function useSidebarExit(): () => boolean {
  const controller = useLayoutFocus();

  if (!controller) {
    logger.error(
      "LayoutFocusContext is missing — this page renders outside MainLayout's provider, " +
        "so every 'back to the sidebar' handler on it is a no-op and the D-pad will appear stuck.",
    );
  }

  return () => controller?.focusSidebar() ?? false;
}
