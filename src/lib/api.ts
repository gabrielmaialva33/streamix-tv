/**
 * Streamix API Client — TypeScript / SolidJS
 *
 * Fonte: https://streamix.mahina.cloud/api/v1
 *   /catalog  -> filmes, séries, canais, busca, categorias
 *   /epg      -> guia eletrônico de programação
 *   /history  -> histórico de visualização (Bearer no controller)
 */

const CATALOG_URL = import.meta.env.VITE_API_URL || "https://streamix.mahina.cloud/api/v1/catalog";
const EPG_URL = import.meta.env.VITE_EPG_URL || "https://streamix.mahina.cloud/api/v1/epg";
const HISTORY_URL = import.meta.env.VITE_HISTORY_URL || "https://streamix.mahina.cloud/api/v1/history";
const API_KEY = import.meta.env.VITE_API_KEY || "";

// ============ Cache + dedup ============

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 min
const SHORT_TTL = 30 * 1000; // 30s — pra coisas voláteis (EPG now, stream urls)

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
  bearer?: string;
}

async function request<T>(url: string, opts: RequestOpts = {}): Promise<T> {
  const { ttl = DEFAULT_TTL, method = "GET", body, noCache = false, bearer } = opts;
  const cacheKey = `${method} ${url}`;

  if (!noCache && method === "GET") {
    const cached = cache.get(cacheKey) as CacheEntry<T> | undefined;
    if (cached && Date.now() - cached.timestamp < ttl) return cached.data;

    const existing = inFlight.get(cacheKey) as Promise<T> | undefined;
    if (existing) return existing;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) headers["X-API-Key"] = API_KEY;
  if (bearer) headers["Authorization"] = `Bearer ${bearer}`;

  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  const promise = fetch(url, init)
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
      return r.json() as Promise<T>;
    })
    .then(data => {
      if (!noCache && method === "GET") cache.set(cacheKey, { data, timestamp: Date.now() });
      inFlight.delete(cacheKey);
      return data;
    })
    .catch(err => {
      inFlight.delete(cacheKey);
      console.error(`[API] ${method} ${url}:`, err);
      throw err;
    });

  if (!noCache && method === "GET") inFlight.set(cacheKey, promise);
  return promise;
}

// ============ Tipos (batendo com a API real) ============

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
  backdrop?: string[];
  backdrop_url?: string;
  year?: number | null;
  rating?: number | null;
  genre?: string | null;
}

export interface Category {
  id: number;
  name: string;
  type: "movie" | "series" | "live";
}

export interface Movie {
  id: number;
  name: string;
  title: string | null;
  year: number | null;
  duration: string | null; // ex: "1h 44min"
  genre: string | null;
  rating: number | null;
  poster: string | null;
  poster_url?: string; // alias normalizado pra UI
  // detalhe completo:
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
}

export interface Series {
  id: number;
  name: string;
  title: string | null;
  year: number | null;
  plot: string | null;
  genre: string | null;
  director: string | null;
  cast?: string | null;
  rating: number | null;
  episode_count: number;
  season_count: number;
  seasons: Season[];
  backdrop: string[];
  backdrop_url?: string;
  poster: string | null;
  poster_url?: string;
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
  // alias normalizado pra UI:
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

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

// EPG
export interface EpgProgram {
  id: string | number;
  channel_id: number;
  title: string;
  description?: string;
  start: string; // ISO datetime
  end: string;
  category?: string;
}

// History (backend /history)
export interface HistoryRecord {
  id: string | number;
  type: ContentType;
  content_id: number;
  episode_id?: number;
  position_seconds: number;
  duration_seconds: number;
  updated_at: string;
  title?: string;
  poster?: string;
  episode_title?: string;
  season_number?: number;
  episode_number?: number;
}

// ============ Helpers de normalização ============

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

/** Converte "1h 44min" / "44min" / "59min" pra segundos. Retorna 0 se não der. */
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

  // ----- Categorias -----
  getCategories: (type?: "movie" | "series" | "live") =>
    request<Category[]>(`${CATALOG_URL}/categories${buildQuery({ type })}`),

  // ----- Filmes -----
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

  // ----- Séries -----
  getSeries: async (params: MovieListParams = {}): Promise<PaginatedResponse<Series>> => {
    try {
      const r = await request<SeriesListResponse>(
        `${CATALOG_URL}/series${buildQuery(params as Record<string, unknown>)}`,
      );
      console.log(`[api.getSeries] total=${r.total} items=${(r.series || []).length}`);
      return {
        data: (r.series || []).map(normSeries),
        total: r.total ?? 0,
        offset: params.offset ?? 0,
        limit: params.limit ?? 20,
        has_more: r.has_more ?? false,
      };
    } catch (e) {
      console.error("[api.getSeries] FAILED", params, e);
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

  // ----- Canais -----
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

  // ----- Busca -----
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

  // ----- Rails da Home (backend gera top-rated/recente/trending) -----
  // Fallback em cascata: endpoint novo -> listagem com sort -> listagem sem sort.
  // Backend atual da 500 em /series quando passa sort, entao precisa do segundo
  // fallback pra /series nao ficar vazio.
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
   * EPG agora — valor por canal pode ser null se nao tem programa.
   */
  getEpgNow: async (
    channelIds: Array<number | string>,
  ): Promise<Record<string, (EpgProgram & { progress?: number }) | null>> => {
    if (channelIds.length === 0) return {};
    const r = await request<{ now: Record<string, (EpgProgram & { progress?: number }) | null> }>(
      `${EPG_URL}/now${buildQuery({ channel_ids: channelIds.join(",") })}`,
      { ttl: SHORT_TTL },
    );
    return r.now || {};
  },

  /**
   * Grade EPG — janela em horas a frente de agora (default 6, max 12).
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

  // ----- Histórico (Bearer auth) -----
  getHistory: (bearer?: string) =>
    request<{ history: HistoryRecord[] }>(`${HISTORY_URL}`, { ttl: SHORT_TTL, bearer }),

  upsertHistory: (record: Partial<HistoryRecord>, bearer?: string) =>
    request<HistoryRecord>(HISTORY_URL, {
      method: "POST",
      body: record,
      noCache: true,
      bearer,
    }),

  deleteHistory: (id: string | number, bearer?: string) =>
    request<{ ok: boolean }>(`${HISTORY_URL}/${id}`, { method: "DELETE", noCache: true, bearer }),

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
