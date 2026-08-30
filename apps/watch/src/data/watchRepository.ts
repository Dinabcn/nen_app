import type { Cartoon, ContentType, FilterDictionary, Movie, WatchTitle } from "../domain/catalog/types";
import { isCartoon, validateCatalog, type ValidationIssue } from "../domain/catalog/validation";
import { belongsToCategory } from "../domain/catalog/category";
import { StaticWatchDataSource, type WatchDataSource } from "./watchDataSource";

export class CatalogValidationError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super(`Watch catalog contains ${issues.length} validation issue(s)`);
    this.name = "CatalogValidationError";
  }
}

export interface WatchRepository {
  getAnimationMovies(): Promise<Cartoon[]>;
  getAnimationSeries(): Promise<Cartoon[]>;
  getMovies(): Promise<Movie[]>;
  getSeries(): Promise<Movie[]>;
  getBySlug(slug: string): Promise<WatchTitle | null>;
  getByIds(ids: readonly string[]): Promise<WatchTitle[]>;
  getFilterDictionary(contentType: ContentType, productionKinds?: readonly WatchTitle["productionKind"][]): Promise<FilterDictionary>;
}

const uniqueStrings = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b, "ru"));

export class InMemoryWatchRepository implements WatchRepository {
  private constructor(private readonly items: WatchTitle[]) {}

  static async create(dataSource: WatchDataSource): Promise<InMemoryWatchRepository> {
    const result = validateCatalog(await dataSource.load());
    if (result.issues.length) throw new CatalogValidationError(result.issues);
    return new InMemoryWatchRepository(result.items);
  }

  async getAnimationMovies() {
    return this.items.filter((item): item is Cartoon => isCartoon(item) && belongsToCategory(item, "cartoons"));
  }

  async getAnimationSeries() {
    return this.items.filter((item): item is Cartoon => isCartoon(item) && belongsToCategory(item, "animated-series"));
  }

  async getMovies() {
    return this.items.filter((item): item is Movie => item.contentType === "movie" && belongsToCategory(item, "movies"));
  }

  async getSeries() {
    return this.items.filter((item): item is Movie => item.contentType === "movie" && belongsToCategory(item, "series"));
  }

  async getBySlug(slug: string) {
    return this.items.find((item) => item.slug === slug) ?? null;
  }

  async getByIds(ids: readonly string[]) {
    const byId = new Map(this.items.map((item) => [item.id, item]));
    return ids.map((id) => byId.get(id)).filter((item): item is WatchTitle => Boolean(item));
  }

  async getFilterDictionary(contentType: ContentType, productionKinds?: readonly WatchTitle["productionKind"][]): Promise<FilterDictionary> {
    const items = this.items.filter((item) => item.contentType === contentType && (!productionKinds || productionKinds.includes(item.productionKind)));
    return {
      countries: uniqueStrings(items.flatMap((item) => item.country)),
      contentFormats: uniqueStrings(items.map((item) => item.contentFormat)) as FilterDictionary["contentFormats"],
      moods: uniqueStrings(items.flatMap((item) => item.mood)) as FilterDictionary["moods"],
      themes: uniqueStrings(items.flatMap((item) => item.themes)),
      sensitiveTopics: uniqueStrings(items.flatMap((item) => item.sensitiveTopics)),
      releaseForms: uniqueStrings(items.map((item) => item.releaseForm)) as FilterDictionary["releaseForms"],
    };
  }
}

export function createWatchRepository(dataSource: WatchDataSource = new StaticWatchDataSource()) {
  return InMemoryWatchRepository.create(dataSource);
}
