import { describe, expect, it } from "vitest";
import { catalogRouteWithProvider, parsePositiveCatalogId } from "./catalogFilters";

describe("catalog filter URL helpers", () => {
  it("accepts only positive integer identifiers", () => {
    expect(parsePositiveCatalogId("12")).toBe(12);
    expect(parsePositiveCatalogId("0")).toBeUndefined();
    expect(parsePositiveCatalogId("2.5")).toBeUndefined();
    expect(parsePositiveCatalogId("12x")).toBeUndefined();
    expect(parsePositiveCatalogId(["12"])).toBeUndefined();
  });

  it("carries only the provider when switching catalog tabs", () => {
    expect(catalogRouteWithProvider("/series", 4)).toBe("/series?provider=4");
    expect(catalogRouteWithProvider("/channels")).toBe("/channels");
  });
});
