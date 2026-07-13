"""LLM-based structured JSON extraction from OCR text."""

import json
import re
import logging
from typing import Any, Dict, Optional

from extraction.schema import LabReport
from extraction.unit_normaliser import normalise_unit
from extraction.reference_ranges import flag_value

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a hepatology lab-report extraction specialist.

Given raw OCR text from a liver-function / hepatology lab report, extract ALL
information into the JSON schema below.  Return ONLY valid JSON, no markdown
fences, no commentary.

Schema:
{
  "document_metadata": {
    "patient_id": "string or null",
    "patient_name": "string or null",
    "date_of_collection": "YYYY-MM-DD or null",
    "date_of_report": "YYYY-MM-DD or null",
    "lab_name": "string or null",
    "referring_doctor": "string or null",
    "department": "string, default Hepatology"
  },
  "lab_results": [
    {
      "test_name": "Full name of the test",
      "test_abbreviation": "Standard abbreviation or null",
      "value": number or null,
      "unit": "SI unit string",
      "reference_range": {"low": number or null, "high": number or null, "unit": "SI unit string"},
      "flag": "HIGH | LOW | CRITICAL_HIGH | CRITICAL_LOW | NORMAL | UNKNOWN",
      "clinical_significance": "Brief clinical note or null"
    }
  ],
  "pipeline_metadata": {
    "preprocessing_transformations": [],
    "doc_class": "lab_report",
    "ocr_engine": "unknown",
    "extraction_confidence": 0.0,
    "schema_version": "1.0"
  }
}

Rules:
- Normalise units to SI (U/L, g/dL, mg/dL, μmol/L, seconds, ng/mL).
- Flag values against standard hepatology reference ranges.
- If a value is missing or unreadable, set value to null and flag to UNKNOWN.
- Dates must be ISO 8601 (YYYY-MM-DD) or null.
"""


def _build_user_prompt(ocr_text: str) -> str:
    return f"Extract structured data from this lab report OCR text:\n\n{ocr_text}"


def _try_openai_extraction(ocr_text: str) -> Optional[Dict[str, Any]]:
    """Attempt extraction via the openai library."""
    try:
        import openai
        client = openai.OpenAI()
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": _build_user_prompt(ocr_text)},
            ],
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content
        if content:
            return json.loads(content)
    except Exception as exc:
        logger.warning("OpenAI extraction failed: %s", exc)
    return None


def _regex_fallback_extraction(ocr_text: str) -> Dict[str, Any]:
    """Best-effort regex extraction when no LLM is available."""
    results = []
    # Pattern: test_name  value  unit  (ref_low - ref_high)
    pattern = re.compile(
        r"([A-Za-z\s/\(\)]+?)\s+"
        r"(\d+\.?\d*)\s+"
        r"([A-Za-z/%μµ]+(?:/[A-Za-z]+)?)\s+"
        r"(?:\(?\s*(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)\s*\)?)?"
    )
    for match in pattern.finditer(ocr_text):
        test_name = match.group(1).strip()
        value = float(match.group(2))
        raw_unit = match.group(3).strip()
        unit = normalise_unit(raw_unit)
        ref_low = float(match.group(4)) if match.group(4) else None
        ref_high = float(match.group(5)) if match.group(5) else None

        flag = flag_value(test_name, value)

        results.append({
            "test_name": test_name,
            "test_abbreviation": None,
            "value": value,
            "unit": unit,
            "reference_range": {"low": ref_low, "high": ref_high, "unit": unit},
            "flag": flag,
            "clinical_significance": None,
        })

    # Try to extract patient name
    name_match = re.search(
        r"(?:Patient\s*Name|Name)\s*[:\-]?\s*(.+)", ocr_text, re.IGNORECASE
    )
    patient_name = name_match.group(1).strip() if name_match else None

    pid_match = re.search(
        r"(?:Patient\s*ID|MRN|ID)\s*[:\-]?\s*(\S+)", ocr_text, re.IGNORECASE
    )
    patient_id = pid_match.group(1).strip() if pid_match else None

    return {
        "document_metadata": {
            "patient_id": patient_id,
            "patient_name": patient_name,
            "date_of_collection": None,
            "date_of_report": None,
            "lab_name": None,
            "referring_doctor": None,
            "department": "Hepatology",
        },
        "lab_results": results,
        "pipeline_metadata": {
            "preprocessing_transformations": [],
            "doc_class": "lab_report",
            "ocr_engine": "unknown",
            "extraction_confidence": 0.3,
            "schema_version": "1.0",
        },
    }


def extract_structured_json(
    ocr_raw_text: str,
    llm_client: Optional[Any] = None,
) -> Dict[str, Any]:
    """Extract structured lab report data from raw OCR text.

    Args:
        ocr_raw_text: Raw text from OCR engine.
        llm_client: Optional callable(system_prompt, user_prompt) -> JSON string.
            If provided, used instead of OpenAI or regex fallback.

    Returns:
        Validated dict matching the LabReport schema.
    """
    raw_data: Optional[Dict[str, Any]] = None

    if llm_client is not None:
        try:
            response = llm_client(SYSTEM_PROMPT, _build_user_prompt(ocr_raw_text))
            if isinstance(response, str):
                raw_data = json.loads(response)
            elif isinstance(response, dict):
                raw_data = response
        except Exception as exc:
            logger.warning("Custom LLM client failed: %s", exc)

    if raw_data is None:
        raw_data = _try_openai_extraction(ocr_raw_text)

    if raw_data is None:
        raw_data = _regex_fallback_extraction(ocr_raw_text)

    # Validate with Pydantic
    report = LabReport.model_validate(raw_data)
    return report.model_dump()
