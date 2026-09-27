"""Geometry detection: outer insert circle + contact circles.

CV decides all geometry (coordinates, radii, style). Never touches label text.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np


@dataclass
class Circle:
    cx: float
    cy: float
    r: float
    filled: bool = False
    score: float = 0.0  # circularity / confidence, informational
    hierarchy_ok: bool = True  # False if this hole's parent contour is non-circular (likely glyph counter)


@dataclass
class GeometryResult:
    insert: Circle | None
    contacts: list[Circle] = field(default_factory=list)
    binary: np.ndarray | None = None  # thresholded image, for reuse by text.py
    non_contact_circles: list[Circle] = field(default_factory=list)  # rejected circular blobs (e.g. keying dots)


def _preprocess(gray: np.ndarray) -> np.ndarray:
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    return blurred


def _binarize(gray: np.ndarray) -> np.ndarray:
    # Otsu global threshold; inverted so ink/lines are white (255) on black bg.
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return binary


def detect_insert_circle(gray: np.ndarray) -> Circle | None:
    """Detect the single large outer insert circle via Hough, falling back to the
    largest near-circular contour."""
    h, w = gray.shape[:2]
    blurred = _preprocess(gray)
    min_r = int(min(h, w) * 0.25)
    max_r = int(min(h, w) * 0.5)

    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.5,
        minDist=max(h, w),
        param1=80,
        param2=60,
        minRadius=min_r,
        maxRadius=max_r,
    )
    if circles is not None:
        cx, cy, r = circles[0][0]
        return Circle(cx=float(cx), cy=float(cy), r=float(r))

    # Fallback: largest near-circular contour.
    binary = _binarize(gray)
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    best = None
    best_area = 0.0
    for c in contours:
        area = cv2.contourArea(c)
        if area < (min_r**2) * 3.0:
            continue
        (cx, cy), r = cv2.minEnclosingCircle(c)
        if r < min_r or r > max_r * 1.3:
            continue
        circularity = area / (np.pi * r * r) if r > 0 else 0
        if circularity < 0.6:
            continue
        if area > best_area:
            best_area = area
            best = Circle(cx=float(cx), cy=float(cy), r=float(r))
    return best


def _detect_axis_lines(binary: np.ndarray, insert: Circle, angle_tol_deg: float = 3.0) -> list[tuple[int, int, int, int]]:
    """Find long, thin, axis-aligned line segments whose infinite extension passes
    through the insert center -- the "crosshair" some source diagrams draw for
    orientation. Deliberately narrow (long + straight + axis-aligned + centered) so
    it doesn't fire on short keying marks, ring arcs, or diagonal features."""
    # Note: a much shorter minLineLength was tried (to catch crosshair fragments
    # broken up by closely-clustered on-axis contacts, e.g. D19's K/U/V/R/D row)
    # but measured *worse* aggregate recall on the real sample set -- short,
    # loosely-constrained segments picked up collateral false positives elsewhere
    # (H53/H55 recall dropped). Kept at this length: it fixes the isolated/
    # moderately-spaced on-axis case (F28, H53, H55, J19 all measurably improved)
    # without that regression. A tightly-spaced cluster like D19's is a known
    # remaining gap -- see README.
    min_len = max(20, int(insert.r * 0.4))
    lines = cv2.HoughLinesP(
        binary,
        1,
        np.pi / 180,
        threshold=max(10, int(min_len * 0.5)),
        minLineLength=min_len,
        maxLineGap=max(4, int(insert.r * 0.03)),
    )
    if lines is None:
        return []
    hits: list[tuple[int, int, int, int]] = []
    for x1, y1, x2, y2 in lines[:, 0]:
        dx, dy = float(x2 - x1), float(y2 - y1)
        length = (dx * dx + dy * dy) ** 0.5
        if length < min_len:
            continue
        angle = abs(np.degrees(np.arctan2(dy, dx)))
        is_horiz = angle < angle_tol_deg or angle > 180 - angle_tol_deg
        is_vert = abs(angle - 90) < angle_tol_deg
        if not (is_horiz or is_vert):
            continue
        # Perpendicular distance from the known insert center to this segment's
        # infinite line -- only a line running through the center is a crosshair.
        ax, ay = x1 - insert.cx, y1 - insert.cy
        dist = abs(ax * dy - ay * dx) / length
        if dist > max(3.0, insert.r * 0.01):
            continue
        hits.append((int(x1), int(y1), int(x2), int(y2)))
    return hits


