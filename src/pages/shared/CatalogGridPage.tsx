import { ElementNode, Text, View } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import { createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Card, CategoryChip, LoadMoreButton, ScrollIndicator, SkeletonLoader } from "@/components";
import api, { type Category, type CategoryFilter, type PaginatedResponse } from "@/lib/api";
import { pickPoster } from "@/lib/imageUrl";
import { onNavReset } from "@/shared/navReset";
import { theme } from "@/styles";

const ITEMS_PER_ROW = 6;
const ITEMS_PER_PAGE = 30;
const MAX_RENDERED_ITEMS = 90;
const HEADER_HEIGHT = 196;
const CATEGORY_ROW_Y = 136;
const GRID_Y = 210;
const GRID_HEIGHT = 1080 - GRID_Y - 10;
const ROW_HEIGHT = 420;
const ROW_GAP = 24;
const IMAGE_REVEAL_ROW_DELAY = 70;

interface CatalogItem {
  id: number;
  title: string | null;
  name: string;
  // Poster variant fields consumed by pickPoster (present on Movie and Series).
  poster?: string | null;
  poster_url?: string;
  poster_w240?: string | null;
  poster_w480?: string | null;
  poster_w720?: string | null;
}

interface ListParams {
  category_id?: number;
  offset: number;
  limit: number;
  search?: string;
}

export interface CatalogGridPageProps<T extends CatalogItem> {
  title: string;
  subtitle: string;
  /** Label for the "no category filter" chip — "Todos" / "Todas". */
  allLabel: string;
  emptyMessage: string;
  categoryType: CategoryFilter;
  itemType: "movie" | "series";
  fetchPage: (params: ListParams) => Promise<PaginatedResponse<T>>;
  caption: (item: T) => string;
  detailHref: (item: T) => string;
}

/**
 * Paginated poster grid with category chips, shared by the Movies and Series
 * pages. Only load-more textures within IMAGE_REVEAL_ROW_DELAY waves so VRAM
 * stays bounded when the user pages through a large catalog.
 */
