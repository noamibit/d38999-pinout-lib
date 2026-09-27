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

| Source | Expected | Detected | Recall |
|---|---|---|---|
| F11 | 11 | 11 | 100% |
| G11 | 11 | 11 | 100% |
| F28 | 28 | 24 | 86% |
| D19 | 19 | 12 | 63% |
| J19 | 19 | 12 | 63% |
| H53 | 53 | 41 | 77% |
| H55 | 55 | 42 | 76% |

**Root cause found for the D19/J19/H53/H55 shortfall, confirmed by pixel inspection
(not just inferred):** these diagrams draw a full-length horizontal + vertical
centerline ("crosshair") through the insert for orientation. Every missed contact
sits exactly on that crosshair (e.g. D19's dead-center "V", and the entire
K/U/R/D horizontal row; cropping the source around those coordinates shows the
line's ink running straight through and past the contact's disc in all 4
directions). Because contour extraction is 8-connected, each on-axis contact's ink
merges with the line into one blob whose `minEnclosingCircle` radius balloons far
past `max_r_frac` -- it's dropped by the radius gate before circularity is even
checked. F11/G11 have a crosshair too but no contact happens to sit exactly on it,
hence their clean 100%. F28's center contact ("e") is large enough / the line
apparently doesn't reach it in the same way -- its 4 misses are a different,
smaller-magnitude effect (plausibly touching label ink, as originally guessed).

**A fix was attempted and reverted.** Blanking a thin band along the crosshair
(through the already-known `insert.cx/cy`) before contour extraction does sever the
bridge and is safe for *filled* on-axis contacts (a thin scratch through solid ink
doesn't change the outer boundary) -- but it also cuts a real gap through a *hollow*
ring's stroke wherever the ring crosses the axis, which regressed the synthetic
fixture suite (whose hollow-style fixtures include a deliberate dead-center contact,
same as F28's "e"/H55's "HH"). Reverted rather than ship a fix that trades one
recall bug for another, since this codebase has no hollow-style real samples yet to
validate against. The direction that avoids the tradeoff: detect the crosshair
explicitly (e.g. `HoughLinesP` for a long thin line through the insert center) and
erase *only* pixels that are line-only by local morphology (survive-opening test)
rather than a blanket band -- sketched but not implemented; worth doing once a
hollow-style real sample exists to validate against, not just synthetic ones.

No crashes, no garbage output on any of the 7 -- pipeline is structurally ready for
real sources; the open gap is this one well-understood geometry case plus the
not-yet-implemented label reader, not the overall architecture.

## Known weaknesses

- **On-axis contacts (sitting exactly on a drawn centerline/crosshair) are often
  missed.** Root cause confirmed (see above): the line's ink merges with the
  contact's via 8-connectivity, and the combined blob is rejected by the max-radius
  gate. This is the single largest recall gap found so far (accounts for most of
  the D19/J19/H53/H55 misses above). Fixing it safely for both filled and hollow
  contact styles needs the crosshair to be detected and stripped explicitly
  (`HoughLinesP` + local morphological survive-opening), not a blanket band erase --
  see above for why the naive version was reverted.
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

1. A properly implemented crosshair-strip fix (Hough line detection + local
   morphological survive-opening, see above), validated against **both** a filled
   and a hollow-style real sample -- this is now the single highest-value fix
   (largest measured recall gap, root cause already confirmed).
2. At least one real *hollow*-style source (all 7 samples so far are filled-dot
   style from one catalog website) to validate the above fix and check whether the
   hierarchy/circularity thresholds tuned on synthetic hollow fixtures hold up.
3. More real images spanning different manufacturers/drafting conventions, to see
   failure patterns beyond one website's style.
4. A decision on the keying-mark ambiguity: is there a reliable geometric prior
   (position relative to insert boundary, distinctive shape like a D-notch instead
   of a plain circle) that generalizes across sources?
5. A real OCR/AI-vision reader wired into `LabelReader` and measured for character
   accuracy on actual connector-diagram fonts -- this cannot be assessed on synthetic
   `putText` labels.
