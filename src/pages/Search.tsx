import { type ElementNode, Text, View } from "@solidtv/solid";
import { Column, LazyColumn, Row } from "@solidtv/solid/primitives";
import {
  type Accessor,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Index,
  onCleanup,
  Show,
  startTransition,
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useLayoutFocus } from "@/app/layoutFocus";
import { Card, VirtualKeyboard } from "@/components";
import api, { type Channel, type Movie, type Series, type SuggestItem } from "@/lib/api";
import { chunkIntoRows } from "@/lib/contentMeta";
import { pickPoster, proxyImageUrl } from "@/lib/imageUrl";
import { theme } from "@/styles";

const LEFT_PANEL_X = 20;
const LEFT_PANEL_WIDTH = 860;
const RIGHT_PANEL_X = 920;
const RIGHT_PANEL_WIDTH = 740;
const HEADER_Y = 30;
const SEARCH_INPUT_Y = 126;
const KEYBOARD_Y = 226;
const SIDE_PANEL_TITLE_Y = SEARCH_INPUT_Y + 8;
const SIDE_PANEL_CONTENT_Y = 212;
const SIDE_PANEL_CONTENT_HEIGHT = 820;
const SUGGESTION_SLOT_HEIGHT = 68;
const SUGGESTION_SLOT_COUNT = 8;
const SUGGESTION_SLOT_GAP = 8;
const SUGGESTION_PANEL_PADDING = 16;
// Derived, not hand-tuned: a hardcoded 650 stopped 44px short of the slot
// column, so the eighth suggestion rendered outside the panel background.
const SUGGESTION_PANEL_HEIGHT =
  SIDE_PANEL_CONTENT_Y -
  (SIDE_PANEL_TITLE_Y - SUGGESTION_PANEL_PADDING) +
  SUGGESTION_SLOT_COUNT * SUGGESTION_SLOT_HEIGHT +
  (SUGGESTION_SLOT_COUNT - 1) * SUGGESTION_SLOT_GAP +
  SUGGESTION_PANEL_PADDING;
// Idle-state discovery rail: before the query is long enough to suggest
// anything, the right panel was pure black. Three posters at the real 2:3
// aspect fit the panel's 616px of content height with room to breathe.
const DISCOVER_COUNT = 3;
const DISCOVER_CARD_WIDTH = 224;
const DISCOVER_CARD_HEIGHT = 336;
const DISCOVER_CARD_GAP = 16;

// Stable identity so <Index> instantiates the slot views exactly once.
const SUGGESTION_SLOTS = Array.from({ length: SUGGESTION_SLOT_COUNT }, (_, index) => index);
const RESULTS_PANEL_X = 20;
const RESULTS_PANEL_WIDTH = 1660;
const RESULTS_TITLE_Y = 202;
const RESULTS_CONTENT_Y = 242;
const RESULTS_CONTENT_HEIGHT = 1080 - RESULTS_CONTENT_Y;
const RESULTS_GRID_X = 40;
const RESULTS_GRID_Y = 36;
const RESULTS_GRID_WIDTH = 1620;
const RESULT_GRID_COLUMNS = 6;
const RESULT_CHANNEL_COLUMNS = 8;
const RESULT_CARD_WIDTH = 240;
const RESULT_CARD_HEIGHT = 360;
const RESULT_CARD_GAP = 16;
const RESULT_ROW_HEIGHT = RESULT_CARD_HEIGHT + 62;
const RESULT_SECTION_HEADER_HEIGHT = 34;
const SEARCH_RESULT_LIMIT = 20;

type SearchResultRow =
  | { kind: "movie"; items: Movie[]; heading?: string }
  | { kind: "series"; items: Series[]; heading?: string }
  | { kind: "channel"; items: Channel[]; heading?: string };

interface SearchResultBuckets {
  movies: readonly Movie[];
  series: readonly Series[];
  channels: readonly Channel[];
}

function buildResultRows(result?: SearchResultBuckets | null): SearchResultRow[] {
  if (!result) return [];
  const rows: SearchResultRow[] = [];

  chunkIntoRows(result.movies, RESULT_GRID_COLUMNS).forEach((items, index) => {
    rows.push({
      kind: "movie",
      items,
      heading: index === 0 ? `Filmes (${result.movies.length})` : undefined,
    });
  });
  chunkIntoRows(result.series, RESULT_GRID_COLUMNS).forEach((items, index) => {
    rows.push({
      kind: "series",
      items,
      heading: index === 0 ? `Séries (${result.series.length})` : undefined,
    });
  });
  chunkIntoRows(result.channels, RESULT_CHANNEL_COLUMNS).forEach((items, index) => {
    rows.push({
      kind: "channel",
      items,
      heading: index === 0 ? `Canais (${result.channels.length})` : undefined,
    });
  });

  return rows;
}

