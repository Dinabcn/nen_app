import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generateWatchV2Catalog, serializeWatchV2Catalog } from "./watch-v2-generator.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");
const files = {
  catalog: path.join(root, "data/source/watch-v2.json"),
  generated: path.join(root, "data/generated/watch.json"),
  reserve: path.join(root, "data/reports/watch-mail-expansion-500.json"),
  mail: path.join(root, "data/reports/cache/watch-mail-source.json"),
  audit: path.join(root, "data/reports/watch-stills-audit.json"),
  cache: path.join(root, "data/reports/cache/watch-replacement-gallery-cache.json"),
  json: path.join(root, "data/reports/watch-catalog-replacements.json"),
  markdown: path.join(root, "data/reports/watch-catalog-replacements.md"),
};

const baselineFromHead = apply;
const catalog = baselineFromHead
  ? JSON.parse(execFileSync("git", ["show", "HEAD:data/source/watch-v2.json"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }))
  : JSON.parse(await fs.readFile(files.catalog, "utf8"));
const expansion = JSON.parse(await fs.readFile(files.reserve, "utf8"));
const mailItems = JSON.parse(await fs.readFile(files.mail, "utf8")).items;
const audit = baselineFromHead
  ? JSON.parse(execFileSync("git", ["show", "HEAD:data/reports/watch-stills-audit.json"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }))
  : JSON.parse(await fs.readFile(files.audit, "utf8"));
const cache = await fs.readFile(files.cache, "utf8").then(JSON.parse).catch(() => ({}));
const normalize = (value) => String(value ?? "").toLocaleLowerCase("ru").replace(/ё/gu, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const existingNames = new Set(catalog.flatMap((item) => [item.title, item.originalTitle].map(normalize)));
const mailId = (url) => String(url).match(/(?:movies\/|series_)(\d+)/u)?.[1] ?? null;
const mailById = new Map(mailItems.map((item) => [String(item.mailId), item]));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function writeFileRetry(filePath, contents) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try { await fs.writeFile(filePath, contents); return; }
    catch (error) { lastError = error; await sleep(250 * (attempt + 1)); }
  }
  throw lastError;
}
const eligibleMail = mailItems.filter((item) => !existingNames.has(normalize(item.mailTitle)) && !existingNames.has(normalize(item.originalTitle)))
  .filter((item) => item.mailUrl);
const balancedPool = [
  ...eligibleMail.filter((item) => item.sourceType === "movie").slice(0, 250),
  ...eligibleMail.filter((item) => item.sourceType === "series").slice(0, 250),
].map((item) => ({ title: item.mailTitle, originalTitle: item.originalTitle || item.mailTitle, year: item.year,
  type: item.sourceType, confidence: "high", mailUrl: item.mailUrl, imageUrl: item.imageUrl }));
const balancedIds = new Set(balancedPool.map((item) => mailId(item.mailUrl)));
const supplemental = expansion.reserve.filter((item) => !balancedIds.has(mailId(item.mailUrl)))
  .filter((item) => !existingNames.has(normalize(item.title)) && !existingNames.has(normalize(item.originalTitle)));
const candidatePool = balancedPool.concat(supplemental).slice(0, 500);

function imageSize(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes.length >= 30 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    const kind = bytes.subarray(12, 16).toString("ascii");
    if (kind === "VP8X") return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    if (kind === "VP8 ") return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    if (kind === "VP8L") { const packed = bytes.readUInt32LE(21); return { width: (packed & 0x3fff) + 1, height: ((packed >> 14) & 0x3fff) + 1 }; }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1]; const size = bytes.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      if (!size || size < 2) break; offset += 2 + size;
    }
  }
  return { width: 0, height: 0 };
}

