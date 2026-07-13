"""Tests for the OCR router — correct engine dispatch and metadata."""

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ocr.router import run_ocr


class TestEngineDispatch:
    """Verify the router dispatches to the right OCR function per doc class."""

    _DUMMY_IMAGE = np.zeros((100, 100), dtype=np.uint8)

    @patch("ocr.router.extract_table", return_value=([["A", "B"], ["1", "2"]], "MockTable"))
    def test_table_class_dispatches_to_table(self, mock_table):
        result = run_ocr(self._DUMMY_IMAGE, "TABLE")
        mock_table.assert_called_once_with(self._DUMMY_IMAGE)
        assert result["ocr_engine_used"] == "MockTable"

    @patch("ocr.router.extract_table", return_value=([["X"]], "MockTable"))
    def test_lab_report_dispatches_to_table(self, mock_table):
        run_ocr(self._DUMMY_IMAGE, "lab_report")
        mock_table.assert_called_once()

    @patch("ocr.router.extract_table", return_value=([["X"]], "MockTable"))
    def test_invoice_dispatches_to_table(self, mock_table):
        run_ocr(self._DUMMY_IMAGE, "invoice")
        mock_table.assert_called_once()

    @patch("ocr.router.extract_handwritten", return_value=("hw text", "MockHW"))
    def test_handwritten_class_dispatches_to_handwritten(self, mock_hw):
        result = run_ocr(self._DUMMY_IMAGE, "HANDWRITTEN")
        mock_hw.assert_called_once_with(self._DUMMY_IMAGE)
        assert result["ocr_engine_used"] == "MockHW"

    @patch("ocr.router.extract_handwritten", return_value=("rx text", "MockHW"))
    def test_prescription_dispatches_to_handwritten(self, mock_hw):
        run_ocr(self._DUMMY_IMAGE, "prescription")
        mock_hw.assert_called_once()

    @patch("ocr.router.extract_printed", return_value=("printed text", "MockPrint"))
    def test_printed_text_dispatches_to_printed(self, mock_print):
        result = run_ocr(self._DUMMY_IMAGE, "PRINTED_TEXT")
        mock_print.assert_called_once_with(self._DUMMY_IMAGE)
        assert result["ocr_engine_used"] == "MockPrint"

    @patch("ocr.router.extract_printed", return_value=("fallback", "MockPrint"))
    def test_unknown_class_falls_through_to_printed(self, mock_print):
        result = run_ocr(self._DUMMY_IMAGE, "SOME_UNKNOWN_TYPE")
        mock_print.assert_called_once()


class TestResultMetadata:
    """The result dict must include timing and class metadata."""

    @patch("ocr.router.extract_printed", return_value=("text", "TestEngine"))
    def test_has_processing_time(self, _mock):
        result = run_ocr(np.zeros((50, 50), dtype=np.uint8), "PRINTED_TEXT")
        assert "processing_time_seconds" in result
        assert isinstance(result["processing_time_seconds"], float)
        assert result["processing_time_seconds"] >= 0.0

    @patch("ocr.router.extract_printed", return_value=("text", "TestEngine"))
    def test_has_doc_class(self, _mock):
        result = run_ocr(np.zeros((50, 50), dtype=np.uint8), "PRINTED_TEXT")
        assert result["doc_class"] == "PRINTED_TEXT"

    @patch("ocr.router.extract_printed", return_value=("text", "TestEngine"))
    def test_has_raw_output(self, _mock):
        result = run_ocr(np.zeros((50, 50), dtype=np.uint8), "PRINTED_TEXT")
        assert "raw_output" in result

    @patch("ocr.router.extract_printed", return_value=("text", "TestEngine"))
    def test_has_engine_name(self, _mock):
        result = run_ocr(np.zeros((50, 50), dtype=np.uint8), "PRINTED_TEXT")
        assert result["ocr_engine_used"] == "TestEngine"


class TestCaseInsensitiveDispatch:
    """Doc class matching should be case-insensitive."""

    @patch("ocr.router.extract_table", return_value=([["X"]], "T"))
    def test_mixed_case_table(self, mock_table):
        run_ocr(np.zeros((50, 50), dtype=np.uint8), "  Table  ")
        mock_table.assert_called_once()

    @patch("ocr.router.extract_handwritten", return_value=("t", "H"))
    def test_mixed_case_handwritten(self, mock_hw):
        run_ocr(np.zeros((50, 50), dtype=np.uint8), "  Handwritten  ")
        mock_hw.assert_called_once()
