"""Unified OCR router — dispatches to the correct engine by document class."""

import time
from typing import Any, Dict, List, Union

from ocr.ocr1_table import extract_table
from ocr.ocr2_handwritten import extract_handwritten
from ocr.ocr3_printed import extract_printed

# Document classes mapped to OCR pipelines
_TABLE_CLASSES = {"table", "lab_report", "invoice", "itemized_bill"}
_HANDWRITTEN_CLASSES = {"handwritten", "prescription", "doctor_note"}
# Everything else falls through to printed text.


def run_ocr(
    preprocessed_image: Any,
    doc_class: str,
) -> Dict[str, Union[str, float, List]]:
    """
    Run OCR on *preprocessed_image* using the pipeline appropriate for *doc_class*.

    Returns a dict with keys:
        - doc_class
        - ocr_engine_used
        - raw_output  (str or 2-D list for tables)
        - processing_time_seconds
    """
    start = time.monotonic()

    normalized_class = doc_class.strip().lower()

    if normalized_class in _TABLE_CLASSES:
        raw_output, engine = extract_table(preprocessed_image)
    elif normalized_class in _HANDWRITTEN_CLASSES:
        raw_output, engine = extract_handwritten(preprocessed_image)
    else:
        raw_output, engine = extract_printed(preprocessed_image)

    elapsed = round(time.monotonic() - start, 4)

    return {
        "doc_class": doc_class,
        "ocr_engine_used": engine,
        "raw_output": raw_output,
        "processing_time_seconds": elapsed,
    }
