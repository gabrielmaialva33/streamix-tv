import { createContext, useContext } from "solid-js";

export interface LayoutFocusController {
  focusSidebar: () => boolean;
}

export const LayoutFocusContext = createContext<LayoutFocusController>();

export function useLayoutFocus(): LayoutFocusController | undefined {
  return useContext(LayoutFocusContext);
}
