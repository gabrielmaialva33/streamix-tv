import { ElementNode, Text, View } from "@solidtv/solid";
import { Column, Row } from "@solidtv/solid/primitives";
import { createResource, For, Show } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { Card, ContentRow, FavoriteButton, SkeletonLoader } from "@/components";
import api, { type Series } from "@/lib/api";
import { isResumable, ratingCaption, relatedPoster, seasonLabel } from "@/lib/contentMeta";
import { history } from "@/lib/storage";
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

const SeriesDetail = () => {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();

  let actionRow: ElementNode | undefined;
  let relatedRow: ElementNode | undefined;

  const [series] = createResource(
    () => params.id,
    id => api.getSeriesDetail(id),
  );
  const [similar] = createResource(
    () => params.id,
    id => fetchSimilar("series", id),
  );

  // Guard against stale-while-revalidate: when navigating series→series the
  // resource holds the previous show's data until the new fetch resolves.
  // Only treat it as current once its id matches the route so we never paint
  // a mismatched backdrop/meta. (See MovieDetail for the same pattern.)
  const loadedSeries = () => {
    const s = series();
    return s && String(s.id) === params.id ? s : undefined;
  };

  // Most recent unfinished episode of THIS show — powers the "Continuar"
  // CTA. history is sorted most-recent-first.
  const inProgress = () => {
    const saved = history
      .getAll()
      .find(h => h.type === "series" && h.seriesId === params.id && isResumable(h));
    return saved ?? null;
  };

  // Season picking lives in SeriesEpisodes; this page only summarizes the first.
  const ACTIVE_SEASON_INDEX = 0;
  function currentSeason() {
    return series()?.seasons?.[ACTIVE_SEASON_INDEX];
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
      clipping
      onBack={handleBack}
      onLast={handleBack}
    >
      <Show when={!loadedSeries()}>
        <View x={40} y={40} width={1620} height={980} skipFocus>
          <SkeletonLoader width={1620} height={260} borderRadius={28} />
          <SkeletonLoader width={188} height={282} x={40} y={320} borderRadius={22} />
          <SkeletonLoader width={1392} height={282} x={268} y={320} borderRadius={24} />
          <SkeletonLoader width={1620} height={120} y={614} borderRadius={24} />
          <SkeletonLoader width={1620} height={326} y={754} borderRadius={24} />
        </View>
      </Show>

      <Show when={loadedSeries()}>
        {currentSeries => {
          const metaItems = buildMeta(currentSeries());
          const posterUrl = pickPoster(currentSeries(), 240);
          const backdropUrl = pickBackdrop(currentSeries(), 1280);

          return (
            <>
              <DetailHero backdropUrl={backdropUrl} posterUrl={posterUrl} badge="SÉRIE" badgeWidth={122} />
              <DetailPoster posterUrl={posterUrl} />

              <View x={268} y={320} width={1392} height={282} style={PANEL_STYLE}>
                <Column x={30} y={26} width={1332} gap={14} scroll="none" skipFocus>
                  <Show when={currentSeries().tagline}>
                    <Text fontSize={20} color={theme.gold} maxLines={1}>
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

                <Row ref={actionRow} x={30} y={194} width={1332} height={58} gap={20} scroll="none" autofocus>
                  <Show when={inProgress()}>
                    <View
                      width={260}
                      height={58}
                      style={PRIMARY_BUTTON_STYLE}
                      onEnter={() => {
                        const saved = inProgress();
                        if (saved?.episodeId) {
                          navigate(`/player/series/${saved.episodeId}?series=${params.id}`);
                        }
                        return true;
                      }}
                    >
                      <Text
                        width={228}
                        fontSize={22}
                        fontWeight={700}
                        color={0xffffffff}
                        textAlign="center"
                        contain="width"
                      >
                        {`Continuar ${
                          inProgress()?.seasonNumber && inProgress()?.episodeNumber
                            ? `S${inProgress()?.seasonNumber}E${inProgress()?.episodeNumber}`
                            : "assistindo"
                        }`}
                      </Text>
                    </View>
                  </Show>
                  <View
                    width={220}
                    height={58}
                    style={inProgress() ? SECONDARY_BUTTON_STYLE : PRIMARY_BUTTON_STYLE}
                    onEnter={() => {
                      navigate(`/series/${params.id}/episodes`);
                      return true;
                    }}
                  >
                    <Text
                      width={188}
                      fontSize={22}
                      fontWeight={700}
                      color={0xffffffff}
                      textAlign="center"
                      contain="width"
                    >
                      Ver episódios
                    </Text>
                  </View>
                  <View width={180} height={58} style={SECONDARY_BUTTON_STYLE} onEnter={handleBack}>
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
                    width={180}
                    height={58}
                    item={{
                      id: currentSeries().id,
                      type: "series",
                      title: currentSeries().title || currentSeries().name || "",
                      posterUrl,
                    }}
                  />
                </Row>
              </View>

              <Column
                x={40}
                y={614}
                width={1620}
                height={466}
                gap={22}
                scroll="auto"
                clipping
                forwardFocus={0}
              >
                <View width={1620} height={120} style={PANEL_STYLE} skipFocus>
                  <Text x={30} y={20} fontSize={16} color={theme.textMuted}>
                    Sinopse
                  </Text>
                  <Text
                    x={30}
                    y={48}
                    width={1560}
                    fontSize={20}
                    lineHeight={28}
                    color={theme.textPrimary}
                    maxLines={2}
                    contain="width"
                  >
                    {currentSeries().plot || "Sem sinopse disponível para esta série."}
                  </Text>
                </View>

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
                            ? seasonLabel(currentSeason()!, ACTIVE_SEASON_INDEX)
                            : "Nenhuma temporada"}
                        </Text>
                      </View>
                    </Row>
                  </Column>
                </View>

                <Show when={similar()?.length}>
                  <View
                    ref={relatedRow}
                    width={1620}
                    height={430}
                    onUp={() => {
                      actionRow?.setFocus();
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
                            subtitle={ratingCaption(item)}
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
