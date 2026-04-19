import {
  type IntrinsicNodeStyleProps,
  type IntrinsicTextNodeStyleProps,
  type NodeProps,
  Text,
  View,
} from "@lightningtv/solid";
import { createSignal, Show } from "solid-js";
import { theme } from "@/styles";

// Card image container - subtle border that highlights on focus
const CardImageStyle = {
  borderRadius: 12,
  border: { color: theme.border, width: 2 },
  transition: {
    scale: { duration: 150, easing: "ease-out" },
  },
  scale: 1,
  $focus: {
    border: { color: theme.primary, width: 3 },
    scale: 1.03,
  },
} satisfies IntrinsicNodeStyleProps;

// Placeholder style for missing images
const PlaceholderStyle = {
  borderRadius: 12,
  color: theme.surface,
  border: { color: theme.border, width: 2 },
  transition: {
    scale: { duration: 150, easing: "ease-out" },
  },
  scale: 1,
  $focus: {
    border: { color: theme.primary, width: 3 },
    scale: 1.03,
  },
} satisfies IntrinsicNodeStyleProps;

// Title style - transitions to white on focus
const CardTitleStyle = {
  fontSize: 18,
  color: theme.textMuted,
  contain: "width",
  maxLines: 1,
  $focus: {
    color: theme.textPrimary,
  },
} satisfies IntrinsicTextNodeStyleProps;

// Subtitle style
const SubtitleStyle = {
  fontSize: 14,
  color: theme.textDisabled,
  $focus: {
    color: theme.textMuted,
  },
} satisfies IntrinsicTextNodeStyleProps;

export interface CardItem {
  id: string | number;
  type: "movie" | "series" | "channel";
  href?: string;
}

export interface CardProps extends NodeProps {
  title: string;
  imageUrl?: string;
  subtitle?: string;
  width?: number;
  height?: number;
  item?: CardItem;
}

const Card = (props: CardProps) => {
  const width = props.width || 240;
  const height = props.height || 360;
  const infoHeight = props.subtitle ? 56 : 44;

  // Track image errors only
  const [imageError, _setImageError] = createSignal(false);

  // Show placeholder only if no image or error
  const showPlaceholder = () => !props.imageUrl || imageError();

  return (
    <View {...props} width={width} height={height + infoHeight} item={props.item} forwardStates>
      {/* Card Image with border - show when image URL exists and no error */}
      <Show when={props.imageUrl && !imageError()}>
        <View src={props.imageUrl} width={width} height={height} color={0xffffffff} style={CardImageStyle} />
        <View
          y={height - 104}
          width={width}
          height={104}
          borderRadius={12}
          shader={{
            type: "linearGradient",
            colors: [0x00000000, 0x030305aa, 0x030305ff],
            angle: 180,
          }}
          skipFocus
        />
      </Show>

      {/* Placeholder - shown when no image, loading, or error */}
      <Show when={showPlaceholder()}>
        <View width={width} height={height} style={PlaceholderStyle}>
          {/* Icon placeholder */}
          <View
            x={width / 2 - 30}
            y={height / 2 - 30}
            width={60}
            height={60}
            color={theme.surfaceLight}
            borderRadius={30}
          />
        </View>
      </Show>

      {/* Card Title - below image */}
      <Text y={height + 8} width={width} style={CardTitleStyle}>
        {props.title}
      </Text>

      {/* Subtitle if provided */}
      <Show when={props.subtitle}>
        <Text y={height + 36} width={width} style={SubtitleStyle}>
          {props.subtitle}
        </Text>
      </Show>
    </View>
  );
};

export default Card;
