#!/usr/bin/env python3
"""
Set each product's tags in Medusa from a product-import CSV.

Reads human-readable labels or ptag_ ids from "Product Tag", "Product Tag 1", …
columns, groups rows by **Product Handle**, resolves handles to product ids via
GET /admin/products, resolves labels to tag ids via GET /admin/product-tags, then
POST /admin/products/:id with { "tags": [ { "id": "ptag_..." }, ... ] }.

**Replaces** the product's tag set with exactly what the CSV implies for that
handle (same tag union across all variant rows for that product).

Auth/env matches ensure_product_tags_from_csv.py and fill_product_ids_in_import_csv.py.

  pip3 install certifi   # if HTTPS fails on macOS Python

  python3 scripts/link_product_tags_from_import_csv.py \\
    --env-file medusa-upload.env \\
    --input syzmik_medusa_import.csv

  python3 scripts/link_product_tags_from_import_csv.py \\
    --env-file medusa-upload.env \\
    --input syzmik_medusa_import.csv --dry-run
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


_TAG_COL = re.compile(r"^Product Tag( \d+)?$", re.IGNORECASE)
_PTAG_ID = re.compile(r"^ptag_[A-Za-z0-9]+$")


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
    h: dict[str, str] = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if token:
        h["Authorization"] = f"Bearer {token}"
    if cookie:
        h["Cookie"] = cookie
    return h


def _request_json(
    url: str,
    headers: dict[str, str],
    ctx: ssl.SSLContext,
    *,
    data: bytes | None = None,
    method: str | None = None,
) -> dict:
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    kwargs: dict = {"timeout": 120}
    if url.lower().startswith("https://"):
        kwargs["context"] = ctx
    try:
        with urllib.request.urlopen(req, **kwargs) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        raise RuntimeError(f"HTTP {e.code} {url}: {detail}") from e


def _get_json(url: str, headers: dict[str, str], ctx: ssl.SSLContext) -> dict:
    return _request_json(url, headers, ctx)


def _fetch_handle_to_id(
    base_url: str,
    headers: dict[str, str],
    ctx: ssl.SSLContext,
    wanted: set[str],
) -> dict[str, str]:
    out: dict[str, str] = {}
    offset = 0
    limit = 100
    fields = "id,handle"
    while True:
        q = urllib.parse.urlencode({"limit": limit, "offset": offset, "fields": fields})
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


def _list_all_tags(
    base_url: str, headers: dict[str, str], ctx: ssl.SSLContext, page_size: int
) -> dict[str, str]:
    value_to_id: dict[str, str] = {}
    offset = 0
    while True:
        q = urllib.parse.urlencode({"limit": page_size, "offset": offset})
        url = f"{base_url}/admin/product-tags?{q}"
        payload = _get_json(url, headers, ctx)
        tags = payload.get("product_tags") or []
        for t in tags:
            tid = (t.get("id") or "").strip()
            val = (t.get("value") or "").strip()
            if tid and val:
                value_to_id[val] = tid
        count = len(tags)
        offset += count
        total = int(payload.get("count") or 0)
        if count < page_size or offset >= total:
            break
    return value_to_id


def _tag_columns(fieldnames: list[str] | None) -> list[str]:
    if not fieldnames:
        return []
    return [c for c in fieldnames if c and _TAG_COL.match(c.strip())]


def _collect_handle_tags(path: Path) -> dict[str, set[str]]:
    """handle -> set of raw tag cell values (label or ptag_…)."""
    out: dict[str, set[str]] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        cols = _tag_columns(reader.fieldnames)
        hk = next(
            (h for h in (reader.fieldnames or []) if h.lower().strip() == "product handle"),
            None,
        )
        if not hk:
            print("CSV must include a Product Handle column.", file=sys.stderr)
            sys.exit(1)
        if not cols:
            print("No Product Tag … columns found.", file=sys.stderr)
            sys.exit(1)
        for row in reader:
            handle = (row.get(hk) or "").strip()
            if not handle:
                continue
            bucket = out.setdefault(handle, set())
            for c in cols:
                raw = (row.get(c) or "").strip()
                if raw:
                    bucket.add(raw)
    return out


def _resolve_tag_ids(raw_values: set[str], value_to_id: dict[str, str]) -> list[str]:
    ids: set[str] = set()
    missing: list[str] = []
    for raw in raw_values:
        if _PTAG_ID.match(raw):
            ids.add(raw)
            continue
        tid = value_to_id.get(raw)
        if tid:
            ids.add(tid)
        else:
            missing.append(raw)
    if missing:
        raise SystemExit(
            "Unknown tag label(s) (create tags first): " + ", ".join(sorted(missing))
        )
    return sorted(ids)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--sleep", type=float, default=0.05)
    parser.add_argument("--page-size", type=int, default=100)
    args = parser.parse_args()

    if not args.env_file.is_file():
        print(f"Not found: {args.env_file}", file=sys.stderr)
        sys.exit(1)
    if not args.input.is_file():
        print(f"Not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    handle_to_labels = _collect_handle_tags(args.input)
    print(
        f"Handles with at least one tag value: {len(handle_to_labels)}",
        file=sys.stderr,
    )

    if args.dry_run:
        for h in sorted(handle_to_labels.keys()):
            labels = sorted(handle_to_labels[h])
            print(f"{h}\t{', '.join(labels)}")
        return

    _load_env_file(args.env_file)
    base = (os.environ.get("MEDUSA_BACKEND_URL") or "").strip().rstrip("/")
    if not base:
        print("MEDUSA_BACKEND_URL required", file=sys.stderr)
        sys.exit(1)

    headers = _admin_headers()
    ctx = _ssl_context()

    print("Loading product-tag id map…", file=sys.stderr)
    value_to_id = _list_all_tags(base, headers, ctx, args.page_size)

    wanted_handles = set(handle_to_labels.keys())
    print(f"Resolving {len(wanted_handles)} product handles…", file=sys.stderr)
    handle_to_pid = _fetch_handle_to_id(base, headers, ctx, wanted_handles)

    missing_handles = wanted_handles - set(handle_to_pid.keys())
    if missing_handles:
        print(
            f"Warning: {len(missing_handles)} handles not found in Medusa (skipped): "
            f"{', '.join(sorted(missing_handles)[:8])}"
            f"{'…' if len(missing_handles) > 8 else ''}",
            file=sys.stderr,
        )

    updated = 0
    skipped_empty = 0
    errors = 0
    for handle in sorted(handle_to_pid.keys()):
        pid = handle_to_pid[handle]
        raw_tags = handle_to_labels.get(handle, set())
        if not raw_tags:
            skipped_empty += 1
            continue
        try:
            tag_ids = _resolve_tag_ids(raw_tags, value_to_id)
        except SystemExit as e:
            print(f"{handle}: {e}", file=sys.stderr)
            errors += 1
            continue
        body = json.dumps({"tags": [{"id": tid} for tid in tag_ids]}).encode()
        url = f"{base}/admin/products/{pid}"
        try:
            _request_json(url, headers, ctx, data=body, method="POST")
            updated += 1
            print(f"OK {handle} -> {len(tag_ids)} tag(s)", file=sys.stderr)
        except RuntimeError as e:
            print(f"FAIL {handle}: {e}", file=sys.stderr)
            errors += 1
        time.sleep(args.sleep)

    print(
        f"Done. Updated: {updated}, skipped (no tags in CSV): {skipped_empty}, "
        f"errors: {errors}, missing handle in API: {len(missing_handles)}.",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
