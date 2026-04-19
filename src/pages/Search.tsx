import { type ElementNode, Text, View } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import { createEffect, createResource, createSignal, For, Index, onCleanup, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Card } from "../components";
import api, { type Channel, type Movie, type Series } from "../lib/api";
import { pickPoster, proxyImageUrl } from "../lib/imageUrl";
import { theme } from "@/styles";

const KEYBOARD_ROWS = [
  ["A", "B", "C", "D", "E", "F", "G"],
  ["H", "I", "J", "K", "L", "M", "N"],
  ["O", "P", "Q", "R", "S", "T", "U"],
  ["V", "W", "X", "Y", "Z", "0", "1"],
  ["2", "3", "4", "5", "6", "7", "8"],
  ["9", " ", "DEL", "OK"],
];

const Search = () => {
  const navigate = useNavigate();
  const [query, setQuery] = createSignal("");
  const [searchTriggered, setSearchTriggered] = createSignal(false);
  // Debounced mirror of `query` used to fire typeahead while the user types.
  const [debouncedQuery, setDebouncedQuery] = createSignal("");

  let keyboardColumn: ElementNode | undefined;
  let suggestionsColumn: ElementNode | undefined;
  let resultsColumn: ElementNode | undefined;

  // Live typeahead — fires ~180ms after the last keystroke so each press
  // doesn't hammer the API. Goes silent once OK is pressed (full results
  // take over below).
  createEffect(() => {
    const q = query();
    if (searchTriggered()) return;
    const timer = setTimeout(() => setDebouncedQuery(q), 180);
    onCleanup(() => clearTimeout(timer));
  });

  const [suggestions] = createResource(
    () => (!searchTriggered() && debouncedQuery().trim().length >= 2 ? debouncedQuery().trim() : null),
    q => api.suggest(q, 10).catch(() => null),
  );

  // Full ranked results — only after the user presses OK.
  const [results] = createResource(
    () => (searchTriggered() ? query().trim() : null),
    async q => {
      if (!q || q.length < 2) return null;
      return api.search(q, 10);
    },
  );

  const handleKey = (key: string) => {
    if (key === "DEL") {
      setQuery(q => q.slice(0, -1));
      // Back to typeahead while the user is editing — the full results grid
      // was firing /catalog/search on every backspace otherwise.
      setSearchTriggered(false);
      return true;
    } else if (key === "OK") {
      if (query().trim().length >= 2) {
        setSearchTriggered(true);
      }
      return true;
    } else if (key === " ") {
      setQuery(q => q + " ");
      setSearchTriggered(false);
      return true;
    } else {
      setQuery(q => q + key);
      setSearchTriggered(false);
      return true;
    }
  };

  const totalResults = () => {
    const r = results();
    if (!r) return 0;
    return (r.movies?.length || 0) + (r.series?.length || 0) + (r.channels?.length || 0);
  };

  // Keep the last resolved suggestion payload visible during refetch so the
  // suggestions block doesn't blink each keystroke (createResource returns
  // undefined while refetching). `latest` falls back to the last non-empty
  // response we saw.
  const latestSuggestions = () => suggestions.latest ?? null;

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

  return (
    <View
      width={1700}
      height={1080}
      forwardFocus={() => {
        keyboardColumn?.setFocus();
        return true;
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
        x={20}
        y={110}
        width={500}
        height={60}
        color={0x1a1a2eff}
        borderRadius={8}
        border={{ color: theme.border, width: 1 }}
        skipFocus
      >
        <Text x={20} y={15} fontSize={28} color={query() ? 0xffffffff : 0x666666ff}>
          {query() || "Digite para buscar..."}
        </Text>
        <View x={query().length * 16 + 20} y={10} width={3} height={40} color={0xe50914ff} />
      </View>

      {/* Keyboard — Column wraps Rows. Lightning's built-in Row nav handles
           Left/Right between keys; we only care about the bubble that happens
           when Row.onRight default says "no more kids that way". The Column's
           onRight fires in that exact case and jumps to the results. */}
      <Column
        ref={keyboardColumn}
        x={20}
        y={200}
        width={500}
        height={320}
        gap={10}
        autofocus
        forwardFocus={0}
        onRight={focusResults}
      >
        <For each={KEYBOARD_ROWS}>
          {row => (
            <Row width={500} height={45} gap={8}>
              <For each={row}>{key => <KeyboardKey key={key} onPress={() => handleKey(key)} />}</For>
            </Row>
          )}
        </For>
      </Column>

      {/* Live typeahead column — only while the user is still typing. */}
      <Show when={!searchTriggered() && (latestSuggestions()?.items?.length ?? 0) > 0}>
        <View x={560} y={110} width={1120} height={60} skipFocus>
          <Text fontSize={16} color={theme.textMuted}>
            Sugestões (aperte OK para ver tudo)
          </Text>
        </View>
        <Column
          ref={suggestionsColumn}
          x={560}
          y={170}
          width={1120}
          height={860}
          gap={8}
          scroll="auto"
          clipping
          onLeft={() => {
            keyboardColumn?.setFocus();
            return true;
          }}
        >
          {/* Use Index instead of For: For keys by reference, and every
              /catalog/suggest response is a fresh array — the whole list
              was torn down and remounted per keystroke, causing the blink.
              Index keys by position so the same <View>s are reused with
              updated content. */}
          <Index each={latestSuggestions()!.items.slice(0, 8)}>
            {item => (
              <View
                width={1120}
                height={72}
                color={theme.surface}
                borderRadius={14}
                border={{ color: theme.border, width: 1 }}
                display="flex"
                alignItems="center"
                transition={{ color: { duration: 120 }, scale: { duration: 120 } }}
                scale={1}
                $focus={{
                  color: theme.surfaceHover,
                  border: { color: theme.primary, width: 2 },
                  scale: 1.01,
                }}
                onEnter={() => {
                  const picked = item();
                  setQuery(picked.title);
                  setSearchTriggered(true);
                  // The Show wrapping suggestionsColumn is about to flip false
                  // and unmount this node — move focus to the results Column
                  // as soon as it mounts on the next tick, otherwise the
                  // D-pad ends up stranded on a detached node.
                  queueMicrotask(() => queueMicrotask(() => resultsColumn?.setFocus()));
                  return true;
                }}
              >
                <Text
                  x={20}
                  y={20}
                  fontSize={22}
                  fontWeight={700}
                  color={theme.textPrimary}
                  width={820}
                  maxLines={1}
                  contain="width"
                >
                  {item().title}
                </Text>
                <Text x={860} y={26} fontSize={16} color={theme.textMuted}>
                  {item().type === "movie" ? "Filme" : item().type === "series" ? "Série" : "Canal"}
                  {item().year ? ` · ${item().year}` : ""}
                </Text>
              </View>
            )}
          </Index>
        </Column>
      </Show>

      {/* Results — full ranked payload after OK. */}
      <View x={560} y={170} width={1120} height={890} skipFocus>
        <Show when={results.loading}>
          <View width={1120} height={400} display="flex" justifyContent="center" alignItems="center">
            <Text fontSize={28} color={0x888888ff}>
              Buscando...
            </Text>
          </View>
        </Show>

        <Show when={searchTriggered() && !results.loading && totalResults() === 0}>
          <View width={1120} height={400} display="flex" justifyContent="center" alignItems="center">
            <Text fontSize={28} color={0x888888ff}>
              Nenhum resultado encontrado
            </Text>
          </View>
        </Show>

        <Show when={searchTriggered() && totalResults() > 0}>
          <Column
            ref={resultsColumn}
            width={1120}
            height={890}
            gap={24}
            scroll="auto"
            clipping
            onLeft={() => {
              keyboardColumn?.setFocus();
              return true;
            }}
          >
            {/* Movies */}
            <Show when={results()?.movies?.length}>
              <View width={1100} height={400}>
                <Text fontSize={24} color={0xffffffff} fontWeight={700}>
                  {`Filmes (${results()!.movies.length})`}
                </Text>
                <Row y={40} width={1100} height={360} gap={15}>
                  <For each={results()!.movies.slice(0, 4)}>
                    {(movie: Movie) => (
                      <Card
                        title={movie.title || movie.name || ""}
                        imageUrl={pickPoster(movie, 240)}
                        subtitle={movie.year?.toString()}
                        width={200}
                        height={300}
                        onEnter={() => {
                          navigate(`/movie/${movie.id}`);
                          return true;
                        }}
                      />
                    )}
                  </For>
                </Row>
              </View>
            </Show>

            {/* Series */}
            <Show when={results()?.series?.length}>
              <View width={1100} height={400}>
                <Text fontSize={24} color={0xffffffff} fontWeight={700}>
                  {`Séries (${results()!.series.length})`}
                </Text>
                <Row y={40} width={1100} height={360} gap={15}>
                  <For each={results()!.series.slice(0, 4)}>
                    {(show: Series) => (
                      <Card
                        title={show.title || show.name || ""}
                        imageUrl={pickPoster(show, 240)}
                        subtitle={show.year?.toString()}
                        width={200}
                        height={300}
                        onEnter={() => {
                          navigate(`/series/${show.id}`);
                          return true;
                        }}
                      />
                    )}
                  </For>
                </Row>
              </View>
            </Show>

            {/* Channels */}
            <Show when={results()?.channels?.length}>
              <View width={1100} height={180}>
                <Text fontSize={24} color={0xffffffff} fontWeight={700}>
                  {`Canais (${results()!.channels.length})`}
                </Text>
                <Row y={40} width={1100} height={140} gap={15}>
                  <For each={results()!.channels.slice(0, 6)}>
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
              </View>
            </Show>
          </Column>
        </Show>
      </View>
    </View>
  );
};

interface KeyboardKeyProps {
  key: string;
  onPress: () => boolean | void;
}

const KeyboardKey = (props: KeyboardKeyProps) => {
  const [focused, setFocused] = createSignal(false);

  const isSpecial = props.key === "DEL" || props.key === "OK" || props.key === " ";
  const width = isSpecial ? 90 : 60;

  return (
    <View
      width={width}
      height={45}
      color={focused() ? 0xe50914ff : 0x333333ff}
      borderRadius={6}
      display="flex"
      justifyContent="center"
      alignItems="center"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onEnter={props.onPress}
    >
      <Text fontSize={20} color={focused() ? 0xffffffff : 0xccccccff}>
        {props.key === " " ? "SPC" : props.key}
      </Text>
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
