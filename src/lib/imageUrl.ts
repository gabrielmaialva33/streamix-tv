// Image URL helpers. The Streamix backend now exposes pre-sized variants
// (poster_w240/480/720, backdrop_w720/1280) on most list/detail payloads,
// plus an internal resize proxy for raw URLs.
//
// Picking strategy:
// 1. Prefer pre-sized variants returned by the backend.
// 2. Route raw URLs through the resize cache using its fixed width ladder.
// 3. Keep API credentials out of URLs. The image XHR bridge adds the
//    X-API-Key header before the renderer sends the texture request.

const RESIZE_ENDPOINT =
  (import.meta.env.VITE_API_URL || "https://streamix.mahina.fun/api/v1/catalog").replace(/\/$/, "") +
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

/**
 * Idempotent on purpose: a URL that is already a resize request gets its width
 * swapped rather than wrapped again.
 *
 * Wrapping twice produces `?url=<encoded resize url with its own %26w%3D240>&w=120`,
 * which hands the resize endpoint a proxy URL as if it were an origin. Every
 * such image renders blank. It is easy to hit because stored records keep the
 * URL they were displayed with — history items saved from a card already carry
 * a proxied poster, and "Continue assistindo" then proxied it a second time, so
 * the row that exists to be recognised at a glance showed no artwork at all.
 */
export function proxyImageUrl(url: string | undefined | null, maxWidth = 480): string | undefined {
  if (!url) return undefined;

  const snapped = snapToLadder(maxWidth);

  if (url.startsWith(RESIZE_ENDPOINT)) {
    const [base, query = ""] = url.split("?", 2);
    const params = new URLSearchParams(query);
    params.set("w", String(snapped));
    return `${base}?${params.toString()}`;
  }

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
 * Pick the best poster variant for a given display width.
 */
export function pickPoster(item: PosterVariants | undefined | null, targetWidth = 240): string | undefined {
  if (!item) return undefined;
  const raw = item.poster_url || item.poster || undefined;
  if (targetWidth <= 240 && item.poster_w240) return item.poster_w240;
  if (targetWidth <= 480 && item.poster_w480) return item.poster_w480;
  if (item.poster_w720) return item.poster_w720;
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
  if (targetWidth <= 720 && item.backdrop_w720) return item.backdrop_w720;
  if (item.backdrop_w1280) return item.backdrop_w1280;
  return proxyImageUrl(raw, targetWidth);
}
