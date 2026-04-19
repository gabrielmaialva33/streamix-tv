/**
 * Streamix API Client — TypeScript / SolidJS
 *
 * Source: https://streamix.mahina.cloud/api/v1
 *   /catalog  -> movies, series, channels, search, categories
 *   /epg      -> electronic program guide
 *   /history  -> watch history (Bearer handled by the controller)
 */

import { createLogger } from "@/shared/logging/logger";
import { authSession } from "./storage";

const logger = createLogger("API");

const CATALOG_URL = import.meta.env.VITE_API_URL || "https://streamix.mahina.cloud/api/v1/catalog";
const EPG_URL = import.meta.env.VITE_EPG_URL || "https://streamix.mahina.cloud/api/v1/epg";
const HISTORY_URL = import.meta.env.VITE_HISTORY_URL || "https://streamix.mahina.cloud/api/v1/history";
const AUTH_URL = import.meta.env.VITE_AUTH_URL || "https://streamix.mahina.cloud/api/v1/auth";
const FAVORITES_URL = import.meta.env.VITE_FAVORITES_URL || "https://streamix.mahina.cloud/api/v1/favorites";
const SEARCH_URL = import.meta.env.VITE_SEARCH_URL || "https://streamix.mahina.cloud/api/v1/search";
const RECOMMENDATIONS_URL =
  import.meta.env.VITE_RECOMMENDATIONS_URL || "https://streamix.mahina.cloud/api/v1/recommendations";
const TELEMETRY_URL = import.meta.env.VITE_TELEMETRY_URL || "https://streamix.mahina.cloud/api/v1/telemetry";
const API_KEY = import.meta.env.VITE_API_KEY || "";

// ============ Cache + dedup ============

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 min
const SHORT_TTL = 30 * 1000; // 30s for volatile data such as EPG now and stream URLs.

