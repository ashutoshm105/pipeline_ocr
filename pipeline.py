"""MedVault medical OCR pipeline — main entry point.

Orchestrates four stages:
  1. Image preprocessing
  2. Document type classification
  3. OCR routing
  4. Structured JSON extraction + validation
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from loguru import logger

# ---------------------------------------------------------------------------
# Stage 1 helpers — preprocessing
# ---------------------------------------------------------------------------

_HAS_EXTERN_PREPROCESSING = False

try:
    # Ensure extern/ submodules are on sys.path
    from ocr.submodule_paths import register_submodule_paths
    register_submodule_paths()
except ImportError:
    pass

try:
    from preprocessing import preprocess as extern_preprocess  # type: ignore[import]
    _HAS_EXTERN_PREPROCESSING = True
except Exception:
    pass


def _compute_quality_metrics(gray_img, label: str = "") -> Dict[str, Any]:
    """Compute image quality metrics on a grayscale image."""
    import cv2
    import numpy as np

    metrics: Dict[str, Any] = {}

    # Sharpness via Laplacian variance
    laplacian = cv2.Laplacian(gray_img, cv2.CV_64F)
    metrics["sharpness_laplacian_var"] = float(np.var(laplacian))

    # Contrast via RMS
    mean = np.mean(gray_img.astype(np.float64))
    metrics["contrast_rms"] = float(np.sqrt(np.mean((gray_img.astype(np.float64) - mean) ** 2)))

    # SNR in dB
    std = np.std(gray_img.astype(np.float64))
    if std > 0:
        metrics["snr_db"] = float(20 * np.log10(mean / std)) if mean > 0 else 0.0
    else:
        metrics["snr_db"] = 0.0

    # Skew angle (best-effort via deskew library)
    metrics["skew_angle_degrees"] = 0.0

    # Resolution estimate from image width (assume 8.5" page)
    h, w = gray_img.shape[:2]
    metrics["resolution_dpi"] = int(round(w / 8.5))

    metrics["binarisation_method"] = "none"

    return metrics


def _exif_correct(img, transformations: List[str]):
    """Rotate image according to EXIF orientation tag."""
    import cv2
    import numpy as np

    try:
        from PIL import Image

        pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
        exif = pil.getexif()
        orientation = exif.get(0x0112)
        if orientation is None:
            return img

        ops = {
            2: (Image.FLIP_LEFT_RIGHT,),
            3: (Image.ROTATE_180,),
            4: (Image.FLIP_TOP_BOTTOM,),
            5: (Image.TRANSPOSE,),
            6: (Image.ROTATE_270,),
            7: (Image.TRANSVERSE,),
            8: (Image.ROTATE_90,),
        }
        if orientation in ops:
            for op in ops[orientation]:
                pil = pil.transpose(op)
            img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
            transformations.append(f"exif_rotate(orient={orientation})")
    except Exception as exc:
        logger.debug("EXIF correction skipped: {}", exc)

    return img


def _perspective_correct(gray, transformations: List[str]):
    """Detect document edges and apply perspective warp to rectify."""
    import cv2
    import numpy as np

    h, w = gray.shape[:2]
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edged = cv2.Canny(blurred, 50, 150)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    edged = cv2.dilate(edged, kernel, iterations=2)

    contours, _ = cv2.findContours(edged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return gray

    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]
    for cnt in contours:
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) == 4 and cv2.contourArea(cnt) > (h * w * 0.25):
            pts = approx.reshape(4, 2).astype(np.float32)
            s = pts.sum(axis=1)
            d = np.diff(pts, axis=1).squeeze()
            ordered = np.array([
                pts[np.argmin(s)],
                pts[np.argmin(d)],
                pts[np.argmax(s)],
                pts[np.argmax(d)],
            ], dtype=np.float32)

            w_top = np.linalg.norm(ordered[1] - ordered[0])
            w_bot = np.linalg.norm(ordered[2] - ordered[3])
            h_left = np.linalg.norm(ordered[3] - ordered[0])
            h_right = np.linalg.norm(ordered[2] - ordered[1])
            new_w = int(max(w_top, w_bot))
            new_h = int(max(h_left, h_right))

            dst = np.array([
                [0, 0], [new_w - 1, 0],
                [new_w - 1, new_h - 1], [0, new_h - 1],
            ], dtype=np.float32)

            M = cv2.getPerspectiveTransform(ordered, dst)
            warped = cv2.warpPerspective(gray, M, (new_w, new_h))
            transformations.append("perspective_correct")
            return warped

    return gray


def _morphological_cleanup(binary, transformations: List[str]):
    """Remove salt-and-pepper noise with morphological open then close."""
    import cv2

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
    cleaned = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)
    cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, kernel, iterations=1)
    transformations.append("morphological_cleanup")
    return cleaned


def _builtin_preprocess(image_path: str) -> Dict[str, Any]:
    """OpenCV-based built-in preprocessing fallback.

    Returns a dict with ``image`` (numpy array), ``transformations`` list,
    ``quality_metrics_before``, and ``quality_metrics_after``.
    """
    import cv2
    import numpy as np

    img = cv2.imread(image_path)
    if img is None:
        raise FileNotFoundError(f"Cannot read image: {image_path}")

    transformations: List[str] = []

    img = _exif_correct(img, transformations)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    transformations.append("grayscale")

    quality_before = _compute_quality_metrics(gray)

    gray = _perspective_correct(gray, transformations)

    denoised = cv2.bilateralFilter(gray, d=9, sigmaColor=75, sigmaSpace=75)
    transformations.append("bilateral_denoise")

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)
    transformations.append("clahe_contrast")

    skew_angle = 0.0
    try:
        from deskew import determine_skew  # type: ignore[import]

        angle = determine_skew(enhanced)
        if angle is not None and abs(angle) > 0.1:
            skew_angle = float(angle)
            h, w = enhanced.shape[:2]
            center = (w // 2, h // 2)
            rotation_matrix = cv2.getRotationMatrix2D(center, skew_angle, 1.0)
            enhanced = cv2.warpAffine(
                enhanced, rotation_matrix, (w, h),
                flags=cv2.INTER_CUBIC,
                borderMode=cv2.BORDER_REPLICATE,
            )
            transformations.append(f"deskew({skew_angle:.2f}deg)")
    except ImportError:
        logger.debug("deskew package not available, skipping deskew step")
    except Exception as exc:
        logger.debug("Deskew failed, skipping: {}", exc)

    h, w = enhanced.shape[:2]
    max_width = 2550
    if w > max_width:
        scale = max_width / w
        new_w = max_width
        new_h = int(h * scale)
        enhanced = cv2.resize(enhanced, (new_w, new_h), interpolation=cv2.INTER_AREA)
        transformations.append(f"resize({new_w}x{new_h})")
    elif w < max_width * 0.5:
        scale = max_width / w
        new_w = max_width
        new_h = int(h * scale)
        enhanced = cv2.resize(enhanced, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
        transformations.append(f"resize({new_w}x{new_h})")

    binary = cv2.adaptiveThreshold(
        enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, blockSize=15, C=8,
    )
    transformations.append("adaptive_gaussian_binarization")
    binarisation_method = "adaptive_gaussian"

    binary = _morphological_cleanup(binary, transformations)

    quality_after = _compute_quality_metrics(binary)
    quality_after["skew_angle_degrees"] = skew_angle
    quality_after["binarisation_method"] = binarisation_method
    quality_before["skew_angle_degrees"] = skew_angle

    return {
        "image": binary,
        "transformations": transformations,
        "quality_metrics_before": quality_before,
        "quality_metrics_after": quality_after,
    }


def preprocess_image(image_path: str) -> Dict[str, Any]:
    """Run preprocessing, preferring extern/ submodule when available."""
    if _HAS_EXTERN_PREPROCESSING:
        try:
            result = extern_preprocess(image_path)
            logger.debug("Used extern preprocessing")
            return result
        except Exception as exc:
            logger.warning("Extern preprocessing failed, falling back: {}", exc)

    logger.debug("Using built-in OpenCV preprocessing")
    return _builtin_preprocess(image_path)


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def run_pipeline(
    image_path: str,
    output_path: Optional[str] = None,
    llm_client: Optional[Any] = None,
) -> Dict[str, Any]:
    """Run the full four-stage medical OCR pipeline.

    Args:
        image_path: Path to the input image file.
        output_path: Optional path to write the resulting JSON.
        llm_client: Optional callable(system_prompt, user_prompt) -> JSON str/dict.

    Returns:
        Validated LabReport dict.
    """
    logger.info("Pipeline start — {}", image_path)

    # Stage 1: Preprocessing
    logger.info("Stage 1/4: Preprocessing")
    prep_result = preprocess_image(image_path)
    preprocessed = prep_result["image"]
    transformations = prep_result.get("transformations", [])

    # Stage 2: Document classification
    logger.info("Stage 2/4: Classification")
    from classifier import classify_document

    classification = classify_document(preprocessed)
    doc_class = classification["predicted_class"]
    logger.info(
        "Classified as {} (confidence={:.2f}, fallback_triggered={})",
        doc_class,
        classification["confidence"],
        classification["fallback_triggered"],
    )

    # Stage 3: OCR routing
    logger.info("Stage 3/4: OCR (engine dispatch for class={})", doc_class)
    from ocr import run_ocr

    ocr_result = run_ocr(preprocessed, doc_class)
    raw_text = ocr_result["raw_output"]
    if isinstance(raw_text, list):
        # Table output — flatten rows to text for extraction stage
        raw_text = "\n".join("\t".join(row) for row in raw_text)

    logger.info(
        "OCR complete — engine={}, time={:.3f}s",
        ocr_result["ocr_engine_used"],
        ocr_result["processing_time_seconds"],
    )

    # Stage 4: Structured extraction + validation
    logger.info("Stage 4/4: Structured extraction")
    from extraction import extract_structured_json

    report = extract_structured_json(raw_text, llm_client=llm_client)

    # Enrich pipeline metadata with upstream info
    report["pipeline_metadata"]["preprocessing_transformations"] = transformations
    report["pipeline_metadata"]["doc_class"] = doc_class
    report["pipeline_metadata"]["ocr_engine"] = ocr_result["ocr_engine_used"]

    # Write output if requested
    if output_path is not None:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2, ensure_ascii=False)
        logger.info("Output written to {}", output_path)

    logger.info("Pipeline complete — {} results extracted", len(report["lab_results"]))
    return report


# ---------------------------------------------------------------------------
# Batch helpers
# ---------------------------------------------------------------------------

_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp", ".webp"}


def run_batch(
    input_dir: str,
    output_dir: str,
    llm_client: Optional[Any] = None,
) -> List[Dict[str, Any]]:
    """Process all images in *input_dir*, writing JSON to *output_dir*.

    Returns a list of result dicts (one per successfully processed image).
    """
    input_path = Path(input_dir)
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    images = sorted(
        p for p in input_path.iterdir()
        if p.suffix.lower() in _IMAGE_EXTENSIONS
    )

    if not images:
        logger.warning("No images found in {}", input_dir)
        return []

    logger.info("Batch processing {} images from {}", len(images), input_dir)
    results: List[Dict[str, Any]] = []

    for img in images:
        out_file = out_path / (img.stem + ".json")
        try:
            result = run_pipeline(
                str(img), output_path=str(out_file), llm_client=llm_client
            )
            results.append(result)
        except Exception as exc:
            logger.error("Failed to process {}: {}", img.name, exc)

    logger.info("Batch complete — {}/{} succeeded", len(results), len(images))
    return results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="medvault-pipeline",
        description="MedVault medical OCR pipeline",
    )
    parser.add_argument(
        "--input", "-i",
        dest="input_file",
        help="Path to a single input image",
    )
    parser.add_argument(
        "--input_dir",
        help="Directory of images for batch processing",
    )
    parser.add_argument(
        "--output", "-o",
        dest="output_file",
        help="Output JSON path (single-image mode)",
    )
    parser.add_argument(
        "--output_dir",
        help="Output directory for batch JSON results",
    )
    parser.add_argument(
        "--log_level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging verbosity (default: INFO)",
    )
    return parser


def main(argv: Optional[List[str]] = None) -> None:
    """CLI entry point."""
    parser = _build_parser()
    args = parser.parse_args(argv)

    # Configure loguru
    logger.remove()
    logger.add(sys.stderr, level=args.log_level)

    if args.input_file and args.input_dir:
        parser.error("Specify --input or --input_dir, not both")

    if args.input_file:
        if not os.path.isfile(args.input_file):
            parser.error(f"Input file not found: {args.input_file}")
        output = args.output_file
        if output is None:
            output = Path(args.input_file).with_suffix(".json").name
        result = run_pipeline(args.input_file, output_path=output)
        print(json.dumps(result, indent=2, ensure_ascii=False))

    elif args.input_dir:
        if not os.path.isdir(args.input_dir):
            parser.error(f"Input directory not found: {args.input_dir}")
        output_dir = args.output_dir or os.path.join(args.input_dir, "output")
        run_batch(args.input_dir, output_dir)

    else:
        parser.error("Provide --input or --input_dir")


if __name__ == "__main__":
    main()
