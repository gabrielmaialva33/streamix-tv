import { ElementNode, Text, View } from "@lightningtv/solid";
import { Column, Row } from "@lightningtv/solid/primitives";
import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Card, CategoryChip, ScrollIndicator, SearchBox, SkeletonLoader } from "../components";
import api, { type Category, type Movie } from "../lib/api";

const ITEMS_PER_ROW = 6;
const ITEMS_PER_PAGE = 30;
const HEADER_HEIGHT = 196;

// Style constants following demo app patterns
function movieCaption(movie: Movie) {
  return [movie.year ? String(movie.year) : null, movie.rating ? `${movie.rating.toFixed(1)} IMDb` : null]
    .filter(Boolean)
    .join(" • ");
}

const Movies = () => {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = createSignal<number | undefined>(undefined);
  const [offset, setOffset] = createSignal(0);
  const [searchQuery, setSearchQuery] = createSignal<string | undefined>(undefined);
  const [accumulatedMovies, setAccumulatedMovies] = createSignal<Movie[]>([]);
  const [totalItems, setTotalItems] = createSignal(0);
  const [_lastFocusedIndex, setLastFocusedIndex] = createSignal<number | null>(null);
  const [scrollPosition, setScrollPosition] = createSignal(0);

  let titleRow: ElementNode | undefined;
  let categoriesRow: ElementNode | undefined;
  let contentGrid: ElementNode | undefined;
  let loadMoreButton: ElementNode | undefined;

  // Fetch categories
  const [categories] = createResource(() => api.getCategories("movie"));

  // Fetch movies based on category and search
  const [moviesResource] = createResource(
    () => ({
      category_id: selectedCategory(),
      offset: offset(),
      limit: ITEMS_PER_PAGE,
      search: searchQuery(),
    }),
    params => api.getMovies(params),
  );

  // Accumulate results when resource updates
  createEffect(() => {
    const result = moviesResource();
    if (result) {
      setTotalItems(result.total);
      if (offset() === 0) {
        // Fresh load (category change, search, etc) - replace data
        setAccumulatedMovies(result.data);
      } else {
        // Load more - append data and restore focus
        setAccumulatedMovies(prev => [...prev, ...result.data]);

        // If everything is loaded the <Show> unmounts the load-more button;
        // setFocus() on the disposed ref would be a silent no-op and the D-pad
        // would hang on a real TV. Fall back to the grid when that happens.
        queueMicrotask(() => {
          const allLoaded = accumulatedMovies().length >= totalItems();
          if (!allLoaded && loadMoreButton?.parent) {
            loadMoreButton.setFocus();
          } else {
            contentGrid?.setFocus();
          }
        });
      }
    }
  });

  // Handle search
  const handleSearch = (query: string) => {
    setAccumulatedMovies([]); // Clear accumulated data
    setSearchQuery(query);
    setSelectedCategory(undefined);
    setOffset(0);
  };

  // Chunk movies into rows
  const movieRows = () => {
    const data = accumulatedMovies();
    const rows: Movie[][] = [];
    for (let i = 0; i < data.length; i += ITEMS_PER_ROW) {
      rows.push(data.slice(i, i + ITEMS_PER_ROW));
    }
    return rows;
  };

  // Handle loading more - save current position
  const loadMore = () => {
    const total = totalItems();
    const currentCount = accumulatedMovies().length;
    if (currentCount < total) {
      setLastFocusedIndex(currentCount - 1);
      setOffset(currentCount);
    }
  };

  // Navigate to movie on Enter
  const handleMovieSelect = (movie: Movie) => {
    navigate(`/movie/${movie.id}`);
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
              Filmes
            </Text>
            <Text y={64} fontSize={18} color={0xa7a7b3ff}>
              Descubra títulos com mais contexto antes de dar play.
            </Text>
          </View>
          <SearchBox onSearch={handleSearch} placeholder="Buscar filmes..." />
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
            label="Todos"
            width={100}
            active={selectedCategory() === undefined && !searchQuery()}
            onSelect={() => {
              if (selectedCategory() === undefined && !searchQuery()) return;
              setAccumulatedMovies([]);
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
                  setAccumulatedMovies([]);
                  setSelectedCategory(category.id);
                  setSearchQuery(undefined);
                  setOffset(0);
                }}
              />
            )}
          </For>
        </Row>
      </View>

      {/* Movies Grid - below fixed header with clipping */}
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
            const totalContentHeight = ref.children.length * (420 + 24); // row height + gap
            const viewportHeight = 1080 - HEADER_HEIGHT - 10;
            const maxScroll = Math.max(1, totalContentHeight - viewportHeight);
            setScrollPosition(Math.abs(pos) / maxScroll);
          }
        }}
      >
        <Show when={moviesResource.loading && accumulatedMovies().length === 0}>
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

        <Show when={!moviesResource.loading && movieRows().length === 0}>
          <View
            width={1640}
            height={400}
            display="flex"
            justifyContent="center"
            alignItems="center"
            skipFocus
          >
            <Text fontSize={28} color={0x888888ff}>
              Nenhum filme encontrado
            </Text>
          </View>
        </Show>

        <For each={movieRows()}>
          {row => (
            <Row width={1640} height={420} gap={16} scroll="none">
              <For each={row}>
                {(movie: Movie) => (
                  <Card
                    title={movie.title || movie.name || ""}
                    imageUrl={movie.poster_url || movie.poster || undefined}
                    subtitle={movieCaption(movie)}
                    onFocus={() => api.prefetchMovie(String(movie.id))}
                    onEnter={() => {
                      handleMovieSelect(movie);
                      return true;
                    }}
                    item={{ id: movie.id, type: "movie", href: `/movie/${movie.id}` }}
                  />
                )}
              </For>
            </Row>
          )}
        </For>

        {/* Load More Button */}
        <Show when={accumulatedMovies().length > 0 && accumulatedMovies().length < totalItems()}>
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
                {moviesResource.loading ? "Carregando..." : "Carregar Mais"}
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

export default Movies;
