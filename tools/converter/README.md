# d38999conv (prototype, M4 prep)

Python converter: source image/PDF -> `staging/<family>/<ID>.json` (schema-valid
`arrangement.schema.json`, `status: "draft"`). CV decides all geometry; a pluggable
reader only reads label characters. Never rotates/mirrors the source.

## Setup

```
C:\Users\noamv\AppData\Local\Programs\Python\Python312\python.exe -m venv tools/converter/.venv
tools/converter/.venv/Scripts/python.exe -m pip install -r tools/converter/requirements.txt
```

(Do not use the `python` on PATH -- it's a Microsoft Store alias.)

## Usage

```
cd tools/converter
.venv/Scripts/python.exe -m d38999conv convert ../../incoming --out ../../staging --reader null
```

For each `incoming/<ID>.{png,jpg,pdf}` (+ optional `incoming/<ID>.meta.json` sidecar
with `expectedContacts`), writes:
- `staging/d38999/<ID>.json` -- geometry model, `status: "draft"`
- `staging/d38999/<ID>.source.png` -- normalized raster for overlay/QA

**Important:** `tools/library/src/cli.ts render` expects `<dir>/<family>/<ID>.json`,
so the CLI writes JSON under `staging/d38999/`, not flat under `staging/`. After
converting, render SVGs with:

```
node tools/library/src/cli.ts render --library staging --dev
```

## Modules (`d38999conv/`)

- `adapter.py` -- load PNG/JPG/PDF (PyMuPDF page 0, 300 dpi) -> grayscale ndarray;
  `canvas` = raster size; writes `staging/<family>/<ID>.source.png`.
- `geometry.py` -- detect the insert circle (Hough + contour fallback) and contact
  circles (contour + isoperimetric circularity as primary signal, Hough as a
  corroborating cross-check only). Filters glyph-shaped false positives via contour
  hierarchy (a letter's enclosed counter is a hole inside a *non-circular* parent;
  a real ring's hole has a circular parent) and via repeated-size clustering. Snaps
  radii to discrete clusters (`cluster_radii`) and estimates hollow/filled style.
- `text.py` -- masks out detected circle ink, connected-components the remainder into
  glyphs, groups glyphs into label boxes. `LabelReader` protocol with `NullReader`
  (returns `"?"`, confidence 0), optional `TesseractReader` (activates only if
  `pytesseract` + the `tesseract` binary are both present; never required), and an
  `AIVisionReader` interface stub (no network calls -- future Claude-vision wiring).
- `assign.py` -- greedy nearest-neighbor label-box-to-contact assignment; records the
  label's real on-source anchor (`text.x/y`, `dominant-baseline: central` per
  `render.ts`), size (glyph height), and `start`/`end` anchor derived from which side
  of the contact the box actually sits on (no fixed offset assumed).
- `checks.py` -- QA warnings (0 contacts, duplicate/unlabeled/unread labels, orphan
  label boxes, `expectedContacts` mismatch, overlaps, out-of-canvas, sequence gaps)
  and an overall `qa.confidence`.
- `cli.py` -- `python -m d38999conv convert <in> --out <out> [--reader null|tesseract]`.

## Plugging in an AI vision reader

Implement `d38999conv.text.LabelReader.read(crop) -> (text, confidence)` against a
real vision API call (e.g. batching contact-label crops into one Claude request) and
pass an instance to `cli.convert_one(..., reader=...)`, or extend `_pick_reader` in
`cli.py` with a new `--reader` choice. Geometry/coordinates never come from the
reader -- only the label string and a confidence.

## Testing (synthetic round-trip)

Real source images are not yet available for use as a benchmark (see below for a
qualitative look at the one real sample that has arrived). `tests/synthetic.py`
rasterizes `fixtures/library/d38999/*.json` (OpenCV circles/putText, scale 2.5x,
optional blur/noise/JPEG) so the full pipeline can be exercised end-to-end.
`tests/test_roundtrip.py` compares detections to ground truth; `tests/test_cli_schema.py`
runs the CLI and validates output against `schema/arrangement.schema.json`.

```
tools/converter/.venv/Scripts/python.exe -m pytest tools/converter/tests -v
```

### Metrics (clean synthetic, 5 fixtures: A98, A99, B97, B99, C98)

| Fixture | Contacts | Recall | Precision | Mean center err (px) | Mean radius err (px) |
|---|---|---|---|---|---|
| A98 | 7  | 1.000 | 1.000 | 0.13 | 0.23 |
| A99 | 13 | 1.000 | 1.000 | 0.09 | 0.22 |
| B97 | 19 | 1.000 | 1.000 | 0.15 | 0.23 |
| B99 | 43 | 1.000 | 0.977 (1 spurious: keying dot) | -- | -- |
| C98 | 28 | 1.000 | 1.000 | 0.12 | 0.21 |

Every contact gets exactly one label box (NullReader -> `"?"`, confidence 0), except
where the one spurious keying detection above steals a neighbor's box (B99 -- see
known weaknesses).

