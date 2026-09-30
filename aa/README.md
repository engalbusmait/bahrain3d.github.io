# Bahrain3D — 3D printed products store

A fast, bilingual (English / العربية) online store for custom 3D‑printed products, built to run entirely on **GitHub Pages** (no server, no database, free hosting).

Customers browse products, pick options (size, color, …), and add to cart. At checkout the site creates a **unique order number** and:

- **On a computer** → shows a **QR code**. The customer scans it with their phone, which opens **WhatsApp** with the whole order already written out — they just tap send.
- **On a phone** → shows a **Send order on WhatsApp** button that does the same in one tap.

The order text sent to you is always in **English** (to avoid encoding/length problems), and includes the order number, every item with its chosen options, and the total. You confirm the final price and payment in the WhatsApp chat.

---

## Files

```
index.html              Storefront (what customers see)
admin.html              Private catalog builder (only you use this)
CNAME                   Custom domain (bahrain3d.com)
.nojekyll               Tells GitHub Pages to serve files as-is
data/
  products.json         Your store: settings + colors/materials library + products + images (the file you edit)
assets/
  css/styles.css        Storefront styling
  js/store.js           Storefront logic (cart, checkout, QR, WhatsApp)
  js/admin.js           Admin logic
  js/i18n.js            English/Arabic UI text
  js/qrcode.min.js      QR code generator (MIT licensed)
  img/favicon.svg       Site icon
```

---

## Managing your products (the admin page)

1. Open **`admin.html`** in your browser (locally or at `https://bahrain3d.com/admin.html`).
2. Set your **brand name, WhatsApp number, and currency** under *Store settings*. (Number = country code + number, digits only, e.g. `97333XXXXXX`.)
3. **Define your Colors & Materials library once.** In the *Colors & Materials library* section, first add your **materials** (PLA, PETG, Resin…), then add each **color** and pick which material it belongs to (via a dropdown). Colors and materials have **no prices** — they're just choices.
4. **Add products.** For each product you set English + Arabic name/description, a base price, **one or more photos** (auto‑resized; the first is the main photo shown on the card, the rest form a gallery — drag order with the ★ / ‹ / › buttons), and then set up its **color parts**:
   - Each product has one or more **color parts**. A simple product has a single part (leave its name blank → shows as "Color"). For a multi‑color print, click **＋ Add color part** and name them (e.g. "Base color", "Top color") — the customer then picks one color per part, and each appears separately in the order.
   - For each part you just **tick the material+color combos** you offer (from your library). The customer sees choices like "PETG – Black".
   - For anything else (e.g. **Size** → Small / Medium / Large) use *Other option groups*, where each choice can add to the price.
   - Editing a color/material in the library later updates it across **every** product that uses it.
5. **Discount codes (optional).** In the *Discount codes* section, add codes with a percentage (e.g. `WELCOME10` = 10%). At checkout the customer can enter a code to get that percentage off; the code and discount are written into the WhatsApp order so you can verify it.
6. Everything **autosaves in your browser** as you type — closing the tab won't lose your work.
7. Click **⬇ Download products.json**.
8. **Upload that one file to GitHub**, replacing `data/products.json` (see below). Images are embedded inside it, so it's the only file you upload.

> The admin page never touches the live site by itself — you always control what goes public by uploading the file.

To keep editing later: reopen `admin.html` (it loads your last local draft), or click **Load live file** to pull whatever is currently published, or **Import JSON** to load a `products.json` you saved.

---

## Publishing to GitHub Pages

### First-time setup
1. Create a GitHub repo (public), e.g. `bahrain3d`.
2. Upload all the files in this folder to the repo (drag-and-drop in GitHub's web UI works, or use git).
3. Repo → **Settings → Pages** → *Build and deployment* → **Source: Deploy from a branch**, Branch: `main` / root. Save.
4. Wait ~1 minute; your site appears at `https://<username>.github.io/<repo>/`.

### Custom domain (bahrain3d.com)
1. The included **`CNAME`** file already points the repo at `bahrain3d.com`.
2. At your domain registrar, add these **DNS records**:
   - Four `A` records for the apex `bahrain3d.com` →
     `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - One `CNAME` record for `www` → `<username>.github.io`
3. Repo → **Settings → Pages → Custom domain** → enter `bahrain3d.com`, Save, and tick **Enforce HTTPS** once it's available (can take up to 24h for the certificate).

### Updating products later
- Edit in `admin.html` → **Download products.json** → in your repo open `data/products.json` → **Edit / Upload** the new file → commit. The site updates within a minute.

---

## Notes & options for the future
- **Payments** are arranged over WhatsApp (cash on delivery / transfer / BenefitPay). GitHub Pages can't process card payments; if you ever want online card payment we'd add a payment provider (e.g. Tap Payments) which needs a small backend.
- The QR encodes the WhatsApp link directly, so no third‑party QR service is used and it works offline once loaded.
- Order numbers look like `BH3-YYMMDD-XXXX` and are generated per order.
