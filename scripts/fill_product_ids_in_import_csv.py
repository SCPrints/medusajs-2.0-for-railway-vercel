#!/usr/bin/env python3
"""
Fill the "Product Id" column in a Medusa product-import CSV using existing products'
ids from the Admin API (same auth as rewrite_csv_image_urls_via_medusa_upload.py).

Handles with no Product Id are treated as creates; if the handle already exists,
import fails with "already exists". Rows with an empty Product Handle (variant
continuation rows) reuse the last non-empty handle's product id.

  .venv-upload/bin/python scripts/fill_product_ids_in_import_csv.py \\
    --env-file medusa-upload.env \\
    --input syzmik_medusa_import_medusa_files.csv \\
    --output syzmik_medusa_import_medusa_files.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import ssl
import sys
import urllib.error
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
    try:
        with urllib.request.urlopen(req, **kwargs) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:600]
        print(
            f"HTTP {e.code} from Admin API. Response (truncated): {body}",
            file=sys.stderr,
        )
        if e.code == 401:
            print(
                "Admin auth failed. Set a fresh MEDUSA_ADMIN_TOKEN from Admin Settings → Users / API,"
                "\nor refresh MEDUSA_ADMIN_COOKIE from a logged-in Admin session,"
                '\nor run scripts/fill_product_ids_from_store_api.py with NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY.',
                file=sys.stderr,
            )
        raise


def _fetch_handle_to_id(
    base_url: str,
    headers: dict[str, str],
    ctx: ssl.SSLContext,
    wanted: set[str],
) -> dict[str, str]:
    """Paginate GET /admin/products until all wanted handles are resolved or list ends."""
    out: dict[str, str] = {}
    offset = 0
    limit = 100
    fields = "id,handle"
    while True:
        q = urllib.parse.urlencode(
            {"limit": limit, "offset": offset, "fields": fields}
        )
        url = f"{base_url}/admin/products?{q}"
        data = _get_json(url, headers, ctx)
        products = data.get("products") or []
        for p in products:
            hid = (p.get("id") or "").strip()
            h = (p.get("handle") or "").strip()
            if h in wanted and hid:
                out[h] = hid
        if len(out) >= len(wanted):
            break
        if len(products) < limit:
            break
        offset += limit
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=None)
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

    handle_key = next(
        (h for h in fieldnames if h.lower().strip() == "product handle"),
        None,
    )
    id_key = next(
        (h for h in fieldnames if h.lower().strip() == "product id"),
        None,
    )
    if not handle_key or not id_key:
        print("CSV must include Product Handle and Product Id columns", file=sys.stderr)
        sys.exit(1)

    wanted: set[str] = set()
    for row in rows:
        h = (row.get(handle_key) or "").strip()
        if h:
            wanted.add(h)

    print(f"Resolving ids for {len(wanted)} product handles…", flush=True)
    handle_to_id = _fetch_handle_to_id(base, headers, ctx, wanted)
    print(f"Found {len(handle_to_id)} existing products in Medusa.", flush=True)

    missing = wanted - set(handle_to_id.keys())
    if missing:
        print(
            f"Warning: {len(missing)} handles not in API yet (will stay create-only): "
            f"e.g. {', '.join(sorted(missing)[:5])}{'…' if len(missing) > 5 else ''}",
            file=sys.stderr,
        )

    updated = 0
    last_handle = ""
    for row in rows:
        h = (row.get(handle_key) or "").strip()
        if h:
            last_handle = h

        hid = ""
        if h and h in handle_to_id:
            hid = handle_to_id[h]
        elif last_handle and last_handle in handle_to_id:
            hid = handle_to_id[last_handle]

        if hid:
            if (row.get(id_key) or "").strip() != hid:
                updated += 1
            row[id_key] = hid

    with out_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    print(f"Wrote {out_path} (filled Product Id on {updated} row occurrences).")


if __name__ == "__main__":
    main()
