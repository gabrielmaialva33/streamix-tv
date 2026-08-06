import { ElementNode, type IntrinsicNodeStyleProps, Text, View } from "@solidtv/solid";
import { Row, VirtualGrid } from "@solidtv/solid/primitives";
import { batch, createEffect, createMemo, createResource, createSignal, For, on, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { CategoryChip, SkeletonLoader } from "@/components";
import { useCatalogBrowseFilters } from "@/features/catalog/catalogFilters";
import api, { type CatalogProvider, type Category, type Channel } from "@/lib/api";
import { proxyImageUrl } from "@/lib/imageUrl";
import { onNavReset } from "@/shared/navReset";
import { theme } from "@/styles";

const ITEMS_PER_ROW = 8;
const PAGE_SIZE = 48;
const VISIBLE_ROWS = 6;
const HEADER_HEIGHT = 230;
const PROVIDER_ROW_Y = 122;
const CATEGORY_ROW_Y = 174;
const GRID_Y = 238;
const GRID_HEIGHT = 1080 - GRID_Y;

const ChannelCardStyle = {
  width: 180,
  height: 130,
  color: theme.surface,
  borderRadius: 10,
  border: { color: theme.border, width: 1 },
  scale: 1,
  transition: {
    scale: { duration: 150, easing: "ease-out" },
    color: { duration: 150, easing: "ease-out" },
  },
  $focus: {
    scale: 1.06,
    color: theme.surfaceHover,
    border: { color: theme.primary, width: 2 },
  },
} satisfies IntrinsicNodeStyleProps;

const PLACEHOLDER_COLORS = [
  0xe50914ff, 0x1e88e5ff, 0x43a047ff, 0xfb8c00ff, 0x8e24aaff, 0x00acc1ff, 0x3949abff, 0xd81b60ff,
];

function channelColorFromName(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index++) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0;
  }
  return PLACEHOLDER_COLORS[Math.abs(hash) % PLACEHOLDER_COLORS.length];
}

function channelInitial(name: string): string {
  const stripped = name.replace(/^\s*(\[[^\]]*\]\s*)+/, "").trim();
  return (stripped || name).trim().charAt(0).toUpperCase() || "?";
}

