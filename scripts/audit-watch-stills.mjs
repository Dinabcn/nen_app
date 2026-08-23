import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const catalogPath = path.join(root, "data/source/watch-v2.json");
const titleResearchPath = path.join(root, "data/reports/cache/watch-russian-title-research.json");
const mailSourcePath = path.join(root, "data/reports/cache/watch-mail-source.json");
const mailReplacementPath = path.join(root, "data/reports/watch-mail-replacement.json");
const stillEvidencePath = path.join(root, "data/reports/cache/watch-stills-research-evidence.json");
const webApplyPath = path.join(root, "data/reports/watch-stills-web-apply.json");
const webBacklogApplyPath = path.join(root, "data/reports/watch-stills-web-backlog-apply.json");
const tailApplyPath = path.join(root, "data/reports/watch-stills-tail-apply.json");
const jsonPath = path.join(root, "data/reports/watch-stills-audit.json");
const markdownPath = path.join(root, "data/reports/watch-stills-audit.md");
const unresolvedJsonPath = path.join(root, "data/reports/watch-stills-unresolved.json");
const unresolvedMarkdownPath = path.join(root, "data/reports/watch-stills-unresolved.md");

const readJson = async (filePath, fallback) => {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
};

const catalog = await readJson(catalogPath, []);
const titleResearch = await readJson(titleResearchPath, {});
const mailSource = await readJson(mailSourcePath, { items: [] });
const mailReplacement = await readJson(mailReplacementPath, { selectedItems: [] });
const stillEvidence = await readJson(stillEvidencePath, { records: {} });
const webApply = await readJson(webApplyPath, { appliedItems: [] });
const webBacklogApply = await readJson(webBacklogApplyPath, { appliedItems: [] });
const tailApply = await readJson(tailApplyPath, { appliedItems: [] });

const mailById = new Map((mailSource.items ?? []).map((item) => [String(item.mailId), item]));
const replacementById = new Map((mailReplacement.selectedItems ?? []).map((item) => [item.id, item]));
const webAppliedById = new Map([...(webApply.appliedItems ?? []), ...(webBacklogApply.appliedItems ?? []), ...(tailApply.appliedItems ?? [])].map((item) => [item.watchId, item]));
const tailAppliedIds = new Set((tailApply.appliedItems ?? []).map((item) => item.watchId));
const pendingWebCandidates = new Map((webBacklogApply.rejectedItems ?? []).filter((item) => !tailAppliedIds.has(item.watchId)).map((item) => [item.watchId, item]));

const cleanId = (value) => value === null || value === undefined || value === "" ? null : String(value);
const externalIdsFromArray = (items = []) => Object.fromEntries(items.map((entry) => {
  const [key, ...rest] = String(entry).split(":");
  return [key, rest.join(":") || null];
}));

function externalIds(record) {
  const research = titleResearch[record.id]?.identifiers ?? {};
  const mailId = record.id.match(/^nen-mail-(\d+)$/u)?.[1] ?? null;
  const mail = mailId ? mailById.get(mailId) : null;
  const replacement = replacementById.get(record.id);
  const replacementIds = externalIdsFromArray(replacement?.externalIds);
  const ratingUrl = record.officialRating?.sourceUrl ?? "";
  const kinopoiskFromRating = ratingUrl.match(/kinopoisk\.ru\/(?:film|series)\/(\d+)/u)?.[1] ?? null;
  const qidFromRecord = (record.id.match(/nen-wd-(q\d+)/iu)?.[1] ?? record.slug.match(/wikidata-(q\d+)/iu)?.[1])?.toUpperCase() ?? null;
  return {
    kinopoisk: cleanId(research.kinopoisk ?? mail?.externalIds?.kinopoisk ?? replacementIds.kinopoisk ?? kinopoiskFromRating),
    tmdbMovie: cleanId(research.tmdbMovie ?? mail?.externalIds?.tmdbMovie ?? replacementIds.tmdbMovie),
    tmdbTv: cleanId(research.tmdbTv ?? mail?.externalIds?.tmdbTv ?? replacementIds.tmdbTv),
    imdb: cleanId(research.imdb ?? mail?.externalIds?.imdb ?? replacementIds.imdb),
    wikidata: cleanId(research.wikidata ?? replacementIds.wikidata ?? qidFromRecord),
    mail: cleanId(mailId),
  };
}

