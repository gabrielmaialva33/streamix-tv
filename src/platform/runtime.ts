export interface TizenApplicationHandle {
  exit(): void;
  addEventListener?(event: string, handler: () => void): void;
  removeEventListener?(event: string, handler: () => void): void;
}

export interface TizenGlobal {
  application?: {
    getCurrentApplication(): TizenApplicationHandle;
  };
  power?: {
    request(resource: string, state: string): void;
    release(resource: string): void;
  };
  tvinputdevice?: {
    registerKey(key: string): void;
  };
}

interface RuntimeWindow extends Window {
  tizen?: TizenGlobal;
}

export function getRuntimeWindow(): RuntimeWindow | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window as RuntimeWindow;
}

export function getTizen(): TizenGlobal | undefined {
  return getRuntimeWindow()?.tizen;
}

export function isTizenRuntime(): boolean {
  const runtimeWindow = getRuntimeWindow();
  if (!runtimeWindow) {
    return false;
  }

  return typeof runtimeWindow.tizen !== "undefined" || navigator.userAgent.includes("Tizen");
}

export function focusRuntimeWindow() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  window.focus();
  document.body.focus();
}
