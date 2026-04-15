import { type ElementNode, View } from "@lightningtv/solid";
import { Column } from "@lightningtv/solid/primitives";
import { createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Card, ContentRow, ContinueWatchingRow, Hero } from "../components";
import api, { type FeaturedItem, type Movie, type RecommendationItem, type Series } from "../lib/api";
import { theme } from "@/styles";

function movieCaption(movie: Movie) {
  return [movie.year ? String(movie.year) : null, movie.rating ? `${movie.rating.toFixed(1)} IMDb` : null]
    .filter(Boolean)
    .join(" • ");
}

function recommendationCaption(item: RecommendationItem) {
  return [item.year ? String(item.year) : null, item.rating ? `${item.rating.toFixed(1)} IMDb` : null]
    .filter(Boolean)
    .join(" • ");
}

function recommendationPoster(item: RecommendationItem) {
  return item.poster || (Array.isArray(item.backdrop) ? item.backdrop[0] : item.backdrop) || undefined;
}

const Home = () => {
  const navigate = useNavigate();
  const [featuredIndex, setFeaturedIndex] = createSignal(0);

  let hero: ElementNode | undefined;
  let railsColumn: ElementNode | undefined;

  // The backend provides curated trending, recent, and top-rated rails.
  const [featured] = createResource(() => api.getFeatured());
  const [trendingMovies] = createResource(() => api.getTrending("movie", 20) as Promise<Movie[]>);
  const [recentMovies] = createResource(() => api.getRecent("movie", 20) as Promise<Movie[]>);
  const [topRatedMovies] = createResource(() => api.getTopRated("movie", 20) as Promise<Movie[]>);
  const [trendingSeries] = createResource(() => api.getTrending("series", 20) as Promise<Series[]>);
  const [recommendedMovies] = createResource(() => api.getRecommendations("movies", 18).catch(() => null));

  // Register cleanup explicitly; returning from onMount does not dispose the timer.
  onMount(() => {
    const interval = setInterval(() => {
      const items = featured();
      if (items && items.length > 1) {
        setFeaturedIndex(i => (i + 1) % items.length);
      }
    }, 8000);
    onCleanup(() => clearInterval(interval));
  });

  // Fall back to the first trending movie if featured content is unavailable.
  const featuredList = (): FeaturedItem[] => {
    const items = featured();
    if (items && items.length > 0) return items;
    const first = trendingMovies()?.[0];
    if (!first) return [];
    return [
      {
        id: first.id,
        type: "movie",
        title: first.title || first.name,
        name: first.name,
        plot: first.plot ?? undefined,
        description: first.plot ?? undefined,
        poster: first.poster ?? undefined,
        poster_url: first.poster_url,
        backdrop: first.backdrop,
        backdrop_url: first.backdrop_url,
        year: first.year,
        rating: first.rating,
        genre: first.genre,
      },
    ];
  };

  const currentFeatured = () => featuredList()[featuredIndex()];

  const handlePlayFeatured = () => {
    const item = currentFeatured();
    if (!item) return;

    if (item.type === "movie") {
      navigate(`/player/movie/${item.id}`);
    } else if (item.type === "series") {
      navigate(`/series/${item.id}`);
    } else if (item.type === "channel") {
      navigate(`/player/channel/${item.id}`);
    }
  };

  const handleInfoFeatured = () => {
    const item = currentFeatured();
    if (!item) return;

    if (item.type === "movie") {
      navigate(`/movie/${item.id}`);
    } else if (item.type === "series") {
      navigate(`/series/${item.id}`);
    }
  };

  return (
    <View
      width={1700}
      height={1080}
      color={theme.background}
      forwardFocus={() => {
        hero?.setFocus();
        return true;
      }}
    >
      <Hero
        ref={hero}
        item={currentFeatured()}
        onPlay={handlePlayFeatured}
        onInfo={handleInfoFeatured}
        onDownRequest={() => {
          railsColumn?.setFocus();
          return true;
        }}
      />

      <View x={0} y={620} width={1700} height={460} clipping forwardFocus={0}>
        <Column
          ref={railsColumn}
          width={1700}
          height={460}
          gap={28}
          scroll="always"
          forwardFocus={0}
          onUp={function (this) {
            // `always` scroll pins selected to 0 visually, so we track the
            // internal selected ourselves: only bubble Up to the hero when
            // we're actually on the first rail.
            if (this.selected === 0) {
              hero?.setFocus();
              return true;
            }
            return false;
          }}
        >
          <Show when={recommendedMovies()?.recommendations?.length}>
            <ContentRow
              title="Para você"
              autofocus
              onSelectedChanged={index => {
                const movie = recommendedMovies()?.recommendations?.[index];
                if (movie) api.prefetchMovie(String(movie.id));
              }}
              onItemSelected={item => navigate(item.href)}
            >
              <For each={recommendedMovies()?.recommendations || []}>
                {(movie: RecommendationItem) => (
                  <Card
                    title={movie.title || movie.name || ""}
                    imageUrl={recommendationPoster(movie)}
                    subtitle={recommendationCaption(movie)}
                    item={{ id: movie.id, type: "movie", href: `/movie/${movie.id}` }}
                  />
                )}
              </For>
            </ContentRow>
          </Show>

          <Show when={trendingMovies()?.length}>
            <ContentRow
              title="Em alta"
              onSelectedChanged={index => {
                const movie = trendingMovies()?.[index];
                if (movie) api.prefetchMovie(String(movie.id));
              }}
              onItemSelected={item => navigate(item.href)}
            >
              <For each={trendingMovies()}>
                {(movie: Movie) => (
                  <Card
                    title={movie.title || movie.name || ""}
                    imageUrl={movie.poster_url || movie.poster || undefined}
                    subtitle={movieCaption(movie)}
                    item={{ id: movie.id, type: "movie", href: `/movie/${movie.id}` }}
                  />
                )}
              </For>
            </ContentRow>
          </Show>

          <Show when={recentMovies()?.length}>
            <ContentRow
              title="Chegaram agora"
              onSelectedChanged={index => {
                const movie = recentMovies()?.[index];
                if (movie) api.prefetchMovie(String(movie.id));
              }}
              onItemSelected={item => navigate(item.href)}
            >
              <For each={recentMovies()}>
                {(movie: Movie) => (
                  <Card
                    title={movie.title || movie.name || ""}
                    imageUrl={movie.poster_url || movie.poster || undefined}
                    subtitle={movieCaption(movie)}
                    item={{ id: movie.id, type: "movie", href: `/movie/${movie.id}` }}
                  />
                )}
              </For>
            </ContentRow>
          </Show>

          <Show when={topRatedMovies()?.length}>
            <ContentRow
              title="Mais elogiados"
              onSelectedChanged={index => {
                const movie = topRatedMovies()?.[index];
                if (movie) api.prefetchMovie(String(movie.id));
              }}
              onItemSelected={item => navigate(item.href)}
            >
              <For each={topRatedMovies()}>
                {(movie: Movie) => (
                  <Card
                    title={movie.title || movie.name || ""}
                    imageUrl={movie.poster_url || movie.poster || undefined}
                    subtitle={movieCaption(movie)}
                    item={{ id: movie.id, type: "movie", href: `/movie/${movie.id}` }}
                  />
                )}
              </For>
            </ContentRow>
          </Show>

          <Show when={trendingSeries()?.length}>
            <ContentRow
              title="Séries em alta"
              onSelectedChanged={index => {
                const show = trendingSeries()?.[index];
                if (show) api.prefetchSeries(String(show.id));
              }}
              onItemSelected={item => navigate(item.href)}
            >
              <For each={trendingSeries()}>
                {(show: Series) => (
                  <Card
                    title={show.title || show.name || ""}
                    imageUrl={show.poster_url || show.poster || undefined}
                    subtitle={show.year ? String(show.year) : undefined}
                    item={{ id: show.id, type: "series", href: `/series/${show.id}` }}
                  />
                )}
              </For>
            </ContentRow>
          </Show>

          <ContinueWatchingRow limit={10} />
        </Column>
      </View>
    </View>
  );
};

export default Home;
