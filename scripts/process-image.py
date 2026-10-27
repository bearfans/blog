#!/usr/bin/env python3
"""Crop the Pollinations corner mark, normalize the aspect ratio, and save a
compressed JPEG suitable for the preview page and article images.

Usage:
    python3 scripts/process-image.py input output width height [crop_bottom]
"""
import sys

from PIL import Image


def main() -> int:
    if len(sys.argv) < 5:
        print("usage: process-image.py input output width height [crop_bottom]", file=sys.stderr)
        return 2

    src, dst = sys.argv[1], sys.argv[2]
    target_w, target_h = int(sys.argv[3]), int(sys.argv[4])
    crop_bottom = int(sys.argv[5]) if len(sys.argv) > 5 else 0

    image = Image.open(src).convert("RGB")
    width, height = image.size
    resample = getattr(Image, "Resampling", Image).LANCZOS

    if crop_bottom == 0:
        # Keep the whole frame (including any provider mark) and normalize size.
        image = image.resize((target_w, target_h), resample)
    else:
        if height > crop_bottom + 120:
            # The free Pollinations endpoint stamps a small mark in the bottom-right.
            image = image.crop((0, 0, width, height - crop_bottom))
            width, height = image.size

        # Scale to cover the target box, then center-crop. This keeps the aspect
        # ratio natural even if the provider returns a slightly different size.
        scale = max(target_w / width, target_h / height)
        new_w = max(target_w, int(round(width * scale)))
        new_h = max(target_h, int(round(height * scale)))
        image = image.resize((new_w, new_h), resample)

        left = max(0, (new_w - target_w) // 2)
        top = max(0, (new_h - target_h) // 2)
        image = image.crop((left, top, left + target_w, top + target_h))

    image.save(dst, "JPEG", quality=88, optimize=True, progressive=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
