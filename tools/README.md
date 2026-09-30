# tools/

Helper scripts for the Bahrain3D static site. **None of these are needed for your
day-to-day workflow** (add product in `admin.html` → Export → upload to GitHub). They are
one-time / occasional maintenance helpers.

---

## `migrate_images.py` — one-time base64 → file migration

Older `products.json` files embedded every product photo as a giant base64 string, which
made the file several megabytes and slow to load. This script was run **once** to fix that:
it extracts each embedded image and writes optimized files, then rewrites `products.json`
to reference them by path.

For every product image it writes, under `images/products/<productId>/`:

| file              | purpose        | size            | quality |
|-------------------|----------------|-----------------|---------|
| `<n>.webp`        | full image     | max 1200px side | ~80     |
| `<n>-thumb.webp`  | grid thumbnail | max 480px side  | ~75     |
| `og.jpg`          | link preview   | 1200×630 JPEG   | ≤250 KB |

`og.jpg` is JPEG on purpose — WhatsApp/Instagram link previews don't reliably render WebP.
The thumbnail and OG paths are **derived by convention** on the site side, so
`products.json` only stores the full-image path (e.g. `images/products/p_nameplate/0.webp`).

A short content hash is written to `products.json` as `"version"` for cache-busting.

The script is **idempotent**: values that are already paths (not `data:` URIs) are left
untouched, so re-running it does nothing harmful.

### Run it

```bash
pip install Pillow        # one-time
python tools/migrate_images.py   # from the repo root
```

It prints a before/after size report. A safety copy of the original is in git history
(the `chore: baseline snapshot` commit) if you ever need the embedded version back.

> You normally never run this again. New images added through `admin.html` are already
> saved as WebP/JPG files inside the exported ZIP.

---

## `build.js` — regenerate the static site (Node)

Rebuilds the crawlable HTML + SEO files from `data/products.json` using the shared
generator `assets/js/sitegen.js`. Writes:

- `index.html` (homepage with pre-rendered product grid + Organization/WebSite JSON-LD)
- `p/<slug>/index.html` (one per product, with `<title>`, meta description, canonical,
  Open Graph/Twitter tags and Product + BreadcrumbList JSON-LD)
- `sitemap.xml` and `robots.txt`

```bash
node tools/build.js       # from the repo root
```

This produces the **same** output as the admin **Export site package** button (both use
`assets/js/sitegen.js` — one source of truth). Use whichever is convenient: the admin ZIP
for day-to-day edits, or this script if you're regenerating locally.

---

## Day-to-day workflow (no scripts needed)

1. Open `admin.html` **from the live site** (`https://bahrain3d.com/admin.html`) so it can
   read your existing product images.
2. Add/edit products, prices, discounts, delivery options, store text.
3. Click **Export site package (ZIP)**.
4. Unzip, then in GitHub: **Add file → Upload files**, drag the unzipped contents in, Commit.

A full Arabic walk-through is in **`GUIDE-AR.md`**.

### What the export contains
```
data/products.json          (tiny – image paths, not base64, + a version hash)
index.html                  (homepage)
p/<slug>/index.html         (one per product)
sitemap.xml  robots.txt
images/products/<id>/…       (webp full, webp thumb, og.jpg – for NEW images;
                              existing ones are copied through if admin was opened
                              from the live site)
```
Static assets you upload **once** and rarely touch: `assets/**`, `CNAME`, `.nojekyll`,
`assets/img/logo.webp`, `logo.png`, `favicon.svg`, `og-default.jpg`.

### After deploying, in Google Search Console
- Add/verify the property `bahrain3d.com` (paste the verification code into the admin
  **Google site verification** field, export, upload, then click Verify).
- Submit the sitemap: `https://bahrain3d.com/sitemap.xml`.
