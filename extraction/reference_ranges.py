"""Reference ranges and flagging for common hepatology lab tests."""

from typing import Dict, Optional, Tuple

# Standard adult reference ranges: test_name_lower -> (low, high)
_RANGES: Dict[str, Tuple[float, float]] = {
    "alt": (7.0, 56.0),
    "alanine aminotransferase": (7.0, 56.0),
    "sgpt": (7.0, 56.0),
    "ast": (10.0, 40.0),
    "aspartate aminotransferase": (10.0, 40.0),
    "sgot": (10.0, 40.0),
    "alp": (44.0, 147.0),
    "alkaline phosphatase": (44.0, 147.0),
    "ggt": (9.0, 48.0),
    "gamma-glutamyl transferase": (9.0, 48.0),
    "total bilirubin": (0.1, 1.2),
    "tbil": (0.1, 1.2),
    "t.bil": (0.1, 1.2),
    "direct bilirubin": (0.0, 0.3),
    "dbil": (0.0, 0.3),
    "d.bil": (0.0, 0.3),
    "indirect bilirubin": (0.2, 0.9),
    "i.bil": (0.2, 0.9),
    "albumin": (3.5, 5.5),
    "alb": (3.5, 5.5),
    "total protein": (6.0, 8.3),
    "tp": (6.0, 8.3),
    "globulin": (2.0, 3.5),
    "glob": (2.0, 3.5),
    "a/g ratio": (1.2, 2.2),
    "serum ammonia": (15.0, 45.0),
    "nh3": (15.0, 45.0),
    "ferritin": (24.0, 336.0),
    "pt": (11.0, 13.5),
    "prothrombin time": (11.0, 13.5),
    "inr": (0.8, 1.1),
}

_CRITICAL_HIGH_MULTIPLIER = 3.0
_CRITICAL_LOW_MULTIPLIER = 0.5


def get_reference_range(test_name: str) -> Optional[Tuple[float, float]]:
    """Return the (low, high) reference range for a test, or None if unknown.

    Args:
        test_name: Name or abbreviation of the test (case-insensitive).

    Returns:
        Tuple of (low, high) floats, or None if the test is not recognized.
    """
    key = test_name.strip().lower()
    return _RANGES.get(key)


def flag_value(
    test_name: str,
    value: Optional[float],
) -> str:
    """Flag a lab value against standard reference ranges.

    Args:
        test_name: Name or abbreviation of the test.
        value: Numeric result value, or None if unreadable.

    Returns:
        One of HIGH, LOW, CRITICAL_HIGH, CRITICAL_LOW, NORMAL, UNKNOWN.
    """
    if value is None:
        return "UNKNOWN"

    ref = get_reference_range(test_name)

    if ref is None:
        return "UNKNOWN"

    low, high = ref

    if value > high * _CRITICAL_HIGH_MULTIPLIER:
        return "CRITICAL_HIGH"
    if low > 0 and value < low * _CRITICAL_LOW_MULTIPLIER:
        return "CRITICAL_LOW"
    if value > high:
        return "HIGH"
    if value < low:
        return "LOW"

    return "NORMAL"
