"""Rule-based diagnosis engine with optional LLM augmentation."""

from typing import Dict, List, Optional, Tuple

from diagnosis.hepatology_kb import CONDITION_PATTERNS, REFERENCE_RANGES


def _normalize_lab_map(lab_results: List[Dict]) -> Dict[str, float]:
    """Build a lookup from lab name to numeric value."""
    lab_map: Dict[str, float] = {}
    for entry in lab_results:
        name = entry.get("name", entry.get("test", "")).strip()
        raw_value = entry.get("value")
        if raw_value is None:
            continue
        try:
            numeric = float(str(raw_value).replace(",", ""))
        except (ValueError, TypeError):
            continue
        lab_map[name] = numeric
    return lab_map


def _check_pattern(
    lab_map: Dict[str, float],
    lab_name: str,
    comparator: str,
    threshold: float,
) -> bool:
    if lab_name not in lab_map:
        return False
    value = lab_map[lab_name]
    if comparator == ">":
        return value > threshold
    if comparator == ">=":
        return value >= threshold
    if comparator == "<":
        return value < threshold
    if comparator == "<=":
        return value <= threshold
    return False


def _calculate_severity(
    lab_map: Dict[str, float],
    severity_weights: Dict[str, float],
) -> Tuple[float, str]:
    """Return a 0-10 severity score and a label (mild/moderate/severe/critical)."""
    total_weight = 0.0
    weighted_score = 0.0

    for lab_name, weight in severity_weights.items():
        if lab_name not in lab_map:
            continue
        value = lab_map[lab_name]
        ref = REFERENCE_RANGES.get(lab_name)
        if ref is None:
            continue

        low, high = ref
        ref_range = high - low if high != low else 1.0

        # How far outside the normal range the value falls
        if value > high:
            deviation = (value - high) / ref_range
        elif value < low:
            deviation = (low - value) / ref_range
        else:
            deviation = 0.0

        # Cap the deviation contribution at 10
        capped = min(deviation * 2.0, 10.0)
        weighted_score += capped * weight
        total_weight += weight

    score = round(weighted_score / total_weight, 1) if total_weight > 0 else 0.0
    score = min(score, 10.0)

    if score >= 8.0:
        label = "critical"
    elif score >= 5.0:
        label = "severe"
    elif score >= 2.5:
        label = "moderate"
    else:
        label = "mild"

    return score, label


def _find_abnormal_values(lab_map: Dict[str, float]) -> List[Dict]:
    """Return all labs outside their reference range."""
    abnormals: List[Dict] = []
    for name, value in lab_map.items():
        ref = REFERENCE_RANGES.get(name)
        if ref is None:
            continue
        low, high = ref
        if value < low:
            abnormals.append({
                "name": name,
                "value": value,
                "reference_range": f"{low}-{high}",
                "status": "LOW",
            })
        elif value > high:
            abnormals.append({
                "name": name,
                "value": value,
                "reference_range": f"{low}-{high}",
                "status": "HIGH",
            })
    return abnormals


def diagnose(
    lab_results: List[Dict],
    llm_callback: Optional[object] = None,
) -> Dict:
    """Analyse lab results and return possible conditions with severity.

    Parameters
    ----------
    lab_results:
        List of dicts, each with at least ``name`` (or ``test``) and ``value``.
    llm_callback:
        Optional callable ``(prompt: str) -> str`` for LLM-augmented reasoning.
        When provided the engine appends an ``llm_analysis`` key.

    Returns
    -------
    dict with keys:
        possible_conditions  - list of matched condition dicts
        abnormal_values      - labs outside reference range
        overall_severity     - worst-case severity across conditions
        recommendations      - aggregated unique recommendations
        llm_analysis         - (only if llm_callback provided)
    """
    lab_map = _normalize_lab_map(lab_results)
    matched_conditions: List[Dict] = []

    for condition_name, info in CONDITION_PATTERNS.items():
        all_match = all(
            _check_pattern(lab_map, lab, comp, thresh)
            for lab, comp, thresh in info["patterns"]
        )
        if not all_match:
            continue

        score, label = _calculate_severity(lab_map, info.get("severity_weights", {}))
        matched_conditions.append({
            "condition": condition_name,
            "description": info["description"],
            "severity_score": score,
            "severity_label": label,
            "recommendations": list(info["recommendations"]),
        })

    # Sort by severity descending
    matched_conditions.sort(key=lambda c: c["severity_score"], reverse=True)

    abnormal_values = _find_abnormal_values(lab_map)

    # Aggregate recommendations (preserve order, deduplicate)
    seen_recs: set = set()
    all_recommendations: List[str] = []
    for cond in matched_conditions:
        for rec in cond["recommendations"]:
            if rec not in seen_recs:
                seen_recs.add(rec)
                all_recommendations.append(rec)

    overall_severity = "normal"
    if matched_conditions:
        overall_severity = matched_conditions[0]["severity_label"]

    result: Dict = {
        "possible_conditions": matched_conditions,
        "abnormal_values": abnormal_values,
        "overall_severity": overall_severity,
        "recommendations": all_recommendations,
    }

    # Optional LLM augmentation
    if llm_callback is not None and callable(llm_callback):
        prompt = _build_llm_prompt(lab_map, matched_conditions, abnormal_values)
        try:
            llm_response = llm_callback(prompt)
            result["llm_analysis"] = llm_response
        except Exception as exc:
            result["llm_analysis"] = f"LLM analysis unavailable: {exc}"

    return result


def _build_llm_prompt(
    lab_map: Dict[str, float],
    conditions: List[Dict],
    abnormals: List[Dict],
) -> str:
    lines = ["Analyse the following hepatology lab results:\n"]
    for name, value in sorted(lab_map.items()):
        ref = REFERENCE_RANGES.get(name)
        ref_str = f" (ref: {ref[0]}-{ref[1]})" if ref else ""
        lines.append(f"  {name}: {value}{ref_str}")

    if conditions:
        lines.append("\nRule-based engine matched these conditions:")
        for c in conditions:
            lines.append(f"  - {c['condition']} (severity: {c['severity_label']})")

    if abnormals:
        lines.append("\nAbnormal values:")
        for a in abnormals:
            lines.append(f"  - {a['name']}: {a['value']} ({a['status']}, ref {a['reference_range']})")

    lines.append(
        "\nProvide a concise clinical interpretation, differential diagnosis, "
        "and prioritised next steps. Note any patterns the rule engine may have missed."
    )
    return "\n".join(lines)
