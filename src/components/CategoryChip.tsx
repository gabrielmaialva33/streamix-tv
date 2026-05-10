import {
  type IntrinsicNodeStyleProps,
  type IntrinsicTextNodeStyleProps,
  Text,
  View,
} from "@lightningtv/solid";
import { theme } from "@/styles";

// Static shape — Lightning applies `style` once on mount and `$focus` reverts
// to the listed properties. Reactive values (color/border) live as JSX props.
const CHIP_STYLE = {
  height: 38,
  borderRadius: 8,
  scale: 1,
  transition: {
    color: { duration: 150, easing: "ease-out" },
    scale: { duration: 150, easing: "ease-out" },
  },
  $focus: {
    color: 0x2a0f14ff,
    scale: 1.04,
  },
} satisfies IntrinsicNodeStyleProps;

const CHIP_TEXT_STYLE = {
  fontSize: 16,
  color: 0xffffffff,
  y: 10,
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
      color={props.active ? theme.primary : 0x1b1c24ee}
      border={{
        color: props.active ? 0xff454dff : 0xffffff12,
        width: 1,
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
