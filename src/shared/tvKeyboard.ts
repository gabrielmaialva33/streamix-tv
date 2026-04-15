/**
 * Bridge to the platform on-screen keyboard (Samsung Tizen IME, webOS, etc.).
 *
 * Lightning renders to a WebGL canvas, so it cannot surface a real IME. We
 * keep a single hidden `<input>` in the DOM and focus it inside a user
 * event — that's the signal Tizen/webOS use to pop the native keyboard.
 *
 * Callers receive live input via `onInput` and a terminal `onSubmit` when
 * the user presses OK/Enter. `close()` blurs the input so Lightning can
 * resume receiving key events.
 */

export type TvKeyboardInputType = "text" | "email" | "password" | "number";

export interface TvKeyboardOptions {
  value: string;
  type?: TvKeyboardInputType;
  onInput: (value: string) => void;
  onSubmit?: (value: string) => void;
  onClose?: () => void;
}

let element: HTMLInputElement | null = null;
let activeOnClose: (() => void) | null = null;

function ensureElement(): HTMLInputElement {
  if (element) return element;

  const el = document.createElement("input");
  el.setAttribute("data-tv-keyboard", "");
  el.autocomplete = "off";
  el.spellcheck = false;
  // Off-canvas but still focusable so the platform opens the native IME.
  Object.assign(el.style, {
    position: "fixed",
    left: "-100px",
    top: "-100px",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
    zIndex: "9999",
    border: "none",
    outline: "none",
    background: "transparent",
  });

  document.body.appendChild(el);
  element = el;
  return el;
}

export function openTvKeyboard(opts: TvKeyboardOptions): void {
  const el = ensureElement();

  // Detach previous handlers so stale subscribers do not keep firing.
  el.oninput = null;
  el.onkeydown = null;
  el.onblur = null;

  el.type = opts.type ?? "text";
  el.value = opts.value ?? "";

  el.oninput = () => opts.onInput(el.value);

  el.onkeydown = event => {
    if (event.key === "Enter") {
      event.preventDefault();
      opts.onSubmit?.(el.value);
    }
  };

  activeOnClose = opts.onClose ?? null;
  el.onblur = () => {
    const cb = activeOnClose;
    activeOnClose = null;
    cb?.();
  };

  // Focus must happen inside the same tick as the user event so the platform
  // treats it as user-initiated and opens the IME.
  el.focus();
  try {
    el.setSelectionRange(el.value.length, el.value.length);
  } catch {
    // Some input types do not support selection — ignore.
  }
}

export function closeTvKeyboard(): void {
  element?.blur();
}

export function isTvKeyboardFocused(): boolean {
  return !!element && document.activeElement === element;
}
