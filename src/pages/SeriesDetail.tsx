import { ElementNode, type IntrinsicNodeStyleProps, Text, View } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import { createResource, createSignal, For, Show } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { Card, ContentRow, FavoriteButton, SkeletonLoader } from "@/components";
import api, {
  type Episode,
  type RecommendationItem,
  type Season,
  type Series,
  type SimilarContentItem,
} from "@/lib/api";
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
  width: 220,
  height: 58,
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
  height: 58,
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

const SEASON_BUTTON_STYLE = {
  height: 44,
  borderRadius: 22,
  color: theme.surface,
  border: { color: theme.border, width: 1 },
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  $focus: {
    color: theme.surfaceHover,
    border: { color: theme.primary, width: 2 },
  },
} satisfies IntrinsicNodeStyleProps;

const ACTIVE_SEASON_BUTTON_STYLE = {
  ...SEASON_BUTTON_STYLE,
  color: 0x2b1015ff,
  border: { color: theme.primary, width: 1 },
} satisfies IntrinsicNodeStyleProps;

const EPISODE_CARD_STYLE = {
  width: 520,
  height: 154,
  borderRadius: 20,
  color: theme.surface,
  border: { color: theme.border, width: 1 },
  $focus: {
    color: theme.surfaceHover,
    border: { color: theme.primary, width: 2 },
  },
} satisfies IntrinsicNodeStyleProps;

type RelatedSeries = SimilarContentItem | RecommendationItem;

function buildMeta(show?: Series) {
  if (!show) {
    return [];
  }

  return [
    show.year ? String(show.year) : null,
    show.rating ? `${show.rating.toFixed(1)} IMDb` : null,
    show.genre || null,
    show.season_count ? `${show.season_count} temporadas` : null,
    show.episode_count ? `${show.episode_count} episódios` : null,
  ].filter(Boolean) as string[];
}

function backdropFor(show?: Series) {
  return show?.backdrop?.[0] || show?.backdrop_url || show?.poster_url || show?.poster || undefined;
}

function posterFor(show?: Series) {
  return show?.poster_url || show?.poster || show?.backdrop?.[0] || show?.backdrop_url || undefined;
}

function relatedPoster(item: RelatedSeries) {
  return item.poster || (Array.isArray(item.backdrop) ? item.backdrop[0] : item.backdrop) || undefined;
}

function relatedSubtitle(item: RelatedSeries) {
  return [item.year ? String(item.year) : null, item.rating ? `${item.rating.toFixed(1)} IMDb` : null]
    .filter(Boolean)
    .join(" • ");
}

function seasonLabel(season: Season, index: number) {
  return `Temporada ${season.season_number ?? index + 1}`;
}

