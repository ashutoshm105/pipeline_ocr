"""Printed text OCR — olmOCR -> EasyOCR -> Tesseract."""

from typing import Tuple

import ocr.submodule_paths  # noqa: F401

_HAS_OLMOCR = False
_HAS_EASYOCR = False

try:
    from ocr_printed_olmocr import recognize as olmocr_recognize  # type: ignore[import]
    _HAS_OLMOCR = True
except Exception:
    pass

try:
    from ocr_printed_easyocr import recognize as easyocr_recognize  # type: ignore[import]
    _HAS_EASYOCR = True
except Exception:
    pass


def _tesseract_printed(image) -> Tuple[str, str]:
    """Standard pytesseract extraction for printed text."""
    import pytesseract  # type: ignore[import]
    from PIL import Image  # type: ignore[import]

    if not isinstance(image, Image.Image):
        image = Image.open(image)

    raw = pytesseract.image_to_string(image)
    return raw.strip(), "Tesseract"


def extract_printed(image) -> Tuple[str, str]:
    """
    Extract printed text from *image*.
    Returns ``(text, engine_used)``.
    """
    if _HAS_OLMOCR:
        try:
            text = olmocr_recognize(image)
            return text, "olmOCR"
        except Exception:
            pass

    if _HAS_EASYOCR:
        try:
            text = easyocr_recognize(image)
            return text, "EasyOCR"
        except Exception:
            pass

    return _tesseract_printed(image)
