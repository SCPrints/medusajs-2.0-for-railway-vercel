#!/usr/bin/env python3
"""
Fill "Product Id" in a Medusa product-import CSV using the Store API (publishable key).

Use when Admin API auth fails (401) but products are published in the sales channel
scoped to your publishable key. Requires region_id — we pick the first /store/regions entry.

Load env (--store-env-file can repeat; merges in order):

  NEXT_PUBLIC_MEDUSA_BACKEND_URL  (or MEDUSA_BACKEND_URL)
  NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY (or MEDUSA_PUBLISHABLE_KEY)

Continuation rows with empty Product Handle reuse the last handle (same as other fillers).

Limitation: unpublished “draft” products are not visible on Store API.

  python3 scripts/fill_product_ids_from_store_api.py \\
    --store-env-file storefront/.env.local \\
    --input path/to/import.csv
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


def load_env(path: Path) -> None:
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
        if key:
            os.environ[key] = val


def ssl_ctx() -> ssl.SSLContext:
    try:
        import certifi  # type: ignore[import-untyped]

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def get_json(url: str, headers: dict[str, str]) -> dict:
    ctx = ssl_ctx()
    req = urllib.request.Request(url, headers=headers)
    kwargs: dict = {"timeout": 120}
    if url.lower().startswith("https://"):
        kwargs["context"] = ctx
    with urllib.request.urlopen(req, **kwargs) as resp:
        return json.loads(resp.read().decode())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--store-env-file",
        type=Path,
        nargs="*",
        default=None,
        metavar="PATH",
        help=".env paths merged in order (e.g. storefront/.env.local medusa-upload.env). "
        "If omitted, loads storefront/.env.local when present.",
    )
    ap.add_argument("--input", type=Path, required=True)
    ap.add_argument("--output", type=Path, default=None)
    args = ap.parse_args()

    env_paths: list[Path] = []
    if args.store_env_file:
        env_paths.extend([p for p in args.store_env_file if p.is_file()])
    else:
        default_local = Path("storefront/.env.local")
        if default_local.is_file():
            env_paths.append(default_local)
    for p in env_paths:
        load_env(p)

    base = (
        os.environ.get("NEXT_PUBLIC_MEDUSA_BACKEND_URL")
        or os.environ.get("MEDUSA_BACKEND_URL")
        or ""
    ).strip().rstrip("/")
    pak = (
        os.environ.get("NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY")
        or os.environ.get("MEDUSA_PUBLISHABLE_KEY")
        or ""
    ).strip()

    if not base:
        print(
            "Set NEXT_PUBLIC_MEDUSA_BACKEND_URL (e.g. in storefront/.env.local).",
            file=sys.stderr,
        )
        sys.exit(1)
    if not pak:
        print(
            "Set NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY (Admin → Settings → Publishable API Keys).",
            file=sys.stderr,
        )
        sys.exit(1)

    out_path = args.output or args.input
    if not args.input.is_file():
        print(f"Not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    base_headers = {
        "Accept": "application/json",
        "x-publishable-api-key": pak,
    }

    # Resolve first region (Store product list requires region_id)
    regions_url = base + "/store/regions?limit=50"
    try:
        rdata = get_json(regions_url, base_headers)
    except Exception as e:
        print(f"GET /store/regions failed: {e}", file=sys.stderr)
        sys.exit(1)
    regions = rdata.get("regions") or []
    if not regions:
        print("No regions returned from Store API.", file=sys.stderr)
        sys.exit(1)
    region_id = (regions[0].get("id") or "").strip()
    if not region_id:
        print("Could not read region id.", file=sys.stderr)
        sys.exit(1)

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

    handle_to_id: dict[str, str] = {}
    missing_after: list[str] = []

    for h_raw in sorted(wanted):
        h = h_raw.strip().lower()
        qs = urllib.parse.urlencode(
            {
                "handle": h,
                "region_id": region_id,
                "limit": "1",
                "fields": "id,handle",
            }
        )
        url = f"{base}/store/products?{qs}"
        try:
            data = get_json(url, base_headers)
        except urllib.error.HTTPError as e:
            print(f"[{h_raw}] HTTP {e.code}: {e.reason}", file=sys.stderr)
            missing_after.append(h_raw)
            continue
        except Exception as e:
            print(f"[{h_raw}] {type(e).__name__}: {e}", file=sys.stderr)
            missing_after.append(h_raw)
            continue
        pros = data.get("products") or []
        if not pros:
            missing_after.append(h_raw)
            continue
        pid = (pros[0].get("id") or "").strip()
        if pid.startswith("prod_"):
            handle_to_id[h_raw] = pid

    print(
        f"Store API resolved {len(handle_to_id)} / {len(wanted)} unique handles.",
        flush=True,
    )
    if missing_after:
        print(
            f"Still missing ({len(missing_after)}): {', '.join(missing_after[:15])}"
            + (" …" if len(missing_after) > 15 else ""),
            file=sys.stderr,
            flush=True,
        )

    updated = 0
    last_handle = ""
    for row in rows:
        h_in = (row.get(handle_key) or "").strip()
        if h_in:
            last_handle = h_in

        hid = ""
        if h_in and h_in in handle_to_id:
            hid = handle_to_id[h_in]
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

    print(f"Wrote {out_path} (updated Product Id on {updated} row occurrences).")


if __name__ == "__main__":
    main()
