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


def load_id_map(path: Path, id_col: str, name_col: str) -> tuple[dict[str, str], list[tuple[str, str]]]:
    """Return (lower→id map, ordered list of (display_name, id))."""
    out: dict[str, str] = {}
    ordered: list[tuple[str, str]] = []
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = (row.get(name_col) or "").strip()
            ident = (row.get(id_col) or "").strip()
            if not name or not ident:
                continue
            key = name.lower()
            if key not in out:
                out[key] = ident
                ordered.append((name, ident))
    return out, ordered


def _norm_tokens(s: str) -> list[str]:
    return [t for t in re.split(r"[^a-z0-9]+", s.lower()) if t]


def _depluralise(token: str) -> str:
    if len(token) > 3 and token.endswith("ies"):
        return token[:-3] + "y"
    # Only strip trailing 'es' when the stem ends in a hissing consonant (boxes, matches, churches);
    # otherwise the word is just `<stem-ending-in-e>` + plural-s (e.g. longsleeves → longsleeve).
    if len(token) > 3 and token.endswith("es"):
        stem = token[:-2]
        if stem.endswith(("s", "x", "z", "ch", "sh")):
            return stem
        if len(token) > 2:
            return token[:-1]
    if len(token) > 2 and token.endswith("s"):
        return token[:-1]
    return token


def _equivalent_token_sets(a: list[str], b: list[str]) -> bool:
    sa = {_depluralise(t) for t in a}
    sb = {_depluralise(t) for t in b}
    return sa == sb and bool(sa)


