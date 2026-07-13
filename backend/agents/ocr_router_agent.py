"""
ocr_router_agent.py — OCR Router (dispatcher) for the MedVault agentic pipeline.

Given a preprocessed image and a document class (from the 3-class classifier),
dispatch to the correct OCR agent and return a uniform :class:`OCRResult`:

    TABLE        -> TableOCRAgent        (PaddleOCR PP-Structure + fallback)
    HANDWRITTEN  -> HandwrittenOCRAgent  (Qwen2.5-VL)
    PRINTED_TEXT -> PrintedOCRAgent      (PaddleOCR -> Tesseract)

Legacy 2-class labels (``"printed"`` / ``"handwritten"``) are accepted for
backward compatibility with stored ``doc_type`` values.

The agent factories live in ``AGENT_FACTORIES`` so unit tests can monkeypatch
them with fakes (no real OCR / GPU required). Each factory is a zero-arg
callable returning a ready agent instance.
"""
from __future__ import annotations

from typing import Callable, Dict

import numpy as np
from loguru import logger

from agents.ocr_result import OCRResult


def _make_table_agent():
    from agents.table_ocr_agent import TableOCRAgent
    return TableOCRAgent()


def _make_handwritten_agent():
    from agents.handwritten_ocr_agent import HandwrittenOCRAgent
    return HandwrittenOCRAgent()


def _make_printed_agent():
    from agents.printed_ocr_agent import PrintedOCRAgent
    return PrintedOCRAgent()


# Routing table: doc_class -> agent factory.
AGENT_FACTORIES: Dict[str, Callable[[], object]] = {
    "TABLE": _make_table_agent,
    "HANDWRITTEN": _make_handwritten_agent,
    "PRINTED_TEXT": _make_printed_agent,
    # Legacy 2-class aliases (backward-compat with stored doc_type).
    "printed": _make_printed_agent,
    "handwritten": _make_handwritten_agent,
}


def run_ocr(image: np.ndarray, doc_class: str, *, ocr_provider: dict | None = None) -> OCRResult:
    """
    Route ``image`` to the OCR agent matching ``doc_class`` and return its result.

    :param image: preprocessed BGR ndarray.
    :param doc_class: one of TABLE / HANDWRITTEN / PRINTED_TEXT (also accepts the
        legacy lower-case ``printed`` / ``handwritten``).
    :param ocr_provider: optional provider dict from the DB (with ``engine`` and
        ``config`` keys). When set and the engine is NOT ``pipeline`` / ``auto``,
        the specified engine is used directly instead of the doc_class router.
    :raises ValueError: if ``doc_class`` is unknown.
    """
    if ocr_provider and ocr_provider.get("engine") not in (None, "", "pipeline", "auto"):
        from services.ocr_service import build_ocr
        engine = ocr_provider["engine"]
        cfg = ocr_provider.get("config", {})
        provider = build_ocr(engine, cfg)
        import tempfile, cv2, os
        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        cv2.imwrite(tmp.name, image)
        try:
            text = provider.extract_text(tmp.name, "image")
        finally:
            os.unlink(tmp.name)
        logger.info("OCRRouter using DB provider engine={}", engine)
        return OCRResult(raw_output=text, engine=engine, confidence=0.0, processing_time_seconds=0.0)

    factory = AGENT_FACTORIES.get(doc_class)
    if factory is None:
        raise ValueError(
            f"Unknown doc_class {doc_class!r}; expected one of "
            f"{sorted(AGENT_FACTORIES)}"
        )
    agent = factory()
    logger.info("OCRRouter dispatching doc_class={} -> {}", doc_class, type(agent).__name__)
    return agent.run(image)
