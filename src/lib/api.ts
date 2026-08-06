/**
 * Streamix API Client — TypeScript / SolidJS
 *
 * Source of truth: StreamixWeb.Router and the `/api/v1` controllers in the
 * sibling `streamix` repository. Public catalog calls require X-API-Key in
 * production; account-scoped resources additionally require a Bearer token.
 */

import { createLogger } from "@/shared/logging/logger";
import { Capacitor, CapacitorHttp, type HttpResponse } from "@capacitor/core";
import { scheduleTask } from "@solidtv/solid";
import { authSession } from "./storage";

const logger = createLogger("API");

const DEFAULT_API_V1_URL = "https://streamix.mahina.cloud/api/v1";
const CATALOG_URL = (import.meta.env.VITE_API_URL || `${DEFAULT_API_V1_URL}/catalog`).replace(/\/$/, "");
const API_V1_URL = (import.meta.env.VITE_API_BASE_URL || CATALOG_URL.replace(/\/catalog$/, "")).replace(
  /\/$/,
  "",
);
const API_ROOT_URL = API_V1_URL.replace(/\/v1$/, "");
const EPG_URL = (import.meta.env.VITE_EPG_URL || `${API_V1_URL}/epg`).replace(/\/$/, "");
const HISTORY_URL = (import.meta.env.VITE_HISTORY_URL || `${API_V1_URL}/history`).replace(/\/$/, "");
const AUTH_URL = (import.meta.env.VITE_AUTH_URL || `${API_V1_URL}/auth`).replace(/\/$/, "");
const FAVORITES_URL = (import.meta.env.VITE_FAVORITES_URL || `${API_V1_URL}/favorites`).replace(/\/$/, "");
const SEARCH_URL = (import.meta.env.VITE_SEARCH_URL || `${API_V1_URL}/search`).replace(/\/$/, "");
const RECOMMENDATIONS_URL = (
  import.meta.env.VITE_RECOMMENDATIONS_URL || `${API_V1_URL}/recommendations`
).replace(/\/$/, "");
const TELEMETRY_URL = (import.meta.env.VITE_TELEMETRY_URL || `${API_V1_URL}/telemetry`).replace(/\/$/, "");
const PROVIDERS_URL = (import.meta.env.VITE_PROVIDERS_URL || `${API_V1_URL}/providers`).replace(/\/$/, "");
const API_KEY = import.meta.env.VITE_API_KEY || "";

// ============ Cache + dedup ============

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
let pendingPrefetchTimer: ReturnType<typeof setTimeout> | undefined;
const PREFETCH_SETTLE_DELAY_MS = 450;
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
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  noCache?: boolean;
  bearer?: string | null;
  auth?: boolean;
  apiKey?: boolean;
  accept?: string;
  responseType?: "json" | "text";
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

interface ApiTransportResponse {
  ok: boolean;
  status: number;
  statusText: string;
  contentType: string;
  payload: unknown;
}

function getHeader(headers: Record<string, string> | undefined, name: string): string {
  const wanted = name.toLowerCase();
  const entry = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === wanted);
  return entry?.[1] ?? "";
}

function normalizeNativePayload(response: HttpResponse, responseType: RequestOpts["responseType"]): unknown {
  if (typeof response.data !== "string") return response.data;
  if (responseType === "text") return response.data;

  const contentType = getHeader(response.headers, "content-type");
  if (!contentType.includes("application/json")) return response.data;

  try {
    return JSON.parse(response.data);
  } catch {
    return response.data;
  }
}

function shouldUseNativeHttp(url: string): boolean {
  return (
    Capacitor.isNativePlatform() &&
    /^https?:\/\//.test(url) &&
    !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/.test(url)
  );
}

async function sendRequest(
  url: string,
  method: RequestOpts["method"],
  headers: Record<string, string>,
  body: unknown,
  responseType: RequestOpts["responseType"],
): Promise<ApiTransportResponse> {
  if (shouldUseNativeHttp(url)) {
    const response = await CapacitorHttp.request({
      url,
      method,
      headers,
      data: body,
    });

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: String(response.status),
      contentType: getHeader(response.headers, "content-type"),
      payload: normalizeNativePayload(response, responseType),
    };
  }

  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  const response = await fetch(url, init);
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload =
    responseType === "text"
      ? await response.text()
      : isJson
        ? await response.json().catch(() => null)
        : undefined;

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    contentType,
    payload,
  };
}