def smart_match(
    needle: str,
    lower_map: dict[str, str],
    ordered: list[tuple[str, str]],
) -> str | None:
    """Find the closest matching id for `needle` in the candidate list.

    Strategy (first hit wins):
      1. case-insensitive exact match
      2. singular↔plural normalisation (token-set equality after depluralising)
      3. token-subset: every depluralised token of `needle` appears in the candidate
         (so `Singlets / Tanks` matches `singlets`, `Longsleeves` matches `Long Sleeve`)
    """
    if not needle:
        return None
    nk = needle.lower().strip()
    if nk in lower_map:
        return lower_map[nk]

    needle_tokens = _norm_tokens(needle)
    if not needle_tokens:
        return None

    # 2. token-set equivalence (handles plural/singular)
    for cand_name, cand_id in ordered:
        if _equivalent_token_sets(needle_tokens, _norm_tokens(cand_name)):
            return cand_id

    # 2b. squashed form (handles `longsleeves` ↔ `long sleeve`)
    needle_squash = _depluralise("".join(needle_tokens))
    for cand_name, cand_id in ordered:
        cand_tokens = _norm_tokens(cand_name)
        if _depluralise("".join(cand_tokens)) == needle_squash and needle_squash:
            return cand_id

    # 3. token-subset in either direction (after depluralising)
    #    a) needle ⊆ candidate (e.g. `Polo` matches `Polo Shirt`)
    #    b) candidate ⊆ needle (e.g. `singlets` matches `Singlets / Tanks`)
    #    Single-token candidates (e.g. `cap`) are restricted to direction (a) to avoid
    #    accidentally matching unrelated multi-word needles.
    needle_depl = {_depluralise(t) for t in needle_tokens}
    best: tuple[int, int, str] | None = None  # (-priority, token_count, id) — lowest tuple wins
    for cand_name, cand_id in ordered:
        cand_depl = {_depluralise(t) for t in _norm_tokens(cand_name)}
        if not cand_depl:
            continue
        if needle_depl.issubset(cand_depl):
            # candidate covers all needle tokens — prefer the smallest such candidate
            score = (1, len(cand_depl), cand_id)
            if best is None or score < best:
                best = score
        elif len(cand_depl) >= 2 and cand_depl.issubset(needle_depl):
            # candidate is a multi-token subset of needle — prefer the largest such
            score = (2, -len(cand_depl), cand_id)
            if best is None or score < best:
                best = score
        elif len(cand_depl) == 1 and cand_depl.issubset(needle_depl):
            # single-token candidate must equal one of the needle tokens AND share
            # the squashed form to avoid accidental matches (e.g. `cap` ≠ `caps`)
            (only,) = cand_depl
            if only in needle_depl and len(only) >= 4:
                score = (3, 0, cand_id)
                if best is None or score < best:
                    best = score
    if best is not None:
        return best[2]

    return None


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
    ap.add_argument("--images", required=False, help="ProductImage-V1.csv (per-style images with is_thumbnail flag)")
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

    type_id_by_name, type_ordered = load_id_map(types_path, "type_id", "type_name")
    tag_id_by_name, tag_ordered = load_id_map(tags_path, "tag_id", "tag_name")

    # Per-style image overrides from ProductImage-V1.csv (one thumbnail + ordered gallery per style)
    image_thumb_by_style: dict[str, str] = {}
    image_secondary_by_style: dict[str, str] = {}
    if args.images:
        per_style: dict[str, list[dict[str, str]]] = defaultdict(list)
        with Path(args.images).open(newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                sc = (row.get("styleCode") or "").strip().upper()
                if sc:
                    per_style[sc].append(row)
        for sc, items in per_style.items():
            def _sort_key(r: dict[str, str]) -> int:
                try:
                    return int((r.get("sort_order") or "0").strip())
                except ValueError:
                    return 0
            items_sorted = sorted(items, key=_sort_key)
            thumb = next(
                (r for r in items_sorted if (r.get("is_thumbnail") or "").strip() == "1"),
                None,
            )
            thumb_url = (thumb.get("url_standard") or "").strip() if thumb else ""
            if not thumb_url:
                # Fall back to the first sorted image when no row is flagged
                thumb_url = (items_sorted[0].get("url_standard") or "").strip() if items_sorted else ""
            secondary_url = ""
            for r in items_sorted:
                u = (r.get("url_standard") or "").strip()
                if u and u != thumb_url:
                    secondary_url = u
                    break
            if thumb_url:
                image_thumb_by_style[sc] = thumb_url
            if secondary_url:
                image_secondary_by_style[sc] = secondary_url

    # Cost lookup: STYLECODE -> (price, category, product_name, composition, fabric, short_desc, box_qty)
    gold_by_style: dict[str, dict[str, str]] = {}
    with gold_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            sc = (row.get("STYLECODE") or "").strip()
            if not sc:
                continue
            gold_by_style[sc.upper()] = row

    # Group stock rows by styleCode, dedup by stockCode (source has ~20 duplicate SKU rows)
    stock_by_style: dict[str, list[dict[str, str]]] = defaultdict(list)
    seen_skus: set[str] = set()
    duplicate_sku_count = 0
    with stock_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            sc = (row.get("styleCode") or "").strip()
            if not sc:
                continue
            sku = (row.get("stockCode") or "").strip()
            if sku and sku in seen_skus:
                duplicate_sku_count += 1
                continue
            if sku:
                seen_skus.add(sku)
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
            continue  # drop styles with no cost per user request

        # Defensive: warn if priceExTax differs across sizes within this style
        prices = {(r.get("priceExTax") or "").strip() for r in group}
        prices.discard("")
        if len(prices) > 1:
            size_price_warnings.append(f"{style}: priceExTax varies → {sorted(prices)}")

        title = (first.get("styleName") or first.get("name") or style).strip()
        handle = slug_handle(style)
        description = (first.get("description") or "").strip()
        short_desc = (first.get("shortDescription") or "").strip()
        # The inch mark in titles like `Active Shorts 18"` is the human-readable issue,
        # so render it explicitly. Other quotes are sanitised in the final write step.
        title = title.replace('"', " inch")
        short_desc = short_desc.replace('"', " inch")
        if not description:
            description = short_desc
            short_desc = ""
        if short_desc and short_desc == description:
            short_desc = ""

        # Type — smart match (exact → plural/singular → token-subset), then 'Other' as last resort
        product_type_raw = (first.get("productType") or "").strip()
        type_id = smart_match(product_type_raw, type_id_by_name, type_ordered) if product_type_raw else None
        if type_id:
            # Recover the canonical display name from the live types file
            type_value = next((n for n, i in type_ordered if i == type_id), product_type_raw)
        else:
            missing_type[product_type_raw or "(blank)"] += 1
            other_id = type_id_by_name.get(OTHER_TYPE_FALLBACK.lower(), "")
            type_id = other_id
            type_value = OTHER_TYPE_FALLBACK if other_id else ""

        # Tag — same smart match, no 'Other' fallback. Search by the original stock label
        # (not by the falled-back type) so an unmatched type doesn't suppress a real tag match.
        tag_search = product_type_raw or type_value
        tag_id = smart_match(tag_search, tag_id_by_name, tag_ordered) if tag_search else None
        tag_name = ""
        if tag_id:
            tag_name = next((n for n, i in tag_ordered if i == tag_id), tag_search)
        elif tag_search:
            missing_tag[tag_search] += 1

        # Image — prefer the new ProductImage-V1.csv per-style data when supplied;
        # fall back to StockItems-V1 image fields if no override exists for this style.
        override_img1 = image_thumb_by_style.get(style)
        override_img2 = image_secondary_by_style.get(style)
        if override_img1:
            img1 = override_img1
            img2 = override_img2 or ""
        else:
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

    # Medusa importer's CSV parser mishandles escaped `""` inside quoted fields,
    # so strip all literal double-quotes from cell values (HTML/CSS still valid with single quotes).
    for r in rows_out:
        for k, v in r.items():
            if v and '"' in v:
                r[k] = v.replace('"', "'")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_HEADERS)
        writer.writeheader()
        writer.writerows(rows_out)

    print(f"Wrote {out_path}", file=sys.stderr)
    print(f"  styles:   {n_styles - len(missing_cost)} written, {len(missing_cost)} skipped (no cost)", file=sys.stderr)
    print(f"  variants: {n_variants}", file=sys.stderr)
    print(f"  duplicate stockCode rows skipped: {duplicate_sku_count}", file=sys.stderr)
    print(f"  missing cost (styles not in gold) — DROPPED: {len(missing_cost)}", file=sys.stderr)
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