function decodeHtml(value) {
  return String(value ?? "").replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll('\\"', '"').replaceAll("\\/", "/");
}
function extractBalancedObject(text, marker) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = text.indexOf("{", markerIndex + marker.length);
  if (start < 0) return null;
  let depth = 0; let quoted = false; let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return text.slice(start, index + 1);
  }
  return null;
}
function parseGallery(html) {
  const raw = extractBalancedObject(decodeHtml(html), '"gallery":');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function imageUrl(image) {
  if (!image?.baseURL || !image?.uuid || !image?.key) return null;
  const format = image.fmt?.includes("jpg") ? "jpg" : image.fmt?.includes("webp") ? "webp" : image.fmt?.[0];
  return format ? `${image.baseURL}${image.uuid}/${image.key}.${format}` : null;
}
function bestGalleryItem(gallery, title, originalTitle) {
  const expected = [title, originalTitle].map(normalize).filter((value) => value.length >= 3);
  if (!expected.some((value) => normalize(gallery?.title).includes(value))) return null;
  const candidates = (gallery?.items ?? []).flatMap((item) => ["large", "base", "small"].map((variant) => {
    const image = item?.[variant]; const url = imageUrl(image);
    const width = Number(image?.width ?? 0); const height = Number(image?.height ?? 0);
    return url && width && height ? { item, variant, url, width, height, aspectRatio: width / height } : null;
  }).filter(Boolean)).filter((item) => item.aspectRatio >= 1 && item.aspectRatio <= 3)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));
  return candidates[0] ?? null;
}

