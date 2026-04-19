#!/usr/bin/env python3
"""
Rewrite Medusa product-import CSV image columns so URLs point at files stored via the
same pipeline as the admin UI: POST /admin/uploads → uploadFilesWorkflow → your
configured file provider (e.g. MinIO on Railway).

Medusa's CSV importer copies "product thumbnail" and "product image N" strings into
product records as-is; it does not download remote URLs or push them through the
file module. This script uploads each distinct source once, then swaps URLs in the CSV.

Environment:
  MEDUSA_BACKEND_URL   Base URL of the Medusa backend (no trailing slash), e.g.
                        https://your-app.up.railway.app
  MEDUSA_ADMIN_TOKEN   Admin JWT (Bearer) from a logged-in session, or a secret
                        API token your Medusa version accepts for admin routes.

Usage:
  export MEDUSA_BACKEND_URL=...
  export MEDUSA_ADMIN_TOKEN=...
  python3 scripts/rewrite_csv_image_urls_via_medusa_upload.py \\
    --input syzmik_medusa_import.csv \\
    --output syzmik_medusa_import_medusa_files.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import mimetypes
import os
import re
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path


def _env(name: str) -> str:
    v = (os.environ.get(name) or "").strip()
    if not v:
        print(f"Missing environment variable {name}", file=sys.stderr)
        sys.exit(1)
    return v.rstrip("/")


def _image_columns(headers: list[str]) -> list[str]:
    """Original header names for columns that hold image URLs (Medusa import shape)."""
    lower = {h.lower().strip(): h for h in headers}
    out: list[str] = []
    thumb = lower.get("product thumbnail")
    if thumb:
        out.append(thumb)
    for h in headers:
        hl = h.lower().strip()
        if re.match(r"^product image \d+$", hl):
            out.append(h)
    return out


def _collect_urls(rows: list[dict[str, str]], cols: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for row in rows:
        for c in cols:
            u = (row.get(c) or "").strip()
            if not u or u in seen:
                continue
            seen.add(u)
            ordered.append(u)
    return ordered


def _load_source_bytes(src: str) -> tuple[bytes, str, str]:
    """
    Returns (content, filename, mime_type).
    Remote: HTTP(S) URL. Local: file path that exists.
    """
    if src.startswith("http://") or src.startswith("https://"):
        req = urllib.request.Request(
            src,
            headers={"User-Agent": "medusa-csv-image-rewrite/1.0"},
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = resp.read()
        path = urllib.request.urlparse(src).path
        name = Path(path).name or "image"
        if "." not in name:
            name = f"{name}.jpg"
        mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
        return data, name, mime

    p = Path(src)
    if not p.is_file():
        raise FileNotFoundError(f"Not a file or URL: {src}")
    data = p.read_bytes()
    mime = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
    return data, p.name, mime


def _multipart_encode(
    field_name: str,
    filename: str,
    content: bytes,
    content_type: str,
) -> tuple[str, bytes]:
    boundary = f"----MedusaCsvBoundary{uuid.uuid4().hex}"
    crlf = b"\r\n"
    disp = (
        f'Content-Disposition: form-data; name="{field_name}"; '
        f'filename="{filename}"'
    )
    body = b"".join(
        [
            f"--{boundary}".encode(),
            crlf,
            disp.encode(),
            crlf,
            f"Content-Type: {content_type}".encode(),
            crlf,
            crlf,
            content,
            crlf,
            f"--{boundary}--".encode(),
            crlf,
        ]
    )
    content_type_hdr = f"multipart/form-data; boundary={boundary}"
    return content_type_hdr, body


def _post_upload(
    base_url: str,
    token: str,
    filename: str,
    content: bytes,
    mime: str,
) -> str:
    ct, body = _multipart_encode("files", filename, content, mime)
    url = f"{base_url}/admin/uploads"
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": ct,
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            payload = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        raise RuntimeError(f"Upload failed {e.code}: {detail}") from e

    files = payload.get("files") or []
    if not files:
        raise RuntimeError(f"Unexpected upload response: {payload}")
    medusa_url = (files[0].get("url") or "").strip()
    if not medusa_url:
        raise RuntimeError(f"Upload response missing url: {files[0]}")
    return medusa_url


def _map_urls(
    sources: list[str],
    base_url: str,
    token: str,
    cache_path: Path | None,
    sleep_s: float,
) -> dict[str, str]:
    mapping: dict[str, str] = {}
    if cache_path and cache_path.is_file():
        try:
            mapping = json.loads(cache_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            mapping = {}

    for i, src in enumerate(sources):
        if src in mapping:
            continue
        data, fname, mime = _load_source_bytes(src)
        # Retry a few times for transient CDN / network errors
        last_err: Exception | None = None
        for attempt in range(3):
            try:
                new_url = _post_upload(base_url, token, fname, data, mime)
                mapping[src] = new_url
                if cache_path:
                    cache_path.write_text(
                        json.dumps(mapping, indent=2, sort_keys=True),
                        encoding="utf-8",
                    )
                break
            except Exception as e:
                last_err = e
                time.sleep(1.5 * (attempt + 1))
        else:
            raise RuntimeError(f"Failed to upload {src!r}") from last_err

        if sleep_s > 0:
            time.sleep(sleep_s)
        if (i + 1) % 25 == 0:
            print(f"  uploaded {i + 1}/{len(sources)} distinct sources...", flush=True)

    return mapping


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Upload CSV image URLs via Medusa /admin/uploads and rewrite CSV."
    )
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--cache",
        type=Path,
        default=None,
        help="JSON map path to resume interrupted runs (source_url -> medusa_url).",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.0,
        help="Seconds to sleep between uploads (rate limiting).",
    )
    args = parser.parse_args()

    base_url = _env("MEDUSA_BACKEND_URL")
    token = _env("MEDUSA_ADMIN_TOKEN")

    with args.input.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            print("CSV has no header row", file=sys.stderr)
            sys.exit(1)
        headers = list(reader.fieldnames)
        rows: list[dict[str, str]] = [dict(r) for r in reader]

    cols = _image_columns(headers)
    if not cols:
        print("No Product Thumbnail / Product Image N columns found.", file=sys.stderr)
        sys.exit(1)

    sources = _collect_urls(rows, cols)
    print(
        f"Found {len(sources)} distinct image source URLs/paths "
        f"across {len(rows)} rows; uploading via {base_url}/admin/uploads ...",
        flush=True,
    )

    cache_path = args.cache
    if cache_path is None:
        cache_path = args.output.with_suffix(".upload-map.json")

    mapping = _map_urls(sources, base_url, token, cache_path, args.sleep)

    for row in rows:
        for c in cols:
            u = (row.get(c) or "").strip()
            if u and u in mapping:
                row[c] = mapping[u]

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {args.output}", flush=True)
    if cache_path:
        print(f"URL map: {cache_path}", flush=True)


if __name__ == "__main__":
    main()
