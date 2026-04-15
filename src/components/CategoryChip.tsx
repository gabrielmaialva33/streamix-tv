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
  height: 40,
  borderRadius: 20,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  scale: 1,
  transition: {
    color: { duration: 150, easing: "ease-out" },
    scale: { duration: 150, easing: "ease-out" },
  },
  $focus: {
    color: theme.primary,
    scale: 1.08,
  },
} satisfies IntrinsicNodeStyleProps;

const CHIP_TEXT_STYLE = {
  fontSize: 16,
  color: 0xffffffff,
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
      color={props.active ? 0x3a1118ff : 0x222222ff}
      border={{
        color: props.active ? theme.primary : 0x00000000,
        width: props.active ? 2 : 0,
      }}
      onEnter={() => {
        props.onSelect();
        return true;
      }}
    >
      <Text style={CHIP_TEXT_STYLE} width={width() - 16}>
        {props.label}
      </Text>
    </View>
  );
};

export default CategoryChip;
