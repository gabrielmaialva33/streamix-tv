import { ElementNode, type IntrinsicNodeStyleProps, Text, View } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import { createSignal, For, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Card } from "@/components";
import { authState } from "@/features/auth/auth";
import { chunkIntoRows } from "@/lib/contentMeta";
import { type FavoriteItem, favorites } from "@/lib/storage";
import { onNavReset } from "@/shared/navReset";
import { theme } from "@/styles";

const ITEMS_PER_ROW = 6;

// Tab styles
const TabStyle = {
  height: 45,
  borderRadius: 10,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  color: theme.surfaceMuted,
  border: { color: theme.borderSubtle, width: 1 },
  transition: {
    color: { duration: 150 },
    scale: { duration: 150 },
  },
  scale: 1,
  $focus: {
    color: theme.surfaceHover,
    border: { color: theme.primary, width: 1 },
    scale: 1.04,
  },
} satisfies IntrinsicNodeStyleProps;

const ActiveTabStyle = {
  ...TabStyle,
  color: theme.surfaceActive,
  border: { color: theme.primary, width: 2 },
} satisfies IntrinsicNodeStyleProps;

type FilterType = "all" | "movie" | "series" | "channel";

const FILTER_TABS: Array<{ value: FilterType; label: string; width: number }> = [
  { value: "all", label: "Todos", width: 100 },
  { value: "movie", label: "Filmes", width: 100 },
  { value: "series", label: "Séries", width: 100 },
  { value: "channel", label: "Canais", width: 120 },
];

const Favorites = () => {
  const navigate = useNavigate();
  const [items, setItems] = createSignal<FavoriteItem[]>([]);
  const [filter, setFilter] = createSignal<FilterType>("all");

  let tabsRow: ElementNode | undefined;
  let contentGrid: ElementNode | undefined;

  // Reset to tabs when the user re-clicks "Favoritos" in the sidebar.
  onNavReset(() => tabsRow?.setFocus());

  onMount(() => setItems(favorites.getAll()));

  // Filtered items
  const filteredItems = () => {
    const all = items();
    if (filter() === "all") return all;
    return all.filter(item => item.type === filter());
  };

  const itemRows = () => chunkIntoRows(filteredItems(), ITEMS_PER_ROW);

  // Handle item selection
  const handleSelect = (item: FavoriteItem) => {
    switch (item.type) {
      case "movie":
        navigate(`/movie/${item.id}`);
        break;
      case "series":
        navigate(`/series/${item.id}`);
        break;
      case "channel":
        navigate(`/player/channel/${item.id}`);
        break;
    }
  };

  return (
    <Column width={1700} height={1080} color={theme.background} scroll="none">
      {/* Header */}
      <View width={1660} height={108} x={20} skipFocus>
        <Text y={10} fontSize={42} fontWeight={700} color={0xffffffff}>
          Meus Favoritos
        </Text>
        <Text y={62} fontSize={18} color={theme.textSecondary}>
          {`Sua coleção sincronizada${authState.user()?.name ? ` • ${authState.user()?.name}` : ""}`}
        </Text>
        <View
          x={1210}
          y={18}
          width={210}
          height={34}
          color={theme.surfaceMuted}
          borderRadius={10}
          border={{ color: theme.borderSubtle, width: 1 }}
        >
          <Text y={8} width={210} fontSize={15} color={theme.textPrimary} textAlign="center">
            Favoritos da sua conta
          </Text>
        </View>
        <Text x={1450} y={25} fontSize={20} color={theme.textMuted}>
          {`${filteredItems().length} itens`}
        </Text>
      </View>
      <View x={20} width={1640} height={1} color={theme.border} skipFocus />

      {/* Filter Tabs */}
      <Row
        ref={tabsRow}
        x={20}
        width={1660}
        height={55}
        gap={12}
        autofocus
        onDown={() => contentGrid?.setFocus()}
      >
        <For each={FILTER_TABS}>
          {tab => (
            <View
              width={tab.width}
              style={filter() === tab.value ? ActiveTabStyle : TabStyle}
              onEnter={() => {
                setFilter(tab.value);
                return true;
              }}
            >
              <Text fontSize={16} color={0xffffffff}>
                {tab.label}
              </Text>
            </View>
          )}
        </For>
      </Row>

      {/* Content Grid */}
      <Column
        ref={contentGrid}
        x={20}
        y={10}
        width={1660}
        height={900}
        gap={24}
        scroll="auto"
        plinko
        onUp={() => tabsRow?.setFocus()}
      >
        <Show when={filteredItems().length === 0}>
          <View
            width={1640}
            height={400}
            display="flex"
            flexDirection="column"
            justifyContent="center"
            alignItems="center"
            gap={20}
            skipFocus
          >
            <Text fontSize={48} color={theme.surfaceLight}>
              ★
            </Text>
            <Text fontSize={28} color={theme.textSecondary}>
              Nenhum favorito ainda
            </Text>
            <Text fontSize={18} color={theme.textMuted}>
              {`Adicione filmes, séries ou canais para montar a sua seleção${authState.user()?.name ? `, ${authState.user()?.name}` : ""}`}
            </Text>
          </View>
        </Show>

        <For each={itemRows()}>
          {row => (
            <Row width={1640} height={420} gap={16} scroll="none">
              <For each={row}>
                {item => (
                  <Card
                    title={item.title}
                    imageUrl={item.posterUrl}
                    subtitle={item.type === "movie" ? "Filme" : item.type === "series" ? "Série" : "Canal"}
                    onEnter={() => {
                      handleSelect(item);
                      return true;
                    }}
                    item={{ id: item.id, type: item.type, href: "" }}
                  />
                )}
              </For>
            </Row>
          )}
        </For>
      </Column>

      {/* Help text */}
      <View x={20} y={1000} skipFocus>
        <Text fontSize={14} color={theme.textMuted}>
          OK Abrir detalhes ou reprodução • Seus favoritos acompanham a conta
        </Text>
      </View>
    </Column>
  );
};

export default Favorites;
