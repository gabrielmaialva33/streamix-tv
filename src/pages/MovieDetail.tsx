import { ElementNode, Text, View } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import { createResource, For, Show } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { Card, ContentRow, FavoriteButton, SkeletonLoader } from "@/components";
import api, { type Movie } from "@/lib/api";
import { ratingCaption, relatedPoster } from "@/lib/contentMeta";
import { pickBackdrop, pickPoster } from "@/lib/imageUrl";
import { CONTENT_WIDTH } from "@/shared/layout";
import { theme } from "@/styles";
import DetailHero, {
  DetailPoster,
  fetchSimilar,
  META_CHIP_STYLE,
  PANEL_STYLE,
  PRIMARY_BUTTON_STYLE,
  SECONDARY_BUTTON_STYLE,
} from "./shared/detail";

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
    id => fetchSimilar("movies", id),
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
          const posterUrl = pickPoster(currentMovie(), 240);
          const backdropUrl = pickBackdrop(currentMovie(), 1280);

          return (
            <>
              <DetailHero backdropUrl={backdropUrl} badge="FILME" badgeWidth={112} />
              <DetailPoster posterUrl={posterUrl} />

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
                    width={180}
                    height={56}
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
                  <View width={180} height={56} style={SECONDARY_BUTTON_STYLE} onEnter={handleBack}>
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
                          subtitle={ratingCaption(item)}
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
