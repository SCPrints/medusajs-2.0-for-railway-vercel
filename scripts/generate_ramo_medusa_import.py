#!/usr/bin/env python3
"""
Build Medusa product-import CSV rows from Ramo export data.

Usage:
  python3 scripts/generate_ramo_medusa_import.py \
    --csv Export_Core_2026-02-19.csv \
    --template as_colour_medusa_import.csv \
    --out-dir .
"""

from __future__ import annotations

import argparse
import csv
import html
import re
import unicodedata
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


def clean(v: str | None) -> str:
    return (v or "").strip()


def slugify(value: str) -> str:
    value = clean(value).lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "product"


_CTRL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_UNICODE_LINE_SEP = re.compile(r"[\u2028\u2029]")
_UNICODE_TRANS = str.maketrans(
    {
        "\u2013": "-",
        "\u2014": "-",
        "\u2212": "-",
        "\u00a0": " ",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\ufeff": "",
    }
)


def sanitize_cell(v: str | None) -> str:
    s = clean(v)
    if not s:
        return ""
    s = s.translate(_UNICODE_TRANS)
    # Normalize then force ASCII to avoid backend/file-provider encoding edge cases.
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = _UNICODE_LINE_SEP.sub(" ", s)
    s = s.replace("\r\n", " ").replace("\n", " ").replace("\r", " ")
    s = _CTRL_CHARS.sub(" ", s)
    s = re.sub(r" +", " ", s).strip()
    return s


def format_price(raw: str) -> str:
    try:
        value = Decimal(clean(raw))
    except Exception:
        value = Decimal("0")
    return str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def title_case_colour(v: str) -> str:
    s = clean(v)
    if not s:
        return ""
    parts = [p.strip() for p in s.split("/")]
    return "/".join(" ".join(w.capitalize() for w in p.split()) for p in parts)


def html_to_text(raw_html: str) -> str:
    if not raw_html:
        return ""
    no_tags = re.sub(r"<[^>]+>", " ", raw_html)
    decoded = html.unescape(no_tags)
    return re.sub(r"\s+", " ", decoded).strip()


def pick_first_non_empty(*values: str) -> str:
    for value in values:
        if clean(value):
            return clean(value)
    return ""


def load_template_headers(template_csv: Path) -> list[str]:
    with template_csv.open("r", encoding="utf-8-sig", newline="") as f:
        return next(csv.reader(f))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=Path, default=Path("Export_Core_2026-02-19.csv"))
    parser.add_argument("--template", type=Path, default=Path("as_colour_medusa_import.csv"))
    parser.add_argument("--out-dir", type=Path, default=Path("."))
    parser.add_argument("--sales-channel", default="sc_01KP7ZJ51Y7PMZ5NA7NA8BAK5C")
    parser.add_argument("--chunk-size", type=int, default=2000)
    args = parser.parse_args()

    if not args.csv.is_file():
        raise SystemExit(f"CSV not found: {args.csv}")
    if not args.template.is_file():
        raise SystemExit(f"Template not found: {args.template}")

    headers = load_template_headers(args.template)
    styles: dict[str, list[dict[str, str]]] = defaultdict(list)
    seen_variant_ids: set[str] = set()

    with args.csv.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            parent_code = clean(row.get("parent_code"))
            variant_id = clean(row.get("product_id"))
            if not parent_code or not variant_id or variant_id in seen_variant_ids:
                continue
            seen_variant_ids.add(variant_id)
            styles[parent_code].append(row)

    rows_out: list[dict[str, str]] = []

    for parent_code in sorted(styles.keys(), key=lambda x: (len(x), x)):
        variants = styles[parent_code]
        first = variants[0]

        product_name = clean(first.get("name"))
        handle = slugify(f"ramo-{product_name}-{parent_code}")
        title = f"Ramo {product_name}".strip()
        subtitle = clean(first.get("primary_category"))
        description = html_to_text(clean(first.get("long_description")))
        thumbnail = pick_first_non_empty(
            clean(first.get("product_image_hero_url")),
            clean(first.get("product_image_url")),
        )
        image_1 = thumbnail

        sorted_variants = sorted(
            variants,
            key=lambda r: (
                title_case_colour(clean(r.get("attribute_colours"))),
                clean(r.get("attribute_size")),
                clean(r.get("product_id")),
            ),
        )

        combo_counts: dict[tuple[str, str], int] = defaultdict(int)
        for v in sorted_variants:
            combo_counts[
                (
                    clean(v.get("attribute_size")),
                    title_case_colour(clean(v.get("attribute_colours"))),
                )
            ] += 1
        need_item_option = any(count > 1 for count in combo_counts.values())

        for rank, v in enumerate(sorted_variants):
            size = clean(v.get("attribute_size")) or "One Size"
            colour = title_case_colour(clean(v.get("attribute_colours"))) or "Default"
            sku = clean(v.get("product_id"))
            variant_title = f"{size} / {colour}"

            variant_image = pick_first_non_empty(
                clean(v.get("product_image_url")),
                clean(v.get("product_image_hero_url")),
                image_1,
            )
            alt_image = pick_first_non_empty(clean(v.get("product_image_hero_url")), image_1)
            if alt_image == variant_image:
                alt_image = ""

            row_out = {h: "" for h in headers}
            row_out["Product Handle"] = handle
            row_out["Product Title"] = title
            row_out["Product Subtitle"] = subtitle
            row_out["Product Description"] = description
            row_out["Product Status"] = "published"
            row_out["Product Thumbnail"] = variant_image
            row_out["Product Discountable"] = "true"
            row_out["Product Is Giftcard"] = "false"
            row_out["Product Sales Channel 1"] = args.sales_channel
            row_out["Product Image 1"] = variant_image
            if alt_image:
                row_out["Product Image 2"] = alt_image

            row_out["Variant Title"] = variant_title
            row_out["Variant Sku"] = sku
            row_out["Variant Barcode"] = sku
            row_out["Variant Manage Inventory"] = "true"
            row_out["Variant Allow Backorder"] = "false"
            row_out["Variant Option 1 Name"] = "Size"
            row_out["Variant Option 1 Value"] = size
            row_out["Variant Option 2 Name"] = "Colour"
            row_out["Variant Option 2 Value"] = colour
            if need_item_option and "Variant Option 3 Name" in row_out:
                row_out["Variant Option 3 Name"] = "Item code"
                row_out["Variant Option 3 Value"] = sku
            row_out["Variant Price AUD"] = format_price(clean(v.get("price_ex_gst")))
            row_out["Variant Variant Rank"] = str(rank)

            for key, value in row_out.items():
                if value:
                    row_out[key] = sanitize_cell(value)

            rows_out.append(row_out)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    out_main = args.out_dir / "ramo_medusa_import.csv"
    with out_main.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows_out)

    chunk_size = max(1, int(args.chunk_size))
    chunks = [rows_out[i : i + chunk_size] for i in range(0, len(rows_out), chunk_size)]
    for idx, chunk in enumerate(chunks, start=1):
        chunk_path = args.out_dir / f"ramo_medusa_import_part_{idx:02d}.csv"
        with chunk_path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(chunk)

    print(f"Wrote: {out_main} ({len(rows_out)} variants)")
    print(f"Products (parent_code groups): {len(styles)}")
    print(f"Chunk files: {len(chunks)} (size {chunk_size})")


if __name__ == "__main__":
    main()
