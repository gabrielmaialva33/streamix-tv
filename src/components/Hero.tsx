import {
  type IntrinsicNodeStyleProps,
  type IntrinsicTextNodeStyleProps,
  type NodeProps,
  Text,
  View,
} from "@lightningtv/solid";
import { Show } from "solid-js";
import type { FeaturedItem } from "../lib/api";
import { CONTENT_WIDTH, SAFE_AREA_X, SAFE_AREA_Y } from "../shared/layout";
import { theme } from "../styles";

// Hero button styles with $focus
const PlayButtonStyle = {
  width: 160,
  height: 50,
  color: theme.primary,
  borderRadius: 8,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  transition: {
    color: { duration: 150 },
  },
  $focus: {
    color: 0xffffffff,
  },
} satisfies IntrinsicNodeStyleProps;

const InfoButtonStyle = {
  width: 160,
  height: 50,
  color: 0x555555ff,
  borderRadius: 8,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  transition: {
    color: { duration: 150 },
  },
  $focus: {
    color: 0xffffffff,
  },
} satisfies IntrinsicNodeStyleProps;

const PlayButtonTextStyle = {
  fontSize: 22,
  fontWeight: 700,
  color: 0xffffffff,
  $focus: {
    color: 0x000000ff,
  },
} satisfies IntrinsicTextNodeStyleProps;

const InfoButtonTextStyle = {
  fontSize: 22,
  fontWeight: 700,
  color: 0xffffffff,
  $focus: {
    color: 0x000000ff,
  },
} satisfies IntrinsicTextNodeStyleProps;

export interface HeroProps extends NodeProps {
  item?: FeaturedItem;
  onPlay?: () => void;
  onInfo?: () => void;
}

const Hero = (props: HeroProps) => {
  return (
    <View {...props} width={CONTENT_WIDTH} height={600}>
      <Show when={props.item?.backdrop_url}>
        <View
          x={0}
          y={0}
          src={props.item!.backdrop_url}
          color={0xffffffff}
          width={CONTENT_WIDTH}
          height={600}
          borderRadius={16}
          zIndex={0}
        />
      </Show>

      <Show when={props.item?.backdrop_url}>
        <View
          x={0}
          y={0}
          width={CONTENT_WIDTH}
          height={600}
          borderRadius={16}
          color={0x000000aa}
          zIndex={1}
        />
      </Show>

      <Show when={!props.item?.backdrop_url}>
        <View
          x={0}
          y={0}
          width={CONTENT_WIDTH}
          height={600}
          borderRadius={16}
          color={0x1a1a2eff}
          zIndex={0}
        />
      </Show>

      <View x={SAFE_AREA_X + 12} y={300} width={800} zIndex={2}>
        <Text
          fontSize={56}
          fontWeight={700}
          color={0xffffffff}
          contain="width"
          width={800}
          textOverflow="ellipsis"
          maxLines={2}
        >
          {props.item?.title || "Bem-vindo ao Streamix"}
        </Text>

        <Show when={props.item?.description}>
          <Text
            y={140}
            fontSize={24}
            color={0xccccccff}
            contain="width"
            width={700}
            textOverflow="ellipsis"
            maxLines={3}
            lineHeight={36}
          >
            {props.item!.description}
          </Text>
        </Show>

        <View y={260} display="flex" gap={20}>
          <View style={PlayButtonStyle} forwardStates onEnter={props.onPlay}>
            <Text style={PlayButtonTextStyle}>Assistir</Text>
          </View>

          <View x={180} style={InfoButtonStyle} forwardStates onEnter={props.onInfo}>
            <Text style={InfoButtonTextStyle}>Detalhes</Text>
          </View>
        </View>
      </View>

      <Show when={props.item?.type}>
        <View
          x={CONTENT_WIDTH - 160}
          y={SAFE_AREA_Y}
          width={120}
          height={36}
          color={0xe5091499}
          borderRadius={18}
          display="flex"
          justifyContent="center"
          alignItems="center"
          zIndex={2}
        >
          <Text fontSize={16} fontWeight={700} color={0xffffffff}>
            {props.item!.type.toUpperCase()}
          </Text>
        </View>
      </Show>
    </View>
  );
};

export default Hero;
