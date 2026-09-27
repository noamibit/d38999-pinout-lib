"""Text detection: find label glyph blobs (excluding circle geometry) and group
into label boxes. Reading characters is delegated to a pluggable LabelReader --
CV/box detection never guesses characters itself.
"""
from __future__ import annotations

import base64
import json
import os
import re
from dataclasses import dataclass
from typing import Protocol

import cv2
import numpy as np

from .geometry import Circle


@dataclass
class LabelBox:
    x0: int
    y0: int
    x1: int
    y1: int

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2.0

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2.0

    @property
    def height(self) -> float:
        return self.y1 - self.y0

    @property
    def width(self) -> float:
        return self.x1 - self.x0


class LabelReader(Protocol):
    """Reads characters from a cropped label image. Coordinates always come from CV;
    a reader only supplies (text, confidence)."""

    def read(self, crop: np.ndarray) -> tuple[str, float]:
        ...


class NullReader:
    """Default reader: does not attempt OCR. Always returns a placeholder."""

    def read(self, crop: np.ndarray) -> tuple[str, float]:
        return "?", 0.0


class TesseractReader:
    """Optional reader backed by pytesseract, active only if the package and the
    tesseract binary are both available. Construction raises RuntimeError otherwise,
    so callers can fall back to NullReader.
    """

    def __init__(self) -> None:
        try:
            import pytesseract  # noqa: F401
        except ImportError as e:
            raise RuntimeError("pytesseract not installed") from e
        try:
            pytesseract.get_tesseract_version()
        except Exception as e:  # binary missing / not on PATH
            raise RuntimeError("tesseract binary not found") from e
        self._pytesseract = pytesseract

    def read(self, crop: np.ndarray) -> tuple[str, float]:
        data = self._pytesseract.image_to_data(
            crop, config="--psm 10", output_type=self._pytesseract.Output.DICT
        )
        texts = [t.strip() for t in data.get("text", []) if t.strip()]
        confs = [float(c) for c in data.get("conf", []) if c not in ("-1", -1)]
        if not texts:
            return "?", 0.0
        text = "".join(texts)
        conf = (max(confs) / 100.0) if confs else 0.3
        return text, conf


def _encode_png(crop: np.ndarray, upscale_to: int = 96) -> str:
    """Upscale a (likely tiny) label crop before encoding -- stylized connector-diagram
    fonts at native crop resolution (often well under 30px tall) are hard for a vision
    model to read; a clean nearest/cubic upscale gives it more pixels to work with
    without inventing detail."""
    h, w = crop.shape[:2]
    scale = max(1.0, upscale_to / max(h, w))
    if scale > 1.0:
        crop = cv2.resize(crop, (max(1, round(w * scale)), max(1, round(h * scale))), interpolation=cv2.INTER_CUBIC)
    ok, buf = cv2.imencode(".png", crop)
    if not ok:
        raise RuntimeError("failed to encode label crop as PNG")
    return base64.b64encode(buf.tobytes()).decode("ascii")


def _extract_json_array(text: str) -> str:
    """The model is asked to reply with only a JSON array, but strip a ```json
    fence or leading/trailing prose defensively."""
    m = re.search(r"\[.*\]", text, re.DOTALL)
    return m.group(0) if m else text


class AIVisionReader:
    """Reads contact labels via the Claude API (vision).

    Batches every label crop for one arrangement into a single request (see
    `read_batch`) -- `read()` exists only to satisfy the single-crop `LabelReader`
    protocol for callers that don't batch, and is far less efficient (one API call
    per contact).

    Requires the `anthropic` package and an `ANTHROPIC_API_KEY` in the environment.
    Never pass the key as a CLI argument or hardcode it -- set it in your own shell
    or a local (gitignored) `.env` before running the converter with `--reader ai`.
    """

    def __init__(self, model: str = "claude-sonnet-5", client=None) -> None:
        """`client`: inject a fake for testing (must expose `.messages.create(...)`
        with the same shape as the real SDK). Left as None in normal use, which
        constructs a real `anthropic.Anthropic` client from `ANTHROPIC_API_KEY`."""
        if client is not None:
            self._client = client
        else:
            try:
                import anthropic
            except ImportError as e:
                raise RuntimeError("anthropic package not installed (pip install anthropic)") from e
            api_key = os.environ.get("ANTHROPIC_API_KEY")
            if not api_key:
                raise RuntimeError(
                    "ANTHROPIC_API_KEY not set. Set it in your own shell (or a local, "
                    "gitignored .env) before running with --reader ai; it is never read "
                    "from a CLI argument or committed anywhere."
                )
            self._client = anthropic.Anthropic(api_key=api_key)
        self._model = model

    def read(self, crop: np.ndarray) -> tuple[str, float]:
        return self.read_batch([crop])[0]

    def read_batch(self, crops: list[np.ndarray]) -> list[tuple[str, float]]:
        if not crops:
            return []
        prompt = (
            "Each image below is a cropped label from a D38999 connector pin "
            "arrangement diagram, showing exactly one contact's identifying letter "
            "code (e.g. 'A', 'b', 'AA', 'a*'). Read each crop exactly as printed, "
            "preserving case -- uppercase and lowercase are different, distinct "
            "contacts. Reply with ONLY a JSON array of strings, one per image in "
            'the same order, e.g. ["A","b","AA"]. If a crop is unreadable, empty, '
            'or not a label, use "?" for that entry. No other text.'
        )
        content: list[dict] = [{"type": "text", "text": prompt}]
        for crop in crops:
            content.append(
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": "image/png", "data": _encode_png(crop)},
                }
            )
        resp = self._client.messages.create(
            model=self._model,
            max_tokens=4000,
            messages=[{"role": "user", "content": content}],
        )
        raw = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
        try:
            texts = json.loads(_extract_json_array(raw))
            if not isinstance(texts, list):
                raise ValueError("response is not a JSON array")
        except Exception:
            return [("?", 0.0)] * len(crops)

        texts = [str(t) if t is not None else "?" for t in texts]
        if len(texts) < len(crops):
            texts += ["?"] * (len(crops) - len(texts))
        elif len(texts) > len(crops):
            texts = texts[: len(crops)]
        return [(t, 0.0 if t == "?" else 0.9) for t in texts]


