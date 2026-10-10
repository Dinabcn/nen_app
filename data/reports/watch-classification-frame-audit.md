# Финальный аудит классификации и кадров watch

Дата: 2026-10-10

Основа: `a69a5b1`, ветка `feature/watch-service`.

## Реальный объём проверки

- Метаданные, canonical category и сохранённый provenance проверены автоматически для **1932/1932** карточек.
- Проверено единственное членство каждой карточки в одном из четырёх разделов, отсутствие потерь и пересечений.
- Отдельно проверены **34 карточки** из 17 групп с совпадающими/близкими названиями и разными годами или версиями; источник, год и страница произведения сопоставлены с frame evidence.
- Отдельно проверены девять сообщённых ошибок классификации и неправильный кадр `The Silver Brumby`.
- Это не заявляется как ручной покадровый просмотр всех 1932 изображений: визуально и по source page проверена приоритетная неоднозначная выборка; для остального каталога выполнен аудит сохранённого provenance и идентификаторов.

## Распределение

| Раздел | До | После |
| --- | ---: | ---: |
| Мультфильмы | 647 | 656 |
| Мультсериалы | 590 | 590 |
| Фильмы | 658 | 649 |
| Сериалы | 37 | 37 |
| **Всего** | **1932** | **1932** |

Попарные пересечения: **0**. Потерянных карточек: **0**.

## Исправленная классификация

| ID / slug | Произведение | Было | Стало | Подтверждение |
| --- | --- | --- | --- | --- |
| `nen-wd-q920740` / `wikidata-q920740` | Маленький отважный паровозик Тилли (1991) | short-film | animated-short | IMDb: Animation, Short, 27 min, 1991 — https://www.imdb.com/title/tt0186311/ |
| `nen-repl-mail-915591` / `work-2017-915591` | Маша и медведь: Новые истории (2017) | movie | animated-feature | Кинобизнес: мультфильм, театральный альманах серий — https://www.kinobusiness.com/movies/masha-i-medved-novye-istorii/ |
| `nen-wd-q17168882` / `wikidata-q17168882` | Моника и русалки Рио (1987) | movie | animated-feature | Cinemateca Brasileira: longa-metragem, жанр Animação; четыре анимационные истории с игровыми связками — https://bases.cinemateca.org.br/cgi-bin/wxis.exe/iah/?IsisScript=iah/iah.xis&base=FILMOGRAFIA&exprSearch=ID=019353&format=detailed.pft&lang=p&nextAction=lnk |
| `nen-mail-877318` / `mail-877318-petya-i-volk` | Петя и волк (1976) | short-film | animated-short | Точная карточка Кино Mail: мультипликационная короткометражная работа — https://kino.mail.ru/cinema/movies/877318_petya_i_volk/ |
| `nen-wd-q18709309` / `wikidata-q18709309` | Приключения Ихитуса (1973) | movie | animated-feature | Cine Nacional: película, Animación, 82 min — https://cinenacional.com/pelicula/las-aventuras-de-hijitus |
| `nen-wd-q617002` / `wikidata-q617002` | Приключения Кристофера в волшебном лесу (2001) | movie | animated-feature | Cinemateca Brasileira: longa-metragem, жанр Animação, 80 min — https://bases.cinemateca.org.br/cgi-bin/wxis.exe/iah/?IsisScript=iah/iah.xis&base=FILMOGRAFIA&exprSearch=ID=025977&format=detailed.pft&lang=p&nextAction=lnk |
| `nen-mail-749717` / `mail-749717-skazka-o-zolotom-petushke` | Сказка о золотом петушке (1967) | short-film | animated-short | Точная карточка Кино Mail: мультипликационная экранизация, 30 min — https://kino.mail.ru/cinema/movies/749717_skazka_o_zolotom_petushke/ |
| `nen-repl-mail-914674` / `work-2017-914674` | Злыдни (2017) | movie | animated-feature | Афиша: сборник мультфильмов, 53 min — https://www.afisha.ru/movie/sbornik-multfilmov-zlydni-231009/ |
| `nen-wd-q28678515` / `wikidata-q28678515` | Космическая братва (2016) | movie | animated-feature | TV Brasil: бразильская компьютерная анимация, 2016 — https://tvbrasil.ebc.com.br/sessao-familia/2020/04/bugigangue-no-espaco |

Дополнительных доказанных ошибок классификации сверх этих девяти в полном метаданном проходе не найдено. Массовых эвристических переносов не выполнялось.

## Исправленный кадр

### Серебряный ветер / The Silver Brumby

- ID: `nen-wd-q7764269`; slug сохранён: `wikidata-q7764269`.
- Точная версия: игровой семейный фильм Джона Татулиса **1993** года, с Caroline Goodall, Russell Crowe и Amiel Daemion.
- Ошибка: прежний URL был взят со страницы анимационного сериала **1998** года (`/the-silver-brumby-animation`).
- Подтверждающая страница фильма и галерея продюсера: https://www.mediaworld.com.au/the-silver-brumby
- Новый кадр: `https://images.squarespace-cdn.com/content/v1/5b99e7a2b98a78772c0c32d8/1537832509237-GXVB4DR1D0T0V7BE3YP4/tsb_image3_lg.jpg?format=1500w`
- Проверка: HTTP 200, `image/jpeg`, 800×640, SHA-256 `98936037DC91BE07346A54970BC7012C8BB0A2804F331EEDE8B47975A98F5B17`.

## Неоднозначные названия и версии

Повторно сверены 17 групп: «Приключения Паддингтона», «Чебурашка», «Зверополис», «Холодное сердце», «Маленький принц», `Pete's Dragon`, «Конёк-Горбунок», «Спасатели», «Приключения мистера Пибоди и Шермана», «Бременские музыканты», «Чиполлино», «Мальчик-с-пальчик», «Вокруг света за 80 дней», «Лу», «Заботливые мишки», «Слонёнок Бабар». Во всех 34 карточках сохранённый source page или точный gallery ID соответствует нужной версии и году; замены не потребовались.

## Ручная проверка

Новых карточек с неподтверждённым соответствием frame после этого прохода: **0**. При этом аудит остальных кадров был provenance-based, а не ручным просмотром всех 1932 изображений.

## Совместимость ссылок

ID и slug не изменялись. Новые карточные ссылки формируются в `/cartoons/<slug>`. Старые опубликованные ссылки `/movies/<slug>` для девяти перенесённых карточек продолжают разрешаться в ту же карточку, поэтому избранное по ID и ранее отправленные ссылки не ломаются.

## Подписи кадров

Грамматическая форма вынесена в единое отображение по `productionKind`:

- `animated-feature`, `animated-short` → «Кадр из мультфильма»;
- `animated-series` → «Кадр из мультсериала»;
- `movie` → «Кадр из фильма»;
- `series` → «Кадр из сериала».

Эта функция используется и в видимой подписи, и в `alt` изображения на карточках, страницах произведений и в подборках через общий компонент `Frame`.
