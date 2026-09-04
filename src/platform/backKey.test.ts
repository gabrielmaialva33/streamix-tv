import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchBackKey, noteBackReachedRoot } from "./backKey";

const listeners: Array<(event: KeyboardEvent) => void> = [];

/** Stand in for a focus-path handler that sees the synthetic Back keydown. */
function onBackKey(handler: (event: KeyboardEvent) => void): void {
  const listener = handler as EventListener;
  listeners.push(handler);
  document.addEventListener("keydown", listener);
}

afterEach(() => {
  while (listeners.length > 0) {
    document.removeEventListener("keydown", listeners.pop() as unknown as EventListener);
  }
});

describe("dispatchBackKey", () => {
  it("reports the press as unhandled once it reaches the root", () => {
    // AppShell sits above every route, so reaching it means no page claimed it.
    onBackKey(() => noteBackReachedRoot());
    expect(dispatchBackKey()).toBe(true);
  });

  it("reports the press as handled when it never reaches the root", () => {
    // A page consumed it: the focus manager stops before AppShell's handler.
    expect(dispatchBackKey()).toBe(false);
  });

  it("does not carry a previous press's verdict into the next one", () => {
    onBackKey(() => noteBackReachedRoot());
    expect(dispatchBackKey()).toBe(true);

    document.removeEventListener("keydown", listeners.pop() as unknown as EventListener);
    expect(dispatchBackKey()).toBe(false);
  });

  it("still honours a handler that marks the event itself", () => {
    // The convention this replaces, kept working for any handler spelling it out.
    onBackKey(event => {
      noteBackReachedRoot();
      event.preventDefault();
    });
    expect(dispatchBackKey()).toBe(false);
  });

  it("sends the key the device keymaps bind Back to", () => {
    const seen = vi.fn();
    onBackKey(event => {
      seen({ key: event.key, keyCode: event.keyCode, cancelable: event.cancelable });
      noteBackReachedRoot();
    });

    dispatchBackKey();

    expect(seen).toHaveBeenCalledWith({ key: "Escape", keyCode: 27, cancelable: true });
  });
});
