"""Regression tests for two real-source bugs found while running a 50-image batch:

1. `detect_insert_circle`'s search range assumed the insert takes up 25-50% of the
   shorter canvas dimension. A real batch measured insert_r/min(w,h) as low as
   0.189 (generous margin + caption below the diagram) -- below the old 0.25
   floor, so detection returned None and everything downstream failed. Range
   widened to 0.12.
2. Even within range, `detect_insert_circle` trusted Hough's top accumulator peak
   blindly. A dense ring of contacts near the center can itself look like a
   circle to Hough and score higher than the true (larger) insert boundary --
   confirmed on a real source (D35) where Hough picked r=72 instead of the true
   r=164, silently rejecting most real contacts as "outside the insert". Fixed by
   making the largest sufficiently-circular *contour* (by area) primary, Hough a
   fallback only.
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from d38999conv.geometry import detect_insert_circle

W = H = 1000
CX, CY = 500, 500


def _blank() -> np.ndarray:
    return np.full((H, W), 255, dtype=np.uint8)


def test_small_insert_fraction_is_still_detected():
    """insert_r/min(w,h) ~ 0.15 -- below the old 0.25 floor, inside the new 0.12
    one. No other circular feature present."""
    img = _blank()
    r = 150  # 0.15 of 1000
    cv2.circle(img, (CX, CY), r, 0, thickness=2)
    insert = detect_insert_circle(img)
    assert insert is not None, "insert not detected at a realistic small-margin fraction"
    assert abs(insert.cx - CX) < 5 and abs(insert.cy - CY) < 5
    assert abs(insert.r - r) < 8


def test_dense_inner_ring_does_not_fool_insert_detection():
    """A true large insert boundary plus a ring of small filled dots near the
    center, arranged circularly -- the kind of pattern that can register as a
    smaller phantom circle to Hough. The true (larger) boundary must still win."""
    img = _blank()
    true_r = 400
    cv2.circle(img, (CX, CY), true_r, 0, thickness=2)
    phantom_r = 80
    n = 14
    for i in range(n):
        ang = 2 * np.pi * i / n
        cx = int(CX + phantom_r * np.cos(ang))
        cy = int(CY + phantom_r * np.sin(ang))
        cv2.circle(img, (cx, cy), 10, 0, thickness=-1)

    insert = detect_insert_circle(img)
    assert insert is not None
    assert abs(insert.r - true_r) < 15, f"picked the phantom inner ring (r~{phantom_r}) instead of the true insert (r={true_r}): got r={insert.r}"
    assert abs(insert.cx - CX) < 5 and abs(insert.cy - CY) < 5
