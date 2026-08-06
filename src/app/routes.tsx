import { Route } from "@solidjs/router";
import { lazy } from "solid-js";
import MainLayout from "./MainLayout";
import { pageLoaders } from "./pageLoaders";
import RequireAuth from "@/features/auth/RequireAuth";

const HomePage = lazy(pageLoaders.home);
const MoviesPage = lazy(pageLoaders.movies);
const SeriesPage = lazy(pageLoaders.series);
const ChannelsPage = lazy(pageLoaders.channels);
const GuidePage = lazy(pageLoaders.guide);
const FavoritesPage = lazy(pageLoaders.favorites);
const ProfilePage = lazy(pageLoaders.profile);
const SearchPage = lazy(pageLoaders.search);
const MovieDetailPage = lazy(pageLoaders.movieDetail);
const SeriesDetailPage = lazy(pageLoaders.seriesDetail);
const SeriesEpisodesPage = lazy(pageLoaders.seriesEpisodes);
const NotFoundPage = lazy(pageLoaders.notFound);
const PlayerPage = lazy(pageLoaders.player);
const LoginPage = lazy(pageLoaders.login);

export default function AppRoutes() {
  return (
    <>
      <Route path="/login" component={LoginPage} />

      <Route path="" component={RequireAuth}>
        <Route path="" component={MainLayout}>
          <Route path="/" component={HomePage} />
          <Route path="/movies" component={MoviesPage} />
          <Route path="/series" component={SeriesPage} />
          <Route path="/channels" component={ChannelsPage} />
          <Route path="/guide" component={GuidePage} />
          <Route path="/favorites" component={FavoritesPage} />
          <Route path="/profile" component={ProfilePage} />
          <Route path="/search" component={SearchPage} />
          <Route path="/movie/:id" component={MovieDetailPage} />
          <Route path="/series/:id" component={SeriesDetailPage} />
          <Route path="/series/:id/episodes" component={SeriesEpisodesPage} />
        </Route>

        <Route path="/player/:type/:id" component={PlayerPage} />
      </Route>

      <Route path="/*all" component={NotFoundPage} />
    </>
  );
}
