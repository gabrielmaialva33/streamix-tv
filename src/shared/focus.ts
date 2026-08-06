import type { ElementNode } from "@solidtv/solid";

/**
 * SolidTV keeps parent pointers on nodes after a conditional subtree is
 * removed. Walk the full ancestry and verify every membership before trying
 * to restore focus to a remembered node.
 */
export function isElementAttached(element?: ElementNode): element is ElementNode {
  if (!element?.parent) return false;

  let current: ElementNode = element;
  let parent = current.parent;

  while (parent) {
    if (!parent.children.includes(current)) return false;
    current = parent;
    parent = current.parent;
  }

  return true;
}
