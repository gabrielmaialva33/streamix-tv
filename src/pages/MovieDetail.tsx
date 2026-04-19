import { ElementNode, type IntrinsicNodeStyleProps, Text, View } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import { createResource, For, Show } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { Card, ContentRow, FavoriteButton, SkeletonLoader } from "@/components";
import api, { type Movie, type RecommendationItem, type SimilarContentItem } from "@/lib/api";
import { proxyBackdropUrl, proxyImageUrl } from "@/lib/imageUrl";
import { CONTENT_WIDTH } from "@/shared/layout";
import { theme } from "@/styles";

const HERO_STYLE = {
  width: 1620,
  height: 260,
  borderRadius: 28,
} satisfies IntrinsicNodeStyleProps;

const PANEL_STYLE = {
  color: 0x111118f4,
  borderRadius: 24,
  border: { color: 0x232330ff, width: 1 },
} satisfies IntrinsicNodeStyleProps;

const PRIMARY_BUTTON_STYLE = {
  width: 180,
  height: 56,
  borderRadius: 18,
  color: theme.primary,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  $focus: {
    color: theme.primaryLight,
  },
} satisfies IntrinsicNodeStyleProps;

const SECONDARY_BUTTON_STYLE = {
  width: 180,
  height: 56,
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

const META_CHIP_STYLE = {
  height: 34,
  borderRadius: 17,
  color: 0x181922ff,
  border: { color: 0x2c2d38ff, width: 1 },
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
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

function posterFor(movie?: Movie) {
  return movie?.poster_url || movie?.poster || movie?.backdrop?.[0] || movie?.backdrop_url || undefined;
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
        return api.getSimilarContent("movies", id, 12).catch(() => [] as SimilarContentItem[]);
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
        <View x={40} y={40} width={1620} height={980} skipFocus>
          <SkeletonLoader width={1620} height={260} borderRadius={28} />
          <SkeletonLoader width={188} height={282} x={40} y={320} borderRadius={22} />
          <SkeletonLoader width={1392} height={282} x={268} y={320} borderRadius={24} />
          <SkeletonLoader width={1620} height={132} y={624} borderRadius={24} />
          <SkeletonLoader width={1620} height={104} y={780} borderRadius={24} />
        </View>
      </Show>

      <Show when={movie()}>
        {currentMovie => {
          const metaItems = buildMeta(currentMovie());
          const posterUrl = proxyImageUrl(posterFor(currentMovie()), 480);
          const backdropUrl = proxyBackdropUrl(backdropFor(currentMovie()));

          return (
            <>
              <Show when={backdropUrl}>
                <View
                  x={40}
                  y={40}
                  src={backdropUrl}
                  style={HERO_STYLE}
                  textureOptions={{ resizeMode: { type: "cover", clipX: 0.5, clipY: 0.28 } }}
                />
              </Show>
              <Show when={!backdropUrl}>
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

              <Show when={backdropUrl}>
                <View
                  x={1520}
                  y={58}
                  width={112}
                  height={34}
                  color={0xe50914dd}
                  borderRadius={17}
                  display="flex"
                  justifyContent="center"
                  alignItems="center"
                  skipFocus
                >
                  <Text fontSize={15} fontWeight={700} color={0xffffffff}>
                    FILME
                  </Text>
                </View>
              </Show>

              <Show when={posterUrl}>
                <View
                  x={40}
                  y={320}
                  width={188}
                  height={282}
                  src={posterUrl}
                  color={0xffffffff}
                  borderRadius={22}
                  border={{ color: 0x2d2d38ff, width: 2 }}
                  textureOptions={{ resizeMode: { type: "cover", clipX: 0.5, clipY: 0.15 } }}
                />
              </Show>

              <View x={268} y={320} width={1392} height={282} style={PANEL_STYLE}>
                <Show when={currentMovie().tagline}>
                  <Text
                    x={30}
                    y={22}
                    width={1332}
                    fontSize={18}
                    color={0xffd166ff}
                    maxLines={1}
                    contain="width"
                  >
                    {currentMovie().tagline || ""}
                  </Text>
                </Show>
                <Text
                  x={30}
                  y={currentMovie().tagline ? 50 : 26}
                  width={1332}
                  fontSize={42}
                  fontWeight={700}
                  color={0xffffffff}
                  maxLines={1}
                  contain="width"
                >
                  {currentMovie().title || currentMovie().name}
                </Text>
                <Row
                  x={30}
                  y={currentMovie().tagline ? 116 : 92}
                  width={1332}
                  height={34}
                  gap={12}
                  scroll="none"
                >
                  <For each={metaItems}>
                    {item => (
                      <View width={Math.max(116, item.length * 12 + 30)} style={META_CHIP_STYLE}>
                        <Text fontSize={16} color={0xffffffff}>
                          {item}
                        </Text>
                      </View>
                    )}
                  </For>
                </Row>

                <Row
                  ref={actionRow}
                  x={30}
                  y={196}
                  width={1332}
                  height={58}
                  gap={20}
                  scroll="none"
                  autofocus
                  onDown={() => {
                    relatedRow?.setFocus();
                    return true;
                  }}
                >
                  <View
                    style={PRIMARY_BUTTON_STYLE}
                    onEnter={() => {
                      navigate(`/player/movie/${currentMovie().id}`);
                      return true;
                    }}
                  >
                    <Text
                      width={148}
                      fontSize={22}
                      fontWeight={700}
                      color={0xffffffff}
                      textAlign="center"
                      contain="width"
                    >
                      Assistir
                    </Text>
                  </View>
                  <View style={SECONDARY_BUTTON_STYLE} onEnter={handleBack}>
                    <Text
                      width={148}
                      fontSize={20}
                      color={theme.textPrimary}
                      textAlign="center"
                      contain="width"
                    >
                      Voltar
                    </Text>
                  </View>
                  <FavoriteButton
                    item={{
                      id: currentMovie().id,
                      type: "movie",
                      title: currentMovie().title || currentMovie().name || "",
                      posterUrl,
                    }}
                  />
                </Row>
              </View>

              <View x={40} y={624} width={1620} height={132} style={PANEL_STYLE} skipFocus>
                <Text x={30} y={22} fontSize={16} color={theme.textMuted}>
                  Sinopse
                </Text>
                <Text
                  x={30}
                  y={52}
                  width={1560}
                  fontSize={22}
                  lineHeight={32}
                  color={theme.textPrimary}
                  maxLines={2}
                  contain="width"
                >
                  {currentMovie().plot || "Sem sinopse disponível para este filme."}
                </Text>
              </View>

              <View x={40} y={780} width={1620} height={104} style={PANEL_STYLE} skipFocus>
                <Column x={30} y={20} width={1560} gap={12} scroll="none">
                  <Show when={currentMovie().cast}>
                    <View width={1560} height={30} color={0x00000000}>
                      <Text fontSize={16} color={theme.textMuted}>
                        Elenco
                      </Text>
                      <Text
                        y={16}
                        width={1560}
                        fontSize={20}
                        color={theme.textPrimary}
                        maxLines={1}
                        contain="width"
                      >
                        {currentMovie().cast || ""}
                      </Text>
                    </View>
                  </Show>
                  <Row width={1560} height={36} gap={36} scroll="none">
                    <Show when={currentMovie().director}>
                      <View width={762} height={36} color={0x00000000}>
                        <Text fontSize={16} color={theme.textMuted}>
                          Direção
                        </Text>
                        <Text
                          y={16}
                          width={762}
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
                      <View width={762} height={36} color={0x00000000}>
                        <Text fontSize={16} color={theme.textMuted}>
                          Extra
                        </Text>
                        <Text
                          y={16}
                          width={762}
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
                  x={40}
                  y={852}
                  width={1620}
                  height={228}
                  onUp={() => {
                    actionRow?.setFocus();
                    return true;
                  }}
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
            </>
          );
        }}
      </Show>
    </View>
  );
};

export default MovieDetail;
