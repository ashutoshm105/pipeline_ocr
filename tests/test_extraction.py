"""Tests for structured extraction, unit normaliser, reference flagging, and formatter."""

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from extraction.schema import LabReport, LabResult, ReferenceRange
from extraction.unit_normaliser import normalise_unit


# ---------------------------------------------------------------------------
# Pydantic schema validation
# ---------------------------------------------------------------------------

class TestLabReportSchema:
    """LabReport Pydantic model must accept well-formed data and reject bad data."""

    @staticmethod
    def _make_valid_report() -> dict:
        return {
            "document_metadata": {
                "patient_id": "P001",
                "patient_name": "Test Patient",
                "date_of_collection": "2026-01-15",
                "date_of_report": "2026-01-16",
                "lab_name": "Central Lab",
                "referring_doctor": "Dr. Smith",
                "department": "Hepatology",
            },
            "lab_results": [
                {
                    "test_name": "Alanine Aminotransferase",
                    "test_abbreviation": "ALT",
                    "value": 45.0,
                    "unit": "U/L",
                    "reference_range": {"low": 7.0, "high": 56.0, "unit": "U/L"},
                    "flag": "NORMAL",
                    "clinical_significance": None,
                }
            ],
            "pipeline_metadata": {
                "preprocessing_transformations": ["grayscale", "denoise"],
                "doc_class": "TABLE",
                "ocr_engine": "Tesseract",
                "extraction_confidence": 0.85,
                "schema_version": "1.0",
            },
        }

    def test_valid_report_parses(self):
        data = self._make_valid_report()
        report = LabReport.model_validate(data)
        assert report.document_metadata.patient_name == "Test Patient"
        assert len(report.lab_results) == 1

    def test_missing_lab_results_raises(self):
        data = self._make_valid_report()
        del data["lab_results"]
        with pytest.raises(Exception):
            LabReport.model_validate(data)

    def test_invalid_flag_raises(self):
        data = self._make_valid_report()
        data["lab_results"][0]["flag"] = "INVALID_FLAG"
        with pytest.raises(Exception):
            LabReport.model_validate(data)

    def test_optional_fields_can_be_none(self):
        data = self._make_valid_report()
        data["document_metadata"]["patient_id"] = None
        data["document_metadata"]["referring_doctor"] = None
        data["lab_results"][0]["value"] = None
        report = LabReport.model_validate(data)
        assert report.document_metadata.patient_id is None

    def test_empty_lab_results_allowed(self):
        data = self._make_valid_report()
        data["lab_results"] = []
        report = LabReport.model_validate(data)
        assert len(report.lab_results) == 0

    def test_model_dump_roundtrip(self):
        data = self._make_valid_report()
        report = LabReport.model_validate(data)
        dumped = report.model_dump()
        report2 = LabReport.model_validate(dumped)
        assert report2.document_metadata.patient_name == report.document_metadata.patient_name


# ---------------------------------------------------------------------------
# Unit normaliser
# ---------------------------------------------------------------------------

class TestUnitNormaliser:
    """normalise_unit should map common variants to canonical forms."""

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("u/l", "U/L"),
            ("U/l", "U/L"),
            ("IU/L", "U/L"),
            ("g/dl", "g/dL"),
            ("gm/dl", "g/dL"),
            ("g%", "g/dL"),
            ("mg/dl", "mg/dL"),
            ("mg%", "mg/dL"),
            ("umol/l", "μmol/L"),
            ("sec", "seconds"),
            ("ng/ml", "ng/mL"),
        ],
    )
    def test_known_mappings(self, raw, expected):
        assert normalise_unit(raw) == expected

    def test_unknown_unit_returned_as_is(self):
        assert normalise_unit("foo/bar") == "foo/bar"

    def test_whitespace_stripped(self):
        assert normalise_unit("  U/L  ") == "U/L"


# ---------------------------------------------------------------------------
# Reference range flagging (via formatter regex fallback)
# ---------------------------------------------------------------------------

class TestFormatterWithMockData:
    """Test extract_structured_json with mock LLM client providing structured data."""

    @staticmethod
    def _mock_llm_client(system_prompt, user_prompt):
        """Return a valid JSON dict matching the LabReport schema."""
        return {
            "document_metadata": {
                "patient_id": "MRN-12345",
                "patient_name": "Jane Doe",
                "date_of_collection": "2026-07-01",
                "date_of_report": "2026-07-02",
                "lab_name": "Metro Lab",
                "referring_doctor": "Dr. Patel",
                "department": "Hepatology",
            },
            "lab_results": [
                {
                    "test_name": "Aspartate Aminotransferase",
                    "test_abbreviation": "AST",
                    "value": 120.0,
                    "unit": "U/L",
                    "reference_range": {"low": 10.0, "high": 40.0, "unit": "U/L"},
                    "flag": "HIGH",
                    "clinical_significance": "Elevated liver enzyme",
                },
                {
                    "test_name": "Total Bilirubin",
                    "test_abbreviation": "TBIL",
                    "value": 0.8,
                    "unit": "mg/dL",
                    "reference_range": {"low": 0.1, "high": 1.2, "unit": "mg/dL"},
                    "flag": "NORMAL",
                    "clinical_significance": None,
                },
            ],
            "pipeline_metadata": {
                "preprocessing_transformations": [],
                "doc_class": "TABLE",
                "ocr_engine": "Tesseract",
                "extraction_confidence": 0.9,
                "schema_version": "1.0",
            },
        }

    def test_extraction_returns_valid_report(self):
        from extraction.formatter import extract_structured_json

        result = extract_structured_json("dummy ocr text", llm_client=self._mock_llm_client)
        # Should be a valid dict that round-trips through the schema
        report = LabReport.model_validate(result)
        assert report.document_metadata.patient_name == "Jane Doe"
        assert len(report.lab_results) == 2

    def test_extraction_flag_values(self):
        from extraction.formatter import extract_structured_json

        result = extract_structured_json("dummy ocr text", llm_client=self._mock_llm_client)
        flags = [r["flag"] for r in result["lab_results"]]
        assert "HIGH" in flags
        assert "NORMAL" in flags

    def test_extraction_metadata_present(self):
        from extraction.formatter import extract_structured_json

        result = extract_structured_json("dummy ocr text", llm_client=self._mock_llm_client)
        pm = result["pipeline_metadata"]
        assert "extraction_confidence" in pm
        assert "schema_version" in pm

    def test_regex_fallback_when_llm_fails(self):
        """When LLM client raises, formatter should fall back to regex."""
        from extraction.formatter import extract_structured_json

        def failing_llm(system, user):
            raise RuntimeError("LLM unavailable")

        # Should not raise — falls through to regex or OpenAI fallback
        with patch("extraction.formatter._try_openai_extraction", return_value=None):
            result = extract_structured_json(
                "ALT  45  U/L  (7 - 56)",
                llm_client=failing_llm,
            )
            # Result should still be a valid LabReport dict
            LabReport.model_validate(result)
