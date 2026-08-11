import fs from "node:fs/promises";
import path from "node:path";

const sourcePath = "data/source/watch-v2.json";
const titleResearchCachePath = "data/reports/cache/watch-russian-title-research.json";
const listCachePath = "data/reports/cache/watch-mail-list-pages.json";
const detailCachePath = "data/reports/cache/watch-mail-source.json";
const reportPath = "data/reports/watch-mail-catalog-comparison.json";
const markdownPath = "data/reports/watch-mail-catalog-comparison.md";

const normalize = (value) => String(value ?? "")
  .toLocaleLowerCase("ru")
  .normalize("NFKD")
  .replace(/\p{M}/gu, "")
  .replace(/ё/gu, "е")
  .replace(/[«»„“”"'’`]/gu, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();

const readJson = async (file, fallback) => fs.readFile(file, "utf8").then(JSON.parse).catch(() => fallback);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchHtml(url, attempts = 5) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
          "accept-language": "ru-RU,ru;q=0.9,en;q=0.8",
        },
      });
      const html = await response.text();
      if (response.status === 429 || /<title[^>]*>\s*Ошибка 429/iu.test(html)) {
        await sleep(4000 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return html;
    } catch (error) {
      lastError = error;
      await sleep(2000 * (attempt + 1));
    }
  }
  throw new Error(lastError?.message ?? "источник не ответил");
}

function jsonLd(html) {
  const result = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    try {
      const value = JSON.parse(match[1]);
      result.push(...(Array.isArray(value) ? value : [value]));
    } catch {}
  }
  return result;
}

const toNames = (value) => (Array.isArray(value) ? value : value ? [value] : [])
  .map((entry) => typeof entry === "string" ? entry : entry?.name).filter(Boolean);

function extractDetail(html, raw) {
  const structured = jsonLd(html).find((value) => ["Movie", "TVSeries"].includes(value?.["@type"]));
  if (!structured) throw new Error("на странице не найдена структурированная карточка");
  const pageTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1] ?? "";
  const externalId = (pattern) => html.match(pattern)?.[1] ?? null;
  return {
    mailId: raw.mailId,
    mailTitle: structured.name ?? raw.title,
    originalTitle: structured.alternateName ?? structured.alternativeHeadline ?? null,
    year: Number(pageTitle.match(/(?:фильм|сериал)\s+(\d{4})/iu)?.[1]) || null,
    sourceType: raw.sourceType,
    mailUrl: raw.url,
    imageUrl: Array.isArray(structured.image) ? structured.image[0] : structured.image ?? null,
    country: toNames(structured.countryOfOrigin),
    directors: toNames(structured.director),
    genres: Array.isArray(structured.genre) ? structured.genre : toNames(structured.genre),
    description: structured.description ?? null,
    duration: structured.duration ?? null,
    contentRating: structured.contentRating ?? null,
    externalIds: {
      kinopoisk: externalId(/kinopoisk\.ru\/(?:film|series)\/(\d+)/iu),
      imdb: externalId(/imdb\.com\/title\/(tt\d+)/iu),
      tmdbMovie: externalId(/themoviedb\.org\/movie\/(\d+)/iu),
      tmdbTv: externalId(/themoviedb\.org\/tv\/(\d+)/iu),
    },
    provenance: {
      source: "Кино Mail",
      catalogUrl: raw.sourceType === "movie"
        ? "https://kino.mail.ru/cinema/all/detskij/"
        : "https://kino.mail.ru/series/all/detskij/",
      detailUrl: raw.url,
      mailId: raw.mailId,
      fetchedAt: new Date().toISOString(),
    },
  };
}

async function fetchMissingDetails(listCache, detailCache) {
  const byUrl = new Map((detailCache.items ?? []).filter((item) => !item.error).map((item) => [item.mailUrl, item]));
  const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
  const limit = limitArgument ? Number(limitArgument.slice("--limit=".length)) : Infinity;
  const allMissing = listCache.items.filter((item) => !byUrl.has(item.url));
  const missing = allMissing.slice(0, Number.isFinite(limit) ? limit : allMissing.length);
  let done = 0;
  for (const raw of missing) {
    try {
      byUrl.set(raw.url, extractDetail(await fetchHtml(raw.url), raw));
    } catch (error) {
      byUrl.set(raw.url, {
        ...parseListItem(raw),
        error: String(error?.message ?? error),
        provenance: { source: "Кино Mail", detailUrl: raw.url, mailId: raw.mailId, fetchedAt: new Date().toISOString() },
      });
    }
    done += 1;
    if (done % 20 === 0 || done === missing.length) {
      await fs.writeFile(detailCachePath, `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        items: [...byUrl.values()],
      }, null, 2)}\n`, "utf8");
      console.log(`Кино Mail: ${done}/${missing.length}; всего в кэше ${byUrl.size}; осталось ${allMissing.length - done}`);
    }
    await sleep(650);
  }
  return { generatedAt: new Date().toISOString(), items: [...byUrl.values()] };
}

