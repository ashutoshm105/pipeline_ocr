"""Table extraction OCR — PaddleOCR -> SuryaOCR -> pytesseract stub."""

from typing import List, Optional, Tuple

import ocr.submodule_paths  # noqa: F401  — ensures extern/ is on sys.path

# ---------------------------------------------------------------------------
# Engine availability flags
# ---------------------------------------------------------------------------
_HAS_PADDLE = False
_HAS_SURYA = False

try:
    from ocr_table_paddle import extract_tables as paddle_extract  # type: ignore[import]
    _HAS_PADDLE = True
except Exception:
    pass

try:
    from ocr_table_surya import extract_tables as surya_extract  # type: ignore[import]
    _HAS_SURYA = True
except Exception:
    pass


# ---------------------------------------------------------------------------
# Stub fallback using pytesseract
# ---------------------------------------------------------------------------

def _tesseract_table_stub(image) -> Tuple[List[List[str]], str]:
    """
    Basic table heuristic: run pytesseract, split output into rows/columns
    by whitespace alignment.  Returns (rows, engine_name).
    Row 0 is treated as headers.
    """
    import pytesseract  # type: ignore[import]
    from PIL import Image  # type: ignore[import]

    if not isinstance(image, Image.Image):
        image = Image.open(image)

    raw = pytesseract.image_to_string(image)
    lines = [line for line in raw.splitlines() if line.strip()]

    rows: List[List[str]] = []
    for line in lines:
        # Split on two-or-more whitespace characters as a column delimiter.
        import re
        cells = re.split(r"\s{2,}", line.strip())
        rows.append(cells)

    return rows, "pytesseract_table_stub"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_table(image) -> Tuple[List[List[str]], str]:
    """
    Extract a table from *image* and return ``(rows, engine_used)``.

    ``rows`` is a 2-D list where ``rows[0]`` contains column headers.
    Tries PaddleOCR first, then SuryaOCR, then a pytesseract stub.
    """
    if _HAS_PADDLE:
        try:
            result = paddle_extract(image)
            return result, "PaddleOCR"
        except Exception:
            pass

    if _HAS_SURYA:
        try:
            result = surya_extract(image)
            return result, "SuryaOCR"
        except Exception:
            pass

    return _tesseract_table_stub(image)
