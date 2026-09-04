import { describe, expect, it } from "vitest";
import { episodeLabel } from "./contentMeta";

describe("episodeLabel", () => {
  const ep = (over: Partial<Parameters<typeof episodeLabel>[0]> = {}) => ({
    tmdb_title: null,
    title: "",
    episode_num: 1,
    number: undefined,
    ...over,
  });

  it("prefers the curated TMDB name", () => {
    // Same provenance argument as the audio track labels: TMDB names the
    // episode inside a season it curates; `title` is what a filename rendered.
    expect(episodeLabel(ep({ tmdb_title: "O Janelão", title: "A Caverna Encantada S01 E01" }))).toBe(
      "O Janelão",
    );
  });

  it("falls back to the provider title while tmdb_title is still null", () => {
    // The field ships before the backfill does, so null is the normal state.
    expect(episodeLabel(ep({ title: "A Caverna Encantada S01 E01" }))).toBe("A Caverna Encantada S01 E01");
  });

  it("numbers the episode when neither name exists", () => {
    // Two thirds of the catalog lands here, so it is the common path.
    expect(episodeLabel(ep({ episode_num: 7 }))).toBe("Episódio 7");
  });

  it("ignores whitespace-only names rather than rendering a blank card", () => {
    expect(episodeLabel(ep({ tmdb_title: "   ", title: "  ", episode_num: 3 }))).toBe("Episódio 3");
  });

  it("uses the normalised number when episode_num is absent", () => {
    expect(episodeLabel(ep({ episode_num: undefined as unknown as number, number: 4 }))).toBe("Episódio 4");
  });

  it("degrades to a bare label when there is no number either", () => {
    expect(episodeLabel(ep({ episode_num: undefined as unknown as number }))).toBe("Episódio");
  });
});
