"""Input adapter: load PNG/JPG/PDF -> normalized grayscale ndarray + source.png staging copy.

Never rotates or mirrors the source. canvas size = raster size (post-load, pre-any-transform).
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

PDF_DPI = 300


@dataclass
class LoadedSource:
    id: str
    file_name: str
    sha256: str
    gray: np.ndarray  # HxW uint8, grayscale
    bgr: np.ndarray  # HxW x3 uint8, color (for staging png / overlays)
    width: int
    height: int


def _sha256_of_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _load_pdf_page0(path: Path, dpi: int = PDF_DPI) -> np.ndarray:
    import fitz  # PyMuPDF

    doc = fitz.open(path)
    try:
        page = doc.load_page(0)
        zoom = dpi / 72.0
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        if pix.n == 3:
            bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
        elif pix.n == 1:
            bgr = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        else:
            bgr = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
        return bgr
    finally:
        doc.close()


def load_source(path: str | Path, staging_dir: str | Path | None = None) -> LoadedSource:
    """Load a source file (PNG/JPG/PDF) into a normalized grayscale + color raster.

    id is derived from the filename stem (e.g. H35.png -> "H35").
    If staging_dir is given, writes staging/<ID>.source.png (normalized, unrotated).
    """
    path = Path(path)
    file_name = path.name
    src_id = path.stem
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        bgr = _load_pdf_page0(path)
        sha256 = _sha256_of_file(path)
    else:
        data = np.fromfile(str(path), dtype=np.uint8)  # unicode-path safe on Windows
        bgr = cv2.imdecode(data, cv2.IMREAD_COLOR)
        if bgr is None:
            raise ValueError(f"could not decode image: {path}")
        sha256 = _sha256_of_file(path)

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    height, width = gray.shape[:2]

    if staging_dir is not None:
        staging_dir = Path(staging_dir)
        staging_dir.mkdir(parents=True, exist_ok=True)
        out_path = staging_dir / f"{src_id}.source.png"
        ok, buf = cv2.imencode(".png", bgr)
        if ok:
            buf.tofile(str(out_path))

    return LoadedSource(
        id=src_id,
        file_name=file_name,
        sha256=sha256,
        gray=gray,
        bgr=bgr,
        width=width,
        height=height,
    )
