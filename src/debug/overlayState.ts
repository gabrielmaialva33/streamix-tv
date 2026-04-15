import { createSignal } from "solid-js";

export const isDebugOverlayEnabled =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG_OVERLAY === "true";

const [isDebugOverlayVisible, setDebugOverlayVisible] = createSignal(false);

export { isDebugOverlayVisible };

export function toggleDebugOverlay() {
  if (!isDebugOverlayEnabled) {
    return;
  }

  setDebugOverlayVisible(visible => !visible);
}

export function hideDebugOverlay() {
  setDebugOverlayVisible(false);
}
