import { createRoot } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayoutFocusContext, useSidebarExit } from "./layoutFocus";

/**
 * These pin the contract that made a whole class of bug invisible.
 *
 * Every page's "Left goes back to the sidebar" handler resolves through this
 * hook. When the provider was accidentally out of scope the handlers all
 * became silent no-ops, so the D-pad looked frozen on any screen with nothing
 * to its left, and nothing said why.
 */

function renderWithProvider<T>(controller: { focusSidebar: () => boolean } | undefined, use: () => T): T {
  return createRoot(dispose => {
    let captured!: T;
    if (controller) {
      LayoutFocusContext.Provider({
        value: controller,
        get children() {
          captured = use();
          return null;
        },
      });
    } else {
      captured = use();
    }
    dispose();
    return captured;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSidebarExit", () => {
  it("delegates to the controller when the provider is in scope", () => {
    const focusSidebar = vi.fn(() => true);
    const exit = renderWithProvider({ focusSidebar }, useSidebarExit);

    expect(exit()).toBe(true);
    expect(focusSidebar).toHaveBeenCalledTimes(1);
  });

  it("reports the controller's refusal instead of claiming the key", () => {
    // focusSidebar returns false when the sidebar already holds focus; the
    // caller must be able to let the key fall through to default navigation.
    const exit = renderWithProvider({ focusSidebar: () => false }, useSidebarExit);
    expect(exit()).toBe(false);
  });

  it("logs an error when the provider is missing", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    renderWithProvider(undefined, useSidebarExit);

    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0])).toMatch(/LayoutFocusContext is missing/);
  });

  it("still returns a callable no-op when the provider is missing", () => {
    // A dead end is bad; throwing in front of a viewer is worse. The handler
    // has to stay callable and report that it did not consume the key.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = renderWithProvider(undefined, useSidebarExit);

    expect(exit()).toBe(false);
  });

  it("resolves the controller once, not on every keypress", () => {
    const focusSidebar = vi.fn(() => true);
    const exit = renderWithProvider({ focusSidebar }, useSidebarExit);

    exit();
    exit();
    exit();
    expect(focusSidebar).toHaveBeenCalledTimes(3);
  });
});
