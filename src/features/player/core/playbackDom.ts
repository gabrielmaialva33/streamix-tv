interface PlaybackDomState {
  appStyle: string | null;
  rootStyle: string | null;
  bodyStyle: string | null;
  htmlStyle: string | null;
}

let savedDomState: PlaybackDomState | null = null;

function saveDomState() {
  if (savedDomState || typeof document === "undefined") {
    return;
  }

  savedDomState = {
    appStyle: document.getElementById("app")?.getAttribute("style") ?? null,
    rootStyle: document.getElementById("root")?.getAttribute("style") ?? null,
    bodyStyle: document.body.getAttribute("style"),
    htmlStyle: document.documentElement.getAttribute("style"),
  };
}

function setCanvasBlendMode(mode?: string) {
  const canvas = document.getElementById("app")?.querySelector("canvas");
  if (!(canvas instanceof HTMLElement)) {
    return;
  }

  if (mode) {
    canvas.style.mixBlendMode = mode;
  } else {
    canvas.style.removeProperty("mix-blend-mode");
  }
}

function restoreAttribute(element: HTMLElement | null, style: string | null | undefined) {
  if (!element) {
    return;
  }

  if (style === null || typeof style === "undefined") {
    element.removeAttribute("style");
    return;
  }

  element.setAttribute("style", style);
}

export function prepareDomForHtml5Playback() {
  if (typeof document === "undefined") {
    return;
  }

  saveDomState();

  // Video sits at z-index 0 behind the Lightning canvas so overlay UI
  // (title, scrub bar, hints) renders on top. No blend mode — `screen` was
  // erasing every dark color in the overlay (gradients, pill backgrounds).
  const appElement = document.getElementById("app");
  if (appElement) {
    appElement.style.cssText = `
      position: fixed !important;
      left: 0;
      top: 0;
      z-index: 100001 !important;
      pointer-events: none;
    `;
  }

  const rootElement = document.getElementById("root");
  if (rootElement) {
    rootElement.style.cssText = `
      position: absolute !important;
      z-index: 0 !important;
      pointer-events: none !important;
    `;
  }
}

export function prepareDomForAvplayPlayback() {
  if (typeof document === "undefined") {
    return;
  }

  saveDomState();

  // AVPlay draws to a native plane behind the WebView. Keep the Lightning
  // canvas visible (NOT hidden) so overlay UI is drawn on top — only the
  // page background goes transparent so the native video plane shows through.
  const appElement = document.getElementById("app");
  if (appElement) {
    appElement.style.cssText = `
      position: fixed !important;
      left: 0;
      top: 0;
      z-index: 100001 !important;
      pointer-events: none;
      background: transparent !important;
    `;
  }

  const rootElement = document.getElementById("root");
  if (rootElement) {
    rootElement.style.cssText = `
      position: absolute !important;
      z-index: 0 !important;
      pointer-events: none !important;
      background: transparent !important;
    `;
  }

  document.body.style.background = "transparent";
  document.documentElement.style.background = "transparent";
}

export function restorePlaybackDom() {
  if (!savedDomState || typeof document === "undefined") {
    return;
  }

  setCanvasBlendMode(undefined);
  restoreAttribute(document.getElementById("app"), savedDomState.appStyle);
  restoreAttribute(document.getElementById("root"), savedDomState.rootStyle);
  restoreAttribute(document.body, savedDomState.bodyStyle);
  restoreAttribute(document.documentElement, savedDomState.htmlStyle);
  savedDomState = null;
}
