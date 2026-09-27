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

## M4 — Converter prototype (5–10 реальных images) ◐
- Python venv, OpenCV, PyMuPDF; round-trip тест на synthetic — 27/27 зелёных (incl. 3 новых regression-теста на axis-crosshair баг).
- **7 реальных источников** (F11, G11, F28, D19, J19, H53, H55 — все filled-style, deralconnectors.com). Два реальных бага найдены и исправлены:
  1. garbage text-box (цепной merge glyph-боксов давал огромную мусорную label-плашку);
  2. **axis-crosshair**: contacts на осевых линиях сливались с линией и отсекались по радиусу. Точный root cause подтверждён по пикселям; фикс через явную детекцию линии (`HoughLinesP`, центр + угол) + локальный morphology survive-test (не blanket erase — та версия ломала hollow-style synthetic и была откачена).
  - **Recall (агрегат по 7):** 78% → 86% (153/196 → 169/196). F28 24→28/28 (100%), H53 41→46/53, H55 42→48/55, J19 12→13/19. D19 (12/19) — не исправлен: там осевые contacts стоят слишком плотно, фрагменты линии между ними короче любого разумного `minLineLength` (задокументировано, разбирался quй подход не сработал).
- **AI vision reader (`--reader ai`, Claude API)** подключён: batched (1 запрос на весь arrangement), response-parsing покрыт unit-тестами на fake-клиенте (10 тестов). **Не проверен на реальном API-вызове** — нужен `ANTHROPIC_API_KEY` от admin (сознательно не запрашивался/не вводился агентом — секрет пользователя).
- Подробности и метрики: [tools/converter/README.md](../tools/converter/README.md).
- **Остаётся:** прогнать `--reader ai` с реальным ключом и измерить точность; D19-кластер; хотя бы один реальный hollow-style источник.
- **Done:** метрики на 7 images — получено; AI reader подключён, точность — pending реального прогона.

## M5 — QA tool ☑
- Локальный web UI (`npm run qa`, http://localhost:4550): Original | Generated SVG | Overlay (opacity sliders), errors/warnings, confidence.
- Approve: рендерит финальный SVG, валидирует production-правилами, пишет в `library/`, чистит staging. Reject: переносит в `staging/rejected/`.
- Проверено end-to-end на реальном F28.png: overlay совпал с оригиналом, approve корректно заблокирован при contacts≠expected, reject перенёс файлы.
- Optional (не сделано): правка label, сдвиг/удаление/добавление contact — отложено до реальной оценки точности converter на большем сэмпле.

## M6 — Batch ~50 ☐
- Прогон всех sources, итерации по recurring errors, approve.

## M7 — CI/CD ◐
- `test.yml`, `deploy.yml` (GitHub Pages). Fail → no deploy.
- **Блокер:** GitHub repo (создаёт admin), включить Pages → Source: GitHub Actions.

## M8 — V1 release ☐
- Done criteria из PRODUCT_REQUIREMENTS §9, тест на реальном Android.
