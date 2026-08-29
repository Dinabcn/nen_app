# Watch format and frame audit

Дата: 2026-08-29

Основа: `b6c5e02` (`feature/watch-service`)
Объём: 2072/2072 карточки

## Итог

- Проверено карточек: **2072**.
- Мультфильмы (`animated-feature`, `animated-short`): **728**.
- Мультсериалы (`animated-series`): **579**.
- Фильмы (`movie`, `documentary`, `short-film`): **714**.
- Сериалы (`series`): **51**.
- Исправлено типов: **0**. Существующий `kind` уже выражает четыре нужных раздела; ошибка была в объединяющей UI-фильтрации.
- Исправлено неправильных frame: **2**.
- Потенциально неправильных frame после исправлений: **0** по формальным evidence-проверкам.
- MANUAL_REVIEW: **0** активных frame-кандидатов. Карточка Alice 1987 оставлена без frame, а не с сомнительным изображением.
- Подтверждённых frame после исправлений: **1932**.
- Без frame после исправлений: **140**.

## Метод аудита

1. Проверены значения `kind`, структура `duration`, `contentType`, `contentFormat` и `releaseForm` для всех 2072 карточек.
2. Все 1933 исходных frame сопоставлены с накопленным evidence по `card ID + exact frame URL`. Для 1931 неизменённого frame такая связка найдена; два Alice-frame разобраны отдельно.
3. Проверены восемь групп одинаковых/нормализованных названий (16 карточек): «Чебурашка», Zootopia/Zootopia+, Pete's Dragon, «Снежная королева», Alice in Wonderland, The Jungle Book, Beauty and the Beast, «Чиполлино». Год, формат и отдельная карточка произведения сохранены; содержательных дублей не обнаружено.
4. Проверено отсутствие смешения `animated-series` с полнометражной анимацией и `series` с фильмами. UI теперь фильтрует четыре раздела строго по `productionKind`.
5. Автоматическая проверка не считает визуальное сходство доказательством: спорный frame удаляется, если точная версия не подтверждается.

## Alice — отдельный аудит

### `nen-246` — «Алиса в Стране чудес» (1951)

- Тип: `animated-feature` — подтверждён.
- Старый frame: `https://n-e-n.ru/images/2026-04-17/69e245d89d0a0_0x0.jpg`.
- Ошибка: визуально это Mia Wasikowska из игровой версии 2010 года; встроенная атрибуция также перечисляла Tim Burton Productions и другие студии версии 2010.
- Исправление: заменён официальным кадром Walt Disney Animation Studios:
  `https://cdn.disneyanimation.com/uploads/films/alice-in-wonderland/wbi-r2-aliceinwonderland-tiff032-0.jpg`.
- Страница источника: `https://disneyanimation.com/films/alice-in-wonderland/` — раздел Feature Films, дата 28 июля 1951 года, режиссёры Clyde Geronimi, Wilfred Jackson и Hamilton Luske.
- Техническая проверка: HTTP 200, `image/jpeg`, 1866×1424, SHA-256 `58D28F4C7642BDA6FEA7FA798FAE5E0AB257A77B271C9ED7F48577235BD069F1`.
- Результат: **исправлен frame**, тип не менялся.

### `nen-wd-q2646975` — «Алиса в Зазеркалье» (1987)

- Тип: `animated-feature` — подтверждён IMDb `tt0101294`, длительность 1:13, жанр Animation, режиссёры Andrea Bresciani и Richard Slapczynski.
- Старый frame: `https://m.media-amazon.com/images/M/MV5BZjZmNWMwZTctNTkwOS00YWNlLWI2NmEtYTNmMzUxYTQ0NmEwXkEyXkFqcGc%40._V1_.jpg`.
- Ошибка: изображение является игровым кадром с актёрами и не соответствует анимационному фильму 1987 года.
- Точная галерея IMDb для версии 1987 существует (`https://www.imdb.com/title/tt0101294/mediaviewer/rm823392768/`), но безопасный прямой frame URL не был подтверждён.
- Исправление: неправильный `frame` удалён; карточка оставлена в «Мультфильмах».
- Результат: **исправлен frame**, тип не менялся.

### `nen-403` — «Алиса в Стране чудес (2010)»

- Тип: `movie`.
- Год и игровой frame соответствуют версии 2010 года.
- Результат: без изменений.

## Новая маршрутизация

- `/cartoons`: только `animated-feature` и `animated-short`.
- `/animated-series`: только `animated-series`.
- `/movies`: только `movie`, `documentary`, `short-film`.
- `/series`: только `series`.

Карточки и detail-ссылки используют тот же `productionKind`, поэтому мультсериал больше не может получить маршрут фильма/мультфильма, а обычный сериал — маршрут мультсериала.

## MANUAL_REVIEW

Активных карточек с сохранённым сомнительным frame нет. Если для Alice 1987 позже будет найден прямой кадр из exact IMDb gallery, его следует проверять отдельно по `tt0101294`; до этого карточка намеренно остаётся без изображения.
