import { ElementNode, type IntrinsicNodeStyleProps, Text, View } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import { createResource, For, Show } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { Card, ContentRow, FavoriteButton, SkeletonLoader } from "@/components";
import api, { type Movie, type RecommendationItem, type SimilarContentItem } from "@/lib/api";
import { CONTENT_WIDTH, SAFE_AREA_X, SAFE_AREA_Y } from "@/shared/layout";
import { theme } from "@/styles";

const ACTION_BUTTON_STYLE = {
  width: 180,
  height: 56,
  borderRadius: 18,
  color: theme.primary,
  $focus: {
    color: theme.primaryLight,
  },
} satisfies IntrinsicNodeStyleProps;

const SECONDARY_ACTION_STYLE = {
  width: 180,
  height: 56,
  borderRadius: 18,
  color: theme.surfaceLight,
  border: { color: theme.border, width: 2 },
  $focus: {
    color: theme.surfaceHover,
    border: { color: theme.primary, width: 2 },
  },
} satisfies IntrinsicNodeStyleProps;

const META_CHIP_STYLE = {
  height: 36,
  borderRadius: 18,
  color: 0x12121aff,
  border: { color: 0x2c2d38ff, width: 1 },
} satisfies IntrinsicNodeStyleProps;

const INFO_PANEL_STYLE = {
  width: 1640,
  height: 280,
  color: 0x111118dd,
  borderRadius: 24,
  border: { color: 0x232330ff, width: 1 },
} satisfies IntrinsicNodeStyleProps;

function buildMeta(movie?: Movie) {
  if (!movie) {
    return [];
  }

  return [
    movie.year ? String(movie.year) : null,
    movie.rating ? `${movie.rating.toFixed(1)} IMDb` : null,
    movie.duration || null,
    movie.content_rating || null,
    movie.genre || null,
  ].filter(Boolean) as string[];
}

function backdropFor(movie?: Movie) {
  return movie?.backdrop?.[0] || movie?.backdrop_url || movie?.poster_url || movie?.poster || undefined;
}

type RelatedMovie = SimilarContentItem | RecommendationItem;

function relatedPoster(item: RelatedMovie) {
  return item.poster || (Array.isArray(item.backdrop) ? item.backdrop[0] : item.backdrop) || undefined;
}

function relatedSubtitle(item: RelatedMovie) {
  return [item.year ? String(item.year) : null, item.rating ? `${item.rating.toFixed(1)} IMDb` : null]
    .filter(Boolean)
    .join(" • ");
}

