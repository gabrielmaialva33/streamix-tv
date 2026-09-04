import { createLogger } from "@/shared/logging/logger";

const logger = createLogger("BackKey");

/**
 * Ask the focus tree to handle a Back press, and report whether anything did.
 *
 * The runtime gives no direct answer. `@solidtv/solid`'s focus manager listens
 * on `document` keydown, walks the focus path, and stops at the first handler
 * returning `true` — but it never calls `preventDefault()` and it discards the
 * result of its own propagation. So a DOM listener cannot ask "was that key
 * consumed?", which is precisely what the Android Back button needs to know
 * before deciding whether to also pop the route.
 *
 * `AppShell` is the one element above every route, so its handler runs last in
 * the bubble phase and only when nothing below claimed the key. That turns
 * "did Back reach the root" into the missing signal.
 *
 * The alternative — having each `onBack` mark the event itself — is the shape
 * this replaces: it was applied at two of twelve handlers, and the ten that
 * forgot ran their action *and* a route pop, so closing a dialog also threw the
 * viewer onto whatever page history happened to hold.
 */
let reachedRoot = false;

/** Called by `AppShell`, the root the key only reaches when unhandled. */
export function noteBackReachedRoot(): void {
  reachedRoot = true;
}

/**
 * Synthesise the Back keydown the focus manager expects and return `true` when
 * no page handled it.
 *
 * Escape (27) is what the device keymaps bind Back to, on Android through
 * `devices/firetv` and in the browser through the shared default.
 */
export function dispatchBackKey(): boolean {
  reachedRoot = false;

  const event = new KeyboardEvent("keydown", {
    key: "Escape",
    code: "Escape",
    keyCode: 27,
    which: 27,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);

  // A handler that marks the event is honoured too, so the older convention
  // keeps working wherever it is still spelled out.
  const unhandled = reachedRoot && !event.defaultPrevented;
  logger.debug("Back key dispatched", { unhandled, hash: location.hash });
  return unhandled;
}
