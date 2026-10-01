export interface NenCollection {
  slug: string;
  title: string;
  description: string;
  sourceTitle: string;
  sourceUrl: string;
  slugs: string[];
}

export const nenCollections: NenCollection[] = [
  { slug: "animatsiya-kotoruyu-peresmatrivayut", title: "Анимация, которую хочется пересматривать", description: "Классика Disney и Pixar для общего просмотра: приключения, семейные истории и герои, к которым приятно возвращаться.", sourceTitle: "От «Аладдина» до «Тайны Коко»: 10 мультфильмов, которые хочется пересматривать снова и снова", sourceUrl: "https://n-e-n.ru/10-multfilmov-kotorye-hochetsa-peresmatrivat/", slugs: ["krasavitsa-i-chudovische", "aladdin", "korol-lev", "mulan", "v-poiskah-nemo", "rapuncel-zaputannaya-istoriya", "holodnoe-serdtse", "moana", "zveropolis", "tayna-koko"] },
  { slug: "novogodnie-multfilmy", title: "Новогодние мультфильмы", description: "Тёплые, смешные и волшебные истории для семейного просмотра в зимние каникулы.", sourceTitle: "15 новогодних мультфильмов для детей и родителей", sourceUrl: "https://n-e-n.ru/podborka-novogodnih-multfilmov-dlya-detey-i-roditeley/", slugs: ["klaus", "the-grinch", "hraniteli-snov", "arthur-christmas", "padal-proshlogodniy-sneg", "zima-v-prostokvashino"] },
  { slug: "filmy-i-multfilmy-pro-sobak", title: "Истории про собак", description: "Верные друзья, отважные щенки и семейные приключения — выбор НЭН для маленьких поклонников собак.", sourceTitle: "Маленьким фанатам песелей: 13 фильмов и мультиков о собаках", sourceUrl: "https://n-e-n.ru/multy-pro-sobak/", slugs: ["sto-odin-dalmatinets", "wikidata-q1067080", "volt", "ledi-i-brodyaga", "blagodarya-vinn-diksi", "mail-945569-blui"] },
  { slug: "multfilmy-pro-kotov", title: "Мультфильмы про котов", description: "Самостоятельные, обаятельные и очень разные коты — от домашней классики до больших приключений.", sourceTitle: "Не только Матроскин: подборка мультфильмов про котов", sourceUrl: "https://n-e-n.ru/ne-tolko-matroskin/", slugs: ["koty-aristokraty", "kot-v-sapogah", "oliver-i-kompaniya", "kot-leopold", "troe-iz-prostokvashino"] },
  { slug: "dobryy-hellouin", title: "Добрый семейный Хэллоуин", description: "Немного привидений, ведьм и странных домов — страшновато, но прежде всего смешно и по-семейному.", sourceTitle: "Монстры, ведьмы и страшные дома: 11 добрых фильмов на Хеллоуин для всей семьи", sourceUrl: "https://n-e-n.ru/monstry-vedmy-i-strashnye-doma/", slugs: ["koralina-v-strane-koshmarov", "corpse-bride", "the-nightmare-before-christmas", "paranorman", "the-boxtrolls"] },
  { slug: "multfilmy-na-kanikuly", title: "Мультфильмы на каникулы", description: "Необычная анимация, крепкая дружба и путешествия в миры, которые хочется рассматривать внимательно.", sourceTitle: "Подборка мультфильмов на каникулы", sourceUrl: "https://n-e-n.ru/cartoons/", slugs: ["stalnoy-gigant", "pesn-morya", "moy-sosed-totoro", "tayna-kells"] },
  { slug: "sovremennaya-animatsiya", title: "Современная анимация для детей", description: "Свежие авторские истории о смелости, дружбе и умении просить о помощи.", sourceTitle: "5 современных мультфильмов, которые стоит показать ребенку", sourceUrl: "https://n-e-n.ru/5-sovremennih-multfilmov/", slugs: ["dazhe-myshi-popadayut-v-rai", "legenda-o-volkah"] },
  { slug: "volshebstvo-i-chudo", title: "Про волшебство и чудо", description: "Истории, которые возвращают веру в чудо и дают повод поговорить о семье, доброте и прощении.", sourceTitle: "Что посмотреть с ребенком перед Новым годом: 8 жизнеутверждающих фильмов и мультфильмов про волшебство и чудо", sourceUrl: "https://n-e-n.ru/multfilmy-chudo/", slugs: ["kristofer-robin", "tayna-koko", "pesn-morya"] },
  { slug: "krasivaya-animatsiya-so-smyslom", title: "Красивая анимация с глубоким смыслом", description: "Визуально сильные истории для вдумчивого семейного просмотра и разговоров после титров.", sourceTitle: "Вам понравился «Мальчик и птица» Миядзаки? Вот еще 5 красивых мультфильмов с глубоким смыслом", sourceUrl: "https://n-e-n.ru/6-krasivih-myltfilmov/", slugs: ["mechty-robota", "nimona"] },
  { slug: "eda-i-druzhba", title: "Еда, дружба и новые вкусы", description: "Аппетитные истории о любопытстве, дружбе и спокойном знакомстве с новым.", sourceTitle: "Ребенок не ест овощи? Посмотрите с ним вот эти мультфильмы!", sourceUrl: "https://n-e-n.ru/brocomult/", slugs: ["ratatuy", "luka"] },
  { slug: "redkie-zhivotnye", title: "Редкие и удивительные животные", description: "Анимационные путешествия, которые знакомят детей с необычными животными и бережным отношением к природе.", sourceTitle: "8 мультфильмов об очень редких или уже исчезнувших животных", sourceUrl: "https://n-e-n.ru/podborka-multikov-ob-ochen-redkih-ili-uzhe-ischeznuvshyh-zhivotnyh/", slugs: ["ice-age"] },
];

export const featuredNenCollections = nenCollections.slice(0, 4);
export const findNenCollection = (slug: string) => nenCollections.find((collection) => collection.slug === slug);
