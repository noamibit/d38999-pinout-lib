# D38999 Pinout Lib — agent guide

Android-first offline PWA-viewer D38999 pin arrangements + admin pipeline (converter → QA → library).
Начни с `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/MILESTONES.md`, `docs/DECISIONS.md`.

## Жёсткие правила
- Geometry JSON — source of truth; SVG генерирует только `tools/library` renderer. Не редактировать SVG руками.
- Viewer (`app/`) читает только `library/index.json` + SVG. Не импортирует ничего из `tools/`.
- `library/` — только `approved`, только реальные источники. Synthetic данные — в `fixtures/`.
- Никаких выдуманных pin arrangements под видом реальных D38999.
- `index.json` генерируется, не редактируется.
- `incoming/` не коммитить.
- Mirror: геометрия зеркалится, глифы текста — никогда.

## Команды
```bash
npm install                 # root + workspaces
npm test                    # unit tests (node --test) для tools/library
npm run typecheck
npm run validate            # library/ (или LIBRARY_DIR=fixtures/library)
npm run build:library       # → app/public/library/
npm run dev                 # viewer на fixtures
npm run build               # production build (library/)
```
Python (converter): `C:\Users\noamv\AppData\Local\Programs\Python\Python312\python.exe` (в PATH перекрыт алиасом Store), venv в `tools/converter/.venv`.

## Процесс
- Работа по milestones из `docs/MILESTONES.md`, ветка на milestone/фичу, merge в `main` после зелёных тестов.
- Любое архитектурное решение → запись в `docs/DECISIONS.md`.
- Модель: вся работа ведётся на **Sonnet 5** (`model: sonnet` во всех agent definitions; при запуске Agent tool передавать `model: "sonnet"`).
- Субагенты: `.claude/agents/` — `viewer-dev`, `library-dev`, `converter-dev`, `reviewer`. Агенты работают в своей зоне путей и не коммитят; коммитит координатор после review.
- Commit style: `area: summary` (`viewer:`, `library:`, `converter:`, `qa:`, `docs:`, `ci:`).
