import api, { type Channel, type Episode, type Movie, type Series, type StreamUrl } from "@/lib/api";
import { isTizenRuntime } from "@/platform/runtime";
import { createLogger } from "@/shared/logging/logger";

const logger = createLogger("PlayerStream");

export type PlayerType = "movie" | "series" | "channel";

export interface StreamSource {
  stream_url?: string;
  browser_stream_url?: string;
  url?: string;
}

export type StreamUrlPreference = "browser" | "direct";

export interface ResolvePlayerSourceOptions {
  /** Always call the stream endpoint and bypass its client-side URL cache. */
  refreshStream?: boolean;
}

export interface PlayerSource {
  title: string;
  posterUrl?: string;
  streamUrl: string;
  /** Present when the source is a series episode. */
  episode?: {
    seasonNumber?: number;
    episodeNumber?: number;
    title?: string;
  };
}

export function pickStreamUrl(
  source: StreamSource,
  preference: StreamUrlPreference = isTizenRuntime() ? "direct" : "browser",
) {
  if (preference === "direct") {
    return source.stream_url || source.browser_stream_url || source.url || "";
  }
  return source.browser_stream_url || source.stream_url || source.url || "";
}

async function resolveFallbackStream(type: PlayerType, id: string, fresh: boolean) {
  switch (type) {
    case "movie":
      return api.getMovieStream(id, { fresh });
    case "series":
      return api.getEpisodeStream(id, { fresh });
    case "channel":
      return api.getChannelStream(id, { fresh });
  }
}

function toMovieSource(movie: Movie) {
  return {
    title: movie.title || movie.name || "Movie",
    posterUrl: movie.poster_url || movie.poster || undefined,
    streamUrl: pickStreamUrl(movie),
  };
}

function toEpisodeSource(episode: Episode) {
  return {
    title: `S${episode.season_number}E${episode.episode_num} - ${episode.title}`,
    posterUrl: episode.thumbnail_url,
    streamUrl: "",
    episode: {
      seasonNumber: episode.season_number,
      episodeNumber: episode.episode_num ?? episode.number,
      title: episode.title,
    },
  };
}

function toChannelSource(channel: Channel) {
  return {
    title: channel.name || "Channel",
    posterUrl: channel.logo_url || channel.icon || undefined,
    streamUrl: pickStreamUrl(channel),
  };
}

/**
 * Next episode in playback order: walks seasons/episodes as returned by the
 * API and returns the entry right after `episodeId`, crossing season
 * boundaries. Null when the id is unknown or it's the very last episode.
 */
export function findNextEpisode(series: Series, episodeId: string | number): Episode | null {
  const ordered = (series.seasons ?? []).flatMap(season => season.episodes ?? []);
  const index = ordered.findIndex(episode => String(episode.id) === String(episodeId));
  if (index < 0) {
    return null;
  }
  return ordered[index + 1] ?? null;
}

export async function resolvePlayerSource(
  type: PlayerType,
  id: string,
  options: ResolvePlayerSourceOptions = {},
): Promise<PlayerSource> {
  let playerSource: PlayerSource;

  switch (type) {
    case "movie":
      playerSource = toMovieSource(await api.getMovie(id));
      break;
    case "series":
      playerSource = toEpisodeSource(await api.getEpisode(id));
      break;
    case "channel":
      playerSource = toChannelSource(await api.getChannel(id));
      break;
  }

  if (playerSource.streamUrl && !options.refreshStream) {
    return playerSource;
  }

  const fallbackSource = await resolveFallbackStream(type, id, options.refreshStream === true);
  const fallbackUrl = pickStreamUrl(fallbackSource as StreamUrl);
  if (!fallbackUrl) {
    throw new Error("No stream URL is available for playback");
  }

  logger.debug("Using stream endpoint fallback", { type, id });

  return {
    ...playerSource,
    streamUrl: fallbackUrl,
  };
}
