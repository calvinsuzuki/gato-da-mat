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
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGES_DIR = ROOT / "images"
THUMBS_DIR = IMAGES_DIR / "thumbs"
MANIFEST = ROOT / "images.json"
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}
VIDEO_EXT = {".mp4", ".mov", ".webm", ".m4v", ".ogv"}
SUPPORTED_EXT = IMAGE_EXT | VIDEO_EXT
FFMPEG = "ffmpeg"

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


def media_type(path: Path) -> str:
    return "video" if path.suffix.lower() in VIDEO_EXT else "image"


FILENAME_DATE_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
FILENAME_TIME_RE = re.compile(r"(\d{2})[.:\-_](\d{2})(?:[.:\-_](\d{2}))?")


def filename_date(name: str) -> datetime | None:
    """Find a YYYY-MM-DD date and an optional HH.MM[.SS] time after it.
    Handles WhatsApp pattern: 'YYYY-MM-DD at HH.MM.SS'."""
    dm = FILENAME_DATE_RE.search(name)
    if not dm:
        return None
    try:
        y, mo, d = int(dm.group(1)), int(dm.group(2)), int(dm.group(3))
        # Look for time only in the substring after the date.
        rest = name[dm.end():]
        h, mi, s = 0, 0, 0
        tm = FILENAME_TIME_RE.search(rest)
        if tm:
            h = int(tm.group(1))
            mi = int(tm.group(2))
            s = int(tm.group(3) or 0)
            if not (0 <= h < 24 and 0 <= mi < 60 and 0 <= s < 60):
                h, mi, s = 0, 0, 0
        return datetime(y, mo, d, h, mi, s)
    except ValueError:
        return None


def ffprobe_creation_time(path: Path) -> datetime | None:
    try:
        out = subprocess.check_output(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format_tags=creation_time",
                "-of", "default=nw=1:nk=1",
                str(path),
            ],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        if not out:
            return None
        # ISO 8601 with optional fractional seconds and Z.
        out = out.replace("Z", "+00:00")
        return datetime.fromisoformat(out).replace(tzinfo=None)
    except (subprocess.CalledProcessError, FileNotFoundError, ValueError):
        return None


def have_ffmpeg() -> bool:
    try:
        subprocess.run(
            [FFMPEG, "-version"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False


def video_poster(video_path: Path) -> Path | None:
    """Extract a JPEG thumbnail at ~0.5s into thumbs/. Cache by mtime."""
    THUMBS_DIR.mkdir(exist_ok=True)
    out = THUMBS_DIR / (video_path.stem + ".jpg")
    if out.exists() and out.stat().st_mtime >= video_path.stat().st_mtime:
        return out
    if not have_ffmpeg():
        return None
    cmd = [
        FFMPEG, "-y", "-loglevel", "error",
        "-ss", "0.5", "-i", str(video_path),
        "-frames:v", "1",
        "-vf", "scale=720:-2:flags=bicubic",
        "-q:v", "4",
        str(out),
    ]
    try:
        subprocess.run(cmd, check=True)
        return out
    except subprocess.CalledProcessError:
        if out.exists():
            out.unlink()
        return None


def photo_date(path: Path) -> datetime | None:
    """Capture timestamp from metadata. Stable across machines:
    EXIF (image) / ffprobe (video) → filename date. Returns None if unknown."""
    if media_type(path) == "video":
        dt = ffprobe_creation_time(path)
        if dt:
            return dt
    else:
        try:
            from PIL import Image, UnidentifiedImageError
            with Image.open(path) as img:
                exif = img.getexif()
                for tag in (EXIF_DATETIME_ORIGINAL, EXIF_DATETIME):
                    dt = parse_exif_dt(exif.get(tag))
                    if dt:
                        return dt
        except (ImportError, UnidentifiedImageError, OSError, AttributeError):
            pass

    return filename_date(path.name)


def collect_images() -> list[dict]:
    if not IMAGES_DIR.exists():
        return []
    rows = []
    for p in IMAGES_DIR.iterdir():
        if not p.is_file():
            continue
        if p.suffix.lower() not in SUPPORTED_EXT:
            continue
        kind = media_type(p)
        poster = None
        if kind == "video":
            thumb = video_poster(p)
            if thumb is not None:
                poster = f"thumbs/{thumb.name}"
        rows.append((photo_date(p), p.name, kind, poster))

    # Sort: dated files first (newest → oldest), undated files last (by filename desc).
    DATED = 0
    UNDATED = 1
    rows.sort(
        key=lambda e: (UNDATED if e[0] is None else DATED, -(e[0].timestamp() if e[0] else 0), e[1].lower())
    )
    out = []
    for _, name, kind, poster in rows:
        entry = {"file": name, "type": kind}
        if poster:
            entry["poster"] = poster
        out.append(entry)
    return out


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
        # Still pull in case remote has bot commits we don't have locally.
        git("pull", "--rebase", "--autostash")
        return 0
    if git("commit", "-m", "Add image") != 0:
        return 1
    # Pull remote changes (e.g. bot manifest commits) before pushing.
    if git("pull", "--rebase", "--autostash") != 0:
        print("Rebase failed. Resolve conflicts manually, then run: git push", file=sys.stderr)
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