function parseListItem(raw) {
  const cardText = String(raw.cardText ?? "").trim();
  const metadata = cardText.startsWith(raw.title) ? cardText.slice(raw.title.length).trim() : cardText;
  const parts = metadata.split(",").map((part) => part.trim()).filter(Boolean);
  const yearIndex = parts.findIndex((part) => /^(?:18|19|20)\d{2}(?:\s*[—-]\s*(?:\.\.\.|(?:18|19|20)\d{2}))?$/u.test(part));
  const year = yearIndex >= 0 ? Number(parts[yearIndex].match(/\d{4}/u)?.[0]) : null;
  const country = yearIndex > 0 ? parts.slice(0, yearIndex) : [];
  const genres = yearIndex >= 0 ? parts.slice(yearIndex + 1).filter((part) => !/^IMDb/u.test(part)) : [];
  return {
    mailId: raw.mailId,
    mailTitle: raw.title,
    originalTitle: null,
    year,
    sourceType: raw.sourceType,
    mailUrl: raw.url,
    country,
    genres,
    externalIds: {},
    provenance: {
      source: "Кино Mail",
      catalogUrl: raw.sourceType === "movie"
        ? "https://kino.mail.ru/cinema/all/detskij/"
        : "https://kino.mail.ru/series/all/detskij/",
      detailUrl: raw.url,
      mailId: raw.mailId,
      capturedAt: raw.capturedAt ?? null,
      rawCardText: cardText,
    },
  };
}

const listCache = await readJson(listCachePath, { items: [] });
if (!listCache.items?.length) throw new Error(`Нет исходного списка: ${listCachePath}`);
let detailCache = await readJson(detailCachePath, { items: [] });
if (process.argv.includes("--fetch-details")) detailCache = await fetchMissingDetails(listCache, detailCache);
const detailsByUrl = new Map((detailCache.items ?? []).map((item) => [item.mailUrl, item]));
const mailItems = listCache.items.map(parseListItem).map((item) => {
  const detail = detailsByUrl.get(item.mailUrl);
  return detail ? { ...item, ...detail, provenance: { ...item.provenance, ...detail.provenance } } : item;
});

const catalog = await readJson(sourcePath, []);
const titleResearchCache = await readJson(titleResearchCachePath, {});
const catalogIndex = catalog.map((item) => ({
  item,
  title: normalize(item.title),
  originalTitle: normalize(item.originalTitle),
  externalIds: titleResearchCache[item.id]?.identifiers ?? {},
}));

function typeCompatible(mail, watch) {
  const seriesKinds = new Set(["series", "animated-series", "documentary-series", "educational-series"]);
  return mail.sourceType === "series" ? seriesKinds.has(watch.kind) : !seriesKinds.has(watch.kind);
}

function sameYear(mail, watch) {
  return !mail.year || !watch.year || mail.year === watch.year;
}

function compare(mail) {
  const ids = mail.externalIds ?? {};
  let candidates = catalogIndex.filter(({ item, externalIds }) => {
    const external = { ...(item.externalIds ?? item.identifiers ?? {}), ...externalIds };
    return (ids.imdb && (external.imdb === ids.imdb || external.imdbId === ids.imdb))
      || (ids.kinopoisk && (external.kinopoisk === ids.kinopoisk || external.kinopoiskId === ids.kinopoisk))
      || (ids.tmdbMovie && (external.tmdbMovie === ids.tmdbMovie || external.tmdbMovieId === ids.tmdbMovie))
      || (ids.tmdbTv && (external.tmdbTv === ids.tmdbTv || external.tmdbTvId === ids.tmdbTv));
  });
  let method = candidates.length ? "exact-external-id" : null;

  if (!candidates.length) {
    const mailTitle = normalize(mail.mailTitle);
    candidates = catalogIndex.filter(({ item, title }) => title === mailTitle && sameYear(mail, item) && typeCompatible(mail, item));
    method = candidates.length ? "title+year+type" : null;
  }
  if (!candidates.length && mail.year) {
    const mailTitle = normalize(mail.mailTitle);
    candidates = catalogIndex.filter(({ item, title }) => title === mailTitle
      && Math.abs(item.year - mail.year) <= 1 && typeCompatible(mail, item));
    method = candidates.length ? "title+year±1+type" : null;
  }
  if (!candidates.length) {
    const mailTitle = normalize(mail.mailTitle);
    candidates = catalogIndex.filter(({ item, originalTitle }) => originalTitle === mailTitle && sameYear(mail, item) && typeCompatible(mail, item));
    method = candidates.length ? "mail-title=originalTitle+year+type" : null;
  }
  if (!candidates.length && mail.originalTitle) {
    const originalTitle = normalize(mail.originalTitle);
    candidates = catalogIndex.filter(({ item, originalTitle: watchOriginal }) =>
      watchOriginal === originalTitle && sameYear(mail, item) && typeCompatible(mail, item));
    method = candidates.length ? "originalTitle+year+type" : null;
  }
  if (!candidates.length && mail.originalTitle && mail.year) {
    const originalTitle = normalize(mail.originalTitle);
    candidates = catalogIndex.filter(({ item, originalTitle: watchOriginal }) =>
      watchOriginal === originalTitle && Math.abs(item.year - mail.year) <= 1 && typeCompatible(mail, item));
    method = candidates.length ? "originalTitle+year±1+type" : null;
  }

  if (candidates.length !== 1) {
    return {
      group: "new",
      confidence: candidates.length > 1 ? "needs-review" : (mail.originalTitle || Object.values(ids).some(Boolean) ? "high" : "medium"),
      method: candidates.length > 1 ? "multiple-catalog-candidates" : "no-match",
      candidateIds: candidates.map(({ item }) => item.id),
    };
  }
  const matched = candidates[0].item;
  const differentTitle = normalize(mail.mailTitle) !== normalize(matched.title);
  return {
    group: differentTitle ? "different-title" : "existing",
    confidence: "high",
    method,
    watch: {
      id: matched.id,
      slug: matched.slug,
      title: matched.title,
      originalTitle: matched.originalTitle,
      year: matched.year,
      kind: matched.kind,
    },
  };
}