### Metrics (degraded synthetic: blur, Gaussian noise, JPEG q60, all three combined)

Run on A98 and B97: recall = precision = 1.000 and mean center error stayed
<= 0.15px in all four degraded variants for both fixtures -- OpenCV's Otsu threshold
+ contour fit is robust to these particular degradations at this scale/line-weight.
This is expected to be optimistic vs. real scans/photos (see below).

## Real source: qualitative look (F28.png, deralconnectors.com catalog screenshot)

Not used for pass/fail metrics (too small an n, and not blessed as a benchmark yet),
but ran the adapter + geometry stage against it to gauge real-world behavior ahead of
M4:

- Canvas came in as 1080x2424 (a tall webpage screenshot, not tightly cropped to the
  diagram) -- adapter handled this fine, no assumptions about aspect ratio.
- Insert circle detected cleanly: `cx=527, cy=1265, r=510`.
- Contacts: 24 detected vs. `expectedContacts: 28` (recall ~86%). Correctly split
  into two radius clusters (22 @ r~34, 2 @ r~46), which does track the sidecar note
  of "2x #16, 26x #20" contacts (2 larger + a majority of smaller) though the
  detected size ratio (~0.74) is shallower than the "2x diameter" described --
  worth revisiting with a real second sample.
- Recall is visibly lower here (86%) than on clean synthetic (100%). Contact rings
  in a real screenshot have JPEG/anti-aliasing noise and touching label ink that
  clean OpenCV-drawn synthetic circles don't reproduce; the missing 4 are plausibly
  contacts whose ring fused with adjacent label ink strongly enough that even the
  touching-ink rescue pass (calibrated against a confirmed-cluster radius) didn't
  recover them, or whose ring circularity fell below the 0.85 threshold from
  compression artifacts.
- No crash, no garbage output -- pipeline is structurally ready for real sources;
  the main gap is precision/recall tuning against a larger real sample, not
  architecture.

## Known weaknesses

- **Circular keying marks are structurally ambiguous.** A filled circular keying dot
  close in size to real contacts cannot be distinguished from a contact by shape or
  size alone -- this is the one remaining synthetic false positive (B99). Resolving
  this needs either a stronger prior (e.g. keying marks sit *outside* the insert
  circle in real hardware -- our synthetic fixture deliberately places one inside,
  which is realistic for some keying conventions but not all) or an AI-vision pass
  that recognizes "keying tab/notch" as a distinct visual class.
- **Touching ink (ring fused with an adjacent label) can still evade detection.**
  The rescue pass in `geometry.py` recovers a fused ring only if its radius matches
  an already-confirmed size cluster; a fused ring in an otherwise-unconfirmed
  arrangement (e.g. first pass on a very noisy image) could still be lost.
  This is very likely part of what happened on F28.png (see above). An AI-vision
  reader that also proposes contact positions as a cross-check (still governed by
  CV for final coordinates) is a more direct fix and worth prioritizing for M4.
- **No real-source benchmark yet.** All quantitative metrics above are on clean or
  synthetically-degraded raster; real scans/photos/screenshots will have perspective,
  uneven lighting, compression, and print artifacts that synthetic blur/noise/JPEG
  only crudely approximate. Need 5-15 real sources (per
  `docs/CONVERTER_REQUIREMENTS.md`'s development strategy) to find the real
  recurring failure modes.
- **Label reading is not implemented.** `NullReader` always returns `"?"`; text
  detection (bounding boxes) is exercised and tested, but no OCR/AI reader has been
  wired up or measured. `TesseractReader` exists but wasn't evaluated (Tesseract
  isn't installed in this environment) -- accuracy on stylized connector-diagram
  fonts is unknown and likely to need the AI vision path instead.
- **`shapes`/`annotations` (keying triangles, "MASTER KEY" text, helper lines) are
  not extracted at all** -- the CLI always writes `"shapes": []`, `"annotations": []`.
  Real arrangements will need these for a complete conversion.

## What's needed from real sources (per CONVERTER_REQUIREMENTS.md's 5 -> 10-15 -> 50
development strategy)

1. 5-15 more real images (screenshots/scans/PDFs) spanning different manufacturers,
   to see recurring failure patterns beyond the single F28.png sample.
2. A decision on the keying-mark ambiguity: is there a reliable geometric prior
   (position relative to insert boundary, distinctive shape like a D-notch instead
   of a plain circle) that generalizes across sources?
3. A real OCR/AI-vision reader wired into `LabelReader` and measured for character
   accuracy on actual connector-diagram fonts -- this cannot be assessed on synthetic
   `putText` labels.
