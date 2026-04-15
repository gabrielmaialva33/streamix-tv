import {
  ElementNode,
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
  border: { color: 0x00000000, width: 2 },
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  transition: {
    color: { duration: 150 },
    scale: { duration: 150 },
  },
  scale: 1,
  $focus: {
    color: 0xffffffff,
    border: { color: 0xffffffff, width: 2 },
    scale: 1.04,
  },
} satisfies IntrinsicNodeStyleProps;

const InfoButtonStyle = {
  width: 160,
  height: 50,
  color: 0x555555ff,
  borderRadius: 8,
  border: { color: theme.border, width: 2 },
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  transition: {
    color: { duration: 150 },
    scale: { duration: 150 },
  },
  scale: 1,
  $focus: {
    color: 0xffffffff,
    border: { color: theme.primaryLight, width: 2 },
    scale: 1.04,
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
  /** Called when the user presses Down on the hero action row. */
  onDownRequest?: () => boolean;
}

function heroBackdrop(item?: FeaturedItem) {
  return item?.backdrop?.[0] || item?.backdrop_url || item?.poster_url || item?.poster || undefined;
}

function heroMeta(item?: FeaturedItem) {
  if (!item) {
    return [];
  }

  return [
    item.year ? String(item.year) : null,
    item.rating ? `${item.rating.toFixed(1)} IMDb` : null,
    item.genre || null,
    item.type === "movie"
      ? "Filme"
      : item.type === "series"
        ? "Série"
        : item.type === "channel"
          ? "Canal"
          : null,
  ].filter(Boolean) as string[];
}

const Hero = (props: HeroProps) => {
  let playButton: ElementNode | undefined;
  let infoButton: ElementNode | undefined;

  return (
    <View
      {...props}
      width={CONTENT_WIDTH}
      height={600}
      forwardFocus={() => {
        playButton?.setFocus();
        return true;
      }}
    >
      <Show when={heroBackdrop(props.item)}>
        <View
          x={0}
          y={0}
          src={heroBackdrop(props.item)}
          color={0xffffffff}
          width={CONTENT_WIDTH}
          height={600}
          borderRadius={16}
          textureOptions={{ resizeMode: { type: "cover", clipX: 0.5, clipY: 0.28 } }}
          zIndex={0}
        />
      </Show>

      <Show when={heroBackdrop(props.item)}>
        <View
          x={0}
          y={0}
          width={CONTENT_WIDTH}
          height={600}
          borderRadius={16}
          shader={{
            type: "linearGradient",
            colors: [0x06070dff, 0x06070de8, 0x06070d44],
            angle: 0,
          }}
          zIndex={1}
        />
      </Show>

      <Show when={heroBackdrop(props.item)}>
        <View
          x={0}
          y={0}
          width={CONTENT_WIDTH}
          height={600}
          borderRadius={16}
          shader={{
            type: "linearGradient",
            colors: [0x06070d00, 0x06070d88, 0x06070dff],
            angle: 180,
          }}
          zIndex={1}
        />
      </Show>

      <Show when={!heroBackdrop(props.item)}>
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

      <View
        x={SAFE_AREA_X + 12}
        y={168}
        width={820}
        height={336}
        color={0x0b0c12d8}
        borderRadius={24}
        border={{ color: 0x20232eff, width: 1 }}
        zIndex={2}
        skipFocus
      />

      <View x={SAFE_AREA_X + 44} y={200} width={748} zIndex={3} skipFocus>
        <Show when={heroMeta(props.item).length > 0}>
          <View y={0} width={748} height={36} skipFocus>
            <Show when={heroMeta(props.item)[0]}>
              <Text fontSize={18} color={0xffd166ff} maxLines={1}>
                {heroMeta(props.item).join(" • ")}
              </Text>
            </Show>
          </View>
        </Show>

        <Text
          fontSize={56}
          fontWeight={700}
          color={0xffffffff}
          contain="width"
          width={748}
          textOverflow="ellipsis"
          maxLines={2}
          y={heroMeta(props.item).length > 0 ? 38 : 0}
        >
          {props.item?.title || "Bem-vindo ao Streamix"}
        </Text>

        <Show when={props.item?.description || props.item?.plot}>
          <Text
            y={heroMeta(props.item).length > 0 ? 172 : 138}
            fontSize={23}
            color={0xe7e7ecff}
            contain="both"
            width={700}
            textOverflow="ellipsis"
            maxLines={3}
            lineHeight={33}
          >
            {props.item?.description || props.item?.plot}
          </Text>
        </Show>

        <View y={heroMeta(props.item).length > 0 ? 286 : 252} display="flex" gap={20}>
          <View
            ref={playButton}
            style={PlayButtonStyle}
            forwardStates
            autofocus
            onEnter={() => {
              props.onPlay?.();
              return true;
            }}
            onRight={() => {
              infoButton?.setFocus();
              return true;
            }}
            onDown={props.onDownRequest}
          >
            <Text style={PlayButtonTextStyle}>Assistir</Text>
          </View>

          <View
            ref={infoButton}
            style={InfoButtonStyle}
            forwardStates
            onEnter={() => {
              props.onInfo?.();
              return true;
            }}
            onLeft={() => {
              playButton?.setFocus();
              return true;
            }}
            onDown={props.onDownRequest}
          >
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
