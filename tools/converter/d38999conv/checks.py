"""QA checks per docs/CONVERTER_REQUIREMENTS.md: warnings + overall confidence.

Never hides uncertainty -- low-confidence reads and mismatches become warnings,
not silent corrections.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class QAResult:
    warnings: list[str]
    confidence: float


def run_checks(
    contacts: list[dict],
    orphan_count: int,
    expected_contacts: int | None,
    canvas_width: float,
    canvas_height: float,
    mean_label_confidence: float,
) -> QAResult:
    warnings: list[str] = []

    if len(contacts) == 0:
        warnings.append("no contacts detected")

    labels = [c["label"] for c in contacts]
    seen = set()
    dupes = set()
    for lbl in labels:
        if lbl in seen:
            dupes.add(lbl)
        seen.add(lbl)
    if dupes:
        warnings.append(f"duplicate labels: {sorted(dupes)}")

    unlabeled = [c for c in contacts if c["label"] in ("?", "") or c.get("label_confidence", 1.0) == 0.0]
    if unlabeled:
        warnings.append(f"{len(unlabeled)} contact(s) unlabeled or unread")

    if orphan_count > 0:
        warnings.append(f"{orphan_count} orphan label box(es) not matched to a contact")

    if expected_contacts is not None and len(contacts) != expected_contacts:
        warnings.append(
            f"contacts.length ({len(contacts)}) != expectedContacts ({expected_contacts})"
        )

    # overlap check
    for i in range(len(contacts)):
        for j in range(i + 1, len(contacts)):
            a, b = contacts[i], contacts[j]
            d = ((a["cx"] - b["cx"]) ** 2 + (a["cy"] - b["cy"]) ** 2) ** 0.5
            if d < (a["r"] + b["r"]) * 0.9:
                warnings.append(f"overlapping contacts: {a['label']} / {b['label']}")

    # out of canvas
    for c in contacts:
        if (
            c["cx"] - c["r"] < 0
            or c["cy"] - c["r"] < 0
            or c["cx"] + c["r"] > canvas_width
            or c["cy"] + c["r"] > canvas_height
        ):
            warnings.append(f"contact {c['label']} extends outside canvas")

    # sequence gap check (A..Z, a..z) -- warning only
    upper = sorted(c["label"] for c in contacts if len(c["label"]) == 1 and c["label"].isalpha() and c["label"].isupper())
    if len(upper) >= 2:
        expected_seq = [chr(o) for o in range(ord("A"), ord("Z") + 1) if chr(o) not in ("I", "O")]
        idxs = [expected_seq.index(u) for u in upper if u in expected_seq]
        idxs.sort()
        gaps = [expected_seq[i] for i in range(idxs[0], idxs[-1] + 1) if i not in idxs]
        if gaps:
            warnings.append(f"possible gaps in label sequence: {gaps}")

    # confidence: combination of structural completeness + label read confidence
    structural = 1.0
    if expected_contacts:
        structural = 1.0 - min(1.0, abs(len(contacts) - expected_contacts) / max(1, expected_contacts))
    penalty = 0.05 * len(dupes) + 0.05 * (orphan_count > 0)
    confidence = max(0.0, min(1.0, 0.5 * structural + 0.5 * mean_label_confidence - penalty))

    return QAResult(warnings=warnings, confidence=round(confidence, 3))
