import { ElementNode, type IntrinsicNodeStyleProps, Text, View } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import { createResource, For, Show } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { Card, ContentRow, FavoriteButton, SkeletonLoader } from "@/components";
import api, { type Movie, type RecommendationItem, type SimilarContentItem } from "@/lib/api";
import { CONTENT_WIDTH } from "@/shared/layout";
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

const HERO_STYLE = {
  width: 1640,
  height: 320,
  borderRadius: 28,
} satisfies IntrinsicNodeStyleProps;

const DETAIL_SURFACE_STYLE = {
  color: 0x111118f4,
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

function heroBackdropFor(movie?: Movie) {
  return movie?.backdrop?.[0] || movie?.backdrop_url || undefined;
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
        <View x={20} y={20} width={1640} height={980} skipFocus>
          <SkeletonLoader width={1640} height={320} borderRadius={28} />
          <SkeletonLoader width={240} height={360} x={20} y={248} borderRadius={22} />
          <SkeletonLoader width={1328} height={208} x={292} y={248} borderRadius={24} />
          <SkeletonLoader width={1328} height={164} x={292} y={472} borderRadius={24} />
          <SkeletonLoader width={1620} height={300} x={20} y={680} borderRadius={24} />
        </View>
      </Show>

      <Show when={movie()}>
        {currentMovie => {
          const metaItems = buildMeta(currentMovie());
          const posterUrl = posterFor(currentMovie());
          const panelX = posterUrl ? 272 : 0;
          const panelWidth = posterUrl ? 1328 : 1620;

          return (
            <>
              <Show when={heroBackdropFor(currentMovie())}>
                <View
                  x={20}
                  y={20}
                  src={heroBackdropFor(currentMovie())}
                  textureOptions={{ resizeMode: { type: "cover", clipX: 0.5, clipY: 0.3 } }}
                  style={HERO_STYLE}
                />
              </Show>
              <View
                x={20}
                y={20}
                style={HERO_STYLE}
                shader={{
                  type: "linearGradient",
                  colors: [0x09090dcc, 0x09090daa, 0x09090d22],
                  angle: 0,
                }}
              />
              <View
                x={20}
                y={20}
                style={HERO_STYLE}
                shader={{
                  type: "linearGradient",
                  colors: [0x09090d00, 0x09090d66, 0x09090dff],
                  angle: 180,
                }}
              />

              <View x={40} y={248} width={1620} height={832} clipping>
                <Show when={posterUrl}>
                  <View
                    x={0}
                    y={0}
                    width={240}
                    height={360}
                    src={posterUrl}
                    color={0xffffffff}
                    borderRadius={22}
                    border={{ color: 0x2d2d38ff, width: 2 }}
                    textureOptions={{ resizeMode: { type: "cover", clipX: 0.5, clipY: 0.15 } }}
                  />
                </Show>

                <View x={panelX} y={0} width={panelWidth} height={208} style={DETAIL_SURFACE_STYLE}>
                  <Column x={30} y={26} width={panelWidth - 60} gap={14} scroll="none" skipFocus>
                    <Show when={currentMovie().tagline}>
                      <Text fontSize={20} color={0xffd166ff} maxLines={1}>
                        {currentMovie().tagline || ""}
                      </Text>
                    </Show>
                    <Text
                      width={panelWidth - 60}
                      fontSize={58}
                      fontWeight={700}
                      color={0xffffffff}
                      maxLines={2}
                    >
                      {currentMovie().title || currentMovie().name}
                    </Text>
                    <Row width={panelWidth - 60} height={36} gap={12} scroll="none">
                      <For each={metaItems}>
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
                  </Column>

                  <Row
                    ref={actionRow}
                    x={30}
                    y={132}
                    width={Math.min(panelWidth - 60, 820)}
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
                        posterUrl,
                      }}
                    />
                  </Row>
                </View>

                <View
                  x={panelX}
                  y={224}
                  width={panelWidth}
                  height={172}
                  style={DETAIL_SURFACE_STYLE}
                  skipFocus
                >
                  <Text x={30} y={24} fontSize={16} color={theme.textMuted}>
                    Sinopse
                  </Text>
                  <Text
                    x={30}
                    y={54}
                    width={panelWidth - 60}
                    fontSize={22}
                    lineHeight={32}
                    color={theme.textPrimary}
                    maxLines={3}
                    contain="width"
                  >
                    {currentMovie().plot || "Sem sinopse disponível para este filme."}
                  </Text>
                </View>

                <View
                  x={panelX}
                  y={412}
                  width={panelWidth}
                  height={124}
                  style={DETAIL_SURFACE_STYLE}
                  skipFocus
                >
                  <Column x={30} y={22} width={panelWidth - 60} gap={14} scroll="none">
                    <Show when={currentMovie().cast}>
                      <View width={panelWidth - 60} height={34} color={0x00000000}>
                        <Text fontSize={16} color={theme.textMuted}>
                          Elenco
                        </Text>
                        <Text
                          y={18}
                          width={panelWidth - 60}
                          fontSize={20}
                          color={theme.textPrimary}
                          maxLines={1}
                          contain="width"
                        >
                          {currentMovie().cast || ""}
                        </Text>
                      </View>
                    </Show>
                    <Row width={panelWidth - 60} height={40} gap={36} scroll="none">
                      <Show when={currentMovie().director}>
                        <View width={Math.floor((panelWidth - 96) / 2)} height={40} color={0x00000000}>
                          <Text fontSize={16} color={theme.textMuted}>
                            Direção
                          </Text>
                          <Text
                            y={18}
                            width={Math.floor((panelWidth - 96) / 2)}
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
                        <View width={Math.floor((panelWidth - 96) / 2)} height={40} color={0x00000000}>
                          <Text fontSize={16} color={theme.textMuted}>
                            Extra
                          </Text>
                          <Text
                            y={18}
                            width={Math.floor((panelWidth - 96) / 2)}
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
                    y={552}
                    width={1620}
                    height={280}
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
              </View>
            </>
          );
        }}
      </Show>
    </View>
  );
};

export default MovieDetail;
