import { type ElementNode, type IntrinsicNodeStyleProps, Text, View } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import { useNavigate, useParams } from "@solidjs/router";
import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { SkeletonLoader } from "@/components";
import api, { type Episode, type Season } from "@/lib/api";
import { CONTENT_WIDTH } from "@/shared/layout";
import { theme } from "@/styles";

// Lightning applies `style` once on mount, so dynamic visuals (color/border)
// must live as JSX props to stay reactive.
const SEASON_BUTTON_STYLE = {
  height: 48,
  borderRadius: 24,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  scale: 1,
  transition: { scale: { duration: 150 }, color: { duration: 150 } },
  $focus: {
    scale: 1.05,
  },
} satisfies IntrinsicNodeStyleProps;

const EPISODE_CARD_STYLE = {
  width: 520,
  height: 156,
  borderRadius: 20,
  color: theme.surface,
  border: { color: theme.border, width: 1 },
  scale: 1,
  transition: { scale: { duration: 150 } },
  $focus: {
    color: theme.surfaceHover,
    border: { color: theme.primary, width: 2 },
    scale: 1.02,
  },
} satisfies IntrinsicNodeStyleProps;

const ITEMS_PER_ROW = 3;

function seasonLabel(season: Season, index: number) {
  return `Temporada ${season.season_number ?? index + 1}`;
}

