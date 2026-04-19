import { createSignal } from "solid-js";

// Global counter bumped when the sidebar receives a click on the route the
// user is already on. Pages listen to it and reset scroll/focus to the top —
// otherwise "Início" on top of "Início" looks like a broken button.
const [tick, setTick] = createSignal(0);

export const navResetTick = tick;

export function bumpNavReset() {
  setTick(t => t + 1);
}
