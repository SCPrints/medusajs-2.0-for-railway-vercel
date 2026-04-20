#!/usr/bin/env python3
"""
Rewrite a Medusa product-import CSV so every cell is safe for the admin
chunk pipeline (JSON.parse on MinIO). Strips C0 controls, normalizes line
separators, and replaces Unicode dashes / line/paragraph separators that can
cause issues across editors and runtimes.

  python3 scripts/sanitize_medusa_import_csv.py syzmik_medusa_import_medusa_files.csv

Writes UTF-8 with Unix newlines (Excel/TextEdit-safe for re-open).
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path

_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_USP = re.compile(r"[\u2028\u2029]")
_TRANS = str.maketrans(
    {
        "\u2013": "-",  # en dash
        "\u2014": "-",  # em dash
        "\u2212": "-",  # minus sign
        "\u00a0": " ",  # nbsp
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\ufeff": "",  # BOM inside cell
    }
)


def scrub_cell(v: str | None) -> str:
    s = (v or "").strip()
    if not s:
        return ""
    s = s.translate(_TRANS)
    s = _USP.sub(" ", s)
    s = s.replace("\r\n", " ").replace("\n", " ").replace("\r", " ")
    s = _CTRL.sub(" ", s)
    s = re.sub(r" +", " ", s).strip()
    return s


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path", type=Path, nargs="?", default=Path("syzmik_medusa_import_medusa_files.csv"))
    args = parser.parse_args()
    path: Path = args.csv_path
    if not path.is_file():
        print(f"Not found: {path}", file=sys.stderr)
        sys.exit(1)

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        rows = [{k: scrub_cell(row.get(k)) for k in fieldnames} for row in reader]

    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    print(f"Sanitized {len(rows)} rows → {path} (UTF-8 LF)")


if __name__ == "__main__":
    main()
