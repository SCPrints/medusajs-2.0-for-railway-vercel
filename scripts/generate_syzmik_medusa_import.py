#!/usr/bin/env python3
"""
Build Medusa product-import CSV rows from Syzmik AU full export + optional local image tree.

Medusa's CSV importer stores image URL strings as-is (it does not re-host remote URLs
through the file module). This generator fills CDN URLs so imports work out of the box;
to store assets via the same path as the admin UI (MinIO/local file provider), run
`scripts/rewrite_csv_image_urls_via_medusa_upload.py` on the CSV before importing.
Local Syzmik folder cross-check is for validation + `syzmik_local_image_manifest.csv`.
"""

from __future__ import annotations

import argparse
import csv
import re
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


def slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "product"


def clean(v: str | None) -> str:
    return (v or "").strip()


def title_case_colour(v: str) -> str:
    v = clean(v)
    if not v:
        return v
    parts = [p.strip() for p in v.split("/")]
    return "/".join(" ".join(w.capitalize() for w in p.split()) for p in parts)


def extract_fabric(stringified: str) -> str:
    s = clean(stringified)
    if "Fabric:" not in s:
        return ""
    rest = s.split("Fabric:", 1)[1]
    return clean(rest.split(";", 1)[0])


def format_aud_price(raw: str) -> str:
    try:
        d = Decimal(clean(raw))
    except Exception:
        d = Decimal("0")
    return str(d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def first_category_tag(category: str) -> str:
    c = clean(category)
    if not c:
        return ""
    return clean(c.split(";", 1)[0])


def normalize_image_basename(filename: str) -> str:
    """
    Map CDN-style names to local folder names: _aTalent_/ _bProduct_ and trailing hash tokens.
    Example: ZA018_aTalent_Black_01_4T6RvoN.jpg -> za018_talent_black_01.jpg
    """
    base = Path(clean(filename)).name.lower()
    if not base:
        return ""
    m = re.match(r"^(.+)_([a-z0-9]{6,})\.(jpe?g|png|webp)$", base)
    if m:
        base = f"{m.group(1)}.{m.group(3)}"
    base = base.replace("_atalent_", "_talent_")
    base = base.replace("_bproduct_", "_product_")
    return base


def build_local_image_index(image_root: Path) -> dict[str, dict[str, str]]:
    """style_folder_name -> normalized basename -> absolute path string."""
    by_style: dict[str, dict[str, str]] = defaultdict(dict)
    if not image_root.is_dir():
        return by_style
    exts = {".jpg", ".jpeg", ".png", ".webp"}
    for p in image_root.rglob("*"):
        if not p.is_file() or p.suffix.lower() not in exts:
            continue
        style_key = p.parent.name.strip().upper()
        norm = normalize_image_basename(p.name)
        if norm:
            by_style[style_key][norm] = str(p.resolve())
        by_style[style_key][p.name.lower()] = str(p.resolve())
    return by_style


def resolve_local_path(
    by_style: dict[str, dict[str, str]], style_code: str, filename: str
) -> str:
    if not clean(filename):
        return ""
    key = clean(style_code).upper()
    m = by_style.get(key, {})
    fn_lower = clean(filename).lower()
    if fn_lower in m:
        return m[fn_lower]
    norm = normalize_image_basename(filename)
    return m.get(norm, "")


def load_template_headers(template_csv: Path) -> list[str]:
    with template_csv.open("r", encoding="utf-8-sig", newline="") as f:
        return next(csv.reader(f))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--csv",
        type=Path,
        default=Path("/Users/seanmudie/Downloads/2026_syzmik_au_full.csv"),
    )
    parser.add_argument(
        "--images",
        type=Path,
        default=Path("/Users/seanmudie/Downloads/Syzmik"),
    )
    parser.add_argument(
        "--template",
        type=Path,
        default=Path(
            "/Users/seanmudie/Documents/GitHub/medusajs-2.0-for-railway-vercel/as_colour_medusa_import.csv"
        ),
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path(
            "/Users/seanmudie/Documents/GitHub/medusajs-2.0-for-railway-vercel"
        ),
    )
    parser.add_argument(
        "--sales-channel",
        default="sc_01KP7ZJ51Y7PMZ5NA7NA8BAK5C",
        help="Product Sales Channel 1 id",
    )
    parser.add_argument("--chunk-size", type=int, default=2000)
    args = parser.parse_args()

    headers = load_template_headers(args.template)
    by_style_local = build_local_image_index(args.images)

    styles: dict[str, list[dict[str, str]]] = defaultdict(list)
    seen_sku: set[str] = set()

    with args.csv.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            sku = clean(row.get("sku"))
            style_code = clean(row.get("style_code"))
            if not sku or not style_code or sku in seen_sku:
                continue
            seen_sku.add(sku)
            styles[style_code].append(row)

    rows_out: list[dict[str, str]] = []
    manifest_rows: list[dict[str, str]] = []

    for style_code in sorted(styles.keys(), key=lambda x: (len(x), x)):
        variants = styles[style_code]
        first = variants[0]
        style_name = clean(first.get("style_name"))
        product_title = f"Syzmik {style_name} {style_code}".strip()
        handle = slugify(product_title)
        description = clean(first.get("stringified_description")) or clean(
            first.get("description")
        )
        material = extract_fabric(clean(first.get("stringified_description")))
        tag1 = first_category_tag(clean(first.get("category")))

        sorted_variants = sorted(
            variants,
            key=lambda r: (
                clean(r.get("colour")),
                clean(r.get("size")),
                clean(r.get("sku")),
            ),
        )

        for rank, v in enumerate(sorted_variants):
            colour_disp = title_case_colour(v.get("colour") or "")
            size_val = clean(v.get("size"))
            sku = clean(v.get("sku"))
            variant_title = (
                f"{size_val} / {colour_disp}"
                if size_val and colour_disp
                else (size_val or colour_disp or sku)
            )

            front_fn = clean(v.get("front_color_image"))
            back_fn = clean(v.get("back_color_image"))
            img1 = clean(v.get("front_color_image_url")) or clean(v.get("image_url"))
            img2 = clean(v.get("back_color_image_url"))
            if img2 and img2 == img1:
                img2 = ""

            local_front = resolve_local_path(by_style_local, style_code, front_fn)
            local_back = resolve_local_path(by_style_local, style_code, back_fn)

            manifest_rows.append(
                {
                    "sku": sku,
                    "style_code": style_code,
                    "colour": colour_disp,
                    "size": size_val,
                    "front_filename": front_fn,
                    "back_filename": back_fn,
                    "local_front": local_front,
                    "local_back": local_back,
                    "cdn_front": img1,
                    "cdn_back": img2,
                }
            )

            row_out = {h: "" for h in headers}
            row_out["Product Handle"] = handle
            row_out["Product Title"] = product_title
            row_out["Product Description"] = description
            row_out["Product Status"] = "published"
            row_out["Product Thumbnail"] = img1
            row_out["Product Material"] = material
            row_out["Product Discountable"] = "true"
            row_out["Product Is Giftcard"] = "false"
            row_out["Product Tag 1"] = tag1
            row_out["Product Sales Channel 1"] = args.sales_channel
            if "Product Image 1" in row_out:
                row_out["Product Image 1"] = img1
            if "Product Image 2" in row_out and img2:
                row_out["Product Image 2"] = img2

            row_out["Variant Title"] = variant_title
            row_out["Variant Sku"] = sku
            row_out["Variant Manage Inventory"] = "true"
            row_out["Variant Allow Backorder"] = "false"
            row_out["Variant Option 1 Name"] = "Size"
            row_out["Variant Option 1 Value"] = size_val
            row_out["Variant Option 2 Name"] = "Colour"
            row_out["Variant Option 2 Value"] = colour_disp
            row_out["Variant Price AUD"] = format_aud_price(clean(v.get("price1")))
            row_out["Variant Barcode"] = sku
            row_out["Variant Variant Rank"] = str(rank)

            rows_out.append(row_out)

    out_main = args.out_dir / "syzmik_medusa_import.csv"
    args.out_dir.mkdir(parents=True, exist_ok=True)

    with out_main.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows_out)

    manifest_path = args.out_dir / "syzmik_local_image_manifest.csv"
    if manifest_rows:
        m_fields = list(manifest_rows[0].keys())
        with manifest_path.open("w", encoding="utf-8", newline="") as mf:
            mw = csv.DictWriter(mf, fieldnames=m_fields)
            mw.writeheader()
            mw.writerows(manifest_rows)

    missing_front = sum(1 for r in manifest_rows if r["front_filename"] and not r["local_front"])
    missing_back = sum(1 for r in manifest_rows if r["back_filename"] and not r["local_back"])

    chunk_size = max(1, int(args.chunk_size))
    chunks = [rows_out[i : i + chunk_size] for i in range(0, len(rows_out), chunk_size)]
    for idx, chunk in enumerate(chunks, start=1):
        part_path = args.out_dir / f"syzmik_medusa_import_part_{idx:02d}.csv"
        with part_path.open("w", encoding="utf-8", newline="") as pf:
            pw = csv.DictWriter(pf, fieldnames=headers, extrasaction="ignore")
            pw.writeheader()
            pw.writerows(chunk)

    print(f"Wrote: {out_main} ({len(rows_out)} variants)")
    print(f"Products (styles): {len(styles)}")
    print(f"Manifest: {manifest_path}")
    print(f"Local front missing (filename in CSV but not in folder): {missing_front}")
    print(f"Local back missing: {missing_back}")
    print(f"Chunk files: {len(chunks)} (size {chunk_size})")


if __name__ == "__main__":
    main()
