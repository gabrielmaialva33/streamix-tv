import { ElementNode, type IntrinsicNodeStyleProps, Text, View } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { SearchBox, SkeletonLoader } from "../components";
import api, { type Category, type Channel } from "../lib/api";

const ITEMS_PER_ROW = 8;
const HEADER_HEIGHT = 156;

// Style constants
const CategoryButtonStyle = {
  height: 40,
  borderRadius: 20,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  scale: 1,
  transition: {
    color: { duration: 150, easing: "ease-out" },
    scale: { duration: 150, easing: "ease-out" },
  },
  $focus: {
    color: 0xe50914ff,
    scale: 1.1,
  },
} satisfies IntrinsicNodeStyleProps;

const ChannelCardStyle = {
  width: 180,
  height: 130,
  color: 0x1a1a2eff,
  borderRadius: 12,
  scale: 1,
  transition: {
    scale: { duration: 150, easing: "ease-out" },
    color: { duration: 150, easing: "ease-out" },
  },
  $focus: {
    scale: 1.1,
    color: 0x2a2a3eff,
    border: { color: 0xe50914ff, width: 3 },
  },
} satisfies IntrinsicNodeStyleProps;

// Short palette for deterministic logo placeholders.
const PLACEHOLDER_COLORS = [
  0xe50914ff, // Streamix red
  0x1e88e5ff, // blue
  0x43a047ff, // green
  0xfb8c00ff, // orange
  0x8e24aaff, // purple
  0x00acc1ff, // teal
  0x3949abff, // indigo
  0xd81b60ff, // pink
];

function channelColorFromName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return PLACEHOLDER_COLORS[Math.abs(hash) % PLACEHOLDER_COLORS.length];
}

