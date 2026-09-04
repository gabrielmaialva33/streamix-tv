// Presentation helpers shared by catalog/detail pages. Keep these free of
// component state so any page can use them without coupling.

import type { Episode, RecommendationItem, Season, SimilarContentItem } from "./api";
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

/** "1:02:34" / "32:14" — playback position for resume labels. */
export function formatPlaybackTime(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) {
    return "0:00";
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

/** Resumable progress entry: started for real and not effectively finished. */
export function isResumable(saved: { duration: number; currentTime: number; progress: number }): boolean {
  return saved.duration > 0 && saved.currentTime >= 30 && saved.progress < 95;
}

/**
 * The name to show for an episode.
 *
 * TMDB leads for the same reason declared language leads over a track title:
 * it names the episode by its number inside a season it curates, while `title`
 * is whatever a provider's filename happened to render — often nothing, often
 * just the series name and episode number repeated. Both are absent for most of
 * the catalog, so the numbered fallback is the common case, not an edge one.
 */
export function episodeLabel(
  episode: Pick<Episode, "tmdb_title" | "title" | "episode_num" | "number">,
): string {
  const curated = (episode.tmdb_title ?? "").trim();
  if (curated) return curated;
  const provided = (episode.title ?? "").trim();
  if (provided) return provided;
  const position = episode.episode_num ?? episode.number;
  return position === undefined || position === null ? "Episódio" : `Episódio ${position}`;
}
