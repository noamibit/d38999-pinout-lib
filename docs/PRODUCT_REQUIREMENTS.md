# D38999 Pinout Lib — Product Requirements (V1)

> Android-first offline PWA для быстрого просмотра pin-arrangement diagrams семейства D38999.

Рабочее название, repo: `d38999-pinout-lib`. UI: `D38999 / Pinout Lib`.

## 1. Цель

Field reference tool для инженеров и интеграторов:

```
открыл app → выбрал букву → выбрал число → pinout → zoom
```

Приложение: открывается мгновенно, минимум действий, работает одной рукой, сильный zoom без потери качества, экран не гаснет, полностью offline после первой загрузки.

## 2. Scope V1

Только D38999. Модель данных расширяема: другие datasets, другие families, metadata, поиск, Part Number, другие способы выбора. UI V1 остаётся минимальным.

## 3. Роли

| Роль | Может | Как |
|---|---|---|
| User | открыть, выбрать arrangement, zoom/pan/reset/mirror, offline, wake lock, авто-обновление библиотеки | публичная PWA, без аккаунтов |
| Admin (1 человек) | источники, converter, QA, approve/reject, metadata, publish | GitHub repo + локальные tools |

В PWA нет authentication и нет admin UI.

## 4. Viewer

### 4.1 Home
- Два selector'а: **Letter** → **Number**. Строятся из `index.json` — невалидную комбинацию выбрать нельзя.
- Реализация по умолчанию: крупные button grids (без dropdown) — 2 тапа до pinout. Числа сортируются численно.
- Выбор валидной комбинации сразу открывает Viewer (без кнопки подтверждения).
- Если у буквы только одно число — всё равно показываем выбор (предсказуемость), решение можно пересмотреть по результатам прототипа.

### 4.2 Pinout Viewer
- SVG, pinch-to-zoom, pan, double-tap zoom (желательно), fit/reset, Home/back.
- Zoom без потери качества (через `viewBox`, не CSS scale растра).
- **Mirror** (кнопка ⇋): зеркалит arrangement слева направо; labels остаются читаемыми. Всегда открывается оригинал; в mirror-режиме — постоянный яркий индикатор `MIRRORED`.
- `viewCaption` (например «Mating face, pin insert») отображается мелко, если задан.
- Deep link: `#/D38999/H35`.

### 4.3 Screen Wake Lock
Request при входе в Viewer, release при выходе, повторный request на `visibilitychange` → `visible`. При отсутствии API — тихая деградация.

### 4.4 Offline (обязательно)
При первой загрузке скачиваются app shell + index + все SVG. После этого приложение полностью работает без сети.

### 4.5 Library update
- Новая версия обнаруживается при следующем подключении.
- Старая библиотека работает до полного скачивания новой. Нет состояния «половина SVG новые».
- Реализация: библиотека вшита в build, атомарность обеспечивает service worker precache (см. ARCHITECTURE §4).

### 4.6 Performance / UX
Home без задержки, SVG открывается мгновенно, плавный pinch/pan. Крупные controls, минимум текста, максимум площади под pinout. Контраст для солнца.

## 5. SVG

Почти визуальная реплика качественного source: позиции, количество, размеры circles, расстояния, положение/размер/ориентация labels, важные линии, общий layout. Labels сохраняются точно (`A`, `a`, `A*`, `AA`…; регистр значим).

- Output orientation = Source orientation. Никакого авто-поворота/зеркалирования в converter.
- Keying, pin/socket, mating/rear view — не распознаются. Keying может присутствовать как графика.

## 6. Converter (Admin)

- Input: PNG / JPG / screenshot / PDF. **Один source = один arrangement.** Admin сам готовит качественный, правильно ориентированный source.
- Output: geometry JSON (source of truth) → SVG (генерируется renderer'ом).
- Batch: `incoming/*` → `staging/*.json + *.svg`.
- Технология не фиксирована: CV / OCR / AI / hybrid. KPI — точность и минимум ручной работы.
- Automated checks: валидный SVG, ≥1 contact, labels есть, всё внутри canvas, нет дублей labels, совпадение с `expectedContacts`, алфавит labels, нет пустого результата. `confidence` сохраняется, но не заменяет human approval.

## 7. QA

- Экран: Original | Generated, Overlay с регулируемой прозрачностью, список warnings, **APPROVE / REJECT**.
- Minimum V1: approve/reject. Optional: правка label, сдвиг/удаление/добавление contact.
- Статусы: `draft → approved | rejected`. В production только `approved`.

## 8. Hosting / CI

GitHub Pages (`https://<user>.github.io/d38999-pinout-lib/`), GitHub Actions:
`push → validate JSON/SVG → tests → build PWA → deploy`. Validation fail → NO DEPLOY. Deploy только из `main`.

## 9. Done criteria V1

- [ ] Публичный URL
- [ ] Устанавливается как PWA на Android
- [ ] Работает offline, вся библиотека локально
- [ ] Letter + Number → pinout сразу
- [ ] Zoom/pan без потери качества, Mirror
- [ ] Экран не гаснет
- [ ] ~50 approved pinouts
- [ ] Admin: source → SVG+JSON → approve → push
- [ ] Новый arrangement не требует изменения кода Viewer

## 10. Out of scope V1

Другие families, PN search, auth/accounts, UGC, user editing, backend/DB/API, admin portal, catalog scraping, поиск diagram на странице datasheet, orientation detection, mating/rear inference, keying recognition, pin/socket логика (кроме визуального Mirror), публикация без human approval.

## 11. Future

Выбор family, search, PN, favorites/recent, manufacturer metadata, contact size, cavity type, alternate views, dark/high-contrast, clickable pins.
