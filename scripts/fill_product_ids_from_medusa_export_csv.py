#!/usr/bin/env python3
"""
Fill "Product Id" in a Medusa product-import CSV from an Admin product export CSV.

The export format (one row per variant) must include columns "Product Handle" and
"Product Id". Rows with an empty Product Handle (variant continuation rows) reuse
the last non-empty handle's product id — same semantics as fill_product_ids_in_import_csv.py.

Optional: merge additional partial exports (--extra-export) and manual handle→id pairs
(--overrides CSV with columns Product Handle / Product Id). Overrides win on conflict.

When import rows have blank Product Id for a handle that already exists in the database,
Medusa runs create-products → "Product with handle … already exists". Filling Product Id
from any source fixes that.

  python3 scripts/fill_product_ids_from_medusa_export_csv.py \\
    --export ~/Downloads/medusa-export.csv \\
    --input path/to/import.csv \\
    [--extra-export ~/Downloads/more-export.csv ...] \\
    [--overrides ~/Downloads/handle-overrides.csv] \\
    [--output path/to/import.csv]
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path


def _export_column_keys(fieldnames: list[str]) -> tuple[str | None, str | None]:
    fh = next((n for n in fieldnames if str(n).lower().strip() == "product handle"), None)
    fp = next((n for n in fieldnames if str(n).lower().strip() == "product id"), None)
    return fh, fp


def _merge_handle_to_id(
    into: dict[str, str],
    export_rows: list[dict],
    fh: str,
    fp: str,
    *,
    source: str,
    overwrite: bool,
) -> int:
    """Merge rows into into. Returns count of new keys set."""
    added = 0
    for row in export_rows:
        handle = (row.get(fh) or "").strip()
        pid = (row.get(fp) or "").strip()
        if not handle or not pid:
            continue
        if handle not in into:
            into[handle] = pid
            added += 1
        elif overwrite and into[handle] != pid:
            print(
                f"{source}: overriding {handle!r} {into[handle]!r} → {pid!r}",
                file=sys.stderr,
            )
            into[handle] = pid
            added += 1
        elif into[handle] != pid:
            print(
                f"Warning [{source}]: handle {handle!r} conflicting Product Id "
                f"{into[handle]!r} vs {pid!r}; keeping first.",
                file=sys.stderr,
            )
    return added


def _load_export_file(path: Path) -> tuple[list[dict], str, str]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f)
        fn_ex = list(r.fieldnames or [])
        rows = list(r)
    fh_ex, fp_ex = _export_column_keys(fn_ex)
    if not fh_ex or not fp_ex:
        print(
            f'{path}: expected columns "Product Handle" and "Product Id".',
            file=sys.stderr,
        )
        sys.exit(1)
    return rows, fh_ex, fp_ex


def _load_overrides_csv(path: Path, into: dict[str, str]) -> int:
    """Two-column overrides: Product Handle / Product Id (flexible headers)."""
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f)
        fn = list(r.fieldnames or [])
        rows = list(r)
    fh_k = next(
        (n for n in fn if str(n).lower().strip() in ("product handle", "handle")),
        None,
    )
    pid_k = next((n for n in fn if str(n).lower().strip() == "product id"), None)
    if not fh_k or not pid_k:
        print(
            f'{path}: overrides need columns "Product Handle" (or Handle) and "Product Id".',
            file=sys.stderr,
        )
        sys.exit(1)
    return _merge_handle_to_id(into, rows, fh_k, pid_k, source=path.name, overwrite=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--export", type=Path, required=True, help="Primary Admin product export CSV")
    parser.add_argument(
        "--extra-export",
        type=Path,
        action="append",
        default=[],
        help="Additional export CSV(s) to merge (same columns as --export)",
    )
    parser.add_argument(
        "--overrides",
        type=Path,
        default=None,
        help='CSV with Product Handle + Product Id (fills gaps or overrides)',
    )
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()

    if not args.export.is_file():
        print(f"Not found: {args.export}", file=sys.stderr)
        sys.exit(1)
    for p in args.extra_export:
        if not p.is_file():
            print(f"Not found: {p}", file=sys.stderr)
            sys.exit(1)
    if args.overrides is not None and not args.overrides.is_file():
        print(f"Not found: {args.overrides}", file=sys.stderr)
        sys.exit(1)
    if not args.input.is_file():
        print(f"Not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    out_path = args.output or args.input

    handle_to_id: dict[str, str] = {}

    paths: list[tuple[Path, bool]] = [(args.export, False)] + [(p, False) for p in args.extra_export]
    for ep, _ in paths:
        rows, fh_ex, fp_ex = _load_export_file(ep)
        n = _merge_handle_to_id(
            handle_to_id, rows, fh_ex, fp_ex, overwrite=False, source=str(ep.name)
        )
        print(f"Merged {ep.name}: +{n} handles (running total {len(handle_to_id)} prod ids).")

    if args.overrides:
        n = _load_overrides_csv(args.overrides, handle_to_id)
        print(f"Overrides from {args.overrides.name}: applied {n} entries (total {len(handle_to_id)}).")

    with args.input.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            sys.exit("Import CSV has no header")
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
        print("Import CSV must include Product Handle and Product Id columns", file=sys.stderr)
        sys.exit(1)

    wanted: set[str] = set()
    for row in rows:
        h = (row.get(handle_key) or "").strip()
        if h:
            wanted.add(h)

    missing = sorted(wanted - set(handle_to_id.keys()))
    if missing:
        print(
            f"Warning: {len(missing)} import handles have no Product Id in export "
            f"(left blank / create path): {', '.join(missing[:12])}"
            + (" …" if len(missing) > 12 else ""),
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
