#!/usr/bin/env python3
"""
Clear Medusa product-import CSV "Product Tag N Value" columns (keep "Product Tag N Id" ptag_* intact).

Mitigates Admin import sending human labels as tag ids instead of ptag_* (see Biz Collection import notes).

  python3 scripts/clear_medusa_csv_product_tag_values.py path/to/import.csv [--output path/out.csv]

Defaults to overwriting the input (--output omitted).
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path


_TAG_VALUE_COL = re.compile(r"^Product Tag \d+ Value$", re.IGNORECASE)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path", type=Path)
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=None,
        help="Output path (default: overwrite input)",
    )
    args = parser.parse_args()
    inp = args.csv_path
    if not inp.is_file():
        print(f"Not found: {inp}", file=sys.stderr)
        sys.exit(1)
    out = args.output or inp

    with inp.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            print("CSV has no header", file=sys.stderr)
            sys.exit(1)
        fieldnames = list(reader.fieldnames)
        tag_val_cols = [c for c in fieldnames if c and _TAG_VALUE_COL.match(c.strip())]
        if not tag_val_cols:
            print(
                "No columns matching Product Tag N Value; header unchanged.",
                file=sys.stderr,
            )
            sys.exit(2)
        rows = list(reader)

    cleared = 0
    for row in rows:
        for c in tag_val_cols:
            if (row.get(c) or "").strip():
                cleared += 1
                row[c] = ""

    with out.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    print(f"Cleared {cleared} non-empty tag value cells ({len(tag_val_cols)} columns) → {out}")


if __name__ == "__main__":
    main()
