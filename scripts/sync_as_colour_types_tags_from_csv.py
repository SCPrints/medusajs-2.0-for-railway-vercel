#!/usr/bin/env python3
"""
Sync AS Colour product types and tags from a supplier CSV (STYLECODE, Type, Tags)
into Medusa via the Admin API.

Matches products the same way as backend/src/scripts/trim-as-colour-catalog-by-allowlist.ts:
handle must be \"as-colour\" or start with \"as-colour-\"; style code is the last hyphen
segment, non-alphanumeric stripped, uppercased — aligned with CSV STYLECODE.

CSV Type values are mapped to canonical Medusa product type labels from
backend/src/scripts/create-product-types.ts (Headwear, T-Shirts, …).

  python3 scripts/sync_as_colour_types_tags_from_csv.py \\
    --env-file medusa-upload.env \\
    --input ~/Downloads/as_colour_with_rich_tags.csv

  python3 scripts/sync_as_colour_types_tags_from_csv.py \\
    --env-file medusa-upload.env \\
    --input as_colour_with_rich_tags.csv --dry-run

Auth/env matches scripts/link_product_tags_from_import_csv.py:
  MEDUSA_BACKEND_URL, MEDUSA_ADMIN_TOKEN and/or MEDUSA_ADMIN_COOKIE
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

# Canonical Medusa product type `value` (see backend/src/scripts/create-product-types.ts).
CSV_TYPE_TO_MEDUSA: dict[str, str] = {
    "beanie": "Headwear",
    "cap": "Headwear",
    "hoodie": "Hoodies",
    "longsleeve": "Longsleeves",
    "polo": "Polos",
    "sweatshirt": "Sweatshirts",
    "t-shirt": "T-Shirts",
    "zip hoodie": "Hoodies",
}

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


def normalize_style_code(value: str | None) -> str:
    if not value:
        return ""
    return "".join(c for c in value.strip().upper() if c.isalnum())


def extract_style_code_from_handle(handle: str | None) -> str:
    if not handle:
        return ""
    parts = [p for p in handle.strip().upper().split("-") if p]
    tail = parts[-1] if parts else ""
    return "".join(c for c in tail if c.isalnum())


def map_csv_type_to_medusa(csv_type: str) -> str:
    key = csv_type.strip().lower()
    if not key:
        raise ValueError("empty Type")
    medusa = CSV_TYPE_TO_MEDUSA.get(key)
    if not medusa:
        raise ValueError(
            f"Unknown CSV Type {csv_type!r}; extend CSV_TYPE_TO_MEDUSA in this script."
        )
    return medusa


def parse_tags_cell(cell: str) -> list[str]:
    out: list[str] = []
    for part in cell.split(","):
        t = part.strip()
        if t:
            out.append(t)
    return out


def load_csv_by_style(path: Path) -> dict[str, dict[str, object]]:
    """style_code -> {\"csv_type\": str, \"tags\": list[str]} (first row wins per style)."""
    by_style: dict[str, dict[str, object]] = {}
    conflicts = 0
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            sc = normalize_style_code(row.get("STYLECODE"))
            if not sc:
                continue
            raw_type = (row.get("Type") or "").strip()
            tags = parse_tags_cell(row.get("Tags") or "")
            if not raw_type and not tags:
                continue
            if sc in by_style:
                prev = by_style[sc]
                if (prev.get("csv_type"), prev.get("tags")) != (raw_type, tags):
                    conflicts += 1
                continue
            by_style[sc] = {"csv_type": raw_type, "tags": tags}
    if conflicts:
        print(
            f"Note: {conflicts} duplicate STYLECODE row(s) skipped (first row kept per style).",
            file=sys.stderr,
        )
    return by_style


def _fetch_as_colour_products(
    base_url: str,
    headers: dict[str, str],
    ctx: ssl.SSLContext,
    page_size: int,
) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    offset = 0
    fields = "id,handle"
    while True:
        q = urllib.parse.urlencode({"limit": page_size, "offset": offset, "fields": fields})
        url = f"{base_url}/admin/products?{q}"
        data = _get_json(url, headers, ctx)
        products = data.get("products") or []
        for p in products:
            hid = (p.get("id") or "").strip()
            h = (p.get("handle") or "").strip()
            if not hid or not h:
                continue
            if h == "as-colour" or h.startswith("as-colour-"):
                out.append({"id": hid, "handle": h})
        if len(products) < page_size:
            break
        offset += page_size
    return out


def _list_all_product_types(
    base_url: str,
    headers: dict[str, str],
    ctx: ssl.SSLContext,
    page_size: int,
) -> dict[str, str]:
    """Lowercased value -> id (last wins)."""
    value_to_id: dict[str, str] = {}
    offset = 0
    while True:
        q = urllib.parse.urlencode({"limit": page_size, "offset": offset})
        url = f"{base_url}/admin/product-types?{q}"
        payload = _get_json(url, headers, ctx)
        types_ = payload.get("product_types") or []
        for t in types_:
            tid = (t.get("id") or "").strip()
            val = (t.get("value") or "").strip()
            if tid and val:
                value_to_id[val.lower()] = tid
        count = len(types_)
        offset += count
        total = int(payload.get("count") or 0)
        if count < page_size or offset >= total:
            break
    return value_to_id


def _create_product_type(
    base_url: str,
    headers: dict[str, str],
    ctx: ssl.SSLContext,
    value: str,
) -> str:
    url = f"{base_url}/admin/product-types"
    body = json.dumps({"value": value}).encode()
    payload = _request_json(url, headers, ctx, data=body, method="POST")
    pt = payload.get("product_type") or {}
    tid = (pt.get("id") or "").strip()
    if not tid:
        raise RuntimeError(f"Unexpected create product-type response: {payload}")
    return tid


def _find_product_type_id_by_value(
    base_url: str,
    headers: dict[str, str],
    ctx: ssl.SSLContext,
    value: str,
) -> str | None:
    q = urllib.parse.urlencode({"value": value, "limit": 5})
    url = f"{base_url}/admin/product-types?{q}"
    payload = _get_json(url, headers, ctx)
    for t in payload.get("product_types") or []:
        if (t.get("value") or "").strip() == value:
            tid = (t.get("id") or "").strip()
            if tid:
                return tid
    return None


def _ensure_product_type_id(
    base_url: str,
    headers: dict[str, str],
    ctx: ssl.SSLContext,
    value: str,
    cache: dict[str, str],
    sleep: float,
) -> str:
    key = value.lower()
    if key in cache:
        return cache[key]
    try:
        tid = _create_product_type(base_url, headers, ctx, value)
        cache[key] = tid
        print(f"Created product type {value!r} -> {tid}", file=sys.stderr)
        time.sleep(sleep)
        return tid
    except RuntimeError as e:
        msg = str(e)
        if "422" in msg or "409" in msg or "already" in msg.lower():
            found = _find_product_type_id_by_value(base_url, headers, ctx, value)
            if found:
                cache[key] = found
                print(f"Product type exists {value!r} -> {found}", file=sys.stderr)
                return found
        raise


def _list_all_tags(
    base_url: str,
    headers: dict[str, str],
    ctx: ssl.SSLContext,
    page_size: int,
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


def _create_tag(
    base_url: str,
    headers: dict[str, str],
    ctx: ssl.SSLContext,
    value: str,
) -> str:
    url = f"{base_url}/admin/product-tags"
    body = json.dumps({"value": value}).encode()
    payload = _request_json(url, headers, ctx, data=body, method="POST")
    tag = payload.get("product_tag") or {}
    tid = (tag.get("id") or "").strip()
    if not tid:
        raise RuntimeError(f"Unexpected create tag response: {payload}")
    return tid


def _find_tag_id_by_value(
    base_url: str,
    headers: dict[str, str],
    ctx: ssl.SSLContext,
    value: str,
) -> str | None:
    q = urllib.parse.urlencode({"value": value, "limit": 5})
    url = f"{base_url}/admin/product-tags?{q}"
    payload = _get_json(url, headers, ctx)
    for t in payload.get("product_tags") or []:
        if (t.get("value") or "").strip() == value:
            tid = (t.get("id") or "").strip()
            if tid:
                return tid
    return None


def _ensure_tags(
    base_url: str,
    headers: dict[str, str],
    ctx: ssl.SSLContext,
    labels: list[str],
    value_to_id: dict[str, str],
    sleep: float,
) -> None:
    for value in labels:
        if value in value_to_id:
            continue
        try:
            tid = _create_tag(base_url, headers, ctx, value)
            value_to_id[value] = tid
            print(f"Created tag {value!r} -> {tid}", file=sys.stderr)
        except RuntimeError as e:
            msg = str(e)
            if "422" in msg or "409" in msg or "already" in msg.lower():
                tid = _find_tag_id_by_value(base_url, headers, ctx, value)
                if tid:
                    value_to_id[value] = tid
                    print(f"Tag already exists {value!r} -> {tid}", file=sys.stderr)
                else:
                    raise
            else:
                raise
        time.sleep(sleep)


def _resolve_tag_ids(raw_values: list[str], value_to_id: dict[str, str]) -> list[str]:
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
            "Unknown tag label(s) (create tags first): " + ", ".join(sorted(set(missing)))
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

    csv_by_style = load_csv_by_style(args.input)
    print(f"CSV: {len(csv_by_style)} unique STYLECODE(s)", file=sys.stderr)

    if args.dry_run:
        _load_env_file(args.env_file)
        base = (os.environ.get("MEDUSA_BACKEND_URL") or "").strip().rstrip("/")
        if base:
            headers = _admin_headers()
            ctx = _ssl_context()
            products = _fetch_as_colour_products(base, headers, ctx, args.page_size)
            style_to_prods: dict[str, list[dict[str, str]]] = {}
            for p in products:
                st = extract_style_code_from_handle(p["handle"])
                if not st:
                    continue
                style_to_prods.setdefault(st, []).append(p)
            matched = 0
            for st, data in sorted(csv_by_style.items()):
                prods = style_to_prods.get(st, [])
                if not prods:
                    continue
                matched += len(prods)
                try:
                    mt = map_csv_type_to_medusa(str(data["csv_type"]))
                except ValueError as e:
                    print(f"SKIP style {st}: {e}", file=sys.stderr)
                    continue
                tags = data["tags"]
                for pr in prods:
                    print(
                        f"{pr['handle']}\tstyle={st}\ttype={mt}\ttags={len(tags)}",
                    )
            csv_styles = set(csv_by_style.keys())
            prod_styles = set(style_to_prods.keys())
            print(
                f"\nDry-run summary: would touch ~{matched} product row(s); "
                f"CSV styles without product: {len(csv_styles - prod_styles)}; "
                f"products' styles without CSV row: {len(prod_styles - csv_styles)}",
                file=sys.stderr,
            )
        else:
            for st, data in sorted(csv_by_style.items()):
                try:
                    mt = map_csv_type_to_medusa(str(data["csv_type"]))
                except ValueError as e:
                    print(f"{st}\tERROR {e}", file=sys.stderr)
                    continue
                print(f"{st}\t{mt}\t{len(data['tags'])} tags")
        return

    _load_env_file(args.env_file)
    base = (os.environ.get("MEDUSA_BACKEND_URL") or "").strip().rstrip("/")
    if not base:
        print("MEDUSA_BACKEND_URL required", file=sys.stderr)
        sys.exit(1)

    headers = _admin_headers()
    ctx = _ssl_context()

    all_tag_labels: set[str] = set()
    medusa_types_needed: set[str] = set()
    for data in csv_by_style.values():
        raw_type = str(data.get("csv_type") or "").strip()
        if raw_type:
            try:
                medusa_types_needed.add(map_csv_type_to_medusa(raw_type))
            except ValueError as e:
                print(f"CSV type error: {e}", file=sys.stderr)
                sys.exit(1)
        for t in data["tags"]:  # type: ignore[operator]
            all_tag_labels.add(t)  # type: ignore[arg-type]

    print("Loading product types…", file=sys.stderr)
    type_lower_to_id = _list_all_product_types(base, headers, ctx, args.page_size)
    type_cache: dict[str, str] = {k: v for k, v in type_lower_to_id.items()}

    for mv in sorted(medusa_types_needed):
        _ensure_product_type_id(base, headers, ctx, mv, type_cache, args.sleep)

    print("Loading product tags…", file=sys.stderr)
    tag_value_to_id = _list_all_tags(base, headers, ctx, args.page_size)
    _ensure_tags(
        base,
        headers,
        ctx,
        sorted(all_tag_labels),
        tag_value_to_id,
        args.sleep,
    )

    products = _fetch_as_colour_products(base, headers, ctx, args.page_size)
    style_to_prods: dict[str, list[dict[str, str]]] = {}
    for p in products:
        st = extract_style_code_from_handle(p["handle"])
        if not st:
            continue
        style_to_prods.setdefault(st, []).append(p)

    updated = 0
    errors = 0
    skipped_no_csv = 0

    for st, prods in sorted(style_to_prods.items()):
        row = csv_by_style.get(st)
        if not row:
            skipped_no_csv += len(prods)
            continue
        raw_type = str(row.get("csv_type") or "").strip()
        tags_list: list[str] = list(row["tags"])  # type: ignore[arg-type]
        if not raw_type and not tags_list:
            continue
        try:
            medusa_type = map_csv_type_to_medusa(raw_type) if raw_type else None
        except ValueError as e:
            print(f"FAIL style {st}: {e}", file=sys.stderr)
            errors += len(prods)
            continue

        type_id = type_cache.get(medusa_type.lower()) if medusa_type else None
        if medusa_type and not type_id:
            type_id = _ensure_product_type_id(
                base, headers, ctx, medusa_type, type_cache, args.sleep
            )

        try:
            tag_ids = _resolve_tag_ids(tags_list, tag_value_to_id)
        except SystemExit as e:
            print(f"FAIL style {st}: {e}", file=sys.stderr)
            errors += len(prods)
            continue

        body_obj: dict[str, object] = {
            "tags": [{"id": tid} for tid in tag_ids],
        }
        if type_id:
            body_obj["type_id"] = type_id

        if not type_id and not tag_ids:
            continue

        body = json.dumps(body_obj).encode()
        for pr in prods:
            url = f"{base}/admin/products/{pr['id']}"
            try:
                _request_json(url, headers, ctx, data=body, method="POST")
                updated += 1
                print(
                    f"OK {pr['handle']} type={medusa_type!r} tags={len(tag_ids)}",
                    file=sys.stderr,
                )
            except RuntimeError as e:
                print(f"FAIL {pr['handle']}: {e}", file=sys.stderr)
                errors += 1
            time.sleep(args.sleep)

    csv_styles = set(csv_by_style.keys())
    prod_styles = set(style_to_prods.keys())
    print(
        f"Done. Updated: {updated}, errors: {errors}, "
        f"product(s) skipped (no CSV row for style): {skipped_no_csv}, "
        f"CSV styles with no matching product: {len(csv_styles - prod_styles)}.",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
