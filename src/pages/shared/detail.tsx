// Shared building blocks for the Movie/Series detail pages: panel styles,
// the hero banner (backdrop + gradients + type badge) and the personalized
// "similar titles" fetcher with its public fallback.

import { type IntrinsicNodeStyleProps, Text, View } from "@solidtv/solid";
import { Row } from "@solidtv/solid/primitives";
import { createEffect, createSignal, Show } from "solid-js";
import api, { type SimilarContentItem } from "@/lib/api";
import type { RelatedItem } from "@/lib/contentMeta";
import { linearGradientTexture } from "@/lib/gradientTexture";
import { cssRgb, theme } from "@/styles";

// Canvas gradient textures for the banner overlays — the gradient shaders
// can't darken a transparent overlay View (additive blend), textures can.
// Diagonal shade inspired by the legacy player's 35° detail-page overlay.
const detailDiagonalShade = linearGradientTexture(
  [
    [0, `rgba(${cssRgb.heroShade}, 0.92)`],
    [0.45, `rgba(${cssRgb.heroShade}, 0.5)`],
    [0.75, `rgba(${cssRgb.heroShade}, 0.12)`],
    [1, `rgba(${cssRgb.heroShade}, 0)`],
  ],
  { width: 256, height: 64, from: [0, 1], to: [1, 0] },
);
const detailBottomFade = linearGradientTexture([
  [0, `rgba(${cssRgb.background}, 0)`],
  [0.6, `rgba(${cssRgb.background}, 0.4)`],
  [1, `rgba(${cssRgb.background}, 0.92)`],
]);

export const HERO_STYLE = {
  width: 1620,
  height: 260,
  borderRadius: 28,
} satisfies IntrinsicNodeStyleProps;

export const PANEL_STYLE = {
  color: theme.panel,
  borderRadius: 18,
  border: { color: theme.panelBorder, width: 1 },
} satisfies IntrinsicNodeStyleProps;

// Width/height differ per page (movie vs series CTA) and are passed as JSX props.
export const PRIMARY_BUTTON_STYLE = {
  borderRadius: 18,
  color: theme.primary,
  border: { color: theme.primary, width: 2 },
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  scale: 1,
  transition: {
    color: { duration: 150 },
    scale: { duration: 150 },
  },
  $focus: {
    color: theme.primaryLight,
    border: { color: 0xffffffff, width: 3 },
    scale: 1.03,
  },
} satisfies IntrinsicNodeStyleProps;

export const SECONDARY_BUTTON_STYLE = {
  borderRadius: 18,
  color: theme.surfaceLight,
  border: { color: theme.border, width: 2 },
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  $focus: {
    color: theme.surfaceHover,
    border: { color: theme.primary, width: 2 },
  },
} satisfies IntrinsicNodeStyleProps;

export const META_CHIP_STYLE = {
  height: 34,
  borderRadius: 8,
  color: theme.surfaceMuted,
  border: { color: theme.borderSubtle, width: 1 },
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
} satisfies IntrinsicNodeStyleProps;

export interface DetailOverviewProps {
  plot?: string | null;
  cast?: string | null;
  director?: string | null;
}

/**
 * Compact information band shared by movie and series details. Empty API
 * fields do not reserve space: recommendation content moves up instead of
 * leaving a large technical-looking panel on screen.
 */
export const DetailOverview = (props: DetailOverviewProps) => {
  const plot = () => props.plot?.trim() || "";
  const cast = () => props.cast?.trim() || "";
  const director = () => props.director?.trim() || "";
  const hasCredits = () => Boolean(cast() || director());
  const height = () => {
    if (!plot()) return cast() && director() ? 96 : 76;
    return hasCredits() ? 148 : 118;
  };

  return (
    <Show when={plot() || hasCredits()}>
      <View x={40} width={1620} height={height()} style={PANEL_STYLE} skipFocus>
        <Show when={plot()}>
          <Text x={30} y={20} fontSize={16} color={theme.textMuted}>
            Sinopse
          </Text>
          <Text
            x={30}
            y={48}
            width={hasCredits() ? 1010 : 1560}
            fontSize={20}
            lineHeight={28}
            color={theme.textPrimary}
            maxLines={hasCredits() ? 3 : 2}
            contain="width"
          >
            {plot()}
          </Text>
        </Show>

        <Show when={hasCredits()} fallback={null}>
          <Show
            when={plot()}
            fallback={
              <Row x={30} y={16} width={1560} height={60} gap={36} scroll="none" skipFocus>
                <Show when={cast()}>
                  <View width={762} height={60} skipFocus>
                    <Text fontSize={15} color={theme.textMuted}>
                      Elenco
                    </Text>
                    <Text
                      y={24}
                      width={762}
                      fontSize={19}
                      color={theme.textPrimary}
                      maxLines={1}
                      contain="width"
                    >
                      {cast()}
                    </Text>
                  </View>
                </Show>
                <Show when={director()}>
                  <View width={762} height={60} skipFocus>
                    <Text fontSize={15} color={theme.textMuted}>
                      Direção
                    </Text>
                    <Text
                      y={24}
                      width={762}
                      fontSize={19}
                      color={theme.textPrimary}
                      maxLines={1}
                      contain="width"
                    >
                      {director()}
                    </Text>
                  </View>
                </Show>
              </Row>
            }
          >
            <View x={1090} y={20} width={500} height={108} skipFocus>
              <Show when={cast()}>
                <Text fontSize={15} color={theme.textMuted}>
                  Elenco
                </Text>
                <Text y={22} width={500} fontSize={18} color={theme.textPrimary} maxLines={1} contain="width">
                  {cast()}
                </Text>
              </Show>
              <Show when={director()}>
                <Text y={cast() ? 60 : 0} fontSize={15} color={theme.textMuted}>
                  Direção
                </Text>
                <Text
                  y={cast() ? 82 : 22}
                  width={500}
                  fontSize={18}
                  color={theme.textPrimary}
                  maxLines={1}
                  contain="width"
                >
                  {director()}
                </Text>
              </Show>
            </View>
          </Show>
        </Show>
      </View>
    </Show>
  );
};

