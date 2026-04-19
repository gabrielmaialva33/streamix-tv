/**
 * Bridge to the platform on-screen keyboard (Samsung Tizen IME, webOS, etc.).
 *
 * Lightning renders to a WebGL canvas, so it cannot surface a real IME. We
 * mount a hidden `<input>` in the DOM and focus it inside a user event —
 * that's the signal Tizen/webOS use to pop the native keyboard.
 *
 * We CREATE A FRESH `<input>` per call (and dispose the previous one) because
 * the Tizen IME keeps internal state per DOM node. Reusing a single input
 * across fields leaks the previous session's buffer/type into the next one
 * — typing in "password" would still land in "email".
 *
 * Docs:
 *  - https://developer.samsung.com/smarttv/develop/guides/user-interaction/keyboardime.html
 *  - https://docs.tizen.org/application/web/guides/text-input/text-input/
 */

export type TvKeyboardInputType = "text" | "email" | "password" | "number";

export interface TvKeyboardOptions {
  value: string;
  type?: TvKeyboardInputType;
  onInput: (value: string) => void;
  onSubmit?: (value: string) => void;
  onClose?: () => void;
}

let activeInput: HTMLInputElement | null = null;
let activeOnClose: (() => void) | null = null;

const HIDDEN_STYLE = {
  position: "fixed",
  left: "-1000px",
  top: "-1000px",
  width: "1px",
  height: "1px",
  opacity: "0",
  pointerEvents: "none",
  zIndex: "9999",
  border: "none",
  outline: "none",
  background: "transparent",
} as const;

function destroyActive(): void {
  if (!activeInput) return;
  // Detach handlers BEFORE removing so a stray blur event during teardown
  // doesn't fire onClose again.
  activeInput.oninput = null;
  activeInput.onkeydown = null;
  activeInput.onblur = null;
  activeInput.remove();
  activeInput = null;
  activeOnClose = null;
}

export function openTvKeyboard(opts: TvKeyboardOptions): void {
  if (typeof document === "undefined") return;

  // Always tear down any previous input before creating a new one so the
  // Tizen IME starts from a clean state.
  destroyActive();

  const el = document.createElement("input");
  el.setAttribute("data-tv-keyboard", "");
  el.autocomplete = "off";
  el.spellcheck = false;
  el.type = opts.type ?? "text";
  el.value = opts.value ?? "";
  Object.assign(el.style, HIDDEN_STYLE);

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
    // The input has served its purpose — remove it so the next call gets
    // a pristine element (and the Tizen IME resets its buffer).
    el.remove();
    if (activeInput === el) activeInput = null;
  };

  document.body.appendChild(el);
  activeInput = el;

  // Focus must happen in the same user-event tick so the platform treats
  // it as user-initiated and opens the IME.
  el.focus();
  try {
    el.setSelectionRange(el.value.length, el.value.length);
  } catch {
    // Some input types (email, number) do not support selection — ignore.
  }
}

export function closeTvKeyboard(): void {
  if (!activeInput) return;
  activeInput.blur();
}

export function isTvKeyboardFocused(): boolean {
  return !!activeInput && document.activeElement === activeInput;
}
