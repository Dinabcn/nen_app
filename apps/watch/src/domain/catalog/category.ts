import type { ProductionKind, WatchTitle } from "./types";

export type WatchCategory = "cartoons" | "animated-series" | "movies" | "series";

const categoryByKind: Record<ProductionKind, WatchCategory> = {
  "animated-feature": "cartoons",
  "animated-short": "cartoons",
  "animated-series": "animated-series",
  movie: "movies",
  documentary: "movies",
  "short-film": "movies",
  series: "series",
};

export const categoryForTitle = (title: Pick<WatchTitle, "productionKind">): WatchCategory =>
  categoryByKind[title.productionKind];

export const belongsToCategory = (title: Pick<WatchTitle, "productionKind">, category: WatchCategory) =>
  categoryForTitle(title) === category;

export const partitionByCategory = (titles: readonly WatchTitle[]): Record<WatchCategory, WatchTitle[]> => {
  const result: Record<WatchCategory, WatchTitle[]> = {
    cartoons: [],
    "animated-series": [],
    movies: [],
    series: [],
  };
  for (const title of titles) result[categoryForTitle(title)].push(title);
  return result;
};
