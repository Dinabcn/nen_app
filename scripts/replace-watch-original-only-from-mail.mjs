import fs from "node:fs/promises";

const sourcePath = "data/source/watch-v2.json";
const mailReportPath = "data/reports/watch-mail-catalog-comparison.json";
const mailCachePath = "data/reports/cache/watch-mail-source.json";
const russianResearchPath = "data/reports/cache/watch-russian-title-research.json";
const coverCachePath = "data/reports/cache/watch-mail-cover-verification.json";
const apply = process.argv.includes("--apply");
const verifyCovers = process.argv.includes("--verify-covers");
const appendArgument = process.argv.find((value) => value.startsWith("--append="));
const appendCount = appendArgument ? Number(appendArgument.split("=")[1]) : 0;
const reportPath = appendCount
  ? `data/reports/watch-mail-expansion-${appendCount}.json`
  : "data/reports/watch-mail-replacement.json";

const readJson = async (file, fallback) => fs.readFile(file, "utf8").then(JSON.parse).catch(() => fallback);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value) => String(value ?? "").toLocaleLowerCase("ru").normalize("NFKD")
  .replace(/\p{M}/gu, "").replace(/ё/gu, "е").replace(/[«»„“”"'’`]/gu, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const hasCyrillic = (value) => /[А-ЯЁа-яё]/u.test(String(value ?? ""));
const minutes = (value) => {
  const match = String(value ?? "").match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/u);
  return match ? (Number(match[1] ?? 0) * 60) + Number(match[2] ?? 0) : 0;
};
const unique = (values) => [...new Set(values.filter(Boolean))];
const safeText = (value) => String(value ?? "").replace(/\s+/gu, " ").trim();
const seriesKinds = new Set(["series", "animated-series"]);

const catalog = await readJson(sourcePath, []);
const mailReport = await readJson(mailReportPath, { groups: { new: [] } });
const mailDetails = await readJson(mailCachePath, { items: [] });
const russianResearch = await readJson(russianResearchPath, {});
let coverCache = await readJson(coverCachePath, {});
const detailsByUrl = new Map(mailDetails.items.map((item) => [item.mailUrl, item]));
const removing = appendCount ? [] : catalog.filter((item) => item.titleLocalization === "original-only");
const retained = appendCount ? catalog : catalog.filter((item) => item.titleLocalization !== "original-only");
if (!appendCount && removing.length !== 377) throw new Error(`Ожидалось 377 original-only, найдено ${removing.length}`);
if (appendCount && (!Number.isInteger(appendCount) || appendCount < 1)) throw new Error("--append должен быть положительным целым числом");

const retainedIds = new Set(retained.map((item) => item.id));
const retainedSlugs = new Set(retained.map((item) => item.slug));
const retainedTitleYears = new Set(retained.map((item) => `${normalize(item.title)}|${item.year}`));
const retainedOriginalYears = new Set(retained.map((item) => `${normalize(item.originalTitle)}|${item.year}`));
const retainedExternal = new Set(retained.flatMap((item) => {
  const ids = russianResearch[item.id]?.identifiers ?? {};
  return [ids.kinopoisk && `kp:${ids.kinopoisk}`, ids.tmdbMovie && `tmdbm:${ids.tmdbMovie}`,
    ids.tmdbTv && `tmdbt:${ids.tmdbTv}`, ids.imdb && `imdb:${ids.imdb}`, ids.wikidata && `wd:${ids.wikidata}`].filter(Boolean);
}));

const blockedContent = /(?:^|\b)(?:ужас(?:ы|ов)?|хоррор|слэшер|зомби-хоррор|эротик|порно|проституц|сексуальн(?:ое|ая) насили|маньяк|серийн\w* убийц)(?:\b|$)/iu;
const genreMap = new Map([
  ["семейный", "семейный"], ["комедия", "комедия"], ["драма", "драма"],
  ["приключения", "приключения"], ["фэнтези", "фэнтези"], ["фантастика", "фантастика"],
  ["детектив", "детектив"], ["мюзикл", "мюзикл"], ["мелодрама", "мелодрама"],
  ["исторический", "исторический"], ["биография", "биографический"], ["спорт", "спортивный"],
  ["триллер", "триллер"], ["документальный", "документальный"], ["короткометражка", "короткометражный"],
]);

function kindFor(item, duration) {
  const joined = item.genres.map(normalize).join(" ");
  const animated = /мульт|анимац/u.test(joined);
  const documentary = /документ/u.test(joined);
  if (item.sourceType === "series") return animated ? "animated-series" : "series";
  if (documentary) return "documentary";
  if (animated) return duration <= 40 ? "animated-short" : "animated-feature";
  return duration <= 40 ? "short-film" : "movie";
}

function genresFor(item, kind) {
  const mapped = item.genres.map((genre) => genreMap.get(normalize(genre))).filter(Boolean);
  if (kind === "documentary") mapped.push("документальный");
  if (kind === "short-film" || kind === "animated-short") mapped.push("короткометражный");
  if (!mapped.length) mapped.push(kind.startsWith("animated") ? "семейный" : "драма");
  return unique(mapped).slice(0, 5);
}

function themesFor(item) {
  const text = normalize(`${item.mailTitle} ${item.description} ${item.genres.join(" ")}`);
  const rules = [
    [/семь|родител|мам|пап/u, "семья"], [/друг|товарищ/u, "дружба"], [/школ|ученик|учител/u, "школа"],
    [/живот|собак|кош|лошад|птиц/u, "животные"], [/природ|лес|океан|море|эколог/u, "природа"],
    [/путеш|дорог|приключ/u, "путешествия"], [/волшеб|маг|сказ/u, "волшебство"], [/космос|планет/u, "космос"],
    [/наук|изобрет|исслед/u, "наука"], [/музык|песн/u, "музыка"], [/спорт|футбол|хоккей|гонк/u, "спорт"],
    [/истори|войн|корол/u, "история"], [/взросл|подрост/u, "взросление"], [/мечт/u, "мечты"],
    [/смел|спас|защит/u, "смелость"], [/команд/u, "командная работа"], [/выбор|решен/u, "выбор"],
  ];
  const values = rules.filter(([pattern]) => pattern.test(text)).map(([, theme]) => theme);
  if (values.length < 2) values.push("дружба", "смелость", "выбор");
  return unique(values).slice(0, 6);
}

function moodFor(item) {
  const text = normalize(`${item.description} ${item.genres.join(" ")}`);
  const values = [];
  if (/комеди|весел|юмор/u.test(text)) values.push("весёлое");
  if (/приключ|путеш|фэнтези/u.test(text)) values.push("приключенческое");
  if (/детектив|тайн|загад/u.test(text)) values.push("таинственное");
  if (/драм|утрат|войн|опас/u.test(text)) values.push("эмоциональное");
  if (/документ|наук|истори/u.test(text)) values.push("вдумчивое");
  return unique(values.length ? values : ["вдохновляющее"]);
}

function sensitiveFor(item) {
  const text = normalize(item.description);
  const rules = [[/смерт|погиб|утрат/u, "смерть и утрата"], [/войн|боев/u, "военные события"],
    [/насили|жесток/u, "насилие"], [/болезн/u, "болезнь"], [/разлук|потерял/u, "разлука"],
    [/страх|опасност/u, "пугающие и напряжённые сцены"]];
  return rules.filter(([pattern]) => pattern.test(text)).map(([, topic]) => topic);
}

function ageFor(rating) {
  return rating === "16+" ? 14 : rating === "12+" ? 10 : rating === "6+" ? 6 : 3;
}

function candidateRecord(detail) {
  const duration = minutes(detail.duration);
  const kind = kindFor(detail, duration);
  const originalTitle = safeText(detail.originalTitle) ||
    (detail.country.some((country) => /Россия|СССР/u.test(country)) ? safeText(detail.mailTitle) : "");
  const themes = themesFor(detail);
  const rating = ["0+", "6+", "12+", "16+"].includes(detail.contentRating) ? detail.contentRating : null;
  const slugPart = detail.mailUrl.match(/\/(?:movies\/\d+_|series_\d+_)([^/]+)/u)?.[1] ?? `mail-${detail.mailId}`;
  const shortDescription = safeText(detail.description);
  return {
    schemaVersion: 2,
    id: `nen-mail-${detail.mailId}`,
    slug: `mail-${detail.mailId}-${slugPart}`.toLocaleLowerCase("en").replace(/[^a-z0-9-]/gu, "-").replace(/-+/gu, "-").replace(/^-|-$/gu, ""),
    title: safeText(detail.mailTitle),
    originalTitle,
    titleLocalization: "official-ru",
    kind,
    shortDescription,
    whyRecommended: `${kind.includes("series") ? "Сериал" : "История"} подходит для совместного просмотра благодаря темам ${themes.slice(0, 3).join(", ")}, раскрытым через поступки героев.`,
    country: unique(detail.country.map(safeText)),
    year: detail.year,
    duration: seriesKinds.has(kind) ? { episodeMinutes: duration } : { minutes: duration },
    genres: genresFor(detail, kind),
    themes,
    discussionTopics: [
      `Как решения героев «${detail.mailTitle}» влияют на развитие истории?`,
      `Что в «${detail.mailTitle}» помогает понять тему «${themes[0]}»?`,
    ],
    mood: moodFor(detail),
    sensitiveTopics: sensitiveFor(detail),
    nenAgeRecommendation: {
      minAge: ageFor(rating),
      rationale: rating
        ? `Возраст выбран с учётом маркировки ${rating} на странице произведения в Кино Mail, сложности сюжета и возможных напряжённых эпизодов.`
        : "Возраст выбран с учётом сложности сюжета, длительности произведения и возможных эмоционально напряжённых эпизодов.",
    },
    ...(rating ? { officialRating: { value: rating, sourceUrl: detail.mailUrl, sourceTitle: "Кино Mail" } } : {}),
    frame: { url: detail.imageUrl, studios: ["Кино Mail"] },
  };
}

function externalKeys(detail) {
  const ids = detail.externalIds ?? {};
  return [ids.kinopoisk && `kp:${ids.kinopoisk}`, ids.tmdbMovie && `tmdbm:${ids.tmdbMovie}`,
    ids.tmdbTv && `tmdbt:${ids.tmdbTv}`, ids.imdb && `imdb:${ids.imdb}`].filter(Boolean);
}

const rejected = [];
const eligible = [];
for (const comparison of mailReport.groups.new ?? []) {
  const detail = detailsByUrl.get(comparison.mailUrl) ?? comparison;
  const duration = minutes(detail.duration);
  const reasons = [];
  if (!hasCyrillic(detail.mailTitle)) reasons.push("нет русского названия Кино Mail");
  if (!detail.year) reasons.push("нет года");
  if (!detail.country?.length) reasons.push("нет страны");
  if (!detail.imageUrl || !/^https?:\/\//u.test(detail.imageUrl)) reasons.push("нет пригодной обложки");
  if (!detail.description || safeText(detail.description).length < 40) reasons.push("нет достаточного описания");
  if (!duration) reasons.push("нет длительности");
  if (!detail.originalTitle && !detail.country?.some((country) => /Россия|СССР/u.test(country))) reasons.push("нет оригинального названия");
  if (detail.contentRating === "18+" || blockedContent.test(`${detail.mailTitle} ${detail.description} ${(detail.genres ?? []).join(" ")}`)) reasons.push("не соответствует редакционным критериям");
  const record = reasons.length ? null : candidateRecord(detail);
  if (record && (retainedIds.has(record.id) || retainedSlugs.has(record.slug)
    || retainedTitleYears.has(`${normalize(record.title)}|${record.year}`)
    || retainedOriginalYears.has(`${normalize(record.originalTitle)}|${record.year}`)
    || externalKeys(detail).some((key) => retainedExternal.has(key)))) reasons.push("дубль существующего каталога");
  if (reasons.length) rejected.push({ mailId: detail.mailId, title: detail.mailTitle, year: detail.year, reasons, url: detail.mailUrl });
  else eligible.push({ detail, record, confidence: comparison.comparison.confidence, externalKeys: externalKeys(detail) });
}

if (verifyCovers) {
  const toCheck = eligible.filter(({ detail }) => coverCache[detail.imageUrl] === undefined);
  let index = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (index < toCheck.length) {
      const current = toCheck[index++];
      try {
        const response = await fetch(current.detail.imageUrl, {
          headers: { "user-agent": "Mozilla/5.0", range: "bytes=0-1023" },
          signal: AbortSignal.timeout(15_000),
        });
        coverCache[current.detail.imageUrl] = {
          ok: response.ok && String(response.headers.get("content-type") ?? "").startsWith("image/"),
          status: response.status,
          contentType: response.headers.get("content-type"),
          checkedAt: new Date().toISOString(),
        };
      } catch (error) {
        coverCache[current.detail.imageUrl] = { ok: false, error: String(error?.message ?? error), checkedAt: new Date().toISOString() };
      }
      if (index % 50 === 0) console.log(`Проверено обложек: ${Math.min(index, toCheck.length)}/${toCheck.length}`);
      await sleep(50);
    }
  }));
  await fs.writeFile(coverCachePath, `${JSON.stringify(coverCache, null, 2)}\n`, "utf8");
}

