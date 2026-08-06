import { ElementNode, Text, View } from "@solidtv/solid";
import { Row, VirtualGrid } from "@solidtv/solid/primitives";
import { batch, createEffect, createMemo, createResource, createSignal, For, on, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Card, CategoryChip, ScrollIndicator, SkeletonLoader } from "@/components";
import { useCatalogBrowseFilters } from "@/features/catalog/catalogFilters";
import api, {
  type CatalogListParams,
  type CatalogProvider,
  type Category,
  type CategoryFilter,
  type PaginatedResponse,
} from "@/lib/api";
import { pickPoster } from "@/lib/imageUrl";
import { onNavReset } from "@/shared/navReset";
import { theme } from "@/styles";

const ITEMS_PER_ROW = 6;
const ITEMS_PER_PAGE = 30;
const VISIBLE_ROWS = 2;
const HEADER_HEIGHT = 230;
const PROVIDER_ROW_Y = 122;
const CATEGORY_ROW_Y = 174;
const GRID_Y = 242;
const GRID_HEIGHT = 1080 - GRID_Y - 10;
const ROW_HEIGHT = 420;

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
  /** Label for the "no category filter" chip — "Todos" / "Todas". */
  allLabel: string;
  emptyMessage: string;
  categoryType: CategoryFilter;
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
  const {
    providerId: selectedProvider,
    categoryId: selectedCategory,
    selectProvider: setSelectedProvider,
    selectCategory: setSelectedCategory,
    hrefWithProvider,
  } = useCatalogBrowseFilters();
  const [offset, setOffset] = createSignal(0);
  const [accumulatedItems, setAccumulatedItems] = createSignal<T[]>([]);
  const [hasMore, setHasMore] = createSignal(false);
  const [scrollPosition, setScrollPosition] = createSignal(0);

  let providersRow: ElementNode | undefined;
  let categoriesRow: ElementNode | undefined;
  let contentGrid: ElementNode | undefined;
  let seenItemIds = new Set<T["id"]>();

  onNavReset(() => providersRow?.setFocus());

  const [providers] = createResource(api.getCatalogProviders, { initialValue: [] });
  const contentType = () => (props.itemType === "movie" ? "movies" : "series");
  const availableProviders = createMemo(() =>
    providers().filter(provider => provider.content_types.includes(contentType())),
  );
  const [categories] = createResource(
    selectedProvider,
    providerId => api.getCategories(props.categoryType, { provider_id: providerId }),
    { initialValue: [] },
  );
  const [itemsResource] = createResource(
    () => ({
      provider_id: selectedProvider(),
      category_id: selectedCategory(),
      offset: offset(),
      limit: ITEMS_PER_PAGE,
    }),
    params => props.fetchPage(params),
  );

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
    const result = itemsResource();
    if (!result) return;

    if (offset() === 0) {
      seenItemIds = new Set(result.data.map(item => item.id));
      setAccumulatedItems(result.data);
      setHasMore(result.has_more && result.data.length > 0);
      return;
    }

    const fresh = result.data.filter(item => !seenItemIds.has(item.id));
    fresh.forEach(item => seenItemIds.add(item.id));
    if (fresh.length > 0) setAccumulatedItems(previous => [...previous, ...fresh]);
    setHasMore(result.has_more && fresh.length > 0);
  });

  const loadMore = () => {
    if (!itemsResource.loading && hasMore()) {
      setOffset(previous => previous + ITEMS_PER_PAGE);
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
        <View width={1660} height={100} x={20} skipFocus>
          <Text y={14} fontSize={42} fontWeight={700} color={0xffffffff}>
            {props.title}
          </Text>
          <Text y={70} fontSize={18} color={theme.textSecondary}>
            {props.subtitle}
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
              label={props.allLabel}
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

      <Show when={itemsResource.loading && accumulatedItems().length === 0}>
        <Row x={20} y={GRID_Y} width={1640} height={ROW_HEIGHT} gap={16} scroll="none" skipFocus>
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

      <Show when={!itemsResource.loading && accumulatedItems().length === 0}>
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
            {props.emptyMessage}
          </Text>
        </View>
      </Show>

      <Show when={accumulatedItems().length > 0}>
        <VirtualGrid
          ref={contentGrid}
          x={20}
          y={GRID_Y}
          width={1640}
          height={GRID_HEIGHT}
          columns={ITEMS_PER_ROW}
          rows={VISIBLE_ROWS}
          buffer={1}
          gap={16}
          scroll="always"
          plinko
          clipping
          each={accumulatedItems()}
          onUp={leaveGridUp}
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
      </Show>

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
