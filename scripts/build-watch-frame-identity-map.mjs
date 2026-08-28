import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportDir = path.join(root, "data", "reports");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data", "source", "watch-v2.json"), "utf8"));
const unresolvedReport = JSON.parse(fs.readFileSync(path.join(reportDir, "watch-stills-unresolved.json"), "utf8"));
const unresolved = unresolvedReport.items ?? unresolvedReport;
const unresolvedById = new Map(unresolved.map((item) => [item.id ?? item.watchId, item]));
const targetIds = new Set(unresolvedById.keys());
const evidence = new Map([...targetIds].map((id) => [id, { imageUrls: new Set(), sourceUrls: new Set(), notes: new Set() }]));

function addUrl(bucket, value, key = "sourceUrls") {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return;
  bucket[key].add(value);
}

function walk(value, inheritedId = null) {
  if (!value || typeof value !== "object") return;
  const currentId = value.watchId ?? value.id ?? inheritedId;
  const bucket = targetIds.has(currentId) ? evidence.get(currentId) : null;
  if (bucket) {
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === "string") {
        if (/imageUrl|frameUrl|posterUrl/i.test(key)) addUrl(bucket, entry, "imageUrls");
        else if (/pageUrl|sourceUrl|videoUrl/i.test(key)) addUrl(bucket, entry, "sourceUrls");
        else if (/reason|error|match|outcome/i.test(key) && entry.length < 1000) bucket.notes.add(entry);
      }
    }
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) walk(child, currentId);
}

for (const name of fs.readdirSync(reportDir).filter((name) => /^watch-stills-.*\.json$/i.test(name))) {
  try { walk(JSON.parse(fs.readFileSync(path.join(reportDir, name), "utf8"))); } catch { /* keep usable evidence */ }
}

const records = catalog.filter((item) => targetIds.has(item.id)).map((item) => {
  const unresolvedItem = unresolvedById.get(item.id);
  const bucket = evidence.get(item.id);
  if (unresolvedItem.currentState === "POSTER_IN_FRAME") addUrl(bucket, item.frame?.url, "imageUrls");
  const allUrls = [...bucket.imageUrls];
  const imageIdentities = allUrls.map((url) => {
    const parsed = new URL(url);
    const filename = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).at(-1) ?? "");
    return { url, hostname: parsed.hostname, path: decodeURIComponent(parsed.pathname), filename, imageId: filename.replace(/\.[^.]+$/, "") };
  });
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    originalTitle: item.originalTitle,
    year: item.year,
    type: unresolvedItem.type ?? item.kind,
    country: item.country ?? [],
    director: item.director ?? null,
    actors: item.actors ?? [],
    externalIds: unresolvedItem.externalIds ?? {},
    state: unresolvedItem.currentState,
    posterUrl: unresolvedItem.currentState === "POSTER_IN_FRAME" ? item.frame?.url ?? null : null,
    sourceUrls: [...bucket.sourceUrls],
    imageIdentities,
    checkedSources: unresolvedItem.checkedSources ?? [],
    previousCandidates: unresolvedItem.pendingCandidate ? [unresolvedItem.pendingCandidate] : [],
    notes: [...bucket.notes]
  };
});

const out = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  total: records.length,
  posterOnly: records.filter((item) => item.state === "POSTER_IN_FRAME").length,
  noFrame: records.filter((item) => item.state === "NO_FRAME").length,
  records
};
fs.writeFileSync(path.join(reportDir, "watch-stills-identity-map.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ total: out.total, posterOnly: out.posterOnly, noFrame: out.noFrame }, null, 2));
