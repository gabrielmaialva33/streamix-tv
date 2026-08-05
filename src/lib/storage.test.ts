import { beforeEach, describe, expect, it } from "vitest";
import { favorites, history } from "./storage";

beforeEach(() => localStorage.clear());

describe("local account storage", () => {
  it("matches numeric API ids with string route ids", () => {
    favorites.add({ id: 42, type: "movie", title: "Movie" });
    expect(favorites.isFavorite("42", "movie")).toBe(true);

    history.update({
      id: 7,
      type: "series",
      title: "Show",
      progress: 10,
      currentTime: 60,
      duration: 600,
      episodeId: "7",
    });
    expect(history.getProgress("7", "series", "7")?.title).toBe("Show");
  });

  it("merges newer server progress without overwriting newer local progress", () => {
    history.mergeRemote([
      {
        id: "11",
        type: "movie",
        title: "Remote Movie",
        progress: 50,
        currentTime: 300,
        duration: 600,
        watchedAt: 200,
      },
    ]);
    history.mergeRemote([
      {
        id: 11,
        type: "movie",
        title: "Older Server Copy",
        progress: 20,
        currentTime: 120,
        duration: 600,
        watchedAt: 100,
      },
    ]);

    expect(history.getProgress(11, "movie")).toMatchObject({
      title: "Remote Movie",
      progress: 50,
      currentTime: 300,
    });
  });
});
