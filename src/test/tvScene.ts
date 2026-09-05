import { activeElement } from "@solidtv/solid";
import { isElementAttached } from "@/shared/focus";

interface SceneNode {
  id?: string;
  text?: string;
  route?: string;
  parent?: SceneNode;
  children?: SceneNode[];
  onEnter?: unknown;
  width?: number;
  height?: number;
  lng?: { absX?: number; absY?: number };
}

// Loaded only by browser tests, through Vite, so this reads the app's actual
// focus manager. Forwarded $focus styles on decorative children are not focus.
export function readScene() {
  const text = (node: SceneNode): string[] => [
    ...(typeof node.text === "string" ? [node.text] : []),
    ...(node.children ?? []).flatMap(text),
  ];
  const active = activeElement();
  const path: SceneNode[] = [];
  let node = active as SceneNode | undefined;
  while (node) {
    path.push(node);
    node = node.parent;
  }
  const labeled = path.find(item => text(item).length > 0);
  const button = path.find(item => typeof item.onEnter === "function");
  return {
    text: window.APP ? [...new Set(text(window.APP as SceneNode))] : [],
    focusIds: path.flatMap(item => (item.id ? [item.id] : [])),
    focusText: labeled ? [...new Set(text(labeled))].join(" ") : "",
    focusRoute: path.find(item => item.route)?.route ?? null,
    hasFocus: isElementAttached(active),
    buttonCenter: button
      ? {
          x: (button.lng?.absX ?? 0) + (button.width ?? 0) / 2,
          y: (button.lng?.absY ?? 0) + (button.height ?? 0) / 2,
        }
      : null,
  };
}