const MovieDetail = () => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();

  let actionRow: ElementNode | undefined;
  let relatedRow: ElementNode | undefined;

  const [movie] = createResource(
    () => params.id,
    id => api.getMovie(id),
  );
  const [similar] = createResource(
    () => params.id,
    async id => {
      try {
        const personalized = await api.getSimilarRecommendations(id, "movies", 12);
        if (personalized.similar?.length) {
          return personalized.similar;
        }
      } catch {
        // Fall back to public similarity below.
      }

      return api.getSimilarContent("movies", id, 12).catch(() => [] as SimilarContentItem[]);
    },
  );

  function handleBack() {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/movies");
    }
    return true;
  }

  return (
    <View
      width={CONTENT_WIDTH}
      height={1080}
      color={theme.background}
      onBack={handleBack}
      onLast={handleBack}
    >
      <Show when={movie.loading}>
        <View x={20} y={20} width={1640} height={980} skipFocus>
          <SkeletonLoader width={1640} height={440} borderRadius={24} />
          <SkeletonLoader width={1640} height={260} y={470} borderRadius={24} />
          <SkeletonLoader width={1640} height={200} y={760} borderRadius={24} />
        </View>
      </Show>

      <Show when={movie()}>
        {currentMovie => (
          <>
            <View
              x={20}
              y={20}
              width={1640}
              height={430}
              src={backdropFor(currentMovie())}
              color={0xffffffff}
              borderRadius={26}
              textureOptions={{ resizeMode: { type: "cover", clipX: 0.5, clipY: 0.35 } }}
            />
            <View
              x={20}
              y={20}
              width={1640}
              height={430}
              borderRadius={26}
              shader={{
                type: "linearGradient",
                colors: [0x09090dff, 0x09090dbb, 0x09090d22],
                angle: 0,
              }}
            />
            <View
              x={20}
              y={20}
              width={1640}
              height={430}
              borderRadius={26}
              shader={{
                type: "linearGradient",
                colors: [0x09090d00, 0x09090d55, 0x09090dff],
                angle: 180,
              }}
            />

            <View x={SAFE_AREA_X + 40} y={SAFE_AREA_Y + 40} width={920} zIndex={10} skipFocus>
              <Show when={currentMovie().tagline}>
                <Text fontSize={20} color={0xffd166ff} maxLines={1}>
                  {currentMovie().tagline || ""}
                </Text>
              </Show>
              <Text
                y={currentMovie().tagline ? 34 : 0}
                width={900}
                fontSize={62}
                fontWeight={700}
                color={0xffffffff}
                maxLines={2}
                contain="width"
              >
                {currentMovie().title || currentMovie().name}
              </Text>

              <Row y={currentMovie().tagline ? 176 : 142} width={900} height={36} gap={12} scroll="none">
                <For each={buildMeta(currentMovie())}>
                  {item => (
                    <View
                      width={Math.max(120, item.length * 12 + 32)}
                      style={META_CHIP_STYLE}
                      display="flex"
                      justifyContent="center"
                      alignItems="center"
                    >
                      <Text fontSize={16} color={0xffffffff}>
                        {item}
                      </Text>
                    </View>
                  )}
                </For>
              </Row>

              <Text
                y={currentMovie().tagline ? 236 : 202}
                width={760}
                fontSize={22}
                lineHeight={32}
                color={0xe2e2e8ff}
                maxLines={4}
                contain="width"
              >
                {currentMovie().plot || "Sem sinopse disponível para este filme."}
              </Text>
            </View>

            <View x={30} y={472} width={1640} height={608} clipping forwardFocus={0}>
              <Show when={currentMovie().poster_url || currentMovie().poster}>
                <View
                  x={1370}
                  y={-118}
                  width={220}
                  height={330}
                  src={currentMovie().poster_url || currentMovie().poster}
                  color={0xffffffff}
                  borderRadius={22}
                  border={{ color: 0x2d2d38ff, width: 2 }}
                  textureOptions={{ resizeMode: { type: "cover", clipX: 0.5, clipY: 0.15 } }}
                  zIndex={12}
                />
              </Show>

              <View y={52} style={INFO_PANEL_STYLE}>
                <Row
                  ref={actionRow}
                  x={28}
                  y={28}
                  width={1120}
                  height={58}
                  gap={18}
                  scroll="none"
                  autofocus
                  onDown={() => {
                    relatedRow?.setFocus();
                    return true;
                  }}
                >
                  <View
                    style={ACTION_BUTTON_STYLE}
                    onEnter={() => {
                      navigate(`/player/movie/${currentMovie().id}`);
                      return true;
                    }}
                  >
                    <Text
                      y={18}
                      width={180}
                      fontSize={22}
                      fontWeight={700}
                      color={0xffffffff}
                      textAlign="center"
                    >
                      Assistir
                    </Text>
                  </View>
                  <View style={SECONDARY_ACTION_STYLE} onEnter={handleBack}>
                    <Text y={18} width={180} fontSize={20} color={theme.textPrimary} textAlign="center">
                      Voltar
                    </Text>
                  </View>
                  <FavoriteButton
                    item={{
                      id: currentMovie().id,
                      type: "movie",
                      title: currentMovie().title || currentMovie().name || "",
                      posterUrl: currentMovie().poster_url || currentMovie().poster || undefined,
                    }}
                  />
                </Row>

                <Column x={28} y={116} width={1120} gap={18} scroll="none" skipFocus>
                  <Show when={currentMovie().cast}>
                    <View width={1120} height={56} color={0x00000000}>
                      <Text fontSize={16} color={theme.textMuted}>
                        Elenco
                      </Text>
                      <Text
                        y={24}
                        width={1100}
                        fontSize={20}
                        color={theme.textPrimary}
                        maxLines={1}
                        contain="width"
                      >
                        {currentMovie().cast || ""}
                      </Text>
                    </View>
                  </Show>
                  <Row width={1120} height={56} gap={48} scroll="none">
                    <Show when={currentMovie().director}>
                      <View width={536} height={56} color={0x00000000}>
                        <Text fontSize={16} color={theme.textMuted}>
                          Direção
                        </Text>
                        <Text
                          y={24}
                          width={516}
                          fontSize={20}
                          color={theme.textPrimary}
                          maxLines={1}
                          contain="width"
                        >
                          {currentMovie().director || ""}
                        </Text>
                      </View>
                    </Show>
                    <Show when={currentMovie().youtube_trailer}>
                      <View width={536} height={56} color={0x00000000}>
                        <Text fontSize={16} color={theme.textMuted}>
                          Extra
                        </Text>
                        <Text
                          y={24}
                          width={516}
                          fontSize={20}
                          color={theme.textPrimary}
                          maxLines={1}
                          contain="width"
                        >
                          Trailer disponível para este título
                        </Text>
                      </View>
                    </Show>
                  </Row>
                </Column>
              </View>

              <Show when={similar()?.length}>
                <View
                  ref={relatedRow}
                  x={0}
                  y={360}
                  width={1700}
                  height={286}
                  onUp={() => actionRow?.setFocus()}
                >
                  <ContentRow title="Títulos parecidos" onItemSelected={item => navigate(item.href || "/")}>
                    <For each={similar()}>
                      {item => (
                        <Card
                          title={item.title || item.name || ""}
                          imageUrl={relatedPoster(item)}
                          subtitle={relatedSubtitle(item)}
                          width={220}
                          height={330}
                          item={{ id: item.id, type: "movie", href: `/movie/${item.id}` }}
                        />
                      )}
                    </For>
                  </ContentRow>
                </View>
              </Show>
            </View>
          </>
        )}
      </Show>
    </View>
  );
};

export default MovieDetail;
