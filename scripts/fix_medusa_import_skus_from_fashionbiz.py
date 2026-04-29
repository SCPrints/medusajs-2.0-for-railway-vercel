#!/usr/bin/env python3
"""
Overwrite Medusa product-import Variant SKU (and optionally Variant Barcode) from FashionBiz AU
CSV exports keyed by style_code × size × colour.

Typical upstream columns: sku, style_code, size, colour (see 202*_biz-*_full.csv exports).

Handles common spreadsheet corruption passed through to Medusa:
- Scientific notation SKU column (repair from source sku text)
- Option value "4-Jun" → source size "4-6"
- Fallback: Variant Title `{size} / {colour}` when option columns mismatch

Usage:

  python3 scripts/fix_medusa_import_skus_from_fashionbiz.py \\
    --medusa ".../HALF_FIXED.csv" \\
    --catalog ".../2026_biz-collection_au_full (1).csv" \\
    --catalog ".../2026_biz-corporates_au_full.csv"

Use --overwrite-in-place (default True) only when ready; omit --overwrite-in-place to preview.

  python3 scripts/fix_medusa_import_skus_from_fashionbiz.py --dry-run --medusa "..."

"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path


def norm_ws(value: str | None) -> str:
    return " ".join((value or "").split()).strip()


def extract_style_from_handle(handle: str) -> str | None:
    """Last segment of slug uppercased: p3225→P3225, st2020b→ST2020B."""
    h = norm_ws(handle)
    if not h:
        return None
    h = h.casefold()
    for pre in ("biz-collection-", "biz-care-", "biz-corporate-", "biz-corporates-", "biz-corporatie-"):
        if h.startswith(pre):
            h = h[len(pre) :]
            break
    if not h:
        return None
    seg = h.split("-")[-1].strip().upper()
    return seg or None


def normalize_size_aliases(size: str) -> list[str]:
    """Yield size strings to probe in the sku index."""
    raw = norm_ws(size)
    if not raw:
        return []

    lc = raw.casefold()
    out = [raw]
    aliases: dict[str, list[str]] = {
        "4-jun": ["4-6"],
        "04-jun": ["4-6"],
        # April–Sep month tokens from Excel interpreting "6-Aug" etc. → expand if needed later
        "jun-4": ["4-6"],
    }
    for extra in aliases.get(lc, []):
        if extra not in out:
            out.append(extra)
    # One-off: Medusa row had "One Size" for sized shirts → try XS common first
    if lc == "one size":
        return ["XS", "S", raw, "FRE"]
    return out


def split_variant_title(title: str) -> tuple[str | None, str | None]:
    t = norm_ws(title)
    if " / " not in t:
        return None, None
    left, _, right = t.partition(" / ")
    return norm_ws(left), norm_ws(right)


def load_catalog_index(paths: list[Path]) -> dict[tuple[str, str, str], str]:
    idx: dict[tuple[str, str, str], str] = {}
    conflicts = 0
    for p in paths:
        if not p.is_file():
            print(f"Warning: skipping missing catalog {p}", file=sys.stderr)
            continue
        with p.open("r", encoding="utf-8-sig", newline="") as fh:
            r = csv.DictReader(fh)
            if not r.fieldnames or not {"sku", "style_code", "size", "colour"}.issubset(
                set(r.fieldnames)
            ):
                print(f"Warning: unexpected columns in {p}", file=sys.stderr)
                continue
            for row in r:
                st = norm_ws(row["style_code"]).upper()
                sku = norm_ws(row["sku"])
                sz = norm_ws(row["size"])
                col = norm_ws(row["colour"])
                if not st or not sku:
                    continue
                k = (st, sz.casefold(), col.casefold())
                if k in idx and idx[k] != sku:
                    conflicts += 1
                    continue
                idx[k] = sku
    if conflicts:
        print(f"Note: skipped {conflicts} sku key collisions (same style/size/col).", file=sys.stderr)
    return idx


def probe_index(
    idx: dict[tuple[str, str, str], str], style_upper: str, size: str, colour: str
) -> str | None:
    cu = norm_ws(colour)
    cl = cu.casefold()
    seen_cf: set[str] = set()
    for s in normalize_size_aliases(norm_ws(size)):
        if not s:
            continue
        cf = s.casefold()
        if cf in seen_cf:
            continue
        seen_cf.add(cf)
        hit = idx.get((style_upper, cf, cl))
        if hit:
            return hit
    return None


def find_sku(
    idx: dict[tuple[str, str, str], str],
    style: str,
    ov1: str,
    ov2: str,
    variant_title: str,
) -> str | None:
    style_u = norm_ws(style).upper()
    tl, tt_colour = split_variant_title(variant_title)
    colour_fallback = tt_colour if not norm_ws(ov2) else ov2

    for size_token in (norm_ws(ov1), tl if tl else ""):
        tok = norm_ws(size_token)
        if not tok and tl:
            tok = tl
        if not norm_ws(colour_fallback):
            break
        if not tok:
            continue
        hit = probe_index(idx, style_u, tok, colour_fallback)
        if hit:
            return hit

    if tl and norm_ws(ov1) != tl and norm_ws(ov2):
        hit = probe_index(idx, style_u, tl, ov2)
        if hit:
            return hit
    return None


def looks_like_placeholder_sku(cell: str) -> bool:
    s = norm_ws(cell)
    if not s:
        return True
    u = s.upper()
    return "E+" in u or "E-" in u


def update_medusa_csv(
    medusa_paths: list[Path],
    idx: dict[tuple[str, str, str], str],
    *,
    also_barcode: bool,
    dry_run: bool,
) -> tuple[int, int]:
    sku_key = "Variant SKU"
    bc_key = "Variant Barcode"
    handle_key = "Product Handle"
    ov1_key = "Variant Option 1 Value"
    ov2_key = "Variant Option 2 Value"
    title_key = "Variant Title"

    updated = 0
    missing = 0

    for mp in medusa_paths:
        rows_out: list[dict[str, str]] = []
        with mp.open("r", encoding="utf-8-sig", newline="") as fh:
            reader = csv.DictReader(fh)
            fn = reader.fieldnames
            if not fn:
                print(f"No header {mp}", file=sys.stderr)
                continue

            rows = list(reader)

        hit_path = mp if dry_run else mp
        changed_here = 0
        misses: list[tuple[str, str, str, str, str]] = []
        last_handle = ""

        for row in rows:
            h = norm_ws(row.get(handle_key))
            if h:
                last_handle = h
            h_eff = last_handle
            ov1 = row.get(ov1_key) or ""
            ov2 = row.get(ov2_key) or ""
            title = row.get(title_key) or ""
            sku_cell = norm_ws(row.get(sku_key) or "")

            style = extract_style_from_handle(h_eff)
            if not style:
                rows_out.append(row)
                continue

            sku = find_sku(idx, style, ov1, ov2, title)
            if sku:
                if sku_cell != sku or looks_like_placeholder_sku(sku_cell):
                    changed_here += 1
                    if not dry_run:
                        row[sku_key] = sku
                        if also_barcode and sku.isdigit():
                            row[bc_key] = sku
            else:
                if looks_like_placeholder_sku(sku_cell):
                    misses.append((h_eff, title, ov1, ov2, sku_cell[:30]))
                    missing += 1

            rows_out.append(row)

        if misses:
            sample = misses[:15]
            print(f"\nUnresolved rows in {hit_path.name} (showing first {len(sample)}):\n")
            for m in sample:
                print(f"  handle={m[0][:60]}… title={m[1][:50]} ov1={m[2]} ov2={m[3]} was={m[4]}")
            if len(misses) > len(sample):
                print(f"  … and {len(misses) - len(sample)} more", file=sys.stderr)

        updated += changed_here

        if not dry_run:
            with mp.open("w", encoding="utf-8", newline="") as out:
                writer = csv.DictWriter(out, fieldnames=list(fn), extrasaction="ignore")
                writer.writeheader()
                writer.writerows(rows_out)
            print(f"Wrote {mp}: SKU cells updated ~= {changed_here}")

    return updated, missing


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--medusa",
        action="append",
        required=True,
        help="Medusa CSV path (repeat)",
    )
    ap.add_argument(
        "--catalog",
        action="append",
        dest="catalogs",
        default=[],
        help="FashionBiz catalog CSV path (sku,style_code,size,colour)",
    )
    ap.add_argument(
        "--also-barcode",
        action="store_true",
        help="Set Variant Barcode equal to SKU when SKU is numeric",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Count matches only",
    )
    args = ap.parse_args()

    defaults = [
        Path(
            "/Users/seanmudie/Library/CloudStorage/GoogleDrive-info@scprints.com.au/My Drive/"
            "SC Print/Website/Gemini/2025_biz-care_au_full (2).csv"
        ),
        Path(
            "/Users/seanmudie/Library/CloudStorage/GoogleDrive-info@scprints.com.au/My Drive/"
            "SC Print/Website/Gemini/2026_biz-collection_au_full (1).csv"
        ),
        Path(
            "/Users/seanmudie/Library/CloudStorage/GoogleDrive-info@scprints.com.au/My Drive/"
            "SC Print/Website/Gemini/2026_biz-corporates_au_full.csv"
        ),
    ]
    catalogs = [Path(x) for x in (args.catalogs or defaults)]
    idx = load_catalog_index(catalogs)
    print(f"Loaded sku index rows: {len(idx)} distinct style/size/col mappings.", flush=True)

    medusa_paths = [Path(p) for p in args.medusa]
    updated, unresolved = update_medusa_csv(
        medusa_paths,
        idx,
        also_barcode=args.also_barcode,
        dry_run=args.dry_run,
    )
    print(f"Dry-run={args.dry_run} updated_candidates={updated} unresolved_variant_rows≈{unresolved}")
    sys.exit(0)


if __name__ == "__main__":
    main()

