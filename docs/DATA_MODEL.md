# Data Model

Формальный контракт: [`schema/arrangement.schema.json`](../schema/arrangement.schema.json), [`schema/index.schema.json`](../schema/index.schema.json).

## 1. Arrangement (geometry model)

Файл: `library/<family>/<ID>.json` (production) или `staging/<ID>.json` (draft).

```json
{
  "schemaVersion": 1,
  "id": "H35",
  "family": "D38999",
  "prefix": "H",
  "number": "35",
  "title": "H35",
  "viewCaption": "Mating face, pin insert",
  "expectedContacts": null,

  "canvas": { "width": 1000, "height": 1000 },
  "insert": { "cx": 500, "cy": 500, "r": 470 },
  "contacts": [
    {
      "label": "A",
      "cx": 412, "cy": 230, "r": 14,
      "style": "hollow",
      "text": { "x": 412, "y": 205, "size": 18, "anchor": "middle", "rotate": 0 }
    }
  ],
  "shapes": [
    { "type": "line", "x1": 0, "y1": 0, "x2": 10, "y2": 10 },
    { "type": "circle", "cx": 500, "cy": 40, "r": 12, "fill": false },
    { "type": "path", "d": "M 480 30 L 520 30 L 500 60 Z", "fill": true }
  ],
  "annotations": [
    { "text": "MASTER KEY", "x": 500, "y": 20, "size": 14, "anchor": "middle", "rotate": 0 }
  ],

  "source": { "file": "H35.png", "sha256": "…", "ref": "MIL-STD-1560 …" },
  "qa": { "confidence": 0.97, "warnings": [] },
  "status": "approved",
  "revision": 1,

  "series": null, "manufacturer": null, "partNumbers": [], "shell": null,
  "notes": null, "tags": [],
  "createdAt": "2026-09-27", "updatedAt": "2026-09-27"
}
```

### Правила
- **Координаты** — в пространстве `canvas` (обычно пиксели source, чтобы overlay совпадал 1:1). Ось Y вниз, как в SVG.
- `id` = `prefix + number`, уникален в пределах family. Имя файла = `id`.
- `prefix`: `^[A-Z]{1,2}$`, `number`: `^[0-9]{1,3}$`.
- `label`: непустая строка, **регистр значим**, уникальна в пределах arrangement.
- `text` у contact — положение label как на source: `x` — точка привязки по `anchor` (`start` = левый край, `middle` = центр, `end` = правый край), `y` — вертикальный центр label (`dominant-baseline: central`), `size` ≈ высота глифа. Если `text` нет — label рисуется над contact.
- `annotations` — текст, не привязанный к contact; при mirror не зеркалится (только переезжает).
- `shapes` — вспомогательная графика (keying, линии, контуры); при mirror зеркалится как геометрия.
- `expectedContacts` — вводится admin'ом по источнику; если задан, validate проверяет `contacts.length`.
- `status`: `draft | approved | rejected`. В `library/` допустим только `approved`.
- `viewCaption` — свободный текст, какой вид на source. Никакой логики.

## 2. Library index (генерируется, не редактировать)

`app/public/library/index.json` — единственное, что читает viewer.

```json
{
  "schemaVersion": 1,
  "libraryVersion": "3f9a1c2e",
  "builtAt": "2026-09-27T12:00:00Z",
  "families": [
    {
      "id": "D38999",
      "title": "D38999",
      "items": [
        {
          "id": "H35", "prefix": "H", "number": "35", "title": "H35",
          "svg": "d38999/H35.svg", "svgMirror": "d38999/H35.mirror.svg",
          "viewCaption": "Mating face, pin insert",
          "contacts": 55
        }
      ]
    }
  ]
}
```

- Пути SVG относительны `library/`.
- `items` отсортированы: prefix по алфавиту, number численно.
- `libraryVersion` — первые 8 hex sha256 от содержимого всех JSON + SVG.

## 3. Эволюция схемы

`schemaVersion` увеличивается при несовместимом изменении. Новые опциональные поля — без увеличения.
