"""Normalise common lab unit variations to standard SI units."""

from typing import Dict

_UNIT_MAP: Dict[str, str] = {
    # U/L variants
    "u/l": "U/L",
    "U/l": "U/L",
    "u/L": "U/L",
    "U/L": "U/L",
    "IU/L": "U/L",
    "iu/l": "U/L",
    "IU/l": "U/L",
    # g/dL variants
    "g/dl": "g/dL",
    "g/dL": "g/dL",
    "G/DL": "g/dL",
    "gm/dl": "g/dL",
    "gm/dL": "g/dL",
    "g%": "g/dL",
    # mg/dL variants
    "mg/dl": "mg/dL",
    "mg/dL": "mg/dL",
    "MG/DL": "mg/dL",
    "mg%": "mg/dL",
    # μmol/L variants
    "umol/l": "μmol/L",
    "umol/L": "μmol/L",
    "µmol/L": "μmol/L",
    "µmol/l": "μmol/L",
    "μmol/L": "μmol/L",
    "μmol/l": "μmol/L",
    "micromol/L": "μmol/L",
    # seconds
    "sec": "seconds",
    "secs": "seconds",
    "s": "seconds",
    "seconds": "seconds",
    "Seconds": "seconds",
    # ng/mL variants
    "ng/ml": "ng/mL",
    "ng/mL": "ng/mL",
    "NG/ML": "ng/mL",
    # ratio (dimensionless)
    "ratio": "ratio",
    "Ratio": "ratio",
    "": "ratio",
}


def normalise_unit(raw_unit: str) -> str:
    """Map a raw unit string to its canonical SI form.

    Args:
        raw_unit: The unit string as it appears in the OCR text.

    Returns:
        Standardised unit string. Returns the input stripped if no mapping found.
    """
    stripped = raw_unit.strip()
    return _UNIT_MAP.get(stripped, stripped)
