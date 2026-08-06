export const pageLoaders = {
  home: () => import("@/pages/Home"),
  movies: () => import("@/pages/Movies"),
  series: () => import("@/pages/Series"),
  channels: () => import("@/pages/Channels"),
  guide: () => import("@/pages/Guide"),
  favorites: () => import("@/pages/Favorites"),
  profile: () => import("@/pages/Profile"),
  search: () => import("@/pages/Search"),
  movieDetail: () => import("@/pages/MovieDetail"),
  seriesDetail: () => import("@/pages/SeriesDetail"),
  seriesEpisodes: () => import("@/pages/SeriesEpisodes"),
  notFound: () => import("@/pages/NotFound"),
  player: () => import("@/features/player/PlayerPage"),
  login: () => import("@/features/auth/LoginPage"),
} as const;

/** Warm a navigation chunk while the user is still focused on the sidebar. */
export function preloadNavigationPage(path: string): Promise<unknown> {
  switch (path) {
    case "/":
      return pageLoaders.home();
    case "/movies":
      return pageLoaders.movies();
    case "/series":
      return pageLoaders.series();
    case "/channels":
      return pageLoaders.channels();
    case "/guide":
      return pageLoaders.guide();
    case "/favorites":
      return pageLoaders.favorites();
    case "/profile":
      return pageLoaders.profile();
    case "/search":
      return pageLoaders.search();
    default:
      return Promise.resolve();
  }
}
