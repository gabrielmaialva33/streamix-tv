// Lightning 3 loads font atlases via XHR at runtime, including on Tizen file:// builds.
// Paths stay relative to index.html.
//
// NotoSans MSDF atlases cover accented latin characters. The runtime family name
// remains "Roboto" to avoid touching the existing component tree.
const basePath = "./";

const sdf = (weight: number | "bold" | "normal", file: string) =>
  ({
    type: "msdf",
    fontFamily: "Roboto",
    descriptors: { weight },
    atlasDataUrl: `${basePath}fonts/${file}.msdf.json`,
    atlasUrl: `${basePath}fonts/${file}.msdf.png`,
  }) as const;

// Canvas fallback uses native TTF files.
const web = (weight: number | "bold" | "normal", file: string) =>
  ({
    fontFamily: "Roboto",
    descriptors: { weight },
    fontUrl: `${basePath}fonts/${file}.ttf`,
  }) as const;

export default [
  // SDF atlases with full latin coverage.
  sdf(300, "NotoSans-Regular"),
  sdf(400, "NotoSans-Regular"),
  sdf(500, "NotoSans-Regular"),
  sdf(700, "NotoSans-Bold"),
  sdf("normal", "NotoSans-Regular"),
  sdf("bold", "NotoSans-Bold"),
  // Canvas fallback via the existing Roboto TTF files.
  web(300, "Roboto-Light"),
  web(400, "Roboto-Regular"),
  web(500, "Roboto-Medium"),
  web(700, "Roboto-Bold"),
  web("normal", "Roboto-Regular"),
  web("bold", "Roboto-Bold"),
];
