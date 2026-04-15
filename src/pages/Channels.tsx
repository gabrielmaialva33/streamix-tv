import { ElementNode, type IntrinsicNodeStyleProps, Text, View } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import { createResource, createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { SearchBox, SkeletonLoader } from "../components";
import api, { type Category, type Channel } from "../lib/api";

const ITEMS_PER_ROW = 8;

// Style constants
const CategoryButtonStyle = {
  height: 40,
  borderRadius: 20,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  color: 0x222222ff,
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

const SelectedCategoryStyle = {
  ...CategoryButtonStyle,
  color: 0x444444ff,
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

// Paleta curta pra fallback de logo — gera cor estavel a partir do nome do canal
const PLACEHOLDER_COLORS = [
  0xe50914ff, // vermelho streamix
  0x1e88e5ff, // azul
  0x43a047ff, // verde
  0xfb8c00ff, // laranja
  0x8e24aaff, // roxo
  0x00acc1ff, // teal
  0x3949abff, // indigo
  0xd81b60ff, // rosa
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

  // Handle search
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setSelectedCategory(undefined);
  };

  // Chunk channels into rows
  const channelRows = () => {
    const data = channels()?.data || [];
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
      {/* Fixed Header - solid background hides content scrolling behind */}
      <View x={0} y={0} width={1700} height={140} zIndex={10} color={0x0a0a0fff}>
        {/* Title and Search */}
        <Row
          ref={titleRow}
          width={1660}
          height={70}
          x={20}
          gap={20}
          scroll="none"
          onDown={() => categoriesRow?.setFocus()}
        >
          <View width={1350} skipFocus>
            <Text y={15} fontSize={42} fontWeight="bold" color={0xffffffff}>
              Canais ao Vivo
            </Text>
          </View>
          <SearchBox onSearch={handleSearch} placeholder="Buscar canais..." />
        </Row>

        {/* Category Filter - horizontal scrolling */}
        <Row
          ref={categoriesRow}
          x={20}
          y={70}
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
            style={
              selectedCategory() === undefined && !searchQuery() ? SelectedCategoryStyle : CategoryButtonStyle
            }
            onEnter={() => {
              setSelectedCategory(undefined);
              setSearchQuery(undefined);
            }}
          >
            <Text fontSize={16} color={0xffffffff}>
              Todos
            </Text>
          </View>
          <For each={categories()}>
            {(category: Category) => (
              <View
                width={Math.max(100, category.name.length * 10 + 24)}
                style={
                  selectedCategory() === category.id && !searchQuery()
                    ? SelectedCategoryStyle
                    : CategoryButtonStyle
                }
                onEnter={() => {
                  setSelectedCategory(category.id);
                  setSearchQuery(undefined);
                }}
              >
                <Text fontSize={16} color={0xffffffff}>
                  {category.name}
                </Text>
              </View>
            )}
          </For>
        </Row>
      </View>

      {/* Channels Grid - below fixed header with clipping */}
      <Column
        ref={contentGrid}
        x={20}
        y={140}
        width={1660}
        height={930}
        gap={16}
        scroll="auto"
        plinko
        clipping
        onUp={() => categoriesRow?.setFocus()}
      >
        <Show when={channels.loading}>
          {/* Skeleton loaders */}
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
                    {/* Logo */}
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
                          <Text fontSize={36} fontWeight="bold" color={0xffffffff}>
                            {channel.name.trim().charAt(0).toUpperCase() || "?"}
                          </Text>
                        </View>
                      }
                    >
                      <View x={40} y={15} width={100} height={65} src={channel.logo_url} color={0xffffffff} />
                    </Show>

                    {/* Name */}
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
