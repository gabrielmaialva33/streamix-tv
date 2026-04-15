import { Column } from "@lightningtv/solid/primitives";
import { createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Card, ContentRow, ContinueWatchingRow, Hero } from "../components";
import api, { type FeaturedItem, type Movie, type Series } from "../lib/api";

const Home = () => {
  const navigate = useNavigate();
  const [featuredIndex, setFeaturedIndex] = createSignal(0);

  // The backend provides curated trending, recent, and top-rated rails.
  const [featured] = createResource(() => api.getFeatured());
  const [trendingMovies] = createResource(() => api.getTrending("movie", 20) as Promise<Movie[]>);
  const [recentMovies] = createResource(() => api.getRecent("movie", 20) as Promise<Movie[]>);
  const [topRatedMovies] = createResource(() => api.getTopRated("movie", 20) as Promise<Movie[]>);
  const [trendingSeries] = createResource(() => api.getTrending("series", 20) as Promise<Series[]>);

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
    <Column
      width={1700}
      height={1080}
      gap={30}
      scroll="always"
      // Forward focus to the first ContentRow (child 1, after Hero).
      forwardFocus={1}
    >
      <Hero item={currentFeatured()} onPlay={handlePlayFeatured} onInfo={handleInfoFeatured} />

      <Show when={trendingMovies()?.length}>
        <ContentRow
          title="Em Alta"
          autofocus
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
                subtitle={movie.year?.toString()}
                item={{ id: movie.id, type: "movie", href: `/player/movie/${movie.id}` }}
              />
            )}
          </For>
        </ContentRow>
      </Show>

      <Show when={recentMovies()?.length}>
        <ContentRow
          title="Adicionados Recentemente"
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
                subtitle={movie.year?.toString()}
                item={{ id: movie.id, type: "movie", href: `/player/movie/${movie.id}` }}
              />
            )}
          </For>
        </ContentRow>
      </Show>

      <Show when={topRatedMovies()?.length}>
        <ContentRow
          title="Mais Bem Avaliados"
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
                subtitle={movie.year?.toString()}
                item={{ id: movie.id, type: "movie", href: `/player/movie/${movie.id}` }}
              />
            )}
          </For>
        </ContentRow>
      </Show>

      <Show when={trendingSeries()?.length}>
        <ContentRow
          title="Series em Alta"
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
                subtitle={show.year?.toString()}
                item={{ id: show.id, type: "series", href: `/series/${show.id}` }}
              />
            )}
          </For>
        </ContentRow>
      </Show>

      <ContinueWatchingRow limit={10} />
    </Column>
  );
};

export default Home;
