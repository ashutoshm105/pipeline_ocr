"""
03 - Extraction Evaluation
==========================
Evaluate the full OCR extraction pipeline end-to-end: run each OCR engine
(PaddleOCR, Surya, Tesseract, EasyOCR, TrOCR, Docling, OLMoOCR) on the
test set, compare raw text output, then measure structured extraction
accuracy (field-level precision/recall) after LLM post-processing.

Run cells interactively with a Jupyter kernel or VS Code interactive window.
"""

# %% Imports
# import pandas as pd
# from pathlib import Path
# from loguru import logger

# %% Load ground-truth annotations
# gt = pd.read_csv("../tests/ground_truth.csv")
# print(f"Ground truth: {len(gt)} annotated documents")

# %% Run OCR engines on sample set
# results = {}
# engines = ["paddle", "surya", "tesseract", "easyocr", "trocr", "docling", "olmocr"]
# for engine in engines:
#     # results[engine] = run_engine(engine, sample_images)
#     pass

# %% Compute field-level metrics
# def field_accuracy(predicted: dict, expected: dict) -> dict:
#     """Compare extracted fields against ground truth."""
#     metrics = {}
#     for field in expected:
#         metrics[field] = predicted.get(field) == expected[field]
#     return metrics

# %% Aggregate and display results
# # Build a comparison DataFrame: engine x field -> accuracy
# # summary = pd.DataFrame(all_metrics).T
# # print(summary.to_markdown())