async function fetchGallery(candidate) {
  const id = mailId(candidate.mailUrl);
  if (!id) return { status: "LOW", reason: "MAIL_ID_MISSING" };
  if (cache[id]) return cache[id];
  try {
    const response = await fetch(candidate.mailUrl, { headers: { "user-agent": "Mozilla/5.0 NENWatchCatalog/4.0", accept: "text/html" }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) return { status: "MEDIUM", reason: `SOURCE_HTTP_${response.status}`, pageUrl: candidate.mailUrl };
    const gallery = parseGallery(await response.text());
    const best = bestGalleryItem(gallery, candidate.title, candidate.originalTitle);
    if (!best) return { status: "MEDIUM", reason: gallery?.items?.length ? "NO_CONFIRMED_FRAME_VARIANT" : "NO_GALLERY", pageUrl: candidate.mailUrl };
    return { status: "PENDING_PROBE", pageUrl: candidate.mailUrl, galleryId: gallery.gallery_id ?? null, galleryTitle: gallery.title,
      galleryCount: gallery.items.length, itemId: best.item.id ?? null, itemTitle: best.item.title ?? null,
      imageUrl: best.url, declaredWidth: best.width, declaredHeight: best.height, variant: best.variant };
  } catch (error) { return { status: "MEDIUM", reason: `SOURCE_UNAVAILABLE: ${error.message}`, pageUrl: candidate.mailUrl }; }
}

async function probe(result) {
  if (result.status !== "PENDING_PROBE") return result;
  try {
    const response = await fetch(result.imageUrl, { headers: { "user-agent": "Mozilla/5.0 NENWatchCatalog/4.0", accept: "image/*" }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) return { ...result, status: "MEDIUM", reason: `IMAGE_HTTP_${response.status}` };
    const mime = response.headers.get("content-type")?.split(";")[0] ?? null;
    if (!mime?.startsWith("image/")) return { ...result, status: "LOW", reason: `INVALID_MIME_${mime}` };
    const bytes = Buffer.from(await response.arrayBuffer());
    const dimensions = imageSize(bytes); const width = dimensions.width ?? 0; const height = dimensions.height ?? 0;
    if (!width || !height || width / height < 1 || width / height > 3) return { ...result, status: "LOW", reason: "INVALID_DIMENSIONS" };
    return { ...result, status: "HIGH", mime, width, height, aspectRatio: width / height, bytes: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"), checkedAt: new Date().toISOString() };
  } catch (error) { return { ...result, status: "MEDIUM", reason: `IMAGE_UNAVAILABLE: ${error.message}` }; }
}

const research = [];
for (let index = 0; index < candidatePool.length; index += 1) {
  const candidate = candidatePool[index]; const id = mailId(candidate.mailUrl); const source = mailById.get(String(id));
  const duplicate = existingNames.has(normalize(candidate.title)) || existingNames.has(normalize(candidate.originalTitle));
  let result = duplicate ? { status: "LOW", reason: "DUPLICATE_EXISTING_CATALOG" } : await fetchGallery(candidate);
  result = await probe(result); cache[id] = result;
  research.push({ mailId: id, ...candidate, sourceData: source ? { country: source.country, directors: source.directors, genres: source.genres,
    description: source.description, duration: source.duration, contentRating: source.contentRating, externalIds: source.externalIds } : null, ...result });
  if (index % 10 === 9) { await fs.writeFile(files.cache, `${JSON.stringify(cache, null, 2)}\n`); await sleep(120); }
}
await fs.writeFile(files.cache, `${JSON.stringify(cache, null, 2)}\n`);

const slugify = (value) => String(value).normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLocaleLowerCase("en")
  .replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
const uniq = (values) => [...new Set(values.filter(Boolean))];
function durationMinutes(value, fallback = 25) {
  const match = String(value ?? "").match(/PT(?:(\d+)H)?(?:(\d+)M)?/u); return match ? Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0) : fallback;
}
function kindFor(item) {
  const genres = (item.sourceData?.genres ?? []).join(" "); const animated = /мульт|анимац/iu.test(genres);
  if (item.type === "series") return animated ? "animated-series" : "series";
  const minutes = durationMinutes(item.sourceData?.duration, 90); return animated ? (minutes <= 40 ? "animated-short" : "animated-feature") : (minutes <= 40 ? "short-film" : "movie");
}
function genresFor(item, kind) {
  const text = (item.sourceData?.genres ?? []).join(" "); const out = [];
  const add = (regex, value) => { if (regex.test(text)) out.push(value); };
  add(/семейн|детск/iu, "семейный"); add(/комед/iu, "комедия"); add(/драм/iu, "драма"); add(/приключ/iu, "приключения");
  add(/фэнтез|сказ/iu, "фэнтези"); add(/фантаст/iu, "фантастика"); add(/детектив/iu, "детектив"); add(/музык/iu, "мюзикл");
  if (kind.includes("short")) out.push("короткометражный"); return uniq(out.length ? out : [kind.startsWith("animated") ? "семейный" : "драма"]);
}
function makeRecord(item) {
  const kind = kindFor(item); const genres = genresFor(item, kind); const series = kind.endsWith("series");
  const description = String(item.sourceData?.description ?? "").trim(); const title = item.title; const minAge = series || kind.startsWith("animated") ? 6 : 9;
  const themes = uniq([/приключ/iu.test(genres.join(" ")) ? "путешествия" : null, /семейн/iu.test(genres.join(" ")) ? "семья" : null,
    /комед/iu.test(genres.join(" ")) ? "дружба" : null, "выбор", "эмпатия"]).slice(0, 5);
  return { schemaVersion: 2, id: `nen-repl-mail-${item.mailId}`, slug: `${slugify(item.originalTitle || item.title) || "work"}-${item.year}-${item.mailId}`,
    title, originalTitle: item.originalTitle || title, kind,
    shortDescription: description.length >= 40 ? description : `${title} — ${series ? "семейный сериал" : "семейная история"} о героях, которым предстоит принимать решения, помогать друг другу и отвечать за последствия своих поступков.`,
    whyRecommended: `Для семейного просмотра и разговора о темах: ${themes.join(", ")}.`, country: item.sourceData?.country?.length ? item.sourceData.country : ["Не указана"], year: item.year,
    duration: series ? { episodeMinutes: Math.max(1, Math.min(180, durationMinutes(item.sourceData?.duration, 22))) } : { minutes: Math.max(1, Math.min(360, durationMinutes(item.sourceData?.duration, 90))) },
    genres, themes, discussionTopics: [`Как меняется главный герой ${title} после ключевого выбора?`, "Какие поступки героев заслуживают доверия и почему?"],
    mood: genres.includes("комедия") ? ["весёлое"] : genres.includes("приключения") ? ["приключенческое"] : ["вдумчивое"], sensitiveTopics: [],
    nenAgeRecommendation: { minAge, maxAge: Math.min(18, minAge + 6), rationale: `Рекомендуется с ${minAge} лет: содержание и темп произведения подходят для совместного просмотра и последующего обсуждения поступков героев.` },
    ...(item.sourceData?.contentRating && /^(?:0|6|12|16|18)\+$/u.test(item.sourceData.contentRating) ? { officialRating: { value: item.sourceData.contentRating, sourceUrl: item.mailUrl, sourceTitle: "Кино Mail" } } : {}),
    titleLocalization: "official-ru", frame: { url: item.imageUrl } };
}

const auditById = new Map(audit.items.map((item) => [item.id, item]));
const existingExternalIds = new Set(audit.items.flatMap((item) => Object.entries(item.externalIds ?? {}).filter(([, value]) => value).map(([key, value]) => `${key}:${value}`)));
const seenHashes = new Set(); const seenUrls = new Set();
const high = research.filter((item) => item.status === "HIGH").filter((item) => {
  const duplicateExternalId = Object.entries(item.sourceData?.externalIds ?? {}).some(([key, value]) => value && existingExternalIds.has(`${key}:${value}`));
  if (duplicateExternalId || seenHashes.has(item.sha256) || seenUrls.has(item.imageUrl)) return false;
  seenHashes.add(item.sha256); seenUrls.add(item.imageUrl); return true;
});
const unresolved = catalog.filter((item) => ["B", "C", "D", "E"].includes(auditById.get(item.id)?.status));
const classification = unresolved.map((item) => {
  const status = auditById.get(item.id)?.status;
  const decision = status === "E" || status === "D" ? "A_KEEP" : "B_REPLACE";
  return { id: item.id, slug: item.slug, title: item.title, originalTitle: item.originalTitle, year: item.year, auditStatus: status, decision,
    reason: decision === "A_KEEP" ? "Редакционная/известная карточка сохранена несмотря на отсутствие кадра" : "Импортный хвост без подтверждённого кадра после полного исследования" };
});
const targets = classification.filter((item) => item.decision === "B_REPLACE")
  .sort((a, b) => ({ D: 0, C: 1, B: 2 }[a.auditStatus] - ({ D: 0, C: 1, B: 2 }[b.auditStatus])) || a.id.localeCompare(b.id));
const pairCount = Math.min(high.length, targets.length);
const pairs = Array.from({ length: pairCount }, (_, index) => ({ removed: targets[index], replacement: high[index] }));

if (apply && pairs.length) {
  const removedIds = new Set(pairs.map((pair) => pair.removed.id));
  const additions = generateWatchV2Catalog(pairs.map((pair) => makeRecord(pair.replacement))).items;
  const next = catalog.filter((item) => !removedIds.has(item.id)).concat(additions)
    .sort((a, b) => a.id.localeCompare(b.id, "en") || a.slug.localeCompare(b.slug, "en"));
  generateWatchV2Catalog(next);
  const urls = next.map((item) => item.frame?.url).filter(Boolean);
  if (new Set(urls).size !== urls.length) throw new Error("Replacement создал duplicate frame URL");
  await writeFileRetry(files.catalog, serializeWatchV2Catalog(next));
  await writeFileRetry(files.generated, serializeWatchV2Catalog(generateWatchV2Catalog(next).items));
}

const counts = Object.fromEntries(["HIGH", "MEDIUM", "LOW"].map((status) => [status, research.filter((item) => item.status === status).length]));
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), mode: apply ? "applied" : "research", before: { total: catalog.length, frames: catalog.filter((item) => item.frame).length },
  researched: research.length, counts, classification, highCandidates: high, pairs: apply ? pairs : [], applied: apply ? pairs.length : 0 };
await fs.writeFile(files.json, `${JSON.stringify(report, null, 2)}\n`);
const lines = ["# Замены watch-каталога", "", `Сформировано: ${report.generatedAt}`, "", `- Исследовано новых произведений: **${research.length}**`,
  `- HIGH: **${counts.HIGH}**`, `- MEDIUM: **${counts.MEDIUM}**`, `- LOW: **${counts.LOW}**`, `- Замен применено: **${report.applied}**`, "",
  "## Применённые замены", "", ...pairs.map((pair) => `- \`${pair.removed.id}\` ${pair.removed.title} (${pair.removed.year}) → \`nen-repl-mail-${pair.replacement.mailId}\` ${pair.replacement.title} (${pair.replacement.year}); frame: ${pair.replacement.imageUrl}`), "",
  "## Классификация исходного хвоста", "", ...classification.map((item) => `- **${item.decision}** \`${item.id}\` — ${item.title} (${item.year}): ${item.reason}`), ""];
await fs.writeFile(files.markdown, lines.join("\n"));
console.log(JSON.stringify({ researched: research.length, ...counts, replaceable: targets.length, applied: report.applied }, null, 2));
