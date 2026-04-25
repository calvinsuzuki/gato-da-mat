#!/usr/bin/env python3
"""Scan images/ and write images.json sorted newest-first by EXIF date.

Sort key (descending):
    1. EXIF DateTimeOriginal (when photo was taken)
    2. EXIF DateTime (fallback)
    3. File mtime (last fallback)
    4. Filename (final tiebreak)

Usage:
    python3 scripts/generate-manifest.py
    python3 scripts/generate-manifest.py --push
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGES_DIR = ROOT / "images"
MANIFEST = ROOT / "images.json"
SUPPORTED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}

EXIF_DATETIME_ORIGINAL = 36867
EXIF_DATETIME = 306


def parse_exif_dt(raw: str | None) -> datetime | None:
    if not raw or not isinstance(raw, str):
        return None
    raw = raw.strip().rstrip("\x00")
    for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y:%m:%d %H:%M"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None


def photo_date(path: Path) -> datetime:
    """Best-available timestamp for ordering. Returns mtime if EXIF unavailable."""
    try:
        from PIL import Image, UnidentifiedImageError
    except ImportError:
        return datetime.fromtimestamp(path.stat().st_mtime)

    try:
        with Image.open(path) as img:
            exif = img.getexif()
            for tag in (EXIF_DATETIME_ORIGINAL, EXIF_DATETIME):
                dt = parse_exif_dt(exif.get(tag))
                if dt:
                    return dt
    except (UnidentifiedImageError, OSError, AttributeError):
        pass

    return datetime.fromtimestamp(path.stat().st_mtime)


def collect_images() -> list[dict]:
    if not IMAGES_DIR.exists():
        return []
    entries = []
    for p in IMAGES_DIR.iterdir():
        if not p.is_file():
            continue
        if p.suffix.lower() not in SUPPORTED_EXT:
            continue
        entries.append((photo_date(p), p.name))

    # Newest first, then filename desc as tiebreak.
    entries.sort(key=lambda e: (e[0], e[1]), reverse=True)
    return [{"file": name} for _, name in entries]


def write_manifest(items: list[dict]) -> None:
    MANIFEST.write_text(json.dumps(items, ensure_ascii=False) + "\n", encoding="utf-8")


def git(*args: str) -> int:
    return subprocess.call(["git", *args], cwd=ROOT)


def git_capture(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True)


def push_changes() -> int:
    print("\n→ Staging, committing, pushing...")
    if git("add", ".") != 0:
        return 1
    status = git_capture("diff", "--staged", "--name-only").strip()
    if not status:
        print("Nothing to commit.")
        return 0
    if git("commit", "-m", "Add image") != 0:
        return 1
    return git("push")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--push", action="store_true", help="git add . + commit + push after writing manifest")
    args = parser.parse_args()

    items = collect_images()
    write_manifest(items)
    print(f"Wrote {MANIFEST.relative_to(ROOT)} ({len(items)} entries):")
    for it in items:
        print(f"  {it['file']}")

    if args.push:
        return push_changes()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
