// Shared building blocks for the Movie/Series detail pages: panel styles,
// the hero banner (backdrop + gradients + type badge) and the personalized
// "similar titles" fetcher with its public fallback.

import { type IntrinsicNodeStyleProps, Text, View } from "@lightningtv/solid";
import { Show } from "solid-js";
import api, { type SimilarContentItem } from "@/lib/api";
import type { RelatedItem } from "@/lib/contentMeta";
import { theme } from "@/styles";

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
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  $focus: {
    color: theme.primaryLight,
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
  /** Type badge shown on the top-right corner ("FILME" / "SÉRIE"). */
  badge: string;
  badgeWidth: number;
}

const DetailHero = (props: DetailHeroProps) => {
  return (
    <>
      <Show when={props.backdropUrl}>
        <View
          x={40}
          y={40}
          src={props.backdropUrl}
          style={HERO_STYLE}
          textureOptions={{ resizeMode: { type: "cover", clipX: 0.5, clipY: 0.28 } }}
        />
      </Show>
      <Show when={!props.backdropUrl}>
        <View x={40} y={40} style={HERO_STYLE} color={theme.backgroundLight} />
      </Show>
      <View
        x={40}
        y={40}
        style={HERO_STYLE}
        shader={{
          type: "linearGradient",
          colors: [0x07080eff, 0x07080ecc, 0x07080e22],
          angle: 0,
        }}
      />
      <View
        x={40}
        y={40}
        style={HERO_STYLE}
        shader={{
          type: "linearGradient",
          colors: [0x07080e00, 0x07080e77, 0x07080eff],
          angle: 180,
        }}
      />

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