def _mask_out_circles(binary: np.ndarray, circles: list[Circle], insert: Circle | None, pad: float = 1.15) -> np.ndarray:
    """Zero out pixels belonging to detected circle geometry (contact rings + insert
    outline) so only text/glyph ink remains."""
    mask = binary.copy()
    h, w = mask.shape[:2]
    for c in circles:
        cv2.circle(mask, (int(round(c.cx)), int(round(c.cy))), int(round(c.r * pad)) + 1, 0, thickness=-1)
    if insert is not None:
        ring = max(3, int(insert.r * 0.02))
        # Centered on the detected radius (not offset outward) so the mask covers
        # both a slight over- and under-estimate of the true boundary, plus
        # anti-aliasing fringe on either side.
        cv2.circle(mask, (int(round(insert.cx)), int(round(insert.cy))), int(round(insert.r)), 0, thickness=ring * 2)
    return mask


def detect_label_boxes(
    binary: np.ndarray,
    circles: list[Circle],
    insert: Circle | None,
    min_glyph_area: int = 6,
    max_glyph_area_frac: float = 0.02,
    group_gap_frac: float = 1.2,
    extra_circles: list[Circle] | None = None,
) -> list[LabelBox]:
    """Find connected components that are not circle geometry, then group nearby
    components (glyphs of the same label) into label boxes.

    `extra_circles` masks out additional non-text circular ink (e.g. a keying dot
    that geometry.py detected but rejected as a contact) so it can't bridge into and
    inflate a nearby label's bounding box.
    """
    h, w = binary.shape[:2]
    all_circles = list(circles) + list(extra_circles or [])
    text_mask = _mask_out_circles(binary, all_circles, insert)

    max_area = h * w * max_glyph_area_frac
    n, labels, stats, centroids = cv2.connectedComponentsWithStats(text_mask, connectivity=8)

    glyphs = []
    for i in range(1, n):  # skip background
        area = stats[i, cv2.CC_STAT_AREA]
        if area < min_glyph_area or area > max_area:
            continue
        x = stats[i, cv2.CC_STAT_LEFT]
        y = stats[i, cv2.CC_STAT_TOP]
        gw = stats[i, cv2.CC_STAT_WIDTH]
        gh = stats[i, cv2.CC_STAT_HEIGHT]
        glyphs.append((x, y, x + gw, y + gh))

    if not glyphs:
        return []

    # Estimate typical glyph height to set grouping distance.
    heights = sorted(g[3] - g[1] for g in glyphs)
    median_h = heights[len(heights) // 2] if heights else 10
    gap = median_h * group_gap_frac

    boxes = [list(g) for g in glyphs]
    changed = True
    while changed:
        changed = False
        merged_boxes: list[list[int]] = []
        used = [False] * len(boxes)
        for i, bi in enumerate(boxes):
            if used[i]:
                continue
            cur = list(bi)
            used[i] = True
            progress = True
            while progress:
                progress = False
                for j, bj in enumerate(boxes):
                    if used[j]:
                        continue
                    if _boxes_close(cur, bj, gap):
                        cur[0] = min(cur[0], bj[0])
                        cur[1] = min(cur[1], bj[1])
                        cur[2] = max(cur[2], bj[2])
                        cur[3] = max(cur[3], bj[3])
                        used[j] = True
                        progress = True
                        changed = True
            merged_boxes.append(cur)
        boxes = merged_boxes

    # The merge above is a transitive proximity closure: if A is close to B and B is
    # close to C, all three merge into one box even when A and C are far apart (e.g.
    # a chain of glyphs bridging a real label into unrelated ink elsewhere on the
    # page, such as a caption line below the diagram). A single connector label is
    # never more than a few characters, so any merged box wildly taller/wider than a
    # single glyph is not a label -- drop it rather than feed a garbage-sized text
    # placement downstream.
    max_dim = median_h * 6
    boxes = [b for b in boxes if (b[2] - b[0]) <= max_dim and (b[3] - b[1]) <= max_dim]

    return [LabelBox(x0=int(b[0]), y0=int(b[1]), x1=int(b[2]), y1=int(b[3])) for b in boxes]


def _boxes_close(a: list[int], b: list[int], gap: float) -> bool:
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    dx = max(ax0 - bx1, bx0 - ax1, 0)
    dy = max(ay0 - by1, by0 - ay1, 0)
    return dx <= gap and dy <= gap


def read_labels(gray: np.ndarray, boxes: list[LabelBox], reader: LabelReader, pad: int = 2) -> list[tuple[LabelBox, str, float]]:
    """Reads each box's crop via `reader`. If `reader` exposes `read_batch` (e.g.
    AIVisionReader), all crops for this arrangement go in one call instead of one
    API round-trip per contact."""
    h, w = gray.shape[:2]
    crops = []
    for b in boxes:
        x0 = max(0, b.x0 - pad)
        y0 = max(0, b.y0 - pad)
        x1 = min(w, b.x1 + pad)
        y1 = min(h, b.y1 + pad)
        crops.append(gray[y0:y1, x0:x1])

    read_batch = getattr(reader, "read_batch", None)
    results = read_batch(crops) if read_batch else [reader.read(c) for c in crops]
    return [(b, text, conf) for b, (text, conf) in zip(boxes, results)]
