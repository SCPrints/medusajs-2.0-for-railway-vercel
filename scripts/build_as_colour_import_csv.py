#!/usr/bin/env python3
"""
Merge AS Colour supplier files into a Medusa spreadsheet-sync import CSV.

Inputs:
  --stock   StockItems-V1 (1).csv      (one row per SKU: stockCode, styleCode, sizeCode, colour, ...)
  --gold    gold_9286 (11).csv         (one row per STYLECODE: our trade cost)
  --types   product-types (2).csv      (type_id,type_name)
  --tags    product-tags (3).csv       (tag_id,tag_name)
  --out     output CSV path

Pricing (AUD, GST-inclusive — store sells inc-GST):
  cost     = gold PRICE for the styleCode
  100+     = cost * 1.10 * 1.5         (= cost * 1.65, the 25%-off floor)
  standard = 100+ / 0.75               (= cost * 2.20)
  10-19    = standard * 0.90
  20-49    = standard * 0.85
  50-99    = standard * 0.80
  base     = standard (covers Medusa qty 1-9)
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

PRODUCT_IMPORT_TEMPLATE_COLUMNS = [
    "Product Id",
    "Product Handle",
    "Product Title",
    "Product Subtitle",
    "Product Description",
    "Product Status",
    "Product Thumbnail",
    "Product Weight",
    "Product Length",
    "Product Width",
    "Product Height",
    "Product HS Code",
    "Product Origin Country",
    "Product MID Code",
    "Product Material",
    "Shipping Profile Id",
    "Product Sales Channel 1",
    "Product Collection Id",
    "Product Type Id",
    "Product Tag 1",
    "Product Discountable",
    "Product External Id",
    "Variant Id",
    "Variant Title",
    "Variant SKU",
    "Variant Barcode",
    "Variant Allow Backorder",
    "Variant Manage Inventory",
    "Variant Weight",
    "Variant Length",
    "Variant Width",
    "Variant Height",
    "Variant HS Code",
    "Variant Origin Country",
    "Variant MID Code",
    "Variant Material",
    "Variant Price EUR",
    "Variant Price USD",
    "Variant Option 1 Name",
    "Variant Option 1 Value",
    "Product Image 1 Url",
    "Product Image 2 Url",
]

PRODUCT_IMPORT_SUPPLEMENTAL_COLUMNS = [
    "Product Collection Title",
    "Product Type Value",
    "Product Sales Channel 1 Id",
    "Product Tag 1 Id",
    "Variant Price AUD",
    "BASE_SALE_PRICE",
    "TIER_10_TO_19_PRICE",
    "TIER_20_TO_49_PRICE",
    "TIER_50_TO_99_PRICE",
    "TIER_100_PLUS_PRICE",
    "TIER_10_TO_49_PRICE",
    "Variant Bulk Pricing JSON",
]

EXTRA_OPTION_COLUMNS = ["Variant Option 2 Name", "Variant Option 2 Value"]

OUTPUT_HEADERS = (
    PRODUCT_IMPORT_TEMPLATE_COLUMNS
    + PRODUCT_IMPORT_SUPPLEMENTAL_COLUMNS
    + EXTRA_OPTION_COLUMNS
)

OTHER_TYPE_FALLBACK = "Other"


def slug_handle(stylecode: str) -> str:
    s = (stylecode or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"^-+|-+$", "", s)
    return f"as-colour-{s}" if s else "as-colour-product"


def round2(n: float) -> str:
    return f"{n:.2f}"


def load_id_map(path: Path, id_col: str, name_col: str) -> dict[str, str]:
    out: dict[str, str] = {}
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = (row.get(name_col) or "").strip()
            ident = (row.get(id_col) or "").strip()
            if not name or not ident:
                continue
            key = name.lower()
            # First-write wins (types CSV has duplicates — singular vs plural; canonical plural appears first per file order)
            out.setdefault(key, ident)
    return out


def parse_money(s: str) -> float | None:
    if not s:
        return None
    s = s.strip().replace("$", "").replace(",", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stock", required=True)
    ap.add_argument("--gold", required=True)
    ap.add_argument("--types", required=True)
    ap.add_argument("--tags", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument(
        "--base-multiplier",
        type=float,
        default=2.20,
        help="Multiplier on cost for BASE_SALE_PRICE (default 2.20 = standard, 0%% off).",
    )
    args = ap.parse_args()

    stock_path = Path(args.stock)
    gold_path = Path(args.gold)
    types_path = Path(args.types)
    tags_path = Path(args.tags)
    out_path = Path(args.out)

    type_id_by_name = load_id_map(types_path, "type_id", "type_name")
    tag_id_by_name = load_id_map(tags_path, "tag_id", "tag_name")

    # Cost lookup: STYLECODE -> (price, category, product_name, composition, fabric, short_desc, box_qty)
    gold_by_style: dict[str, dict[str, str]] = {}
    with gold_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            sc = (row.get("STYLECODE") or "").strip()
            if not sc:
                continue
            gold_by_style[sc.upper()] = row

    # Group stock rows by styleCode
    stock_by_style: dict[str, list[dict[str, str]]] = defaultdict(list)
    with stock_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            sc = (row.get("styleCode") or "").strip()
            if not sc:
                continue
            stock_by_style[sc.upper()].append(row)

    missing_cost: list[str] = []
    missing_type: dict[str, int] = defaultdict(int)
    missing_tag: dict[str, int] = defaultdict(int)
    size_price_warnings: list[str] = []
    rows_out: list[dict[str, str]] = []
    n_styles = 0
    n_variants = 0

    for style, group in stock_by_style.items():
        n_styles += 1
        first = group[0]
        gold = gold_by_style.get(style)
        cost = parse_money((gold or {}).get("PRICE", ""))
        if cost is None:
            missing_cost.append(style)

        # Defensive: warn if priceExTax differs across sizes within this style
        prices = {(r.get("priceExTax") or "").strip() for r in group}
        prices.discard("")
        if len(prices) > 1:
            size_price_warnings.append(f"{style}: priceExTax varies → {sorted(prices)}")

        title = (first.get("styleName") or first.get("name") or style).strip()
        handle = slug_handle(style)
        description = (first.get("description") or "").strip()
        short_desc = (first.get("shortDescription") or "").strip()
        if not description:
            description = short_desc
            short_desc = ""
        if short_desc and short_desc == description:
            short_desc = ""

        # Type
        product_type_raw = (first.get("productType") or "").strip()
        product_type_label = product_type_raw or OTHER_TYPE_FALLBACK
        type_id = type_id_by_name.get(product_type_label.lower())
        if not type_id:
            missing_type[product_type_label] += 1
            type_id = type_id_by_name.get(OTHER_TYPE_FALLBACK.lower(), "")
            type_value = OTHER_TYPE_FALLBACK if type_id else ""
        else:
            type_value = product_type_label

        # Tag = type label (singular tag — Medusa template only has Tag 1)
        tag_name = type_value
        tag_id = tag_id_by_name.get(tag_name.lower(), "")
        if tag_name and not tag_id:
            missing_tag[tag_name] += 1

        # Image — prefer standard, fall back to zoom; secondary = back if present
        img1 = (
            (first.get("imageURL_standard") or "").strip()
            or (first.get("imageURL_zoom") or "").strip()
            or (first.get("imageFrontURL") or "").strip()
        )
        img2 = (first.get("imageBackURL") or "").strip() or (
            first.get("imageSideURL") or ""
        ).strip()
        if img2 == img1:
            img2 = ""

        material = (first.get("composition") or "").strip()
        hs_code = (first.get("hsCode") or "").strip()
        origin = (first.get("countryOfOrigin") or "").strip()

        # Detect option dimensions (if all sizes are "One Size" and there's only one colour, drop options)
        all_sizes = {(r.get("sizeCode") or "").strip() for r in group}
        all_colours = {(r.get("colour") or "").strip() for r in group}
        has_size = len(all_sizes - {"", "One Size"}) > 0
        has_colour = len(all_colours - {""}) > 0

        # Pricing
        if cost is None:
            base_price = ""
            t10 = t20 = t50 = t100 = ""
            tier_10_49_legacy = ""
        else:
            t100_val = cost * 1.10 * 1.5  # cost * 1.65
            standard = t100_val / 0.75  # = cost * 2.20
            base_val = standard * args.base_multiplier / 2.20  # respect override
            t10_val = standard * 0.90
            t20_val = standard * 0.85
            t50_val = standard * 0.80
            base_price = round2(base_val)
            t10 = round2(t10_val)
            t20 = round2(t20_val)
            t50 = round2(t50_val)
            t100 = round2(t100_val)
            tier_10_49_legacy = ""  # explicit split columns supersede legacy

        for r in group:
            n_variants += 1
            sku = (r.get("stockCode") or "").strip()
            size = (r.get("sizeCode") or "").strip()
            colour = (r.get("colour") or "").strip()
            barcode = (r.get("GTIN12") or "").strip()
            variant_title_parts = []
            if has_size and size:
                variant_title_parts.append(size)
            if has_colour and colour:
                variant_title_parts.append(colour)
            variant_title = " / ".join(variant_title_parts) or sku

            opt1_name = "Size" if has_size else ("Colour" if has_colour else "")
            opt1_value = size if has_size else (colour if has_colour else "")
            opt2_name = "Colour" if (has_size and has_colour) else ""
            opt2_value = colour if (has_size and has_colour) else ""

            row_out: dict[str, str] = {h: "" for h in OUTPUT_HEADERS}
            row_out["Product Handle"] = handle
            row_out["Product Title"] = title
            row_out["Product Subtitle"] = short_desc
            row_out["Product Description"] = description
            row_out["Product Status"] = "published"
            row_out["Product Thumbnail"] = img1
            row_out["Product Image 1 Url"] = img1
            row_out["Product Image 2 Url"] = img2
            row_out["Product HS Code"] = hs_code
            row_out["Product Origin Country"] = origin
            row_out["Product Material"] = material
            row_out["Product Type Id"] = type_id
            row_out["Product Type Value"] = type_value
            row_out["Product Discountable"] = "TRUE"
            if tag_id:
                row_out["Product Tag 1"] = tag_name
                row_out["Product Tag 1 Id"] = tag_id

            row_out["Variant SKU"] = sku
            row_out["Variant Title"] = variant_title
            row_out["Variant Barcode"] = barcode
            row_out["Variant Manage Inventory"] = "FALSE"
            row_out["Variant Allow Backorder"] = "TRUE"
            row_out["Variant Option 1 Name"] = opt1_name
            row_out["Variant Option 1 Value"] = opt1_value
            row_out["Variant Option 2 Name"] = opt2_name
            row_out["Variant Option 2 Value"] = opt2_value

            if base_price:
                row_out["Variant Price AUD"] = base_price
                row_out["BASE_SALE_PRICE"] = base_price
                row_out["TIER_10_TO_19_PRICE"] = t10
                row_out["TIER_20_TO_49_PRICE"] = t20
                row_out["TIER_50_TO_99_PRICE"] = t50
                row_out["TIER_100_PLUS_PRICE"] = t100
                row_out["TIER_10_TO_49_PRICE"] = tier_10_49_legacy

            rows_out.append(row_out)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_HEADERS)
        writer.writeheader()
        writer.writerows(rows_out)

    print(f"Wrote {out_path}", file=sys.stderr)
    print(f"  styles:   {n_styles}", file=sys.stderr)
    print(f"  variants: {n_variants}", file=sys.stderr)
    print(f"  missing cost (styles not in gold): {len(missing_cost)}", file=sys.stderr)
    if missing_cost:
        print("    " + ", ".join(missing_cost[:20]) + ("..." if len(missing_cost) > 20 else ""), file=sys.stderr)
    if missing_type:
        print(f"  type-name not found in types CSV (used 'Other' fallback):", file=sys.stderr)
        for k, v in sorted(missing_type.items()):
            print(f"    {k!r}: {v} styles", file=sys.stderr)
    if missing_tag:
        print(f"  tag-name not found in tags CSV (left blank):", file=sys.stderr)
        for k, v in sorted(missing_tag.items()):
            print(f"    {k!r}: {v} styles", file=sys.stderr)
    if size_price_warnings:
        print(f"  size-price variance detected within these styles (no surcharge applied — confirm):", file=sys.stderr)
        for w in size_price_warnings:
            print(f"    {w}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