const SeriesEpisodes = () => {
  const params = useParams<{ id: string; season?: string }>();
  const navigate = useNavigate();

  const [series] = createResource(
    () => params.id,
    id => api.getSeriesDetail(id),
  );
  const [selectedSeasonIdx, setSelectedSeasonIdx] = createSignal(0);

  let seasonsRow: ElementNode | undefined;
  let episodesGrid: ElementNode | undefined;
  let firstEpisode: ElementNode | undefined;

  // Honor ?season=N from URL on first load
  createEffect(() => {
    const s = series();
    if (!s) return;
    const want = Number(params.season ?? 0);
    const max = (s.seasons?.length ?? 1) - 1;
    setSelectedSeasonIdx(Math.min(Math.max(want, 0), Math.max(0, max)));
  });

  const currentSeason = () => series()?.seasons?.[selectedSeasonIdx()];
  const episodes = (): Episode[] => currentSeason()?.episodes || [];

  const episodeRows = (): Episode[][] => {
    const data = episodes();
    const rows: Episode[][] = [];
    for (let i = 0; i < data.length; i += ITEMS_PER_ROW) {
      rows.push(data.slice(i, i + ITEMS_PER_ROW));
    }
    return rows;
  };

  function handlePlay(ep?: Episode) {
    if (!ep) return;
    navigate(`/player/series/${ep.id}`);
  }

  function handleBack() {
    navigate(`/series/${params.id}`);
    return true;
  }

  return (
    <View
      width={CONTENT_WIDTH}
      height={1080}
      color={theme.background}
      clipping
      onBack={handleBack}
      onLast={handleBack}
      forwardFocus={() => {
        if (series()?.seasons?.length) {
          seasonsRow?.setFocus();
        } else {
          episodesGrid?.setFocus();
        }
        return true;
      }}
    >
      <Show when={series.loading}>
        <View x={40} y={40} width={1620} height={980} skipFocus>
          <SkeletonLoader width={1620} height={64} borderRadius={16} />
          <SkeletonLoader width={1620} height={60} y={88} borderRadius={24} />
          <SkeletonLoader width={1620} height={156} y={172} borderRadius={20} />
          <SkeletonLoader width={1620} height={156} y={348} borderRadius={20} />
          <SkeletonLoader width={1620} height={156} y={524} borderRadius={20} />
        </View>
      </Show>

      <Show when={series()}>
        {currentSeries => (
          <View x={40} y={36} width={1620} height={1024}>
            <Text fontSize={36} fontWeight={700} color={0xffffffff} maxLines={1} contain="width" width={1620}>
              {currentSeries().title || currentSeries().name} · Episódios
            </Text>

            <Show when={currentSeries().seasons?.length}>
              <Row
                ref={seasonsRow}
                y={68}
                width={1620}
                height={48}
                gap={12}
                scroll="auto"
                wrap
                onDown={() => {
                  episodesGrid?.setFocus();
                  return true;
                }}
              >
                <For each={currentSeries().seasons}>
                  {(season: Season, index) => (
                    <View
                      width={Math.max(168, seasonLabel(season, index()).length * 12 + 34)}
                      style={SEASON_BUTTON_STYLE}
                      color={selectedSeasonIdx() === index() ? 0x2b1015ff : theme.surface}
                      border={{
                        color: selectedSeasonIdx() === index() ? theme.primary : theme.border,
                        width: selectedSeasonIdx() === index() ? 2 : 1,
                      }}
                      onEnter={() => {
                        setSelectedSeasonIdx(index());
                        episodesGrid?.setFocus();
                        return true;
                      }}
                      onFocus={() => setSelectedSeasonIdx(index())}
                    >
                      <Text fontSize={18} color={0xffffffff} contain="width" width={140} textAlign="center">
                        {seasonLabel(season, index())}
                      </Text>
                    </View>
                  )}
                </For>
              </Row>
            </Show>

            <Column
              ref={episodesGrid}
              x={0}
              y={156}
              width={1620}
              height={900}
              gap={20}
              scroll="auto"
              clipping
              forwardFocus={() => {
                firstEpisode?.setFocus();
                return true;
              }}
              onUp={function (this: ElementNode) {
                if ((this.selected ?? 0) > 0) return false;
                if (currentSeries().seasons?.length) {
                  seasonsRow?.setFocus();
                  return true;
                }
                return false;
              }}
            >
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
                  <Text fontSize={22} color={theme.textSecondary}>
                    Nenhum episódio disponível nesta temporada
                  </Text>
                </View>
              </Show>

              <For each={episodeRows()}>
                {(row, rowIndex) => (
                  <Row width={1620} height={156} gap={20} scroll="none">
                    <For each={row}>
                      {(episode: Episode, episodeIndex) => (
                        <View
                          ref={rowIndex() === 0 && episodeIndex() === 0 ? firstEpisode : undefined}
                          style={EPISODE_CARD_STYLE}
                          onEnter={() => handlePlay(episode)}
                        >
                          <Show
                            when={episode.thumbnail_url}
                            fallback={
                              <View
                                x={14}
                                y={14}
                                width={184}
                                height={128}
                                color={0x242431ff}
                                borderRadius={14}
                              />
                            }
                          >
                            <View
                              x={14}
                              y={14}
                              width={184}
                              height={128}
                              src={episode.thumbnail_url}
                              color={0xffffffff}
                              borderRadius={14}
                              textureOptions={{ resizeMode: { type: "cover", clipX: 0.5, clipY: 0.5 } }}
                            />
                          </Show>

                          <View x={212} y={18} width={290}>
                            <Text fontSize={16} color={0xffd166ff}>
                              {`E${episode.episode_num ?? episode.number ?? "?"}`}
                            </Text>
                            <Text
                              y={24}
                              width={290}
                              fontSize={20}
                              fontWeight={700}
                              color={0xffffffff}
                              maxLines={1}
                              contain="width"
                            >
                              {episode.title || `Episódio ${episode.episode_num ?? episode.number ?? ""}`}
                            </Text>
                            <Text
                              y={56}
                              width={290}
                              fontSize={14}
                              lineHeight={20}
                              color={theme.textSecondary}
                              maxLines={3}
                              contain="width"
                            >
                              {episode.description || episode.plot || "Sem descrição disponível."}
                            </Text>
                          </View>

                          <Show when={episode.duration}>
                            <Text x={212} y={126} fontSize={13} color={theme.textMuted}>
                              {episode.duration || ""}
                            </Text>
                          </Show>
                        </View>
                      )}
                    </For>
                  </Row>
                )}
              </For>
            </Column>
          </View>
        )}
      </Show>
    </View>
  );
};

export default SeriesEpisodes;
