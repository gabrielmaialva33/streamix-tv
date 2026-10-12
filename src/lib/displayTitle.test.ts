import { describe, expect, it } from "vitest";
import { displayTitle } from "./displayTitle";

describe("displayTitle", () => {
  // Copied from the movie grid as it renders on the TV emulator.
  const fromTheCatalogue: Array<[string, string]> = [
    ["200 MPH - Acima dos Limites 2011 BDRip 720p DUAL", "200 MPH - Acima dos Limites"],
    ["10000 Anos Depois 2017 1080p BluRay x264 DUAL", "10000 Anos Depois"],
    ["1 Contra Todos O Filme (2017) 720p", "1 Contra Todos O Filme"],
    ["101 Dálmatas (1) 1961 Dublado 720p", "101 Dálmatas (1)"],
    ["100 Coisas para Fazer Antes de Virar Zumbi 4K [Hybrid]", "100 Coisas para Fazer Antes de Virar Zumbi"],
    ["1 - Harry Potter E A Pedra Filosofal 4K", "1 - Harry Potter E A Pedra Filosofal"],
    ["1 Bordadeira [LEG]", "1 Bordadeira"],
    ["10 Anos de Mentira [LEG]", "10 Anos de Mentira"],
    ["100 Percent Wolf [L]", "100 Percent Wolf"],
    ["12 Horas para Sobreviver O Ano da Eleição [L]", "12 Horas para Sobreviver O Ano da Eleição"],
    ["A Bright Lawyer REPACK", "A Bright Lawyer"],
  ];

  for (const [raw, expected] of fromTheCatalogue) {
    it(`cleans ${JSON.stringify(raw)}`, () => {
      expect(displayTitle(raw)).toBe(expected);
    });
  }

  // The rule has to be conservative: a wrong cut turns a real title into a
  // wrong one, which is worse than leaving the noise in.
  it("keeps a title that is only a year", () => {
    expect(displayTitle("1917")).toBe("1917");
  });

  it("keeps a year that belongs to the title", () => {
    expect(displayTitle("Blade Runner 2049")).toBe("Blade Runner 2049");
    expect(displayTitle("2001: Uma Odisseia no Espaço")).toBe("2001: Uma Odisseia no Espaço");
  });

  it("keeps a parenthesised year when nothing technical follows it", () => {
    expect(displayTitle("Queria Você Aqui (2025)")).toBe("Queria Você Aqui (2025)");
  });

  it("leaves a clean title alone", () => {
    expect(displayTitle("O Predador Alienígena")).toBe("O Predador Alienígena");
    expect(displayTitle("Duna: Parte Dois")).toBe("Duna: Parte Dois");
  });

  it("does not mistake words that merely contain a token", () => {
    // "Dual" inside a word, "leg" inside "Legião", "hd" inside "Shadow".
    expect(displayTitle("Legião Urbana")).toBe("Legião Urbana");
    expect(displayTitle("Shadow and Bone")).toBe("Shadow and Bone");
  });

  it("falls back to the original rather than returning nothing", () => {
    expect(displayTitle("1080p")).toBe("1080p");
    expect(displayTitle("")).toBe("");
  });
});