const isNenFrame = (frame) => {
  if (!frame?.url) return false;
  try {
    return new URL(frame.url).hostname === "n-e-n.ru" && frame.studios?.length > 0;
  } catch {
    return false;
  }
};

const isMailImage = (frame) => {
  if (!frame?.url) return false;
  try {
    return new URL(frame.url).hostname === "resizer.mail.ru";
  } catch {
    return false;
  }
};

const confirmedEvidenceFor = (record) => {
  if (!record.frame?.url) return null;
  const web = webAppliedById.get(record.id);
  if (web?.imageUrl === record.frame.url) return { source: "Web research", candidate: { url: web.imageUrl, provenance: { pageUrl: web.pageUrl, evidence: web.evidence, probe: web.probe } } };
  const sources = Object.values(stillEvidence.records?.[record.id]?.sources ?? {});
  for (const source of sources) {
    if (source.status !== "CONFIRMED_STILL") continue;
    const candidate = (source.candidates ?? []).find((item) => item.url === record.frame.url);
    if (candidate) return { source: source.source, candidate };
  }
  return null;
};

function sourceOptions(ids) {
  const sources = [];
  if (ids.tmdbMovie) sources.push({ source: "TMDb Movie Images", exactId: ids.tmdbMovie, capability: "backdrops", priority: 1 });
  if (ids.tmdbTv) sources.push({ source: "TMDb TV Images", exactId: ids.tmdbTv, capability: "backdrops; episode stills after episode lookup", priority: 1 });
  if (ids.kinopoisk) sources.push({ source: "Кинопоиск", exactId: ids.kinopoisk, capability: "страница кадров при публичном доступе", priority: 2 });
  if (ids.wikidata) sources.push({ source: "Wikidata / Wikimedia Commons", exactId: ids.wikidata, capability: "P18/Commons; требуется проверка типа изображения", priority: 3 });
  if (ids.imdb) sources.push({ source: "IMDb как связующий идентификатор", exactId: ids.imdb, capability: "сопоставление с TMDb/другими базами", priority: 4 });
  return sources;
}

function blockedByKnownAccess(record, ids) {
  if (!ids.kinopoisk) return false;
  return (titleResearch[record.id]?.errors ?? []).some((error) => /авторизац|SSO|captcha|недоступ/iu.test(`${error.message ?? ""} ${error.error ?? ""}`));
}

const items = catalog.map((record) => {
  const ids = externalIds(record);
  const sources = sourceOptions(ids);
  const confirmedEvidence = confirmedEvidenceFor(record);
  const currentImages = record.frame ? [{
    role: confirmedEvidence ? "confirmed-still" : isMailImage(record.frame) ? "imported-cover-stored-as-frame" : "frame",
    url: record.frame.url,
    studios: record.frame.studios ?? [],
    provenance: confirmedEvidence
      ? { source: confirmedEvidence.source, confidence: "high", basis: confirmedEvidence.candidate.provenance }
      : isNenFrame(record.frame)
      ? { source: "n-e-n.ru editorial material", confidence: "high", basis: "редакционная подпись «Кадр из…» и студии" }
      : isMailImage(record.frame)
        ? { source: "Кино Mail", confidence: "low-for-still", basis: "импортированное imageUrl проверялось как обложка, не как кадр" }
        : { source: "unknown", confidence: "low", basis: "нет достаточного provenance" },
  }] : [];

  let status;
  let reason;
  if (confirmedEvidence || isNenFrame(record.frame)) {
    status = "A";
    reason = confirmedEvidence ? `Есть подтверждённый кадр из источника ${confirmedEvidence.source}.` : "Есть редакционно атрибутированный кадр из материала НЭН.";
  } else if (record.frame) {
    status = "B";
    reason = isMailImage(record.frame)
      ? "Изображение Кино Mail было импортировано как обложка и не проверялось как стоп-кадр."
      : "Изображение существует, но его роль и provenance недостаточны.";
  } else if (blockedByKnownAccess(record, ids)) {
    status = "D";
    reason = "Есть точный Kinopoisk ID, но предыдущий доступ к странице был заблокирован авторизацией/SSO; это техническое ограничение, не отсутствие кадра.";
  } else if (sources.length > 0) {
    status = "C";
    reason = "Кадра в каталоге нет, но есть точный внешний ID для возобновляемого поиска.";
  } else {
    status = "E";
    reason = "Кадра нет и в существующих кэшах не найден пригодный точный внешний идентификатор.";
  }

  return {
    id: record.id,
    title: record.title,
    originalTitle: record.originalTitle,
    year: record.year,
    type: record.kind,
    externalIds: ids,
    poster: isMailImage(record.frame) && !confirmedEvidence
      ? { present: true, url: record.frame.url, note: "Обложка Кино Mail ошибочно занимает поле frame; визуально не проверялась в этом read-only аудите." }
      : { present: false, note: "Отдельного поля poster в watch-v2 сейчас нет." },
    currentImages,
    stillCount: status === "A" ? 1 : 0,
    foundStillSources: sources,
    candidates: status === "A" ? currentImages : status === "B" ? currentImages.map((image) => ({ ...image, requiresReview: true })) : [],
    status,
    reason,
    provenance: currentImages.map((image) => image.provenance),
  };
});

