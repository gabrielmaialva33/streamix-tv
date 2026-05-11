import { ElementNode, type IntrinsicNodeStyleProps, Text, View } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import { createEffect, createMemo, createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { CategoryChip, SkeletonLoader } from "../components";
import api, { type Category, type Channel } from "../lib/api";
import { proxyImageUrl } from "@/lib/imageUrl";
import { navResetTick } from "@/shared/navReset";
import { theme } from "@/styles";

const ITEMS_PER_ROW = 8;
const PAGE_SIZE = 48;
const LOGO_REVEAL_ROW_DELAY = 55;
const HEADER_HEIGHT = 196;
const CATEGORY_ROW_Y = 136;
const GRID_Y = 204;
const GRID_HEIGHT = 1080 - GRID_Y;
// Style constants
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

// Strip tag prefixes like "[24H] ", "[L] ", "[4K] " before pulling the first
// letter — otherwise every "[24H] X" channel shows "[" as its placeholder.
function channelInitial(name: string): string {
  const stripped = name.replace(/^\s*(\[[^\]]*\]\s*)+/, "").trim();
  return (stripped || name).trim().charAt(0).toUpperCase() || "?";
}

const Channels = () => {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = createSignal<number | undefined>(undefined);
  const [searchQuery, setSearchQuery] = createSignal<string | undefined>(undefined);

  let categoriesRow: ElementNode | undefined;
  let contentGrid: ElementNode | undefined;
  let loadMoreButton: ElementNode | undefined;

  // Reset to categories when the user re-clicks "Canais" in the sidebar.
  let navResetSeen = 0;
  createEffect(() => {
    const t = navResetTick();
    if (navResetSeen === 0) {
      navResetSeen = t;
      return;
    }
    navResetSeen = t;
    categoriesRow?.setFocus();
  });

  const [offset, setOffset] = createSignal(0);
  const [hasMore, setHasMore] = createSignal(false);
  const [revealedLogoCount, setRevealedLogoCount] = createSignal(Number.POSITIVE_INFINITY);
  const logoRevealTimers: ReturnType<typeof setTimeout>[] = [];

  onCleanup(() => {
    logoRevealTimers.forEach(timer => clearTimeout(timer));
  });

  const revealLogos = (fromIndex: number, toIndex: number) => {
    logoRevealTimers.forEach(timer => clearTimeout(timer));
    logoRevealTimers.length = 0;
    setRevealedLogoCount(fromIndex);

    for (let next = fromIndex + ITEMS_PER_ROW; next < toIndex + ITEMS_PER_ROW; next += ITEMS_PER_ROW) {
      const target = Math.min(next, toIndex);
      const delay = Math.floor((next - fromIndex) / ITEMS_PER_ROW) * LOGO_REVEAL_ROW_DELAY;
      logoRevealTimers.push(setTimeout(() => setRevealedLogoCount(target), delay));
    }
  };

  // Fetch categories
  const [categories] = createResource(() => api.getCategories("live"));

  // Fetch channels (paged)
  const [channels] = createResource(
    () => ({
      category_id: selectedCategory(),
      offset: offset(),
      limit: PAGE_SIZE,
      search: searchQuery(),
    }),
    params => api.getChannels(params),
  );

  // Accumulator keeps Column children stable across refetches; appends on
  // pagination, replaces on filter change.
  const [channelsData, setChannelsData] = createSignal<Channel[]>([]);

  createEffect(() => {
    const result = channels();
    if (!result) return;
    if (offset() === 0) {
      setChannelsData(result.data);
      setRevealedLogoCount(Number.POSITIVE_INFINITY);
    } else {
      setChannelsData(prev => {
        const seen = new Set(prev.map(channel => channel.id));
        const fresh = result.data.filter(channel => !seen.has(channel.id));
        if (!fresh.length) return prev;
        const next = [...prev, ...fresh];
        revealLogos(prev.length, next.length);
        return next;
      });
    }
    // Backend may return has_more=true with empty page when offset >= total — trust both signals.
    const more = result.has_more && result.data.length > 0;
    setHasMore(more);
    if (offset() > 0) {
      // Restore focus after a paginated fetch. The <Show when={hasMore()}>
      // wrapper unmounts the load-more button when there is no next page;
      // setFocus() on the disposed ref would be a silent no-op and the D-pad
      // would hang. Fall back to the grid in that case.
      queueMicrotask(() => {
        if (more && loadMoreButton?.parent) {
          loadMoreButton.setFocus();
        } else {
          contentGrid?.setFocus();
        }
      });
    }
  });

  // Chunk channels into rows
  const channelRows = createMemo(() => {
    const data = channelsData();
    const rows: Channel[][] = [];
    for (let i = 0; i < data.length; i += ITEMS_PER_ROW) {
      rows.push(data.slice(i, i + ITEMS_PER_ROW));
    }
    return rows;
  });

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
          ref={categoriesRow}
          x={20}
          y={CATEGORY_ROW_Y}
          width={1660}
          height={50}
          gap={12}
          scroll="center"
          autofocus
          onDown={() => contentGrid?.setFocus()}
        >
          <CategoryChip
            label="Todos"
            width={100}
            active={selectedCategory() === undefined && !searchQuery()}
            onSelect={() => {
              if (selectedCategory() === undefined && !searchQuery()) return;
              setChannelsData([]);
              setRevealedLogoCount(Number.POSITIVE_INFINITY);
              setSelectedCategory(undefined);
              setSearchQuery(undefined);
              setOffset(0);
              setHasMore(false);
            }}
          />
          <For each={categories()}>
            {(category: Category) => (
              <CategoryChip
                label={category.name}
                active={selectedCategory() === category.id && !searchQuery()}
                onSelect={() => {
                  if (selectedCategory() === category.id && !searchQuery()) return;
                  setChannelsData([]);
                  setRevealedLogoCount(Number.POSITIVE_INFINITY);
                  setSelectedCategory(category.id);
                  setSearchQuery(undefined);
                  setOffset(0);
                  setHasMore(false);
                }}
              />
            )}
          </For>
        </Row>
      </View>

      <Column
        ref={contentGrid}
        x={20}
        y={GRID_Y}
        width={1660}
        height={GRID_HEIGHT}
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
          {(row, rowIndex) => {
            return (
              <Row width={1640} height={150} gap={12} scroll="none">
                <For each={row}>
                  {(channel: Channel, itemIndex) => (
                    <View style={ChannelCardStyle} onEnter={() => handleChannelSelect(channel)}>
                      <View
                        x={40}
                        y={15}
                        width={100}
                        height={65}
                        color={channelColorFromName(channel.name)}
                        borderRadius={10}
                        display="flex"
                        justifyContent="center"
                        alignItems="center"
                        skipFocus
                      >
                        <Text fontSize={36} fontWeight={700} color={0xffffffff}>
                          {channelInitial(channel.name)}
                        </Text>
                      </View>
                      <Show
                        when={
                          channel.logo_url && rowIndex() * ITEMS_PER_ROW + itemIndex() < revealedLogoCount()
                        }
                      >
                        <View
                          x={40}
                          y={15}
                          width={100}
                          height={65}
                          src={proxyImageUrl(channel.logo_url, 120)}
                          color={0xffffffff}
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
                        {channel.name}
                      </Text>
                    </View>
                  )}
                </For>
              </Row>
            );
          }}
        </For>

        <Show when={hasMore()}>
          <Row width={1640} height={60} justifyContent="center">
            <View
              ref={loadMoreButton}
              width={200}
              height={50}
              borderRadius={8}
              display="flex"
              justifyContent="center"
              alignItems="center"
              style={{
                color: theme.surfaceLight,
                border: { color: theme.border, width: 1 },
                transition: { scale: { duration: 150 }, color: { duration: 150 } },
                $focus: { scale: 1.05, color: theme.primary, border: { color: theme.primary, width: 1 } },
              }}
              onEnter={() => {
                setOffset(prev => prev + PAGE_SIZE);
                return true;
              }}
            >
              <Text fontSize={18} color={0xffffffff}>
                {channels.loading ? "Carregando..." : "Carregar Mais"}
              </Text>
            </View>
          </Row>
        </Show>
      </Column>
    </View>
  );
};

export default Channels;
