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

/**
 * Pick the best poster variant for a given display width. Falls back to the
 * resize proxy when the backend hasn't populated variants yet (older items).
 */
export function pickPoster(item: PosterVariants | undefined | null, targetWidth = 240): string | undefined {
  if (!item) return undefined;
  if (targetWidth <= 240 && item.poster_w240) return item.poster_w240;
  if (targetWidth <= 480 && item.poster_w480) return item.poster_w480;
  if (item.poster_w720) return item.poster_w720;
  return proxyImageUrl(item.poster_url || item.poster || undefined, targetWidth);
}

/** Pick the best backdrop variant for a hero banner. */
export function pickBackdrop(
  item: BackdropVariants | undefined | null,
  targetWidth = 1280,
): string | undefined {
  if (!item) return undefined;
  if (targetWidth <= 720 && item.backdrop_w720) return item.backdrop_w720;
  if (item.backdrop_w1280) return item.backdrop_w1280;
  const raw = Array.isArray(item.backdrop)
    ? item.backdrop[item.backdrop.length - 1]
    : item.backdrop || item.backdrop_url || undefined;
  return proxyImageUrl(raw, targetWidth);
}