const SeriesDetail = () => {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();

  let actionRow: ElementNode | undefined;
  let seasonsRow: ElementNode | undefined;
  let episodesColumn: ElementNode | undefined;
  let firstEpisodeCard: ElementNode | undefined;
  let relatedRow: ElementNode | undefined;

  const [series] = createResource(
    () => params.id,
    id => api.getSeriesDetail(id),
  );
  const [selectedSeasonIdx, setSelectedSeasonIdx] = createSignal(0);
  const [similar] = createResource(
    () => params.id,
    async id => {
      try {
        const personalized = await api.getSimilarRecommendations(id, "series", 12);
        if (personalized.similar?.length) {
          return personalized.similar;
        }
      } catch {
        return api.getSimilarContent("series", id, 12).catch(() => [] as SimilarContentItem[]);
      }

      return api.getSimilarContent("series", id, 12).catch(() => [] as SimilarContentItem[]);
    },
  );

  function currentSeasonIndex() {
    return selectedSeasonIdx();
  }

  function currentSeason() {
    return series()?.seasons?.[currentSeasonIndex()];
  }

  function currentEpisodes() {
    return currentSeason()?.episodes || [];
  }

  function episodeRows() {
    const episodes = currentEpisodes();
    const rows: Episode[][] = [];
    for (let index = 0; index < episodes.length; index += 3) {
      rows.push(episodes.slice(index, index + 3));
    }
    return rows;
  }

  function firstEpisode() {
    return series()?.seasons?.flatMap(season => season.episodes || [])[0];
  }

  function handlePlayEpisode(episode?: Episode) {
    if (!episode) {
      return false;
    }

    navigate(`/player/series/${episode.id}`);
    return true;
  }

  function handleBack() {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/series");
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
      <Show when={series.loading}>
        <View x={40} y={40} width={1620} height={980} skipFocus>
          <SkeletonLoader width={1620} height={260} borderRadius={28} />
          <SkeletonLoader width={188} height={282} x={40} y={320} borderRadius={22} />
          <SkeletonLoader width={1392} height={282} x={268} y={320} borderRadius={24} />
          <SkeletonLoader width={1620} height={132} y={568} borderRadius={24} />
          <SkeletonLoader width={1620} height={340} y={724} borderRadius={24} />
        </View>
      </Show>

      <Show when={series()}>
        {currentSeries => {
          const metaItems = buildMeta(currentSeries());
          const posterUrl = posterFor(currentSeries());
          const backdropUrl = backdropFor(currentSeries());

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
                  x={1510}
                  y={58}
                  width={122}
                  height={34}
                  color={0xe50914dd}
                  borderRadius={17}
                  display="flex"
                  justifyContent="center"
                  alignItems="center"
                  skipFocus
                >
                  <Text fontSize={15} fontWeight={700} color={0xffffffff}>
                    SÉRIE
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
                <Column x={30} y={26} width={1332} gap={14} scroll="none" skipFocus>
                  <Show when={currentSeries().tagline}>
                    <Text fontSize={20} color={0xffd166ff} maxLines={1}>
                      {currentSeries().tagline || ""}
                    </Text>
                  </Show>
                  <Text
                    width={1332}
                    fontSize={48}
                    fontWeight={700}
                    color={0xffffffff}
                    maxLines={2}
                    contain="width"
                  >
                    {currentSeries().title || currentSeries().name}
                  </Text>
                  <Row width={1332} height={34} gap={12} scroll="none">
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
                </Column>

                <Row
                  ref={actionRow}
                  x={30}
                  y={194}
                  width={1332}
                  height={58}
                  gap={20}
                  scroll="none"
                  autofocus
                  onDown={() => {
                    if (currentSeries().seasons?.length) {
                      seasonsRow?.setFocus();
                    } else {
                      episodesColumn?.setFocus();
                    }
                    return true;
                  }}
                >
                  <View style={PRIMARY_BUTTON_STYLE} onEnter={() => handlePlayEpisode(firstEpisode())}>
                    <Text
                      width={188}
                      fontSize={22}
                      fontWeight={700}
                      color={0xffffffff}
                      textAlign="center"
                      contain="width"
                    >
                      {firstEpisode() ? "Começar a série" : "Sem episódios"}
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
                      id: currentSeries().id,
                      type: "series",
                      title: currentSeries().title || currentSeries().name || "",
                      posterUrl,
                    }}
                  />
                </Row>
              </View>

              <View x={40} y={568} width={1620} height={132} style={PANEL_STYLE} skipFocus>
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
                  {currentSeries().plot || "Sem sinopse disponível para esta série."}
                </Text>
              </View>

              <Column
                x={40}
                y={724}
                width={1620}
                height={356}
                gap={22}
                scroll="auto"
                clipping
                forwardFocus={0}
              >
                <View width={1620} minHeight={116} style={PANEL_STYLE} skipFocus>
                  <Column x={30} y={20} width={1560} gap={12} scroll="none">
                    <Show when={currentSeries().cast}>
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
                          {currentSeries().cast || ""}
                        </Text>
                      </View>
                    </Show>
                    <Row width={1560} height={36} gap={36} scroll="none">
                      <Show when={currentSeries().director}>
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
                            {currentSeries().director || ""}
                          </Text>
                        </View>
                      </Show>
                      <View width={762} height={36} color={0x00000000}>
                        <Text fontSize={16} color={theme.textMuted}>
                          Temporada ativa
                        </Text>
                        <Text
                          y={16}
                          width={762}
                          fontSize={20}
                          color={theme.textPrimary}
                          maxLines={1}
                          contain="width"
                        >
                          {currentSeason()
                            ? seasonLabel(currentSeason()!, currentSeasonIndex())
                            : "Nenhuma temporada"}
                        </Text>
                      </View>
                    </Row>
                  </Column>
                </View>

                <Show when={currentSeries().seasons?.length}>
                  <View width={1620} height={74}>
                    <Text fontSize={24} fontWeight={700} color={0xffffffff}>
                      Temporadas
                    </Text>
                    <Row
                      ref={seasonsRow}
                      y={34}
                      width={1620}
                      height={44}
                      gap={12}
                      scroll="auto"
                      onUp={() => {
                        actionRow?.setFocus();
                        return true;
                      }}
                      onDown={() => {
                        episodesColumn?.setFocus();
                        return true;
                      }}
                    >
                      <For each={currentSeries().seasons}>
                        {(season: Season, index) => (
                          <View
                            width={Math.max(168, seasonLabel(season, index()).length * 12 + 34)}
                            style={
                              currentSeasonIndex() === index()
                                ? ACTIVE_SEASON_BUTTON_STYLE
                                : SEASON_BUTTON_STYLE
                            }
                            onEnter={() => {
                              setSelectedSeasonIdx(index());
                              return true;
                            }}
                          >
                            <Text
                              width={Math.max(168, seasonLabel(season, index()).length * 12 + 34) - 24}
                              fontSize={18}
                              color={0xffffffff}
                              textAlign="center"
                              contain="width"
                              maxLines={1}
                            >
                              {seasonLabel(season, index())}
                            </Text>
                          </View>
                        )}
                      </For>
                    </Row>
                  </View>
                </Show>

                <Column
                  ref={episodesColumn}
                  width={1620}
                  gap={18}
                  scroll="none"
                  forwardFocus={() => {
                    firstEpisodeCard?.setFocus();
                    return true;
                  }}
                  onUp={() => {
                    if (currentSeries().seasons?.length) {
                      seasonsRow?.setFocus();
                    } else {
                      actionRow?.setFocus();
                    }
                    return true;
                  }}
                >
                  <Text fontSize={24} fontWeight={700} color={0xffffffff} skipFocus>
                    Episódios
                  </Text>

                  <Show when={episodeRows().length === 0}>
                    <View
                      width={1620}
                      height={180}
                      color={theme.surface}
                      borderRadius={20}
                      display="flex"
                      justifyContent="center"
                      alignItems="center"
                      skipFocus
                    >
                      <Text fontSize={24} color={theme.textSecondary}>
                        Nenhum episódio disponível nesta temporada
                      </Text>
                    </View>
                  </Show>

                  <For each={episodeRows()}>
                    {(row, rowIndex) => (
                      <Row width={1620} height={154} gap={20} scroll="none">
                        <For each={row}>
                          {(episode: Episode, episodeIndex) => (
                            <View
                              ref={rowIndex() === 0 && episodeIndex() === 0 ? firstEpisodeCard : undefined}
                              style={EPISODE_CARD_STYLE}
                              onEnter={() => handlePlayEpisode(episode)}
                            >
                              <Show when={episode.thumbnail_url}>
                                <View
                                  x={14}
                                  y={14}
                                  width={184}
                                  height={126}
                                  src={episode.thumbnail_url}
                                  color={0xffffffff}
                                  borderRadius={14}
                                  textureOptions={{ resizeMode: { type: "cover", clipX: 0.5, clipY: 0.5 } }}
                                />
                              </Show>
                              <Show when={!episode.thumbnail_url}>
                                <View
                                  x={14}
                                  y={14}
                                  width={184}
                                  height={126}
                                  color={0x242431ff}
                                  borderRadius={14}
                                />
                              </Show>

                              <View x={212} y={16} width={286}>
                                <Text fontSize={16} color={0xffd166ff}>
                                  {`E${episode.episode_num ?? episode.number ?? "?"}`}
                                </Text>
                                <Text
                                  y={24}
                                  width={286}
                                  fontSize={21}
                                  fontWeight={700}
                                  color={0xffffffff}
                                  contain="width"
                                  maxLines={1}
                                >
                                  {episode.title || "Episódio"}
                                </Text>
                                <Text
                                  y={54}
                                  width={286}
                                  fontSize={15}
                                  lineHeight={22}
                                  color={theme.textSecondary}
                                  contain="both"
                                  maxLines={2}
                                >
                                  {episode.plot || episode.description || "Sem descrição disponível."}
                                </Text>
                                <Text y={108} fontSize={13} color={theme.textMuted}>
                                  {episode.duration || "Duração indisponível"}
                                </Text>
                              </View>
                            </View>
                          )}
                        </For>
                      </Row>
                    )}
                  </For>
                </Column>

                <Show when={similar()?.length}>
                  <View
                    ref={relatedRow}
                    width={1620}
                    height={286}
                    onUp={() => {
                      episodesColumn?.setFocus();
                      return true;
                    }}
                  >
                    <ContentRow
                      title="Séries parecidas"
                      onSelectedChanged={index => {
                        const item = similar()?.[index];
                        if (item) {
                          api.prefetchSeries(String(item.id));
                        }
                      }}
                      onItemSelected={item => navigate(item.href || "/series")}
                    >
                      <For each={similar()}>
                        {item => (
                          <Card
                            title={item.title || item.name || ""}
                            imageUrl={relatedPoster(item)}
                            subtitle={relatedSubtitle(item)}
                            width={220}
                            height={330}
                            item={{ id: item.id, type: "series", href: `/series/${item.id}` }}
                          />
                        )}
                      </For>
                    </ContentRow>
                  </View>
                </Show>
              </Column>
            </>
          );
        }}
      </Show>
    </View>
  );
};

export default SeriesDetail;