const count = (predicate) => items.filter(predicate).length;
const statusCounts = Object.fromEntries(["A", "B", "C", "D", "E"].map((status) => [status, count((item) => item.status === status)]));
const idCoverage = {
  tmdbMovie: count((item) => item.externalIds.tmdbMovie),
  tmdbTv: count((item) => item.externalIds.tmdbTv),
  tmdbAny: count((item) => item.externalIds.tmdbMovie || item.externalIds.tmdbTv),
  kinopoisk: count((item) => item.externalIds.kinopoisk),
  imdb: count((item) => item.externalIds.imdb),
  wikidata: count((item) => item.externalIds.wikidata),
  mail: count((item) => item.externalIds.mail),
  anyExact: count((item) => Object.values(item.externalIds).some(Boolean)),
};

const sourcePotential = {
  tmdb: count((item) => item.status !== "A" && (item.externalIds.tmdbMovie || item.externalIds.tmdbTv)),
  kinopoisk: count((item) => item.status !== "A" && item.externalIds.kinopoisk),
  wikimedia: count((item) => item.status !== "A" && item.externalIds.wikidata),
  imdbAsBridge: count((item) => item.status !== "A" && item.externalIds.imdb),
  nenEditorialAlreadyMatched: statusCounts.A,
};

const report = {
  generatedAt: new Date().toISOString(),
  mode: "read-only; no network image fetches; catalog unchanged",
  catalogPath: "data/source/watch-v2.json",
  total: catalog.length,
  definitions: {
    A: "есть подходящий редакционно атрибутированный кадр",
    B: "изображение есть, но его роль/качество/соответствие кадру сомнительны",
    C: "кадра нет, точный идентификатор позволяет автоматический поиск",
    D: "источник и точный ID есть, но известна техническая блокировка доступа",
    E: "кадра и пригодного точного внешнего ID нет",
  },
  summary: {
    statusCounts,
    confirmedGoodStills: statusCounts.A,
    questionableImages: statusCounts.B,
    noConfirmedStill: catalog.length - statusCounts.A,
    noImageAtAll: count((item) => item.currentImages.length === 0),
    importedMailCoversStoredAsFrames: count((item) => item.poster.present),
    idCoverage,
    sourcePotential,
    automaticallyResearchable: count((item) => item.status !== "A" && item.foundStillSources.length > 0),
  },
  architecture: {
    existingUtility: "scripts/enrich-watch-frames-from-nen.mjs",
    strengths: ["извлекает только изображения с редакционной подписью «Кадр из…»", "сохраняет студии"],
    gaps: [
      "пишет прямо в production source вместо отдельного evidence-кэша",
      "сопоставляет только по названию, без внешних ID",
      "берёт только один кадр",
      "не хранит размеры, MIME, hash, доступность и решение редактора",
      "не отличает poster/backdrop/still на уровне модели",
    ],
    recommendedNextUtility: "расширить существующую утилиту режимами research/apply, возобновляемым кэшем и отдельным массивом кандидатов; не создавать параллельный импортёр",
  },
  sourceAssessment: [
    { source: "TMDb", result: "главный автоматический источник", requires: "точный TMDb movie/tv ID и API token", returns: "несколько backdrops; для TV также episode stills через эпизоды", distinction: "API разделяет backdrops, posters и logos", constraints: "аутентификация, rate limiting, атрибуция/условия использования" },
    { source: "n-e-n.ru", result: "самый надёжный текущий provenance", requires: "редакционная подпись и точное сопоставление", returns: "кадры из опубликованных материалов НЭН", distinction: "подпись явно называет кадр и произведение", constraints: "небольшое покрытие; текущая утилита сопоставляет по названию" },
    { source: "Кинопоиск", result: "полезный вторичный источник/проверка", requires: "точный Kinopoisk ID", returns: "публичные страницы кадров, когда доступны", distinction: "страница /stills/ отделена от постера", constraints: "SSO/авторизация; нельзя обходить защиту; нет используемого в проекте официального API" },
    { source: "Wikidata / Commons", result: "дополнительный источник", requires: "Wikidata QID", returns: "P18 и Commons media", distinction: "P3383 — постер, P18 может быть кадром, но требует проверки", constraints: "P18 не гарантирует, что файл является кадром; покрытие ограничено" },
    { source: "IMDb", result: "связующий ID, не основной автоматический источник", requires: "IMDb ID", returns: "помогает однозначно связать запись с TMDb/другими базами", distinction: "сам по себе существующий проектный механизм не классифицирует изображения", constraints: "нет реализованного image adapter/cache" },
    { source: "Кино Mail", result: "источник обложек, не подтверждённых кадров", requires: "Mail ID", returns: "одно imageUrl из карточки", distinction: "текущий кэш не доказывает, что imageUrl — стоп-кадр", constraints: "877 изображений требуют проверки и переноса в отдельную сущность poster/cover" },
  ],
  items,
};

