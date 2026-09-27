"""Regression test for the axis-crosshair fix in geometry.py: a contact sitting
exactly on a drawn centerline through the insert must still be detected (it was
previously silently dropped -- see tools/converter/README.md's real-source
findings, confirmed against a real source before this fix existed).

Builds a minimal synthetic image directly (not from a fixtures/*.json ground truth,
since none of those draw a crosshair -- this is deliberately a self-contained
reproduction of the specific failure mode).
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from d38999conv.geometry import detect_geometry

W = H = 1000
CX, CY = 500, 500
INSERT_R = 460


def _draw_insert_and_crosshair(img: np.ndarray) -> None:
    cv2.circle(img, (CX, CY), INSERT_R, 0, thickness=2)
    cv2.line(img, (CX - INSERT_R, CY), (CX + INSERT_R, CY), 0, thickness=2)
    cv2.line(img, (CX, CY - INSERT_R), (CX, CY + INSERT_R), 0, thickness=2)


def _blank() -> np.ndarray:
    return np.full((H, W), 255, dtype=np.uint8)


def test_filled_contact_on_axis_is_detected_with_crosshair():
    """A filled contact at dead-center, with a crosshair drawn through it and
    extending well past it in all 4 directions (matching the real D19/F28 pattern:
    a full-length reference line, not just a short tick), must still be found."""
    img = _blank()
    _draw_insert_and_crosshair(img)
    r = 40
    cv2.circle(img, (CX, CY), r, 0, thickness=-1)  # filled contact exactly on-axis
    # An off-axis contact too, as a sanity control that detection works at all.
    cv2.circle(img, (CX + 220, CY + 220), r, 0, thickness=-1)

    geom = detect_geometry(img)
    centers = [(c.cx, c.cy, c.r) for c in geom.contacts]
    assert len(geom.contacts) == 2, f"expected 2 contacts, got {len(geom.contacts)}: {centers}"
    on_axis = min(geom.contacts, key=lambda c: (c.cx - CX) ** 2 + (c.cy - CY) ** 2)
    assert abs(on_axis.cx - CX) < 5 and abs(on_axis.cy - CY) < 5
    assert abs(on_axis.r - r) < 5


def test_multiple_isolated_on_axis_contacts_are_detected():
    """Several contacts spaced well apart along both axes (the case this fix
    measurably improved on real sources: F28, H53, H55) -- not the tightly-packed
    cluster case (D19-like), which is a documented remaining gap."""
    img = _blank()
    _draw_insert_and_crosshair(img)
    r = 30
    spacing = 260  # far enough apart that each line fragment between them is long
    positions = [
        (CX, CY),
        (CX - spacing, CY),
        (CX + spacing, CY),
        (CX, CY - spacing),
        (CX, CY + spacing),
    ]
    for cx, cy in positions:
        cv2.circle(img, (cx, cy), r, 0, thickness=-1)

    geom = detect_geometry(img)
    assert len(geom.contacts) == len(positions), (
        f"expected {len(positions)} contacts, got {len(geom.contacts)}: "
        f"{[(round(c.cx), round(c.cy)) for c in geom.contacts]}"
    )
    for cx, cy in positions:
        assert any(abs(c.cx - cx) < 6 and abs(c.cy - cy) < 6 for c in geom.contacts), (
            f"missing detection near ({cx},{cy})"
        )


def test_no_crosshair_is_unaffected():
    """Without a drawn crosshair, on-axis positioning is irrelevant -- confirms the
    fix is a no-op when the pattern it targets isn't present (matches every current
    synthetic fixture, none of which draw one)."""
    img = _blank()
    cv2.circle(img, (CX, CY), INSERT_R, 0, thickness=2)
    r = 40
    cv2.circle(img, (CX, CY), r, 0, thickness=-1)

    geom = detect_geometry(img)
    assert len(geom.contacts) == 1
    assert abs(geom.contacts[0].cx - CX) < 5 and abs(geom.contacts[0].cy - CY) < 5
