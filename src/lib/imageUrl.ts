// Keep the GPU texture budget of commercial Samsung Tizen TVs alive. Catalog
// posters can reach 2480x3508 (A4 scans of course flyers), which decode to
// ~35MB of VRAM each. A single category of 16 such cards blows past the TV's
// ~256MB WebGL budget and takes the whole OS down.
//
// - TMDB-style URLs already carry a size segment; rewrite them to a reasonable
//   width instead of `original`.
// - Everything else gets routed through wsrv.nl, a public image cache that
//   resizes on demand.
export function proxyImageUrl(url: string | undefined | null, maxWidth = 480): string | undefined {
  if (!url) return undefined;

  // TMDB path style: .../t/p/<size>/<hash>.jpg — rewrite to a specific width.
  if (/\/t\/p\/[^/]+\//.test(url)) {
    const width = Math.max(300, Math.min(1280, maxWidth));
    const bucket = width <= 342 ? "w342" : width <= 500 ? "w500" : width <= 780 ? "w780" : "w1280";
    return url.replace(/\/t\/p\/[^/]+\//, `/t/p/${bucket}/`);
  }

  // Everything else: resize through wsrv.nl. Strip the leading scheme so it
  // works with both http and https sources without double-encoding.
  const stripped = url.replace(/^https?:\/\//, "");
  return `https://wsrv.nl/?url=${encodeURIComponent(stripped)}&w=${maxWidth}&output=jpg&q=80`;
}

/** Variant that targets a landscape hero/backdrop at 1280px wide. */
export function proxyBackdropUrl(url: string | undefined | null): string | undefined {
  return proxyImageUrl(url, 1280);
}
