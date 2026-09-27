# Converter Requirements

## Вход
- PNG / JPG / screenshot / PDF (первая страница или указанная).
- **Один файл = один arrangement.** Имя файла = ID (`H35.png`).
- Source заранее выбран admin'ом: чёткий, ориентирован правильно, достаточное разрешение, без сильных искажений.
- Опционально sidecar `incoming/H35.meta.json`: `{ "expectedContacts": 55, "viewCaption": "...", "ref": "..." }`.

## Выход
`staging/H35.json` (geometry model, `status: "draft"`) + `staging/H35.svg` (через renderer) + `staging/H35.source.png` (нормализованный raster для overlay).

## Не делает
Поворот, зеркалирование, поиск diagram в документе, keying, pin/socket, mating/rear.

## Pipeline
1. **Input adapter** — растеризация PDF (PyMuPDF, ≥ 300 dpi), нормализация в PNG, `canvas` = размер raster.
2. **Preprocess** — grayscale, threshold, denoise.
3. **Geometry** — outer insert circle; contact circles (HoughCircles + contour fitting); кластеризация диаметров; вспомогательные линии (опционально).
4. **Text** — детекция текстовых регионов, OCR / AI vision. AI используется только для чтения символов, координаты берутся из CV.
5. **Assignment** — label → ближайший contact, сохраняется реальная позиция label (`text.x/y/size`).
6. **Checks** → `qa.warnings`, `qa.confidence`.

## Automated checks (warnings)
- 0 contacts / пустой результат
- дубликаты labels
- contact без label, label без contact
- `contacts.length ≠ expectedContacts`
- label вне алфавита (подозрительные символы, смешение `l/I/1`, `0/O`)
- пропуски в последовательности (`A..Z`, `a..z`, `AA..`) — warning, не error
- перекрывающиеся contacts
- элементы вне canvas / сильный crop

## Стратегия разработки
5 images → базовый принцип → 10–15 → recurring errors → 50 → метрики. Dataset реальный, не synthetic (synthetic — только для unit tests: render → raster → recognize → сравнить).

## Метрики
- contact recall / precision
- средняя/максимальная ошибка позиции (px, % от r insert)
- label accuracy (точное совпадение, с учётом регистра)
- доля items, approved без правок
