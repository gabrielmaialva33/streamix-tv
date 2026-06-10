import api, { type Series as SeriesType } from "@/lib/api";
import { ratingCaption } from "@/lib/contentMeta";
import CatalogGridPage from "./shared/CatalogGridPage";

function seriesCaption(show: SeriesType) {
  const base = ratingCaption(show);
  if (!show.season_count) return base;
  return [base, `${show.season_count} temp.`].filter(Boolean).join(" • ");
}

const Series = () => (
  <CatalogGridPage<SeriesType>
    title="Séries"
    subtitle="Entre no universo da série antes de escolher temporada e episódio."
    allLabel="Todas"
    emptyMessage="Nenhuma série encontrada"
    categoryType="series"
    itemType="series"
    fetchPage={params => api.getSeries(params)}
    caption={seriesCaption}
    detailHref={show => `/series/${show.id}`}
  />
);

export default Series;