def _strip_axis_crosshair(binary: np.ndarray, insert: Circle | None) -> np.ndarray:
    """Some source diagrams draw a full-length horizontal/vertical centerline
    ("crosshair") through the insert for orientation. A contact whose ink touches
    that line gets 8-connected into one oversized blob whose minEnclosingCircle
    exceeds max_r and is silently dropped by the radius gate below, before
    circularity is even checked -- confirmed by pixel inspection against a real
    source (see tools/converter/README.md's real-source findings).

    Fix is deliberately conservative: detect the line explicitly (see
    `_detect_axis_lines` -- long, thin, axis-aligned, centered on the already-known
    insert), then within a thin band around only those detected segments, erase a
    pixel only if it does NOT survive a local morphological opening (i.e. it's
    thin/line-only). A thick contact's own ink -- filled disc or ring stroke --
    survives the opening and is left untouched; only the connecting line ink is
    cut. When no qualifying line is found (e.g. every current synthetic fixture,
    which doesn't draw one), this is a strict no-op.
    """
    if insert is None:
        return binary
    segments = _detect_axis_lines(binary, insert)
    if not segments:
        return binary
    h, w = binary.shape[:2]
    axis_mask = np.zeros((h, w), dtype=np.uint8)
    for x1, y1, x2, y2 in segments:
        cv2.line(axis_mask, (x1, y1), (x2, y2), 255, thickness=5)
    k = max(3, round(min(h, w) / 150))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    opened = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    out = binary.copy()
    out[(axis_mask > 0) & (opened == 0)] = 0
    return out