const Search = () => {
  const layoutFocus = useLayoutFocus();
  const [query, setQuery] = createSignal("");
  const [searchTriggered, setSearchTriggered] = createSignal(false);
  // Debounced mirror of `query` used to fire typeahead while the user types.
  const [debouncedQuery, setDebouncedQuery] = createSignal("");

  const navigate = useNavigate();

  let keyboardColumn: ElementNode | undefined;
  let searchInput: ElementNode | undefined;
  let suggestionsColumn: ElementNode | undefined;
  let discoverRow: ElementNode | undefined;
  let resultsColumn: ElementNode | undefined;
  const [keyboardFocusRequest, setKeyboardFocusRequest] = createSignal(0);
  const [focusedSuggestionSlot, setFocusedSuggestionSlot] = createSignal(-1);
  const [inputFocused, setInputFocused] = createSignal(false);

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
  const [results, { refetch: refetchResults }] = createResource(
    () => (searchTriggered() ? query().trim() : null),
    async q => {
      if (!q || q.length < 2) return null;
      return api.search(q, SEARCH_RESULT_LIMIT);
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
    const shouldRetry = searchTriggered() && Boolean(results.error);
    startTransition(() => {
      if (query().trim().length >= 2) {
        setSearchTriggered(true);
      }
    });
    if (shouldRetry) queueMicrotask(() => void refetchResults());
    requestAnimationFrame(() => searchInput?.setFocus());
    return true;
  };

  const editSearch = () => {
    if (!searchTriggered()) return false;
    startTransition(() => setSearchTriggered(false));
    requestAnimationFrame(focusKeyboardHome);
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
  const suggestionItems = (): SuggestItem[] =>
    (latestSuggestions()?.items ?? [])
      .filter((item): item is SuggestItem => !!item)
      .slice(0, SUGGESTION_SLOT_COUNT);
  // Trending stands in while the user has not typed enough to suggest. Kept
  // out of the suggestion resource so a failure here never blocks typeahead.
  const [discover] = createResource(() =>
    api
      .getTrending("movie", DISCOVER_COUNT)
      .then(response => response.items)
      .catch(() => []),
  );
  const discoverItems = () => (discover.latest ?? []).slice(0, DISCOVER_COUNT);

  const searchInputWidth = () => (searchTriggered() ? RESULTS_PANEL_WIDTH : LEFT_PANEL_WIDTH);
  const searchAccentWidth = () =>
    query() ? Math.min(searchInputWidth() - 40, Math.max(88, query().length * 18)) : 0;
  const resultRows = createMemo(() => buildResultRows(results.latest));

  // Shared handler: land on the first focusable result when the user steps
  // out of the keyboard to the right. Prefers suggestion items first (if
  // showing), otherwise jumps into the results grid.
  const focusResults = () => {
    if (!searchTriggered() && suggestionItems().length) {
      suggestionsColumn?.setFocus();
      return true;
    }
    if (!searchTriggered() && discoverItems().length && discoverRow) {
      discoverRow.setFocus();
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

  const focusSearchResults = () => {
    if (totalResults() <= 0) return false;
    resultsColumn?.setFocus();
    return resultsColumn !== undefined;
  };

  const leaveResultsLeft = () => layoutFocus?.focusSidebar() ?? false;

  const leaveResultsUp = () => {
    if ((resultsColumn?.selected ?? 0) > 0) return false;
    searchInput?.setFocus();
    return searchInput !== undefined;
  };

  return (
    <View
      width={1700}
      height={1080}
      forwardFocus={() => {
        if (!searchTriggered()) return focusKeyboardHome();
        searchInput?.setFocus();
        return searchInput !== undefined;
      }}
    >
      {/* Header — fixed band at the top, skipFocus so D-pad never lands here. */}
      <View y={HEADER_Y} x={20} width={1660} height={60} skipFocus>
        <Text fontSize={42} fontWeight={700} color={0xffffffff}>
          Buscar
        </Text>
      </View>

      {/* Search input display — aligned with the keyboard beneath it. */}
      <View
        ref={searchInput}
        x={LEFT_PANEL_X}
        y={SEARCH_INPUT_Y}
        width={searchInputWidth()}
        height={60}
        color={theme.surfaceMuted}
        borderRadius={8}
        border={{
          color: inputFocused() ? theme.primary : query() ? theme.borderLight : theme.border,
          width: inputFocused() ? 2 : 1,
        }}
        skipFocus={!searchTriggered()}
        onFocus={() => setInputFocused(true)}
        onBlur={() => setInputFocused(false)}
        onEnter={editSearch}
        onDown={focusSearchResults}
        onLeft={leaveResultsLeft}
      >
        <Text
          x={20}
          y={15}
          width={searchInputWidth() - 40}
          contain="width"
          maxLines={1}
          fontSize={28}
          color={query() ? 0xffffffff : 0x666666ff}
        >
          {query() || "Digite para buscar..."}
        </Text>
        <Show when={query()}>
          <View x={20} y={54} width={searchAccentWidth()} height={2} color={0xe50914cc} />
        </Show>
      </View>

      <Show when={!searchTriggered()}>
        <View x={LEFT_PANEL_X} y={KEYBOARD_Y} width={LEFT_PANEL_WIDTH}>
          <VirtualKeyboard
            ref={keyboardColumn}
            value={query()}
            autofocus
            homeRow={2}
            focusRequest={keyboardFocusRequest()}
            onChange={handleKeyboardChange}
            onSubmit={submitSearch}
            onRight={focusResults}
            // Without this the keyboard is a dead end: Left wraps inside the
            // key grid and the sidebar is only reachable with the Back key.
            // LoginPage already wires its own onLeft for the same reason.
            onLeft={leaveResultsLeft}
          />
        </View>
      </Show>

      {/* Live typeahead — kept mounted across search state transitions and
           cross-faded via alpha. Mount/unmount was flashing the canvas
           because Lightning needed a frame to settle the new subtree; fading
           in/out lets the scene graph stay stable. */}
      {(() => {
        const showSuggestions = () => !searchTriggered() && suggestionItems().length > 0;
        const showDiscover = () => !showSuggestions() && discoverItems().length > 0;
        return (
          <>
            <View
              x={RIGHT_PANEL_X - 18}
              y={SIDE_PANEL_TITLE_Y - SUGGESTION_PANEL_PADDING}
              width={RIGHT_PANEL_WIDTH + 36}
              height={SUGGESTION_PANEL_HEIGHT}
              color={theme.panel}
              borderRadius={8}
              border={{ color: theme.borderSubtle, width: 1 }}
              alpha={showSuggestions() ? 1 : 0}
              transition={{ alpha: { duration: 80 } }}
              skipFocus
            />
            <View
              x={RIGHT_PANEL_X}
              y={SIDE_PANEL_TITLE_Y}
              width={RIGHT_PANEL_WIDTH}
              height={60}
              alpha={showSuggestions() ? 1 : 0}
              transition={{ alpha: { duration: 80 } }}
              skipFocus
            >
              <Text fontSize={20} fontWeight={700} color={theme.textPrimary}>
                Sugestões
              </Text>
              <Text
                x={520}
                y={4}
                width={220}
                fontSize={15}
                color={theme.textMuted}
                textAlign="right"
                contain="width"
              >
                OK abre todos
              </Text>
            </View>
            <Column
              ref={suggestionsColumn}
              x={RIGHT_PANEL_X}
              y={SIDE_PANEL_CONTENT_Y}
              width={RIGHT_PANEL_WIDTH}
              height={SIDE_PANEL_CONTENT_HEIGHT}
              gap={SUGGESTION_SLOT_GAP}
              scroll="none"
              alpha={showSuggestions() ? 1 : 0}
              transition={{ alpha: { duration: 80 } }}
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
              <Index each={SUGGESTION_SLOTS}>
                {slotIndex => {
                  const item = () => suggestionItems()[slotIndex()];
                  const hasItem = () => !!item();
                  const isFocused = () => focusedSuggestionSlot() === slotIndex();
                  return (
                    <View
                      width={RIGHT_PANEL_WIDTH}
                      height={SUGGESTION_SLOT_HEIGHT}
                      color={isFocused() ? theme.surfaceHover : theme.surface}
                      borderRadius={8}
                      border={{
                        color: isFocused() ? theme.primary : theme.borderSubtle,
                        width: isFocused() ? 2 : 1,
                      }}
                      transition={{
                        color: { duration: 120 },
                      }}
                      alpha={hasItem() ? 1 : 0}
                      skipFocus={!hasItem()}
                      onFocus={() => {
                        setFocusedSuggestionSlot(slotIndex());
                      }}
                      onBlur={() => {
                        setFocusedSuggestionSlot(value => (value === slotIndex() ? -1 : value));
                      }}
                      onEnter={() => {
                        const picked = item();
                        if (!picked) return true;
                        startTransition(() => {
                          setQuery(picked.title);
                          setSearchTriggered(true);
                        });
                        requestAnimationFrame(() => searchInput?.setFocus());
                        return true;
                      }}
                    >
                      <View
                        x={0}
                        y={12}
                        width={4}
                        height={SUGGESTION_SLOT_HEIGHT - 24}
                        color={theme.primary}
                        alpha={isFocused() ? 1 : 0}
                        borderRadius={4}
                      />
                      <Text
                        x={22}
                        y={20}
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
                        y={23}
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

            {/* Idle state: suggestions need two characters, so until then the
                right panel had nothing in it. Trending posters give the user
                something to browse (and a reachable focus target) instead. */}
            <View
              x={RIGHT_PANEL_X}
              y={SIDE_PANEL_TITLE_Y}
              width={RIGHT_PANEL_WIDTH}
              height={60}
              alpha={showDiscover() ? 1 : 0}
              transition={{ alpha: { duration: 80 } }}
              skipFocus
            >
              <Text fontSize={20} fontWeight={700} color={theme.textPrimary}>
                Em alta
              </Text>
            </View>
            <Row
              ref={discoverRow}
              x={RIGHT_PANEL_X}
              y={SIDE_PANEL_CONTENT_Y}
              width={RIGHT_PANEL_WIDTH}
              height={DISCOVER_CARD_HEIGHT + 60}
              gap={DISCOVER_CARD_GAP}
              scroll="none"
              alpha={showDiscover() ? 1 : 0}
              transition={{ alpha: { duration: 80 } }}
              skipFocus={!showDiscover()}
              // Only the first poster hands focus back to the keyboard; from
              // any other column Left has to keep travelling inside the row.
              onLeft={() => {
                if ((discoverRow?.selected ?? 0) > 0) return false;
                return focusKeyboardHome();
              }}
            >
              <For each={discoverItems()}>
                {movie => (
                  <View
                    width={DISCOVER_CARD_WIDTH}
                    height={DISCOVER_CARD_HEIGHT + 44}
                    onEnter={() => {
                      navigate(`/movie/${movie.id}`);
                      return true;
                    }}
                  >
                    <Card
                      title={movie.title || movie.name || ""}
                      imageUrl={pickPoster(movie, DISCOVER_CARD_WIDTH)}
                      width={DISCOVER_CARD_WIDTH}
                      height={DISCOVER_CARD_HEIGHT}
                      item={movie}
                    />
                  </View>
                )}
              </For>
            </Row>
          </>
        );
      })()}

      {/* Results — full ranked payload after OK. */}
      {/* Results — always mounted; alpha flips so switching between suggestions
           and results cross-fades instead of tearing down scene graph subtrees
           (which was flashing the canvas). */}
      {(() => {
        const showResults = () => searchTriggered() && totalResults() > 0;
        const showError = () => searchTriggered() && !results.loading && Boolean(results.error);
        const showEmpty = () =>
          searchTriggered() && !results.loading && !results.error && totalResults() === 0;
        const showLoading = () => searchTriggered() && results.loading && totalResults() === 0;
        return (
          <>
            <View
              x={RESULTS_PANEL_X}
              y={RESULTS_TITLE_Y}
              width={RESULTS_PANEL_WIDTH}
              height={60}
              alpha={showResults() ? 1 : 0}
              transition={{ alpha: { duration: 80 } }}
              skipFocus
            >
              <Text fontSize={16} color={theme.textMuted}>
                {`${totalResults()} resultados`}
              </Text>
            </View>

            <View
              x={RESULTS_PANEL_X}
              y={RESULTS_CONTENT_Y}
              width={RESULTS_PANEL_WIDTH}
              height={400}
              display="flex"
              justifyContent="center"
              alignItems="center"
              alpha={showLoading() ? 1 : 0}
              transition={{ alpha: { duration: 180 } }}
              skipFocus
            >
              <Text fontSize={28} color={theme.textMuted}>
                Buscando...
              </Text>
            </View>

            <View
              x={RESULTS_PANEL_X}
              y={RESULTS_CONTENT_Y}
              width={RESULTS_PANEL_WIDTH}
              height={400}
              display="flex"
              justifyContent="center"
              alignItems="center"
              alpha={showEmpty() ? 1 : 0}
              transition={{ alpha: { duration: 180 } }}
              skipFocus
            >
              <Text fontSize={28} color={theme.textMuted}>
                Nenhum resultado encontrado
              </Text>
            </View>

            <View
              x={RESULTS_PANEL_X}
              y={RESULTS_CONTENT_Y}
              width={RESULTS_PANEL_WIDTH}
              height={400}
              display="flex"
              justifyContent="center"
              alignItems="center"
              alpha={showError() ? 1 : 0}
              transition={{ alpha: { duration: 180 } }}
              skipFocus
            >
              <Text
                width={RESULTS_PANEL_WIDTH - 80}
                fontSize={24}
                lineHeight={34}
                color={theme.textMuted}
                contain="both"
                textAlign="center"
                maxLines={2}
              >
                Não foi possível buscar. Selecione o campo acima para editar e tentar novamente.
              </Text>
            </View>

            <View y={RESULTS_CONTENT_Y} width={1700} height={RESULTS_CONTENT_HEIGHT} clipping skipFocus>
              <LazyColumn
                ref={resultsColumn}
                x={RESULTS_GRID_X}
                y={RESULTS_GRID_Y}
                width={RESULTS_GRID_WIDTH}
                height={RESULTS_CONTENT_HEIGHT - RESULTS_GRID_Y}
                gap={24}
                scroll="auto"
                alpha={showResults() ? 1 : 0}
                transition={{ alpha: { duration: 180 } }}
                skipFocus={!showResults()}
                each={resultRows()}
                upCount={3}
                buffer={1}
                delay={180}
                sync
                eagerLoad
                onLeft={() => {
                  return leaveResultsLeft();
                }}
                onUp={leaveResultsUp}
              >
                {row => <SearchResultGridRow row={row} />}
              </LazyColumn>
            </View>
          </>
        );
      })()}
    </View>
  );
};

interface SearchResultGridRowProps {
  row: Accessor<SearchResultRow>;
}

const SearchResultGridRow = (props: SearchResultGridRowProps) => {
  const navigate = useNavigate();
  const rowOffset = () => (props.row().heading ? RESULT_SECTION_HEADER_HEIGHT + 12 : 0);
  const rowHeight = () => (props.row().kind === "channel" ? 140 : RESULT_ROW_HEIGHT);

  return (
    <View
      width={RESULTS_GRID_WIDTH}
      height={rowHeight() + rowOffset()}
      item={props.row()}
      forwardFocus={props.row().heading ? 1 : 0}
    >
      <Show when={props.row().heading}>
        <View width={RESULTS_GRID_WIDTH} height={RESULT_SECTION_HEADER_HEIGHT} skipFocus>
          <Text fontSize={24} color={0xffffffff} fontWeight={700}>
            {props.row().heading}
          </Text>
        </View>
      </Show>

      <Show
        when={
          props.row().kind === "movie"
            ? (props.row() as Extract<SearchResultRow, { kind: "movie" }>)
            : undefined
        }
      >
        {movieRow => (
          <Row
            y={rowOffset()}
            width={RESULTS_GRID_WIDTH}
            height={RESULT_ROW_HEIGHT}
            gap={RESULT_CARD_GAP}
            scroll="none"
          >
            <For each={movieRow().items}>
              {movie => (
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
                  item={movie}
                />
              )}
            </For>
          </Row>
        )}
      </Show>

      <Show
        when={
          props.row().kind === "series"
            ? (props.row() as Extract<SearchResultRow, { kind: "series" }>)
            : undefined
        }
      >
        {seriesRow => (
          <Row
            y={rowOffset()}
            width={RESULTS_GRID_WIDTH}
            height={RESULT_ROW_HEIGHT}
            gap={RESULT_CARD_GAP}
            scroll="none"
          >
            <For each={seriesRow().items}>
              {show => (
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
                  item={show}
                />
              )}
            </For>
          </Row>
        )}
      </Show>

      <Show
        when={
          props.row().kind === "channel"
            ? (props.row() as Extract<SearchResultRow, { kind: "channel" }>)
            : undefined
        }
      >
        {channelRow => (
          <Row y={rowOffset()} width={RESULTS_GRID_WIDTH} height={140} gap={15} scroll="none">
            <For each={channelRow().items}>
              {channel => (
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
      </Show>
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
      item={props.channel}
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
          src={proxyImageUrl(props.channel.logo_url, 120)}
          color={0xffffffff}
          textureOptions={{ resizeMode: { type: "contain" } }}
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
