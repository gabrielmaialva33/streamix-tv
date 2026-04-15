// SDF + Canvas font registration for Lightning 3.
//
// Family name MUST match `Config.fontSettings.fontFamily` in
// `devices/common/index.ts` (currently "NotoSans"). Otherwise Lightning's
// TrFontManager.resolveFontFace returns undefined and Text nodes render empty.
//
// descriptors MUST include weight AND style/stretch — resolveFontToUse
// compares all three for exact match. Missing style/stretch on a face with
// style:"normal" from props → no match, glyph missing on screen (this is
// what caused bold texts to disappear before).

const NOTO_METRICS = {
  ascender: 1069,
  descender: -293,
  lineGap: 0,
  unitsPerEm: 1000,
} as const;

const baseDescriptors = { style: "normal", stretch: "normal" } as const;

const fonts = [
  // SDF atlases.
  {
    type: "msdf",
    fontFamily: "NotoSans",
    descriptors: { ...baseDescriptors, weight: 300 },
    atlasDataUrl: "fonts/NotoSans-Regular.msdf.json",
    atlasUrl: "fonts/NotoSans-Regular.msdf.png",
    metrics: NOTO_METRICS,
  },
  {
    type: "msdf",
    fontFamily: "NotoSans",
    descriptors: { ...baseDescriptors, weight: 400 },
    atlasDataUrl: "fonts/NotoSans-Regular.msdf.json",
    atlasUrl: "fonts/NotoSans-Regular.msdf.png",
    metrics: NOTO_METRICS,
  },
  {
    type: "msdf",
    fontFamily: "NotoSans",
    descriptors: { ...baseDescriptors, weight: 500 },
    atlasDataUrl: "fonts/NotoSans-Regular.msdf.json",
    atlasUrl: "fonts/NotoSans-Regular.msdf.png",
    metrics: NOTO_METRICS,
  },
  {
    type: "msdf",
    fontFamily: "NotoSans",
    descriptors: { ...baseDescriptors, weight: 700 },
    atlasDataUrl: "fonts/NotoSans-Bold.msdf.json",
    atlasUrl: "fonts/NotoSans-Bold.msdf.png",
    metrics: NOTO_METRICS,
  },
  // Canvas fallback (native browser shaping — full Unicode).
  {
    fontFamily: "NotoSans",
    descriptors: { ...baseDescriptors, weight: 400 },
    fontUrl: "fonts/NotoSans-Regular.ttf",
    metrics: NOTO_METRICS,
  },
  {
    fontFamily: "NotoSans",
    descriptors: { ...baseDescriptors, weight: 700 },
    fontUrl: "fonts/NotoSans-Bold.ttf",
    metrics: NOTO_METRICS,
  },
] as const;

export default fonts;
