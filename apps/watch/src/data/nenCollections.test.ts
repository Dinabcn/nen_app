import { describe, expect, it } from "vitest";
import catalog from "../../../../data/generated/watch.json";
import { nenCollections } from "./nenCollections";

describe("NEN editorial collections", () => {
  it("use unique permanent slugs and official NEN source pages", () => {
    expect(new Set(nenCollections.map((collection) => collection.slug)).size).toBe(nenCollections.length);
    expect(nenCollections).toHaveLength(11);
    expect(nenCollections.every((collection) => collection.sourceUrl.startsWith("https://n-e-n.ru/"))).toBe(true);
  });

  it("only reference exact titles already present in the catalog", () => {
    const catalogSlugs = new Set(catalog.map((title) => title.slug));
    const referenced = nenCollections.flatMap((collection) => collection.slugs);
    expect(referenced.every((slug) => catalogSlugs.has(slug))).toBe(true);
  });
});
