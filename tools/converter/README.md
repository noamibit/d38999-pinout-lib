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

`--reader` selects how contact labels are read: `null` (default; no OCR, labels
come out as placeholders `#1`, `#2`... -- geometry-only, useful for measuring
recall before wiring up reading) | `tesseract` (local, untested against real
connector-diagram fonts, needs pytesseract + the tesseract binary) | `ai` (Claude
vision, batches every label crop for one arrangement into a single API request --
see below).

### Reading labels with Claude vision (`--reader ai`)

```
export ANTHROPIC_API_KEY=sk-...     # your own key, your own shell -- never pass
                                     # it as a CLI arg or commit it anywhere
cd tools/converter
.venv/Scripts/python.exe -m d38999conv convert ../../incoming --out ../../staging --reader ai
```

Costs real API usage (roughly a few cents per arrangement -- one request per
source, with every contact's label crop as a separate image in that one request,
not one request per contact). If the key is missing or the package isn't
installed, `_pick_reader` warns and falls back to `NullReader` rather than
failing the whole batch. Response parsing (JSON-array extraction, markdown-fence
stripping, short/long response padding, malformed-response fallback to `"?"`) is
unit-tested against a fake client in `tests/test_ai_vision_reader.py` -- no real
API calls are made in tests.

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
  glyphs, groups glyphs into label boxes (with a size cap that drops any box wildly
  larger than a single glyph, so a chain of nearby glyphs can't transitively merge
  into a bogus giant label spanning unrelated ink -- see the real-source findings
  below). `LabelReader` protocol with `NullReader` (returns `"?"`, confidence 0),
  optional `TesseractReader` (activates only if `pytesseract` + the `tesseract`
  binary are both present; never required), and `AIVisionReader` (Claude vision,
  reads `ANTHROPIC_API_KEY` from the environment, batches all of one arrangement's
  crops into a single request via `read_batch`).
- `assign.py` -- greedy nearest-neighbor label-box-to-contact assignment; records the
  label's real on-source anchor (`text.x/y`, `dominant-baseline: central` per
  `render.ts`), size (glyph height), and `start`/`end` anchor derived from which side
  of the contact the box actually sits on (no fixed offset assumed).
- `checks.py` -- QA warnings (0 contacts, duplicate/unlabeled/unread labels, orphan
  label boxes, `expectedContacts` mismatch, overlaps, out-of-canvas, sequence gaps)
  and an overall `qa.confidence`.
- `cli.py` -- `python -m d38999conv convert <in> --out <out> [--reader null|tesseract|ai]`.

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

## Real sources: quantitative look (7 samples, deralconnectors.com catalog screenshots)

