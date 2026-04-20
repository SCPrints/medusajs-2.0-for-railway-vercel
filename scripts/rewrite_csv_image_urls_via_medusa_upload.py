#!/usr/bin/env python3
"""
Rewrite Medusa product-import CSV image columns so URLs point at files stored via the
same pipeline as the admin UI: POST /admin/uploads → uploadFilesWorkflow → your
configured file provider (e.g. MinIO on Railway).

Medusa's CSV importer copies "product thumbnail" and "product image N" strings into
product records as-is; it does not download remote URLs or push them through the
file module. This script uploads each distinct source once, then swaps URLs in the CSV.

Environment:
  MEDUSA_BACKEND_URL    Base URL of the Medusa backend (no trailing slash), e.g.
                         https://your-app.up.railway.app
  MEDUSA_ADMIN_TOKEN    Optional. Admin JWT for Authorization: Bearer … (some setups).
  MEDUSA_ADMIN_COOKIE   Optional. Session cookie string, e.g. connect.sid=… from DevTools
                         Request Headers → cookie (Medusa admin often uses this instead of Bearer).

  Provide at least one of MEDUSA_ADMIN_TOKEN or MEDUSA_ADMIN_COOKIE.

Usage:
  export MEDUSA_BACKEND_URL=...
  export MEDUSA_ADMIN_COOKIE='connect.sid=...'
  python3 scripts/rewrite_csv_image_urls_via_medusa_upload.py \\
    --input syzmik_medusa_import.csv \\
    --output syzmik_medusa_import_medusa_files.csv

SSL (macOS / python.org Python): if fetching CDN URLs fails with
CERTIFICATE_VERIFY_FAILED, either run the "Install Certificates.command" that ships
with that Python, or: pip install certifi (this script uses certifi when installed),
or pass --insecure-fetch as a last resort (not recommended).
"""

from __future__ import annotations

import argparse
import csv
import json
import mimetypes
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path


def _ssl_context(insecure_fetch: bool) -> ssl.SSLContext:
    if insecure_fetch:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx
    try:
        import certifi  # type: ignore[import-untyped]

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def _load_env_file(path: Path) -> None:
    """Set os.environ from KEY=value lines (optional quotes). Does not override existing env."""
    text = path.read_text(encoding="utf-8")
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
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


def _env(name: str) -> str:
    v = (os.environ.get(name) or "").strip()
    if not v:
        print(f"Missing environment variable {name}", file=sys.stderr)
        sys.exit(1)
    return v.rstrip("/")


def _admin_auth() -> tuple[str | None, str | None]:
    """Returns (bearer_token_or_none, cookie_header_value_or_none)."""
    token = (os.environ.get("MEDUSA_ADMIN_TOKEN") or "").strip()
    cookie = (os.environ.get("MEDUSA_ADMIN_COOKIE") or "").strip()
    if not token and not cookie:
        print(
            "Set at least one of MEDUSA_ADMIN_TOKEN or MEDUSA_ADMIN_COOKIE "
            "(Medusa admin often uses connect.sid in MEDUSA_ADMIN_COOKIE).",
            file=sys.stderr,
        )
        sys.exit(1)
    return (token or None, cookie or None)


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


def _load_source_bytes(
    src: str, ssl_ctx: ssl.SSLContext | None = None
) -> tuple[bytes, str, str]:
    """
    Returns (content, filename, mime_type).
    Remote: HTTP(S) URL. Local: file path that exists.
    """
    if src.startswith("http://") or src.startswith("https://"):
        req = urllib.request.Request(
            src,
            headers={"User-Agent": "medusa-csv-image-rewrite/1.0"},
        )
        kwargs: dict = {"timeout": 120}
        if ssl_ctx is not None and req.full_url.lower().startswith("https://"):
            kwargs["context"] = ssl_ctx
        with urllib.request.urlopen(req, **kwargs) as resp:
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
    filename: str,
    content: bytes,
    mime: str,
    ssl_ctx: ssl.SSLContext | None,
    token: str | None,
    cookie: str | None,
) -> str:
    ct, body = _multipart_encode("files", filename, content, mime)
    url = f"{base_url}/admin/uploads"
    headers: dict[str, str] = {
        "Content-Type": ct,
        "Accept": "application/json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers=headers,
    )
    try:
        ukwargs: dict = {"timeout": 300}
        if ssl_ctx is not None and url.lower().startswith("https://"):
            ukwargs["context"] = ssl_ctx
        with urllib.request.urlopen(req, **ukwargs) as resp:
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
    cache_path: Path | None,
    sleep_s: float,
    ssl_ctx: ssl.SSLContext,
    token: str | None,
    cookie: str | None,
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
        data, fname, mime = _load_source_bytes(src, ssl_ctx)
        # Retry a few times for transient CDN / network errors
        last_err: Exception | None = None
        for attempt in range(3):
            try:
                new_url = _post_upload(
                    base_url, fname, data, mime, ssl_ctx, token, cookie
                )
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
    parser.add_argument(
        "--insecure-fetch",
        action="store_true",
        help="Disable TLS verification for HTTPS (CDN download + Medusa upload). "
        "Use only if you cannot fix local CA certs (e.g. install certifi).",
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        default=None,
        help="Load env vars from a file (KEY=value lines; does not override existing env). "
        "Uses MEDUSA_BACKEND_URL and MEDUSA_ADMIN_TOKEN and/or MEDUSA_ADMIN_COOKIE.",
    )
    args = parser.parse_args()

    if args.env_file is not None:
        if not args.env_file.is_file():
            print(f"--env-file not found: {args.env_file}", file=sys.stderr)
            sys.exit(1)
        _load_env_file(args.env_file)

    base_url = _env("MEDUSA_BACKEND_URL")
    token, cookie = _admin_auth()
    ssl_ctx = _ssl_context(insecure_fetch=args.insecure_fetch)
    if args.insecure_fetch:
        print("Warning: TLS verification disabled for HTTPS requests.", file=sys.stderr)

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

    mapping = _map_urls(
        sources, base_url, cache_path, args.sleep, ssl_ctx, token, cookie
    )

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
