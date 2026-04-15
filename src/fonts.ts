// Lightning 3 carrega os atlases via XHR em runtime (file:// funciona em Tizen).
// Path relativo ao index.html — "./".
//
// Usamos NotoSans em vez de Roboto porque os atlases MSDF do Roboto foram
// gerados com charset ASCII puro (sem acentos). NotoSans-Bold/Regular tem
// o charset latin completo (190 chars), incluindo áéíóúâêôãõç.
// O fontFamily continua "Roboto" pra nao ter que mudar o JSX inteiro.
const basePath = "./";

const sdf = (weight: number | "bold" | "normal", file: string) =>
  ({
    type: "msdf",
    fontFamily: "Roboto",
    descriptors: { weight },
    atlasDataUrl: `${basePath}fonts/${file}.msdf.json`,
    atlasUrl: `${basePath}fonts/${file}.msdf.png`,
  }) as const;

// Web/Canvas fallback — usa TTF nativo via Canvas renderer.
const web = (weight: number | "bold" | "normal", file: string) =>
  ({
    fontFamily: "Roboto",
    descriptors: { weight },
    fontUrl: `${basePath}fonts/${file}.ttf`,
  }) as const;

export default [
  // SDF atlases (NotoSans tem todos acentos latin)
  sdf(300, "NotoSans-Regular"),
  sdf(400, "NotoSans-Regular"),
  sdf(500, "NotoSans-Regular"),
  sdf(700, "NotoSans-Bold"),
  sdf("normal", "NotoSans-Regular"),
  sdf("bold", "NotoSans-Bold"),
  // TTF fallback via Canvas (Roboto TTFs, que ja existem em public/fonts)
  web(300, "Roboto-Light"),
  web(400, "Roboto-Regular"),
  web(500, "Roboto-Medium"),
  web(700, "Roboto-Bold"),
  web("normal", "Roboto-Regular"),
  web("bold", "Roboto-Bold"),
];