const verified = eligible.filter(({ detail }) => coverCache[detail.imageUrl]?.ok === true);
const seenTitles = new Set();
const seenOriginals = new Set();
const seenExternal = new Set();
const deduplicated = [];
for (const candidate of verified.sort((a, b) => {
  const confidence = (value) => value === "high" ? 0 : 1;
  return confidence(a.confidence) - confidence(b.confidence)
    || (a.detail.sourceType === "movie" ? 0 : 1) - (b.detail.sourceType === "movie" ? 0 : 1)
    || a.detail.mailTitle.localeCompare(b.detail.mailTitle, "ru");
})) {
  const titleKey = `${normalize(candidate.record.title)}|${candidate.record.year}`;
  const originalKey = `${normalize(candidate.record.originalTitle)}|${candidate.record.year}`;
  if (seenTitles.has(titleKey) || seenOriginals.has(originalKey) || candidate.externalKeys.some((key) => seenExternal.has(key))) {
    rejected.push({ mailId: candidate.detail.mailId, title: candidate.detail.mailTitle, year: candidate.detail.year,
      reasons: ["дубль внутри новой партии"], url: candidate.detail.mailUrl });
    continue;
  }
  seenTitles.add(titleKey);
  seenOriginals.add(originalKey);
  candidate.externalKeys.forEach((key) => seenExternal.add(key));
  deduplicated.push(candidate);
}

