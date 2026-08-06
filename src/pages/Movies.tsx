import api, { type Movie } from "@/lib/api";
import { ratingCaption } from "@/lib/contentMeta";
import CatalogGridPage from "./shared/CatalogGridPage";

const Movies = () => (
  <CatalogGridPage<Movie>
    title="Filmes"
    subtitle="Descubra títulos com mais contexto antes de dar play."
    emptyMessage="Nenhum filme encontrado"
    itemType="movie"
    fetchPage={params => api.getMovies(params)}
    caption={ratingCaption}
    detailHref={movie => `/movie/${movie.id}`}
  />
);

export default Movies;
