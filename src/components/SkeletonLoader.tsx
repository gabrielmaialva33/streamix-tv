import { type NodeProps, View } from "@lightningtv/solid";
import { createSignal, onCleanup, onMount } from "solid-js";
import { theme } from "@/styles";

export interface SkeletonLoaderProps extends NodeProps {
  width?: number;
  height?: number;
  borderRadius?: number;
}

/**
 * Skeleton Loader - Animated placeholder while content loads
 * Uses alpha pulse animation for visual feedback
 */
const SkeletonLoader = (props: SkeletonLoaderProps) => {
  const [alpha, setAlpha] = createSignal(0.26);
  let animationFrame: number;
  let startTime: number;

  onMount(() => {
    startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = (Math.sin(elapsed / 750) + 1) / 2;
      setAlpha(0.24 + progress * 0.22);
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
  });

  onCleanup(() => {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
  });

  return (
    <View
      {...props}
      width={props.width || 240}
      height={props.height || 360}
      color={theme.surfaceLight}
      alpha={alpha()}
      borderRadius={props.borderRadius || 12}
    />
  );
};

export default SkeletonLoader;
