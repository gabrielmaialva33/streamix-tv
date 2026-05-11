import { type NodeProps, View } from "@lightningtv/solid";
import { theme } from "@/styles";

export interface SkeletonLoaderProps extends NodeProps {
  width?: number;
  height?: number;
  borderRadius?: number;
}

const SkeletonLoader = (props: SkeletonLoaderProps) => {
  return (
    <View
      {...props}
      width={props.width || 240}
      height={props.height || 360}
      color={theme.surfaceLight}
      alpha={0.32}
      borderRadius={props.borderRadius || 12}
    />
  );
};

export default SkeletonLoader;
