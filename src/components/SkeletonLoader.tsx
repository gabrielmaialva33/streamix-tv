import { type NodeProps, View } from "@lightningtv/solid";
import { createSignal, onCleanup, onMount } from "solid-js";
import { theme } from "@/styles";

export interface SkeletonLoaderProps extends NodeProps {
  width?: number;
  height?: number;
  borderRadius?: number;
}

const PULSE_LOW = 0.18;
const PULSE_HIGH = 0.4;
const PULSE_INTERVAL_MS = 850;

const SkeletonLoader = (props: SkeletonLoaderProps) => {
  // Gentle alpha pulse so loading placeholders read as "working", not frozen.
  const [pulseAlpha, setPulseAlpha] = createSignal(PULSE_LOW);

  onMount(() => {
    setPulseAlpha(PULSE_HIGH);
    const timer = setInterval(() => {
      setPulseAlpha(prev => (prev === PULSE_HIGH ? PULSE_LOW : PULSE_HIGH));
    }, PULSE_INTERVAL_MS);
    onCleanup(() => clearInterval(timer));
  });

  return (
    <View
      {...props}
      width={props.width || 240}
      height={props.height || 360}
      color={theme.surfaceLight}
      alpha={pulseAlpha()}
      transition={{ alpha: { duration: PULSE_INTERVAL_MS, easing: "ease-in-out" } }}
      borderRadius={props.borderRadius || 12}
    />
  );
};

export default SkeletonLoader;
