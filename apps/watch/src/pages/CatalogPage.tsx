import { useMemo } from "react";
import { FilterPanel } from "../components/FilterPanel";
import { MediaCard } from "../components/MediaCard";
import type { Navigate } from "../components/Link";
import { emptyFilters, type CatalogFilters } from "../domain/catalog/filters";
import type { ContentType, FilterDictionary, WatchTitle } from "../domain/catalog/types";
import { parseFiltersFromUrl, serializeFiltersToUrl } from "../domain/catalog/url";
import { buildCatalogResult } from "../state/catalogViewModel";
import { CollectionShareButton } from "../components/ShareButton";

export function CatalogPage({ contentType, section, titles, dictionary, search, favorites, toggleFavorite, navigate }: {
  contentType: ContentType;
  section: "cartoons" | "movies";
  titles: WatchTitle[];
  dictionary: FilterDictionary;
  search: string;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  navigate: Navigate;
}) {
  const filters = useMemo(() => parseFiltersFromUrl(contentType, search), [contentType, search]);
  const state = useMemo(() => buildCatalogResult(titles, filters), [titles, filters]);
  const pathname = section === "cartoons" ? "/cartoons" : "/movies";
  const update = (next: CatalogFilters) => navigate(`${pathname}${serializeFiltersToUrl(next)}`);
  const title = section === "cartoons" ? "Мультфильмы" : "Фильмы";
  return <div className="page catalog-page">
    <header className="page-intro"><div className="section-brand"><img src="/nen-logo.png" alt="" /><span>НЭН рекомендует</span></div><p className="eyebrow">Выбор для семейного просмотра</p><h1>{title}</h1><p>{section === "cartoons" ? "Полнометражные и короткометражные мультфильмы — отдельно от эпизодических мультсериалов." : "Игровые, документальные и короткометражные фильмы, которые интересно смотреть вместе."}</p></header>
    <FilterPanel filters={filters} dictionary={dictionary} onChange={update} onReset={() => update(emptyFilters(contentType))} />
    <section className="results" aria-live="polite">
      <div className="section-heading results-heading"><div><p className="eyebrow">Результаты</p><h2>{state.kind === "exact" ? `Найдено: ${state.results.length}` : state.kind === "nearby" ? "Близкие варианты" : "Ничего безопасно не найдено"}</h2></div><CollectionShareButton sectionTitle={title} /></div>
      {state.kind === "nearby" && <div className="notice nearby"><strong>Точных совпадений нет — показываем близкие варианты</strong><p>Возраст и исключённые чувствительные темы сохранены. На карточках указано, какие остальные условия не совпали.</p></div>}
      {state.kind === "empty" && <div className="notice empty"><strong>Подходящих вариантов пока нет</strong><p>Попробуйте изменить возраст или убрать часть исключённых тем — эти условия мы не ослабляем автоматически.</p></div>}
      {state.kind !== "empty" && <div className="media-grid">{state.results.map((result) => <MediaCard key={result.title.id} title={result.title} favorite={favorites.includes(result.title.id)} toggleFavorite={toggleFavorite} navigate={navigate} matched={state.kind === "nearby" ? result.matchedConditions : []} relaxed={result.relaxedConditions} />)}</div>}
    </section>
  </div>;
}
