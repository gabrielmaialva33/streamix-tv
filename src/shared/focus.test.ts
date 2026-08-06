import type { ElementNode } from "@solidtv/solid";
import { describe, expect, it, vi } from "vitest";
import { focusElement, isElementAttached } from "./focus";

interface FakeNode {
  children: FakeNode[];
  parent?: FakeNode;
  skipFocus?: boolean;
  setFocus?: () => void;
}

function connect(parent: FakeNode, child: FakeNode) {
  parent.children.push(child);
  child.parent = parent;
}

function asElement(node?: FakeNode) {
  return node as unknown as ElementNode | undefined;
}

describe("isElementAttached", () => {
  it("accepts a node whose full ancestry is mounted", () => {
    const root: FakeNode = { children: [] };
    const page: FakeNode = { children: [] };
    const grid: FakeNode = { children: [] };
    const card: FakeNode = { children: [] };
    connect(root, page);
    connect(page, grid);
    connect(grid, card);

    expect(isElementAttached(asElement(card))).toBe(true);
  });

  it("rejects a stale subtree even when its internal parent pointers remain", () => {
    const root: FakeNode = { children: [] };
    const page: FakeNode = { children: [] };
    const grid: FakeNode = { children: [] };
    const card: FakeNode = { children: [] };
    connect(root, page);
    connect(page, grid);
    connect(grid, card);

    page.children = [];

    expect(isElementAttached(asElement(card))).toBe(false);
  });

  it("rejects an orphaned node", () => {
    expect(isElementAttached(asElement({ children: [] }))).toBe(false);
  });
});

describe("focusElement", () => {
  it("focuses and consumes navigation only for an attached target", () => {
    const root: FakeNode = { children: [] };
    const button: FakeNode = { children: [], setFocus: vi.fn() };
    connect(root, button);

    expect(focusElement(asElement(button))).toBe(true);
    expect(button.setFocus).toHaveBeenCalledOnce();
  });

  it("does not consume navigation for stale or skipped targets", () => {
    const root: FakeNode = { children: [] };
    const stale: FakeNode = { children: [], setFocus: vi.fn() };
    const skipped: FakeNode = { children: [], setFocus: vi.fn(), skipFocus: true };
    connect(root, stale);
    connect(root, skipped);
    root.children = [skipped];

    expect(focusElement(asElement(stale))).toBe(false);
    expect(focusElement(asElement(skipped))).toBe(false);
    expect(stale.setFocus).not.toHaveBeenCalled();
    expect(skipped.setFocus).not.toHaveBeenCalled();
  });
});
