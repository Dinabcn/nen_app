import fs from "node:fs/promises";

const sourcePath = "data/source/watch-v2.json";
const reportPath = "data/reports/watch-recommendations-normalization.json";

const catalog = JSON.parse(await fs.readFile(sourcePath, "utf8"));

function unique(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = value.trim().toLocaleLowerCase("ru");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function joinTopics(topics) {
  if (topics.length === 1) return topics[0];
  return `${topics.slice(0, -1).join(", ")} и ${topics.at(-1)}`;
}

function recommendationFor(item) {
  const topics = unique([
    ...item.sensitiveTopics.slice(0, 1),
    ...item.themes,
  ]).slice(0, 3);
  if (!topics.length) throw new Error(`${item.id}: нет подтверждённых тем для рекомендации`);
  const build = () => `Подходит для ${item.nenAgeRecommendation.minAge}+. ${topics.length === 1 ? "Тема" : "Темы"} — ${joinTopics(topics)}.`;
  while (topics.length > 1 && build().length > 80) topics.pop();
  return build();
}

let changed = 0;
let unchanged = 0;
const updated = catalog.map((item) => {
  const whyRecommended = recommendationFor(item);
  if (whyRecommended === item.whyRecommended) unchanged += 1;
  else changed += 1;
  return { ...item, whyRecommended };
});

const invalid = updated.filter((item) => {
  const expectedStart = `Подходит для ${item.nenAgeRecommendation.minAge}+. `;
  return !item.whyRecommended.startsWith(expectedStart)
    || !/^Подходит для \d+\+\. Тем(?:а|ы) — .+\.$/u.test(item.whyRecommended)
    || /Этот фильм рассказывает|Мы рекомендуем|помогает детям понять/iu.test(item.whyRecommended);
});
if (invalid.length) throw new Error(`Не прошли аудит рекомендаций: ${invalid.map((item) => item.id).join(", ")}`);
const tooLong = updated.filter((item) => item.whyRecommended.length > 80);
if (tooLong.length) throw new Error(`Рекомендации длиннее 80 символов: ${tooLong.map((item) => item.id).join(", ")}`);

const report = {
  generatedAt: new Date().toISOString(),
  total: updated.length,
  normalized: updated.length,
  changedThisRun: changed,
  unchangedThisRun: unchanged,
  invalid: invalid.length,
  longestLength: Math.max(...updated.map((item) => item.whyRecommended.length)),
};

await fs.writeFile(sourcePath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
