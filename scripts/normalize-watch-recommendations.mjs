import fs from "node:fs/promises";

const sourcePath = "data/source/watch-v2.json";
const reportPath = "data/reports/watch-recommendations-normalization.json";
const catalog = JSON.parse(await fs.readFile(sourcePath, "utf8"));

const topicForms = {
  "дружба": "дружбе",
  "выбор": "выборе",
  "смелость": "смелости",
  "путешествия": "путешествиях",
  "культурное разнообразие": "культурном разнообразии",
  "эмпатия": "эмпатии",
  "семья": "семье",
  "волшебство": "волшебстве",
  "самопринятие": "принятии себя",
  "ответственность": "ответственности",
  "мечты": "мечтах",
  "командная работа": "командной работе",
  "взросление": "взрослении",
  "школа": "школе",
  "животные": "животных",
  "история": "истории",
  "музыка": "музыке",
  "природа": "природе",
  "справедливость": "справедливости",
  "отношения с родителями": "отношениях с родителями",
  "спорт": "спорте",
  "наука": "науке",
  "космос": "космосе",
  "самостоятельность": "самостоятельности",
  "утрата": "утрате",
  "братья и сёстры": "отношениях между братьями и сёстрами",
  "технологии": "технологиях",
  "искусство": "искусстве",
  "экология": "экологии",
  "разлука": "разлуке",
};

const ageGroup = (age) => {
  if (age <= 5) return "Для дошкольников";
  if (age <= 8) return "Для младших школьников";
  if (age <= 11) return "Для младших школьников и подростков";
  if (age <= 14) return "Для подростков";
  return "Для старших подростков";
};

const unique = (values) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const joinTopics = (topics) => topics.length === 2
  ? `${topics[0]} и ${topics[1]}`
  : `${topics.slice(0, -1).join(", ")} и ${topics.at(-1)}`;

function recommendationFor(item) {
  const topics = unique(item.themes).slice(0, 3);
  if (topics.length < 2) throw new Error(`${item.id}: для рекомендации нужно не менее двух редакционных тем`);
  const forms = topics.map((topic) => topicForms[topic]);
  if (forms.some((value) => !value)) throw new Error(`${item.id}: неизвестная редакционная тема`);

  let lead = "История";
  if (item.kind === "documentary" || topics.includes("наука") || topics.includes("история")) lead = "Познавательная история";
  else if (item.kind === "animated-short" || item.kind === "short-film") lead = "Короткая история";
  else if (item.kind === "series" || item.kind === "animated-series") lead = "Сериал";
  else if (topics.includes("спорт")) lead = "Спортивная история";
  else if (topics.includes("музыка")) lead = "Музыкальная история";
  else if (topics.includes("путешествия")) lead = "Приключение";

  const preposition = /^[аэиоуы]/iu.test(forms[0]) ? "об" : "о";
  return `${ageGroup(item.nenAgeRecommendation.minAge)}. ${lead} ${preposition} ${joinTopics(forms)}.`;
}

let changed = 0;
let unchanged = 0;
const updated = catalog.map((item) => {
  const whyRecommended = recommendationFor(item);
  if (whyRecommended === item.whyRecommended) unchanged += 1;
  else changed += 1;
  return { ...item, whyRecommended };
});

const forbidden = /Этот фильм рассказывает|Мы рекомендуем|помогает детям понять|обязательно понравится|не просто фильм/iu;
const invalid = updated.filter((item) => {
  const text = item.whyRecommended;
  return !/^Для (дошкольников|младших школьников|младших школьников и подростков|подростков|старших подростков)\. (История|Познавательная история|Короткая история|Сериал|Спортивная история|Музыкальная история|Приключение) об? .+\.$/u.test(text)
    || forbidden.test(text)
    || item.themes.slice(0, 2).some((theme) => !topicForms[theme] || !text.includes(topicForms[theme]));
});
if (invalid.length) throw new Error(`Не прошли аудит рекомендаций: ${invalid.map((item) => item.id).join(", ")}`);

const frequency = updated.reduce((result, item) => {
  result[item.whyRecommended] = (result[item.whyRecommended] ?? 0) + 1;
  return result;
}, {});
const repeated = Object.entries(frequency).filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]);

const report = {
  generatedAt: new Date().toISOString(),
  total: updated.length,
  rewritten: changed,
  unchanged,
  invalid: invalid.length,
  ageGroups: updated.reduce((result, item) => {
    const group = ageGroup(item.nenAgeRecommendation.minAge);
    result[group] = (result[group] ?? 0) + 1;
    return result;
  }, {}),
  uniqueRecommendations: Object.keys(frequency).length,
  repeatedRecommendations: repeated.length,
  mostRepeated: repeated.slice(0, 20).map(([text, count]) => ({ text, count })),
  shortestLength: Math.min(...updated.map((item) => item.whyRecommended.length)),
  longestLength: Math.max(...updated.map((item) => item.whyRecommended.length)),
};

await fs.writeFile(sourcePath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
