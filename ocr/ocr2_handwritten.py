"""Handwritten text OCR — TrOCR -> SuryaOCR -> pytesseract stub."""

from typing import Tuple

import ocr.submodule_paths  # noqa: F401

_HAS_TROCR = False
_HAS_SURYA = False

try:
    from ocr_handwritten_trocr import recognize as trocr_recognize  # type: ignore[import]
    _HAS_TROCR = True
except Exception:
    pass

try:
    from ocr_handwritten_surya import recognize as surya_recognize  # type: ignore[import]
    _HAS_SURYA = True
except Exception:
    pass


def _tesseract_handwritten_stub(image) -> Tuple[str, str]:
    """Fallback: pytesseract with PSM 6 (block of text)."""
    import pytesseract  # type: ignore[import]
    from PIL import Image  # type: ignore[import]

    if not isinstance(image, Image.Image):
        image = Image.open(image)

    raw = pytesseract.image_to_string(image, config="--psm 6")
    return raw.strip(), "pytesseract_handwritten_stub"


def extract_handwritten(image) -> Tuple[str, str]:
    """
    Extract handwritten text from *image*.
    Returns ``(text, engine_used)``.
    """
    if _HAS_TROCR:
        try:
            text = trocr_recognize(image)
            return text, "TrOCR"
        except Exception:
            pass

    if _HAS_SURYA:
        try:
            text = surya_recognize(image)
            return text, "SuryaOCR"
        except Exception:
            pass

    return _tesseract_handwritten_stub(image)
