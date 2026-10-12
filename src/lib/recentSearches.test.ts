import { beforeEach, describe, expect, it } from "vitest";
import { recentSearches } from "./storage";

beforeEach(() => {
  localStorage.clear();
});

describe("recentSearches", () => {
  it("keeps the newest query first", () => {
    recentSearches.remember("matrix");
    recentSearches.remember("duna");
    expect(recentSearches.getAll()).toEqual(["duna", "matrix"]);
  });

  it("promotes a repeat instead of duplicating it", () => {
    recentSearches.remember("matrix");
    recentSearches.remember("duna");
    recentSearches.remember("matrix");
    expect(recentSearches.getAll()).toEqual(["matrix", "duna"]);
  });

  it("matches case-insensitively, so MATRIX does not become a second entry", () => {
    recentSearches.remember("matrix");
    recentSearches.remember("MATRIX");
    expect(recentSearches.getAll()).toEqual(["MATRIX"]);
  });

  it("ignores a query too short to be worth replaying", () => {
    // The search itself only fires from two characters.
    recentSearches.remember("a");
    recentSearches.remember("  ");
    expect(recentSearches.getAll()).toEqual([]);
  });

  it("caps the list so it cannot grow for the life of the install", () => {
    for (let i = 0; i < 20; i += 1) recentSearches.remember(`busca ${i}`);
    expect(recentSearches.getAll()).toHaveLength(8);
    expect(recentSearches.getAll()[0]).toBe("busca 19");
  });
});
