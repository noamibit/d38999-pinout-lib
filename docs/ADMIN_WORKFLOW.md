# Admin Workflow

## Добавить arrangement

```bash
# 1. положить source (один файл = один arrangement, имя = ID)
cp ~/sources/H35.png incoming/

# 2. конвертация (batch — весь incoming/)
npm run convert            # → staging/d38999/H35.json (draft) + .source.png

# 3. QA — http://localhost:4550
npm run qa                 # Original | Generated SVG | Overlay → Approve / Reject
                            # SVG рендерится QA-сервером на лету из JSON (не файл)

# 4. approve рендерит финальный SVG и переносит H35.{json,svg} → library/d38999/,
#    status=approved; reject переносит H35.json(+.source.png) → staging/rejected/d38999/

# 5. проверка и публикация
npm run validate
git add library/ && git commit -m "library: add H35" && git push
```

CI проверит и задеплоит. Пользователи получат обновление при следующем подключении.

## Исправить arrangement
Править `library/d38999/H35.json` (или через QA editor), затем `npm run render` → SVG перегенерируется, `revision` +1.

## Правила
- В `library/` только `approved`.
- `index.json` не редактируется руками — генерируется.
- `incoming/` не коммитится (лицензии источников). Используйте по возможности MIL-STD-1560 (public domain) или источники с разрешением.
- Перед push всегда `npm run validate`.
