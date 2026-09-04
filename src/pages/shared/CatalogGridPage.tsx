import { Text, View } from "@solidtv/solid";
import { Row, VirtualGrid, type NavigableElement } from "@solidtv/solid/primitives";
import { batch, createEffect, createResource, createSignal, For, on, onCleanup, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useSidebarExit } from "@/app/layoutFocus";
import { Card, LoadError, ScrollIndicator, SkeletonLoader } from "@/components";
import { isGridRowStart } from "@/features/catalog/catalogBrowse";
import { useCatalogBrowseFilters } from "@/features/catalog/catalogFilters";
import api, { type CatalogListParams, type PaginatedResponse } from "@/lib/api";
import { pickPoster } from "@/lib/imageUrl";
import { CATALOG_CONTENT_WIDTH } from "@/shared/layout";
import { isElementAttached } from "@/shared/focus";
import { onNavReset } from "@/shared/navReset";
import { theme } from "@/styles";

const ITEMS_PER_ROW = 6;
const ITEMS_PER_PAGE = 30;
const VISIBLE_ROWS = 2;
const HEADER_HEIGHT = 120;
const GRID_VIEWPORT_HEIGHT = 1080 - HEADER_HEIGHT;
const GRID_INSET_X = 40;
const GRID_INSET_Y = 36;
const GRID_GAP = 12;
const ROW_HEIGHT = 416;
const PAGE_INSET = 20;
const PAGE_WIDTH = CATALOG_CONTENT_WIDTH;
const INNER_WIDTH = PAGE_WIDTH - PAGE_INSET * 2;
const GRID_WIDTH = PAGE_WIDTH - GRID_INSET_X * 2;

interface CatalogItem {
  id: number;
  title: string | null;
  name: string;
  poster?: string | null;
  poster_url?: string;
  poster_w240?: string | null;
  poster_w480?: string | null;
  poster_w720?: string | null;
}

export interface CatalogGridPageProps<T extends CatalogItem> {
  title: string;
  subtitle: string;
  emptyMessage: string;
  itemType: "movie" | "series";
  fetchPage: (params: CatalogListParams) => Promise<PaginatedResponse<T>>;
  caption: (item: T) => string;
  detailHref: (item: T) => string;
}

/**
 * Paginated poster grid shared by Movies and Series. VirtualGrid keeps only
 * the visible rows plus a one-row buffer mounted while the data array grows.
 */
