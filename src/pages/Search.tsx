import { type ElementNode, Text, View } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import {
  createEffect,
  createResource,
  createSignal,
  For,
  Index,
  onCleanup,
  Show,
  startTransition,
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Card, VirtualKeyboard } from "../components";
import api, { type Channel, type Movie, type Series } from "../lib/api";
import { pickPoster, proxyImageUrl } from "../lib/imageUrl";
import { theme } from "@/styles";

const LEFT_PANEL_X = 20;
const LEFT_PANEL_WIDTH = 860;
const RIGHT_PANEL_X = 920;
const RIGHT_PANEL_WIDTH = 740;
const SUGGESTION_SLOT_HEIGHT = 64;
const RESULT_GRID_COLUMNS = 3;
const RESULT_CARD_WIDTH = 185;
const RESULT_CARD_HEIGHT = 278;
const RESULT_CARD_GAP = 16;
const RESULT_ROW_HEIGHT = RESULT_CARD_HEIGHT + 62;
const RESULT_SECTION_HEADER_HEIGHT = 34;

function chunkItems<T>(items: readonly T[] | undefined, size: number): T[][] {
  const chunks: T[][] = [];
  const source = items ?? [];

  for (let i = 0; i < source.length; i += size) {
    chunks.push(source.slice(i, i + size));
  }

  return chunks;
}

