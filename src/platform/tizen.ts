import { getTizen } from "./runtime";

export function exitCurrentApp(): boolean {
  const tizen = getTizen();
  if (!tizen?.application) {
    return false;
  }

  tizen.application.getCurrentApplication().exit();
  return true;
}

export function addForegroundResumeListener(handler: () => void): () => void {
  if (typeof document === "undefined") {
    return () => {};
  }

  let wasHidden = false;

  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      wasHidden = true;
      return;
    }

    if (wasHidden && document.visibilityState === "visible") {
      wasHidden = false;
      handler();
    }
  };

  document.addEventListener("visibilitychange", onVisibility);

  const app = getTizen()?.application?.getCurrentApplication();
  try {
    app?.addEventListener?.("appcontrol", handler);
  } catch {
    // Older firmware can omit the appcontrol hook.
  }

  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    try {
      app?.removeEventListener?.("appcontrol", handler);
    } catch {
      // Older firmware can omit the appcontrol hook.
    }
  };
}