const franchisePatterns = ["барби", "смешарики", "маша и медведь", "лего", "томас", "винни пух",
  "щенячий патруль", "мой маленький пони", "монстр хай", "братц", "черепашки", "скуби",
  "клуб винкс", "суперкрылья", "фиксики", "три богатыря"];
const franchiseCounts = new Map();
const diversified = deduplicated.filter(({ record }) => {
  const normalized = normalize(record.title);
  const franchise = franchisePatterns.find((pattern) => normalized.includes(pattern));
  if (!franchise) return true;
  const count = franchiseCounts.get(franchise) ?? 0;
  franchiseCounts.set(franchise, count + 1);
  return count < 3;
});
const movies = diversified.filter(({ detail }) => detail.sourceType === "movie");
const series = diversified.filter(({ detail }) => detail.sourceType === "series");
const targetCount = appendCount || 377;
const perTypeTarget = Math.floor(targetCount / 2);
const preferred = [...movies.slice(0, perTypeTarget), ...series.slice(0, perTypeTarget)];
const preferredSet = new Set(preferred);
const selected = [...preferred, ...diversified.filter((candidate) => !preferredSet.has(candidate))].slice(0, targetCount);
if (selected.length < targetCount) throw new Error(`После проверки осталось только ${selected.length} пригодных карточек из ${targetCount}`);
const reserve = diversified.filter((candidate) => !selected.includes(candidate));

