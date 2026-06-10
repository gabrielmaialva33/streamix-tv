// Presentation helpers shared by catalog/detail pages. Keep these free of
// component state so any page can use them without coupling.

import type { RecommendationItem, Season, SimilarContentItem } from "./api";
import { pickPoster } from "./imageUrl";

/** "2021 • 7.5 IMDb" — joins year and rating when present. */
export function ratingCaption(item: { year?: number | null; rating?: number | null }): string {
  return [item.year ? String(item.year) : null, item.rating ? `${item.rating.toFixed(1)} IMDb` : null]
    .filter(Boolean)
    .join(" • ");
}

export type RelatedItem = SimilarContentItem | RecommendationItem;

/** Related/recommendation payloads carry raw poster/backdrop fields; resolve a 240px poster. */
export function relatedPoster(item: RelatedItem): string | undefined {
  const raw = item.poster || (Array.isArray(item.backdrop) ? item.backdrop[0] : item.backdrop) || undefined;
  return pickPoster({ poster: raw }, 240);
}

/** Chunk a flat list into fixed-size rows for grid rendering. */
export function chunkIntoRows<T>(items: readonly T[] | undefined, perRow: number): T[][] {
  const source = items ?? [];
  const rows: T[][] = [];
  for (let i = 0; i < source.length; i += perRow) {
    rows.push(source.slice(i, i + perRow));
  }
  return rows;
}

export function seasonLabel(season: Season, index: number): string {
  return `Temporada ${season.season_number ?? index + 1}`;
}
