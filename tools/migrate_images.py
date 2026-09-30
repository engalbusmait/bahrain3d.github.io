#!/usr/bin/env python3
"""
One-time migration: extract base64 images embedded in data/products.json and write
optimized image files, then rewrite products.json to use relative paths.

For every product image (a `data:` URI) it writes, under images/products/<productId>/:
  - <n>.webp         full image,  max 1200px long side, quality ~80
  - <n>-thumb.webp   thumbnail,   max  480px long side, quality ~75
and, from the product's FIRST image:
  - og.jpg           1200x630 JPEG (center-cropped) kept under ~250 KB
    (WhatsApp / Instagram previews don't reliably support WebP, so OG stays JPEG.)

The base64 strings in products.json are replaced with the full-image path
(e.g. "images/products/p_nameplate/0.webp"). Thumb and OG paths are derived by
convention on the site side, so products.json stays tiny.

A short content-hash is written to products.json as top-level "version" for cache
busting. Values that are already paths (not data: URIs) are left untouched, so the
script is safe to re-run.

Requires: Pillow  (pip install Pillow)
Usage:    python tools/migrate_images.py         # run from the repo root
"""

import base64
import hashlib
import io
import json
import os
import re
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required. Install it with:  pip install Pillow")

# ---- config ----
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRODUCTS_JSON = os.path.join(ROOT, "data", "products.json")
IMG_ROOT_REL = os.path.join("images", "products")   # relative path stored in json
IMG_ROOT_ABS = os.path.join(ROOT, "images", "products")

FULL_MAX = 1200
FULL_Q = 80
THUMB_MAX = 480
THUMB_Q = 75
OG_W, OG_H = 1200, 630
OG_MAX_BYTES = 250 * 1024

DATA_URI_RE = re.compile(r"^data:image/[^;]+;base64,(.*)$", re.IGNORECASE | re.DOTALL)


def human(n):
    for unit in ("B", "KB", "MB"):
        if n < 1024 or unit == "MB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{n} B"
        n /= 1024


def load_data_uri(uri):
    """Return a PIL image from a data: URI, or None if it isn't one."""
    m = DATA_URI_RE.match(uri.strip())
    if not m:
        return None
    raw = base64.b64decode(m.group(1))
    return Image.open(io.BytesIO(raw))


def fit(img, max_side):
    """Return a copy scaled so its long side <= max_side (never upscales)."""
    w, h = img.size
    scale = min(1.0, max_side / float(max(w, h)))
    if scale >= 1.0:
        return img.copy()
    return img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)


def to_rgb(img, bg=(255, 255, 255)):
    """Flatten transparency onto a white background and return RGB."""
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        canvas = Image.new("RGB", img.size, bg)
        canvas.paste(img, mask=img.split()[-1])
        return canvas
    return img.convert("RGB")


def save_webp(img, path, max_side, quality):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out = to_rgb(fit(img, max_side))
    out.save(path, "WEBP", quality=quality, method=6)
    return os.path.getsize(path)


def save_og(img, path):
    """Center-crop to 1200x630 and save JPEG under OG_MAX_BYTES."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    src = to_rgb(img)
    sw, sh = src.size
    target = OG_W / OG_H
    if sw / sh > target:                       # too wide -> crop width
        nw = int(sh * target)
        left = (sw - nw) // 2
        src = src.crop((left, 0, left + nw, sh))
    else:                                       # too tall -> crop height
        nh = int(sw / target)
        top = (sh - nh) // 2
        src = src.crop((0, top, sw, top + nh))
    src = src.resize((OG_W, OG_H), Image.LANCZOS)
    q = 85
    while q >= 40:
        src.save(path, "JPEG", quality=q, optimize=True, progressive=True)
        if os.path.getsize(path) <= OG_MAX_BYTES:
            break
        q -= 5
    return os.path.getsize(path)


def content_version(data):
    payload = {k: v for k, v in data.items() if k != "version"}
    blob = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha1(blob).hexdigest()[:8]


def main():
    before = os.path.getsize(PRODUCTS_JSON)
    with open(PRODUCTS_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    products = data.get("products", [])
    total_new_bytes = 0
    n_full = n_thumb = n_og = n_skipped = 0

    for p in products:
        pid = p.get("id") or "unknown"
        images = p.get("images") or []
        new_paths = []
        first_img_obj = None

        for idx, val in enumerate(images):
            if not isinstance(val, str):
                continue
            img = load_data_uri(val)
            if img is None:
                # already a path (or something non-data) -> keep as-is
                new_paths.append(val)
                n_skipped += 1
                continue

            if first_img_obj is None:
                first_img_obj = img.copy()

            full_rel = os.path.join(IMG_ROOT_REL, pid, f"{idx}.webp").replace("\\", "/")
            thumb_rel = os.path.join(IMG_ROOT_REL, pid, f"{idx}-thumb.webp").replace("\\", "/")
            full_abs = os.path.join(ROOT, full_rel)
            thumb_abs = os.path.join(ROOT, thumb_rel)

            total_new_bytes += save_webp(img, full_abs, FULL_MAX, FULL_Q); n_full += 1
            total_new_bytes += save_webp(img, thumb_abs, THUMB_MAX, THUMB_Q); n_thumb += 1
            new_paths.append(full_rel)

        p["images"] = new_paths

        if first_img_obj is not None:
            og_rel = os.path.join(IMG_ROOT_REL, pid, "og.jpg").replace("\\", "/")
            og_abs = os.path.join(ROOT, og_rel)
            total_new_bytes += save_og(first_img_obj, og_abs); n_og += 1

    data["version"] = content_version(data)

    with open(PRODUCTS_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    after = os.path.getsize(PRODUCTS_JSON)

    print("=" * 56)
    print("  Image migration report")
    print("=" * 56)
    print(f"  products.json : {human(before)}  ->  {human(after)}")
    print(f"  full webp     : {n_full}")
    print(f"  thumb webp    : {n_thumb}")
    print(f"  og jpg        : {n_og}")
    print(f"  already paths : {n_skipped} (left untouched)")
    print(f"  image weight  : {human(total_new_bytes)} on disk (new files)")
    print(f"  data version  : {data['version']}")
    print("=" * 56)


if __name__ == "__main__":
    main()
