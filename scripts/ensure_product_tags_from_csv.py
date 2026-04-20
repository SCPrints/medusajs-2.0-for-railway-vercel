#!/usr/bin/env python3
"""
Read Medusa product-import CSV(s), collect human-readable values from
"Product Tag", "Product Tag 1", "Product Tag 2", … columns, then ensure each
exists in Medusa via the Admin API (GET /admin/product-tags, POST as needed).

Import CSVs expect tag *ids* (ptag_…); this script can print a value→id map
and optionally rewrite those columns to ids.

Auth/env matches fill_variant_ids_in_import_csv.py:

  .venv-upload/bin/python scripts/ensure_product_tags_from_csv.py \\
    --env-file medusa-upload.env \\
    --input syzmik_medusa_import_medusa_files.csv

  # Write JSON map and replace labels with ids in a copy of the CSV:
  .venv-upload/bin/python scripts/ensure_product_tags_from_csv.py \\
    --env-file medusa-upload.env \\
    --input syzmik_medusa_import_medusa_files.csv \\
    --mapping-out product_tags_mapping.json \\
    --rewrite-csv-out syzmik_with_tag_ids.csv
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


def _list_all_tags(
    base_url: str, headers: dict[str, str], ctx: ssl.SSLContext, page_size: int
) -> dict[str, str]:
    """value (exact) -> id. Last wins if duplicates exist in DB."""
    value_to_id: dict[str, str] = {}
    offset = 0
    while True:
        q = urllib.parse.urlencode({"limit": page_size, "offset": offset})
        url = f"{base_url}/admin/product-tags?{q}"
        payload = _request_json(url, headers, ctx)
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


def _create_tag(
    base_url: str, headers: dict[str, str], ctx: ssl.SSLContext, value: str
) -> str:
    url = f"{base_url}/admin/product-tags"
    body = json.dumps({"value": value}).encode()
    payload = _request_json(url, headers, ctx, data=body, method="POST")
    tag = payload.get("product_tag") or {}
    tid = (tag.get("id") or "").strip()
    if not tid:
        raise RuntimeError(f"Unexpected create response: {payload}")
    return tid


def _find_tag_id_by_value(
    base_url: str, headers: dict[str, str], ctx: ssl.SSLContext, value: str
) -> str | None:
    q = urllib.parse.urlencode({"value": value, "limit": 5})
    url = f"{base_url}/admin/product-tags?{q}"
    payload = _request_json(url, headers, ctx)
    for t in payload.get("product_tags") or []:
        if (t.get("value") or "").strip() == value:
            tid = (t.get("id") or "").strip()
            if tid:
                return tid
    return None


def _tag_columns(fieldnames: list[str] | None) -> list[str]:
    if not fieldnames:
        return []
    return [c for c in fieldnames if c and _TAG_COL.match(c.strip())]


def _collect_labels_from_csv(paths: list[Path]) -> tuple[list[str], dict[Path, list[str]]]:
    labels: set[str] = set()
    cols_per_file: dict[Path, list[str]] = {}
    for p in paths:
        with p.open("r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            cols = _tag_columns(reader.fieldnames)
            cols_per_file[p] = cols
            if not cols:
                continue
            for row in reader:
                for c in cols:
                    raw = (row.get(c) or "").strip()
                    if not raw or _PTAG_ID.match(raw):
                        continue
                    labels.add(raw)
    return sorted(labels), cols_per_file


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--env-file",
        type=Path,
        default=None,
        help="medusa-upload.env (required unless --dry-run)",
    )
    parser.add_argument(
        "--input",
        type=Path,
        action="append",
        dest="inputs",
        required=True,
        help="Import CSV (repeat for multiple files)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Only list labels")
    parser.add_argument(
        "--mapping-out",
        type=Path,
        default=None,
        help="Write JSON object: label -> ptag_ id",
    )
    parser.add_argument(
        "--rewrite-csv-out",
        type=Path,
        default=None,
        help="Write a copy of the first --input with tag columns rewritten to ids",
    )
    parser.add_argument("--sleep", type=float, default=0.05)
    parser.add_argument("--page-size", type=int, default=100)
    args = parser.parse_args()

    if args.dry_run:
        if args.env_file is not None and not args.env_file.is_file():
            print(f"Not found: {args.env_file}", file=sys.stderr)
            sys.exit(1)
    else:
        if args.env_file is None or not args.env_file.is_file():
            print(
                "Provide a valid --env-file (or use --dry-run to only list CSV labels).",
                file=sys.stderr,
            )
            sys.exit(1)

    for p in args.inputs:
        if not p.is_file():
            print(f"Not found: {p}", file=sys.stderr)
            sys.exit(1)

    labels, cols_per_file = _collect_labels_from_csv(args.inputs)
    for p, cols in cols_per_file.items():
        if not cols:
            print(f"Warning: no 'Product Tag …' columns in {p}", file=sys.stderr)

    print(f"Unique tag labels from CSV(s): {len(labels)}")
    for v in labels:
        print(f"  {v}")

    if args.dry_run:
        return

    _load_env_file(args.env_file)
    base = (os.environ.get("MEDUSA_BACKEND_URL") or "").strip().rstrip("/")
    if not base:
        print("MEDUSA_BACKEND_URL required", file=sys.stderr)
        sys.exit(1)

    headers = _admin_headers()
    ctx = _ssl_context()

    print("Fetching existing product tags…", file=sys.stderr)
    value_to_id = _list_all_tags(base, headers, ctx, args.page_size)

    created = 0
    for value in labels:
        if value in value_to_id:
            continue
        try:
            tid = _create_tag(base, headers, ctx, value)
            value_to_id[value] = tid
            created += 1
            print(f"Created tag {value!r} -> {tid}", file=sys.stderr)
        except RuntimeError as e:
            msg = str(e)
            if "422" in msg or "409" in msg or "already" in msg.lower():
                tid = _find_tag_id_by_value(base, headers, ctx, value)
                if tid:
                    value_to_id[value] = tid
                    print(f"Tag already exists {value!r} -> {tid}", file=sys.stderr)
                else:
                    raise
            else:
                raise
        time.sleep(args.sleep)

    # Mapping for all labels (and pass-through for any ptag in CSV not in labels set)
    mapping: dict[str, str] = {v: value_to_id[v] for v in labels}

    print("\nvalue\tid")
    for v in sorted(mapping.keys()):
        print(f"{v}\t{mapping[v]}")

    if args.mapping_out:
        args.mapping_out.write_text(
            json.dumps(mapping, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        print(f"Wrote {args.mapping_out}", file=sys.stderr)

    if args.rewrite_csv_out:
        primary = args.inputs[0]
        cols = cols_per_file.get(primary) or []
        if not cols:
            print(
                f"No tag columns in {primary}; cannot --rewrite-csv-out",
                file=sys.stderr,
            )
            sys.exit(1)
        with primary.open("r", encoding="utf-8-sig", newline="") as fin:
            reader = csv.DictReader(fin)
            fieldnames = reader.fieldnames
            if not fieldnames:
                print(f"Empty CSV: {primary}", file=sys.stderr)
                sys.exit(1)
            rows = list(reader)
        missing: set[str] = set()
        for row in rows:
            for c in cols:
                raw = (row.get(c) or "").strip()
                if not raw or _PTAG_ID.match(raw):
                    continue
                tid = mapping.get(raw)
                if not tid:
                    missing.add(raw)
                else:
                    row[c] = tid
        if missing:
            print(
                "Cannot rewrite; missing ids for labels: "
                + ", ".join(sorted(missing)),
                file=sys.stderr,
            )
            sys.exit(1)
        args.rewrite_csv_out.parent.mkdir(parents=True, exist_ok=True)
        with args.rewrite_csv_out.open("w", encoding="utf-8", newline="") as fout:
            writer = csv.DictWriter(fout, fieldnames=fieldnames, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
        print(f"Wrote {args.rewrite_csv_out}", file=sys.stderr)


if __name__ == "__main__":
    main()
