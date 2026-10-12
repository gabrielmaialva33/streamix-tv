import { ElementNode, Text, View } from "@solidtv/solid";
import { Column, Row } from "@solidtv/solid/primitives";
import { createEffect, createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { Card, ContentRow, FavoriteButton, LoadError, SkeletonLoader } from "@/components";
import api, { type Movie } from "@/lib/api";
import { isResumable, ratingCaption, relatedPoster } from "@/lib/contentMeta";
import { history } from "@/lib/storage";
import { pickBackdrop, pickPoster } from "@/lib/imageUrl";
import { CONTENT_WIDTH } from "@/shared/layout";
import { focusElement } from "@/shared/focus";
import { displayTitle } from "@/lib/displayTitle";
import SourcePicker from "@/features/sources/SourcePicker";
import { fallbackSource, fetchPlaybackSources, hasSourceChoice } from "@/features/sources/playbackSources";
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

const DETAIL_CONTENT_HEIGHT = 1260;
const RELATED_SECTION_TOP = 570;

const MovieDetail = () => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();

  let actionRow: ElementNode | undefined;
  let relatedRow: ElementNode | undefined;
  let relatedSection: ElementNode | undefined;
  let errorPanel: ElementNode | undefined;
  const [pageOffset, setPageOffset] = createSignal(0);

  createEffect(() => {
    void params.id;
    setPageOffset(0);
  });

  const [movie, { refetch }] = createResource(
    () => params.id,
    id => api.getMovie(id),
  );
  const [similar] = createResource(
    () => params.id,
    id => fetchSimilar("movies", id),
  );

  // createResource keeps the previous movie's data during a refetch
  // (stale-while-revalidate). Navigating detail→detail (e.g. via "Títulos
  // parecidos") would otherwise paint the prior title's backdrop/meta until
  // the new fetch lands. Gate the view on the loaded id matching the route so
  // the page never shows a mismatched movie.
  const loadedMovie = () => {
    if (movie.error) return undefined;
    const m = movie();
    return m && String(m.id) === params.id ? m : undefined;
  };

  // Saved playback position (the player already auto-resumes; this only
  // surfaces it on the CTA, plus an explicit "from the start" escape hatch).
  const resumePosition = () => {
    const saved = history.getProgress(params.id, "movie");
    return saved && isResumable(saved) ? saved.currentTime : null;
  };

  /**
   * How much is left, as a sentence rather than a timestamp.
   *
   * The button used to read "Continuar de 6:38", which in a two-hour film reads
   * as six hours thirty-eight to most people — the viewer could not tell
   * whether they had watched a minute or most of it. What is left answers the
   * question they are actually asking.
   */
  const resumeRemaining = () => {
    const saved = history.getProgress(params.id, "movie");
    if (!saved || !isResumable(saved)) return null;
    const left = Math.max(0, Math.round(saved.duration - saved.currentTime));
    if (!Number.isFinite(left) || left <= 0) return null;
    const hours = Math.floor(left / 3600);
    const minutes = Math.round((left % 3600) / 60);
    return hours > 0 ? `Faltam ${hours}h ${minutes}min` : `Faltam ${minutes}min`;
  };

  function handleBack() {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/movies");
    }
    return true;
  }

  /**
   * While the detail is still loading there is nothing focusable yet, and
   * bouncing to the sidebar here was worse than doing nothing: the highlight
   * jumped to "Início" for the length of the fetch and was then yanked back by
   * the action row's autofocus. A viewer who pressed OK in that window landed on
   * the Home screen and lost the title they had just opened.
   *
   * Returning false focuses this page root instead — invisible, inert, and
   * replaced the moment the real content mounts. Left still reaches the sidebar
   * because MainLayout handles it one level up.
   */
  function focusPage() {
    return focusElement(actionRow) || focusElement(errorPanel) || false;
  }

  function focusActions() {
    setPageOffset(0);
    return focusElement(actionRow);
  }

  // Independent of the movie fetch: a backend without the route answers 404,
  // which hides the section and leaves the page exactly as it was.
  const [sources] = createResource(
    () => params.id,
    id => fetchPlaybackSources("movie", id),
  );
  const sourceChoice = () => {
    const result = sources();
    return result && hasSourceChoice(result, params.id) && result.status === "ready" ? result.sources : null;
  };
  let sourceRow: ElementNode | undefined;

  /** Set when the copy on screen is down and Play starts another copy instead. */
  const playInstead = () => (resumePosition() ? null : fallbackSource(sources(), params.id));

  function focusSources() {
    if (!sourceChoice() || !sourceRow) return false;
    setPageOffset(0);
    return focusElement(sourceRow);
  }

  /** Down from the actions lands on the sources when there is a choice. */
  function leaveActionsDown() {
    return focusSources() || focusRelated();
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
      <Show when={!movie.error && !loadedMovie()}>
        <View x={40} y={40} width={1620} height={980} skipFocus>
          <SkeletonLoader width={1620} height={260} borderRadius={28} />
          <SkeletonLoader width={188} height={282} x={40} y={320} borderRadius={22} />
          <SkeletonLoader width={1392} height={282} x={268} y={320} borderRadius={24} />
          <SkeletonLoader width={1620} height={132} y={624} borderRadius={24} />
          <SkeletonLoader width={1620} height={104} y={780} borderRadius={24} />
        </View>
      </Show>

      <Show when={movie.error}>
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
          message="Não conseguimos abrir os detalhes deste filme agora."
          onRetry={() => refetch()}
          onBack={handleBack}
        />
      </Show>

      <Show when={loadedMovie()}>
        {currentMovie => {
          const metaItems = buildMeta(currentMovie());
          const posterUrl = pickPoster(currentMovie(), 240);
          // DetailHero stretches this across a 1620px-wide banner when the title
          // has no backdrop, so it needs its own larger variant — the 240px poster
          // DetailPoster uses would be upscaled 6.75x and reads visibly soft on a TV.
          const heroPosterUrl = pickPoster(currentMovie(), 720);
          const backdropUrl = pickBackdrop(currentMovie(), 1280);

          // The whole page scrolls as one Column: pressing Down from the
          // action row reveals the synopsis/credits/related rail while the
          // hero scrolls up with it (Netflix-style), instead of the hero
          // staying pinned and only the lower band moving.
          return (
            <Column
              y={pageOffset()}
              width={CONTENT_WIDTH}
              height={DETAIL_CONTENT_HEIGHT}
              gap={20}
              scroll="none"
            >
              {/* Hero block — backdrop, poster and the action panel. Height
                  covers the absolutely-positioned children inside it. */}
              <View width={1620} height={602} skipFocus>
                <DetailHero
                  backdropUrl={backdropUrl}
                  posterUrl={heroPosterUrl}
                  badge="FILME"
                  badgeWidth={112}
                />
                <DetailPoster posterUrl={posterUrl} />

                <View x={268} y={320} width={1392} height={282} style={PANEL_STYLE}>
                  <Show when={currentMovie().tagline}>
                    <Text
                      x={30}
                      y={22}
                      width={1332}
                      fontSize={18}
                      color={theme.gold}
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
                    {displayTitle(currentMovie().title || currentMovie().name)}
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
                    ref={element => {
                      actionRow = element;
                      onCleanup(() => {
                        if (actionRow === element) actionRow = undefined;
                      });
                    }}
                    x={30}
                    y={184}
                    width={1332}
                    height={58}
                    gap={20}
                    scroll="none"
                    autofocus
                    onFocus={() => setPageOffset(0)}
                    onDown={leaveActionsDown}
                  >
                    <View
                      width={resumePosition() ? 280 : 180}
                      height={56}
                      style={PRIMARY_BUTTON_STYLE}
                      onEnter={() => {
                        navigate(`/player/movie/${playInstead()?.id ?? currentMovie().id}`);
                        return true;
                      }}
                    >
                      <Text
                        width={resumePosition() ? 248 : 148}
                        fontSize={22}
                        fontWeight={700}
                        color={0xffffffff}
                        textAlign="center"
                        contain="width"
                      >
                        {resumePosition() ? "Continuar" : "Assistir"}
                      </Text>
                    </View>
                    <Show when={resumePosition()}>
                      <View
                        width={180}
                        height={56}
                        style={SECONDARY_BUTTON_STYLE}
                        onEnter={() => {
                          navigate(`/player/movie/${currentMovie().id}?restart=1`);
                          return true;
                        }}
                      >
                        <Text
                          width={148}
                          fontSize={20}
                          color={theme.textPrimary}
                          textAlign="center"
                          contain="width"
                        >
                          Do início
                        </Text>
                      </View>
                    </Show>
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
                      width={180}
                      height={56}
                      item={{
                        id: currentMovie().id,
                        type: "movie",
                        title: currentMovie().title || currentMovie().name || "",
                        posterUrl,
                      }}
                    />
                  </Row>

                  {/* Outside the action Row on purpose: as a child of that flex
                      row it became a row item, sat between "Continuar" and "Do
                      início", and pushed every button after it to the right. */}
                  <Show when={resumeRemaining()}>
                    <Text
                      x={30}
                      y={250}
                      width={280}
                      fontSize={17}
                      color={theme.textMuted}
                      contain="width"
                      maxLines={1}
                    >
                      {resumeRemaining() ?? ""}
                    </Text>
                  </Show>
                  <Show when={playInstead()}>
                    {fallback => (
                      <Text
                        x={30}
                        y={250}
                        width={1300}
                        fontSize={17}
                        color={theme.warning}
                        contain="width"
                        maxLines={1}
                      >
                        {`Este provedor está fora do ar · Assistir toca pelo ${fallback().providerName}`}
                      </Text>
                    )}
                  </Show>
                </View>
              </View>

              <Show when={sourceChoice()}>
                {list => (
                  <SourcePicker
                    ref={node => {
                      sourceRow = node;
                      onCleanup(() => {
                        if (sourceRow === node) sourceRow = undefined;
                      });
                    }}
                    sources={list()}
                    onUp={focusActions}
                    onDown={() => focusRelated() || true}
                    onPick={source => navigate(`/player/movie/${source.id}`)}
                  />
                )}
              </Show>

              <DetailOverview
                plot={currentMovie().plot}
                cast={currentMovie().cast}
                director={currentMovie().director}
              />

              {/* Related rail — last child so the Column has room to scroll it
                  fully into view when focused from the action row. */}
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
                    title="Títulos parecidos"
                    items={similar()}
                    onFocus={() => {
                      if (!relatedSection) return;
                      setPageOffset(
                        Math.min(0, RELATED_SECTION_TOP - (relatedSection.y ?? RELATED_SECTION_TOP)),
                      );
                    }}
                    onSelectedChanged={index => {
                      const item = similar()?.[index];
                      if (item) api.prefetchMovie(item.id);
                    }}
                    onItemSelected={item => navigate(`/movie/${item.id}`)}
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

export default MovieDetail;
