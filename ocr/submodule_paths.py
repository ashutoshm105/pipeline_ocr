"""Add extern/ submodule directories to sys.path so OCR backends can be imported."""

import os
import sys

_EXTERN_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "extern")

_SUBMODULES = [
    "preprocessing",
    "ocr_table_paddle",
    "ocr_table_surya",
    "ocr_table_docling",
    "ocr_handwritten_trocr",
    "ocr_handwritten_surya",
    "ocr_printed_tesseract",
    "ocr_printed_easyocr",
    "ocr_printed_olmocr",
]


def register_submodule_paths() -> None:
    """Append each existing extern/ submodule directory to sys.path (idempotent)."""
    for name in _SUBMODULES:
        path = os.path.join(_EXTERN_DIR, name)
        if os.path.isdir(path) and path not in sys.path:
            sys.path.append(path)


register_submodule_paths()
