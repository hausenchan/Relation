#!/usr/bin/env python3
"""Move the newest completed Zhixiao spreadsheet download to a canonical filename."""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path


DOWNLOAD_DIR = Path.home() / "Downloads"
TARGET_DIR = Path('/Users/chenhaozan/Documents/AI/Gcad/adOpt/支小应用数据报表')
SPREADSHEET_SUFFIXES = {".xls", ".xlsx", ".csv", ".tsv", ".xlsm", ".html"}
TEMP_SUFFIXES = {".crdownload", ".tmp", ".part", ".download"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Wait for the newest completed report download and move it to the Zhixiao report folder."
    )
    parser.add_argument("--downloads", default=str(DOWNLOAD_DIR), help="Browser downloads folder.")
    parser.add_argument("--target", default=str(TARGET_DIR), help="Destination report folder.")
    parser.add_argument("--filename", help="Exact destination filename, including extension.")
    parser.add_argument("--label", help="Legacy filename stem. Used only when --filename is omitted.")
    parser.add_argument(
        "--after-epoch",
        type=float,
        default=0,
        help="Only consider files modified after this Unix timestamp.",
    )
    parser.add_argument("--timeout", type=int, default=180, help="Seconds to wait for a completed download.")
    parser.add_argument(
        "--backup-existing",
        action="store_true",
        help="Rename an existing destination to a timestamped .bak file before replacing it.",
    )
    return parser.parse_args()


def is_candidate(path: Path, after_epoch: float) -> bool:
    if not path.is_file():
        return False
    suffix = path.suffix.lower()
    if suffix in TEMP_SUFFIXES or suffix not in SPREADSHEET_SUFFIXES:
        return False
    try:
        return path.stat().st_mtime >= after_epoch
    except OSError:
        return False


def newest_candidate(downloads: Path, after_epoch: float) -> Path | None:
    candidates = [path for path in downloads.iterdir() if is_candidate(path, after_epoch)]
    if not candidates:
        return None
    return max(candidates, key=lambda path: path.stat().st_mtime)


def wait_until_stable(path: Path, timeout: int) -> None:
    deadline = time.time() + timeout
    last_size = -1
    stable_checks = 0
    while time.time() < deadline:
        if not path.exists():
            stable_checks = 0
            time.sleep(1)
            continue
        size = path.stat().st_size
        if size > 0 and size == last_size:
            stable_checks += 1
            if stable_checks >= 2:
                return
        else:
            stable_checks = 0
            last_size = size
        time.sleep(1)
    raise TimeoutError(f"Download did not become stable: {path}")


def destination_name(args: argparse.Namespace, source: Path) -> str:
    if args.filename:
        name = Path(args.filename).name
    elif args.label:
        safe_label = "".join("_" if char in '<>:"/\\|?*' else char for char in args.label).strip()
        name = f"{safe_label or 'zhixiao-report'}{source.suffix}"
    else:
        raise ValueError("Pass --filename or --label.")

    if Path(name).suffix.lower() not in SPREADSHEET_SUFFIXES:
        raise ValueError(f"Destination filename must use a spreadsheet extension: {name}")
    return name


def backup_destination(destination: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = destination.with_name(f"{destination.stem}_{stamp}.bak{destination.suffix}")
    destination.replace(backup)
    return backup


def replace_destination(source: Path, destination: Path, backup_existing: bool) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp_destination = destination.with_name(
        f".{destination.stem}.incoming-{datetime.now().strftime('%Y%m%d%H%M%S')}{destination.suffix}"
    )

    shutil.move(str(source), str(temp_destination))
    if destination.exists():
        if backup_existing:
            backup_destination(destination)
        else:
            destination.unlink()
    os.replace(temp_destination, destination)


def main() -> int:
    args = parse_args()
    downloads = Path(args.downloads)
    target = Path(args.target)

    if not downloads.exists():
        print(f"[ERROR] Downloads folder does not exist: {downloads}", file=sys.stderr)
        return 2

    deadline = time.time() + args.timeout
    candidate = None
    while time.time() < deadline:
        candidate = newest_candidate(downloads, args.after_epoch)
        if candidate:
            try:
                wait_until_stable(candidate, min(30, args.timeout))
                break
            except TimeoutError:
                candidate = None
        time.sleep(1)

    if candidate is None:
        print("[ERROR] No completed spreadsheet download appeared before timeout.", file=sys.stderr)
        return 1

    try:
        destination = target / destination_name(args, candidate)
        replace_destination(candidate, destination, args.backup_existing)
    except Exception as exc:
        print(f"[ERROR] Failed to move download: {exc}", file=sys.stderr)
        return 3

    print(str(destination))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