/**
 * Personalized recommendations first; on miss or error fall back to the
 * public similar-content endpoint. Always resolves (empty list on failure).
 */
export async function fetchSimilar(collection: "movies" | "series", id: string): Promise<RelatedItem[]> {
  try {
    const personalized = await api.getSimilarRecommendations(id, collection, 12);
    if (personalized.similar?.length) {
      return personalized.similar;
    }
  } catch {
    return api.getSimilarContent(collection, id, 12).catch(() => [] as SimilarContentItem[]);
  }

  return api.getSimilarContent(collection, id, 12).catch(() => [] as SimilarContentItem[]);
}

export interface DetailPosterProps {
  posterUrl?: string;
}

export const DetailPoster = (props: DetailPosterProps) => {
  return (
    <Show when={props.posterUrl}>
      <View
        x={40}
        y={320}
        width={188}
        height={282}
        src={props.posterUrl}
        color={0xffffffff}
        borderRadius={22}
        border={{ color: theme.panelBorder, width: 2 }}
        textureOptions={{ resizeMode: { type: "cover", clipX: 0.5, clipY: 0.15 } }}
      />
    </Show>
  );
};

export interface DetailHeroProps {
  backdropUrl?: string;
  /** Portrait poster, used as an ambient banner when no backdrop exists. */
  posterUrl?: string;
  /** Type badge shown on the top-right corner ("FILME" / "SÉRIE"). */
  badge: string;
  badgeWidth: number;
}

const DetailHero = (props: DetailHeroProps) => {
  // Many catalog entries have no backdrop, and TMDB backdrops occasionally
  // fail to load. Rather than leaving a dead black box, fall back to the
  // poster as an ambient banner (cover-cropped + heavily scrimmed below).
  const [backdropFailed, setBackdropFailed] = createSignal(false);
  createEffect(() => {
    // Re-arm the fallback whenever we navigate to a different title.
    void props.backdropUrl;
    setBackdropFailed(false);
  });
  const heroImage = () => (props.backdropUrl && !backdropFailed() ? props.backdropUrl : props.posterUrl);
  // A stretched portrait poster reads better pinned to its top third (faces)
  // than the backdrop's lower crop.
  const heroClipY = () => (props.backdropUrl && !backdropFailed() ? 0.28 : 0.12);

  return (
    <>
      <Show
        when={heroImage()}
        fallback={<View x={40} y={40} style={HERO_STYLE} color={theme.backgroundLight} />}
      >
        <View
          x={40}
          y={40}
          src={heroImage()}
          color={0xffffffff}
          style={HERO_STYLE}
          textureOptions={{ resizeMode: { type: "cover", clipX: 0.5, clipY: heroClipY() } }}
          onEvent={{ failed: () => setBackdropFailed(true) }}
        />
      </Show>
      <Show when={detailDiagonalShade}>
        <View x={40} y={40} src={detailDiagonalShade} color={0xffffffff} style={HERO_STYLE} />
      </Show>
      <Show when={detailBottomFade}>
        <View x={40} y={40} src={detailBottomFade} color={0xffffffff} style={HERO_STYLE} />
      </Show>

      <Show when={props.backdropUrl}>
        <View
          x={1632 - props.badgeWidth}
          y={58}
          width={props.badgeWidth}
          height={34}
          color={0xe50914dd}
          borderRadius={17}
          display="flex"
          justifyContent="center"
          alignItems="center"
          skipFocus
        >
          <Text fontSize={15} fontWeight={700} color={0xffffffff}>
            {props.badge}
          </Text>
        </View>
      </Show>
    </>
  );
};

export default DetailHero;
