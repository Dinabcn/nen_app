import { describe, expect, it } from "vitest";
import sampleCatalog from "../../../data/catalog.sample.json";
import type { WatchTitle } from "./types";
import { filterSeriesTitles } from "./series";

const titles = sampleCatalog as WatchTitle[];

describe("series catalog", () => {
  it("keeps animated series out of the live-action series section", () => {
    const animated = filterSeriesTitles(titles, { query: "", category: "all", age: null, country: "" }, "animated-series");
    const liveAction = filterSeriesTitles(titles, { query: "", category: "all", age: null, country: "" }, "series");

    expect(animated.every((title) => title.productionKind === "animated-series")).toBe(true);
    expect(liveAction.every((title) => title.productionKind === "series")).toBe(true);
    expect(animated.map((title) => title.id).filter((id) => liveAction.some((title) => title.id === id))).toEqual([]);
  });

  it("filters by localized search, age and type", () => {
    const animated = filterSeriesTitles(titles, { query: "космос", category: "animated", age: 7, country: "" }, "animated-series");
    expect(animated.map((title) => title.id)).toEqual(["demo-cartoon-space-series"]);
  });

  it("ignores invalid combinations instead of leaking standalone works", () => {
    const result = filterSeriesTitles(titles, { query: "", category: "live-action", age: 4, country: "Япония" }, "series");
    expect(result).toEqual([]);
  });

  it("never leaks standalone movies into either series section", () => {
    const animated = filterSeriesTitles(titles, { query: "", category: "all", age: null, country: "" }, "animated-series");
    const liveAction = filterSeriesTitles(titles, { query: "", category: "all", age: null, country: "" }, "series");

    expect([...animated, ...liveAction].every((title) => title.releaseForm === "series")).toBe(true);
  });
});