function buildQuery(params: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

interface RequestOpts {
  ttl?: number;
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  noCache?: boolean;
  bearer?: string | null;
  auth?: boolean;
}

/**
 * Error shapes observed from the backend:
 *   { error: { code, message } }                         // validation
 *   { error: "Too many requests", message, retry_after } // rate limit
 *   { error: "Authentication required" }                 // auth gate
 *   { error: "string", reason: "string" }                // recommendations/search
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAfter?: number;
  readonly payload?: unknown;

  constructor(status: number, message: string, code?: string, payload?: unknown, retryAfter?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
    this.retryAfter = retryAfter;
  }

  isUnauthorized() {
    return this.status === 401 || this.code === "unauthorized" || this.code === "invalid_credentials";
  }
}

function parseErrorPayload(status: number, statusText: string, payload: unknown): ApiError {
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    const err = p.error;

    if (err && typeof err === "object") {
      const nested = err as Record<string, unknown>;
      return new ApiError(
        status,
        (nested.message as string) || `HTTP ${status}: ${statusText}`,
        nested.code as string | undefined,
        payload,
      );
    }

    if (typeof err === "string") {
      const retry = typeof p.retry_after === "number" ? (p.retry_after as number) : undefined;
      const detail = (p.message as string) || (p.reason as string) || err;
      return new ApiError(status, detail, err, payload, retry);
    }
  }

  return new ApiError(status, `HTTP ${status}: ${statusText}`, undefined, payload);
}

async function request<T>(url: string, opts: RequestOpts = {}): Promise<T> {
  const { ttl = DEFAULT_TTL, method = "GET", body, noCache = false, bearer, auth = true } = opts;
  const cacheKey = `${method} ${url}`;

  if (!noCache && method === "GET") {
    const cached = cache.get(cacheKey) as CacheEntry<T> | undefined;
    if (cached && Date.now() - cached.timestamp < ttl) return cached.data;

    const existing = inFlight.get(cacheKey) as Promise<T> | undefined;
    if (existing) return existing;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) headers["X-API-Key"] = API_KEY;
  const sessionToken = auth ? (bearer === undefined ? authSession.getToken() : bearer) : null;
  if (sessionToken) headers["Authorization"] = `Bearer ${sessionToken}`;

  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  const promise = fetch(url, init)
    .then(async r => {
      const contentType = r.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");

      if (!r.ok) {
        const payload = isJson ? await r.json().catch(() => null) : null;
        throw parseErrorPayload(r.status, r.statusText, payload);
      }

      if (r.status === 204 || !isJson) {
        return undefined as T;
      }

      return r.json() as Promise<T>;
    })
    .then(data => {
      if (!noCache && method === "GET") cache.set(cacheKey, { data, timestamp: Date.now() });
      inFlight.delete(cacheKey);
      return data;
    })
    .catch(err => {
      inFlight.delete(cacheKey);
      // Expected auth/rate-limit/not-found failures are demoted to warn so
      // pages that handle them gracefully don't pollute the console.
      const expected =
        err instanceof ApiError && (err.isUnauthorized() || err.status === 429 || err.status === 404);
      if (expected) logger.warn(`${method} ${url}`, err.message);
      else logger.error(`${method} ${url}`, err);
      throw err;
    });

  if (!noCache && method === "GET") inFlight.set(cacheKey, promise);
  return promise;
}

// ============ Types matching the current API ============

export type ContentType = "movie" | "series" | "channel";

export interface FeaturedItem {
  id: number | string;
  type: ContentType;
  title: string;
  name?: string;
  plot?: string;
  description?: string;
  poster?: string;
  poster_url?: string;
  poster_w240?: string | null;
  poster_w480?: string | null;
  poster_w720?: string | null;
  backdrop?: string[];
  backdrop_url?: string;
  backdrop_w720?: string | null;
  backdrop_w1280?: string | null;
  year?: number | null;
  rating?: number | null;
  genre?: string | null;
}

// Backend stores VOD movies under type "vod"; the query param accepts the
// friendly alias "movie" and maps internally. We reflect what the server returns.
export type CategoryKind = "vod" | "series" | "live";
export type CategoryFilter = "movie" | "series" | "live";

export interface Category {
  id: number;
  name: string;
  type: CategoryKind;
}

export interface Movie {
  id: number;
  name: string;
  title: string | null;
  year: number | null;
  duration: string | null; // Example: "1h 44min"
  genre: string | null;
  rating: number | null;
  poster: string | null;
  poster_url?: string; // normalized alias for the UI
  poster_w240?: string | null;
  poster_w480?: string | null;
  poster_w720?: string | null;
  // Full detail payload.
  cast?: string | null;
  plot?: string | null;
  director?: string | null;
  stream_url?: string;
  browser_stream_url?: string;
  content_rating?: string | null;
  tagline?: string | null;
  youtube_trailer?: string | null;
  backdrop?: string[];
  backdrop_url?: string;
  backdrop_w720?: string | null;
  backdrop_w1280?: string | null;
}

export interface Series {
  id: number;
  name: string;
  title: string | null;
  year: number | null;
  plot: string | null;
  tagline?: string | null;
  genre: string | null;
  director: string | null;
  cast?: string | null;
  rating: number | null;
  episode_count: number;
  season_count: number;
  seasons: Season[];
  backdrop: string[];
  backdrop_url?: string;
  backdrop_w720?: string | null;
  backdrop_w1280?: string | null;
  poster: string | null;
  poster_url?: string;
  poster_w240?: string | null;
  poster_w480?: string | null;
  poster_w720?: string | null;
}

export interface Season {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
  episodes: Episode[];
}

export interface Episode {
  id: number;
  title: string;
  duration: string | null;
  plot: string | null;
  air_date: string | null;
  episode_num: number;
  still: string | null;
  // normalized alias for the UI
  thumbnail_url?: string;
  description?: string;
  number?: number;
  season_number?: number;
}

export interface Channel {
  id: number;
  name: string;
  icon: string | null;
  logo_url?: string; // alias
  stream_url?: string;
  browser_stream_url?: string;
  group?: string;
  epg_id?: string;
}

export interface StreamUrl {
  stream_url: string;
  browser_stream_url?: string;
  url?: string;
  type?: "hls" | "dash" | "mp4";
}

export interface SearchResults {
  movies: Movie[];
  series: Series[];
  channels: Channel[];
}

export interface SimilarContentItem {
  id: number;
  name?: string;
  title?: string | null;
  year?: number | null;
  rating?: number | null;
  genre?: string | null;
  poster?: string | null;
  backdrop?: string[] | string | null;
  plot?: string | null;
  score?: number | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

// EPG — listings from /epg/programs
export interface EpgProgram {
  id: string | number;
  title: string;
  description: string | null;
  start: string; // ISO datetime
  end: string;
  category: string | null;
}

// EPG — currently-airing entry from /epg/now (no id, adds progress fraction).
export interface EpgCurrentProgram {
  title: string;
  description: string | null;
  start: string;
  end: string;
  category: string | null;
  progress: number; // 0.0..1.0
}

// History (backend /history)
export interface HistoryRecord {
  id: string | number;
  content_type: "movie" | "episode" | "live_channel";
  content_id: number;
  progress_seconds: number;
  duration_seconds: number;
  completed: boolean;
  watched_at?: string;
}

export type FavoriteKind = "movie" | "series" | "live_channel";

// Minimal shape returned by POST /favorites (no enriched fields).
export interface FavoriteBase {
  content_type: FavoriteKind;
  content_id: number;
}

// Enriched shape returned by GET /favorites (joined with content metadata).
export interface FavoriteRecord extends FavoriteBase {
  content_name?: string;
  content_icon?: string;
  created_at?: string;
}

export interface FavoriteSyncOp {
  type: FavoriteKind;
  content_id: string | number;
  action: "add" | "remove";
  at?: string;
}

export interface AuthUser {
  id: number;
  email: string;
  name?: string | null;
  role: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

// ----- Recommendations / semantic search -----
export interface RecommendationItem {
  id: number;
  name?: string;
  title?: string | null;
  year?: number | null;
  rating?: number | null;
  genre?: string | null;
  poster?: string | null;
  backdrop?: string[] | string | null;
  plot?: string | null;
  score?: number | null;
}

export type RecommendationCollection = "movies" | "series";

export interface RecommendationsResponse {
  recommendations: RecommendationItem[];
  type: string;
  personalized: boolean;
}

export interface SimilarRecommendationsResponse {
  similar: RecommendationItem[];
  source_id: number;
  type: string;
}

export interface SearchStatus {
  available: boolean;
  stats: Record<string, { status: string; vectors_count: number }>;
}

export interface SearchInfo {
  available: boolean;
  embeddings: {
    dimensions: number;
    provider: string;
    fallback_available: boolean;
    gemini_enabled: boolean;
    nvidia_enabled: boolean;
  };
  qdrant_enabled: boolean;
}

// ----- Telemetry -----
export interface PlaybackTelemetryEvent {
  content_type: "movie" | "episode" | "live_channel";
  content_id: string | number;
  event: "start" | "progress" | "pause" | "resume" | "complete" | "error";
  position_seconds?: number;
  duration_seconds?: number;
  bitrate?: number;
  error_code?: string;
  error_message?: string;
  at?: string;
}

// ============ Normalization helpers ============

const normMovie = (m: Movie): Movie => ({
  ...m,
  poster_url: m.poster ?? m.poster_url ?? undefined,
  backdrop_url: m.backdrop?.[0] ?? m.backdrop_url ?? undefined,
});

const normSeries = (s: Series): Series => ({
  ...s,
  poster_url: s.poster ?? s.poster_url ?? undefined,
  backdrop_url: s.backdrop?.[0] ?? s.backdrop_url ?? undefined,
});

const normChannel = (c: Channel): Channel => ({
  ...c,
  logo_url: c.icon ?? c.logo_url ?? undefined,
});

const normEpisode = (e: Episode, seasonNumber?: number): Episode => ({
  ...e,
  thumbnail_url: e.still ?? e.thumbnail_url ?? undefined,
  description: e.plot ?? e.description ?? undefined,
  number: e.episode_num ?? e.number,
  season_number: seasonNumber ?? e.season_number,
});

const normSimilarItem = (item: SimilarContentItem): SimilarContentItem => ({
  ...item,
  poster: item.poster ?? null,
  backdrop: Array.isArray(item.backdrop) ? item.backdrop : item.backdrop ? [item.backdrop] : [],
});

/** Convert "1h 44min" / "44min" / "59min" to seconds. Returns 0 on failure. */
export function parseDuration(s: string | null | undefined): number {
  if (!s) return 0;
  const h = /(\d+)\s*h/.exec(s);
  const m = /(\d+)\s*min/.exec(s);
  return (h ? parseInt(h[1], 10) * 3600 : 0) + (m ? parseInt(m[1], 10) * 60 : 0);
}

// ============ API ============

interface FeaturedResponse {
  featured: FeaturedItem | null;
  stats: { movies_count: number; series_count: number; channels_count: number };
}

interface MoviesListResponse {
  total: number;
  movies: Movie[];
  has_more: boolean;
}

interface SeriesListResponse {
  total: number;
  series: Series[];
  has_more: boolean;
}

interface ChannelsListResponse {
  total: number;
  channels: Channel[];
  has_more: boolean;
}

interface MovieListParams {
  limit?: number;
  offset?: number;
  category_id?: string | number;
  search?: string;
  sort?: "rating_desc" | "created_desc" | "year_desc" | "name_asc";
}

export const api = {
  // ----- Featured / stats -----
  getFeatured: async (): Promise<FeaturedItem[]> => {
    const r = await request<FeaturedResponse>(`${CATALOG_URL}/featured`, { ttl: SHORT_TTL });
    if (r.featured) {
      const f = r.featured;
      return [
        {
          ...f,
          description: f.plot || f.description,
          backdrop_url: f.backdrop?.[0] || f.backdrop_url,
          poster_url: f.poster || f.poster_url,
        },
      ];
    }
    return [];
  },

  getStats: async () => {
    const r = await request<FeaturedResponse>(`${CATALOG_URL}/featured`, { ttl: SHORT_TTL });
    return r.stats;
  },

  // ----- Categories -----
  getCategories: (type?: CategoryFilter) =>
    request<Category[]>(`${CATALOG_URL}/categories${buildQuery({ type })}`),

  // ----- Movies -----
  getMovies: async (params: MovieListParams = {}): Promise<PaginatedResponse<Movie>> => {
    const r = await request<MoviesListResponse>(
      `${CATALOG_URL}/movies${buildQuery(params as Record<string, unknown>)}`,
    );
    return {
      data: (r.movies || []).map(normMovie),
      total: r.total ?? 0,
      offset: params.offset ?? 0,
      limit: params.limit ?? 20,
      has_more: r.has_more ?? false,
    };
  },

  getMovie: async (id: string | number): Promise<Movie> => {
    const m = await request<Movie>(`${CATALOG_URL}/movies/${id}`);
    return normMovie(m);
  },

  getMovieStream: (id: string | number) =>
    request<StreamUrl>(`${CATALOG_URL}/movies/${id}/stream`, { ttl: SHORT_TTL }),

  // ----- Series -----
  getSeries: async (params: MovieListParams = {}): Promise<PaginatedResponse<Series>> => {
    try {
      const r = await request<SeriesListResponse>(
        `${CATALOG_URL}/series${buildQuery(params as Record<string, unknown>)}`,
      );
      return {
        data: (r.series || []).map(normSeries),
        total: r.total ?? 0,
        offset: params.offset ?? 0,
        limit: params.limit ?? 20,
        has_more: r.has_more ?? false,
      };
    } catch (e) {
      logger.error("getSeries failed", { params, error: e });
      return { data: [], total: 0, offset: params.offset ?? 0, limit: params.limit ?? 20, has_more: false };
    }
  },

  getSeriesDetail: async (id: string | number): Promise<Series> => {
    const s = await request<Series>(`${CATALOG_URL}/series/${id}`);
    const seasons = (s.seasons || []).map(season => ({
      ...season,
      episodes: (season.episodes || []).map(ep => normEpisode(ep, season.season_number)),
    }));
    return normSeries({ ...s, seasons });
  },

  getEpisode: async (id: string | number): Promise<Episode> => {
    const e = await request<Episode>(`${CATALOG_URL}/episodes/${id}`);
    return normEpisode(e);
  },

  getEpisodeStream: (id: string | number) =>
    request<StreamUrl>(`${CATALOG_URL}/episodes/${id}/stream`, { ttl: SHORT_TTL }),

  // ----- Channels -----
  getChannels: async (params: MovieListParams = {}): Promise<PaginatedResponse<Channel>> => {
    const r = await request<ChannelsListResponse>(
      `${CATALOG_URL}/channels${buildQuery(params as Record<string, unknown>)}`,
    );
    return {
      data: (r.channels || []).map(normChannel),
      total: r.total ?? 0,
      offset: params.offset ?? 0,
      limit: params.limit ?? 20,
      has_more: r.has_more ?? false,
    };
  },

  getChannel: async (id: string | number): Promise<Channel> => {
    const c = await request<Channel>(`${CATALOG_URL}/channels/${id}`);
    return normChannel(c);
  },

  getChannelStream: (id: string | number) =>
    request<StreamUrl>(`${CATALOG_URL}/channels/${id}/stream`, { ttl: SHORT_TTL }),

  // ----- Search -----
  search: async (query: string): Promise<SearchResults> => {
    const r = await request<SearchResults>(`${CATALOG_URL}/search${buildQuery({ q: query })}`, {
      ttl: SHORT_TTL,
    });
    return {
      movies: (r.movies || []).map(normMovie),
      series: (r.series || []).map(normSeries),
      channels: (r.channels || []).map(normChannel),
    };
  },

  getSimilarContent: async (
    collection: "movies" | "series",
    id: string | number,
    limit = 12,
  ): Promise<SimilarContentItem[]> => {
    const r = await request<{ items: SimilarContentItem[] }>(
      `${SEARCH_URL}/similar/${collection}/${id}${buildQuery({ limit })}`,
      { ttl: DEFAULT_TTL },
    );
    return (r.items || []).map(normSimilarItem);
  },

  // ----- Home rails -----
  // One-shot aggregator — Home fires 5 rails in parallel today, this endpoint
  // returns them all in a single request (~124ms on prod). Falls back to the
  // individual endpoints if the server is older.
  getHome: (limit = 20) =>
    request<{
      featured: FeaturedItem | null;
      trending_movies: Movie[];
      recent_movies: Movie[];
      top_rated_movies: Movie[];
      trending_series: Series[];
    }>(`${CATALOG_URL}/home${buildQuery({ limit })}`, { ttl: SHORT_TTL }),

  // Cascading fallback: dedicated endpoint -> sorted listing -> unsorted listing.
  getTrending: async (type: "movie" | "series" = "movie", limit = 20): Promise<Movie[] | Series[]> => {
    try {
      const r = await request<{ type: string; items: Movie[] | Series[] }>(
        `${CATALOG_URL}/trending${buildQuery({ type, limit })}`,
      );
      return type === "series" ? (r.items as Series[]).map(normSeries) : (r.items as Movie[]).map(normMovie);
    } catch {
      if (type === "series") {
        const withSort = (await api.getSeries({ limit, sort: "rating_desc" })).data;
        if (withSort.length) return withSort;
        return (await api.getSeries({ limit })).data;
      }
      return (await api.getMovies({ limit, sort: "rating_desc" })).data;
    }
  },

  getRecent: async (type: "movie" | "series" = "movie", limit = 20): Promise<Movie[] | Series[]> => {
    try {
      const r = await request<{ type: string; items: Movie[] | Series[] }>(
        `${CATALOG_URL}/recent${buildQuery({ type, limit })}`,
      );
      return type === "series" ? (r.items as Series[]).map(normSeries) : (r.items as Movie[]).map(normMovie);
    } catch {
      if (type === "series") {
        const withSort = (await api.getSeries({ limit, sort: "created_desc" })).data;
        if (withSort.length) return withSort;
        return (await api.getSeries({ limit })).data;
      }
      return (await api.getMovies({ limit, sort: "created_desc" })).data;
    }
  },

  getTopRated: async (type: "movie" | "series" = "movie", limit = 20): Promise<Movie[] | Series[]> => {
    try {
      const r = await request<{ type: string; items: Movie[] | Series[] }>(
        `${CATALOG_URL}/top-rated${buildQuery({ type, limit })}`,
      );
      return type === "series" ? (r.items as Series[]).map(normSeries) : (r.items as Movie[]).map(normMovie);
    } catch {
      if (type === "series") {
        const withSort = (await api.getSeries({ limit, sort: "rating_desc" })).data;
        if (withSort.length) return withSort;
        return (await api.getSeries({ limit })).data;
      }
      return (await api.getMovies({ limit, sort: "rating_desc" })).data;
    }
  },

  // ----- EPG -----
  /**
   * Current EPG data. A channel value can be null if no program is available.
   */
  getEpgNow: async (
    channelIds: Array<number | string>,
  ): Promise<Record<string, EpgCurrentProgram | null>> => {
    if (channelIds.length === 0) return {};
    type NowResp = { now: Record<string, EpgCurrentProgram | null> };
    const r = await request<NowResp>(`${EPG_URL}/now${buildQuery({ channel_ids: channelIds.join(",") })}`, {
      ttl: SHORT_TTL,
    });
    return r.now || {};
  },

  /**
   * EPG grid for the next N hours, default 6 and max 12.
   */
  getEpgPrograms: async (
    channelIds: Array<number | string>,
    hours = 6,
  ): Promise<Record<string, EpgProgram[]>> => {
    if (channelIds.length === 0) return {};
    const r = await request<{ programs: Record<string, EpgProgram[]>; fetched_until?: string }>(
      `${EPG_URL}/programs${buildQuery({ channel_ids: channelIds.join(","), hours })}`,
      { ttl: 60 * 1000 },
    );
    return r.programs || {};
  },

  // ----- History (Bearer auth) -----
  getHistory: (bearer?: string) =>
    request<{ items: HistoryRecord[] }>(`${HISTORY_URL}`, { ttl: SHORT_TTL, bearer }),

  upsertHistory: (
    record: {
      type: "movie" | "episode" | "live_channel";
      content_id: string | number;
      progress_seconds: number;
      duration_seconds?: number;
      completed?: boolean;
    },
    bearer?: string,
  ) =>
    request<HistoryRecord>(HISTORY_URL, {
      method: "POST",
      body: record,
      noCache: true,
      bearer,
    }),

  deleteHistory: (id: string | number, bearer?: string) =>
    request<{ ok: boolean }>(`${HISTORY_URL}/${id}`, { method: "DELETE", noCache: true, bearer }),

  // ----- Favorites (Bearer auth) -----
  getFavorites: (type?: FavoriteKind, bearer?: string) =>
    request<{ favorites: FavoriteRecord[] }>(`${FAVORITES_URL}${buildQuery({ type })}`, {
      ttl: SHORT_TTL,
      bearer,
    }),

  addFavorite: (type: FavoriteKind, contentId: string | number, bearer?: string) =>
    request<FavoriteBase>(FAVORITES_URL, {
      method: "POST",
      body: { type, content_id: contentId },
      noCache: true,
      bearer,
    }),

  removeFavorite: (type: FavoriteKind, contentId: string | number, bearer?: string) =>
    request<void>(`${FAVORITES_URL}/${type}/${contentId}`, {
      method: "DELETE",
      noCache: true,
      bearer,
    }),

  toggleFavorite: (type: FavoriteKind, contentId: string | number, bearer?: string) =>
    request<{ status: "added" | "removed" }>(`${FAVORITES_URL}/toggle`, {
      method: "POST",
      body: { type, content_id: contentId },
      noCache: true,
      bearer,
    }),

  syncFavorites: (operations: FavoriteSyncOp[], bearer?: string) =>
    request<{ added: number; removed: number; skipped: number }>(`${FAVORITES_URL}/sync`, {
      method: "POST",
      body: { operations },
      noCache: true,
      bearer,
    }),

  // ----- Auth -----
  register: (payload: { email: string; password: string; name?: string }) =>
    request<AuthResponse>(`${AUTH_URL}/register`, {
      method: "POST",
      body: payload,
      noCache: true,
      auth: false,
    }),

  login: (payload: { email: string; password: string }) =>
    request<AuthResponse>(`${AUTH_URL}/login`, {
      method: "POST",
      body: payload,
      noCache: true,
      auth: false,
    }),

  me: (bearer?: string) =>
    request<{ user: AuthUser }>(`${AUTH_URL}/me`, {
      ttl: SHORT_TTL,
      bearer,
      auth: bearer !== null,
    }),

  logout: (bearer?: string) =>
    request<void>(`${AUTH_URL}/logout`, {
      method: "POST",
      noCache: true,
      bearer,
    }),

  // ----- Personalized recommendations (Bearer auth) -----
  getRecommendations: (type: RecommendationCollection = "movies", limit = 20) =>
    request<RecommendationsResponse>(`${RECOMMENDATIONS_URL}${buildQuery({ type, limit })}`, {
      ttl: SHORT_TTL,
    }),

  getSimilarRecommendations: (id: string | number, type: RecommendationCollection = "movies", limit = 10) =>
    request<SimilarRecommendationsResponse>(
      `${RECOMMENDATIONS_URL}/similar/${id}${buildQuery({ type, limit })}`,
      { ttl: DEFAULT_TTL },
    ),

  getChannelRecommendations: (limit = 10) =>
    request<{ channels: Channel[]; personalized: boolean }>(
      `${RECOMMENDATIONS_URL}/channels${buildQuery({ limit })}`,
      { ttl: SHORT_TTL },
    ),

  getUserInsights: () =>
    request<{ insights: Record<string, unknown> }>(`${RECOMMENDATIONS_URL}/insights`, {
      ttl: SHORT_TTL,
    }),

  refreshRecommendations: () =>
    request<{ status: string; message?: string }>(`${RECOMMENDATIONS_URL}/refresh`, {
      method: "POST",
      noCache: true,
    }),

  // ----- Semantic search (distinct from /catalog/search fulltext) -----
  searchMoviesSemantic: (query: string, limit = 20) =>
    request<{ movies: Movie[]; query: string | null; semantic: boolean }>(
      `${SEARCH_URL}/movies${buildQuery({ q: query, limit })}`,
      { ttl: SHORT_TTL },
    ),

  searchSeriesSemantic: (query: string, limit = 20) =>
    request<{ series: Series[]; query: string | null; semantic: boolean }>(
      `${SEARCH_URL}/series${buildQuery({ q: query, limit })}`,
      { ttl: SHORT_TTL },
    ),

  getSearchStatus: () => request<SearchStatus>(`${SEARCH_URL}/status`, { ttl: SHORT_TTL }),
  getSearchInfo: () => request<SearchInfo>(`${SEARCH_URL}/info`, { ttl: DEFAULT_TTL }),

  // ----- Playback telemetry (best-effort, server accepts batch) -----
  sendPlaybackTelemetry: (event: PlaybackTelemetryEvent | PlaybackTelemetryEvent[]) =>
    request<void>(`${TELEMETRY_URL}/playback`, {
      method: "POST",
      body: Array.isArray(event) ? { events: event } : event,
      noCache: true,
    }),

  // ----- Prefetch -----
  prefetch: (path: string) => {
    const url = path.startsWith("http") ? path : `${CATALOG_URL}${path}`;
    const cacheKey = `GET ${url}`;
    if (cache.has(cacheKey) || inFlight.has(cacheKey)) return;

    const run = () => request(url).catch(() => {});
    if (typeof window !== "undefined" && window.requestIdleCallback) {
      window.requestIdleCallback(() => run(), { timeout: 2000 });
    } else {
      setTimeout(run, 100);
    }
  },

  prefetchMovie: (id: string | number) => api.prefetch(`/movies/${id}`),
  prefetchSeries: (id: string | number) => api.prefetch(`/series/${id}`),
  prefetchChannel: (id: string | number) => api.prefetch(`/channels/${id}`),

  clearCache: () => cache.clear(),
};

export default api;
