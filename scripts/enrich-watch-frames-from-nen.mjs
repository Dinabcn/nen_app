import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const paths = {
  catalog: path.join(root, "data/source/watch-v2.json"),
  audit: path.join(root, "data/reports/watch-stills-audit.json"),
  mailSource: path.join(root, "data/reports/cache/watch-mail-source.json"),
  mailComparison: path.join(root, "data/reports/watch-mail-catalog-comparison.json"),
  cache: path.join(root, "data/reports/cache/watch-stills-research-evidence.json"),
  report: path.join(root, "data/reports/watch-stills-research.json"),
  markdown: path.join(root, "data/reports/watch-stills-research.md"),
  applyReport: path.join(root, "data/reports/watch-stills-apply.json"),
  webResearchReport: path.join(root, "data/reports/watch-stills-web-experiment.json"),
  webApplyReport: path.join(root, "data/reports/watch-stills-web-apply.json"),
  webBacklogApplyReport: path.join(root, "data/reports/watch-stills-web-backlog-apply.json"),
  tailReviewReport: path.join(root, "data/reports/watch-stills-tail-review.json"),
  tailApplyReport: path.join(root, "data/reports/watch-stills-tail-apply.json"),
};

const USER_AGENT = "NENWatchStillResearch/2.0 (editorial research; contact: n-e-n.ru)";
const TMDB_TOKEN = process.env.TMDB_API_TOKEN ?? process.env.TMDB_ACCESS_TOKEN ?? null;
const TMDB_KEY = process.env.TMDB_API_KEY ?? null;
const MAX_CANDIDATES = 5;
const mode = process.argv.includes("--apply") ? "apply" : "research";
const applyWebConfirmed = process.argv.includes("--apply-web-confirmed");
const applyWebBacklog = process.argv.includes("--apply-web-backlog");
const applyTailConfirmed = process.argv.includes("--apply-tail-confirmed");
const requestedLimit = Number(process.argv.find((arg) => arg.startsWith("--max="))?.split("=")[1] ?? Infinity);
const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : Infinity;
const sourceArg = process.argv.find((arg) => arg.startsWith("--sources="))?.split("=")[1];
const enabledSources = new Set((sourceArg ?? "nen,mail,kinopoisk").split(",").map((value) => value.trim()));
const refresh = process.argv.includes("--refresh");
const hydrate = process.argv.includes("--hash");
const scope = process.argv.find((arg) => arg.startsWith("--scope="))?.split("=")[1] ?? "mail-posters";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => new Date().toISOString();
const isHttpUrl = (value) => typeof value === "string" && /^https?:\/\//u.test(value);
const yearOf = (value) => Number(String(value ?? "").slice(0, 4)) || null;
const imageTypeFromMime = (mime, url) => mime || (url.endsWith(".png") ? "image/png" : url.endsWith(".webp") ? "image/webp" : "image/jpeg");

function imageDimensions(bytes, mime) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), format: "png" };
  }
  if (bytes.length >= 10 && (bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a")) {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8), format: "gif" };
  }
  if (bytes.length >= 30 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    const kind = bytes.subarray(12, 16).toString("ascii");
    if (kind === "VP8X") return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3), format: "webp" };
    if (kind === "VP8 " && bytes.length >= 30) return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff, format: "webp" };
    if (kind === "VP8L" && bytes.length >= 25) {
      const packed = bytes.readUInt32LE(21); return { width: (packed & 0x3fff) + 1, height: ((packed >> 14) & 0x3fff) + 1, format: "webp" };
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const size = bytes.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5), format: "jpeg" };
      }
      if (size < 2) break;
      offset += 2 + size;
    }
  }
  return { width: null, height: null, format: mime ?? "unknown" };
}