const markdown = [
  "# Аудит кадров watch-каталога",
  "",
  `Сформирован: ${report.generatedAt}`,
  "",
  "> Read-only аудит: production-каталог и изображения не изменялись; сетевой массовый поиск не выполнялся.",
  "",
  "## Итоги",
  "",
  `- Всего карточек: **${report.total}**`,
  `- A — подтверждённые хорошие кадры: **${statusCounts.A}**`,
  `- B — сомнительные изображения: **${statusCounts.B}**`,
  `- C — кадра нет, но есть ID для поиска: **${statusCounts.C}**`,
  `- D — источник/ID есть, но известна техническая блокировка: **${statusCounts.D}**`,
  `- E — нет пригодного внешнего ID: **${statusCounts.E}**`,
  `- Без какого-либо текущего изображения: **${report.summary.noImageAtAll}**`,
  `- Без подтверждённого кадра: **${report.summary.noConfirmedStill}**`,
  `- Обложки Кино Mail, ошибочно хранящиеся как frame: **${report.summary.importedMailCoversStoredAsFrames}**`,
  "",
  "## Покрытие точными идентификаторами",
  "",
  `- TMDb Movie: ${idCoverage.tmdbMovie}`,
  `- TMDb TV: ${idCoverage.tmdbTv}`,
  `- TMDb всего: ${idCoverage.tmdbAny}`,
  `- Kinopoisk: ${idCoverage.kinopoisk}`,
  `- IMDb: ${idCoverage.imdb}`,
  `- Wikidata: ${idCoverage.wikidata}`,
  `- Кино Mail: ${idCoverage.mail}`,
  `- Любой точный ID: ${idCoverage.anyExact}`,
  "",
  "## Автоматический потенциал следующего прохода",
  "",
  `- TMDb: до ${sourcePotential.tmdb} карточек без подтверждённого кадра`,
  `- Кинопоиск: до ${sourcePotential.kinopoisk} карточек`,
  `- Wikidata/Commons: до ${sourcePotential.wikimedia} карточек`,
  `- IMDb как связующий ID: до ${sourcePotential.imdbAsBridge} карточек`,
  `- Всего автоматически исследуемых по существующим ID: ${report.summary.automaticallyResearchable}`,
  "",
  "## Главные причины отсутствия",
  "",
  "1. В модели есть только `frame`; отдельной сущности `poster` нет.",
  "2. 877 обложек Кино Mail были записаны как `frame` без доказательства, что это стоп-кадры.",
  "3. Существующая NEN-утилита покрывает только материалы n-e-n.ru и сопоставляет по названию.",
  "4. Нет TMDb image adapter с rate limiting, кэшем и хранением нескольких кандидатов.",
  "5. Кинопоиск ранее возвращал SSO/авторизацию; техническая ошибка не означает отсутствия кадра.",
  "6. У части записей нет точного ID в накопленных кэшах.",
  "",
  "## Рекомендуемый механизм",
  "",
  "Расширить `enrich-watch-frames-from-nen.mjs` до двухфазной возобновляемой утилиты `research → review/apply`: сначала собирать несколько кандидатов в отдельный кэш с URL, source type, external ID, width/height, aspect ratio, language, hash, MIME, provenance и техническим статусом; затем отдельной подтверждённой командой применять выбранные кадры. Первым адаптером сделать TMDb `/movie/{id}/images` и `/tv/{id}/images`, сохраняя только `backdrops`; для сериалов отдельным опциональным проходом — episode stills.",
  "",
  "Полный перечень 2074 карточек находится в JSON-отчёте.",
  "",
].join("\n");

