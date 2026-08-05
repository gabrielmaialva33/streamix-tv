import api, { type HistoryRecord } from "@/lib/api";
import { pickPoster, proxyImageUrl } from "@/lib/imageUrl";
import { history, type HistoryItem } from "@/lib/storage";
import { createLogger } from "@/shared/logging/logger";

const logger = createLogger("HistorySync");
const HYDRATION_CONCURRENCY = 4;
const REMOTE_HISTORY_LIMIT = 25;

function remoteKey(record: HistoryRecord): string {
  return `${record.content_type}:${String(record.content_id)}`;
}

function localKey(item: HistoryItem): string {
  const type = item.type === "channel" ? "live_channel" : item.type === "series" ? "episode" : "movie";
  return `${type}:${String(item.type === "series" ? (item.episodeId ?? item.id) : item.id)}`;
}

function progressFor(record: HistoryRecord): number {
  if (record.completed) return 100;
  if (!record.duration_seconds || record.duration_seconds <= 0) return 0;
  return Math.min(100, (record.progress_seconds / record.duration_seconds) * 100);
}

function watchedAtFor(record: HistoryRecord, local?: HistoryItem): number {
  const parsed = record.watched_at ? Date.parse(record.watched_at) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : (local?.watchedAt ?? 0);
}

function baseHistoryItem(record: HistoryRecord, local?: HistoryItem): HistoryItem {
  const type =
    record.content_type === "live_channel"
      ? "channel"
      : record.content_type === "episode"
        ? "series"
        : "movie";
  return {
    id: String(record.content_id),
    type,
    title: local?.title ?? (type === "movie" ? "Filme" : type === "series" ? "Episódio" : "Canal"),
    posterUrl: local?.posterUrl,
    progress: progressFor(record),
    currentTime: record.progress_seconds,
    duration: record.duration_seconds ?? local?.duration ?? 0,
    watchedAt: watchedAtFor(record, local),
    seriesId: local?.seriesId,
    episodeId: type === "series" ? String(record.content_id) : undefined,
    seasonNumber: local?.seasonNumber,
    episodeNumber: local?.episodeNumber,
    episodeTitle: local?.episodeTitle,
  };
}

async function hydrateHistoryRecord(record: HistoryRecord, local?: HistoryItem): Promise<HistoryItem> {
  const base = baseHistoryItem(record, local);
  if (local) return base;

  try {
    switch (record.content_type) {
      case "movie": {
        const movie = await api.getMovie(record.content_id);
        return {
          ...base,
          title: movie.title || movie.name || base.title,
          posterUrl: pickPoster(movie, 240) ?? base.posterUrl,
        };
      }
      case "episode": {
        const episode = await api.getEpisode(record.content_id);
        return {
          ...base,
          title: episode.series_name || base.title,
          posterUrl: proxyImageUrl(episode.thumbnail_url || episode.still, 480) ?? base.posterUrl,
          seriesId: episode.series_id ? String(episode.series_id) : base.seriesId,
          episodeId: String(episode.id),
          seasonNumber: episode.season_number,
          episodeNumber: episode.episode_num ?? episode.number,
          episodeTitle: episode.title,
        };
      }
      case "live_channel": {
        const channel = await api.getChannel(record.content_id);
        return {
          ...base,
          title: channel.name || base.title,
          posterUrl: proxyImageUrl(channel.logo_url || channel.icon, 240) ?? base.posterUrl,
        };
      }
    }
  } catch (error) {
    logger.warn("Could not hydrate a remote history item", {
      type: record.content_type,
      id: record.content_id,
      error,
    });
    return base;
  }
}

async function mapWithConcurrency<T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(HYDRATION_CONCURRENCY, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index]);
      }
    }),
  );

  return results;
}

export async function syncHistoryFromRemote(bearer: string): Promise<void> {
  try {
    const response = await api.getHistory({ limit: REMOTE_HISTORY_LIMIT }, bearer);
    const localItems = history.getAll();
    const localByKey = new Map(localItems.map(item => [localKey(item), item]));
    const hydrated = await mapWithConcurrency(response.items, record =>
      hydrateHistoryRecord(record, localByKey.get(remoteKey(record))),
    );
    history.mergeRemote(hydrated);
  } catch (error) {
    logger.warn("Failed to sync remote history", error);
  }
}
