"""Rasterize a fixtures/library/d38999/*.json arrangement into a synthetic PNG,
so the converter pipeline can be round-trip tested without real source images.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

SCALE = 2.5  # native fixture coords -> raster pixels


@dataclass
class SyntheticResult:
    image: np.ndarray  # BGR uint8
    scale: float
    ground_truth: dict  # arrangement dict, coords still in native (unscaled) units


def load_fixture(path: str | Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def rasterize(
    arrangement: dict,
    scale: float = SCALE,
    blur: bool = False,
    noise: bool = False,
    jpeg_quality: int | None = None,
) -> SyntheticResult:
    w = int(arrangement["canvas"]["width"] * scale)
    h = int(arrangement["canvas"]["height"] * scale)
    img = np.full((h, w, 3), 255, dtype=np.uint8)

    def sx(v: float) -> int:
        return int(round(v * scale))

    insert = arrangement.get("insert")
    if insert:
        cv2.circle(img, (sx(insert["cx"]), sx(insert["cy"])), sx(insert["r"]), (0, 0, 0), thickness=max(1, int(scale)))

    for shape in arrangement.get("shapes", []):
        if shape["type"] == "circle":
            cv2.circle(
                img,
                (sx(shape["cx"]), sx(shape["cy"])),
                sx(shape["r"]),
                (0, 0, 0),
                thickness=-1 if shape.get("fill") else max(1, int(scale)),
            )
        elif shape["type"] == "line":
            cv2.line(img, (sx(shape["x1"]), sx(shape["y1"])), (sx(shape["x2"]), sx(shape["y2"])), (0, 0, 0), thickness=max(1, int(scale)))
        # paths (keying triangle) intentionally skipped: not part of contact geometry under test

    for c in arrangement["contacts"]:
        thickness = -1 if c.get("style") == "filled" else max(1, int(scale))
        cv2.circle(img, (sx(c["cx"]), sx(c["cy"])), sx(c["r"]), (0, 0, 0), thickness=thickness)
        t = c.get("text")
        if t:
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = (t.get("size", 12) * scale) / 24.0
            thick = max(1, int(scale * 0.9))
            label = c["label"]
            (tw, th), baseline = cv2.getTextSize(label, font, font_scale, thick)
            # render.ts convention: (x,y) is anchor point, dominant-baseline=central,
            # so y is the vertical CENTER of the glyph box. OpenCV putText's origin is
            # the text baseline, so shift down by half the cap-height to center it.
            anchor = t.get("anchor", "start")
            x = sx(t["x"])
            y = sx(t["y"])
            if anchor == "middle":
                ox = x - tw // 2
            elif anchor == "end":
                ox = x - tw
            else:
                ox = x
            oy = y + th // 2
            cv2.putText(img, label, (ox, oy), font, font_scale, (0, 0, 0), thick, cv2.LINE_AA)

    for ann in arrangement.get("annotations", []):
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = (ann.get("size", 12) * scale) / 24.0
        thick = max(1, int(scale * 0.9))
        (tw, th), _ = cv2.getTextSize(ann["text"], font, font_scale, thick)
        anchor = ann.get("anchor", "start")
        x = sx(ann["x"])
        y = sx(ann["y"])
        ox = x - tw // 2 if anchor == "middle" else (x - tw if anchor == "end" else x)
        oy = y + th // 2
        cv2.putText(img, ann["text"], (ox, oy), font, font_scale, (0, 0, 0), thick, cv2.LINE_AA)

    if blur:
        img = cv2.GaussianBlur(img, (3, 3), 0.6)
    if noise:
        rng = np.random.default_rng(42)
        noise_arr = rng.normal(0, 8, img.shape).astype(np.int16)
        img = np.clip(img.astype(np.int16) + noise_arr, 0, 255).astype(np.uint8)
    if jpeg_quality is not None:
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
        img = cv2.imdecode(buf, cv2.IMREAD_COLOR)

    return SyntheticResult(image=img, scale=scale, ground_truth=arrangement)
