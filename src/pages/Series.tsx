import { ElementNode, Text, View } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Card, CategoryChip, ScrollIndicator, SearchBox, SkeletonLoader } from "../components";
import api, { type Category, type Series as SeriesType } from "../lib/api";
import { theme } from "@/styles";

const ITEMS_PER_ROW = 6;
const ITEMS_PER_PAGE = 30;
const HEADER_HEIGHT = 196;

// Style constants following demo app patterns
function seriesCaption(show: SeriesType) {
  return [
    show.year ? String(show.year) : null,
    show.rating ? `${show.rating.toFixed(1)} IMDb` : null,
    show.season_count ? `${show.season_count} temp.` : null,
  ]
    .filter(Boolean)
    .join(" • ");
}

const Series = () => {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = createSignal<number | undefined>(undefined);
  const [offset, setOffset] = createSignal(0);
  const [searchQuery, setSearchQuery] = createSignal<string | undefined>(undefined);
  const [accumulatedSeries, setAccumulatedSeries] = createSignal<SeriesType[]>([]);
  const [totalItems, setTotalItems] = createSignal(0);
  const [scrollPosition, setScrollPosition] = createSignal(0);

  let titleRow: ElementNode | undefined;
  let categoriesRow: ElementNode | undefined;
  let contentGrid: ElementNode | undefined;
  let loadMoreButton: ElementNode | undefined;

  // Fetch categories
  const [categories] = createResource(() => api.getCategories("series"));

  // Fetch series based on category and search
  const [seriesResource] = createResource(
    () => ({
      category_id: selectedCategory(),
      offset: offset(),
      limit: ITEMS_PER_PAGE,
      search: searchQuery(),
    }),
    params => api.getSeries(params),
  );

  // Accumulate results when resource updates
  createEffect(() => {
    const result = seriesResource();
    if (result) {
      setTotalItems(result.total);
      if (offset() === 0) {
        // Fresh load (category change, search, etc) - replace data
        setAccumulatedSeries(result.data);
      } else {
        // Load more - append data and restore focus
        setAccumulatedSeries(prev => [...prev, ...result.data]);

        // Restore focus to load more button
        setTimeout(() => {
          if (loadMoreButton) {
            loadMoreButton.setFocus();
          }
        }, 100);
      }
    }
  });

  // Handle search
  const handleSearch = (query: string) => {
    setAccumulatedSeries([]);
    setSearchQuery(query);
    setSelectedCategory(undefined);
    setOffset(0);
  };

  // Chunk series into rows
  const seriesRows = () => {
    const data = accumulatedSeries();
    const rows: SeriesType[][] = [];
    for (let i = 0; i < data.length; i += ITEMS_PER_ROW) {
      rows.push(data.slice(i, i + ITEMS_PER_ROW));
    }
    return rows;
  };

  // Handle loading more
  const loadMore = () => {
    const total = totalItems();
    const currentCount = accumulatedSeries().length;
    if (currentCount < total) {
      setOffset(currentCount);
    }
  };

  // Navigate to series on Enter
  const handleSeriesSelect = (show: SeriesType) => {
    navigate(`/series/${show.id}`);
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
      <View x={0} y={0} width={1700} height={HEADER_HEIGHT} zIndex={10} color={0x0a0a0fff}>
        {/* Title and Search */}
        <Row
          ref={titleRow}
          width={1660}
          height={100}
          x={20}
          gap={20}
          scroll="none"
          onDown={() => categoriesRow?.setFocus()}
        >
          <View width={1400} skipFocus>
            <Text y={14} fontSize={42} fontWeight={700} color={0xffffffff}>
              Séries
            </Text>
            <Text y={64} fontSize={18} color={theme.textSecondary}>
              Entre no universo da série antes de escolher temporada e episódio.
            </Text>
          </View>
          <SearchBox onSearch={handleSearch} placeholder="Buscar séries..." />
        </Row>

        {/* Category Filter - horizontal scrolling */}
        <Row
          ref={categoriesRow}
          x={20}
          y={130}
          width={1660}
          height={50}
          gap={12}
          scroll="auto"
          autofocus
          onUp={() => titleRow?.setFocus()}
          onDown={() => contentGrid?.setFocus()}
        >
          <CategoryChip
            label="Todas"
            width={100}
            active={selectedCategory() === undefined && !searchQuery()}
            onSelect={() => {
              if (selectedCategory() === undefined && !searchQuery()) return;
              setAccumulatedSeries([]);
              setSelectedCategory(undefined);
              setSearchQuery(undefined);
              setOffset(0);
            }}
          />
          <For each={categories()}>
            {(category: Category) => (
              <CategoryChip
                label={category.name}
                active={selectedCategory() === category.id && !searchQuery()}
                onSelect={() => {
                  if (selectedCategory() === category.id && !searchQuery()) return;
                  setAccumulatedSeries([]);
                  setSelectedCategory(category.id);
                  setSearchQuery(undefined);
                  setOffset(0);
                }}
              />
            )}
          </For>
        </Row>
      </View>

      {/* Series Grid - below fixed header with clipping */}
      <Column
        ref={contentGrid}
        x={20}
        y={HEADER_HEIGHT}
        width={1640}
        height={1080 - HEADER_HEIGHT - 10}
        gap={24}
        scroll="auto"
        plinko
        clipping
        onUp={() => categoriesRow?.setFocus()}
        onScrolled={(ref, pos, isInitial) => {
          if (!isInitial && ref.children.length > 0) {
            const totalContentHeight = ref.children.length * (420 + 24);
            const viewportHeight = 1080 - HEADER_HEIGHT - 10;
            const maxScroll = Math.max(1, totalContentHeight - viewportHeight);
            setScrollPosition(Math.abs(pos) / maxScroll);
          }
        }}
      >
        <Show when={seriesResource.loading && accumulatedSeries().length === 0}>
          {/* Skeleton loaders */}
          <Row width={1640} height={420} gap={16} scroll="none" skipFocus>
            <For each={[1, 2, 3, 4, 5, 6]}>
              {() => (
                <View width={240} height={420}>
                  <SkeletonLoader width={240} height={360} />
                  <SkeletonLoader width={180} height={20} y={370} borderRadius={4} />
                </View>
              )}
            </For>
          </Row>
        </Show>

        <Show when={!seriesResource.loading && seriesRows().length === 0}>
          <View
            width={1640}
            height={400}
            display="flex"
            justifyContent="center"
            alignItems="center"
            skipFocus
          >
            <Text fontSize={28} color={0x888888ff}>
              Nenhuma série encontrada
            </Text>
          </View>
        </Show>

        <For each={seriesRows()}>
          {row => (
            <Row width={1640} height={420} gap={16} scroll="none">
              <For each={row}>
                {(show: SeriesType) => (
                  <Card
                    title={show.title || show.name || ""}
                    imageUrl={show.poster_url || show.poster || undefined}
                    subtitle={seriesCaption(show)}
                    onFocus={() => api.prefetchSeries(String(show.id))}
                    onEnter={() => {
                      handleSeriesSelect(show);
                      return true;
                    }}
                    item={{ id: show.id, type: "series", href: `/series/${show.id}` }}
                  />
                )}
              </For>
            </Row>
          )}
        </For>

        {/* Load More Button */}
        <Show when={accumulatedSeries().length > 0 && accumulatedSeries().length < totalItems()}>
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
                color: 0x333333ff,
                transition: { scale: { duration: 150 } },
                $focus: { scale: 1.1, color: 0xe50914ff },
              }}
              onEnter={() => {
                loadMore();
                return true;
              }}
            >
              <Text fontSize={18} color={0xffffffff}>
                {seriesResource.loading ? "Carregando..." : "Carregar Mais"}
              </Text>
            </View>
          </Row>
        </Show>
      </Column>

      {/* Scroll Indicator */}
      <ScrollIndicator
        x={1680}
        y={160}
        scrollPosition={scrollPosition()}
        trackHeight={880}
        autoHideDelay={1500}
      />
    </View>
  );
};

export default Series;
