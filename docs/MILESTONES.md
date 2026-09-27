# Milestones V1

Порядок изменён относительно исходного плана: главный риск (converter) проверяется рано, viewer идёт параллельно.

Легенда: ☐ todo · ◐ in progress · ☑ done

## M0 — Repo, документы, процесс ☑
- Структура repo, docs, ADR, CLAUDE.md, agent definitions, git branch.
- **Done:** документы в `docs/`, `main` + рабочая ветка.

## M1 — Data model + Library tools ☑
- JSON Schema: arrangement, index.
- `tools/library`: `render` (JSON → SVG + mirror), `validate`, `build` (→ `app/public/library/`).
- Synthetic fixtures (3–5 arrangements) для разработки.
- Unit tests: детерминизм renderer, корректность mirror, validator ловит ошибки.
- **Done:** `npm run validate && npm test` зелёные; `npm run build:library` создаёт index + SVG.

## M2 — Viewer prototype ☑
- Vite + React + TS в `app/`, hash routing.
- Home: Letter grid → Number grid из `index.json`.
- Viewer: inline SVG, pinch/pan/double-tap/wheel zoom через viewBox, fit/reset, back, Mirror + индикатор, `viewCaption`.
- **Done:** на fixtures всё работает в desktop Chrome и Android Chrome (DevTools device mode).

## M3 — PWA + offline + wake lock ◐ (build verified, on-device offline check pending)
- manifest, icons, `vite-plugin-pwa` precache всей библиотеки, update prompt.
- Wake Lock hook с re-acquire.
- **Done:** Lighthouse installable; airplane mode → всё работает; экран не гаснет в Viewer.

## M4 — Converter prototype (5–10 реальных images) ☐
- Python venv, OpenCV, PyMuPDF; OCR/AI для labels.
- Round-trip тест на synthetic (render → raster → recognize).
- **Блокер:** нужны реальные source images от admin.
- **Done:** метрики из CONVERTER_REQUIREMENTS на 5–10 images, решение о роли AI.

## M5 — QA tool ☐
- Локальный web UI: Original | SVG | Overlay (opacity slider), warnings, Approve/Reject (перенос в `library/`).
- Optional: правка label, сдвиг/удаление/добавление contact.

## M6 — Batch ~50 ☐
- Прогон всех sources, итерации по recurring errors, approve.

## M7 — CI/CD ◐
- `test.yml`, `deploy.yml` (GitHub Pages). Fail → no deploy.
- **Блокер:** GitHub repo (создаёт admin), включить Pages → Source: GitHub Actions.

## M8 — V1 release ☐
- Done criteria из PRODUCT_REQUIREMENTS §9, тест на реальном Android.