const Search = () => {
  const navigate = useNavigate();
  const [query, setQuery] = createSignal("");
  const [searchTriggered, setSearchTriggered] = createSignal(false);
  // Debounced mirror of `query` used to fire typeahead while the user types.
  const [debouncedQuery, setDebouncedQuery] = createSignal("");

  let keyboardColumn: ElementNode | undefined;
  let suggestionsColumn: ElementNode | undefined;
  let resultsColumn: ElementNode | undefined;
  const [keyboardFocusRequest, setKeyboardFocusRequest] = createSignal(0);

  // Live typeahead — fires ~180ms after the last keystroke so each press
  // doesn't hammer the API. Goes silent once OK is pressed (full results
  // take over below).
  createEffect(() => {
    const q = query();
    if (searchTriggered()) return;
    const timer = setTimeout(() => {
      // setDebouncedQuery flips the suggest resource source accessor. Without
      // a transition, the resource goes pending and the enclosing Suspense
      // boundary flashes its fallback — wiping the whole content area
      // (including sidebar) for a frame.
      startTransition(() => setDebouncedQuery(q));
    }, 180);
    onCleanup(() => clearTimeout(timer));
  });

  const [suggestions] = createResource(
    () => (!searchTriggered() && debouncedQuery().trim().length >= 2 ? debouncedQuery().trim() : null),
    q => api.suggest(q, 10).catch(() => null),
    // Seed with an empty payload so `.latest` is never undefined on the first
    // fetch — otherwise Solid's `.latest` falls back to `()` behaviour and
    // still trips the enclosing Suspense (the exact bug we were chasing).
    { initialValue: { query: "", items: [] } },
  );

  // Full ranked results — only after the user presses OK.
  const [results] = createResource(
    () => (searchTriggered() ? query().trim() : null),
    async q => {
      if (!q || q.length < 2) return null;
      return api.search(q, 30);
    },
    { initialValue: { query: "", movies: [], series: [], channels: [] } as const },
  );

  const handleKeyboardChange = (value: string) => {
    startTransition(() => {
      setQuery(value);
      setSearchTriggered(false);
    });
  };

  const submitSearch = () => {
    startTransition(() => {
      if (query().trim().length >= 2) {
        setSearchTriggered(true);
      }
    });
    return true;
  };

  // Reading `results.latest` instead of `results()` avoids tripping the
  // Suspense boundary up the tree — every `results()` access while the fetch
  // is pending would flash the AppShell/MainLayout Suspense fallback (a
  // full-viewport dark View), which is exactly what was wiping the sidebar
  // and content for ~200ms after each keystroke / suggestion click.
  const totalResults = () => {
    const r = results.latest;
    if (!r) return 0;
    return (r.movies?.length || 0) + (r.series?.length || 0) + (r.channels?.length || 0);
  };

  // Keep the last resolved suggestion payload visible during refetch so the
  // suggestions block doesn't blink each keystroke (createResource returns
  // undefined while refetching). `latest` falls back to the last non-empty
  // response we saw.
  const latestSuggestions = () => suggestions.latest ?? null;
  const cursorX = () => Math.min(LEFT_PANEL_WIDTH - 28, 22 + query().length * 18);

  // Shared handler: land on the first focusable result when the user steps
  // out of the keyboard to the right. Prefers suggestion items first (if
  // showing), otherwise jumps into the results grid.
  const focusResults = () => {
    if (!searchTriggered() && latestSuggestions()?.items?.length) {
      suggestionsColumn?.setFocus();
      return true;
    }
    if (searchTriggered() && totalResults() > 0) {
      resultsColumn?.setFocus();
      return true;
    }
    return false;
  };

  const focusKeyboardHome = () => {
    setKeyboardFocusRequest(value => value + 1);
    return true;
  };

  return (
    <View
      width={1700}
      height={1080}
      forwardFocus={() => {
        return focusKeyboardHome();
      }}
    >
      {/* Header — fixed band at the top, skipFocus so D-pad never lands here. */}
      <View y={30} x={20} width={1660} height={60} skipFocus>
        <Text fontSize={42} fontWeight={700} color={0xffffffff}>
          Buscar
        </Text>
      </View>

      {/* Search input display — aligned with the keyboard beneath it. */}
      <View
        x={LEFT_PANEL_X}
        y={110}
        width={LEFT_PANEL_WIDTH}
        height={60}
        color={0x1a1a2eff}
        borderRadius={8}
        border={{ color: theme.border, width: 1 }}
        skipFocus
      >
        <Text x={20} y={15} fontSize={28} color={query() ? 0xffffffff : 0x666666ff}>
          {query() || "Digite para buscar..."}
        </Text>
        <View x={cursorX()} y={18} width={3} height={30} color={0xe50914ff} />
      </View>

      <View x={LEFT_PANEL_X} y={200} width={LEFT_PANEL_WIDTH}>
        <VirtualKeyboard
          ref={keyboardColumn}
          value={query()}
          autofocus
          homeRow={2}
          focusRequest={keyboardFocusRequest()}
          onChange={handleKeyboardChange}
          onSubmit={submitSearch}
          onRight={focusResults}
        />
      </View>

      {/* Live typeahead — kept mounted across search state transitions and
           cross-faded via alpha. Mount/unmount was flashing the canvas
           because Lightning needed a frame to settle the new subtree; fading
           in/out lets the scene graph stay stable. */}
      {(() => {
        const showSuggestions = () => !searchTriggered() && (latestSuggestions()?.items?.length ?? 0) > 0;
        return (
          <>
            <View
              x={RIGHT_PANEL_X}
              y={110}
              width={RIGHT_PANEL_WIDTH}
              height={60}
              alpha={showSuggestions() ? 1 : 0}
              transition={{ alpha: { duration: 180 } }}
              skipFocus
            >
              <Text fontSize={16} color={theme.textMuted}>
                Sugestões (aperte OK para ver tudo)
              </Text>
            </View>
            <Column
              ref={suggestionsColumn}
              x={RIGHT_PANEL_X}
              y={170}
              width={RIGHT_PANEL_WIDTH}
              height={860}
              gap={8}
              scroll="none"
              alpha={showSuggestions() ? 1 : 0}
              transition={{ alpha: { duration: 180 } }}
              skipFocus={!showSuggestions()}
              onLeft={() => {
                return focusKeyboardHome();
              }}
            >
              {/* Pre-allocated slots — Index over a static [0..7] array so
              Lightning instantiates 8 Views ONCE on first mount. As suggestions
              arrive we only update the Text content of each slot; the scene
              graph never grows or shrinks, so the typeahead block doesn't
              flash when new data lands. Slots with no data go alpha=0 +
              skipFocus. */}
              <Index each={[0, 1, 2, 3, 4, 5, 6, 7]}>
                {slotIndex => {
                  const item = () => latestSuggestions()?.items?.[slotIndex()];
                  const hasItem = () => !!item();
                  return (
                    <View
                      width={RIGHT_PANEL_WIDTH}
                      height={SUGGESTION_SLOT_HEIGHT}
                      color={theme.surface}
                      borderRadius={8}
                      border={{ color: theme.border, width: 1 }}
                      transition={{
                        alpha: { duration: 150 },
                        color: { duration: 120 },
                        scale: { duration: 120 },
                      }}
                      scale={1}
                      alpha={hasItem() ? 1 : 0}
                      skipFocus={!hasItem()}
                      $focus={{
                        color: theme.surfaceHover,
                        border: { color: theme.primary, width: 2 },
                        scale: 1.01,
                      }}
                      onEnter={() => {
                        const picked = item();
                        if (!picked) return true;
                        startTransition(() => {
                          setQuery(picked.title);
                          setSearchTriggered(true);
                        });
                        queueMicrotask(() => queueMicrotask(() => resultsColumn?.setFocus()));
                        return true;
                      }}
                    >
                      <Text
                        x={20}
                        y={19}
                        fontSize={20}
                        fontWeight={700}
                        color={theme.textPrimary}
                        width={500}
                        maxLines={1}
                        contain="width"
                      >
                        {item()?.title ?? ""}
                      </Text>
                      <Text
                        x={540}
                        y={22}
                        width={180}
                        fontSize={16}
                        color={theme.textMuted}
                        textAlign="right"
                        contain="width"
                        maxLines={1}
                      >
                        {(() => {
                          const it = item();
                          if (!it) return "";
                          const label =
                            it.type === "movie" ? "Filme" : it.type === "series" ? "Série" : "Canal";
                          return it.year ? `${label} · ${it.year}` : label;
                        })()}
                      </Text>
                    </View>
                  );
                }}
              </Index>
            </Column>
          </>
        );
      })()}

      {/* Results — full ranked payload after OK. */}
      {/* Results — always mounted; alpha flips so switching between suggestions
           and results cross-fades instead of tearing down scene graph subtrees
           (which was flashing the canvas). */}
      {(() => {
        const showResults = () => searchTriggered() && totalResults() > 0;
        const showEmpty = () => searchTriggered() && !results.loading && totalResults() === 0;
        const showLoading = () => searchTriggered() && results.loading && totalResults() === 0;
        const movieRows = () => chunkItems(results.latest?.movies, RESULT_GRID_COLUMNS);
        const seriesRows = () => chunkItems(results.latest?.series, RESULT_GRID_COLUMNS);
        const channelRows = () => chunkItems(results.latest?.channels, 4);
        const hasMovies = () => movieRows().length > 0;
        const hasSeries = () => seriesRows().length > 0;
        const hasChannels = () => channelRows().length > 0;
        return (
          <>
            <View
              x={RIGHT_PANEL_X}
              y={170}
              width={RIGHT_PANEL_WIDTH}
              height={400}
              display="flex"
              justifyContent="center"
              alignItems="center"
              alpha={showLoading() ? 1 : 0}
              transition={{ alpha: { duration: 180 } }}
              skipFocus
            >
              <Text fontSize={28} color={0x888888ff}>
                Buscando...
              </Text>
            </View>

            <View
              x={RIGHT_PANEL_X}
              y={170}
              width={RIGHT_PANEL_WIDTH}
              height={400}
              display="flex"
              justifyContent="center"
              alignItems="center"
              alpha={showEmpty() ? 1 : 0}
              transition={{ alpha: { duration: 180 } }}
              skipFocus
            >
              <Text fontSize={28} color={0x888888ff}>
                Nenhum resultado encontrado
              </Text>
            </View>

            <Column
              ref={resultsColumn}
              x={RIGHT_PANEL_X}
              y={170}
              width={RIGHT_PANEL_WIDTH}
              height={890}
              gap={24}
              scroll="auto"
              clipping
              alpha={showResults() ? 1 : 0}
              transition={{ alpha: { duration: 180 } }}
              skipFocus={!showResults()}
              onLeft={() => {
                return focusKeyboardHome();
              }}
            >
              {/* Movies */}
              <Show when={hasMovies()}>
                <View width={RIGHT_PANEL_WIDTH} height={RESULT_SECTION_HEADER_HEIGHT} skipFocus>
                  <Text fontSize={24} color={0xffffffff} fontWeight={700}>
                    {`Filmes (${results.latest!.movies.length})`}
                  </Text>
                </View>
              </Show>
              <For each={movieRows()}>
                {row => (
                  <Row
                    width={RIGHT_PANEL_WIDTH}
                    height={RESULT_ROW_HEIGHT}
                    gap={RESULT_CARD_GAP}
                    scroll="none"
                  >
                    <For each={row}>
                      {(movie: Movie) => (
                        <Card
                          title={movie.title || movie.name || ""}
                          imageUrl={pickPoster(movie, 240)}
                          subtitle={movie.year?.toString()}
                          width={RESULT_CARD_WIDTH}
                          height={RESULT_CARD_HEIGHT}
                          onEnter={() => {
                            navigate(`/movie/${movie.id}`);
                            return true;
                          }}
                        />
                      )}
                    </For>
                  </Row>
                )}
              </For>

              {/* Series */}
              <Show when={hasSeries()}>
                <View width={RIGHT_PANEL_WIDTH} height={RESULT_SECTION_HEADER_HEIGHT} skipFocus>
                  <Text fontSize={24} color={0xffffffff} fontWeight={700}>
                    {`Séries (${results.latest!.series.length})`}
                  </Text>
                </View>
              </Show>
              <For each={seriesRows()}>
                {row => (
                  <Row
                    width={RIGHT_PANEL_WIDTH}
                    height={RESULT_ROW_HEIGHT}
                    gap={RESULT_CARD_GAP}
                    scroll="none"
                  >
                    <For each={row}>
                      {(show: Series) => (
                        <Card
                          title={show.title || show.name || ""}
                          imageUrl={pickPoster(show, 240)}
                          subtitle={show.year?.toString()}
                          width={RESULT_CARD_WIDTH}
                          height={RESULT_CARD_HEIGHT}
                          onEnter={() => {
                            navigate(`/series/${show.id}`);
                            return true;
                          }}
                        />
                      )}
                    </For>
                  </Row>
                )}
              </For>

              {/* Channels */}
              <Show when={hasChannels()}>
                <View width={RIGHT_PANEL_WIDTH} height={RESULT_SECTION_HEADER_HEIGHT} skipFocus>
                  <Text fontSize={24} color={0xffffffff} fontWeight={700}>
                    {`Canais (${results.latest!.channels.length})`}
                  </Text>
                </View>
              </Show>
              <For each={channelRows()}>
                {row => (
                  <Row width={RIGHT_PANEL_WIDTH} height={140} gap={15} scroll="none">
                    <For each={row}>
                      {(channel: Channel) => (
                        <ChannelResult
                          channel={channel}
                          onSelect={() => {
                            navigate(`/player/channel/${channel.id}`);
                            return true;
                          }}
                        />
                      )}
                    </For>
                  </Row>
                )}
              </For>
            </Column>
          </>
        );
      })()}
    </View>
  );
};

interface ChannelResultProps {
  channel: Channel;
  onSelect: () => boolean | void;
}

const ChannelResult = (props: ChannelResultProps) => {
  const [focused, setFocused] = createSignal(false);

  return (
    <View
      width={170}
      height={120}
      color={focused() ? 0x333333ff : 0x222222ff}
      borderRadius={8}
      border={focused() ? { color: 0xe50914ff, width: 2 } : undefined}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onEnter={props.onSelect}
    >
      <Show when={props.channel.logo_url}>
        <View
          x={35}
          y={15}
          width={100}
          height={60}
          src={proxyImageUrl(props.channel.logo_url, 200)}
          color={0xffffffff}
        />
      </Show>
      <Text
        x={10}
        y={85}
        width={150}
        fontSize={14}
        color={0xccccccff}
        contain="both"
        textOverflow="ellipsis"
        textAlign="center"
        maxLines={1}
      >
        {props.channel.name}
      </Text>
    </View>
  );
};

export default Search;
