// SDF + Canvas font registration for Lightning 3.
//
// WARNING about family naming: Lightning concatenates the numeric weight onto
// the fontFamily string (see elementNode.js `set fontWeight`). For the default
// fontWeightAlias:
//   400 → ''    so `<Text>` (default) looks up "NotoSans"
//   700 → '700' so `<Text fontWeight={700}>` looks up "NotoSans700"
//   500 → '500' → "NotoSans500"
//
// Each suffixed name is a DIFFERENT font family to the renderer, cached
// separately. We therefore register one face per weight with the suffixed
// name so the atlas for bold is actually loaded.
//
// Metrics for NotoSans (the bundled atlases don't embed `lightningMetrics`).

const NOTO_METRICS = {
  ascender: 1069,
  descender: -293,
  lineGap: 0,
  unitsPerEm: 1000,
} as const;

const fonts = [
  // Default (weight 400) → "NotoSans"
  {
    type: "msdf" as const,
    fontFamily: "NotoSans",
    atlasDataUrl: "fonts/NotoSans-Regular.msdf.json",
    atlasUrl: "fonts/NotoSans-Regular.msdf.png",
    metrics: NOTO_METRICS,
  },
  // Medium (weight 500) → "NotoSans500" (no medium atlas shipped, reuse regular)
  {
    type: "msdf" as const,
    fontFamily: "NotoSans500",
    atlasDataUrl: "fonts/NotoSans-Regular.msdf.json",
    atlasUrl: "fonts/NotoSans-Regular.msdf.png",
    metrics: NOTO_METRICS,
  },
  // Bold (weight 700) → "NotoSans700"
  {
    type: "msdf" as const,
    fontFamily: "NotoSans700",
    atlasDataUrl: "fonts/NotoSans-Bold.msdf.json",
    atlasUrl: "fonts/NotoSans-Bold.msdf.png",
    metrics: NOTO_METRICS,
  },
  // Canvas fallback (native browser shaping for glyphs outside the SDF atlas).
  {
    fontFamily: "NotoSans",
    fontUrl: "fonts/NotoSans-Regular.ttf",
    metrics: NOTO_METRICS,
  },
  {
    fontFamily: "NotoSans700",
    fontUrl: "fonts/NotoSans-Bold.ttf",
    metrics: NOTO_METRICS,
  },
];

export default fonts;
