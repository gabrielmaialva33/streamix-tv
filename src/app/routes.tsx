import { Route } from "@solidjs/router";
import { lazy } from "solid-js";
import MainLayout from "./MainLayout";

const HomePage = lazy(() => import("../pages/Home"));
const MoviesPage = lazy(() => import("../pages/Movies"));
const SeriesPage = lazy(() => import("../pages/Series"));
const ChannelsPage = lazy(() => import("../pages/Channels"));
const GuidePage = lazy(() => import("../pages/Guide"));
const FavoritesPage = lazy(() => import("../pages/Favorites"));
const SearchPage = lazy(() => import("../pages/Search"));
const SeriesDetailPage = lazy(() => import("../pages/SeriesDetail"));
const NotFoundPage = lazy(() => import("../pages/NotFound"));
const PlayerPage = lazy(() => import("../features/player/PlayerPage"));

export default function AppRoutes() {
  return (
    <>
      <Route path="" component={MainLayout}>
        <Route path="/" component={HomePage} />
        <Route path="/movies" component={MoviesPage} />
        <Route path="/series" component={SeriesPage} />
        <Route path="/channels" component={ChannelsPage} />
        <Route path="/guide" component={GuidePage} />
        <Route path="/favorites" component={FavoritesPage} />
        <Route path="/search" component={SearchPage} />
        <Route path="/movie/:id" component={PlayerPage} />
        <Route path="/series/:id" component={SeriesDetailPage} />
      </Route>

      <Route path="/player/:type/:id" component={PlayerPage} />
      <Route path="/*all" component={NotFoundPage} />
    </>
  );
}