def detect_contact_circles(
    gray: np.ndarray,
    insert: Circle | None,
    min_r: int = 4,
    max_r_frac: float = 0.15,
) -> list[Circle]:
    """Detect contact circles via contour + isoperimetric-circularity fitting (primary),
    cross-checked against Hough as a secondary confirmation signal only -- Hough alone
    is too permissive at low accumulator thresholds (fires on text texture), so its
    output is used only to accept borderline contour candidates, never as an
    independent source of circles.
    """
    h, w = gray.shape[:2]
    blurred = _preprocess(gray)
    max_r = int(min(h, w) * max_r_frac)

    hough_hits: list[Circle] = []
    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1,
        minDist=max(min_r * 2, 6),
        param1=80,
        param2=30,
        minRadius=min_r,
        maxRadius=max_r,
    )
    if circles is not None:
        for cx, cy, r in circles[0]:
            hough_hits.append(Circle(cx=float(cx), cy=float(cy), r=float(r)))

    # Contour-based pass: primary source of contact candidates, filtered by shape
    # (isoperimetric circularity) so glyph loops don't qualify.
    binary = _binarize(gray)
    contour_source = _strip_axis_crosshair(binary, insert)
    # RETR_CCOMP gives 2-level hierarchy (outer boundaries + holes), which lets us
    # reject a common false positive: the enclosed counter of a rounded letterform
    # (e.g. 'B', 'D', 'P', 'R', 'O') is itself near-circular, but it is a *hole inside
    # a non-circular parent* (the glyph's outer stroke). A genuine hollow contact ring
    # is the opposite: its hole's parent (the ring's outer edge) is ALSO circular. So a
    # hole candidate is only accepted if it has no parent, or its parent is circular too.
    contours, hierarchy = cv2.findContours(contour_source, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    hierarchy = hierarchy[0] if hierarchy is not None else []

    def _isoperimetric_circularity(contour) -> float:
        a = cv2.contourArea(contour)
        p = cv2.arcLength(contour, True)
        return (4 * np.pi * a / (p * p)) if p > 0 else 0.0

    contour_circles: list[Circle] = []
    for i, c in enumerate(contours):
        area = cv2.contourArea(c)
        if area < np.pi * (min_r**2) * 0.5:
            continue
        (cx, cy), r = cv2.minEnclosingCircle(c)
        if r < min_r or r > max_r:
            continue
        if insert is not None:
            d = ((cx - insert.cx) ** 2 + (cy - insert.cy) ** 2) ** 0.5
            if d > insert.r * 0.98:
                continue
        # Isoperimetric circularity (4*pi*Area/Perimeter^2) discriminates true circles
        # from similarly-sized but non-circular blobs (e.g. rounded letter glyphs like
        # 'B'/'D'/'O') far better than area/(pi*r^2), which both a circle and a blob
        # enclosing similar area can satisfy.
        circularity = _isoperimetric_circularity(c)
        if circularity < 0.85:
            continue
        parent_idx = int(hierarchy[i][3]) if len(hierarchy) else -1
        hierarchy_ok = True
        if parent_idx != -1:
            parent_circularity = _isoperimetric_circularity(contours[parent_idx])
            if parent_circularity < 0.75:
                # Hole inside a non-circular shape -- usually a glyph counter (e.g.
                # 'B'/'D'/'P'/'R'/'O'), not a ring. Not hard-rejected here: a real
                # contact's outer ring can fuse with a touching/adjacent label and
                # lose circularity too, so this is resolved later using cluster
                # membership (see _filter_singleton_outliers), not dropped outright.
                hierarchy_ok = False
        filled = _is_filled(binary, cx, cy, r)
        # Small confidence boost when a Hough response independently agrees with this
        # contour candidate -- corroboration from a second detector.
        confirmed = any(
            ((cx - hx) ** 2 + (cy - hy) ** 2) ** 0.5 < r * 0.4 and abs(hr - r) < r * 0.4
            for hx, hy, hr in ((hh.cx, hh.cy, hh.r) for hh in hough_hits)
        )
        score = min(1.0, circularity + (0.02 if confirmed else 0.0))
        contour_circles.append(
            Circle(cx=float(cx), cy=float(cy), r=float(r), filled=filled, score=score, hierarchy_ok=hierarchy_ok)
        )

    # Pass 1: hard-reject hierarchy failures (glyph counters). This is deliberately
    # strict and gives a clean set of "confirmed" contact sizes to calibrate against.
    confirmed_circles = [c for c in contour_circles if c.hierarchy_ok]
    merged = _merge_circles(confirmed_circles, dist_frac=0.6)
    merged = _suppress_overlaps(merged)
    merged = _filter_singleton_outliers(merged)

    # Pass 2: rescue hierarchy-failed candidates whose radius matches a confirmed
    # cluster from pass 1 -- this recovers real contacts whose outer ring fused with
    # a touching/adjacent label glyph (breaking their own hierarchy check) without
    # reopening the door to glyph-loop noise, since noise radii don't match.
    if merged:
        confirmed_radii = sorted({round(c.r, 1) for c in merged})
        rescued = [
            c
            for c in contour_circles
            if not c.hierarchy_ok
            and any(abs(c.r - cr) <= cr * 0.18 for cr in confirmed_radii)
        ]
        if rescued:
            merged = _suppress_overlaps(_merge_circles(merged + rescued, dist_frac=0.6))

    # Restrict to inside insert (with small tolerance) and drop anything ~insert-sized.
    result = []
    for c in merged:
        if insert is not None:
            d = ((c.cx - insert.cx) ** 2 + (c.cy - insert.cy) ** 2) ** 0.5
            if d > insert.r * 0.98:
                continue
            if c.r > insert.r * 0.4:
                continue
        # attach filled flag if not already set (Hough circles lack it)
        if not c.filled:
            c.filled = _is_filled(binary, c.cx, c.cy, c.r)
        result.append(c)

    # All near-circular ink blobs found (including ones rejected as contacts, e.g. a
    # keying dot filtered out by the size/singleton heuristic) are still real ink
    # shapes, not text -- callers doing text/glyph detection should mask these out
    # too, or their un-masked ink can bridge into and inflate nearby label boxes.
    return result, contour_circles


def _is_filled(binary: np.ndarray, cx: float, cy: float, r: float, sample_frac: float = 0.4) -> bool:
    """A circle is 'filled' if most of its interior (within sample_frac * r) is ink."""
    h, w = binary.shape[:2]
    rr = max(1, int(r * sample_frac))
    x0, x1 = max(0, int(cx - rr)), min(w, int(cx + rr))
    y0, y1 = max(0, int(cy - rr)), min(h, int(cy + rr))
    if x1 <= x0 or y1 <= y0:
        return False
    patch = binary[y0:y1, x0:x1]
    return float(np.mean(patch > 0)) > 0.6


def _merge_circles(circles: list[Circle], dist_frac: float = 0.6, r_tol: float = 0.25) -> list[Circle]:
    """Merge near-duplicate circles (from Hough + contour passes) by proximity.

    Grouping requires both center proximity AND similar radius, so that Hough's
    spurious off-center/off-radius responses near a true circle don't drag the
    averaged radius away from the true value. Contour-based candidates (which carry
    a circularity `score`) are preferred as the representative when present, since
    they measure the actual ink boundary rather than a Hough accumulator peak.
    """
    merged: list[Circle] = []
    used = [False] * len(circles)
    circles_sorted = sorted(range(len(circles)), key=lambda i: -circles[i].r)
    for i in circles_sorted:
        if used[i]:
            continue
        group = [circles[i]]
        used[i] = True
        for j in circles_sorted:
            if used[j] or i == j:
                continue
            d = ((circles[i].cx - circles[j].cx) ** 2 + (circles[i].cy - circles[j].cy) ** 2) ** 0.5
            r_diff = abs(circles[i].r - circles[j].r) / circles[i].r if circles[i].r else 1.0
            if d < circles[i].r * dist_frac and r_diff < r_tol:
                group.append(circles[j])
                used[j] = True
        scored = [g for g in group if g.score > 0]
        basis = scored if scored else group
        cx = float(np.median([g.cx for g in basis]))
        cy = float(np.median([g.cy for g in basis]))
        r = float(np.median([g.r for g in basis]))
        filled = any(g.filled for g in group)
        score = max(g.score for g in group)
        hierarchy_ok = any(g.hierarchy_ok for g in group)
        merged.append(Circle(cx=cx, cy=cy, r=r, filled=filled, score=score, hierarchy_ok=hierarchy_ok))
    return merged


def _suppress_overlaps(circles: list[Circle], overlap_frac: float = 0.8) -> list[Circle]:
    """Final non-max-suppression pass: when two candidate circles' centers are close
    relative to their radii (regardless of whether radii matched during merging),
    keep only the higher-scoring one. Removes leftover Hough echoes that survived
    the radius-gated merge above.
    """
    order = sorted(range(len(circles)), key=lambda i: -circles[i].score)
    kept: list[int] = []
    for i in order:
        ci = circles[i]
        overlaps = False
        for k in kept:
            ck = circles[k]
            d = ((ci.cx - ck.cx) ** 2 + (ci.cy - ck.cy) ** 2) ** 0.5
            if d < max(ci.r, ck.r) * overlap_frac:
                overlaps = True
                break
        if not overlaps:
            kept.append(i)
    return [circles[i] for i in kept]


def _filter_singleton_outliers(circles: list[Circle], rel_tol: float = 0.18, singleton_frac: float = 0.5) -> list[Circle]:
    """Drop circles that are both (a) a radius-cluster singleton (no other detected
    circle shares its size) and (b) noticeably smaller than the dominant contact
    size cluster.

    Real D38999 arrangements repeat each contact diameter many times (a handful of
    discrete pin sizes); a size that appears only once is inherently suspect. If that
    lone circle is also much smaller than the largest repeated size, it is far more
    likely to be a keying dot or a rounded glyph loop (e.g. 'B', 'D', 'O' -- see the
    hierarchy check above, which catches most but not all of these) than a genuine
    contact. A repeated size cluster (count >= 2) is always trusted regardless of how
    it compares to other sizes, since real mixed-size arrangements (e.g. "#16" vs
    "#20" contacts) do exactly this. This cannot resolve a circular keying mark whose
    size happens to be close to real contacts -- see README known-weaknesses.
    """
    if not circles:
        return circles
    radii = sorted(c.r for c in circles)
    clusters: list[list[float]] = []
    for r in radii:
        if clusters and r <= clusters[-1][-1] * (1 + rel_tol):
            clusters[-1].append(r)
        else:
            clusters.append([r])

    repeated_maxes = [max(cl) for cl in clusters if len(cl) >= 2]
    reference_r = max(repeated_maxes) if repeated_maxes else max(radii)

    def cluster_count_for(r: float) -> int:
        for cl in clusters:
            if min(cl) - 1e-6 <= r <= max(cl) + 1e-6:
                return len(cl)
        return 1

    kept = [
        c
        for c in circles
        if cluster_count_for(c.r) >= 2 or (c.r >= reference_r * singleton_frac and c.hierarchy_ok)
    ]
    return kept if kept else circles


def cluster_radii(circles: list[Circle], rel_tol: float = 0.18) -> list[Circle]:
    """Snap each circle's radius to the mean of its cluster (contacts come in a
    small number of discrete diameters, e.g. #16 vs #20 pin sizes)."""
    if not circles:
        return circles
    radii = sorted(c.r for c in circles)
    clusters: list[list[float]] = []
    for r in radii:
        if clusters and r <= clusters[-1][-1] * (1 + rel_tol):
            clusters[-1].append(r)
        else:
            clusters.append([r])
    cluster_means = [float(np.mean(c)) for c in clusters]

    def snap(r: float) -> float:
        best = min(cluster_means, key=lambda m: abs(m - r))
        return best

    for c in circles:
        c.r = snap(c.r)
    return circles


def detect_geometry(gray: np.ndarray) -> GeometryResult:
    insert = detect_insert_circle(gray)
    contacts, non_contact_circles = detect_contact_circles(gray, insert)
    contacts = cluster_radii(contacts)
    binary = _binarize(gray)
    return GeometryResult(insert=insert, contacts=contacts, binary=binary, non_contact_circles=non_contact_circles)
