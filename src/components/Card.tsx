import {
  type IntrinsicNodeStyleProps,
  type IntrinsicTextNodeStyleProps,
  type NodeProps,
  Text,
  View,
} from "@lightningtv/solid";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { radialGlowTexture } from "@/lib/gradientTexture";
import { cssRgb, theme } from "@/styles";

// Soft red halo behind the focused card. One shared 128px texture stretched
// per card; alpha 0 nodes are skipped by the renderer so idle cards are free.
const cardGlow = radialGlowTexture(cssRgb.primary, 0.55);

const CardGlowStyle = {
  color: 0xffffffff,
  alpha: 0,
  zIndex: 0,
  transition: {
    alpha: { duration: 200, easing: "ease-out" },
  },
  $focus: {
    alpha: 1,
  },
} satisfies IntrinsicNodeStyleProps;

// Card image container (also used by the placeholder) - subtle border that
// highlights on focus.
const CardImageStyle = {
  borderRadius: 8,
  color: theme.surfaceMuted,
  border: { color: theme.panelBorder, width: 1 },
  transition: {
    scale: { duration: 150, easing: "ease-out" },
  },
  scale: 1,
  zIndex: 1,
  $focus: {
    border: { color: theme.primary, width: 3 },
    scale: 1.04,
    zIndex: 30,
  },
} satisfies IntrinsicNodeStyleProps;

// Title style - transitions to white on focus
const CardTitleStyle = {
  fontSize: 17,
  color: theme.textSecondary,
  contain: "width",
  maxLines: 1,
  $focus: {
    color: theme.textPrimary,
  },
} satisfies IntrinsicTextNodeStyleProps;

// Subtitle style
const SubtitleStyle = {
  fontSize: 14,
  color: theme.textMuted,
  contain: "width",
  maxLines: 1,
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
  imageDelay?: number;
  item?: CardItem;
}

const Card = (props: CardProps) => {
  const width = props.width || 240;
  const height = props.height || 360;
  const infoHeight = props.subtitle ? 56 : 44;
  const placeholderInitial = () => (props.title.trim().charAt(0).toUpperCase() || "?").slice(0, 1);

  // Track image errors only
  const [imageError, setImageError] = createSignal(false);
  const [imageReady, setImageReady] = createSignal(!props.imageUrl || !props.imageDelay);

  // Show placeholder only if no image or error
  const showPlaceholder = () => !props.imageUrl || !imageReady() || imageError();

  createEffect(() => {
    const imageUrl = props.imageUrl;
    const delay = props.imageDelay || 0;
    setImageError(false);
    if (!imageUrl || delay <= 0) {
      setImageReady(!!imageUrl);
      return;
    }

    setImageReady(false);
    const timer = setTimeout(() => setImageReady(true), delay);
    onCleanup(() => clearTimeout(timer));
  });

  return (
    <View {...props} width={width} height={height + infoHeight} item={props.item} forwardStates>
      {/* Focus glow halo behind the image */}
      <Show when={cardGlow}>
        <View
          x={-32}
          y={-32}
          width={width + 64}
          height={height + 64}
          src={cardGlow}
          style={CardGlowStyle}
          skipFocus
        />
      </Show>

      {/* Card Image with border - show when image URL exists and no error */}
      <Show when={props.imageUrl && imageReady() && !imageError()}>
        <View
          src={props.imageUrl}
          width={width}
          height={height}
          color={0xffffffff}
          style={CardImageStyle}
          textureOptions={{ resizeMode: { type: "cover", clipX: 0.5, clipY: 0.15 } }}
          onEvent={{
            failed: () => setImageError(true),
            loaded: () => setImageError(false),
          }}
        />
      </Show>

      {/* Placeholder - shown when no image, loading, or error */}
      <Show when={showPlaceholder()}>
        <View width={width} height={height} style={CardImageStyle}>
          <View
            x={width / 2 - 38}
            y={height / 2 - 38}
            width={76}
            height={76}
            color={theme.surfaceLight}
            borderRadius={38}
            display="flex"
            justifyContent="center"
            alignItems="center"
          >
            <Text fontSize={34} fontWeight={700} color={theme.textMuted}>
              {placeholderInitial()}
            </Text>
          </View>
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