Not a blessed benchmark (small n, single source website/style), but real enough to
find real failure modes ahead of M4's 5→10-15→50 dataset. All 7 are flat solid-color
contacts (`style: "filled"`), no OCR attempted (NullReader; labels are placeholder
`#N` and don't count toward recall here -- only geometry/count).

| Source | Expected | Detected (before fix) | Detected (after fix) |
|---|---|---|---|
| F11 | 11 | 11 (100%) | 11 (100%) |
| G11 | 11 | 11 (100%) | 11 (100%) |
| F28 | 28 | 24 (86%) | **28 (100%)** |
| D19 | 19 | 12 (63%) | 12 (63%) -- unchanged, see below |
| J19 | 19 | 12 (63%) | 13 (68%) |
| H53 | 53 | 41 (77%) | **46 (87%)** |
| H55 | 55 | 42 (76%) | **48 (87%)** |

Aggregate: 153/196 (78%) -> 169/196 (86%).

**Root cause (confirmed by pixel inspection, not just inferred):** these diagrams
draw a full-length horizontal + vertical centerline ("crosshair") through the
insert for orientation. A contact sitting exactly on that line gets its ink
8-connected to the line; the merged blob's `minEnclosingCircle` balloons past
`max_r_frac` and is dropped by the radius gate before circularity is even checked.
F11/G11 have a crosshair too but no contact happens to sit exactly on it, hence
their clean 100% even before the fix.

**Fix (`_strip_axis_crosshair`/`_detect_axis_lines` in `geometry.py`):** explicitly
detect long, thin, axis-aligned line segments whose infinite extension passes
through the already-known insert center (`HoughLinesP`, filtered by angle +
center-distance), then -- only within a thin band around those specific detected
segments -- erase a pixel if it does **not** survive a local morphological opening
(i.e. it's line-only). A thick contact's own ink (filled disc or ring stroke)
survives the opening and is left untouched; a no-op when no qualifying line is
found (every current synthetic fixture, which draws no crosshair -- confirmed by
`tests/test_axis_crosshair.py::test_no_crosshair_is_unaffected` and by the
unchanged synthetic-suite metrics above). This is safer than an earlier attempt
that blanked a full-width/height band regardless of content, which fixed the same
real cases but broke hollow-style synthetic fixtures with a dead-center contact
(reverted; superseded by this version).

**D19 remains unfixed -- known, understood gap.** Its on-axis contacts (K/U/V/R/D)
are packed close enough together that the crosshair fragments *between* them are
individually shorter than any reasonable `minLineLength`, so they're never detected
as qualifying lines and the blob merge still happens for that cluster. A much
shorter `minLineLength` was tried to catch this, relying only on the strict
center-distance filter for precision -- it measurably *hurt* H53/H55 (loosened
segments picked up collateral false positives elsewhere) while still not fixing
D19, so it was reverted in favor of the current, better-aggregate-score parameters.
Resolving D19-like clusters needs a different signal than segment length (e.g.
reconstructing the axis from many short colinear fragments via a Hough accumulator
peak rather than per-segment length, or a second morphological pass keyed to the
confirmed contact-size cluster once a first pass has established it).

No crashes, no garbage output on any of the 7 -- pipeline is structurally ready for
real sources; open gaps are this one geometry edge case, the not-yet-measured label
reader (see below), and needing a real hollow-style sample, not the architecture.

## Known weaknesses

- **On-axis contacts in a tightly-packed cluster (D19-like) are still missed.**
  Fixed for isolated/moderately-spaced on-axis contacts (see above); the remaining
  case is contacts close enough together that the crosshair fragment *between* them
  is too short to register as a detected line. Not yet resolved -- see above for
  what was tried and why.
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
- **Label reading is wired up (`AIVisionReader`, `--reader ai`) but not yet measured
  against a real API key/response** -- response-parsing logic (JSON extraction,
  fence-stripping, malformed/short/long responses) is unit-tested against a fake
  client, but character-accuracy on real stylized connector-diagram fonts is
  unknown until run with a real `ANTHROPIC_API_KEY` against real crops. This is
  the next thing to validate once a key is available. `TesseractReader` exists but
  wasn't evaluated (Tesseract isn't installed in this environment) and is expected
  to do worse on these fonts than the vision path.
- **`shapes`/`annotations` (keying triangles, "MASTER KEY" text, helper lines) are
  not extracted at all** -- the CLI always writes `"shapes": []`, `"annotations": []`.
  Real arrangements will need these for a complete conversion.

## What's needed from real sources (per CONVERTER_REQUIREMENTS.md's 5 -> 10-15 -> 50
development strategy)

1. Resolving the D19-like tightly-clustered on-axis case (see above) -- the
   isolated/moderately-spaced case is fixed and measured.
2. At least one real *hollow*-style source (all 7 samples so far are filled-dot
   style from one catalog website) to check whether the axis-crosshair fix and the
   hierarchy/circularity thresholds (tuned against synthetic hollow fixtures) hold
   up against a real hollow-ring drawing convention.
3. More real images spanning different manufacturers/drafting conventions, to see
   failure patterns beyond one website's style.
4. A decision on the keying-mark ambiguity: is there a reliable geometric prior
   (position relative to insert boundary, distinctive shape like a D-notch instead
   of a plain circle) that generalizes across sources?
5. A real OCR/AI-vision reader wired into `LabelReader` and measured for character
   accuracy on actual connector-diagram fonts -- this cannot be assessed on synthetic
   `putText` labels.
