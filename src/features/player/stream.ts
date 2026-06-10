import api, { type Channel, type Episode, type Movie, type Series, type StreamUrl } from "@/lib/api";
import { createLogger } from "@/shared/logging/logger";

const logger = createLogger("PlayerStream");

export type PlayerType = "movie" | "series" | "channel";

interface StreamSource {
  stream_url?: string;
  browser_stream_url?: string;
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

function pickStreamUrl(source: StreamSource) {
  return source.browser_stream_url || source.stream_url || "";
}

async function resolveFallbackStream(type: PlayerType, id: string) {
  switch (type) {
    case "movie":
      return api.getMovieStream(id);
    case "series":
      return api.getEpisodeStream(id);
    case "channel":
      return api.getChannelStream(id);
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

export async function resolvePlayerSource(type: PlayerType, id: string): Promise<PlayerSource> {
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

  if (playerSource.streamUrl) {
    return playerSource;
  }

  const fallbackSource = await resolveFallbackStream(type, id);
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
