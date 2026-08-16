# Исследование кадров watch-каталога

Сформировано: 2026-08-16T16:01:47.516Z

> Research-only: watch-v2.json, generated-каталог и Production не изменялись.

## Статистика

- Всего карточек: **2074**
- Подтверждённых кадров до исследования: **553**
- Исследовано по точным ID: **874**
- CONFIRMED_STILL: **22**
- CANDIDATE_STILL: **0**
- POSTER_ONLY: **352**
- NO_STILL_FOUND: **13**
- SOURCE_UNAVAILABLE: **0**
- UNRESOLVED: **487**
- Всего кандидатов: **103**
- Новых потенциально закрываемых карточек: **0**
- Верхняя TMDb-граница после подключения token: **667**

## Источники

- NEN: 0 кандидатов для 0 карточек
- Кино Mail: 103 кандидатов для 22 карточек
- TMDb: 0 кандидатов для 0 карточек
- Кинопоиск: 0 кандидатов для 0 карточек
- Commons/Wikidata: 0 кандидатов для 0 карточек

## Техническое состояние

- NEN: {"CONFIRMED_STILL":0,"CANDIDATE_STILL":0,"POSTER_ONLY":0,"NO_STILL_FOUND":0,"SOURCE_UNAVAILABLE":0,"UNRESOLVED":0}
- Кино Mail: {"CONFIRMED_STILL":22,"CANDIDATE_STILL":0,"POSTER_ONLY":0,"NO_STILL_FOUND":363,"SOURCE_UNAVAILABLE":2,"UNRESOLVED":487}
- TMDb: {"CONFIRMED_STILL":0,"CANDIDATE_STILL":0,"POSTER_ONLY":0,"NO_STILL_FOUND":0,"SOURCE_UNAVAILABLE":0,"UNRESOLVED":0}
- Кинопоиск: {"CONFIRMED_STILL":0,"CANDIDATE_STILL":0,"POSTER_ONLY":0,"NO_STILL_FOUND":0,"SOURCE_UNAVAILABLE":0,"UNRESOLVED":0}
- Commons/Wikidata: {"CONFIRMED_STILL":0,"CANDIDATE_STILL":0,"POSTER_ONLY":0,"NO_STILL_FOUND":0,"SOURCE_UNAVAILABLE":0,"UNRESOLVED":0}

- TMDb credential: **не настроен**
- Evidence-кэш атомарно сохраняется каждые 10 карточек.
- 429/5xx обрабатываются retry и exponential backoff.
- `--refresh` повторяет источник; без флага завершённые результаты не запрашиваются повторно.
- `--max=N` ограничивает пакет; `--sources=nen,mail,kinopoisk` выбирает адаптеры текущего прохода.
- По умолчанию изображения не скачиваются; `--hash` явно включает проверку MIME и SHA-256.

## Практический проход Кино Mail

- Проверено страниц Кино Mail: **352**
- Кадр найден: **0**
- Кадр не найден: **350**
- Источник недоступен: **2**
- Проверено резервных страниц Кинопоиска: **0**
- Кадр найден на Кинопоиске: **0**
- Кинопоиск недоступен: **0**
- Готовы к отдельному apply: **0**

## Текущие обложки в frame

- CURRENT_FRAME_IS_POSTER: **352**
- Они не удалялись и не считались кадрами. Полный список сохранён в JSON.

Полные evidence, ошибки, исключённые posters/logos и provenance находятся в JSON-отчёте и кэше.
