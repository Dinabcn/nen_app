import type { WatchTitle } from "./types";
import { belongsToCategory, type WatchCategory } from "./category";

export type SeriesCategory = "all" | "live-action" | "animated" | "documentary" | "educational";

export interface SeriesCatalogFilters {
  query: string;
  category: SeriesCategory;
  age: number | null;
  country: string;
}

type SeriesSection = Extract<WatchCategory, "animated-series" | "series">;

export const isSeriesTitle = (title: WatchTitle, section: SeriesSection) =>
  title.releaseForm === "series" && belongsToCategory(title, section);

export function filterSeriesTitles(titles: readonly WatchTitle[], filters: SeriesCatalogFilters, section: SeriesSection): WatchTitle[] {
  const query = filters.query.trim().toLocaleLowerCase("ru");
  return titles.filter((title) => {
    if (!isSeriesTitle(title, section)) return false;
    if (filters.category === "animated" && title.productionKind !== "animated-series") return false;
    if (filters.category === "live-action" && title.productionKind !== "series") return false;
    if (filters.category === "documentary" && !title.genres.includes("документальный")) return false;
    if (filters.category === "educational" && !title.genres.includes("образовательный")) return false;
    if (filters.age !== null && (
      filters.age < title.nenAgeRecommendation.minAge
      || (title.nenAgeRecommendation.maxAge !== undefined && filters.age > title.nenAgeRecommendation.maxAge)
    )) return false;
    if (filters.country && !title.country.includes(filters.country)) return false;
    if (query) {
      const searchable = [
        title.title,
        title.originalTitle,
        title.shortDescription,
        ...title.themes,
        ...title.genres,
      ].filter(Boolean).join(" ").toLocaleLowerCase("ru");
      if (!searchable.includes(query)) return false;
    }
    return true;
  }).sort((left, right) => left.title.localeCompare(right.title, "ru") || left.year - right.year);
}
