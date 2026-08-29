import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "../components/AppHeader";
import { createWatchRepository } from "../data/watchRepository";
import type { FilterDictionary, WatchTitle } from "../domain/catalog/types";
import { useFavorites } from "../hooks/useFavorites";
import { CatalogPage } from "../pages/CatalogPage";
import { DetailPage } from "../pages/DetailPage";
import { FavoritesPage } from "../pages/FavoritesPage";
import { HomePage } from "../pages/HomePage";
import { SeriesPage } from "../pages/SeriesPage";
import { CollectionsPage, NotFoundPage, RecommendPage } from "../pages/PlaceholderPages";
import { resolveRoute } from "./routes";
import { shouldResetScroll } from "./navigation";

interface AppData {
  titles: WatchTitle[];
  animationMovies: WatchTitle[];
  animationSeries: WatchTitle[];
  movies: WatchTitle[];
  series: WatchTitle[];
  cartoonDictionary: FilterDictionary;
  movieDictionary: FilterDictionary;
}

const currentLocation = () => `${window.location.pathname}${window.location.search}`;

export function App() {
  const [location, setLocation] = useState(currentLocation);
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { favorites, toggleFavorite } = useFavorites();

  const load = useCallback(() => {
    setError(null);
    setData(null);
    createWatchRepository().then(async (repository) => {
      const [animationMovies, animationSeries, movies, series, cartoonDictionary, movieDictionary] = await Promise.all([
        repository.getAnimationMovies(),
        repository.getAnimationSeries(),
        repository.getMovies(),
        repository.getSeries(),
        repository.getFilterDictionary("cartoon", ["animated-feature", "animated-short"]),
        repository.getFilterDictionary("movie", ["movie", "documentary", "short-film"]),
      ]);
      setData({ titles: [...animationMovies, ...animationSeries, ...movies, ...series], animationMovies, animationSeries, movies, series, cartoonDictionary, movieDictionary });
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Не удалось загрузить каталог"));
  }, []);

  useEffect(load, [load]);
  useEffect(() => {
    const onPopState = () => setLocation(currentLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (href: string) => {
    const previousPathname = window.location.pathname;
    const next = new URL(href, window.location.origin);
    window.history.pushState({}, "", `${next.pathname}${next.search}`);
    setLocation(currentLocation());
    if (shouldResetScroll(previousPathname, next.pathname)) {
      window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  };

  const url = new URL(location, window.location.origin);
  const route = resolveRoute(url.pathname);
  let page;
  if (error) page = <div className="page narrow"><p className="eyebrow">Ошибка каталога</p><h1>Не удалось загрузить данные</h1><p>{error}</p><button type="button" className="primary-button" onClick={load}>Попробовать снова</button></div>;
  else if (!data) page = <div className="page" role="status" aria-live="polite"><p className="eyebrow">Загрузка</p><h1>Готовим каталог…</h1><div className="skeleton-grid">{[1, 2, 3].map((value) => <div key={value} className="skeleton" />)}</div></div>;
  else {
    const common = { favorites, toggleFavorite, navigate };
    switch (route.kind) {
      case "home": page = <HomePage titles={data.titles} {...common} />; break;
      case "cartoons": page = <CatalogPage contentType="cartoon" section="cartoons" titles={data.animationMovies} dictionary={data.cartoonDictionary} search={url.search} {...common} />; break;
      case "animated-series": page = <SeriesPage seriesKind="animated-series" titles={data.animationSeries} search={url.search} {...common} />; break;
      case "movies": page = <CatalogPage contentType="movie" section="movies" titles={data.movies} dictionary={data.movieDictionary} search={url.search} {...common} />; break;
      case "series": page = <SeriesPage seriesKind="series" titles={data.series} search={url.search} {...common} />; break;
      case "cartoon-detail": page = <DetailPage slug={route.slug} expectedKinds={["animated-feature", "animated-short"]} catalogHref="/cartoons" titles={data.titles} {...common} />; break;
      case "animated-series-detail": page = <DetailPage slug={route.slug} expectedKinds={["animated-series"]} catalogHref="/animated-series" titles={data.titles} {...common} />; break;
      case "movie-detail": page = <DetailPage slug={route.slug} expectedKinds={["movie", "documentary", "short-film"]} catalogHref="/movies" titles={data.titles} {...common} />; break;
      case "series-detail": page = <DetailPage slug={route.slug} expectedKinds={["series"]} catalogHref="/series" titles={data.titles} {...common} />; break;
      case "favorites": page = <FavoritesPage titles={data.titles} {...common} />; break;
      case "collections": page = <CollectionsPage titles={data.titles} {...common} />; break;
      case "collection-detail": page = <CollectionsPage slug={route.slug} titles={data.titles} {...common} />; break;
      case "recommend": page = <RecommendPage navigate={navigate} />; break;
      default: page = <NotFoundPage navigate={navigate} />;
    }
  }

  return <>
    <AppHeader pathname={url.pathname} navigate={navigate} favoriteCount={favorites.length} />
    <main id="main-content">{page}</main>
    <footer className="app-footer"><img src="/nen-logo.png" alt="НЭН" /><div><strong>Смотрим вместе</strong><span>Фильмы, мультфильмы и сериалы для семейного просмотра</span></div></footer>
  </>;
}