function CatalogGridPage<T extends CatalogItem>(props: CatalogGridPageProps<T>) {
  const navigate = useNavigate();
  const exitToSidebar = useSidebarExit();
  const {
    providerId: selectedProvider,
    categoryId: selectedCategory,
    hrefWithProvider,
  } = useCatalogBrowseFilters();
  const [offset, setOffset] = createSignal(0);
  const [accumulatedItems, setAccumulatedItems] = createSignal<T[]>([]);
  const [hasMore, setHasMore] = createSignal(false);
  const [scrollPosition, setScrollPosition] = createSignal(0);

  let contentGrid: NavigableElement | undefined;
  let seenItemIds = new Set<T["id"]>();
  let focusGridAfterRetry = false;
  let focusGridWhenReady = false;

  onNavReset(() => contentGrid?.scrollToIndex(0));

  const [itemsResource, { refetch }] = createResource(
    () => ({
      provider_id: selectedProvider(),
      category_id: selectedCategory(),
      offset: offset(),
      limit: ITEMS_PER_PAGE,
    }),
    params => props.fetchPage(params),
  );

  const restoreRequestedFocus = (itemCount: number) => {
    if (!focusGridAfterRetry && !focusGridWhenReady) return;
    focusGridAfterRetry = false;
    focusGridWhenReady = false;
    queueMicrotask(() =>
      queueMicrotask(() => {
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
          seenItemIds = new Set<T["id"]>();
          setAccumulatedItems([]);
          setHasMore(false);
          setScrollPosition(0);
          setOffset(0);
        });
      },
      { defer: true },
    ),
  );

  createEffect(() => {
    if (itemsResource.error) return;
    const result = itemsResource();
    if (!result) return;

    if (offset() === 0) {
      seenItemIds = new Set(result.data.map(item => item.id));
      setAccumulatedItems(result.data);
      setHasMore(result.has_more && result.data.length > 0);
      restoreRequestedFocus(result.data.length);
      return;
    }

    const fresh = result.data.filter(item => !seenItemIds.has(item.id));
    fresh.forEach(item => seenItemIds.add(item.id));
    if (fresh.length > 0) setAccumulatedItems(previous => [...previous, ...fresh]);
    setHasMore(result.has_more && fresh.length > 0);
  });

  const loadMore = () => {
    if (!itemsResource.loading && !itemsResource.error && hasMore()) {
      setOffset(previous => previous + ITEMS_PER_PAGE);
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
            {props.title}
          </Text>
          <Text y={70} fontSize={18} color={theme.textSecondary}>
            {props.subtitle}
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

      <Show when={itemsResource.loading && !itemsResource.error && accumulatedItems().length === 0}>
        <Row
          x={GRID_INSET_X}
          y={HEADER_HEIGHT + GRID_INSET_Y}
          width={GRID_WIDTH}
          height={ROW_HEIGHT}
          gap={GRID_GAP}
          scroll="none"
          skipFocus
        >
          <For each={[1, 2, 3, 4, 5, 6]}>
            {() => (
              <View width={240} height={ROW_HEIGHT}>
                <SkeletonLoader width={240} height={360} />
                <SkeletonLoader width={180} height={20} y={370} borderRadius={4} />
              </View>
            )}
          </For>
        </Row>
      </Show>

      <Show when={itemsResource.error && accumulatedItems().length === 0}>
        <LoadError
          x={20}
          y={HEADER_HEIGHT}
          width={INNER_WIDTH}
          height={1080 - HEADER_HEIGHT}
          message={`Não conseguimos carregar ${props.itemType === "movie" ? "os filmes" : "as séries"} agora.`}
          onRetry={retryInitialLoad}
        />
      </Show>

      <Show when={!itemsResource.loading && !itemsResource.error && accumulatedItems().length === 0}>
        <View
          x={20}
          y={HEADER_HEIGHT + GRID_INSET_Y}
          width={INNER_WIDTH}
          height={400}
          display="flex"
          justifyContent="center"
          alignItems="center"
          skipFocus
        >
          <Text fontSize={28} color={theme.textMuted}>
            {props.emptyMessage}
          </Text>
        </View>
      </Show>

      <Show when={accumulatedItems().length > 0}>
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
            gap={GRID_GAP}
            scroll="always"
            plinko
            each={accumulatedItems()}
            onLeft={leaveGridLeft}
            onEndReached={loadMore}
            onEndReachedThreshold={ITEMS_PER_ROW * 2}
            onSelectedChanged={(_index, _grid, active) => {
              const absoluteIndex = accumulatedItems().indexOf(active.item as T);
              if (absoluteIndex >= 0) {
                setScrollPosition(absoluteIndex / Math.max(1, accumulatedItems().length - 1));
                const selected = accumulatedItems()[absoluteIndex];
                if (props.itemType === "movie") api.prefetchMovie(selected.id);
                else api.prefetchSeries(selected.id);
              }
            }}
          >
            {item => (
              <Card
                title={item().title || item().name || ""}
                imageUrl={pickPoster(item(), 240)}
                subtitle={props.caption(item())}
                onEnter={() => {
                  navigate(hrefWithProvider(props.detailHref(item())));
                  return true;
                }}
                item={item()}
              />
            )}
          </VirtualGrid>
        </View>
      </Show>

      <ScrollIndicator
        x={PAGE_WIDTH - 20}
        y={HEADER_HEIGHT + GRID_INSET_Y + 12}
        scrollPosition={scrollPosition()}
        trackHeight={1080 - HEADER_HEIGHT - GRID_INSET_Y - 56}
        autoHideDelay={1500}
      />
    </View>
  );
}

export default CatalogGridPage;
