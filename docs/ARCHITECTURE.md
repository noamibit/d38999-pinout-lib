# Architecture

Принцип: **тяжёлая часть — один раз правильно построить библиотеку; приложение — тупой, быстрый, надёжный viewer.**

## 1. Компоненты

```
                 ADMIN (локально)                                  USER
incoming/H35.png
   │  tools/converter (Python, OpenCV/OCR/AI)
   ▼
staging/H35.json  ── geometry model (source of truth) + qa.warnings/confidence
   │  tools/library render (TS)
   ▼
staging/H35.svg
   │  tools/qa (локальный web UI: Original | SVG | Overlay → approve/reject)
   ▼  approve
library/d38999/H35.json + H35.svg
   │  git push → GitHub Actions
   ▼  tools/library validate + build
app/public/library/  (index.json, *.svg, *.mirror.svg)   ──►  PWA (app/)  ──►  Android
   │  vite build + service worker precache
   ▼
GitHub Pages
```

| Компонент | Путь | Язык | Знает о |
|---|---|---|---|
| Schema | `schema/` | JSON Schema | контракт для всех |
| Library tools (render, validate, build index) | `tools/library/` | TypeScript (Node ≥ 23, native TS) | geometry model |
| Converter | `tools/converter/` | Python 3.12 | source → geometry model |
| QA | `tools/qa/` | TS / web | staging, sources |
| Viewer | `app/` | TS + React + Vite | **только** `index.json` + SVG |

Viewer не знает о geometry model, converter не знает о viewer. Их можно переписывать независимо.

## 2. Source of truth

`library/<family>/<ID>.json` — geometry model (см. DATA_MODEL.md).
`<ID>.svg` — производный артефакт, генерируется renderer'ом детерминированно (одинаковый JSON → побайтно одинаковый SVG). Коммитится ради удобного review в GitHub, CI проверяет `svg == render(json)`.

Почему не «SVG как source of truth»: правки (label, сдвиг pin) становятся правкой чисел; стиль всей библиотеки меняется одной перегенерацией; automated QA работает с данными; Mirror корректен (текст не зеркалится).

## 3. Renderer и Mirror

- Не-текстовая геометрия (insert, contacts, shapes) рисуется в `<g>`; для mirror этой группе задаётся `transform="translate(W 0) scale(-1 1)"`.
- Текст (contact labels, annotations) рисуется отдельно: `x → W − x`, `text-anchor start ↔ end`, `rotate → −rotate`. Глифы не зеркалятся.
- Build генерирует `ID.svg` и `ID.mirror.svg`; viewer переключает файл.

## 4. Offline и атомарное обновление

- Библиотека **вшивается в build**: `tools/library build` кладёт `index.json` и SVG в `app/public/library/`.
- `vite-plugin-pwa` (Workbox) precache'ит app shell + index + все SVG с revision hash.
- Новый deploy = новый service worker. Он скачивает всё в новый cache в фоне; старый SW и старый cache обслуживают приложение до полной установки. Активация — целиком (при следующем запуске / по кнопке «Обновить»). Половинного состояния нет.
- `libraryVersion` в `index.json` = короткий content hash всей библиотеки; показывается в UI для диагностики.

## 5. Viewer

- Роутинг hash-based (`#/`, `#/D38999/H35`) — на GitHub Pages нет SPA fallback.
- Vite `base: '/d38999-pinout-lib/'`, manifest `scope`/`start_url` относительные.
- Pan/zoom: inline SVG, трансформация через `viewBox` (резкость при любом zoom), pointer events (pinch, pan, double-tap), fit/reset.
- Wake Lock: hook с re-acquire на `visibilitychange`.
- Mirror state не персистится между arrangement'ами.

## 6. Converter pipeline (modular)

```
Input Adapter (png/jpg/pdf → raster, PyMuPDF для PDF)
  → Recognizer
      geometry: OpenCV (insert circle, contact circles, lines)
      text: OCR / AI vision (только чтение labels, не координаты)
      assignment: label → ближайший contact
  → Geometry Model (JSON, confidence, warnings)
  → Renderer (tools/library, TS)
  → Automated checks (tools/library validate)
  → Human QA
```
Recognizer заменяем без изменения остального pipeline.

## 7. CI/CD

- `test.yml` (PR и push): typecheck, unit tests, `library validate` (schema, consistency, svg == render), app build.
- `deploy.yml` (push в `main`): то же + `actions/deploy-pages`. Любой fail → нет deploy.

## 8. Расширяемость

`index.json` сразу содержит `families[]`. Новая family = новая папка `library/<family>/`, UI V1 показывает первую (единственную). Дополнительные поля модели (`partNumbers`, `manufacturer`, …) проходят через build, UI их игнорирует.

Решения и их обоснование — в [DECISIONS.md](DECISIONS.md).
