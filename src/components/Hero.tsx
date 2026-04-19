import {
  ElementNode,
  type IntrinsicNodeStyleProps,
  type IntrinsicTextNodeStyleProps,
  type NodeProps,
  Text,
  View,
} from "@lightningtv/solid";
import { createMemo, createResource, Show } from "solid-js";
import api, { type FeaturedItem, type Movie, type Series } from "../lib/api";
import { pickBackdrop, proxyBackdropUrl } from "../lib/imageUrl";
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

// TMDB-style URLs come in many flavors (`/t/p/w300/`, `w600_and_h900_bestv2`, etc.).
// Promote anything thumbnail-ish to original so the hero doesn't render upscaled jpegs.
function upgradeTmdbSize(url?: string) {
  if (!url) return url;
  return url.replace(/\/t\/p\/[^/]+\//, "/t/p/original/");
}

function pickBestBackdrop(list?: string[]) {
  if (!list?.length) return undefined;
  const original = list.find(u => u?.includes("/t/p/original/"));
  return upgradeTmdbSize(original ?? list[list.length - 1]);
}

// YouTube serves landscape 16:9 thumbnails for every video, so a movie's trailer
// is a reliable source of a real backdrop when the catalog only has posters.
function youtubeThumb(videoId?: string | null) {
  if (!videoId) return undefined;
  return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
}

function heroBackdrop(item?: FeaturedItem, detail?: Movie | Series | null) {
  // Prefer backend pre-sized variants first (no TMDB round trip on the TV).
  const preSized = pickBackdrop(detail) || pickBackdrop(item);
  if (preSized) return preSized;

  // Fall back: pick the nicest raw backdrop, then the trailer thumb, then the
  // poster. proxyBackdropUrl routes A4 scans through the resize proxy so the
  // hero texture stays within the TV's WebGL budget.
  const raw =
    pickBestBackdrop(detail?.backdrop) ||
    pickBestBackdrop(item?.backdrop) ||
    upgradeTmdbSize(item?.backdrop_url) ||
    youtubeThumb(detail?.youtube_trailer) ||
    upgradeTmdbSize(item?.poster_url) ||
    upgradeTmdbSize(item?.poster) ||
    undefined;
  return proxyBackdropUrl(raw);
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

  // Featured payload only carries one backdrop. Pull the full detail to surface
  // the rest of the TMDB backdrop array (and pick the best one).
  const detailKey = createMemo(() => {
    const item = props.item;
    if (!item?.id) return null;
    if (item.type === "movie" || item.type === "series") {
      return { id: item.id, type: item.type } as const;
    }
    return null;
  });

  const [detail] = createResource(detailKey, async key => {
    if (!key) return null;
    try {
      return key.type === "movie" ? await api.getMovie(key.id) : await api.getSeriesDetail(String(key.id));
    } catch {
      return null;
    }
  });

  const backdrop = createMemo(() => heroBackdrop(props.item, detail()));

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
      <Show when={backdrop()}>
        <View
          x={0}
          y={0}
          src={backdrop()}
          color={0xffffffff}
          width={CONTENT_WIDTH}
          height={600}
          borderRadius={16}
          textureOptions={{ resizeMode: { type: "cover", clipX: 0.5, clipY: 0.28 } }}
          zIndex={0}
        />
      </Show>

      <Show when={backdrop()}>
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

      <Show when={backdrop()}>
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

      <Show when={!backdrop()}>
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
                {heroMeta(props.item).join("  ·  ")}
              </Text>
            </Show>
          </View>
        </Show>

        {(() => {
          // Shrink the hero title to fit long names (e.g. "True Beauty: The
          // Movie - Part 2 [L]") within two lines without clipping. The 748px
          // panel fits roughly 16 chars at 56px, 22 at 46px, 28 at 38px.
          const title = () => props.item?.title || "Bem-vindo ao Streamix";
          const dynamicFontSize = () => {
            const len = title().length;
            if (len <= 24) return 56;
            if (len <= 36) return 46;
            return 38;
          };
          return (
            <Text
              fontSize={dynamicFontSize()}
              fontWeight={700}
              color={0xffffffff}
              contain="width"
              width={748}
              textOverflow="ellipsis"
              maxLines={2}
              y={heroMeta(props.item).length > 0 ? 38 : 0}
            >
              {title()}
            </Text>
          );
        })()}

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
