// Image URL helpers. The Streamix backend now exposes pre-sized variants
// (poster_w240/480/720, backdrop_w720/1280) on most list/detail payloads,
// plus an internal resize proxy for raw URLs.
//
// Picking strategy:
// 1. If the item carries a pre-sized variant for the bucket we need, use it.
// 2. Otherwise route the raw URL through /catalog/images/resize.
// 3. TMDB URLs keep their native size rewriting (cheaper than a round trip).

const RESIZE_ENDPOINT =
  (import.meta.env.VITE_API_URL || "https://streamix.mahina.cloud/api/v1/catalog").replace(/\/$/, "") +
  "/images/resize";
// Lightning's <View src> uses a raw browser fetch with no custom headers. The
// resize proxy also accepts ?api_key= so we can embed it directly in the URL.
const RESIZE_API_KEY = import.meta.env.VITE_API_KEY || "";

// Streamix resize ladder — anything outside these widths is coerced server-side
// but we pick locally to avoid unnecessary cache misses.
const LADDER = [120, 240, 360, 480, 640, 720, 960, 1080, 1280, 1920] as const;
type Ladder = (typeof LADDER)[number];

function snapToLadder(width: number): Ladder {
  for (const w of LADDER) {
    if (width <= w) return w;
  }
  return 1920;
}

export function proxyImageUrl(url: string | undefined | null, maxWidth = 480): string | undefined {
  if (!url) return undefined;

  // TMDB already exposes size buckets in the path; rewriting is free.
  if (/\/t\/p\/[^/]+\//.test(url)) {
    const width = Math.max(300, Math.min(1280, maxWidth));
    const bucket = width <= 342 ? "w342" : width <= 500 ? "w500" : width <= 780 ? "w780" : "w1280";
    return url.replace(/\/t\/p\/[^/]+\//, `/t/p/${bucket}/`);
  }

  // Everything else goes through the backend proxy — it caches to disk and
  // serves a JPEG bounded to the ladder above.
  const snapped = snapToLadder(maxWidth);
  const keyParam = RESIZE_API_KEY ? `&api_key=${encodeURIComponent(RESIZE_API_KEY)}` : "";
  return `${RESIZE_ENDPOINT}?url=${encodeURIComponent(url)}&w=${snapped}${keyParam}`;
}

/** Variant that targets a landscape hero/backdrop at 1280px wide. */
export function proxyBackdropUrl(url: string | undefined | null): string | undefined {
  return proxyImageUrl(url, 1280);
}

// Shapes of objects that may carry pre-sized variants from the backend.
interface PosterVariants {
  poster?: string | null;
  poster_url?: string | null;
  poster_w240?: string | null;
  poster_w480?: string | null;
  poster_w720?: string | null;
}

interface BackdropVariants {
  backdrop?: string[] | string | null;
  backdrop_url?: string | null;
  backdrop_w720?: string | null;
  backdrop_w1280?: string | null;
}

function isTmdb(url?: string | null): boolean {
  return !!url && /\/t\/p\/[^/]+\//.test(url);
}

// Pre-sized variants from the backend point at /catalog/images/resize without
// auth params. Lightning can't attach an X-API-Key header, so sign the URL.
function withResizeKey(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  if (!RESIZE_API_KEY) return url;
  if (!url.includes("/catalog/images/resize")) return url;
  if (url.includes("api_key=")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}api_key=${encodeURIComponent(RESIZE_API_KEY)}`;
}

/**
 * Pick the best poster variant for a given display width.
 *
 * TMDB-hosted posters short-circuit the variant logic because TMDB already
 * serves size buckets on a public CDN and /catalog/images/resize currently
 * requires an X-API-Key header that Lightning's <View src> cannot send.
 * Routing TMDB through the proxy would turn every card into a 401.
 */
export function pickPoster(item: PosterVariants | undefined | null, targetWidth = 240): string | undefined {
  if (!item) return undefined;
  const raw = item.poster_url || item.poster || undefined;
  if (isTmdb(raw)) return proxyImageUrl(raw, targetWidth);
  if (targetWidth <= 240 && item.poster_w240) return withResizeKey(item.poster_w240);
  if (targetWidth <= 480 && item.poster_w480) return withResizeKey(item.poster_w480);
  if (item.poster_w720) return withResizeKey(item.poster_w720);
  return proxyImageUrl(raw, targetWidth);
}

/** Pick the best backdrop variant for a hero banner. */
export function pickBackdrop(
  item: BackdropVariants | undefined | null,
  targetWidth = 1280,
): string | undefined {
  if (!item) return undefined;
  const raw = Array.isArray(item.backdrop)
    ? item.backdrop[item.backdrop.length - 1]
    : item.backdrop || item.backdrop_url || undefined;
  if (isTmdb(raw)) return proxyImageUrl(raw, targetWidth);
  if (targetWidth <= 720 && item.backdrop_w720) return withResizeKey(item.backdrop_w720);
  if (item.backdrop_w1280) return withResizeKey(item.backdrop_w1280);
  return proxyImageUrl(raw, targetWidth);
}