const Channels = () => {
  const navigate = useNavigate();
  const {
    providerId: selectedProvider,
    categoryId: selectedCategory,
    selectProvider: setSelectedProvider,
    selectCategory: setSelectedCategory,
    hrefWithProvider,
  } = useCatalogBrowseFilters();
  const [offset, setOffset] = createSignal(0);
  const [hasMore, setHasMore] = createSignal(false);
  const [channelsData, setChannelsData] = createSignal<Channel[]>([]);

  let providersRow: ElementNode | undefined;
  let categoriesRow: ElementNode | undefined;
  let contentGrid: ElementNode | undefined;
  let seenChannelIds = new Set<Channel["id"]>();

  onNavReset(() => providersRow?.setFocus());

  const [providers] = createResource(api.getCatalogProviders, { initialValue: [] });
  const availableProviders = createMemo(() =>
    providers().filter(provider => provider.content_types.includes("channels")),
  );
  const [categories] = createResource(
    selectedProvider,
    providerId => api.getCategories("live", { provider_id: providerId }),
    { initialValue: [] },
  );
  const [channels] = createResource(
    () => ({
      provider_id: selectedProvider(),
      category_id: selectedCategory(),
      offset: offset(),
      limit: PAGE_SIZE,
    }),
    params => api.getChannels(params),
  );

  createEffect(
    on(
      () => `${selectedProvider() ?? "all"}:${selectedCategory() ?? "all"}`,
      () => {
        batch(() => {
          seenChannelIds = new Set<Channel["id"]>();
          setChannelsData([]);
          setHasMore(false);
          setOffset(0);
        });
      },
      { defer: true },
    ),
  );

  createEffect(() => {
    const providerId = selectedProvider();
    if (providerId === undefined || providers.state !== "ready") return;
    if (!availableProviders().some(provider => provider.id === providerId)) {
      setSelectedProvider(undefined, true);
    }
  });

  createEffect(() => {
    const categoryId = selectedCategory();
    if (categoryId === undefined || categories.state !== "ready") return;
    if (!categories().some(category => category.id === categoryId)) {
      setSelectedCategory(undefined, true);
    }
  });

  createEffect(() => {
    const result = channels();
    if (!result) return;

    if (offset() === 0) {
      seenChannelIds = new Set(result.data.map(channel => channel.id));
      setChannelsData(result.data);
      setHasMore(result.has_more && result.data.length > 0);
      return;
    }

    const fresh = result.data.filter(channel => !seenChannelIds.has(channel.id));
    fresh.forEach(channel => seenChannelIds.add(channel.id));
    if (fresh.length > 0) setChannelsData(previous => [...previous, ...fresh]);
    setHasMore(result.has_more && fresh.length > 0);
  });

  const loadMore = () => {
    if (!channels.loading && hasMore()) {
      setOffset(previous => previous + PAGE_SIZE);
    }
  };

  const selectProvider = (providerId: number | undefined) => {
    if (selectedProvider() !== providerId) setSelectedProvider(providerId);
  };

  const selectCategory = (categoryId: number | undefined) => {
    if (selectedCategory() !== categoryId) setSelectedCategory(categoryId);
  };

  const leaveGridUp = () => {
    const cursor = contentGrid?.cursor;
    if (typeof cursor === "number" && cursor >= ITEMS_PER_ROW) return false;
    if (selectedProvider() !== undefined) categoriesRow?.setFocus();
    else providersRow?.setFocus();
    return true;
  };

  return (
    <View
      width={1700}
      height={1080}
      forwardFocus={() => {
        providersRow?.setFocus();
        return true;
      }}
    >
      <View x={0} y={0} width={1700} height={HEADER_HEIGHT} zIndex={10} color={theme.backgroundElevated}>
        <View width={1660} height={76} x={20} skipFocus>
          <Text y={14} fontSize={42} fontWeight={700} color={0xffffffff}>
            Canais ao Vivo
          </Text>
          <Text y={70} fontSize={18} color={theme.textSecondary}>
            Acesse canais rapidamente com logos e categorias organizadas.
          </Text>
        </View>
        <View x={20} y={HEADER_HEIGHT - 1} width={1640} height={1} color={theme.border} skipFocus />

        <Row
          ref={providersRow}
          x={20}
          y={PROVIDER_ROW_Y}
          width={1660}
          height={42}
          gap={12}
          scroll="center"
          autofocus
          onDown={() => {
            if (selectedProvider() !== undefined) categoriesRow?.setFocus();
            else contentGrid?.setFocus();
          }}
        >
          <CategoryChip
            label="Todos os provedores"
            width={190}
            active={selectedProvider() === undefined}
            onSelect={() => selectProvider(undefined)}
          />
          <For each={availableProviders()}>
            {(provider: CatalogProvider) => (
              <CategoryChip
                label={provider.name}
                active={selectedProvider() === provider.id}
                onSelect={() => selectProvider(provider.id)}
              />
            )}
          </For>
        </Row>

        <Show when={selectedProvider() !== undefined}>
          <Row
            ref={categoriesRow}
            x={20}
            y={CATEGORY_ROW_Y}
            width={1660}
            height={42}
            gap={12}
            scroll="center"
            onUp={() => providersRow?.setFocus()}
            onDown={() => contentGrid?.setFocus()}
          >
            <CategoryChip
              label="Todos"
              width={100}
              active={selectedCategory() === undefined}
              onSelect={() => selectCategory(undefined)}
            />
            <For each={categories()}>
              {(category: Category) => (
                <CategoryChip
                  label={category.name}
                  active={selectedCategory() === category.id}
                  onSelect={() => selectCategory(category.id)}
                />
              )}
            </For>
          </Row>
        </Show>
      </View>

      <Show when={channels.loading && channelsData().length === 0}>
        <Row x={20} y={GRID_Y} width={1640} height={150} gap={12} scroll="none" skipFocus>
          <For each={[1, 2, 3, 4, 5, 6, 7, 8]}>{() => <SkeletonLoader width={180} height={130} />}</For>
        </Row>
      </Show>

      <Show when={!channels.loading && channelsData().length === 0}>
        <View
          x={20}
          y={GRID_Y}
          width={1640}
          height={400}
          display="flex"
          justifyContent="center"
          alignItems="center"
          skipFocus
        >
          <Text fontSize={28} color={theme.textMuted}>
            Nenhum canal encontrado
          </Text>
        </View>
      </Show>

      <Show when={channelsData().length > 0}>
        <VirtualGrid
          ref={contentGrid}
          x={20}
          y={GRID_Y}
          width={1660}
          height={GRID_HEIGHT}
          columns={ITEMS_PER_ROW}
          rows={VISIBLE_ROWS}
          buffer={1}
          gap={12}
          scroll="always"
          plinko
          clipping
          each={channelsData()}
          onUp={leaveGridUp}
          onEndReached={loadMore}
          onEndReachedThreshold={ITEMS_PER_ROW * 2}
        >
          {channel => (
            <View
              item={channel()}
              style={ChannelCardStyle}
              onEnter={() => {
                navigate(hrefWithProvider(`/player/channel/${channel().id}`));
                return true;
              }}
            >
              <View
                x={40}
                y={15}
                width={100}
                height={65}
                color={channelColorFromName(channel().name)}
                borderRadius={10}
                display="flex"
                justifyContent="center"
                alignItems="center"
                skipFocus
              >
                <Text fontSize={36} fontWeight={700} color={0xffffffff}>
                  {channelInitial(channel().name)}
                </Text>
              </View>
              <Show when={channel().logo_url}>
                <View
                  x={40}
                  y={15}
                  width={100}
                  height={65}
                  src={proxyImageUrl(channel().logo_url, 120)}
                  color={0xffffffff}
                  textureOptions={{ resizeMode: { type: "contain" } }}
                />
              </Show>

              <Text
                x={10}
                y={90}
                width={160}
                height={30}
                fontSize={14}
                color={theme.textSecondary}
                contain="both"
                textOverflow="ellipsis"
                textAlign="center"
                maxLines={1}
              >
                {channel().name}
              </Text>
            </View>
          )}
        </VirtualGrid>
      </Show>
    </View>
  );
};

export default Channels;
