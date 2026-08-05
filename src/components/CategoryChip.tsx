import { type IntrinsicNodeStyleProps, type IntrinsicTextNodeStyleProps, Text, View } from "@solidtv/solid";
import { theme } from "@/styles";

// Static shape — Lightning applies `style` once on mount and `$focus` reverts
// to the listed properties. Reactive values (color/border) live as JSX props.
const CHIP_STYLE = {
  height: 36,
  borderRadius: 7,
  scale: 1,
  transition: {
    color: { duration: 150, easing: "ease-out" },
    scale: { duration: 150, easing: "ease-out" },
  },
  $focus: {
    color: theme.surfaceActive,
    scale: 1.04,
  },
} satisfies IntrinsicNodeStyleProps;

const CHIP_TEXT_STYLE = {
  fontSize: 15,
  color: 0xffffffff,
  y: 8,
  textAlign: "center",
  contain: "width",
  maxLines: 1,
} satisfies IntrinsicTextNodeStyleProps;

export interface CategoryChipProps {
  label: string;
  active: boolean;
  onSelect: () => void;
  /** Override width — defaults to `max(100, label * 10 + 24)`. */
  width?: number;
}

const CategoryChip = (props: CategoryChipProps) => {
  const width = () => props.width ?? Math.max(100, props.label.length * 10 + 24);

  return (
    <View
      width={width()}
      style={CHIP_STYLE}
      color={props.active ? theme.surfaceActive : theme.surfaceMuted}
      border={{
        color: props.active ? theme.primary : theme.borderSubtle,
        width: props.active ? 2 : 1,
      }}
      onEnter={() => {
        props.onSelect();
        return true;
      }}
    >
      <Text x={8} style={CHIP_TEXT_STYLE} width={width() - 16}>
        {props.label}
      </Text>
    </View>
  );
};

export default CategoryChip;
