import { ElementNode, Text, View } from "@solidtv/solid";
import { Column, Row } from "@solidtv/solid/primitives";
import { createEffect, createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { useSidebarExit } from "@/app/layoutFocus";
import { Card, ContentRow, FavoriteButton, LoadError, SkeletonLoader } from "@/components";
import api, { type Series } from "@/lib/api";
import { isResumable, ratingCaption, relatedPoster } from "@/lib/contentMeta";
import { history } from "@/lib/storage";
import { pickBackdrop, pickPoster } from "@/lib/imageUrl";
import { CONTENT_WIDTH } from "@/shared/layout";
import { focusElement } from "@/shared/focus";
import { theme } from "@/styles";
import DetailHero, {
  DetailPoster,
  DetailOverview,
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

const DETAIL_CONTENT_HEIGHT = 1260;
const RELATED_SECTION_TOP = 570;

const SeriesDetail = () => {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const exitToSidebar = useSidebarExit();

  let actionRow: ElementNode | undefined;
  let relatedRow: ElementNode | undefined;
  let relatedSection: ElementNode | undefined;
  let errorPanel: ElementNode | undefined;
  const [pageOffset, setPageOffset] = createSignal(0);

  createEffect(() => {
    void params.id;
    setPageOffset(0);
  });

  const [series, { refetch }] = createResource(
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
    if (series.error) return undefined;
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

  function handleBack() {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/series");
    }
    return true;
  }

  function focusPage() {
    return focusElement(actionRow) || focusElement(errorPanel) || exitToSidebar() || true;
  }

  function focusActions() {
    setPageOffset(0);
    return focusElement(actionRow);
  }

  function focusRelated() {
    if (!relatedRow || !relatedSection) return false;
    setPageOffset(Math.min(0, RELATED_SECTION_TOP - (relatedSection.y ?? RELATED_SECTION_TOP)));
    return focusElement(relatedRow);
  }

  return (
    <View
      width={CONTENT_WIDTH}
      height={1080}
      color={theme.background}
      clipping
      forwardFocus={focusPage}
      onBack={handleBack}
      onLast={handleBack}
    >
      <Show when={!series.error && !loadedSeries()}>
        <View x={40} y={40} width={1620} height={980} skipFocus>
          <SkeletonLoader width={1620} height={260} borderRadius={28} />
          <SkeletonLoader width={188} height={282} x={40} y={320} borderRadius={22} />
          <SkeletonLoader width={1392} height={282} x={268} y={320} borderRadius={24} />
          <SkeletonLoader width={1620} height={120} y={614} borderRadius={24} />
          <SkeletonLoader width={1620} height={326} y={754} borderRadius={24} />
        </View>
      </Show>

      <Show when={series.error}>
        <LoadError
          ref={element => {
            errorPanel = element;
            onCleanup(() => {
              if (errorPanel === element) errorPanel = undefined;
            });
          }}
          x={40}
          y={40}
          width={1620}
          height={980}
          message="Não conseguimos abrir os detalhes desta série agora."
          onRetry={() => refetch()}
          onBack={handleBack}
        />
      </Show>

      <Show when={loadedSeries()}>
        {currentSeries => {
          const metaItems = buildMeta(currentSeries());
          const posterUrl = pickPoster(currentSeries(), 240);
          // DetailHero stretches this across a 1620px-wide banner when the title
          // has no backdrop, so it needs its own larger variant — the 240px poster
          // DetailPoster uses would be upscaled 6.75x and reads visibly soft on a TV.
          const heroPosterUrl = pickPoster(currentSeries(), 720);
          const backdropUrl = pickBackdrop(currentSeries(), 1280);

          return (
            <Column
              y={pageOffset()}
              width={CONTENT_WIDTH}
              height={DETAIL_CONTENT_HEIGHT}
              gap={20}
              scroll="none"
            >
              <View width={1620} height={602} skipFocus>
                <DetailHero
                  backdropUrl={backdropUrl}
                  posterUrl={heroPosterUrl}
                  badge="SÉRIE"
                  badgeWidth={122}
                />
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

                  <Row
                    ref={element => {
                      actionRow = element;
                      onCleanup(() => {
                        if (actionRow === element) actionRow = undefined;
                      });
                    }}
                    x={30}
                    y={194}
                    width={1332}
                    height={58}
                    gap={20}
                    scroll="none"
                    autofocus
                    onFocus={() => setPageOffset(0)}
                    onDown={focusRelated}
                  >
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
              </View>

              <DetailOverview
                plot={currentSeries().plot}
                cast={currentSeries().cast}
                director={currentSeries().director}
              />

              <Show when={similar()?.length}>
                <View
                  ref={element => {
                    relatedSection = element;
                    onCleanup(() => {
                      if (relatedSection === element) relatedSection = undefined;
                    });
                  }}
                  x={40}
                  width={1620}
                  height={470}
                >
                  <ContentRow
                    ref={element => {
                      relatedRow = element;
                      onCleanup(() => {
                        if (relatedRow === element) relatedRow = undefined;
                      });
                    }}
                    title="Séries parecidas"
                    items={similar()}
                    onFocus={() => {
                      if (!relatedSection) return;
                      setPageOffset(
                        Math.min(0, RELATED_SECTION_TOP - (relatedSection.y ?? RELATED_SECTION_TOP)),
                      );
                    }}
                    onSelectedChanged={index => {
                      const item = similar()?.[index];
                      if (item) {
                        api.prefetchSeries(String(item.id));
                      }
                    }}
                    onItemSelected={item => navigate(`/series/${item.id}`)}
                    onUpRequest={focusActions}
                    renderItem={item => (
                      <Card
                        title={item().title || item().name || ""}
                        imageUrl={relatedPoster(item())}
                        subtitle={ratingCaption(item())}
                        width={220}
                        height={330}
                        item={item()}
                      />
                    )}
                  />
                </View>
              </Show>
            </Column>
          );
        }}
      </Show>
    </View>
  );
};

export default SeriesDetail;
