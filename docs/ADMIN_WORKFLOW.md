# Admin Workflow

## Добавить arrangement

```bash
# 1. положить source (один файл = один arrangement, имя = ID)
cp ~/sources/H35.png incoming/

# 2. конвертация (batch — весь incoming/)
npm run convert            # → staging/H35.json, staging/H35.svg

# 3. QA
npm run qa                 # локальный UI: Original | SVG | Overlay → Approve / Reject

# 4. approve переносит staging/H35.* → library/d38999/, status=approved

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
