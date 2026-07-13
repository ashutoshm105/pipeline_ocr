"""Pydantic v2 models for structured lab report extraction."""

from typing import List, Optional, Literal
from pydantic import BaseModel, Field


class ReferenceRange(BaseModel):
    low: Optional[float] = None
    high: Optional[float] = None
    unit: str


class LabResult(BaseModel):
    test_name: str
    test_abbreviation: Optional[str] = None
    value: Optional[float] = None
    unit: str
    reference_range: ReferenceRange
    flag: Literal[
        "HIGH", "LOW", "CRITICAL_HIGH", "CRITICAL_LOW", "NORMAL", "UNKNOWN"
    ]
    clinical_significance: Optional[str] = None


class DocumentMetadata(BaseModel):
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    date_of_collection: Optional[str] = None
    date_of_report: Optional[str] = None
    lab_name: Optional[str] = None
    referring_doctor: Optional[str] = None
    department: Optional[str] = "Hepatology"


class PipelineMetadata(BaseModel):
    preprocessing_transformations: List[str]
    doc_class: str
    ocr_engine: str
    extraction_confidence: float
    schema_version: str = "1.0"


class LabReport(BaseModel):
    document_metadata: DocumentMetadata
    lab_results: List[LabResult]
    pipeline_metadata: PipelineMetadata
