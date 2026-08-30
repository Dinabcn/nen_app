# Watch canonical category audit

Дата: 2026-08-30

Основа: `04fd21a` (`feature/watch-service`)

Объём: 1932/1932 карточки

## Итог

- Проверено карточек: **1932**.
- Переклассифицировано: **21**.
- `series` → `animated-series`: **14**.
- `movie` / `short-film` → анимационные категории: **6**.
- `animated-feature` → `movie`: **1**.
- Итог: Мультфильмы **647**, Мультсериалы **590**, Фильмы **658**, Сериалы **37**.
- Сумма четырёх разделов: **1932**.
- Попарные пересечения: **0**.
- Потерянных карточек: **0**.

## Метод

Canonical category вычисляется из двух независимых признаков: способ изображения (animation / live-action) и форма выпуска (standalone / episodic). Проверены `kind`, форма `duration`, описания, originalTitle/year, точные source pages, сохранённые Кино Mail и gallery evidence. Для гибридных детских сериалов с существенной анимационной частью выбрана категория `animated-series`.

## Переклассифицированные карточки

| ID | Произведение | Было | Стало | Основание |
| --- | --- | --- | --- | --- |
| `nen-mail-780618` | Большая ферма (2009) | series | animated-series | BBC Programme Index: формат Animation, эпизоды/серии |
| `nen-mail-814323` | Машины сказки (2011) | series | animated-series | source description: мультсериал, сезонная gallery |
| `nen-mail-904756` | Ожившие картинки. Галилео (2009) | series | animated-series | официальный Gruppo Alcuni: series, Live Action & 2D Animation |
| `nen-mail-913079` | Мульт мама (2014) | series | animated-series | source description: развивающий мультсериал |
| `nen-mail-913295` | Бруно и банановая команда (2007) | series | animated-series | source description: развивающий мультсериал |
| `nen-mail-933606` | Мир игрушек (2019) | series | animated-series | source description: детский мультсериал, эпизодный формат |
| `nen-mail-941961` | Приключения мегащенков (2022) | series | animated-series | source page: китайский приключенческий мультсериал |
| `nen-mail-945474` | Ияну (2025) | series | animated-series | Cartoon Network/WBD: original animated series |
| `nen-repl-mail-809611` | Фантадром (1985) | series | animated-series | сборник анимационных серий, сезонная gallery |
| `nen-repl-mail-815390` | Лелик и Барбарики (2008) | series | animated-series | source description и эпизодная длительность |
| `nen-repl-mail-942093` | Студия сновидений (2024) | series | animated-series | Disney+/Pixar: 1 Season, жанр Animation, 4 эпизода |
| `nen-wd-q47629070` | Клео и Кукин (2018) | series | animated-series | exact Кино Mail evidence: мультсериалы, сезонная gallery |
| `nen-wd-q509210` | Миа и я (2011) | series | animated-series | Studio 100: series, 3D Animation (CGI) + Live Action |
| `nen-wd-q724491` | Крот (1957) | series | animated-series | source description: чешский мультсериал |
| `nen-mail-484706` | Паровозик из Ромашкова (1967) | short-film | animated-short | source description: короткий мультфильм, 10 минут |
| `nen-mail-799582` | Сочинушки (2000) | short-film | animated-short | source description: мультфильм, 11 минут |
| `nen-mail-926752` | Чемодан (1991) | short-film | animated-short | source description: мультфильм, 7 минут |
| `nen-mail-720306` | Сказка о царе Салтане (1985) | movie | animated-feature | source description: советский мультфильм, 69 минут |
| `nen-wd-q19703232` | Смелый рыцарь из Камелота (1998) | movie | animated-feature | exact title/year, Golden Films animated feature |
| `nen-wd-q3400601` | Эволюция (2015) | movie | animated-feature | exact originalTitle `Pourquoi j'ai (pas) mangé mon père`, animated feature |
| `nen-wd-q605145` | Волшебные покровители: Повзрослей, Тимми Тёрнер! (2011) | animated-feature | movie | Paramount/Nickelodeon live-action TV movie with limited CGI characters |

## Regression: «Студия сновидений»

- ID: `nen-repl-mail-942093`.
- Canonical kind: `animated-series`.
- `/animated-series`: присутствует.
- `/series`: отсутствует.
- Точный источник: https://press.disneyplus.com/media-kits/dream-productions — Pixar Animation Studios, series, четыре эпизода, 2024.

## Инвариант

Каждый `ProductionKind` отображается ровно в одну пользовательскую категорию. Автоматический тест строит четыре множества по всему каталогу, проверяет единственное членство каждого ID, нулевые попарные пересечения и объединение размером 1932.

Frame, title, originalTitle, description, duration и остальные редакционные поля в этом проходе не изменялись.