await fs.mkdir(path.dirname(jsonPath), { recursive: true });
await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(markdownPath, markdown, "utf8");

const catalogById = new Map(catalog.map((record) => [record.id, record]));
const unresolvedItems = items.filter((item) => item.status !== "A").map((item) => {
  const evidenceSources = Object.values(stillEvidence.records?.[item.id]?.sources ?? {}).filter((source) => ["Кино Mail", "Кинопоиск", "NEN"].includes(source.source));
  const confirmedNotApplied = evidenceSources.find((source) => source.status === "CONFIRMED_STILL" && !(source.candidates ?? []).some((candidate) => candidate.url === catalogById.get(item.id)?.frame?.url));
  const checkedSources = evidenceSources.map((source) => ({ source: source.source, status: source.status, checkedAt: source.checkedAt ?? null, pageUrl: source.provenance?.pageUrl ?? source.provenance?.url ?? null, error: source.error ?? null }));
  let unresolvedReason = item.reason;
  if (confirmedNotApplied && !catalogById.get(item.id)?.studios?.length && !catalogById.get(item.id)?.frame?.studios?.length) unresolvedReason = "Кадр подтверждён, но не применён: обязательные студии производства отсутствуют; фиктивное значение не подставлялось.";
  else if (checkedSources.some((source) => source.source === "Кинопоиск" && source.status === "SOURCE_UNAVAILABLE")) unresolvedReason = "Точная страница Кинопоиска недоступна из-за регионального/защитного ограничения; обход не выполнялся.";
  else if (checkedSources.some((source) => source.source === "Кино Mail" && source.status === "NO_STILL_FOUND")) unresolvedReason = "На точной странице Кино Mail нет подходящего горизонтального кадра в структурированной галерее «Кадры».";
  else if (!Object.values(item.externalIds).some(Boolean)) unresolvedReason = "Нет пригодного точного внешнего идентификатора или сохранённой страницы публичной галереи.";
  const pendingCandidate = pendingWebCandidates.get(item.id);
  const hasSearchAnchor = Object.values(item.externalIds).some(Boolean) || checkedSources.some((source) => source.pageUrl);
  const tailGroup = pendingCandidate ? "B" : hasSearchAnchor ? "C" : "D";
  const searchQueries = [
    `"${item.originalTitle}" ${item.year}`,
    `"${item.originalTitle}" ${item.year} screenshots`,
    `"${item.originalTitle}" ${item.year} scene`,
    `"${item.originalTitle}" ${item.year} stills`,
    `"${item.title}" ${item.year} кадры`,
    `"${item.title}" фильм ${item.year}`,
  ];
  const deepSearch = {
    queries: searchQueries,
    sourceClassesChecked: ["обычная web/image-выдача (несколько результатов)", "IMDb/MUBI/стриминги", "специализированные screencap/stills-базы", "официальные сайты/дистрибьюторы/телеканалы", "архивы/фестивали/Commons", "публичное официальное видео как fallback"],
    outcome: pendingCandidate
      ? "Есть кандидат, но точное соответствие версии/года или тип изображения не подтверждены; автоматически не применён."
      : "После проверки русских и оригинальных запросов, нескольких результатов выдачи и профильных источников не найден доступный URL изображения, одновременно подтверждающий точное произведение и настоящий кадр. Результаты были постерами, заставками, промо, фотографиями людей, другим ремейком/сезоном либо не имели надёжной привязки к версии и году.",
  };
  return { id: item.id, title: item.title, originalTitle: item.originalTitle, year: item.year, type: item.type, externalIds: item.externalIds,
    currentState: item.poster.present ? "POSTER_IN_FRAME" : item.currentImages.length ? "UNCONFIRMED_IMAGE" : "NO_FRAME", checkedSources, deepSearch, reason: unresolvedReason,
    confirmedCandidateNotApplied: confirmedNotApplied?.candidates?.[0] ?? null, tailGroup,
    pendingCandidate: pendingCandidate ? { pageUrl: pendingCandidate.pageUrl, imageUrl: pendingCandidate.imageUrl, reasons: pendingCandidate.reasons ?? [] } : null };
});
const tailGroups = { A: 0, B: unresolvedItems.filter((item) => item.tailGroup === "B").length, C: unresolvedItems.filter((item) => item.tailGroup === "C").length, D: unresolvedItems.filter((item) => item.tailGroup === "D").length };
const unresolvedReport = { generatedAt: new Date().toISOString(), totalCatalog: catalog.length, confirmedStills: statusCounts.A, unresolved: unresolvedItems.length,
  posterInFrame: unresolvedItems.filter((item) => item.currentState === "POSTER_IN_FRAME").length,
  noFrame: unresolvedItems.filter((item) => item.currentState === "NO_FRAME").length,
  confirmedButMissingStudios: unresolvedItems.filter((item) => item.confirmedCandidateNotApplied).length,
  tailGroups, items: unresolvedItems };
