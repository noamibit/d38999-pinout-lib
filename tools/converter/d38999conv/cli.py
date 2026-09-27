"""Batch CLI: python -m d38999conv convert incoming/ --out staging/

Writes staging/<family>/<ID>.json (schema-valid, status "draft") per input file.
NOTE: tools/library/src/cli.ts render expects <dir>/<family>/<ID>.json, so JSON is
written under staging/d38999/ even though sources sit flat in incoming/.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np

from . import __init__ as _pkg  # noqa: F401
from .adapter import load_source
from .assign import assign_labels_to_contacts
from .checks import run_checks
from .geometry import detect_geometry
from .text import NullReader, TesseractReader, detect_label_boxes, read_labels

SUPPORTED_SUFFIXES = {".png", ".jpg", ".jpeg", ".pdf"}
ID_RE = re.compile(r"^([A-Z]{1,2})([0-9]{1,3})$")
FAMILY = "D38999"
FAMILY_DIR = "d38999"


def _pick_reader(name: str):
    if name == "tesseract":
        try:
            return TesseractReader()
        except RuntimeError as e:
            print(f"warning: tesseract reader unavailable ({e}); falling back to NullReader", file=sys.stderr)
            return NullReader()
    return NullReader()


def convert_one(
    path: Path,
    out_dir: Path,
    reader_name: str = "null",
    meta_dir: Path | None = None,
) -> dict:
    src_id = path.stem
    m = ID_RE.match(src_id)
    prefix, number = (m.group(1), m.group(2)) if m else ("A", "0")

    family_dir = out_dir / FAMILY_DIR
    loaded = load_source(path, staging_dir=family_dir)

    geom = detect_geometry(loaded.gray)
    boxes = detect_label_boxes(geom.binary, geom.contacts, geom.insert, extra_circles=geom.non_contact_circles)
    reader = _pick_reader(reader_name)
    texts = read_labels(loaded.gray, boxes, reader)
    assignments, orphans = assign_labels_to_contacts(geom.contacts, boxes, texts)

    contacts_json = []
    for a in assignments:
        c = geom.contacts[a.contact_index]
        contacts_json.append(
            {
                "label": a.text if a.text and a.text != "?" else f"#{a.contact_index + 1}",
                "cx": round(c.cx, 2),
                "cy": round(c.cy, 2),
                "r": round(c.r, 2),
                "style": "filled" if c.filled else "hollow",
                "text": {
                    "x": round(a.text_x, 2),
                    "y": round(a.text_y, 2),
                    "size": round(max(a.text_size, 1.0), 2),
                    "anchor": a.anchor,
                    "rotate": 0,
                },
                "_label_confidence": a.confidence,
            }
        )

    # Contacts with no assigned label at all (not in `assignments`) still need
    # to be recorded so geometry recall is visible; give them placeholder labels.
    assigned_idx = {a.contact_index for a in assignments}
    for i, c in enumerate(geom.contacts):
        if i in assigned_idx:
            continue
        contacts_json.append(
            {
                "label": f"#{i + 1}",
                "cx": round(c.cx, 2),
                "cy": round(c.cy, 2),
                "r": round(c.r, 2),
                "style": "filled" if c.filled else "hollow",
                "text": {"x": round(c.cx, 2), "y": round(c.cy, 2), "size": max(c.r, 1.0), "anchor": "middle", "rotate": 0},
                "_label_confidence": 0.0,
            }
        )

    expected_contacts = None
    if meta_dir is not None:
        meta_path = meta_dir / f"{src_id}.meta.json"
        if meta_path.exists():
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            expected_contacts = meta.get("expectedContacts")

    mean_conf = float(np.mean([c["_label_confidence"] for c in contacts_json])) if contacts_json else 0.0
    qa = run_checks(
        contacts=[{k: v for k, v in c.items() if k != "_label_confidence"} | {"label_confidence": c["_label_confidence"]} for c in contacts_json],
        orphan_count=len(orphans),
        expected_contacts=expected_contacts,
        canvas_width=loaded.width,
        canvas_height=loaded.height,
        mean_label_confidence=mean_conf,
    )

    for c in contacts_json:
        c.pop("_label_confidence", None)

    arrangement = {
        "schemaVersion": 1,
        "id": src_id,
        "family": FAMILY,
        "prefix": prefix,
        "number": number,
        "title": src_id,
        "viewCaption": None,
        "expectedContacts": expected_contacts,
        "canvas": {"width": loaded.width, "height": loaded.height},
        "insert": (
            {"cx": round(geom.insert.cx, 2), "cy": round(geom.insert.cy, 2), "r": round(geom.insert.r, 2)}
            if geom.insert
            else None
        ),
        "contacts": contacts_json,
        "shapes": [],
        "annotations": [],
        "source": {"file": loaded.file_name, "sha256": loaded.sha256, "ref": None},
        "qa": {"confidence": qa.confidence, "warnings": qa.warnings},
        "status": "draft",
        "revision": 1,
        "series": None,
        "manufacturer": None,
        "partNumbers": [],
        "shell": None,
        "notes": None,
        "tags": [],
        "createdAt": None,
        "updatedAt": None,
    }

    family_dir.mkdir(parents=True, exist_ok=True)
    out_path = family_dir / f"{src_id}.json"
    out_path.write_text(json.dumps(arrangement, indent=2) + "\n", encoding="utf-8")
    return arrangement


def cmd_convert(args: argparse.Namespace) -> int:
    in_dir = Path(args.input)
    out_dir = Path(args.out)
    files = sorted(p for p in in_dir.iterdir() if p.suffix.lower() in SUPPORTED_SUFFIXES)
    if not files:
        print(f"no supported source files found in {in_dir}", file=sys.stderr)
        return 1
    for f in files:
        print(f"converting {f.name} ...")
        arrangement = convert_one(f, out_dir, reader_name=args.reader, meta_dir=in_dir)
        n_warn = len(arrangement["qa"]["warnings"])
        print(f"  -> {out_dir / FAMILY_DIR / (f.stem + '.json')} ({len(arrangement['contacts'])} contacts, {n_warn} warnings)")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="d38999conv")
    sub = parser.add_subparsers(dest="command", required=True)

    p_convert = sub.add_parser("convert", help="convert a directory of source files to staging JSON")
    p_convert.add_argument("input", help="directory containing source PNG/JPG/PDF files")
    p_convert.add_argument("--out", default="staging", help="output staging directory")
    p_convert.add_argument("--reader", default="null", choices=["null", "tesseract"], help="label reader backend")
    p_convert.set_defaults(func=cmd_convert)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
