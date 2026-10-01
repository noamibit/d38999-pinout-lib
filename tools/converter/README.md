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

## Real sources: 50-image batch (same site, user-supplied set, no ground truth yet)

A much larger real batch (50 images, filled-dot style, same source site as above --
this set replaced the earlier 7, which were lower-quality full-page screenshots of
the same arrangements) immediately surfaced two more real bugs, both now fixed:

1. **Insert-circle search range too narrow.** `detect_insert_circle` assumed the
   insert occupies 25-50% of the shorter canvas dimension. This batch's exports
   have more margin + a caption below the diagram, so insert_r/min(w,h) measured
   as low as 0.189 on some files -- below the old 0.25 floor. Below floor means
   `detect_insert_circle` returns `None`, which silently fails *everything*
   downstream for that file (confirmed: `B2.png`, a real 2-contact arrangement,
   detected **0** contacts before this fix). Floor lowered to 0.12.
2. **Hough picked a phantom inner circle over the true insert.** Even within
   range, `detect_insert_circle` trusted Hough's top accumulator peak without
   question. On `D35.png`, a dense ring of contacts near the center registered as
   a smaller, stronger-scoring "circle" to Hough (r=72) than the true insert
   boundary (r=164, nearly the same center) -- silently rejecting most real
   contacts as "outside the insert" (33 real contacts collapsed to effectively
   nothing useful). Fixed by making the largest sufficiently-circular *contour*
   (by measured area) primary, with Hough only as a fallback when no contour
   qualifies -- same "contour primary, Hough corroborating" principle
   `detect_contact_circles` already used. Both fixes are covered by
   `tests/test_insert_detection.py` (synthetic repros of each failure mode).

After both fixes: all 50 process without crashing, 1205 contacts detected in
total across the batch. No per-image ground truth was collected for this batch
(50 images is too many to hand-transcribe), so this is a volume/stability check,
not a recall measurement -- except for the one case below, confirmed by eye.

**New, unfixed finding: touching/overlapping contacts merge into one blob.**
`G41.png`'s caption reads "41 # 20" and visibly shows 41 contacts in tightly
packed concentric rings where adjacent dots touch or nearly touch -- the
converter found **1**. Confirmed by contour inspection: the second-largest
contour in the image (area 107954, second only to the insert boundary itself) is
almost certainly most of those 41 dots fused into a single connected blob via
8-connectivity, which fails circularity outright and is dropped as a whole. This
is a different failure mode from the axis-crosshair one above (which merges a
contact with a thin *line*; this merges contacts with *each other* directly) and
is likely to affect any sufficiently dense/high-pin-count real arrangement in
this style, not just G41. Not attempted yet -- the standard fix for
touching-blob separation is distance-transform + watershed segmentation, which
is a real, separate, non-trivial unit of work (and risks the same kind of
regression-elsewhere tradeoffs seen with the axis-crosshair fix if done
carelessly), not a quick patch. This is now the single highest-value remaining
geometry gap -- see "What's needed" below.

## Known weaknesses

- **Touching/overlapping contacts merge into one undifferentiated blob and are
  almost entirely lost.** Found on a dense real arrangement (G41: 41 contacts in
  tightly packed concentric rings, 1 detected) -- adjacent filled dots 8-connect
  into a single large contour that fails circularity outright. Needs
  distance-transform + watershed (or similar) blob-splitting; not attempted yet.
  See the 50-image batch section above. This is the single largest remaining
  geometry gap.
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

1. **Touching/overlapping contact separation** (distance-transform + watershed or
   similar) -- the highest-value remaining gap, found on the 50-image batch
   (G41: 41 expected, 1 detected). Likely affects every dense real arrangement in
   this style, not just G41.
2. Resolving the D19-like tightly-clustered on-axis case (see above) -- the
   isolated/moderately-spaced case is fixed and measured.
3. Per-image ground truth (expected ID -> true contact count, at minimum) for the
   50-image batch, so "detected N contacts" becomes a measured recall number
   instead of a volume/crash check -- 50 is too many to transcribe by hand in one
   sitting; worth doing incrementally or semi-automating (e.g. OCR'ing each
   image's own caption text, which states the count, instead of reading contacts).
4. At least one real *hollow*-style source (every sample so far is filled-dot
   style from one catalog website) to check whether the axis-crosshair fix and the
   hierarchy/circularity thresholds (tuned against synthetic hollow fixtures) hold
   up against a real hollow-ring drawing convention.
5. More real images spanning different manufacturers/drafting conventions, to see
   failure patterns beyond one website's style.
6. A decision on the keying-mark ambiguity: is there a reliable geometric prior
   (position relative to insert boundary, distinctive shape like a D-notch instead
   of a plain circle) that generalizes across sources?
7. A real OCR/AI-vision reader wired into `LabelReader` and measured for character
   accuracy on actual connector-diagram fonts -- this cannot be assessed on synthetic
   `putText` labels.