async function readJson(filePath, fallback) {
  try { return JSON.parse(await fs.readFile(filePath, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try { await fs.rename(temporary, filePath); }
  catch (error) { if (error?.code !== "EEXIST" && error?.code !== "EPERM") throw error; await fs.rm(filePath, { force: true }); await fs.rename(temporary, filePath); }
}

class RateLimitedClient {
  constructor({ name, intervalMs }) { this.name = name; this.intervalMs = intervalMs; this.lastRequestAt = 0; }
  async fetch(url, options = {}, attempts = 4) {
    let finalError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const wait = Math.max(0, this.intervalMs - (Date.now() - this.lastRequestAt));
      if (wait) await sleep(wait);
      this.lastRequestAt = Date.now();
      try {
        const response = await fetch(url, {
          ...options,
          headers: { "user-agent": USER_AGENT, accept: "application/json,image/*;q=0.9,*/*;q=0.5", ...(options.headers ?? {}) },
          signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
        });
        if (response.status === 429 || response.status >= 500) {
          const retryAfter = Number(response.headers.get("retry-after")) * 1000;
          const backoff = Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 120_000 ? retryAfter : Math.min(30_000, 750 * (2 ** (attempt - 1)));
          finalError = new Error(`${this.name}: HTTP ${response.status}`);
          if (attempt < attempts) await sleep(backoff);
          continue;
        }
        return response;
      } catch (error) { finalError = error; if (attempt < attempts) await sleep(Math.min(30_000, 750 * (2 ** (attempt - 1)))); }
    }
    throw finalError;
  }
}

const clients = {
  mail: new RateLimitedClient({ name: "Кино Mail", intervalMs: 700 }),
  kinopoisk: new RateLimitedClient({ name: "Кинопоиск", intervalMs: 1_100 }),
  tmdb: new RateLimitedClient({ name: "TMDb", intervalMs: 275 }),
  commons: new RateLimitedClient({ name: "Wikimedia Commons", intervalMs: 400 }),
  image: new RateLimitedClient({ name: "image metadata", intervalMs: 180 }),
};

const decodeHtml = (value) => String(value ?? "")
  .replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("&#x27;", "'")
  .replaceAll("&lt;", "<").replaceAll("&gt;", ">");

function extractBalancedObject(text, marker) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = text.indexOf("{", markerIndex + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
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

function parseMailGallery(html) {
  const normalized = decodeHtml(html).replaceAll('\\"', '"').replaceAll("\\/", "/");
  const raw = extractBalancedObject(normalized, '"gallery":');
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch (error) { throw new Error(`не удалось разобрать gallery JSON: ${error.message}`); }
}

function mailImageUrl(image) {
  if (!image?.baseURL || !image?.uuid || !image?.key) return null;
  const format = image.fmt?.includes("webp") ? "webp" : image.fmt?.includes("jpg") ? "jpg" : image.fmt?.[0];
  return format ? `${image.baseURL}${image.uuid}/${image.key}.${format}` : null;
}

const normalizeTitle = (value) => String(value ?? "").toLocaleLowerCase("ru-RU")
  .replace(/[«»"'’]/gu, "").replace(/ё/gu, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function mailTitleMatches(record, galleryTitle, itemTitle) {
  const expected = [record.title, record.originalTitle].map(normalizeTitle).filter(Boolean);
  const haystack = normalizeTitle(`${galleryTitle ?? ""} ${itemTitle ?? ""}`);
  return expected.some((title) => title.length >= 3 && haystack.includes(title));
}

async function researchMail(record) {
  const mail = mailById.get(String(record.externalIds.mail ?? "")) ?? mailByWatchId.get(record.id);
  if (!mail?.mailUrl) return { source: "Кино Mail", status: "UNRESOLVED", checkedAt: now(), candidates: [], error: "нет точной сохранённой страницы Кино Mail" };
  const response = await clients.mail.fetch(mail.mailUrl, { headers: { accept: "text/html,application/xhtml+xml" }, timeoutMs: 30_000 }, 3);
  if (!response.ok) {
    const unavailable = response.status === 401 || response.status === 403 || response.status === 429 || response.status >= 500;
    return { source: "Кино Mail", status: unavailable ? "SOURCE_UNAVAILABLE" : "NO_STILL_FOUND", checkedAt: now(), candidates: [], error: `HTTP ${response.status}`, provenance: { pageUrl: mail.mailUrl, mailId: mail.mailId } };
  }
  const gallery = parseMailGallery(await response.text());
  if (!gallery?.items?.length) return { source: "Кино Mail", status: "NO_STILL_FOUND", checkedAt: now(), candidates: [], provenance: { pageUrl: mail.mailUrl, mailId: mail.mailId, galleryPresent: false } };
  const accepted = gallery.items.map((item) => {
    const image = item.large ?? item.base;
    const url = mailImageUrl(image);
    const width = Number(image?.width ?? 0);
    const height = Number(image?.height ?? 0);
    const aspectRatio = width && height ? width / height : null;
    const label = String(item.title ?? gallery.title ?? "");
    const forbidden = /постер|промо|обложк|трейлер|фото:\s*пресс|фотография акт|логотип/iu.test(label);
    const exactTitle = mailTitleMatches(record, gallery.title, item.title);
    if (!url || width < 1_000 || height <= 0 || aspectRatio < 1.3 || forbidden || !exactTitle) return null;
    return { source: "Кино Mail", imageType: "still", url, width, height, aspectRatio, mime: imageTypeFromMime(null, url), hash: null,
      score: Math.round((60 + Math.min(25, width / 100) + Math.min(10, aspectRatio * 3)) * 100) / 100,
      exactExternalId: { type: "mail", value: String(mail.mailId) }, caption: item.title ?? gallery.title ?? null,
      provenance: { pageUrl: mail.mailUrl, mailId: String(mail.mailId), galleryId: gallery.gallery_id ?? null, galleryTitle: gallery.title ?? null, galleryItemId: item.id ?? null, match: "exact-mail-page+gallery+title" },
      reason: "Изображение находится в структурированной галерее «Кадры» точной страницы Кино Mail; постер и прочие блоки страницы не использовались." };
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES);
  return { source: "Кино Mail", status: accepted.length ? "CONFIRMED_STILL" : "NO_STILL_FOUND", checkedAt: now(), candidates: accepted,
    selected: accepted[0] ?? null, exactExternalId: { type: "mail", value: String(mail.mailId) },
    provenance: { pageUrl: mail.mailUrl, mailId: String(mail.mailId), galleryId: gallery.gallery_id ?? null, galleryTitle: gallery.title ?? null, galleryItems: gallery.items.length } };
}

async function fetchJson(client, url, options) {
  const response = await client.fetch(url, options);
  if (!response.ok) throw new Error(`${client.name}: HTTP ${response.status}`);
  return response.json();
}

async function hydrateCandidate(candidate) {
  if (!hydrate || !isHttpUrl(candidate.url) || candidate.hash) return candidate;
  try {
    const response = await clients.image.fetch(candidate.url, { headers: { accept: "image/*" }, timeoutMs: 30_000 }, 3);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const mime = response.headers.get("content-type")?.split(";")[0] ?? null;
    if (!mime?.startsWith("image/")) throw new Error(`unexpected MIME ${mime ?? "unknown"}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    return { ...candidate, mime, bytes: bytes.length, hash: `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`, checkedAt: now() };
  } catch (error) {
    return { ...candidate, mime: candidate.mime ?? null, hash: null, metadataError: String(error?.message ?? error), checkedAt: now() };
  }
}

function tmdbUrl(pathname, query = {}) {
  const url = new URL(`https://api.themoviedb.org/3${pathname}`);
  for (const [key, value] of Object.entries(query)) if (value !== null && value !== undefined) url.searchParams.set(key, value);
  if (!TMDB_TOKEN && TMDB_KEY) url.searchParams.set("api_key", TMDB_KEY);
  return url.href;
}

const tmdbHeaders = () => TMDB_TOKEN ? { Authorization: `Bearer ${TMDB_TOKEN}` } : {};
const isSeries = (record) => record.type === "series" || record.type === "animated-series";

function exactTmdbResult(record, results) {
  const collection = isSeries(record) ? results.tv_results : results.movie_results;
  if (!Array.isArray(collection) || collection.length !== 1) return null;
  const result = collection[0];
  const resultYear = yearOf(result.release_date ?? result.first_air_date);
  if (resultYear && Math.abs(resultYear - record.year) > 1) return null;
  return { media: isSeries(record) ? "tv" : "movie", id: String(result.id), match: "exact-external-id+type+year" };
}

async function resolveTmdb(record) {
  const ids = record.externalIds;
  if (ids.tmdbMovie) return { media: "movie", id: ids.tmdbMovie, match: "exact-tmdb-movie-id" };
  if (ids.tmdbTv) return { media: "tv", id: ids.tmdbTv, match: "exact-tmdb-tv-id" };
  const external = ids.imdb ? [ids.imdb, "imdb_id"] : ids.wikidata ? [ids.wikidata, "wikidata_id"] : null;
  if (!external) return null;
  const payload = await fetchJson(clients.tmdb, tmdbUrl(`/find/${encodeURIComponent(external[0])}`, { external_source: external[1] }), { headers: tmdbHeaders() });
  return exactTmdbResult(record, payload);
}

const tmdbScore = (image) => {
  const pixels = Number(image.width ?? 0) * Number(image.height ?? 0);
  const ratio = Number(image.aspect_ratio ?? (image.width && image.height ? image.width / image.height : 0));
  const landscape = ratio >= 1.35 && ratio <= 2.55 ? 25 : -80;
  const resolution = pixels >= 2_000_000 ? 25 : pixels >= 900_000 ? 15 : pixels >= 400_000 ? 5 : -30;
  const rating = Math.min(25, Number(image.vote_average ?? 0) * 2) + Math.min(10, Math.log10(Number(image.vote_count ?? 0) + 1) * 5);
  return Math.round((landscape + resolution + rating) * 100) / 100;
};

async function researchTmdb(record) {
  if (!TMDB_TOKEN && !TMDB_KEY) return { source: "TMDb", status: "SOURCE_UNAVAILABLE", retryable: true, checkedAt: now(), candidates: [], error: "TMDB_API_TOKEN/TMDB_ACCESS_TOKEN/TMDB_API_KEY отсутствует; запросы не выполнялись" };
  const resolved = await resolveTmdb(record);
  if (!resolved) return { source: "TMDb", status: "UNRESOLVED", checkedAt: now(), candidates: [], error: "точный TMDb match не установлен" };
  const payload = await fetchJson(clients.tmdb, tmdbUrl(`/${resolved.media}/${resolved.id}/images`, { include_image_language: "null,en,ru" }), { headers: tmdbHeaders() });
  const accepted = (payload.backdrops ?? []).map((image) => ({
    source: "TMDb", imageType: "backdrop", url: `https://image.tmdb.org/t/p/original${image.file_path}`,
    width: image.width ?? null, height: image.height ?? null,
    aspectRatio: image.aspect_ratio ?? (image.width && image.height ? image.width / image.height : null),
    mime: imageTypeFromMime(null, image.file_path), hash: null, score: tmdbScore(image),
    rating: { voteAverage: image.vote_average ?? null, voteCount: image.vote_count ?? null },
    exactExternalId: { type: `tmdb-${resolved.media}`, value: resolved.id },
    provenance: { endpoint: `/${resolved.media}/${resolved.id}/images`, match: resolved.match, filePath: image.file_path },
    reason: "TMDb классифицирует изображение как backdrop; posters и logos исключены отдельными массивами API.",
  })).filter((candidate) => candidate.score >= 0).sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES);
  const candidates = [];
  for (const candidate of accepted) candidates.push(await hydrateCandidate(candidate));
  return { source: "TMDb", status: candidates.length ? "CANDIDATE_STILL" : "NO_STILL_FOUND", checkedAt: now(), candidates, resolved,
    excluded: { posters: payload.posters?.length ?? 0, logos: payload.logos?.length ?? 0, rejectedBackdrops: (payload.backdrops?.length ?? 0) - accepted.length } };
}

async function researchNen(record) {
  const current = record.currentImages?.find((image) => image.provenance?.source === "n-e-n.ru editorial material");
  if (!current) return { source: "NEN", status: "UNRESOLVED", checkedAt: now(), candidates: [], note: "В текущем audit-кэше нет редакционно атрибутированного кадра НЭН; сетевой пересбор материалов не выполнялся." };
  const candidate = await hydrateCandidate({ source: "NEN", imageType: "still", url: current.url, width: null, height: null, aspectRatio: null, mime: null, hash: null,
    score: 100, exactExternalId: { type: "catalog-id", value: record.id },
    provenance: { source: "n-e-n.ru", match: "editorial-caption+catalog-title", studios: current.studios ?? [] },
    reason: "Редакционный материал НЭН явно атрибутирует изображение как кадр из произведения." });
  return { source: "NEN", status: "CONFIRMED_STILL", checkedAt: now(), candidates: [candidate] };
}

async function researchKinopoisk(record) {
  if (!record.externalIds.kinopoisk) return { source: "Кинопоиск", status: "UNRESOLVED", checkedAt: now(), candidates: [], error: "нет точного Kinopoisk ID" };
  const pageUrl = `https://www.kinopoisk.ru/film/${record.externalIds.kinopoisk}/stills/`;
  const response = await clients.kinopoisk.fetch(pageUrl, { headers: { accept: "text/html,application/xhtml+xml" }, timeoutMs: 30_000 }, 2);
  const html = await response.text();
  const blocked = !response.ok || /captcha|smartcaptcha|passport\.yandex|войти.*яндекс|включен VPN|в вашей стране доступен не весь каталог/iu.test(html);
  if (blocked) return { source: "Кинопоиск", status: "SOURCE_UNAVAILABLE", checkedAt: now(), candidates: [], exactExternalId: { type: "kinopoisk", value: record.externalIds.kinopoisk },
    error: !response.ok ? `HTTP ${response.status}` : "SSO, защита или региональное предупреждение; ограничения не обходились.", provenance: { pageUrl, blocked: true } };
  const matches = [...html.matchAll(/href=["'](?:https?:)?(\/\/avatars\.mds\.yandex\.net\/get-kinopoisk-image\/[^"']+\/orig)["'][\s\S]{0,350}?(\d{3,5})\s*[×x]\s*(\d{3,5})/giu)];
  const accepted = matches.map((match) => {
    const width = Number(match[2]); const height = Number(match[3]); const aspectRatio = width / height;
    if (width < 1_000 || aspectRatio < 1.3) return null;
    const url = `https:${match[1]}`;
    return { source: "Кинопоиск", imageType: "still", url, width, height, aspectRatio, mime: imageTypeFromMime(null, url), hash: null,
      score: Math.round((55 + Math.min(30, width / 150)) * 100) / 100, exactExternalId: { type: "kinopoisk", value: String(record.externalIds.kinopoisk) },
      provenance: { pageUrl, section: "stills", match: "exact-kinopoisk-id+stills-page" }, reason: "Прямая ссылка «Оригинал» получена только со страницы /stills/ точного Kinopoisk ID." };
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES);
  return { source: "Кинопоиск", status: accepted.length ? "CONFIRMED_STILL" : "NO_STILL_FOUND", checkedAt: now(), candidates: accepted, selected: accepted[0] ?? null,
    exactExternalId: { type: "kinopoisk", value: String(record.externalIds.kinopoisk) }, provenance: { pageUrl, section: "stills" } };
}

const commonsFileName = (value) => typeof value === "string" ? value.replace(/^File:/iu, "") : null;
async function commonsImageInfo(fileName) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({ action: "query", format: "json", origin: "*", prop: "imageinfo", iiprop: "url|size|mime|extmetadata", titles: `File:${fileName}` });
  const payload = await fetchJson(clients.commons, url.href);
  return Object.values(payload.query?.pages ?? {})[0]?.imageinfo?.[0] ?? null;
}
const htmlText = (value) => String(value ?? "").replace(/<[^>]*>/gu, " ").replace(/&[^;]+;/gu, " ").replace(/\s+/gu, " ").trim();

async function researchCommons(record) {
  const qid = record.externalIds.wikidata;
  if (!qid) return { source: "Commons/Wikidata", status: "UNRESOLVED", checkedAt: now(), candidates: [], error: "нет Wikidata QID" };
  const payload = await fetchJson(clients.commons, `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`);
  const entity = payload.entities?.[qid];
  if (!entity) return { source: "Commons/Wikidata", status: "UNRESOLVED", checkedAt: now(), candidates: [], error: "Wikidata entity не найдена" };
  const posterFiles = (entity.claims?.P3383 ?? []).map((claim) => commonsFileName(claim.mainsnak?.datavalue?.value)).filter(Boolean);
  const candidates = [];
  for (const claim of (entity.claims?.P18 ?? []).slice(0, MAX_CANDIDATES)) {
    const fileName = commonsFileName(claim.mainsnak?.datavalue?.value);
    if (!fileName || posterFiles.includes(fileName)) continue;
    const info = await commonsImageInfo(fileName);
    if (!info?.url) continue;
    const description = htmlText(info.extmetadata?.ImageDescription?.value);
    const roleQualified = Boolean(claim.qualifiers?.P14672?.length);
    const ratio = info.width && info.height ? info.width / info.height : null;
    const explicitlyStill = roleQualified || /film still|movie still|screenshot|screen capture|стоп.?кадр|кадр из/iu.test(description);
    const rejected = /poster|постер|logo|логотип|cover|обложк|collage|коллаж|title card/iu.test(`${fileName} ${description}`) || (ratio && ratio < 1.2);
    if (rejected) continue;
    candidates.push(await hydrateCandidate({ source: "Commons/Wikidata", imageType: explicitlyStill ? "still" : "unclassified-image", url: info.url,
      width: info.width ?? null, height: info.height ?? null, aspectRatio: ratio, mime: info.mime ?? null, hash: null, score: explicitlyStill ? 85 : ratio >= 1.35 ? 45 : 20,
      exactExternalId: { type: "wikidata", value: qid }, provenance: { qid, property: "P18", commonsFile: fileName, roleQualified, description },
      reason: explicitlyStill ? "P18 явно описан/квалифицирован как кадр." : "P18 связан с точным QID, но тип изображения требует редакционной проверки." }));
  }
  return { source: "Commons/Wikidata", status: candidates.length ? "CANDIDATE_STILL" : posterFiles.length ? "POSTER_ONLY" : "NO_STILL_FOUND", checkedAt: now(),
    candidates: candidates.sort((a, b) => b.score - a.score), excluded: { posters: posterFiles.length }, exactExternalId: { type: "wikidata", value: qid } };
}

function finalStatus(record, sources) {
  const candidates = sources.flatMap((source) => source.candidates ?? []);
  if (sources.some((source) => source.status === "CONFIRMED_STILL")) return "CONFIRMED_STILL";
  if (sources.some((source) => source.status === "CANDIDATE_STILL") || candidates.some((candidate) => candidate.imageType === "backdrop" || candidate.imageType === "still")) return "CANDIDATE_STILL";
  if (record.currentFrameClassification === "CURRENT_FRAME_IS_POSTER" || sources.some((source) => source.status === "POSTER_ONLY")) return "POSTER_ONLY";
  if (sources.some((source) => source.status === "NO_STILL_FOUND")) return "NO_STILL_FOUND";
  if (sources.some((source) => source.status === "SOURCE_UNAVAILABLE")) return "SOURCE_UNAVAILABLE";
  return "UNRESOLVED";
}

const recordFromAudit = (item) => ({ id: item.id, title: item.title, originalTitle: item.originalTitle, year: item.year, type: item.type,
  externalIds: item.externalIds ?? {}, currentImages: item.currentImages ?? [],
  currentFrameClassification: item.poster?.present ? "CURRENT_FRAME_IS_POSTER" : item.status === "A" ? "CONFIRMED_CURRENT_STILL" : "NO_CURRENT_IMAGE" });

async function applyConfirmedWebResearch(catalog) {
  const research = await readJson(paths.webResearchReport, null);
  if (!research?.items || research.summary?.confirmed !== 846) throw new Error("Ожидался проверенный web-research с 846 CONFIRMED_STILL.");
  const byId = new Map(catalog.map((record) => [record.id, record]));
  const confirmed = research.items.filter((item) => item.status === "CONFIRMED_STILL");
  const urlCounts = new Map();
  for (const item of confirmed) if (item.imageUrl) urlCounts.set(item.imageUrl, (urlCounts.get(item.imageUrl) ?? 0) + 1);
  const accepted = [];
  const rejected = [];
  const forbidden = /poster|постер|cover|облож|logo|логотип|fan.?art|wallpaper|promo|banner|portrait|headshot|actor|actress|director|trailer|teaser|pinterest/iu;
  let completed = 0;
  async function validateOne(item) {
    const record = byId.get(item.watchId);
    const reasons = [];
    if (!record) reasons.push("карточка отсутствует в актуальном каталоге");
    if (!item.imageUrl || !isHttpUrl(item.imageUrl)) reasons.push("нет корректного URL изображения");
    if (!item.pageUrl || !isHttpUrl(item.pageUrl)) reasons.push("нет корректного URL страницы-источника");
    if (record && normalizeTitle(record.originalTitle) !== normalizeTitle(item.originalTitle)) reasons.push("originalTitle не совпадает с актуальной карточкой");
    if (record && Number(record.year) !== Number(item.year)) reasons.push("год не совпадает с актуальной карточкой");
    if (!item.evidence?.titleMatch || !item.evidence?.yearMatch || !item.evidence?.stillSignal) reasons.push("неполное evidence: нужны title, year и still/scene signal");
    if (forbidden.test(`${item.imageUrl ?? ""} ${item.pageUrl ?? ""} ${item.reason ?? ""}`)) reasons.push("URL/provenance содержит признаки постера, промо, портрета или фан-арта");
    if ((urlCounts.get(item.imageUrl) ?? 0) > 1) reasons.push("один URL связан с несколькими карточками");
    let probe = null;
    if (!reasons.length) {
      try {
        const response = await clients.image.fetch(item.imageUrl, { headers: { accept: "image/*", referer: item.pageUrl }, timeoutMs: 30_000 }, 2);
        if (!response.ok) reasons.push(`изображение недоступно: HTTP ${response.status}`);
        else {
          const mime = response.headers.get("content-type")?.split(";")[0]?.toLowerCase() ?? null;
          if (!mime?.startsWith("image/")) reasons.push(`неверный MIME: ${mime ?? "не указан"}`);
          const bytes = Buffer.from(await response.arrayBuffer());
          const dimensions = imageDimensions(bytes, mime);
          const aspectRatio = dimensions.width && dimensions.height ? dimensions.width / dimensions.height : null;
          const hash = `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
          probe = { mime, bytes: bytes.length, ...dimensions, aspectRatio, hash, checkedAt: now() };
          if (!dimensions.width || !dimensions.height) reasons.push("не удалось определить размеры изображения");
          else {
            if (dimensions.width < 1_000) reasons.push(`ширина меньше 1000 px: ${dimensions.width}`);
            if (aspectRatio < 1.3) reasons.push(`изображение не горизонтальное: ${aspectRatio.toFixed(3)}`);
            if (aspectRatio > 3) reasons.push(`слишком широкий рекламный формат: ${aspectRatio.toFixed(3)}`);
          }
        }
      } catch (error) { reasons.push(`ошибка загрузки: ${String(error?.message ?? error)}`); }
    }
    const result = { ...item, probe, validatedAt: now() };
    if (reasons.length) rejected.push({ ...result, reasons }); else accepted.push(result);
    completed += 1;
    if (completed % 25 === 0) console.log(`validated ${completed}/${confirmed.length}; accepted ${accepted.length}; rejected ${rejected.length}`);
  }
  let cursor = 0;
  const workers = Array.from({ length: 8 }, async () => {
    while (cursor < confirmed.length) {
      const item = confirmed[cursor]; cursor += 1;
      await validateOne(item);
    }
  });
  await Promise.all(workers);
  const byHash = new Map();
  for (const item of accepted) {
    if (!byHash.has(item.probe.hash)) byHash.set(item.probe.hash, []);
    byHash.get(item.probe.hash).push(item);
  }
  const duplicateHashes = new Set([...byHash].filter(([, items]) => items.length > 1).map(([hash]) => hash));
  const finalAccepted = [];
  for (const item of accepted) {
    if (duplicateHashes.has(item.probe.hash)) rejected.push({ ...item, reasons: ["одинаковое содержимое изображения связано с несколькими карточками"] });
    else finalAccepted.push(item);
  }
  const acceptedById = new Map(finalAccepted.map((item) => [item.watchId, item]));
  const updated = catalog.map((record) => {
    const item = acceptedById.get(record.id);
    if (!item) return record;
    const studios = Array.isArray(record.frame?.studios) && record.frame.studios.length ? record.frame.studios : null;
    return { ...record, frame: { url: item.imageUrl, ...(studios ? { studios: [...studios] } : {}) } };
  });
  await writeJsonAtomic(paths.catalog, updated);
  await writeJsonAtomic(paths.webApplyReport, {
    generatedAt: now(), mode: "apply-web-confirmed-only", totalCatalog: updated.length,
    confirmedFound: confirmed.length, applied: finalAccepted.length, rejected: rejected.length,
    candidatesNotApplied: research.items.filter((item) => item.status === "CANDIDATE_STILL").length,
    appliedItems: finalAccepted, rejectedItems: rejected,
  });
  console.log(JSON.stringify({ confirmedFound: confirmed.length, applied: finalAccepted.length, rejected: rejected.length, candidatesNotApplied: research.items.filter((item) => item.status === "CANDIDATE_STILL").length }, null, 2));
}

async function applyWebResearchBacklog(catalog) {
  const [research, previousApply] = await Promise.all([
    readJson(paths.webResearchReport, null),
    readJson(paths.webApplyReport, null),
  ]);
  if (!research?.items || !previousApply?.rejectedItems) throw new Error("Нужны существующие web-research и web-apply отчёты.");
  const byId = new Map(catalog.map((record) => [record.id, record]));
  const currentUrls = new Map(catalog.filter((record) => record.frame?.url).map((record) => [record.frame.url, record.id]));
  const candidates = research.items.filter((item) => item.status === "CANDIDATE_STILL");
  const recoverableRejected = previousApply.rejectedItems.filter((item) => {
    const reasons = item.reasons ?? [];
    return item.probe?.width >= 800 && item.probe?.aspectRatio >= 1.3 && item.probe?.aspectRatio <= 3
      && reasons.length > 0 && reasons.every((reason) => /^ширина меньше 1000 px:/u.test(reason));
  });
  const queue = [
    ...candidates.map((item) => ({ ...item, backlogGroup: "candidate" })),
    ...recoverableRejected.map((item) => ({ ...item, backlogGroup: "revalidated-resolution" })),
  ];
  const accepted = [];
  const rejected = [];
  const forbidden = /poster|постер|cover|облож|logo|логотип|fan.?art|wallpaper|promo|banner|portrait|headshot|actor|actress|director|trailer|teaser|pinterest/iu;
  let cursor = 0;
  async function validate(item) {
    const record = byId.get(item.watchId);
    const reasons = [];
    if (!record?.frame || currentUrls.get(item.imageUrl) !== record.id) {
      const owner = currentUrls.get(item.imageUrl);
      if (owner && owner !== item.watchId) reasons.push(`URL уже используется карточкой ${owner}`);
    }
    if (!record) reasons.push("карточка отсутствует");
    if (!isHttpUrl(item.pageUrl) || !isHttpUrl(item.imageUrl)) reasons.push("нет корректного URL страницы или изображения");
    if (record && normalizeTitle(record.originalTitle) !== normalizeTitle(item.originalTitle)) reasons.push("originalTitle не совпадает");
    if (record && Number(record.year) !== Number(item.year)) reasons.push("год карточки не совпадает");
    if (forbidden.test(`${item.imageUrl ?? ""} ${item.pageUrl ?? ""}`)) reasons.push("URL содержит признак неподходящего типа изображения");
    let pageEvidence = null;
    if (!reasons.length && item.backlogGroup === "candidate") {
      try {
        const pageResponse = await clients.image.fetch(item.pageUrl, { headers: { accept: "text/html,application/xhtml+xml" }, timeoutMs: 30_000 }, 2);
        if (!pageResponse.ok) reasons.push(`страница-источник недоступна: HTTP ${pageResponse.status}`);
        else {
          const html = decodeHtml(await pageResponse.text());
          const normalizedHtml = normalizeTitle(html.replace(/<[^>]+>/gu, " "));
          const normalizedOriginal = normalizeTitle(record.originalTitle);
          const titleMatch = normalizedOriginal.length >= 3 && normalizedHtml.includes(normalizedOriginal);
          const yearMatch = new RegExp(`(?:^|\\D)${record.year}(?:\\D|$)`, "u").test(html);
          const stillSignal = /\bstill(?:s)?\b|film image|scene|screenshot|screen capture|кадр(?:ы|а|ов)?\b/iu.test(html);
          pageEvidence = { titleMatch, yearMatch, stillSignal, checkedAt: now() };
          if (!titleMatch) reasons.push("страница не подтверждает originalTitle");
          if (!yearMatch) reasons.push("страница не подтверждает год");
          if (!stillSignal) reasons.push("страница не подтверждает, что изображение является кадром");
        }
      } catch (error) { reasons.push(`ошибка страницы-источника: ${String(error?.message ?? error)}`); }
    }
    let probe = item.probe ?? null;
    if (!reasons.length) {
      try {
        const response = await clients.image.fetch(item.imageUrl, { headers: { accept: "image/*", referer: item.pageUrl }, timeoutMs: 30_000 }, 2);
        if (!response.ok) reasons.push(`изображение недоступно: HTTP ${response.status}`);
        else {
          const mime = response.headers.get("content-type")?.split(";")[0]?.toLowerCase() ?? null;
          const bytes = Buffer.from(await response.arrayBuffer());
          const dimensions = imageDimensions(bytes, mime);
          const aspectRatio = dimensions.width && dimensions.height ? dimensions.width / dimensions.height : null;
          probe = { mime, bytes: bytes.length, ...dimensions, aspectRatio, hash: `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`, checkedAt: now() };
          if (!mime?.startsWith("image/")) reasons.push(`неверный MIME: ${mime ?? "не указан"}`);
          if (!dimensions.width || !dimensions.height) reasons.push("не удалось определить размеры");
          else {
            if (dimensions.width < 800) reasons.push(`ширина меньше 800 px: ${dimensions.width}`);
            if (aspectRatio < 1.3 || aspectRatio > 3) reasons.push(`неподходящие пропорции: ${aspectRatio.toFixed(3)}`);
          }
        }
      } catch (error) { reasons.push(`ошибка загрузки: ${String(error?.message ?? error)}`); }
    }
    const result = { ...item, pageEvidence, probe, validatedAt: now() };
    if (reasons.length) rejected.push({ ...result, reasons }); else accepted.push(result);
  }
  const workers = Array.from({ length: 6 }, async () => {
    while (cursor < queue.length) { const item = queue[cursor]; cursor += 1; await validate(item); }
  });
  await Promise.all(workers);
  const duplicateHashes = new Set(accepted.map((item) => item.probe.hash).filter((hash, index, all) => all.indexOf(hash) !== index));
  const finalAccepted = accepted.filter((item) => {
    if (!duplicateHashes.has(item.probe.hash)) return true;
    rejected.push({ ...item, reasons: ["одинаковое содержимое связано с несколькими карточками"] }); return false;
  });
  const acceptedById = new Map(finalAccepted.map((item) => [item.watchId, item]));
  const updated = catalog.map((record) => {
    const item = acceptedById.get(record.id);
    if (!item) return record;
    const studios = Array.isArray(record.frame?.studios) && record.frame.studios.length ? record.frame.studios : null;
    return { ...record, frame: { url: item.imageUrl, ...(studios ? { studios: [...studios] } : {}) } };
  });
  await writeJsonAtomic(paths.catalog, updated);
  await writeJsonAtomic(paths.webBacklogApplyReport, {
    generatedAt: now(), totalCatalog: updated.length, reviewedCandidates: candidates.length,
    reconsideredRejected: recoverableRejected.length, applied: finalAccepted.length, rejected: rejected.length,
    appliedItems: finalAccepted, rejectedItems: rejected,
  });
  console.log(JSON.stringify({ reviewedCandidates: candidates.length, reconsideredRejected: recoverableRejected.length, applied: finalAccepted.length, rejected: rejected.length }, null, 2));
}

async function applyTailReview(catalog) {
  const review = await readJson(paths.tailReviewReport, null);
  const previousApply = await readJson(paths.tailApplyReport, { appliedItems: [] });
  if (!Array.isArray(review?.items)) throw new Error("Нужен data/reports/watch-stills-tail-review.json.");
  const byId = new Map(catalog.map((record) => [record.id, record]));
  const existingUrls = new Map(catalog.filter((record) => record.frame?.url).map((record) => [record.frame.url, record.id]));
  const accepted = [];
  const rejected = [];
  const forbidden = /poster|постер|cover|облож|logo|логотип|fan.?art|wallpaper|banner|portrait|headshot|actor|actress|director|trailer|teaser|pinterest/iu;
  for (const item of review.items) {
    const record = byId.get(item.watchId);
    const reasons = [];
    const previous = (previousApply.appliedItems ?? []).find((entry) => entry.watchId === item.watchId && entry.imageUrl === item.imageUrl);
    if (record?.frame?.url === item.imageUrl && previous?.probe?.hash) {
      accepted.push({ ...item, probe: previous.probe, validatedAt: previous.validatedAt, reusedValidation: true });
      continue;
    }
    if (!record) reasons.push("карточка отсутствует");
    if (!isHttpUrl(item.pageUrl) || !isHttpUrl(item.imageUrl)) reasons.push("нет корректного URL страницы или изображения");
    if (record && normalizeTitle(record.originalTitle) !== normalizeTitle(item.originalTitle)) reasons.push("originalTitle не совпадает");
    if (record && Number(record.year) !== Number(item.year)) reasons.push("год карточки не совпадает");
    const owner = existingUrls.get(item.imageUrl);
    if (owner && owner !== item.watchId) reasons.push(`URL уже используется карточкой ${owner}`);
    if (forbidden.test(`${item.imageUrl ?? ""} ${item.pageUrl ?? ""}`)) reasons.push("URL содержит признак неподходящего типа изображения");
    let probe = null;
    if (!reasons.length) {
      try {
        const response = await clients.image.fetch(item.imageUrl, { headers: { accept: "image/*", referer: item.pageUrl }, timeoutMs: 30_000 }, 2);
        if (!response.ok) reasons.push(`изображение недоступно: HTTP ${response.status}`);
        else {
          const mime = response.headers.get("content-type")?.split(";")[0]?.toLowerCase() ?? null;
          const bytes = Buffer.from(await response.arrayBuffer());
          const dimensions = imageDimensions(bytes, mime);
          const aspectRatio = dimensions.width && dimensions.height ? dimensions.width / dimensions.height : null;
          probe = { mime, bytes: bytes.length, ...dimensions, aspectRatio, hash: `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`, checkedAt: now() };
          if (!mime?.startsWith("image/")) reasons.push(`неверный MIME: ${mime ?? "не указан"}`);
          if (!dimensions.width || !dimensions.height) reasons.push("не удалось определить размеры");
          else {
            if (dimensions.width < 800) reasons.push(`ширина меньше 800 px: ${dimensions.width}`);
            if (aspectRatio < 1.3 || aspectRatio > 3) reasons.push(`неподходящие пропорции: ${aspectRatio.toFixed(3)}`);
          }
        }
      } catch (error) { reasons.push(`ошибка загрузки: ${String(error?.message ?? error)}`); }
    }
    const result = { ...item, probe, validatedAt: now() };
    if (reasons.length) rejected.push({ ...result, reasons }); else accepted.push(result);
  }
  const hashes = new Map();
  for (const item of accepted) {
    if (!hashes.has(item.probe.hash)) hashes.set(item.probe.hash, []);
    hashes.get(item.probe.hash).push(item.watchId);
  }
  const duplicateHashes = new Set([...hashes].filter(([, ids]) => ids.length > 1).map(([hash]) => hash));
  const finalAccepted = accepted.filter((item) => {
    if (!duplicateHashes.has(item.probe.hash)) return true;
    rejected.push({ ...item, reasons: ["одинаковое содержимое связано с несколькими карточками"] });
    return false;
  });
  const acceptedById = new Map(finalAccepted.map((item) => [item.watchId, item]));
  const updated = catalog.map((record) => {
    const item = acceptedById.get(record.id);
    if (!item) return record;
    const studios = Array.isArray(record.frame?.studios) && record.frame.studios.length ? record.frame.studios : null;
    return { ...record, frame: { url: item.imageUrl, ...(studios ? { studios: [...studios] } : {}) } };
  });
  await writeJsonAtomic(paths.catalog, updated);
  await writeJsonAtomic(paths.tailApplyReport, { generatedAt: now(), totalCatalog: updated.length, reviewed: review.items.length,
    applied: finalAccepted.length, rejected: rejected.length, appliedItems: finalAccepted, rejectedItems: rejected });
  console.log(JSON.stringify({ reviewed: review.items.length, applied: finalAccepted.length, rejected: rejected.length }, null, 2));
}

const catalog = await readJson(paths.catalog, []);
if (applyWebConfirmed) { await applyConfirmedWebResearch(catalog); process.exit(0); }
if (applyWebBacklog) { await applyWebResearchBacklog(catalog); process.exit(0); }
if (applyTailConfirmed) { await applyTailReview(catalog); process.exit(0); }
const audit = await readJson(paths.audit, null);
if (!audit || audit.total !== catalog.length || audit.items?.length !== catalog.length) throw new Error("Нужен актуальный data/reports/watch-stills-audit.json.");
const mailSource = await readJson(paths.mailSource, { items: [] });
const mailComparison = await readJson(paths.mailComparison, { groups: {} });
const mailById = new Map((mailSource.items ?? []).map((item) => [String(item.mailId), item]));
const mailByWatchId = new Map([...(mailComparison.groups?.existing ?? []), ...(mailComparison.groups?.differentTitle ?? [])]
  .filter((item) => item.comparison?.watch?.id && item.comparison?.confidence === "high")
  .map((item) => [item.comparison.watch.id, mailById.get(String(item.mailId)) ?? item]));

const cache = await readJson(paths.cache, { schemaVersion: 1, createdAt: now(), records: {}, sourceState: {} });
cache.schemaVersion = 1; cache.updatedAt = now();
cache.sourceState.tmdb = TMDB_TOKEN || TMDB_KEY ? { available: true, checkedAt: now(), authentication: TMDB_TOKEN ? "bearer-token" : "api-key" }
  : { available: false, checkedAt: now(), reason: "TMDb credential отсутствует" };

const hasResearchId = (record) => Boolean(record.externalIds.mail || mailByWatchId.has(record.id) || record.externalIds.tmdbMovie || record.externalIds.tmdbTv || record.externalIds.imdb || record.externalIds.wikidata || record.externalIds.kinopoisk);
const inScope = (record) => scope === "all-missing"
  ? record.currentFrameClassification !== "CONFIRMED_CURRENT_STILL"
  : record.currentFrameClassification === "CURRENT_FRAME_IS_POSTER" || record.currentFrameClassification === "CONFIRMED_CURRENT_STILL";
const prioritized = audit.items.map(recordFromAudit).filter((record) => hasResearchId(record) && inScope(record)).sort((a, b) => {
  if (a.currentFrameClassification === "CONFIRMED_CURRENT_STILL" && b.currentFrameClassification !== "CONFIRMED_CURRENT_STILL") return -1;
  if (b.currentFrameClassification === "CONFIRMED_CURRENT_STILL" && a.currentFrameClassification !== "CONFIRMED_CURRENT_STILL") return 1;
  const rank = (record) => record.externalIds.tmdbMovie || record.externalIds.tmdbTv ? 0 : record.externalIds.imdb ? 1 : record.externalIds.wikidata ? 2 : 3;
  return rank(a) - rank(b) || a.id.localeCompare(b.id, "en");
}).slice(0, limit);

let completedSinceSave = 0;
for (const record of prioritized) {
  const cached = cache.records[record.id] ?? { id: record.id, sources: {} };
  const adapters = [["nen", () => researchNen(record)], ["mail", () => researchMail(record)], ["tmdb", () => researchTmdb(record)], ["kinopoisk", () => researchKinopoisk(record)], ["commons", () => researchCommons(record)]];
  for (const [key, task] of adapters) {
    if (key === "mail" && record.currentFrameClassification === "CONFIRMED_CURRENT_STILL") { delete cached.sources[key]; continue; }
    if (key === "kinopoisk" && (!record.externalIds.kinopoisk || cached.sources.nen?.status === "CONFIRMED_STILL" || cached.sources.mail?.status === "CONFIRMED_STILL")) { delete cached.sources[key]; continue; }
    if (!enabledSources.has(key) || (!refresh && cached.sources[key]?.completed)) continue;
    try {
      const result = await task();
      cached.sources[key] = { ...result, completed: !(result.status === "SOURCE_UNAVAILABLE" && result.retryable) };
    }
    catch (error) { cached.sources[key] = { source: key, status: "SOURCE_UNAVAILABLE", candidates: [], completed: false, checkedAt: now(), error: String(error?.message ?? error) }; }
  }
  cached.updatedAt = now(); cache.records[record.id] = cached; completedSinceSave += 1;
  if (completedSinceSave >= 10) { await writeJsonAtomic(paths.cache, cache); completedSinceSave = 0; }
}
await writeJsonAtomic(paths.cache, cache);

const researchItems = prioritized.map((record) => {
  const sourceResults = Object.entries(cache.records[record.id]?.sources ?? {}).filter(([key]) => enabledSources.has(key)).map(([, value]) => value);
  const candidates = sourceResults.flatMap((source) => source.candidates ?? []).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return { ...record, sources: sourceResults, candidates, status: finalStatus(record, sourceResults) };
});
const statuses = ["CONFIRMED_STILL", "CANDIDATE_STILL", "POSTER_ONLY", "NO_STILL_FOUND", "SOURCE_UNAVAILABLE", "UNRESOLVED"];
const byStatus = Object.fromEntries(statuses.map((status) => [status, researchItems.filter((item) => item.status === status).length]));
const sourceNames = ["NEN", "Кино Mail", "TMDb", "Кинопоиск", "Commons/Wikidata"];
const sourceLabel = (value) => ({ nen: "NEN", mail: "Кино Mail", tmdb: "TMDb", kinopoisk: "Кинопоиск", commons: "Commons/Wikidata" })[value] ?? value;
const candidateCountBySource = Object.fromEntries(sourceNames.map((source) => [source, researchItems.flatMap((item) => item.candidates).filter((candidate) => candidate.source === source).length]));
const cardsWithCandidatesBySource = Object.fromEntries(sourceNames.map((source) => [source, researchItems.filter((item) => item.candidates.some((candidate) => candidate.source === source)).length]));
const sourceStatusCounts = Object.fromEntries(sourceNames.map((source) => [source, Object.fromEntries(statuses.map((status) => [status,
  researchItems.flatMap((item) => item.sources).filter((result) => sourceLabel(result.source) === source && result.status === status).length,
]))]));
const potentiallyClosable = researchItems.filter((item) => item.status === "CONFIRMED_STILL" || item.status === "CANDIDATE_STILL").length;
const mailPosterItems = researchItems.filter((item) => item.currentFrameClassification === "CURRENT_FRAME_IS_POSTER");
const mailResultFor = (item) => item.sources.find((source) => sourceLabel(source.source) === "Кино Mail");
const kinopoiskResultFor = (item) => item.sources.find((source) => sourceLabel(source.source) === "Кинопоиск");
const practicalSummary = {
  totalCatalog: catalog.length,
  existingNenConfirmed: audit.summary?.confirmedGoodStills ?? 0,
  currentMailPosterFrames: audit.summary?.importedMailCoversStoredAsFrames ?? mailPosterItems.length,
  mailPagesChecked: mailPosterItems.filter((item) => mailResultFor(item)?.checkedAt).length,
  mailConfirmed: mailPosterItems.filter((item) => mailResultFor(item)?.status === "CONFIRMED_STILL").length,
  mailNoStill: mailPosterItems.filter((item) => mailResultFor(item)?.status === "NO_STILL_FOUND").length,
  mailUnavailable: mailPosterItems.filter((item) => mailResultFor(item)?.status === "SOURCE_UNAVAILABLE").length,
  kinopoiskPagesChecked: mailPosterItems.filter((item) => kinopoiskResultFor(item)?.provenance?.pageUrl).length,
  kinopoiskConfirmed: mailPosterItems.filter((item) => kinopoiskResultFor(item)?.status === "CONFIRMED_STILL").length,
  kinopoiskUnavailable: mailPosterItems.filter((item) => kinopoiskResultFor(item)?.status === "SOURCE_UNAVAILABLE").length,
};
practicalSummary.newConfirmed = mailPosterItems.filter((item) => item.status === "CONFIRMED_STILL").length;
practicalSummary.readyForApply = practicalSummary.newConfirmed;
practicalSummary.noStillFound = mailPosterItems.filter((item) => ["NO_STILL_FOUND", "SOURCE_UNAVAILABLE", "UNRESOLVED", "POSTER_ONLY"].includes(item.status)).length;
const currentPosterFrames = audit.items.filter((item) => item.poster?.present).map((item) => ({
  id: item.id, title: item.title, originalTitle: item.originalTitle, year: item.year, type: item.type,
  marker: "CURRENT_FRAME_IS_POSTER", url: item.poster.url,
  reason: "Кино Mail imageUrl импортировался и проверялся как обложка; он не подтверждён как кадр.",
}));
const existingConfirmedStills = audit.items.filter((item) => item.status === "A").map((item) => ({
  id: item.id, title: item.title, url: item.currentImages?.[0]?.url ?? null,
  provenance: item.currentImages?.[0]?.provenance ?? null,
}));

const report = { generatedAt: now(), mode: "research-only; catalog unchanged", totalCatalog: catalog.length, eligibleByExactId: prioritized.length,
  credentials: { tmdbConfigured: Boolean(TMDB_TOKEN || TMDB_KEY) },
  baseline: { confirmedStillsInCatalog: audit.summary?.confirmedGoodStills ?? 0, noConfirmedStillInCatalog: audit.summary?.noConfirmedStill ?? catalog.length },
  summary: { researchedByExactId: researchItems.length, byStatus, candidates: researchItems.reduce((sum, item) => sum + item.candidates.length, 0), candidateCountBySource, cardsWithCandidatesBySource, sourceStatusCounts, potentiallyClosable, practical: practicalSummary,
    newlyPotentiallyClosable: practicalSummary.newConfirmed,
    tmdbTechnicalUpperBound: researchItems.filter((item) => item.externalIds.tmdbMovie || item.externalIds.tmdbTv || item.externalIds.imdb || item.externalIds.wikidata).length,
    currentFrameIsPoster: currentPosterFrames.length },
  cache: { path: "data/reports/cache/watch-stills-research-evidence.json", resumable: true, records: Object.keys(cache.records).length },
  existingConfirmedStills, currentPosterFrames, items: researchItems };

const markdown = ["# Исследование кадров watch-каталога", "", `Сформировано: ${report.generatedAt}`, "", "> Research-only: watch-v2.json, generated-каталог и Production не изменялись.", "",
  "## Статистика", "", `- Всего карточек: **${catalog.length}**`, `- Подтверждённых кадров до исследования: **${report.baseline.confirmedStillsInCatalog}**`, `- Исследовано по точным ID: **${researchItems.length}**`,
  `- CONFIRMED_STILL: **${byStatus.CONFIRMED_STILL}**`, `- CANDIDATE_STILL: **${byStatus.CANDIDATE_STILL}**`, `- POSTER_ONLY: **${byStatus.POSTER_ONLY}**`,
  `- NO_STILL_FOUND: **${byStatus.NO_STILL_FOUND}**`, `- SOURCE_UNAVAILABLE: **${byStatus.SOURCE_UNAVAILABLE}**`, `- UNRESOLVED: **${byStatus.UNRESOLVED}**`,
  `- Всего кандидатов: **${report.summary.candidates}**`, `- Новых потенциально закрываемых карточек: **${report.summary.newlyPotentiallyClosable}**`, `- Верхняя TMDb-граница после подключения token: **${report.summary.tmdbTechnicalUpperBound}**`, "", "## Источники", "",
  ...Object.entries(candidateCountBySource).map(([source, count]) => `- ${source}: ${count} кандидатов для ${cardsWithCandidatesBySource[source]} карточек`), "", "## Техническое состояние", "",
  ...sourceNames.map((source) => `- ${source}: ${JSON.stringify(sourceStatusCounts[source])}`), "",
  `- TMDb credential: **${report.credentials.tmdbConfigured ? "настроен" : "не настроен"}**`, "- Evidence-кэш атомарно сохраняется каждые 10 карточек.",
  "- 429/5xx обрабатываются retry и exponential backoff.", "- `--refresh` повторяет источник; без флага завершённые результаты не запрашиваются повторно.",
  "- `--max=N` ограничивает пакет; `--sources=nen,mail,kinopoisk` выбирает адаптеры текущего прохода.",
  "- По умолчанию изображения не скачиваются; `--hash` явно включает проверку MIME и SHA-256.", "",
  "## Практический проход Кино Mail", "", `- Проверено страниц Кино Mail: **${practicalSummary.mailPagesChecked}**`,
  `- Кадр найден: **${practicalSummary.mailConfirmed}**`, `- Кадр не найден: **${practicalSummary.mailNoStill}**`, `- Источник недоступен: **${practicalSummary.mailUnavailable}**`,
  `- Проверено резервных страниц Кинопоиска: **${practicalSummary.kinopoiskPagesChecked}**`, `- Кадр найден на Кинопоиске: **${practicalSummary.kinopoiskConfirmed}**`,
  `- Кинопоиск недоступен: **${practicalSummary.kinopoiskUnavailable}**`, `- Готовы к отдельному apply: **${practicalSummary.readyForApply}**`, "",
  "## Текущие обложки в frame", "", `- CURRENT_FRAME_IS_POSTER: **${currentPosterFrames.length}**`,
  "- Они не удалялись и не считались кадрами. Полный список сохранён в JSON.", "",
  "Полные evidence, ошибки, исключённые posters/logos и provenance находятся в JSON-отчёте и кэше.", ""].join("\n");

await writeJsonAtomic(paths.report, report);
await fs.writeFile(paths.markdown, markdown, "utf8");
if (mode === "apply") {
  const researchById = new Map(researchItems.map((item) => [item.id, item]));
  const applied = [];
  const skipped = [];
  const updatedCatalog = catalog.map((record) => {
    const researched = researchById.get(record.id);
    if (!researched || researched.currentFrameClassification === "CONFIRMED_CURRENT_STILL") return record;
    const confirmedSources = researched.sources.filter((source) => source.status === "CONFIRMED_STILL" && ["Кино Mail", "Кинопоиск"].includes(sourceLabel(source.source)));
    const chosenSource = confirmedSources.find((source) => source.selected?.url) ?? confirmedSources.find((source) => source.candidates?.[0]?.url);
    const chosen = chosenSource?.selected ?? chosenSource?.candidates?.[0];
    if (!chosen?.url || chosen.width < 1_000 || chosen.aspectRatio < 1.3) return record;
    const studios = Array.isArray(record.studios) && record.studios.length ? record.studios : record.frame?.studios;
    applied.push({ id: record.id, title: record.title, previousUrl: record.frame?.url ?? null, frame: chosen, source: sourceLabel(chosenSource.source), appliedAt: now() });
    return { ...record, frame: { url: chosen.url, ...(Array.isArray(studios) && studios.length ? { studios: [...studios] } : {}) } };
  });
  await writeJsonAtomic(paths.catalog, updatedCatalog);
  const allApplied = updatedCatalog.flatMap((record) => {
    const sources = Object.values(cache.records?.[record.id]?.sources ?? {});
    for (const source of sources) {
      if (source.status !== "CONFIRMED_STILL") continue;
      const candidate = (source.candidates ?? []).find((item) => item.url === record.frame?.url);
      if (candidate && ["Кино Mail", "Кинопоиск"].includes(sourceLabel(source.source))) return [{ id: record.id, title: record.title, frame: candidate, source: sourceLabel(source.source) }];
    }
    return [];
  });
  await writeJsonAtomic(paths.applyReport, { generatedAt: now(), mode: "apply-confirmed-only", totalCatalog: updatedCatalog.length, appliedThisRun: applied.length, appliedCount: allApplied.length, skippedCount: skipped.length, applied: allApplied, skipped });
  console.log(JSON.stringify({ appliedThisRun: applied.length, appliedCount: allApplied.length, skippedCount: skipped.length, catalogTotal: updatedCatalog.length, applyReport: path.relative(root, paths.applyReport) }, null, 2));
}
console.log(JSON.stringify(report.summary, null, 2));
