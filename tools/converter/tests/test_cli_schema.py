"""Runs the CLI over a synthetic raster placed in a temp incoming/ dir and validates
the resulting staging JSON against schema/arrangement.schema.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import jsonschema

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from d38999conv.cli import convert_one

from synthetic import SCALE, load_fixture, rasterize

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = REPO_ROOT / "fixtures" / "library" / "d38999"
SCHEMA_PATH = REPO_ROOT / "schema" / "arrangement.schema.json"


def test_cli_output_validates_against_schema(tmp_path):
    fixture = load_fixture(FIXTURES_DIR / "A98.json")
    synth = rasterize(fixture, scale=SCALE)

    incoming = tmp_path / "incoming"
    staging = tmp_path / "staging"
    incoming.mkdir()
    src_path = incoming / "A98.png"
    ok, buf = cv2.imencode(".png", synth.image)
    assert ok
    buf.tofile(str(src_path))

    meta_path = incoming / "A98.meta.json"
    meta_path.write_text(json.dumps({"expectedContacts": 7}), encoding="utf-8")

    arrangement = convert_one(src_path, staging, reader_name="null", meta_dir=incoming)

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    jsonschema.validate(arrangement, schema)

    assert arrangement["status"] == "draft"
    assert arrangement["source"]["file"] == "A98.png"
    assert arrangement["source"]["sha256"]

    out_json = staging / "d38999" / "A98.json"
    out_png = staging / "d38999" / "A98.source.png"
    assert out_json.exists()
    assert out_png.exists()

    # re-read from disk and validate again (round trip through JSON serialization)
    on_disk = json.loads(out_json.read_text(encoding="utf-8"))
    jsonschema.validate(on_disk, schema)
