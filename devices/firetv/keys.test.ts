import { describe, expect, it } from "vitest";
import { config } from "./index";

/**
 * The bindings `@solidtv/solid` ships before any device map is merged in
 * (`focusManager.ts`). `Escape` is the one that matters here: it is claimed by
 * default, so a device map that only names key *codes* leaves it in place.
 */
const LIBRARY_DEFAULTS: Record<string | number, string> = {
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowUp: "Up",
  ArrowDown: "Down",
  Enter: "Enter",
  Backspace: "Back",
  Escape: "Escape",
};

/** `flattenKeyMap`: every value of a binding becomes a lookup onto its name. */
function resolveKeyMap(): Record<string | number, string> {
  const entries: Record<string | number, string> = { ...LIBRARY_DEFAULTS };
  for (const [name, binding] of Object.entries(config.keys ?? {})) {
    for (const value of Array.isArray(binding) ? binding : [binding]) {
      entries[value as string | number] = name;
    }
  }
  return entries;
}

/** `propagateKeyPress`: the key name is tried before the numeric code. */
function eventFor(key: string, keyCode: number): string | undefined {
  const entries = resolveKeyMap();
  return entries[key] ?? entries[keyCode];
}

describe("Fire TV key map", () => {
  it("delivers the hardware Back button as Back", () => {
    // The Android bridge synthesises this exact press. Binding only the code
    // is not enough: the name is looked up first and the library already
    // claims "Escape", so the press would arrive as an Escape event that no
    // page listens for — Back would appear dead everywhere in the app.
    expect(eventFor("Escape", 27)).toBe("Back");
  });

  it("keeps the remote's other Back codes", () => {
    expect(eventFor("Backspace", 8)).toBe("Back");
    expect(eventFor("", 166)).toBe("Back");
  });

  it("leaves directional keys on their standard names", () => {
    expect(eventFor("ArrowLeft", 37)).toBe("Left");
    expect(eventFor("ArrowRight", 39)).toBe("Right");
    expect(eventFor("Enter", 13)).toBe("Enter");
  });
});