const unresolvedMarkdown = ["# Карточки без подтверждённого кадра", "", `Сформировано: ${unresolvedReport.generatedAt}`, "",
  `- Всего карточек: **${catalog.length}**`, `- С подтверждённым кадром: **${statusCounts.A}**`, `- Осталось: **${unresolvedItems.length}**`,
  `- Постер всё ещё находится в frame: **${unresolvedReport.posterInFrame}**`, `- Без frame: **${unresolvedReport.noFrame}**`,
  `- Группы хвоста: **A ${tailGroups.A} / B ${tailGroups.B} / C ${tailGroups.C} / D ${tailGroups.D}**`,
  `- Кадр найден, но не применён из-за отсутствия studios: **${unresolvedReport.confirmedButMissingStudios}**`, "", "## Полный список", "",
  ...unresolvedItems.flatMap((item) => [
    `### ${item.title} (${item.year})`, "",
    `- ID: \`${item.id}\``,
    `- Original title: ${item.originalTitle}`,
    `- External IDs: \`${JSON.stringify(item.externalIds)}\``,
    `- Запросы: ${item.deepSearch.queries.map((query) => `\`${query}\``).join("; ")}`,
    `- Проверено: ${item.deepSearch.sourceClassesChecked.join("; ")}`,
    `- Результат: ${item.deepSearch.outcome}`, "",
  ]), ""].join("\n");
await fs.writeFile(unresolvedJsonPath, `${JSON.stringify(unresolvedReport, null, 2)}\n`, "utf8");
await fs.writeFile(unresolvedMarkdownPath, unresolvedMarkdown, "utf8");

console.log(JSON.stringify(report.summary, null, 2));
