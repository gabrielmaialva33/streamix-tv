import { type ElementNode, type IntrinsicNodeStyleProps, Text, View } from "@solidtv/solid";
import { Row, VirtualGrid, type NavigableElement } from "@solidtv/solid/primitives";
import { batch, createEffect, createResource, createSignal, For, on, onCleanup, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useSidebarExit } from "@/app/layoutFocus";
import { LoadError, SkeletonLoader } from "@/components";
import { isGridRowStart } from "@/features/catalog/catalogBrowse";
import { useCatalogBrowseFilters } from "@/features/catalog/catalogFilters";
import api, { type Channel } from "@/lib/api";
import { proxyImageUrl } from "@/lib/imageUrl";
import { CATALOG_CONTENT_WIDTH } from "@/shared/layout";
import { isElementAttached } from "@/shared/focus";
import { onNavReset } from "@/shared/navReset";
import { theme } from "@/styles";

const ITEMS_PER_ROW = 8;
const PAGE_SIZE = 48;
const VISIBLE_ROWS = 6;
const HEADER_HEIGHT = 120;
const GRID_INSET_X = 28;
const GRID_INSET_Y = 12;
const GRID_Y = HEADER_HEIGHT + GRID_INSET_Y;
const GRID_VIEWPORT_HEIGHT = 1080 - HEADER_HEIGHT;
const PAGE_INSET = 20;
const PAGE_WIDTH = CATALOG_CONTENT_WIDTH;
const INNER_WIDTH = PAGE_WIDTH - PAGE_INSET * 2;
const GRID_WIDTH = PAGE_WIDTH - GRID_INSET_X * 2;

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
  const stripped = name.replace(/^\s*(?:\[[^\]]*\]|\([^)]*\))\s*/, "").trim();
  return stripped.match(/\p{L}/u)?.[0].toUpperCase() ?? stripped.match(/\p{N}/u)?.[0] ?? "TV";
}

const Channels = () => {
  const navigate = useNavigate();
  const exitToSidebar = useSidebarExit();
  const {
    providerId: selectedProvider,
    categoryId: selectedCategory,
    hrefWithProvider,
  } = useCatalogBrowseFilters();
  const [offset, setOffset] = createSignal(0);
  const [hasMore, setHasMore] = createSignal(false);
  const [channelsData, setChannelsData] = createSignal<Channel[]>([]);

  let pageRoot: ElementNode | undefined;
  let contentGrid: NavigableElement | undefined;
  let seenChannelIds = new Set<Channel["id"]>();
  let focusGridAfterRetry = false;
  let focusGridWhenReady = false;

  onNavReset(() => contentGrid?.scrollToIndex(0));

  const [channels, { refetch }] = createResource(
    () => ({
      provider_id: selectedProvider(),
      category_id: selectedCategory(),
      offset: offset(),
      limit: PAGE_SIZE,
    }),
    params => api.getChannels(params),
  );

  const restoreRequestedFocus = (itemCount: number) => {
    if (!focusGridAfterRetry && !focusGridWhenReady) return;
    focusGridAfterRetry = false;
    focusGridWhenReady = false;
    queueMicrotask(() =>
      queueMicrotask(() => {
        // A late response must not override a newer sidebar/picker selection.
        if (!pageRoot?.states.has("$focus")) return;
        if (itemCount > 0 && isElementAttached(contentGrid)) contentGrid.setFocus();
        else exitToSidebar();
      }),
    );
  };

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
    if (channels.error) return;
    const result = channels();
    if (!result) return;

    if (offset() === 0) {
      seenChannelIds = new Set(result.data.map(channel => channel.id));
      setChannelsData(result.data);
      setHasMore(result.has_more && result.data.length > 0);
      restoreRequestedFocus(result.data.length);
      return;
    }

    const fresh = result.data.filter(channel => !seenChannelIds.has(channel.id));
    fresh.forEach(channel => seenChannelIds.add(channel.id));
    if (fresh.length > 0) setChannelsData(previous => [...previous, ...fresh]);
    setHasMore(result.has_more && fresh.length > 0);
  });

  const loadMore = () => {
    if (!channels.loading && !channels.error && hasMore()) {
      setOffset(previous => previous + PAGE_SIZE);
    }
  };

  const retryInitialLoad = () => {
    focusGridAfterRetry = true;
    void refetch();
  };

  const hasAttachedGrid = () => isElementAttached(contentGrid);

  const leaveGridLeft = () => {
    if (!isGridRowStart(contentGrid?.cursor, ITEMS_PER_ROW)) return false;
    return exitToSidebar();
  };

  return (
    <View
      ref={pageRoot}
      width={PAGE_WIDTH}
      height={1080}
      forwardFocus={() => {
        if (!hasAttachedGrid()) {
          focusGridWhenReady = true;
          return false;
        }
        contentGrid?.setFocus();
        return true;
      }}
    >
      <View
        x={0}
        y={0}
        width={PAGE_WIDTH}
        height={HEADER_HEIGHT}
        zIndex={10}
        color={theme.backgroundElevated}
      >
        <View width={INNER_WIDTH} height={100} x={PAGE_INSET} skipFocus>
          <Text y={14} fontSize={42} fontWeight={700} color={0xffffffff}>
            Canais ao Vivo
          </Text>
          <Text y={70} fontSize={18} color={theme.textSecondary}>
            Acesse canais rapidamente com logos e categorias organizadas.
          </Text>
        </View>
        <View
          x={PAGE_INSET}
          y={HEADER_HEIGHT - 1}
          width={INNER_WIDTH}
          height={1}
          color={theme.border}
          skipFocus
        />
      </View>

      <Show when={channels.loading && !channels.error && channelsData().length === 0}>
        <Row x={GRID_INSET_X} y={GRID_Y} width={GRID_WIDTH} height={150} gap={12} scroll="none" skipFocus>
          <For each={[1, 2, 3, 4, 5, 6, 7, 8]}>{() => <SkeletonLoader width={180} height={130} />}</For>
        </Row>
      </Show>

      <Show when={channels.error && channelsData().length === 0}>
        <LoadError
          x={20}
          y={HEADER_HEIGHT}
          width={INNER_WIDTH}
          height={1080 - HEADER_HEIGHT}
          message="Não conseguimos carregar os canais agora."
          onRetry={retryInitialLoad}
        />
      </Show>

      <Show when={!channels.loading && !channels.error && channelsData().length === 0}>
        <View
          x={20}
          y={GRID_Y}
          width={INNER_WIDTH}
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
        <View y={HEADER_HEIGHT} width={PAGE_WIDTH} height={GRID_VIEWPORT_HEIGHT} clipping skipFocus>
          <VirtualGrid
            ref={element => {
              const grid = element as NavigableElement;
              contentGrid = grid;
              onCleanup(() => {
                if (contentGrid === grid) contentGrid = undefined;
              });
            }}
            x={GRID_INSET_X}
            y={GRID_INSET_Y}
            width={GRID_WIDTH}
            height={GRID_VIEWPORT_HEIGHT - GRID_INSET_Y}
            columns={ITEMS_PER_ROW}
            rows={VISIBLE_ROWS}
            buffer={1}
            gap={12}
            scroll="always"
            plinko
            each={channelsData()}
            onLeft={leaveGridLeft}
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
        </View>
      </Show>
    </View>
  );
};

export default Channels;
