import { Route } from "@solidjs/router";
import { lazy } from "solid-js";
import MainLayout from "./MainLayout";
import RequireAuth from "@/features/auth/RequireAuth";

const HomePage = lazy(() => import("../pages/Home"));
const MoviesPage = lazy(() => import("../pages/Movies"));
const SeriesPage = lazy(() => import("../pages/Series"));
const ChannelsPage = lazy(() => import("../pages/Channels"));
const GuidePage = lazy(() => import("../pages/Guide"));
const FavoritesPage = lazy(() => import("../pages/Favorites"));
const SearchPage = lazy(() => import("../pages/Search"));
const MovieDetailPage = lazy(() => import("../pages/MovieDetail"));
const SeriesDetailPage = lazy(() => import("../pages/SeriesDetail"));
const NotFoundPage = lazy(() => import("../pages/NotFound"));
const PlayerPage = lazy(() => import("../features/player/PlayerPage"));
const LoginPage = lazy(() => import("../features/auth/LoginPage"));

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
          <Route path="/search" component={SearchPage} />
          <Route path="/movie/:id" component={MovieDetailPage} />
          <Route path="/series/:id" component={SeriesDetailPage} />
        </Route>

        <Route path="/player/:type/:id" component={PlayerPage} />
      </Route>

      <Route path="/*all" component={NotFoundPage} />
    </>
  );
}
