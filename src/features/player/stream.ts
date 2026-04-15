import api, { type Channel, type Episode, type Movie, type StreamUrl } from "../../lib/api";
import { createLogger } from "../../shared/logging/logger";

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
  };
}

function toChannelSource(channel: Channel) {
  return {
    title: channel.name || "Channel",
    posterUrl: channel.logo_url || channel.icon || undefined,
    streamUrl: pickStreamUrl(channel),
  };
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