async function request<T>(url: string, opts: RequestOpts = {}): Promise<T> {
  const {
    ttl = DEFAULT_TTL,
    method = "GET",
    body,
    noCache = false,
    bearer,
    auth = true,
    apiKey = true,
    accept = "application/json",
    responseType = "json",
  } = opts;
  const sessionToken = auth ? (bearer === undefined ? authSession.getToken() : bearer) : null;
  // Account-scoped GETs must never share cache entries across sessions.
  const cacheKey = `${method} ${url} bearer=${sessionToken ?? "anonymous"}`;

  if (!noCache && method === "GET") {
    const cached = cache.get(cacheKey) as CacheEntry<T> | undefined;
    if (cached && Date.now() - cached.timestamp < ttl) return cached.data;

    const existing = inFlight.get(cacheKey) as Promise<T> | undefined;
    if (existing) return existing;
  }

  const headers: Record<string, string> = { Accept: accept };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (apiKey && API_KEY) headers["X-API-Key"] = API_KEY;
  if (sessionToken) headers["Authorization"] = `Bearer ${sessionToken}`;

  const promise = sendRequest(url, method, headers, body, responseType)
    .then(response => {
      const isJson =
        response.contentType.includes("application/json") ||
        (response.payload !== null && typeof response.payload === "object");

      if (!response.ok) {
        throw parseErrorPayload(response.status, response.statusText, isJson ? response.payload : null);
      }

      if (response.status === 204 || (!isJson && response.payload === undefined)) {
        return undefined as T;
      }

      return response.payload as T;
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

function invalidateCache(urlPrefix: string) {
  for (const key of cache.keys()) {
    if (key.includes(` ${urlPrefix}`)) cache.delete(key);
  }
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

export interface PublicCatalogStats {
  channels_count: number;
  movies_count: number;
  series_count: number;
}

export interface FeaturedResponse {
  featured: FeaturedItem | null;
  stats: PublicCatalogStats;
}

export interface HomeResponse {
  featured: FeaturedItem | null;
  trending_movies: Movie[];
  recent_movies: Movie[];
  top_rated_movies: Movie[];
  trending_series: Series[];
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
  plot?: string | null;
  tagline?: string | null;
  genre: string | null;
  director?: string | null;
  cast?: string | null;
  rating: number | null;
  episode_count?: number;
  season_count?: number;
  seasons?: Season[];
  backdrop?: string[];
  backdrop_url?: string;
  backdrop_w720?: string | null;
  backdrop_w1280?: string | null;
  poster: string | null;
  poster_url?: string;
  poster_w240?: string | null;
  poster_w480?: string | null;
  poster_w720?: string | null;
  youtube_trailer?: string | null;
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
  series_id?: number;
  series_name?: string;
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
  query?: string;
  movies: Movie[];
  series: Series[];
  channels: Channel[];
}

// Typeahead result — lightweight shape shared across movie/series/channel.
export interface SuggestItem {
  id: number;
  type: "movie" | "series" | "channel";
  title: string;
  year?: number | null;
  poster?: string | null;
  score?: number | null;
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

export type CatalogShelfType = "movie" | "series";

export interface CatalogShelfResponse<T extends Movie | Series = Movie | Series> {
  type: CatalogShelfType;
  items: T[];
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

export interface EpgCurrentProgram extends Omit<EpgProgram, "id"> {
  progress: number;
}

// History (backend /history)
export interface HistoryRecord {
  id: string | number;
  content_type: "movie" | "episode" | "live_channel";
  content_id: number;
  progress_seconds: number;
  duration_seconds: number | null;
  completed: boolean;
  watched_at?: string | null;
}

export type FavoriteKind = "movie" | "series" | "episode" | "live_channel";

export interface ApiEnvelope<T> {
  data: T;
  meta: {
    version: "v1" | string;
    pagination?: {
      total: number;
      limit: number;
      offset: number;
      has_more: boolean;
    };
  };
}

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

export interface SemanticMovieSearchResponse {
  movies: Movie[];
  query: string | null;
  semantic: boolean;
}

export interface SemanticSeriesSearchResponse {
  series: Series[];
  query: string | null;
  semantic: boolean;
}

export interface SemanticSearchStatus {
  available: boolean;
  stats: Record<string, unknown>;
}

export interface RecommendationChannel {
  id: number;
  name: string;
  category?: string | null;
  categories?: string[];
  logo?: string | null;
  logo_url?: string;
  provider_id?: number;
}

export interface RecommendationChannelsResponse {
  channels: RecommendationChannel[];
  personalized: boolean;
}

export interface ViewingInsights {
  has_data: boolean;
  total_items?: number;
  content_breakdown?: Record<string, number>;
  completion_rate?: number;
  favorite_genres?: string[];
  watch_patterns?: {
    peak_hour: number | null;
    weekend_preference: boolean;
    weekday_count: number;
    weekend_count: number;
  };
  most_watched_day?: string;
  avg_session_length?: number;
}

export interface Provider {
  id: number;
  name: string;
  url: string | null;
  provider_type: string;
  is_active: boolean;
  last_synced_at: string | null;
  channels_count: number;
  movies_count: number;
  series_count: number;
  inserted_at: string;
}

export interface CreateProviderInput {
  name: string;
  url: string;
  username: string;
  password: string;
}

export type ProviderHealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export interface ProviderHealthReport {
  id: number;
  name: string;
  provider_type: string;
  visibility: string;
  is_active: boolean;
  status: ProviderHealthStatus;
  circuit_state: string | null;
  last_error_at: string | null;
  last_success_at: string | null;
  error_count: number;
  dimensions: Record<string, unknown>;
  capabilities: Record<string, unknown> | null;
  capacity: Record<string, unknown>;
  message: string;
}

export interface ProviderHealthResponse {
  overall: {
    status: ProviderHealthStatus;
    counts: Partial<Record<ProviderHealthStatus, number>>;
  };
  providers: ProviderHealthReport[];
}

// ----- Telemetry -----
export interface PlaybackTelemetryEvent {
  kind?: "playback";
  event: "playback_session" | "player_error";
  outcome: "started" | "playing" | "completed" | "error" | "cancelled" | "restarted" | "unknown";
  engine?: "native" | "hls" | "dash" | "shaka" | "mpegts" | "avplayer" | "vlc" | "unknown";
  content_type: "movie" | "episode" | "channel";
  stream_type?: "hls" | "mpegts" | "ts" | "mp4" | "mkv" | "flv" | "dash" | "torrent" | "unknown";
  surface?: "other";
  time_to_first_frame_ms?: number;
  buffer_count?: number;
  total_buffer_duration_ms?: number;
  session_duration_ms?: number;
  error_count?: number;
  fallback_count?: number;
  muted_mismatch?: boolean;
}

export interface TelemetryIngestResponse {
  accepted: number;
  batch_id: string;
}

export interface FavoriteSyncOperation {
  type: FavoriteKind;
  content_id: string | number;
  action: "add" | "remove";
  at?: string;
}

export interface FavoriteSyncResponse {
  added: number;
  removed: number;
  skipped: number;
}

export interface GindexTrack {
  index: number;
  type?: "audio" | "subtitle";
  language?: string | null;
  codec?: string | null;
  title?: string | null;
  [key: string]: unknown;
}

export interface HealthResponse {
  status: "ok";
  timestamp: string;
}

export interface ReadinessResponse {
  status: "ok" | "degraded" | "unavailable" | string;
  [key: string]: unknown;
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

const normFeatured = (item: FeaturedItem | null): FeaturedItem | null => {
  if (!item) return null;
  return {
    ...item,
    poster_url: item.poster ?? item.poster_url,
    backdrop_url: item.backdrop?.[0] ?? item.backdrop_url,
  };
};

const normRecommendationChannel = (channel: RecommendationChannel): RecommendationChannel => ({
  ...channel,
  logo_url: channel.logo ?? channel.logo_url,
});

function mergeById<T extends { id: string | number }>(preferred: T[], fallback: T[], limit: number): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const item of [...preferred, ...fallback]) {
    const key = String(item.id);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= limit) break;
  }

  return merged;
}

// ============ API ============

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
  // ----- Categories -----
  getCategories: (type?: CategoryFilter) =>
    request<Category[]>(`${CATALOG_URL}/categories${buildQuery({ type })}`),

  getFeatured: async (): Promise<FeaturedResponse> => {
    const response = await request<FeaturedResponse>(`${CATALOG_URL}/featured`, { ttl: SHORT_TTL });
    return { ...response, featured: normFeatured(response.featured) };
  },

  getTrending: async (type: CatalogShelfType = "movie", limit = 20): Promise<CatalogShelfResponse> => {
    const response = await request<CatalogShelfResponse>(
      `${CATALOG_URL}/trending${buildQuery({ type, limit })}`,
      { ttl: SHORT_TTL },
    );
    return {
      ...response,
      items:
        response.type === "series"
          ? (response.items as Series[]).map(normSeries)
          : (response.items as Movie[]).map(normMovie),
    };
  },

  getRecent: async (type: CatalogShelfType = "movie", limit = 20): Promise<CatalogShelfResponse> => {
    const response = await request<CatalogShelfResponse>(
      `${CATALOG_URL}/recent${buildQuery({ type, limit })}`,
      { ttl: SHORT_TTL },
    );
    return {
      ...response,
      items:
        response.type === "series"
          ? (response.items as Series[]).map(normSeries)
          : (response.items as Movie[]).map(normMovie),
    };
  },

  getTopRated: async (type: CatalogShelfType = "movie", limit = 20): Promise<CatalogShelfResponse> => {
    const response = await request<CatalogShelfResponse>(
      `${CATALOG_URL}/top-rated${buildQuery({ type, limit })}`,
      { ttl: SHORT_TTL },
    );
    return {
      ...response,
      items:
        response.type === "series"
          ? (response.items as Series[]).map(normSeries)
          : (response.items as Movie[]).map(normMovie),
    };
  },

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
  // Full search combines semantic movie/series results with the ranked
  // catalog response. The lexical response remains authoritative if the AI
  // service is temporarily unavailable and is also the source for channels.
  search: async (query: string, limit = 10): Promise<SearchResults> => {
    const [catalogResult, movieResult, seriesResult] = await Promise.allSettled([
      request<SearchResults>(`${CATALOG_URL}/search${buildQuery({ q: query, limit })}`, {
        ttl: SHORT_TTL,
      }),
      request<SemanticMovieSearchResponse>(`${SEARCH_URL}/movies${buildQuery({ q: query, limit })}`, {
        ttl: SHORT_TTL,
      }),
      request<SemanticSeriesSearchResponse>(`${SEARCH_URL}/series${buildQuery({ q: query, limit })}`, {
        ttl: SHORT_TTL,
      }),
    ]);

    if (catalogResult.status === "rejected") throw catalogResult.reason;
    const catalog = catalogResult.value;
    if (movieResult.status === "rejected") logger.warn("Semantic movie search unavailable");
    if (seriesResult.status === "rejected") logger.warn("Semantic series search unavailable");

    return {
      query: catalog.query ?? query,
      movies: mergeById(
        movieResult.status === "fulfilled" ? (movieResult.value.movies || []).map(normMovie) : [],
        (catalog.movies || []).map(normMovie),
        limit,
      ),
      series: mergeById(
        seriesResult.status === "fulfilled" ? (seriesResult.value.series || []).map(normSeries) : [],
        (catalog.series || []).map(normSeries),
        limit,
      ),
      channels: (catalog.channels || []).map(normChannel).slice(0, limit),
    };
  },

  searchMovies: async (query: string, limit = 20, minScore = 0.6) => {
    const response = await request<SemanticMovieSearchResponse>(
      `${SEARCH_URL}/movies${buildQuery({ q: query, limit, min_score: minScore })}`,
      { ttl: SHORT_TTL },
    );
    return { ...response, movies: (response.movies || []).map(normMovie) };
  },

  searchSeries: async (query: string, limit = 20, minScore = 0.6) => {
    const response = await request<SemanticSeriesSearchResponse>(
      `${SEARCH_URL}/series${buildQuery({ q: query, limit, min_score: minScore })}`,
      { ttl: SHORT_TTL },
    );
    return { ...response, series: (response.series || []).map(normSeries) };
  },

  getSearchStatus: () => request<SemanticSearchStatus>(`${SEARCH_URL}/status`, { ttl: SHORT_TTL }),

  getSearchInfo: () => request<Record<string, unknown>>(`${SEARCH_URL}/info`, { ttl: SHORT_TTL }),

  // Typeahead — lightweight, mixed list of {id, type, title, year, poster}.
  suggest: (query: string, limit = 10) =>
    request<{ query: string; items: SuggestItem[] }>(
      `${CATALOG_URL}/suggest${buildQuery({ q: query, limit })}`,
      { ttl: SHORT_TTL },
    ),

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
  getHome: async (limit = 20): Promise<HomeResponse> => {
    const response = await request<HomeResponse>(`${CATALOG_URL}/home${buildQuery({ limit })}`, {
      ttl: SHORT_TTL,
    });
    return {
      ...response,
      featured: normFeatured(response.featured),
      trending_movies: (response.trending_movies || []).map(normMovie),
      recent_movies: (response.recent_movies || []).map(normMovie),
      top_rated_movies: (response.top_rated_movies || []).map(normMovie),
      trending_series: (response.trending_series || []).map(normSeries),
    };
  },

  // ----- EPG -----
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

  getEpgNow: async (
    channelIds: Array<number | string>,
  ): Promise<Record<string, EpgCurrentProgram | null>> => {
    if (channelIds.length === 0) return {};
    const response = await request<{ now: Record<string, EpgCurrentProgram | null> }>(
      `${EPG_URL}/now${buildQuery({ channel_ids: channelIds.join(",") })}`,
      { ttl: SHORT_TTL },
    );
    return response.now || {};
  },

  // ----- History (Bearer auth) -----
  getHistory: (
    params: { type?: HistoryRecord["content_type"]; limit?: number; offset?: number } = {},
    bearer?: string,
  ) =>
    request<{ items: HistoryRecord[] }>(`${HISTORY_URL}${buildQuery(params)}`, {
      ttl: SHORT_TTL,
      bearer,
    }),

  upsertHistory: (
    record: {
      type: "movie" | "episode" | "live_channel";
      content_id: string | number;
      progress_seconds: number;
      duration_seconds?: number;
      completed?: boolean;
    },
    bearer?: string,
  ) => {
    const pending = request<HistoryRecord>(HISTORY_URL, {
      method: "POST",
      body: record,
      noCache: true,
      bearer,
    });
    invalidateCache(HISTORY_URL);
    return pending;
  },

  removeHistory: (id: string | number, bearer?: string) => {
    const pending = request<void>(`${HISTORY_URL}/${id}`, {
      method: "DELETE",
      noCache: true,
      bearer,
    });
    invalidateCache(HISTORY_URL);
    return pending;
  },

  // ----- Favorites (Bearer auth) -----
  getFavorites: (type?: FavoriteKind, bearer?: string, limit = 100) =>
    request<{ favorites: FavoriteRecord[] }>(`${FAVORITES_URL}${buildQuery({ type, limit })}`, {
      ttl: SHORT_TTL,
      bearer,
    }),

  addFavorite: async (type: FavoriteKind, contentId: string | number, bearer?: string) => {
    const response = await request<ApiEnvelope<FavoriteBase>>(FAVORITES_URL, {
      method: "POST",
      body: { type, content_id: contentId },
      noCache: true,
      bearer,
    });
    invalidateCache(FAVORITES_URL);
    return response.data;
  },

  removeFavorite: (type: FavoriteKind, contentId: string | number, bearer?: string) => {
    const pending = request<void>(`${FAVORITES_URL}/${type}/${contentId}`, {
      method: "DELETE",
      noCache: true,
      bearer,
    });
    invalidateCache(FAVORITES_URL);
    return pending;
  },

  toggleFavorite: async (type: FavoriteKind, contentId: string | number, bearer?: string) => {
    const response = await request<{ status: "added" | "removed" }>(`${FAVORITES_URL}/toggle`, {
      method: "POST",
      body: { type, content_id: contentId },
      noCache: true,
      bearer,
    });
    invalidateCache(FAVORITES_URL);
    return response;
  },

  syncFavorites: async (operations: FavoriteSyncOperation[], bearer?: string) => {
    const response = await request<FavoriteSyncResponse>(`${FAVORITES_URL}/sync`, {
      method: "POST",
      body: { operations },
      noCache: true,
      bearer,
    });
    invalidateCache(FAVORITES_URL);
    return response;
  },

  // ----- Auth -----
  register: (payload: { email: string; password: string; name?: string }) =>
    request<AuthResponse>(`${AUTH_URL}/register`, {
      method: "POST",
      body: payload,
      noCache: true,
      auth: false,
      apiKey: false,
    }),

  login: (payload: { email: string; password: string }) =>
    request<AuthResponse>(`${AUTH_URL}/login`, {
      method: "POST",
      body: payload,
      noCache: true,
      auth: false,
      apiKey: false,
    }),

  me: (bearer?: string) =>
    request<{ user: AuthUser }>(`${AUTH_URL}/me`, {
      ttl: SHORT_TTL,
      bearer,
      auth: bearer !== null,
      apiKey: false,
    }),

  logout: (bearer?: string) =>
    request<void>(`${AUTH_URL}/logout`, {
      method: "POST",
      noCache: true,
      bearer,
      apiKey: false,
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

  getRecommendedChannels: async (limit = 10): Promise<RecommendationChannelsResponse> => {
    const response = await request<RecommendationChannelsResponse>(
      `${RECOMMENDATIONS_URL}/channels${buildQuery({ limit })}`,
      { ttl: SHORT_TTL },
    );
    return { ...response, channels: (response.channels || []).map(normRecommendationChannel) };
  },

  getViewingInsights: async (): Promise<ViewingInsights> => {
    const response = await request<{ insights: ViewingInsights }>(`${RECOMMENDATIONS_URL}/insights`, {
      ttl: SHORT_TTL,
    });
    return response.insights;
  },

  refreshRecommendations: () =>
    request<{ status: "refreshed" | "no_history"; message?: string }>(`${RECOMMENDATIONS_URL}/refresh`, {
      method: "POST",
      noCache: true,
    }),

  // ----- Playback telemetry -----
  sendPlaybackTelemetry: (event: PlaybackTelemetryEvent | PlaybackTelemetryEvent[], batchId?: string) =>
    request<TelemetryIngestResponse>(`${TELEMETRY_URL}/playback`, {
      method: "POST",
      body: {
        ...(batchId ? { batch_id: batchId } : {}),
        metrics: Array.isArray(event) ? event : [event],
      },
      noCache: true,
    }),

  // ----- Provider health and private provider management -----
  getProviderStatus: () => request<ProviderHealthResponse>(`${PROVIDERS_URL}/status`, { ttl: SHORT_TTL }),

  getProviders: (bearer?: string) =>
    request<{ providers: Provider[] }>(PROVIDERS_URL, { ttl: SHORT_TTL, bearer }),

  createProvider: (input: CreateProviderInput, bearer?: string) =>
    request<Provider>(PROVIDERS_URL, {
      method: "POST",
      body: input,
      noCache: true,
      bearer,
    }),

  removeProvider: (id: string | number, bearer?: string) =>
    request<void>(`${PROVIDERS_URL}/${id}`, {
      method: "DELETE",
      noCache: true,
      bearer,
    }),

  syncProvider: (id: string | number, bearer?: string) =>
    request<{ status: "sync_started"; provider_id: number }>(`${PROVIDERS_URL}/${id}/sync`, {
      method: "POST",
      noCache: true,
      bearer,
    }),

  // ----- Operational and playback-support endpoints outside /api/v1 -----
  getHealth: () =>
    request<HealthResponse>(`${API_ROOT_URL}/health`, {
      ttl: SHORT_TTL,
      auth: false,
      apiKey: false,
    }),

  getReadiness: () =>
    request<ReadinessResponse>(`${API_ROOT_URL}/health/ready`, {
      ttl: SHORT_TTL,
      auth: false,
      apiKey: false,
    }),

  getGindexTracks: (type: "movie" | "episode", id: string | number) =>
    request<GindexTrack[] | { status: "probing"; retry_after: number }>(
      `${API_ROOT_URL}/gindex-tracks/${type}/${id}`,
      { ttl: DEFAULT_TTL, auth: false, apiKey: false },
    ),

  getSubtitle: async (imdbId: string, lang = "pt-BR", offsetMs = 0): Promise<string | null> => {
    const response = await request<string | undefined>(
      `${API_ROOT_URL}/subtitles/${encodeURIComponent(imdbId)}${buildQuery({
        lang,
        offset_ms: offsetMs,
      })}`,
      {
        ttl: 24 * 60 * 60 * 1000,
        auth: false,
        apiKey: false,
        accept: "text/vtt",
        responseType: "text",
      },
    );
    return response ?? null;
  },

  // ----- Prefetch -----
  prefetch: (path: string) => {
    const url = path.startsWith("http") ? path : `${CATALOG_URL}${path}`;
    if (pendingPrefetchTimer) {
      clearTimeout(pendingPrefetchTimer);
      pendingPrefetchTimer = undefined;
    }
    const alreadyLoaded = () =>
      [...cache.keys(), ...inFlight.keys()].some(key => key.startsWith(`GET ${url} `));
    if (alreadyLoaded()) return;

    pendingPrefetchTimer = setTimeout(() => {
      pendingPrefetchTimer = undefined;
      scheduleTask(() => {
        if (alreadyLoaded()) return;
        void request(url).catch(error => logger.debug("Prefetch failed", { url, error }));
      }, "low");
    }, PREFETCH_SETTLE_DELAY_MS);
  },

  prefetchMovie: (id: string | number) => api.prefetch(`/movies/${id}`),

  prefetchSeries: (id: string | number) => api.prefetch(`/series/${id}`),

  clearCache: () => cache.clear(),
};

export default api;
