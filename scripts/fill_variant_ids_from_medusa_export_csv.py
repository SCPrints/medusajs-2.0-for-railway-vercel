#!/usr/bin/env python3
"""
Fill "Variant Id" on each row of a Medusa product-import CSV from an Admin export
(products-import-template or product-export CSV).

Match key: Product Handle + Variant SKU (both normalized stripped strings). Rows with
empty Product Handle reuse the last non-empty handle (same propagation as Product Id fillers).

Without Variant Id on update imports, Medusa may INSERT new variants; many rows get
variant_rank = 0 and Postgres raises a unique violation on (product_id, variant_rank).

  python3 scripts/fill_variant_ids_from_medusa_export_csv.py \\
    --export ~/Downloads/products-import-template-XXXX.csv \\
    --input path/to/import.csv
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path


def _col(fieldnames: list[str], names: tuple[str, ...]) -> str | None:
    for want in names:
        for h in fieldnames:
            if str(h).lower().strip() == want.lower():
                return h
    return None


def _sku_key(raw: str) -> str:
    return (raw or "").strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--export", type=Path, required=True)
    ap.add_argument("--input", type=Path, required=True)
    ap.add_argument("--output", type=Path, default=None)
    args = ap.parse_args()

    out_path = args.output or args.input
    if not args.export.is_file() or not args.input.is_file():
        sys.exit("Export or input file not found")

    with args.export.open("r", encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f)
        ex_fn = list(r.fieldnames or [])
        fh = _col(ex_fn, ("product handle", "handle"))
        skid = _col(ex_fn, ("variant sku", "sku"))
        vid = _col(ex_fn, ("variant id",))
        if not fh or not skid or not vid:
            print(
                'Export CSV must include "Product Handle", "Variant SKU", "Variant Id".',
                file=sys.stderr,
            )
            sys.exit(1)
        sku_to_vid: dict[tuple[str, str], str] = {}
        for row in r:
            h = _sku_key(row.get(fh, ""))
            s = _sku_key(row.get(skid, ""))
            v = (row.get(vid) or "").strip()
            if not h or not s or not v.startswith("variant_"):
                continue
            sku_to_vid[(h, s)] = v

    print(f"Export maps {len(sku_to_vid)} handle+SKU pairs to variant ids.", flush=True)

    with args.input.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            sys.exit("Input CSV has no header")
        fieldnames = list(reader.fieldnames)
        rows = list(reader)

    h_key = _col(fieldnames, ("product handle",))
    sku_key_col = _col(fieldnames, ("variant sku",))
    vid_key_col = _col(fieldnames, ("variant id",))

    if not h_key or not sku_key_col or not vid_key_col:
        print('Input CSV must include "Product Handle", "Variant SKU", "Variant Id".', file=sys.stderr)
        sys.exit(1)

    missing_pairs: list[str] = []
    updated = 0
    last_handle = ""
    seen_missing: set[str] = set()

    for row in rows:
        h_in = _sku_key(row.get(h_key, ""))
        if h_in:
            last_handle = h_in
        handle_eff = h_in if h_in else last_handle
        sku_val = _sku_key(row.get(sku_key_col, ""))

        if not sku_val or not handle_eff:
            continue

        oid = _sku_key(row.get(vid_key_col, ""))
        nv = sku_to_vid.get((handle_eff, sku_val))
        if not nv:
            k = f"{handle_eff}|{sku_val}"
            if k not in seen_missing:
                seen_missing.add(k)
                missing_pairs.append(k)
            continue
        if oid != nv:
            updated += 1
        row[vid_key_col] = nv

    if missing_pairs:
        print(
            f"Warning: no export match for {len(missing_pairs)} distinct handle+SKU pairs "
            f"(Variant Id unchanged): "
            + ", ".join(missing_pairs[:12])
            + (" …" if len(missing_pairs) > 12 else ""),
            file=sys.stderr,
            flush=True,
        )

    with out_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    print(f"Wrote {out_path} (set Variant Id on {updated} row occurrences).")


if __name__ == "__main__":
    main()
