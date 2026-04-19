import { type ElementNode, View } from "@lightningtv/solid";
import { Column } from "@lightningtv/solid/primitives";
import { createEffect, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Card, ContentRow, ContinueWatchingRow, Hero } from "../components";
import api, { type FeaturedItem, type Movie, type RecommendationItem, type Series } from "../lib/api";
import { pickPoster } from "@/lib/imageUrl";
import { navResetTick } from "@/shared/navReset";
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
  const raw = item.poster || (Array.isArray(item.backdrop) ? item.backdrop[0] : item.backdrop) || undefined;
  return pickPoster({ poster: raw }, 240);
}

const Home = () => {
  const navigate = useNavigate();
  const [featuredIndex, setFeaturedIndex] = createSignal(0);
  // Staggered rail reveal: commercial TVs choke when ~100 Card textures land
  // in a single frame (WebGL asset burst). Mount rails in waves so image
  // decoding is distributed and first paint is not blocked.
  const [railTick, setRailTick] = createSignal(0);

  let hero: ElementNode | undefined;
  let railsColumn: ElementNode | undefined;

  // Single aggregated request — /catalog/home returns featured + 4 rails in
  // one round-trip. Cuts cold-start latency vs. the 5 parallel fetches.
  const [home] = createResource(() => api.getHome(20));
  // `home.latest` keeps the last resolved payload visible while a refetch is
  // in flight. Without it, re-entering Home with a cold /catalog/home (which
  // sometimes takes 1s+ from the VPS) leaves Hero + rails blank = user sees
  // a dark screen for ~1.5s. Falling back to latest means the prior cards
  // stay on screen until the fresh data lands and swaps in.
  const homeData = () => home() ?? home.latest;
  const featured = () => {
    const f = homeData()?.featured;
    return f ? [f] : [];
  };
  const trendingMovies = () => homeData()?.trending_movies;
  const recentMovies = () => homeData()?.recent_movies;
  const topRatedMovies = () => homeData()?.top_rated_movies;
  const trendingSeries = () => homeData()?.trending_series;
  // Recommendations stay on a separate call — they're user-specific and
  // expire on a different cadence than the public rails.
  const [recommendedMovies] = createResource(() => api.getRecommendations("movies", 18).catch(() => null));

  // Reset to Hero when the user re-clicks "Início" in the sidebar. Skip the
  // first run (that's just the initial mount).
  let navResetSeen = 0;
  createEffect(() => {
    const t = navResetTick();
    if (navResetSeen === 0) {
      navResetSeen = t;
      return;
    }
    navResetSeen = t;
    hero?.setFocus();
  });

  // Tell the bootstrap splash to fade as soon as we have paintable data.
  // Guard so we only fire once even though the resource re-runs on refresh.
  let splashSignaled = false;
  createEffect(() => {
    if (splashSignaled) return;
    if (!home()) return;
    splashSignaled = true;
    window.dispatchEvent(new Event("streamix:ready"));
  });

  // Register cleanup explicitly; returning from onMount does not dispose the timer.
  onMount(() => {
    const interval = setInterval(() => {
      const items = featured();
      if (items && items.length > 1) {
        setFeaturedIndex(i => (i + 1) % items.length);
      }
    }, 8000);
    // Stagger the remaining rails — Hero + first two rails paint fast, then
    // every ~350ms another rail unlocks. User-initiated scroll down is already
    // fine because Column only asks for focus on the next visible child.
    const timers = [
      setTimeout(() => setRailTick(1), 350),
      setTimeout(() => setRailTick(2), 700),
      setTimeout(() => setRailTick(3), 1050),
      setTimeout(() => setRailTick(4), 1400),
    ];
    onCleanup(() => {
      clearInterval(interval);
      for (const t of timers) clearTimeout(t);
    });
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
    <View width={1700} height={1080} color={theme.background} clipping forwardFocus={0}>
      <Column
        ref={railsColumn}
        width={1700}
        height={1080}
        gap={28}
        scroll="auto"
        forwardFocus={0}
        onDown={() => {
          // Any downward nav reveals all rails at once so scroll has somewhere
          // to go. Without this the stagger keeps later rails unmounted and
          // the Column appears to freeze at the last visible child.
          setRailTick(4);
          return false;
        }}
      >
        <Hero ref={hero} item={currentFeatured()} onPlay={handlePlayFeatured} onInfo={handleInfoFeatured} />
        <Show when={recommendedMovies()?.recommendations?.length}>
          <ContentRow
            title="Para você"
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
                  imageUrl={pickPoster(movie, 240)}
                  subtitle={movieCaption(movie)}
                  item={{ id: movie.id, type: "movie", href: `/movie/${movie.id}` }}
                />
              )}
            </For>
          </ContentRow>
        </Show>

        <Show when={railTick() >= 1 && recentMovies()?.length}>
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
                  imageUrl={pickPoster(movie, 240)}
                  subtitle={movieCaption(movie)}
                  item={{ id: movie.id, type: "movie", href: `/movie/${movie.id}` }}
                />
              )}
            </For>
          </ContentRow>
        </Show>

        <Show when={railTick() >= 2 && topRatedMovies()?.length}>
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
                  imageUrl={pickPoster(movie, 240)}
                  subtitle={movieCaption(movie)}
                  item={{ id: movie.id, type: "movie", href: `/movie/${movie.id}` }}
                />
              )}
            </For>
          </ContentRow>
        </Show>

        <Show when={railTick() >= 3 && trendingSeries()?.length}>
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
                  imageUrl={pickPoster(show, 240)}
                  subtitle={show.year ? String(show.year) : undefined}
                  item={{ id: show.id, type: "series", href: `/series/${show.id}` }}
                />
              )}
            </For>
          </ContentRow>
        </Show>

        <Show when={railTick() >= 4}>
          <ContinueWatchingRow limit={10} />
        </Show>
      </Column>
    </View>
  );
};

export default Home;
