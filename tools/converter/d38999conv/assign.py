"""Assignment: match each label box to its nearest contact circle.

Records the label's real on-source anchor position (text.x/y), per the render.ts
convention: (x, y) is the label's anchor point with dominant-baseline=central, i.e.
y is the vertical center of the glyph box, and x is the anchor-appropriate edge/center.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .geometry import Circle
from .text import LabelBox


@dataclass
class Assignment:
    contact_index: int
    box: LabelBox
    text: str
    confidence: float
    text_x: float
    text_y: float
    text_size: float
    anchor: str  # "start" | "middle" | "end"


def _text_anchor_xy(box: LabelBox, contact: Circle) -> tuple[float, float, str]:
    """Derive (x, y, anchor) from a label box's actual bounding box, matching the
    render.ts convention: y = vertical center (dominant-baseline central); x/anchor
    chosen from which side of the contact the box sits on, using the box's own edge
    so no fixed offset is assumed.
    """
    y = box.cy
    # Anchor from horizontal relation between box and contact center.
    if box.cx >= contact.cx:
        # Label sits to the right (or centered) -> anchor at box's left edge, "start".
        return float(box.x0), float(y), "start"
    else:
        # Label sits to the left -> anchor at box's right edge, "end".
        return float(box.x1), float(y), "end"


def assign_labels_to_contacts(
    contacts: list[Circle],
    boxes: list[LabelBox],
    texts: list[tuple[LabelBox, str, float]],
    max_dist_factor: float = 6.0,
) -> tuple[list[Assignment], list[LabelBox]]:
    """Greedy nearest-neighbor assignment of label boxes to contacts (1:1).

    Returns (assignments, orphan_boxes). Orphans are boxes not assigned to any
    contact (e.g. annotations, out of range).
    """
    text_by_box = {id(b): (t, c) for b, t, c in texts}

    n_contacts = len(contacts)
    n_boxes = len(boxes)
    if n_contacts == 0 or n_boxes == 0:
        return [], list(boxes)

    # Distance matrix: contact center to box center.
    dist = np.zeros((n_contacts, n_boxes), dtype=float)
    for i, c in enumerate(contacts):
        for j, b in enumerate(boxes):
            dist[i, j] = ((c.cx - b.cx) ** 2 + (c.cy - b.cy) ** 2) ** 0.5

    avg_r = float(np.mean([c.r for c in contacts])) if contacts else 10.0
    max_dist = avg_r * max_dist_factor

    assigned_contacts: set[int] = set()
    assigned_boxes: set[int] = set()
    pairs: list[tuple[float, int, int]] = []
    for i in range(n_contacts):
        for j in range(n_boxes):
            if dist[i, j] <= max_dist:
                pairs.append((dist[i, j], i, j))
    pairs.sort(key=lambda p: p[0])

    assignments: list[Assignment] = []
    for d, i, j in pairs:
        if i in assigned_contacts or j in assigned_boxes:
            continue
        assigned_contacts.add(i)
        assigned_boxes.add(j)
        box = boxes[j]
        text, conf = text_by_box.get(id(box), ("?", 0.0))
        x, y, anchor = _text_anchor_xy(box, contacts[i])
        size = float(box.height)
        assignments.append(
            Assignment(
                contact_index=i,
                box=box,
                text=text,
                confidence=conf,
                text_x=x,
                text_y=y,
                text_size=size,
                anchor=anchor,
            )
        )

    orphans = [b for j, b in enumerate(boxes) if j not in assigned_boxes]
    assignments.sort(key=lambda a: a.contact_index)
    return assignments, orphans
