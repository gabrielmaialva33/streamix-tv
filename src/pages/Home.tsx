import { type ElementNode, View } from "@solidtv/solid";
import { Column } from "@solidtv/solid/primitives";
import { createEffect, createResource, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Card, ContentRow, ContinueWatchingRow, Hero } from "@/components";
import api, { type FeaturedItem } from "@/lib/api";
import { ratingCaption, relatedPoster } from "@/lib/contentMeta";
import { pickPoster } from "@/lib/imageUrl";
import { onNavReset } from "@/shared/navReset";
import { theme } from "@/styles";

const Home = () => {
  const navigate = useNavigate();

  let hero: ElementNode | undefined;

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

  // Reset to Hero when the user re-clicks "Início" in the sidebar.
  onNavReset(() => hero?.setFocus());

  // Tell the bootstrap splash to fade as soon as we have paintable data.
  // Guard so we only fire once even though the resource re-runs on refresh.
  let splashSignaled = false;
  createEffect(() => {
    if (splashSignaled) return;
    if (!home()) return;
    splashSignaled = true;
    window.dispatchEvent(new Event("streamix:ready"));
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
        provider: first.provider,
      },
    ];
  };

  const currentFeatured = () => featuredList()[0];

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
      <Column width={1700} height={1080} gap={28} scroll="auto" forwardFocus={0}>
        <Hero ref={hero} item={currentFeatured()} onPlay={handlePlayFeatured} onInfo={handleInfoFeatured} />
        <Show when={recommendedMovies()?.recommendations?.length}>
          <ContentRow
            title="Para você"
            items={recommendedMovies()?.recommendations}
            onSelectedChanged={index => {
              const movie = recommendedMovies()?.recommendations?.[index];
              if (movie) api.prefetchMovie(movie.id);
            }}
            onItemSelected={movie => navigate(`/movie/${movie.id}`)}
            renderItem={movie => (
              <Card
                title={movie().title || movie().name || ""}
                imageUrl={relatedPoster(movie())}
                subtitle={ratingCaption(movie())}
                item={movie()}
              />
            )}
          />
        </Show>

        <Show when={trendingMovies()?.length}>
          <ContentRow
            title="Em alta"
            items={trendingMovies()}
            onSelectedChanged={index => {
              const movie = trendingMovies()?.[index];
              if (movie) api.prefetchMovie(movie.id);
            }}
            onItemSelected={movie => navigate(`/movie/${movie.id}`)}
            renderItem={movie => (
              <Card
                title={movie().title || movie().name || ""}
                imageUrl={pickPoster(movie(), 240)}
                subtitle={ratingCaption(movie())}
                item={movie()}
              />
            )}
          />
        </Show>

        <Show when={recentMovies()?.length}>
          <ContentRow
            title="Chegaram agora"
            items={recentMovies()}
            onSelectedChanged={index => {
              const movie = recentMovies()?.[index];
              if (movie) api.prefetchMovie(movie.id);
            }}
            onItemSelected={movie => navigate(`/movie/${movie.id}`)}
            renderItem={movie => (
              <Card
                title={movie().title || movie().name || ""}
                imageUrl={pickPoster(movie(), 240)}
                subtitle={ratingCaption(movie())}
                item={movie()}
              />
            )}
          />
        </Show>

        <Show when={topRatedMovies()?.length}>
          <ContentRow
            title="Mais elogiados"
            items={topRatedMovies()}
            onSelectedChanged={index => {
              const movie = topRatedMovies()?.[index];
              if (movie) api.prefetchMovie(movie.id);
            }}
            onItemSelected={movie => navigate(`/movie/${movie.id}`)}
            renderItem={movie => (
              <Card
                title={movie().title || movie().name || ""}
                imageUrl={pickPoster(movie(), 240)}
                subtitle={ratingCaption(movie())}
                item={movie()}
              />
            )}
          />
        </Show>

        <Show when={trendingSeries()?.length}>
          <ContentRow
            title="Séries em alta"
            items={trendingSeries()}
            onSelectedChanged={index => {
              const show = trendingSeries()?.[index];
              if (show) api.prefetchSeries(show.id);
            }}
            onItemSelected={show => navigate(`/series/${show.id}`)}
            renderItem={show => (
              <Card
                title={show().title || show().name || ""}
                imageUrl={pickPoster(show(), 240)}
                subtitle={show().year ? String(show().year) : undefined}
                item={show()}
              />
            )}
          />
        </Show>

        <ContinueWatchingRow limit={10} />
      </Column>
    </View>
  );
};

export default Home;
