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

/**
 * Move focus only when the target still belongs to the rendered tree.
 *
 * SolidTV applies focus in a deferred mutation pass. Calling `setFocus()` on
 * an old ref therefore looks successful to the caller, but leaves the remote
 * on a node that can no longer paint its focus state. Directional handlers can
 * return this value directly and only consume the key after a real target was
 * found.
 */
export function focusElement(element?: ElementNode): boolean {
  if (!isElementAttached(element) || element.skipFocus) return false;

  element.setFocus();
  return true;
}
