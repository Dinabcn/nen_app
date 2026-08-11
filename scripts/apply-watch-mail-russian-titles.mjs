import fs from "node:fs/promises";

const catalogPath = "data/source/watch-v2.json";
const researchCachePath = "data/reports/cache/watch-russian-title-research.json";
const mailCachePath = "data/reports/cache/watch-mail-source.json";
const reportPath = "data/reports/watch-original-only-mail-localization.json";
const apply = process.argv.includes("--apply");

const readJson = async (file, fallback) => fs.readFile(file, "utf8").then(JSON.parse).catch(() => fallback);
const normalize = (value) => String(value ?? "")
  .toLocaleLowerCase("ru")
  .normalize("NFKD")
  .replace(/\p{M}/gu, "")
  .replace(/ё/gu, "е")
  .replace(/[«»„“”"'’`]/gu, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();
const hasCyrillic = (value) => /[А-ЯЁа-яё]/u.test(String(value ?? ""));
const seriesKinds = new Set(["series", "animated-series", "documentary-series", "educational-series"]);
const typeCompatible = (mail, item) => mail.sourceType === "series" ? seriesKinds.has(item.kind) : !seriesKinds.has(item.kind);
const sameId = (left, right) => left && right && String(left) === String(right);

const catalog = await readJson(catalogPath, []);
const research = await readJson(researchCachePath, {});
const mail = (await readJson(mailCachePath, { items: [] })).items ?? [];
const pending = catalog.filter((item) => item.titleLocalization === "original-only");
const originalSnapshot = new Map(pending.map((item) => [item.id, item.originalTitle]));

function mailMatches(item) {
  const identifiers = research[item.id]?.identifiers ?? {};
  const exactId = mail.filter((candidate) =>
    sameId(identifiers.imdb, candidate.externalIds?.imdb)
    || sameId(identifiers.kinopoisk, candidate.externalIds?.kinopoisk)
    || sameId(identifiers.tmdbMovie, candidate.externalIds?.tmdbMovie)
    || sameId(identifiers.tmdbTv, candidate.externalIds?.tmdbTv));
  if (exactId.length === 1) return [{ candidate: exactId[0], method: "exact-external-id", externalId:
    exactId[0].externalIds?.imdb ?? exactId[0].externalIds?.kinopoisk ?? exactId[0].externalIds?.tmdbMovie ?? exactId[0].externalIds?.tmdbTv }];

  const original = normalize(item.originalTitle);
  const exactOriginal = mail.filter((candidate) => candidate.originalTitle && normalize(candidate.originalTitle) === original
    && candidate.year === item.year && typeCompatible(candidate, item));
  if (exactOriginal.length === 1) return [{ candidate: exactOriginal[0], method: "originalTitle+year+type", externalId: null }];

  const nearYearOriginal = mail.filter((candidate) => candidate.originalTitle && normalize(candidate.originalTitle) === original
    && candidate.year && Math.abs(candidate.year - item.year) <= 1 && typeCompatible(candidate, item));
  if (nearYearOriginal.length === 1) return [{ candidate: nearYearOriginal[0], method: "originalTitle+year±1+type", externalId: null }];

  return [];
}

function cachedReliableCandidate(item) {
  const cached = research[item.id];
  if (!cached) return null;
  const entries = [...(cached.provenance ?? []), ...(cached.rejectedCandidates ?? [])]
    .filter((entry) => hasCyrillic(entry.candidate));
  const reliable = entries.filter((entry) => {
    const source = String(entry.source ?? "");
    const match = String(entry.match ?? "");
    const exact = /exact-(?:kinopoisk|tmdb|imdb|wikidata)|exact.*id/iu.test(match);
    const trusted = /Кинопоиск|TMDb|Афиша|Бюллетень|прокат|Wikipedia|Википедия|Wikidata|Okko|Иви|Wink|KION|START|PREMIER/iu.test(source);
    return exact && trusted && Number(entry.confidence ?? 0) >= 0.9;
  });
  const byTitle = new Map();
  for (const entry of reliable) {
    const key = normalize(entry.candidate);
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(entry);
  }
  if (byTitle.size !== 1) return null;
  const evidence = [...byTitle.values()][0];
  return { title: evidence[0].candidate, evidence, method: evidence[0].match, source: evidence[0].source };
}

const applied = [];
const candidates = [];
for (const item of pending) {
  const matches = mailMatches(item);
  if (matches.length === 1) {
    const { candidate, method, externalId } = matches[0];
    if (hasCyrillic(candidate.mailTitle) && normalize(candidate.mailTitle) !== normalize(item.originalTitle)) {
      const decision = {
        id: item.id,
        originalTitle: item.originalTitle,
        previousTitle: item.title,
        title: candidate.mailTitle,
        year: item.year,
        source: "Кино Mail",
        url: candidate.mailUrl,
        method,
        externalId,
      };
      applied.push(decision);
      if (apply) {
        item.title = decision.title;
        item.titleLocalization = "official-ru";
        const cached = research[item.id] ?? { id: item.id, identifiers: {} };
        cached.status = "CONFIRMED_RU";
        cached.russianTitle = decision.title;
        cached.confidence = 0.99;
        cached.reason = "Русское название используется Кино Mail; произведение сопоставлено точно";
        cached.provenance = [...(cached.provenance ?? []), {
          candidate: decision.title,
          source: "Кино Mail",
          url: decision.url,
          match: decision.method,
          externalId: decision.externalId,
          confidence: 0.99,
          verifiedAt: new Date().toISOString(),
        }].filter((entry, index, entries) => entries.findIndex((other) =>
          normalize(other.candidate) === normalize(entry.candidate) && other.url === entry.url) === index);
        research[item.id] = cached;
      }
      continue;
    }
  }

  const cached = cachedReliableCandidate(item);
  if (cached && normalize(cached.title) !== normalize(item.originalTitle)) {
    const decision = {
      id: item.id,
      originalTitle: item.originalTitle,
      previousTitle: item.title,
      title: cached.title,
      year: item.year,
      source: cached.source,
      url: cached.evidence[0].url,
      method: cached.method,
      externalId: null,
    };
    applied.push(decision);
    if (apply) {
      item.title = decision.title;
      item.titleLocalization = "official-ru";
      research[item.id].status = "CONFIRMED_RU";
      research[item.id].russianTitle = decision.title;
      research[item.id].confidence = Math.max(0.9, Number(research[item.id].confidence ?? 0));
      research[item.id].reason = "Русское название подтверждено точным ID в ранее собранном evidence";
    }
    continue;
  }

  const possibleMail = mail.filter((candidate) => candidate.originalTitle
    && normalize(candidate.originalTitle) === normalize(item.originalTitle));
  if (possibleMail.length) candidates.push({
    id: item.id,
    originalTitle: item.originalTitle,
    year: item.year,
    kind: item.kind,
    reason: "Найдено совпадение originalTitle, но год или тип не позволяют применить его автоматически",
    mailCandidates: possibleMail.map((candidate) => ({
      title: candidate.mailTitle,
      originalTitle: candidate.originalTitle,
      year: candidate.year,
      type: candidate.sourceType,
      url: candidate.mailUrl,
    })),
  });
}

const ids = new Set();
const slugs = new Set();
for (const item of catalog) {
  if (ids.has(item.id)) throw new Error(`Дублирующийся id: ${item.id}`);
  if (slugs.has(item.slug)) throw new Error(`Дублирующийся slug: ${item.slug}`);
  ids.add(item.id);
  slugs.add(item.slug);
}
for (const item of pending) {
  if (item.originalTitle !== originalSnapshot.get(item.id)) throw new Error(`${item.id}: originalTitle изменён`);
}

const remaining = catalog.filter((item) => item.titleLocalization === "original-only");
const sourceCounts = applied.reduce((result, item) => {
  const key = item.source === "Кино Mail" ? "mail" : /Кинопоиск/iu.test(item.source) ? "kinopoisk"
    : /TMDb/iu.test(item.source) ? "tmdb" : /прокат|Бюллетень/iu.test(item.source) ? "releaseDatabases" : "other";
  result[key] += 1;
  return result;
}, { mail: 0, kinopoisk: 0, tmdb: 0, releaseDatabases: 0, other: 0 });

const report = {
  generatedAt: new Date().toISOString(),
  mode: apply ? "applied" : "dry-run",
  originalOnlyBefore: pending.length,
  localized: applied.length,
  sourceCounts,
  remainingOriginalOnly: remaining.length,
  applied,
  candidates,
  invariants: {
    duplicateIds: 0,
    duplicateSlugs: 0,
    originalTitlesChanged: 0,
    addedCatalogItems: 0,
    removedCatalogItems: 0,
  },
};

if (apply) {
  await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  await fs.writeFile(researchCachePath, `${JSON.stringify(research, null, 2)}\n`, "utf8");
}
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ reportPath, ...report }, null, 2));
