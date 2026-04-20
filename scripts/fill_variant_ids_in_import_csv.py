#!/usr/bin/env python3
"""
Fill "Variant Id" for rows that already have Product Id, using GET /admin/products/:id.

When a product-import CSV updates existing products, rows without Variant Id can be treated
as new variants; if SKUs already exist, the import fails. This script maps Variant Sku →
variant id from the API.

Auth/env matches fill_product_ids_in_import_csv.py and rewrite_csv_image_urls_via_medusa_upload.py.

  .venv-upload/bin/python scripts/fill_variant_ids_in_import_csv.py \\
    --env-file medusa-upload.env \\
    --input syzmik_medusa_import_medusa_files.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import ssl
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path


def _load_env_file(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, rest = line.partition("=")
        key = key.strip()
        val = rest.strip()
        if (val.startswith('"') and val.endswith('"')) or (
            val.startswith("'") and val.endswith("'")
        ):
            val = val[1:-1]
        if key and key not in os.environ:
            os.environ[key] = val


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi  # type: ignore[import-untyped]

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def _admin_headers() -> dict[str, str]:
    token = (os.environ.get("MEDUSA_ADMIN_TOKEN") or "").strip()
    cookie = (os.environ.get("MEDUSA_ADMIN_COOKIE") or "").strip()
    if not token and not cookie:
        print("Set MEDUSA_ADMIN_TOKEN and/or MEDUSA_ADMIN_COOKIE", file=sys.stderr)
        sys.exit(1)
    h: dict[str, str] = {"Accept": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    if cookie:
        h["Cookie"] = cookie
    return h


def _get_json(url: str, headers: dict[str, str], ctx: ssl.SSLContext) -> dict:
    req = urllib.request.Request(url, headers=headers)
    kwargs: dict = {"timeout": 120}
    if url.lower().startswith("https://"):
        kwargs["context"] = ctx
    with urllib.request.urlopen(req, **kwargs) as resp:
        return json.loads(resp.read().decode())


def _sku_to_variant_id(
    base_url: str,
    headers: dict[str, str],
    ctx: ssl.SSLContext,
    product_id: str,
) -> dict[str, str]:
    q = urllib.parse.urlencode({"fields": "id,variants.id,variants.sku"})
    url = f"{base_url}/admin/products/{product_id}?{q}"
    data = _get_json(url, headers, ctx)
    product = data.get("product") or {}
    out: dict[str, str] = {}
    for v in product.get("variants") or []:
        sku = (v.get("sku") or "").strip()
        vid = (v.get("id") or "").strip()
        if sku and vid:
            out[sku] = vid
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--sleep", type=float, default=0.05)
    args = parser.parse_args()

    if not args.env_file.is_file():
        print(f"Not found: {args.env_file}", file=sys.stderr)
        sys.exit(1)

    _load_env_file(args.env_file)
    base = (os.environ.get("MEDUSA_BACKEND_URL") or "").strip().rstrip("/")
    if not base:
        print("MEDUSA_BACKEND_URL required", file=sys.stderr)
        sys.exit(1)

    out_path = args.output or args.input
    headers = _admin_headers()
    ctx = _ssl_context()

    with args.input.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            sys.exit("CSV has no header")
        fieldnames = list(reader.fieldnames)
        rows = list(reader)

    pid_key = next(
        (h for h in fieldnames if h.lower().strip() == "product id"), None
    )
    vid_key = next(
        (h for h in fieldnames if h.lower().strip() == "variant id"), None
    )
    sku_key = next(
        (h for h in fieldnames if h.lower().strip() == "variant sku"), None
    )
    if not pid_key or not vid_key or not sku_key:
        print("CSV needs Product Id, Variant Id, and Variant Sku columns", file=sys.stderr)
        sys.exit(1)

    product_ids = sorted({(r.get(pid_key) or "").strip() for r in rows if (r.get(pid_key) or "").strip()})
    print(f"Fetching variants for {len(product_ids)} products…", flush=True)

    cache: dict[str, dict[str, str]] = {}
    for i, pid in enumerate(product_ids):
        try:
            cache[pid] = _sku_to_variant_id(base, headers, ctx, pid)
        except Exception as e:
            print(f"Warning: {pid}: {e}", file=sys.stderr)
            cache[pid] = {}
        if args.sleep > 0:
            time.sleep(args.sleep)
        if (i + 1) % 50 == 0:
            print(f"  …{i + 1}/{len(product_ids)}", flush=True)

    filled = 0
    missing = 0
    for row in rows:
        pid = (row.get(pid_key) or "").strip()
        sku = (row.get(sku_key) or "").strip()
        if not pid or not sku:
            continue
        m = cache.get(pid) or {}
        vid = m.get(sku)
        if vid:
            row[vid_key] = vid
            filled += 1
        else:
            missing += 1

    with out_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    print(f"Wrote {out_path}: set Variant Id on {filled} rows; no API match for {missing} rows.")


if __name__ == "__main__":
    main()
