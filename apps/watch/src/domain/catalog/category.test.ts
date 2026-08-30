import { describe, expect, it } from "vitest";
import { createWatchRepository } from "../../data/watchRepository";
import { categoryForTitle, partitionByCategory } from "./category";

describe("exclusive watch categories", () => {
  it("maps every production kind to exactly one user category", () => {
    expect(categoryForTitle({ productionKind: "animated-feature" })).toBe("cartoons");
    expect(categoryForTitle({ productionKind: "animated-short" })).toBe("cartoons");
    expect(categoryForTitle({ productionKind: "animated-series" })).toBe("animated-series");
    expect(categoryForTitle({ productionKind: "movie" })).toBe("movies");
    expect(categoryForTitle({ productionKind: "documentary" })).toBe("movies");
    expect(categoryForTitle({ productionKind: "short-film" })).toBe("movies");
    expect(categoryForTitle({ productionKind: "series" })).toBe("series");
  });

  it("partitions the complete catalog without intersections or losses", async () => {
    const repository = await createWatchRepository();
    const all = [
      ...await repository.getAnimationMovies(),
      ...await repository.getAnimationSeries(),
      ...await repository.getMovies(),
      ...await repository.getSeries(),
    ];
    const groups = partitionByCategory(all);
    const memberships = new Map<string, number>();
    for (const items of Object.values(groups)) {
      for (const item of items) memberships.set(item.id, (memberships.get(item.id) ?? 0) + 1);
    }
    expect(groups.cartoons).toHaveLength(647);
    expect(groups["animated-series"]).toHaveLength(590);
    expect(groups.movies).toHaveLength(658);
    expect(groups.series).toHaveLength(37);
    expect([...memberships.values()].every((count) => count === 1)).toBe(true);
    expect(memberships.size).toBe(1932);
  });

  it("classifies Dream Productions as an animated series only", async () => {
    const repository = await createWatchRepository();
    const animatedSeries = await repository.getAnimationSeries();
    const series = await repository.getSeries();
    const dreamProductions = animatedSeries.find((title) => title.title === "Студия сновидений" && title.year === 2024);

    expect(dreamProductions?.productionKind).toBe("animated-series");
    expect(series.some((title) => title.id === dreamProductions?.id)).toBe(false);
  });
});
