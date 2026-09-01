import { describe, expect, it } from "vitest";
import { readSeriesFilters, serializeSeriesFilters } from "./SeriesPage";

describe("series collection URLs", () => {
  it("restores every supported filter after sharing or refresh", () => {
    const filters = { query: "дружба", category: "animated" as const, age: 8, country: "США" };
    const search = serializeSeriesFilters(filters);
    expect(search).toBe("?q=%D0%B4%D1%80%D1%83%D0%B6%D0%B1%D0%B0&type=animated&age=8&country=%D0%A1%D0%A8%D0%90");
    expect(readSeriesFilters(search)).toEqual(filters);
  });

  it("does not leak state between different shared collections", () => {
    const first = readSeriesFilters("?q=%D0%BA%D0%BE%D1%81%D0%BC%D0%BE%D1%81&age=6");
    const second = readSeriesFilters("?country=%D0%A4%D1%80%D0%B0%D0%BD%D1%86%D0%B8%D1%8F&age=12");
    expect(first.query).toBe("космос");
    expect(first.country).toBe("");
    expect(second.query).toBe("");
    expect(second.country).toBe("Франция");
  });
});
