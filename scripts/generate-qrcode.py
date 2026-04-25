#!/usr/bin/env python3
"""Generate a QR code PNG for the site, with a cat emoji in the center.

Usage:
    python3 scripts/generate-qrcode.py
    python3 scripts/generate-qrcode.py --url https://example.com --out qr.png

Install dependency:
    pip install "qrcode[pil]"
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

DEFAULT_URL = "https://calvinsuzuki.github.io/gato-da-mat/"
DEFAULT_OUT = Path(__file__).resolve().parent.parent / "qrcode.png"
EMOJI_FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
    "/System/Library/Fonts/Apple Color Emoji.ttc",
    "/usr/share/fonts/google-noto-emoji/NotoColorEmoji.ttf",
    "C:/Windows/Fonts/seguiemj.ttf",
]
NOTO_NATIVE_SIZE = 109  # Noto Color Emoji bitmap strike size


def find_emoji_font() -> Path | None:
    for p in EMOJI_FONT_CANDIDATES:
        path = Path(p)
        if path.exists():
            return path
    return None


def render_emoji(emoji: str, target_px: int) -> "PIL.Image.Image":
    from PIL import Image, ImageDraw, ImageFont

    font_path = find_emoji_font()
    if font_path is None:
        raise RuntimeError("No color emoji font found on system.")

    # Noto Color Emoji is a bitmap-only font: must load at native size,
    # then scale.
    font = ImageFont.truetype(str(font_path), NOTO_NATIVE_SIZE)

    canvas = Image.new("RGBA", (NOTO_NATIVE_SIZE * 2, NOTO_NATIVE_SIZE * 2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    try:
        draw.text(
            (NOTO_NATIVE_SIZE // 2, NOTO_NATIVE_SIZE // 2),
            emoji,
            font=font,
            embedded_color=True,
        )
    except TypeError:
        raise RuntimeError("Pillow >= 9.2 required for embedded_color emoji rendering.")

    bbox = canvas.getbbox()
    if bbox:
        canvas = canvas.crop(bbox)

    canvas.thumbnail((target_px, target_px), Image.LANCZOS)
    return canvas


def overlay_emoji(qr_img, emoji: str, square_ratio: float = 0.22):
    from PIL import Image, ImageDraw

    qr_img = qr_img.convert("RGBA")
    w, h = qr_img.size
    square_size = int(min(w, h) * square_ratio)
    pad = max(4, square_size // 12)

    # White square with rounded corners.
    sx0 = (w - square_size) // 2
    sy0 = (h - square_size) // 2
    overlay = Image.new("RGBA", qr_img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    radius = square_size // 8
    draw.rounded_rectangle(
        [sx0, sy0, sx0 + square_size, sy0 + square_size],
        radius=radius,
        fill=(255, 255, 255, 255),
    )
    qr_img = Image.alpha_composite(qr_img, overlay)

    # Emoji image fits inside square minus padding.
    inner = square_size - 2 * pad
    emoji_img = render_emoji(emoji, inner)
    ex = (w - emoji_img.width) // 2
    ey = (h - emoji_img.height) // 2
    qr_img.alpha_composite(emoji_img, (ex, ey))
    return qr_img


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a QR code PNG.")
    parser.add_argument("--url", default=DEFAULT_URL, help="URL to encode")
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help="Output PNG path",
    )
    parser.add_argument("--size", type=int, default=10, help="Box size in pixels")
    parser.add_argument("--border", type=int, default=4, help="Quiet zone width")
    parser.add_argument("--fg", default="#0a0a0a", help="Foreground color")
    parser.add_argument("--bg", default="#ffffff", help="Background color")
    parser.add_argument("--emoji", default="🐈", help="Emoji to embed in center (empty = none)")
    parser.add_argument(
        "--square-ratio",
        type=float,
        default=0.22,
        help="Center square size as fraction of QR width (max ~0.30 with H ECC)",
    )
    args = parser.parse_args()

    try:
        import qrcode
        from qrcode.constants import ERROR_CORRECT_H
    except ImportError:
        print(
            'Missing dependency "qrcode". Install:\n  pip install "qrcode[pil]"',
            file=sys.stderr,
        )
        return 1

    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_H,
        box_size=args.size,
        border=args.border,
    )
    qr.add_data(args.url)
    qr.make(fit=True)

    img = qr.make_image(fill_color=args.fg, back_color=args.bg)

    if args.emoji:
        try:
            img = overlay_emoji(img, args.emoji, args.square_ratio)
        except RuntimeError as e:
            print(f"Skipping emoji overlay: {e}", file=sys.stderr)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    img.save(args.out)
    print(f"Wrote {args.out} ({args.url})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