const Channels = () => {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = createSignal<number | undefined>(undefined);
  const [searchQuery, setSearchQuery] = createSignal<string | undefined>(undefined);

  let titleRow: ElementNode | undefined;
  let categoriesRow: ElementNode | undefined;
  let contentGrid: ElementNode | undefined;

  // Fetch categories
  const [categories] = createResource(() => api.getCategories("live"));

  // Fetch channels
  const [channels] = createResource(
    () => ({ category_id: selectedCategory(), limit: 100, search: searchQuery() }),
    params => api.getChannels(params),
  );

  // Separate accumulator signal — mirrors the Movies/Series pattern. Keeping
  // the rendered list in a signal (replaced on completed fetch) keeps the
  // Column's child count stable during refetches, so scroll="auto" + plinko
  // don't desync and wipe the grid off-screen.
  const [channelsData, setChannelsData] = createSignal<Channel[]>([]);

  createEffect(() => {
    const result = channels();
    if (result) setChannelsData(result.data);
  });

  // Handle search
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setSelectedCategory(undefined);
  };

  // Chunk channels into rows
  const channelRows = () => {
    const data = channelsData();
    const rows: Channel[][] = [];
    for (let i = 0; i < data.length; i += ITEMS_PER_ROW) {
      rows.push(data.slice(i, i + ITEMS_PER_ROW));
    }
    return rows;
  };

  // Navigate to channel player
  const handleChannelSelect = (channel: Channel) => {
    navigate(`/player/channel/${channel.id}`);
  };

  return (
    <View
      width={1700}
      height={1080}
      forwardFocus={() => {
        categoriesRow?.setFocus();
        return true;
      }}
    >
      <View x={0} y={0} width={1700} height={HEADER_HEIGHT} zIndex={10} color={0x0a0a0fff}>
        <Row
          ref={titleRow}
          width={1660}
          height={76}
          x={20}
          gap={20}
          scroll="none"
          onDown={() => categoriesRow?.setFocus()}
        >
          <View width={1350} skipFocus>
            <Text y={10} fontSize={42} fontWeight={700} color={0xffffffff}>
              Canais ao Vivo
            </Text>
          </View>
          <SearchBox onSearch={handleSearch} placeholder="Buscar canais..." />
        </Row>

        <Row
          ref={categoriesRow}
          x={20}
          y={98}
          width={1660}
          height={50}
          gap={12}
          scroll="auto"
          autofocus
          onUp={() => titleRow?.setFocus()}
          onDown={() => contentGrid?.setFocus()}
        >
          <View
            width={100}
            style={CategoryButtonStyle}
            color={selectedCategory() === undefined && !searchQuery() ? 0x3a1118ff : 0x222222ff}
            border={{
              color: selectedCategory() === undefined && !searchQuery() ? 0xe50914ff : 0x00000000,
              width: selectedCategory() === undefined && !searchQuery() ? 2 : 0,
            }}
            onEnter={() => {
              if (selectedCategory() === undefined && !searchQuery()) {
                return true;
              }
              setSelectedCategory(undefined);
              setSearchQuery(undefined);
              return true;
            }}
          >
            <Text width={84} fontSize={16} color={0xffffffff} textAlign="center" contain="width" maxLines={1}>
              Todos
            </Text>
          </View>
          <For each={categories()}>
            {(category: Category) => (
              <View
                width={Math.max(100, category.name.length * 10 + 24)}
                style={CategoryButtonStyle}
                color={selectedCategory() === category.id && !searchQuery() ? 0x3a1118ff : 0x222222ff}
                border={{
                  color: selectedCategory() === category.id && !searchQuery() ? 0xe50914ff : 0x00000000,
                  width: selectedCategory() === category.id && !searchQuery() ? 2 : 0,
                }}
                onEnter={() => {
                  if (selectedCategory() === category.id && !searchQuery()) {
                    return true;
                  }
                  setSelectedCategory(category.id);
                  setSearchQuery(undefined);
                  return true;
                }}
              >
                <Text
                  width={Math.max(68, category.name.length * 10)}
                  fontSize={16}
                  color={0xffffffff}
                  textAlign="center"
                  contain="width"
                  maxLines={1}
                >
                  {category.name}
                </Text>
              </View>
            )}
          </For>
        </Row>
      </View>

      <Column
        ref={contentGrid}
        x={20}
        y={HEADER_HEIGHT}
        width={1660}
        height={1080 - HEADER_HEIGHT}
        gap={16}
        scroll="auto"
        plinko
        clipping
        onUp={() => categoriesRow?.setFocus()}
      >
        <Show when={channels.loading && channelsData().length === 0}>
          <Row width={1640} height={150} gap={12} scroll="none" skipFocus>
            <For each={[1, 2, 3, 4, 5, 6, 7, 8]}>{() => <SkeletonLoader width={180} height={130} />}</For>
          </Row>
        </Show>

        <Show when={!channels.loading && channelRows().length === 0}>
          <View
            width={1640}
            height={400}
            display="flex"
            justifyContent="center"
            alignItems="center"
            skipFocus
          >
            <Text fontSize={28} color={0x888888ff}>
              Nenhum canal encontrado
            </Text>
          </View>
        </Show>

        <For each={channelRows()}>
          {row => (
            <Row width={1640} height={150} gap={12} scroll="none">
              <For each={row}>
                {(channel: Channel) => (
                  <View style={ChannelCardStyle} onEnter={() => handleChannelSelect(channel)}>
                    <Show
                      when={channel.logo_url}
                      fallback={
                        <View
                          x={40}
                          y={15}
                          width={100}
                          height={65}
                          color={channelColorFromName(channel.name)}
                          borderRadius={8}
                          display="flex"
                          justifyContent="center"
                          alignItems="center"
                        >
                          <Text fontSize={36} fontWeight={700} color={0xffffffff}>
                            {channel.name.trim().charAt(0).toUpperCase() || "?"}
                          </Text>
                        </View>
                      }
                    >
                      <View x={40} y={15} width={100} height={65} src={channel.logo_url} color={0xffffffff} />
                    </Show>

                    <Text
                      x={10}
                      y={90}
                      width={160}
                      height={30}
                      fontSize={14}
                      color={0xccccccff}
                      contain="both"
                      textOverflow="ellipsis"
                      textAlign="center"
                      maxLines={1}
                    >
                      {channel.name}
                    </Text>
                  </View>
                )}
              </For>
            </Row>
          )}
        </For>
      </Column>
    </View>
  );
};

export default Channels;