const compared = mailItems.map((item) => ({ ...item, comparison: compare(item) }));
const groups = {
  existing: compared.filter((item) => item.comparison.group === "existing"),
  differentTitle: compared.filter((item) => item.comparison.group === "different-title"),
  new: compared.filter((item) => item.comparison.group === "new"),
};
const statsFor = (sourceType) => {
  const items = compared.filter((item) => item.sourceType === sourceType);
  return {
    total: items.length,
    existing: items.filter((item) => item.comparison.group === "existing").length,
    differentTitle: items.filter((item) => item.comparison.group === "different-title").length,
    new: items.filter((item) => item.comparison.group === "new").length,
    newHighConfidence: items.filter((item) => item.comparison.group === "new" && item.comparison.confidence === "high").length,
    newNeedsEnrichment: items.filter((item) => item.comparison.group === "new" && item.comparison.confidence !== "high").length,
  };
};

const report = {
  generatedAt: new Date().toISOString(),
  productionCatalogModified: false,
  sources: listCache.sources,
  matchingRules: ["exact external ID", "title + year + type", "Mail title = NEN originalTitle + year + type", "originalTitle + year + type"],
  caveat: "Карточки без originalTitle или внешнего ID помечаются medium и требуют дополнительной сверки перед импортом.",
  statistics: { movies: statsFor("movie"), series: statsFor("series") },
  totals: {
    found: compared.length,
    existing: groups.existing.length,
    differentTitle: groups.differentTitle.length,
    new: groups.new.length,
  },
  groups,
};

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const renderItem = (item) => {
  const original = item.originalTitle ? ` / ${item.originalTitle}` : "";
  const year = item.year ?? "год не указан";
  const type = item.sourceType === "movie" ? "фильм" : "сериал";
  const ids = Object.entries(item.externalIds ?? {}).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(", ") || "ID не найдены";
  return `- **${item.mailTitle}**${original} (${year}) — ${type}; [Кино Mail](${item.mailUrl}); ${ids}; сопоставление: ${item.comparison.method}; уверенность: ${item.comparison.confidence}.`;
};

const markdown = [
  "# Сравнение детского каталога Кино Mail с watch-v2",
  "",
  `Сформировано: ${report.generatedAt}`,
  "",
  "Production-каталог не изменялся.",
  "",
  "## Статистика",
  "",
  `- Фильмы: найдено ${report.statistics.movies.total}; уже есть ${report.statistics.movies.existing}; под другим названием ${report.statistics.movies.differentTitle}; новых ${report.statistics.movies.new}.`,
  `- Сериалы: найдено ${report.statistics.series.total}; уже есть ${report.statistics.series.existing}; под другим названием ${report.statistics.series.differentTitle}; новых ${report.statistics.series.new}.`,
  `- Всего новых произведений: ${report.totals.new}.`,
  "",
  `> ${report.caveat}`,
  "",
  "## A. Уже есть",
  "",
  ...groups.existing.map(renderItem),
  "",
  "## B. Есть в НЭН под другим названием",
  "",
  ...groups.differentTitle.map((item) => `${renderItem(item)} В НЭН: **${item.comparison.watch.title}** (${item.comparison.watch.id}).`),
  "",
  "## C. Новые",
  "",
  ...groups.new.map(renderItem),
  "",
  "Полный provenance и исходные поля находятся в JSON-отчёте и raw-кэше.",
  "",
].join("\n");
await fs.writeFile(markdownPath, markdown, "utf8");

console.log(JSON.stringify({ reportPath, markdownPath, statistics: report.statistics, totals: report.totals }, null, 2));
