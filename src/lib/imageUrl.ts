// Image URL helpers. The Streamix backend now exposes pre-sized variants
// (poster_w240/480/720, backdrop_w720/1280) on most list/detail payloads,
// plus an internal resize proxy for raw URLs.
//
// Picking strategy:
// 1. TMDB URLs use their public native size buckets.
// 2. Pre-sized backend variants are used when the API is running without a
//    key (local development).
// 3. With header-only API auth enabled, Lightning loads the public raw URL;
//    it cannot attach X-API-Key to a View texture request.

const RESIZE_ENDPOINT =
  (import.meta.env.VITE_API_URL || "https://streamix.mahina.cloud/api/v1/catalog").replace(/\/$/, "") +
  "/images/resize";
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

  // API keys are header-only. A Lightning View cannot set request headers, so
  // keep the original public URL rather than leaking a credential in the URL.
  if (RESIZE_API_KEY) return url;

  // Keyless development can use the backend resize cache directly.
  const snapped = snapToLadder(maxWidth);
  return `${RESIZE_ENDPOINT}?url=${encodeURIComponent(url)}&w=${snapped}`;
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
  if (!url || !/\/t\/p\/[^/]+\//.test(url)) return false;
  try {
    return new URL(url).hostname === "tmdb.mahina.cloud";
  } catch {
    return false;
  }
}

function accessibleResizeVariant(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  if (RESIZE_API_KEY && url.includes("/catalog/images/resize")) return undefined;
  return url;
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
  if (targetWidth <= 240 && item.poster_w240) {
    const variant = accessibleResizeVariant(item.poster_w240);
    if (variant) return variant;
  }
  if (targetWidth <= 480 && item.poster_w480) {
    const variant = accessibleResizeVariant(item.poster_w480);
    if (variant) return variant;
  }
  if (item.poster_w720) {
    const variant = accessibleResizeVariant(item.poster_w720);
    if (variant) return variant;
  }
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
  if (targetWidth <= 720 && item.backdrop_w720) {
    const variant = accessibleResizeVariant(item.backdrop_w720);
    if (variant) return variant;
  }
  if (item.backdrop_w1280) {
    const variant = accessibleResizeVariant(item.backdrop_w1280);
    if (variant) return variant;
  }
  return proxyImageUrl(raw, targetWidth);
}
