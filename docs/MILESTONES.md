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
- Python venv, OpenCV, PyMuPDF; round-trip тест на synthetic — 29/29 зелёных.
- **Первая партия, 7 источников** (F11, G11, F28, D19, J19, H53, H55, deralconnectors.com). Два бага найдены и исправлены: garbage text-box (цепной merge glyph-боксов) и **axis-crosshair** (contacts на осевых линиях сливались с линией — фикс через `HoughLinesP` + локальный morphology survive-test). Recall (агрегат по 7): 78% → 86%. D19-кластер (слишком плотные осевые contacts) не исправлен, задокументирован.
- **Вторая партия, 50 источников** (от пользователя, тот же сайт, более качественные кропы — заменили первые 7). Batch прошёл 50/50 без крашей, 1205 contacts найдено суммарно. Ещё два реальных бага найдены и исправлены:
  1. **insert search range** был слишком узкий (25–50% канвы) — у этой партии больше полей вокруг диаграммы, insert иногда занимал всего ~19%; `B2.png` (реально 2 contacts) находил 0. Расширил до 12%.
  2. **Hough хватал "призрачный" внутренний круг** вместо настоящего insert (плотное кольцо contacts само похоже на круг для Hough) — на `D35.png` находил r=72 вместо настоящих r=164, теряя почти все contacts. Фикс: приоритет contour-by-area (как уже было для contacts), Hough — только fallback.
  - Оба фикса покрыты regression-тестами (`test_insert_detection.py`, synthetic-репродукции обоих failure modes).
  - **Новая находка (пока не исправлена):** плотные concentric-кольца contacts сидят на тонких изогнутых guide-линиях (тот же механизм, что axis-crosshair, только по кривой) — `G41.png` (реально 41 contact) нашёл только 1. **Попробовал фикс** (расширил circularity-rescue + area-fullness дискриминатор) — дал частичное улучшение (1→6 из 41), но завёл новый false-positive: буквоподобные glyph'ы (например "D") стали иногда распознаваться как contacts, что сломало ранее идеальную synthetic-точность (C98 28/28→29). **Откатил** — выигрыш мал, регресс реален. Нужен более точный дискриминатор «диск-с-хвостом vs буква» (идея: locally-varying radius of curvature).
  - Ground truth (expected count) собран только для горстки файлов вручную — для всех 50 не считал (пока это volume/stability-проверка, не recall-метрика).
- **AI vision reader (`--reader ai`, Claude API)** подключён: batched (1 запрос на весь arrangement), response-parsing покрыт unit-тестами на fake-клиенте (10 тестов). **Не проверен на реальном API-вызове** — нужен `ANTHROPIC_API_KEY` от admin.
- Подробности и метрики: [tools/converter/README.md](../tools/converter/README.md).
- **Остаётся:** правильный discriminator для dense guide-line contacts; прогнать `--reader ai` с реальным ключом; D19-кластер; хотя бы один реальный hollow-style источник.
- **Done:** метрики на 7+50 images — получено; AI reader подключён, точность — pending реального прогона.

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
