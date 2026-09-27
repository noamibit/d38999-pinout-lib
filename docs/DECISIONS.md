# Decisions (ADR log)

## ADR-001 Geometry JSON — source of truth, SVG производный
Правки = числа; единый стиль; QA по данным; корректный Mirror. SVG коммитится для review, CI проверяет `svg == render(json)`.

## ADR-002 Библиотека вшивается в build
Атомарное обновление получаем от service worker precache (новый SW активируется только после полной загрузки). Нет отдельного runtime-sync кода.

## ADR-003 Mirror — два SVG на этапе build
`ID.svg` и `ID.mirror.svg`. Геометрия зеркалится, глифы текста — нет. Viewer просто переключает файл. Всегда открывается оригинал, mirror виден индикатором.

## ADR-004 Library tools на TypeScript (Node native TS), converter на Python
Renderer/validator живут рядом с viewer в одном toolchain (CI без Python). Converter на Python — ради OpenCV/OCR; общается с остальным только через JSON по schema.

## ADR-005 Hash routing
GitHub Pages не имеет SPA fallback. `#/D38999/H35` даёт deep links без 404.

## ADR-006 Button grids вместо dropdown на Home
Dropdown = +1 тап на каждый selector. Letters ≈ 9, numbers ≈ 5–12 на букву — обе сетки помещаются на экран. Проверяется на прототипе.

## ADR-007 Synthetic fixtures отдельно от production
`fixtures/library/` — вымышленные arrangements для разработки и тестов (tag `synthetic`). Validator запрещает tag `synthetic` в `library/`. Production-библиотека наполняется только из реальных источников через QA.

## ADR-008 Источники не в публичном repo
`incoming/` в `.gitignore`. Предпочтительный источник — MIL-STD-1560.
