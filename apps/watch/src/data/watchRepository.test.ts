import { describe, expect, it } from "vitest";
import { CatalogValidationError, createWatchRepository } from "./watchRepository";
import { StaticWatchDataSource } from "./watchDataSource";

describe("watch repository", () => {
  it("keeps all four user-facing formats in separate queries", async () => {
    const repository = await createWatchRepository();
    expect(await repository.getAnimationMovies()).toHaveLength(647);
    expect(await repository.getAnimationSeries()).toHaveLength(590);
    expect(await repository.getMovies()).toHaveLength(658);
    expect(await repository.getSeries()).toHaveLength(37);
  });

  it("finds by slug and returns null for an unknown slug", async () => {
    const repository = await createWatchRepository();
    expect((await repository.getBySlug("moy-sosed-totoro"))?.contentType).toBe("cartoon");
    expect(await repository.getBySlug("missing")).toBeNull();
  });

  it("returns requested ids in request order and skips unknown ids", async () => {
    const repository = await createWatchRepository();
    const items = await repository.getByIds(["nen-041", "missing", "nen-026"]);
    expect(items.map((item) => item.id)).toEqual(["nen-041", "nen-026"]);
  });

  it("does not expose demo or test records from the production data source", async () => {
    const repository = await createWatchRepository();
    const items = [...await repository.getAnimationMovies(), ...await repository.getAnimationSeries(), ...await repository.getMovies(), ...await repository.getSeries()];
    const serviceMarker = /(?:^|[-_])(demo|test|sample)(?:[-_]|$)|демонстрацион|тестов/iu;
    expect(items).toHaveLength(1932);
    expect(items.every((item) => /^https?:\/\//.test(item.frame?.url ?? ""))).toBe(true);
    expect(items.some((item) => serviceMarker.test([
      item.id, item.slug, item.title, item.shortDescription, item.whyRecommended, item.nenAgeRecommendation.rationale,
    ].join(" ")))).toBe(false);
  });

  it("keeps animated series out of cartoons and ordinary series", async () => {
    const repository = await createWatchRepository();
    expect((await repository.getAnimationMovies()).every((item) => item.productionKind !== "animated-series")).toBe(true);
    expect((await repository.getAnimationSeries()).every((item) => item.productionKind === "animated-series")).toBe(true);
    expect((await repository.getSeries()).every((item) => item.productionKind === "series")).toBe(true);
  });

  it("pins Alice adaptations to the correct format and version-safe frame", async () => {
    const repository = await createWatchRepository();
    const disney = await repository.getBySlug("alisa-v-strane-chudes");
    const lookingGlass = await repository.getBySlug("wikidata-q2646975");
    expect(disney?.productionKind).toBe("animated-feature");
    expect(disney?.frame?.url).toContain("disneyanimation.com/uploads/films/alice-in-wonderland/");
    expect(lookingGlass).toBeNull();
  });

  it("builds filter dictionaries for one content type", async () => {
    const repository = await createWatchRepository();
    const dictionary = await repository.getFilterDictionary("movie");
    expect(dictionary.contentFormats).toEqual(["documentary", "fiction", "series"]);
    expect(dictionary.themes).toContain("семья");
    expect(dictionary.contentFormats).not.toContain("animated-feature");
  });

  it("refuses to initialize from invalid data", async () => {
    await expect(createWatchRepository(new StaticWatchDataSource([{ id: "broken" }]))).rejects.toBeInstanceOf(CatalogValidationError);
  });
});