function CatalogGridPage<T extends CatalogItem>(props: CatalogGridPageProps<T>) {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = createSignal<number | undefined>(undefined);
  const [offset, setOffset] = createSignal(0);
  const [searchQuery, setSearchQuery] = createSignal<string | undefined>(undefined);
  const [accumulatedItems, setAccumulatedItems] = createSignal<T[]>([]);
  const [hasMore, setHasMore] = createSignal(false);
  const [pendingFocusIndex, setPendingFocusIndex] = createSignal<number | null>(null);
  const [scrollPosition, setScrollPosition] = createSignal(0);
  const [revealFromIndex, setRevealFromIndex] = createSignal(Number.POSITIVE_INFINITY);

  let categoriesRow: ElementNode | undefined;
  let contentGrid: ElementNode | undefined;
  let loadMoreButton: ElementNode | undefined;
  let seenItemIds = new Set<T["id"]>();

  // Reset to categories when the user re-clicks the page route in the sidebar.
  onNavReset(() => categoriesRow?.setFocus());

  const [categories] = createResource(() => api.getCategories(props.categoryType));

  const [itemsResource] = createResource(
    () => ({
      category_id: selectedCategory(),
      offset: offset(),
      limit: ITEMS_PER_PAGE,
      search: searchQuery(),
    }),
    params => props.fetchPage(params),
  );

  // Accumulate results when the resource updates.
  createEffect(() => {
    const result = itemsResource();
    if (!result) return;

    if (offset() === 0) {
      // Fresh load (category change, search, etc) - replace data
      seenItemIds = new Set(result.data.map(item => item.id));
      setHasMore(result.has_more && result.data.length > 0);
      setAccumulatedItems(() => result.data);
      return;
    }

    setAccumulatedItems(prev => {
      const fresh = result.data.filter(item => !seenItemIds.has(item.id));
      if (fresh.length === 0) {
        // No new rows to add -> stop pagination so "Carregar Mais" hides.
        setHasMore(false);
        return prev;
      }
      fresh.forEach(item => seenItemIds.add(item.id));
      const combined = [...prev, ...fresh];
      const trimStart = Math.max(0, combined.length - MAX_RENDERED_ITEMS);
      const next = combined.slice(trimStart);
      const focusIndex = Math.max(0, prev.length - trimStart);
      setPendingFocusIndex(focusIndex);
      setRevealFromIndex(focusIndex);
      setHasMore(result.has_more);
      return next;
    });

    // If everything is loaded the <Show> unmounts the load-more button;
    // setFocus() on the disposed ref would be a silent no-op and the D-pad
    // would hang on a real TV. Fall back to the grid when that happens.
    setTimeout(() => {
      if (hasMore() && loadMoreButton?.parent) {
        loadMoreButton.setFocus();
      } else if (pendingFocusIndex() !== null) {
        focusItemAt(Math.min(pendingFocusIndex() ?? 0, accumulatedItems().length - 1));
      } else {
        contentGrid?.setFocus();
      }
      setPendingFocusIndex(null);
    });
  });

  const itemRows = createMemo(() => {
    const data = accumulatedItems();
    const rows: T[][] = [];
    for (let i = 0; i < data.length; i += ITEMS_PER_ROW) {
      rows.push(data.slice(i, i + ITEMS_PER_ROW));
    }
    return rows;
  });

  const focusItemAt = (index: number) => {
    const row = contentGrid?.children[Math.floor(index / ITEMS_PER_ROW)];
    const card = row?.children[index % ITEMS_PER_ROW];
    card?.setFocus();
  };

  // Handle loading more - save current position
  const loadMore = () => {
    const currentCount = accumulatedItems().length;
    if (!itemsResource.loading && hasMore()) {
      setPendingFocusIndex(currentCount);
      setRevealFromIndex(currentCount);
      setOffset(prev => prev + ITEMS_PER_PAGE);
    }
  };

  const imageDelayFor = (index: number) => {
    const start = revealFromIndex();
    return index >= start ? Math.floor((index - start) / ITEMS_PER_ROW) * IMAGE_REVEAL_ROW_DELAY : 0;
  };

  const selectCategory = (categoryId: number | undefined) => {
    if (selectedCategory() === categoryId && !searchQuery()) return;
    seenItemIds = new Set<T["id"]>();
    setAccumulatedItems([]);
    setHasMore(false);
    setRevealFromIndex(Number.POSITIVE_INFINITY);
    setSelectedCategory(categoryId);
    setSearchQuery(undefined);
    setOffset(0);
  };

  return (
    <View
      width={1700}
      height={1080}
      // When the page container forwards focus here, land on the categories row.
      forwardFocus={() => {
        categoriesRow?.setFocus();
        return true;
      }}
    >
      {/* Fixed Header - solid background hides content scrolling behind */}
      <View x={0} y={0} width={1700} height={HEADER_HEIGHT} zIndex={10} color={theme.backgroundElevated}>
        <View width={1660} height={100} x={20} skipFocus>
          <Text y={14} fontSize={42} fontWeight={700} color={0xffffffff}>
            {props.title}
          </Text>
          <Text y={70} fontSize={18} color={theme.textSecondary}>
            {props.subtitle}
          </Text>
        </View>
        <View x={20} y={HEADER_HEIGHT - 1} width={1640} height={1} color={theme.border} skipFocus />

        {/* Category Filter - horizontal scrolling */}
        <Row
          ref={categoriesRow}
          x={20}
          y={CATEGORY_ROW_Y}
          width={1660}
          height={54}
          gap={12}
          scroll="center"
          autofocus
          onDown={() => contentGrid?.setFocus()}
        >
          <CategoryChip
            label={props.allLabel}
            width={100}
            active={selectedCategory() === undefined && !searchQuery()}
            onSelect={() => selectCategory(undefined)}
          />
          <For each={categories()}>
            {(category: Category) => (
              <CategoryChip
                label={category.name}
                active={selectedCategory() === category.id && !searchQuery()}
                onSelect={() => selectCategory(category.id)}
              />
            )}
          </For>
        </Row>
      </View>

      {/* Content Grid - below fixed header with clipping */}
      <Column
        ref={contentGrid}
        x={20}
        y={GRID_Y}
        width={1640}
        height={GRID_HEIGHT}
        gap={ROW_GAP}
        scroll="auto"
        plinko
        clipping
        onUp={() => categoriesRow?.setFocus()}
        onScrolled={(ref, pos, isInitial) => {
          if (!isInitial && ref.children.length > 0) {
            const totalContentHeight = ref.children.length * (ROW_HEIGHT + ROW_GAP);
            const maxScroll = Math.max(1, totalContentHeight - GRID_HEIGHT);
            setScrollPosition(Math.abs(pos) / maxScroll);
          }
        }}
      >
        <Show when={itemsResource.loading && accumulatedItems().length === 0}>
          {/* Skeleton loaders */}
          <Row width={1640} height={ROW_HEIGHT} gap={16} scroll="none" skipFocus>
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

        <Show when={!itemsResource.loading && itemRows().length === 0}>
          <View
            width={1640}
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

        <For each={itemRows()}>
          {(row, rowIndex) => (
            <Row width={1640} height={ROW_HEIGHT} gap={16} scroll="none">
              <For each={row}>
                {(item: T, itemIndex) => (
                  <Card
                    title={item.title || item.name || ""}
                    imageUrl={pickPoster(item, 240)}
                    imageDelay={imageDelayFor(rowIndex() * ITEMS_PER_ROW + itemIndex())}
                    subtitle={props.caption(item)}
                    onEnter={() => {
                      navigate(props.detailHref(item));
                      return true;
                    }}
                    item={{ id: item.id, type: props.itemType, href: props.detailHref(item) }}
                  />
                )}
              </For>
            </Row>
          )}
        </For>

        <Show when={accumulatedItems().length > 0 && hasMore()}>
          <LoadMoreButton ref={loadMoreButton} loading={itemsResource.loading} onLoadMore={loadMore} />
        </Show>
      </Column>

      {/* Scroll Indicator */}
      <ScrollIndicator
        x={1680}
        y={GRID_Y + 12}
        scrollPosition={scrollPosition()}
        trackHeight={1080 - GRID_Y - 56}
        autoHideDelay={1500}
      />
    </View>
  );
}

export default CatalogGridPage;