const nextCatalog = [...retained, ...selected.map(({ record }) => record)];
const duplicateIds = nextCatalog.filter((item, index) => nextCatalog.findIndex((other) => other.id === item.id) !== index);
const duplicateSlugs = nextCatalog.filter((item, index) => nextCatalog.findIndex((other) => other.slug === item.slug) !== index);
if (duplicateIds.length || duplicateSlugs.length) throw new Error("После отбора найдены дубли id или slug");

const report = {
  generatedAt: new Date().toISOString(), mode: apply ? "applied" : "preliminary",
  removedOriginalOnly: removing.length, selected: selected.length,
  selectedMovies: selected.filter(({ detail }) => detail.sourceType === "movie").length,
  selectedSeries: selected.filter(({ detail }) => detail.sourceType === "series").length,
  russianTitles: selected.filter(({ record }) => hasCyrillic(record.title)).length,
  verifiedCovers: selected.filter(({ detail }) => coverCache[detail.imageUrl]?.ok).length,
  excludedEditorial: rejected.filter((item) => item.reasons.includes("не соответствует редакционным критериям")).length,
  excludedDuplicates: rejected.filter((item) => item.reasons.some((reason) => reason.includes("дубль"))).length,
  finalCatalogSize: nextCatalog.length, remainingOriginalOnly: nextCatalog.filter((item) => item.titleLocalization === "original-only").length,
  selectedItems: selected.map(({ detail, record, confidence, externalKeys: ids }) => ({
    id: record.id, title: record.title, originalTitle: record.originalTitle, year: record.year, kind: record.kind,
    mailUrl: detail.mailUrl, imageUrl: detail.imageUrl, confidence, externalIds: ids,
  })),
  reserve: reserve.map(({ detail, record, confidence }) => ({ title: record.title, originalTitle: record.originalTitle,
    year: record.year, type: detail.sourceType, confidence, mailUrl: detail.mailUrl, imageUrl: detail.imageUrl })),
  rejected,
};

if (apply) await fs.writeFile(sourcePath, `${JSON.stringify(nextCatalog, null, 2)}\n`, "utf8");
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ reportPath, ...Object.fromEntries(Object.entries(report).filter(([key]) => !["selectedItems", "reserve", "rejected"].includes(key))) }, null, 2));
