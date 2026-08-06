import type { ElementNode } from "@solidtv/solid";
import { describe, expect, it } from "vitest";
import { isElementAttached } from "./focus";

interface FakeNode {
  children: FakeNode[];
  parent?: FakeNode;
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
