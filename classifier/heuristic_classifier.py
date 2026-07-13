"""Rule-based document classifier for medical OCR images.

Uses OpenCV heuristics (line detection, stroke width variation) to classify
preprocessed images into TABLE, HANDWRITTEN, or PRINTED_TEXT categories.
"""

from typing import Dict, Optional

import cv2
import numpy as np


# Classification labels
TABLE = "TABLE"
HANDWRITTEN = "HANDWRITTEN"
PRINTED_TEXT = "PRINTED_TEXT"

# Tunable thresholds
_MIN_TABLE_LINES_H = 3
_MIN_TABLE_LINES_V = 3
_TABLE_CONFIDENCE = 0.85
_HANDWRITTEN_STROKE_VARIATION_THRESHOLD = 0.45
_HANDWRITTEN_CONFIDENCE = 0.70
_PRINTED_CONFIDENCE = 0.60


def _detect_table(gray: np.ndarray) -> float:
    """Score how likely the image contains a table based on intersecting lines.

    Uses Canny + HoughLinesP to find horizontal and vertical line segments,
    then checks whether enough of each exist to form a grid.

    Args:
        gray: Grayscale uint8 image.

    Returns:
        Confidence score in [0, 1].
    """
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    h, w = gray.shape[:2]

    min_line_length = int(w * 0.15)
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=80,
        minLineLength=min_line_length,
        maxLineGap=10,
    )

    if lines is None:
        return 0.0

    horizontal = 0
    vertical = 0
    angle_tolerance = np.pi / 36  # 5 degrees

    for line in lines:
        coords = line.flatten()[:4]
        x1, y1, x2, y2 = coords
        angle = abs(np.arctan2(y2 - y1, x2 - x1))
        if angle < angle_tolerance or abs(angle - np.pi) < angle_tolerance:
            horizontal += 1
        elif abs(angle - np.pi / 2) < angle_tolerance:
            vertical += 1

    if horizontal >= _MIN_TABLE_LINES_H and vertical >= _MIN_TABLE_LINES_V:
        line_count = horizontal + vertical
        score = min(1.0, line_count / 20.0)
        return max(score, _TABLE_CONFIDENCE)

    return 0.0


def _detect_handwritten(gray: np.ndarray) -> float:
    """Score how likely the image contains handwritten text.

    Measures stroke-width variation using the distance transform on a
    binarised version of the image.  Handwriting tends to have much higher
    variation in stroke width than machine-printed text.

    Args:
        gray: Grayscale uint8 image.

    Returns:
        Confidence score in [0, 1].
    """
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    foreground_pixels = cv2.countNonZero(binary)
    if foreground_pixels < 100:
        return 0.0

    dist_transform = cv2.distanceTransform(binary, cv2.DIST_L2, 5)
    stroke_widths = dist_transform[binary > 0]

    if len(stroke_widths) == 0:
        return 0.0

    mean_sw = float(np.mean(stroke_widths))
    std_sw = float(np.std(stroke_widths))

    if mean_sw < 1e-6:
        return 0.0

    coefficient_of_variation = std_sw / mean_sw

    if coefficient_of_variation > _HANDWRITTEN_STROKE_VARIATION_THRESHOLD:
        score = min(1.0, coefficient_of_variation / 1.0)
        return max(score, _HANDWRITTEN_CONFIDENCE)

    return 0.0


def classify_document(image: np.ndarray) -> Dict[str, object]:
    """Classify a preprocessed document image.

    Applies rule-based heuristics in priority order:
    1. Table detection (line grid)
    2. Handwriting detection (stroke-width variation)
    3. Fallback to PRINTED_TEXT

    Args:
        image: Preprocessed image as a numpy ndarray.  May be grayscale
               (H x W) or BGR (H x W x 3).

    Returns:
        Dict with keys:
            predicted_class: One of TABLE, HANDWRITTEN, PRINTED_TEXT.
            confidence: Float confidence score in [0, 1].
            fallback_class: The class that would be returned if the
                primary prediction is rejected (always PRINTED_TEXT).
            fallback_triggered: Whether the fallback was used.
    """
    if image is None or image.size == 0:
        return {
            "predicted_class": PRINTED_TEXT,
            "confidence": 0.0,
            "fallback_class": PRINTED_TEXT,
            "fallback_triggered": True,
        }

    if len(image.shape) == 3 and image.shape[2] == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image

    # Priority 1: table detection
    table_score = _detect_table(gray)
    if table_score > 0:
        return {
            "predicted_class": TABLE,
            "confidence": float(table_score),
            "fallback_class": PRINTED_TEXT,
            "fallback_triggered": False,
        }

    # Priority 2: handwriting detection
    handwriting_score = _detect_handwritten(gray)
    if handwriting_score > 0:
        return {
            "predicted_class": HANDWRITTEN,
            "confidence": float(handwriting_score),
            "fallback_class": PRINTED_TEXT,
            "fallback_triggered": False,
        }

    # Fallback
    return {
        "predicted_class": PRINTED_TEXT,
        "confidence": _PRINTED_CONFIDENCE,
        "fallback_class": PRINTED_TEXT,
        "fallback_triggered": True,
    }
