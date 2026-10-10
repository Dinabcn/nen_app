import { describe, expect, it } from "vitest";
import { createWatchRepository } from "../data/watchRepository";
import { resolveDetailTitle } from "./DetailPage";

describe("legacy detail links", () => {
  it("keeps an old movies URL resolvable after a title moves to cartoons", async () => {
    const repository = await createWatchRepository();
    const titles = [
      ...await repository.getAnimationMovies(),
      ...await repository.getAnimationSeries(),
      ...await repository.getMovies(),
      ...await repository.getSeries(),
    ];

    const title = resolveDetailTitle(titles, "wikidata-q920740", ["movie", "documentary", "short-film"]);
    expect(title?.productionKind).toBe("animated-short");
  });
});
