import { type ElementNode, Text, View } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import { createEffect, createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Card } from "../components";
import api, { type Channel, type Movie, type SearchResults, type Series } from "../lib/api";
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
      return true;
    } else if (key === "OK") {
      if (query().trim().length >= 2) {
        setSearchTriggered(true);
      }
      return true;
    } else if (key === " ") {
      setQuery(q => q + " ");
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

  return (
    <View
      width={1700}
      height={1080}
      forwardFocus={() => {
        keyboardColumn?.setFocus();
        return true;
      }}
    >
      {/* Header */}
      <View y={30} width={1700} height={60}>
        <Text fontSize={42} fontWeight={700} color={0xffffffff}>
          Buscar
        </Text>
        <Text y={48} fontSize={18} color={theme.textSecondary}>
          Misture busca direta com descoberta inteligente para achar mais rápido.
        </Text>
      </View>

      {/* Search Input Display */}
      <View y={100} width={600} height={60} color={0x1a1a2eff} borderRadius={8}>
        <Text x={20} y={15} fontSize={28} color={query() ? 0xffffffff : 0x666666ff}>
          {query() || "Digite para buscar..."}
        </Text>
        <View x={query().length * 16 + 20} y={10} width={3} height={40} color={0xe50914ff} />
      </View>

      {/* Keyboard */}
      <Column ref={keyboardColumn} y={180} width={500} height={300} gap={10} autofocus forwardFocus={0}>
        <For each={KEYBOARD_ROWS}>
          {row => (
            <Row width={500} height={45} gap={8}>
              <For each={row}>{key => <KeyboardKey key={key} onPress={() => handleKey(key)} />}</For>
            </Row>
          )}
        </For>
      </Column>

      {/* Results */}
      <View x={550} y={100} width={1150} height={950}>
        {/* Live typeahead while the user is still typing (before OK). */}
        <Show when={!searchTriggered() && suggestions()?.items?.length}>
          <View width={1150} height={36} skipFocus>
            <Text fontSize={16} color={theme.textMuted}>
              Sugestões enquanto você digita — aperte OK para ver tudo
            </Text>
          </View>
          <Row y={44} width={1150} height={64} gap={10} scroll="auto" skipFocus>
            <For each={suggestions()!.items.slice(0, 8)}>
              {item => (
                <View
                  width={220}
                  height={60}
                  color={theme.surface}
                  borderRadius={30}
                  border={{ color: theme.border, width: 1 }}
                  display="flex"
                  alignItems="center"
                  skipFocus
                >
                  <Text x={18} y={20} fontSize={16} color={theme.textPrimary} maxLines={1} width={184}>
                    {item.title}
                  </Text>
                </View>
              )}
            </For>
          </Row>
        </Show>

        <Show when={results.loading}>
          <View width={1150} height={400} display="flex" justifyContent="center" alignItems="center">
            <Text fontSize={28} color={0x888888ff}>
              Buscando...
            </Text>
          </View>
        </Show>

        <Show when={searchTriggered() && !results.loading && totalResults() === 0}>
          <View width={1150} height={400} display="flex" justifyContent="center" alignItems="center">
            <Text fontSize={28} color={0x888888ff}>
              Nenhum resultado encontrado
            </Text>
          </View>
        </Show>

        <Column
          y={suggestions()?.items?.length && !searchTriggered() ? 120 : 0}
          width={1150}
          height={suggestions()?.items?.length && !searchTriggered() ? 830 : 950}
          gap={30}
          scroll="always"
        >
          {/* Movies */}
          <Show when={results()?.movies?.length}>
            <View width={1150} height={450}>
              <Text fontSize={24} color={0xffffffff} fontWeight={700}>
                {`Filmes (${results()!.movies.length})`}
              </Text>
              <Row y={40} width={1150} height={400} gap={15}>
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
            <View width={1150} height={450}>
              <Text fontSize={24} color={0xffffffff} fontWeight={700}>
                {`Séries (${results()!.series.length})`}
              </Text>
              <Row y={40} width={1150} height={400} gap={15}>
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
            <View width={1150} height={200}>
              <Text fontSize={24} color={0xffffffff} fontWeight={700}>
                {`Canais (${results()!.channels.length})`}
              </Text>
              <Row y={40} width={1150} height={140} gap={15}>
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
