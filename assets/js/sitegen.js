/* ==========================================================================
   Bahrain3D — sitegen (shared page/SEO generator)
   ONE source of truth for slugs, min-price, and all pre-rendered HTML + SEO.
   Runs in the browser (admin "Export site package") AND in Node (tools export),
   so the site's crawlable HTML is generated identically in both places.
   ========================================================================== */
(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) module.exports = mod;   // Node
  else root.SiteGen = mod;                                                   // browser
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const BASE = "https://bahrain3d.com";   // absolute site origin (custom domain)

  /* ---------- small helpers ---------- */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const escAttr = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // JSON-LD: JSON with "<" neutralized so a value can't close the <script> early
  const jsonLd = (obj) => JSON.stringify(obj, null, 2).replace(/</g, "\\u003c");

  const L = (obj, base, lang) => (obj && (obj[base + "_" + lang] || obj[base + "_en"])) || "";
  const decimalsFor = (currency) => (currency === "BHD" ? 3 : 2);
  const money = (n, currency) => Number(n || 0).toFixed(decimalsFor(currency));

  function clampDesc(s, n) {
    s = String(s || "").replace(/\s+/g, " ").trim();
    n = n || 155;
    if (s.length <= n) return s;
    return s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
  }

  /* ---------- slugs (unique, stable by product order) ---------- */
  function slugify(str) {
    const s = String(str || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return s || "product";
  }
  const _slugCache = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  function slugMap(products) {
    products = products || [];
    if (_slugCache && _slugCache.has(products)) return _slugCache.get(products);
    const used = {}, map = {};
    products.forEach(p => {
      let base = slugify(p.name_en || p.name_ar || p.id), s = base, i = 2;
      while (used[s]) s = base + "-" + (i++);
      used[s] = true;
      map[p.id] = s;
    });
    if (_slugCache) _slugCache.set(products, map);
    return map;
  }
  const slugFor = (p, products) => slugMap(products)[p.id] || slugify(p.name_en || p.id);
  const productPath = (p, products) => "/p/" + slugFor(p, products) + "/";
  const productUrl = (p, products) => BASE + productPath(p, products);

  /* ---------- images (mirror store.js conventions) ---------- */
  const imgsOf = (p) => (Array.isArray(p.images) && p.images.length) ? p.images : (p.image ? [p.image] : []);
  const isPath = (s) => typeof s === "string" && !!s && !s.startsWith("data:");
  const thumbOf = (s) => isPath(s) ? s.replace(/\.(webp|jpe?g|png)$/i, "-thumb.webp") : s;
  // og.jpg lives beside the product's first image; absolute URL for social embeds
  function ogUrl(p, data) {
    const first = imgsOf(p)[0];
    if (isPath(first)) return BASE + "/" + first.replace(/[^/]+$/, "og.jpg");
    return BASE + "/assets/img/og-default.jpg";
  }
  const absImg = (s) => isPath(s) ? (BASE + "/" + s.replace(/^\/+/, "")) : s;

  /* ---------- min price (same rule as store.js productMinPrice) ---------- */
  function minPrice(p) {
    let min = Number(p.price) || 0;
    (p.options || []).forEach(g => {
      if (g.type === "text") { if (g.required) min += Number(g.priceDelta) || 0; return; }
      const deltas = (g.values || []).map(v => Number(v.priceDelta) || 0);
      if (deltas.length) min += Math.min(...deltas);
    });
    return min;
  }

  /* ---------- color swatches for a card (mirror store.js getOptions) ---------- */
  function cardSwatches(p, data) {
    const lib = (data && data.library) || {};
    const colors = lib.colors || [];
    const parts = Array.isArray(p.colorParts) && p.colorParts.length
      ? p.colorParts
      : (Array.isArray(p.colors) && p.colors.length ? [{ colors: p.colors }] : []);
    if (!parts.length) return [];
    const ids = parts[0].colors || [];
    return ids.map(id => colors.find(c => c.id === id)).filter(Boolean).slice(0, 5)
      .map(c => c.swatch || "#ccc");
  }

  /* ---------- shared chrome ---------- */
  const CART_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';
  const WA_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.13c-.24.68-1.42 1.32-1.95 1.36-.5.05-1.13.24-3.8-.79-3.2-1.26-5.24-4.5-5.4-4.71-.16-.21-1.3-1.72-1.3-3.28 0-1.56.82-2.33 1.11-2.65.29-.32.63-.4.84-.4.21 0 .42 0 .6.01.19.01.45-.07.7.53.24.6.83 2.07.9 2.22.07.15.12.32.02.53-.1.21-.15.32-.3.5-.15.18-.32.4-.45.53-.15.15-.31.32-.13.63.18.32.79 1.3 1.69 2.11 1.16 1.03 2.14 1.35 2.45 1.5.31.15.5.13.68-.08.18-.21.79-.92.99-1.24.21-.32.42-.26.7-.16.29.11 1.82.86 2.13 1.01.31.16.52.24.6.37.07.13.07.74-.17 1.42Z"/></svg>';
  const LOGO = '<picture><source srcset="/assets/img/logo.webp" type="image/webp"><img class="logo" src="/assets/img/logo.png" alt="Bahrain3D logo" width="38" height="38" decoding="async"></picture>';

  function header(brand) {
    return `  <header class="site-header">
    <div class="container">
      <a class="brand" href="/">${LOGO}<span><span id="brandName">${esc(brand)}</span></span></a>
      <div class="header-spacer"></div>
      <div class="header-actions">
        <button class="lang-toggle" id="langToggle">العربية</button>
        <button class="cart-btn" id="cartBtn">${CART_SVG}<span data-i18n="cart">Cart</span><span class="cart-count" id="cartCount">0</span></button>
      </div>
    </div>
  </header>`;
  }
  function footer(brand) {
    return `  <footer class="site-footer">
    <div class="container">
      <div class="brand">${LOGO} <span id="brandName2">${esc(brand)}</span></div>
      <span class="muted">© <span id="year"></span> <span data-cfg="tagline">${esc(brand)}</span>. <span data-i18n="footer_rights">All rights reserved.</span></span>
      <a class="wa-link" data-wa href="#" target="_blank" rel="noopener">${WA_SVG}<span data-i18n="contact_wa">Contact us on WhatsApp</span></a>
    </div>
  </footer>`;
  }
  const OVERLAYS = `  <div class="drawer-scrim" id="drawerScrim"></div>
  <aside class="drawer" id="drawer" aria-label="Cart">
    <div class="drawer-head">
      <h3 data-i18n="your_cart">Your cart</h3>
      <button class="modal-close" style="position:static" id="drawerClose" aria-label="Close">×</button>
    </div>
    <div class="drawer-body" id="drawerBody"></div>
    <div class="drawer-foot hidden" id="drawerFoot">
      <div class="summary-total"><span data-i18n="total">Total</span><span><span id="cartTotal">0</span> <span id="cartCurrency">BHD</span></span></div>
      <button class="btn btn-primary btn-lg btn-block" id="checkoutBtn" data-i18n="checkout">Checkout</button>
    </div>
  </aside>
  <div class="overlay" id="checkoutModal">
    <div class="modal" style="max-width:520px"><button class="modal-close" aria-label="Close">×</button><div class="modal-inner"></div></div>
  </div>
  <div class="toast" id="toast"></div>`;

  const FONT_HEAD = `  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">`;

  function scripts(dataVersion, extraInline) {
    return `  <script>window.__DATA_VERSION__=${JSON.stringify(String(dataVersion || ""))};${extraInline || ""}</script>
  <script src="/assets/js/qrcode.min.js"></script>
  <script src="/assets/js/i18n.js"></script>
  <script src="/assets/js/sitegen.js"></script>
  <script src="/assets/js/store.js"></script>
  <script>document.getElementById("year").textContent=new Date().getFullYear();</script>`;
  }

  /* ---------- meta / OG / twitter ---------- */
  function ogBlock(o) {
    // o: {type, title, desc, url, image, imageW, imageH, extra:[]}
    const lines = [
      `<meta property="og:type" content="${escAttr(o.type)}">`,
      `<meta property="og:site_name" content="Bahrain3D">`,
      `<meta property="og:title" content="${escAttr(o.title)}">`,
      `<meta property="og:description" content="${escAttr(o.desc)}">`,
      `<meta property="og:url" content="${escAttr(o.url)}">`,
      `<meta property="og:locale" content="ar_BH">`,
      `<meta property="og:locale:alternate" content="en_US">`,
      `<meta property="og:image" content="${escAttr(o.image)}">`,
      `<meta property="og:image:width" content="${o.imageW || 1200}">`,
      `<meta property="og:image:height" content="${o.imageH || 630}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${escAttr(o.title)}">`,
      `<meta name="twitter:description" content="${escAttr(o.desc)}">`,
      `<meta name="twitter:image" content="${escAttr(o.image)}">`
    ].concat(o.extra || []);
    return lines.map(s => "  " + s).join("\n");
  }

  /* ---------- JSON-LD ---------- */
  function jsonLdOrg(data) {
    const cfg = data.config || {};
    const wa = String(cfg.whatsapp || "").replace(/\D/g, "");
    return {
      "@context": "https://schema.org", "@type": "Organization",
      name: cfg.brand || "Bahrain3D", url: BASE + "/", logo: BASE + "/assets/img/logo.png",
      contactPoint: wa ? [{ "@type": "ContactPoint", contactType: "sales", telephone: "+" + wa, availableLanguage: ["ar", "en"] }] : undefined
    };
  }
  function jsonLdWebsite(data) {
    return { "@context": "https://schema.org", "@type": "WebSite", name: (data.config || {}).brand || "Bahrain3D", url: BASE + "/", inLanguage: ["ar", "en"] };
  }
  function jsonLdProduct(p, data) {
    const cfg = data.config || {};
    const currency = cfg.currency || "BHD";
    const desc = clampDesc((p.desc_en || p.desc_ar || ""), 300);
    const images = imgsOf(p).map(absImg).filter(Boolean);
    return {
      "@context": "https://schema.org", "@type": "Product",
      name: (p.name_en || p.name_ar || "").trim(),
      description: desc || undefined,
      image: images.length ? images : [ogUrl(p, data)],
      sku: p.id, brand: { "@type": "Brand", name: cfg.brand || "Bahrain3D" },
      offers: {
        "@type": "Offer",
        price: money(minPrice(p), currency),
        priceCurrency: currency,
        availability: "https://schema.org/InStock",
        url: productUrl(p, data.products || [])
      }
    };
  }
  function jsonLdBreadcrumb(p, data) {
    return {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: BASE + "/" },
        { "@type": "ListItem", position: 2, name: (p.name_en || p.name_ar || "").trim(), item: productUrl(p, data.products || []) }
      ]
    };
  }

  /* ---------- product card (matches store.js markup so design is identical) ---------- */
  function productCard(p, data) {
    const cfg = data.config || {};
    const currency = cfg.currency || "BHD";
    const imgs = imgsOf(p);
    const first = imgs[0];
    const thumbSrc = isPath(first) ? "/" + thumbOf(first).replace(/^\/+/, "") : thumbOf(first);
    const media = first
      ? `<img src="${escAttr(thumbSrc)}" alt="${escAttr(p.name_en || "")}" decoding="async" loading="lazy" width="400" height="300">`
      : PLACEHOLDER;
    const count = imgs.length > 1
      ? `<span class="media-count"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M7 21h12a2 2 0 0 0 2-2V9"/></svg>${imgs.length}</span>`
      : "";
    const sw = cardSwatches(p, data).map(c => `<span class="dot" style="background:${escAttr(c)}"></span>`).join("");
    return `<a class="card" href="${escAttr(productPath(p, data.products || []))}">
        <div class="card-media">${media}${count}</div>
        <div class="card-body">
          <h3 class="card-title">${esc(p.name_en || "")}</h3>
          <p class="card-desc">${esc(clampDesc(p.desc_en || "", 120))}</p>
          ${sw ? `<div class="card-swatches">${sw}</div>` : ""}
          <div class="card-foot">
            <span class="price"><span class="from">from</span>${money(minPrice(p), currency)}<span class="cur">${esc(currency)}</span></span>
            <span class="btn btn-primary card-cta">View</span>
          </div>
        </div>
      </a>`;
  }
  const PLACEHOLDER = `<div class="ph"><div class="ph-inner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05"/><path d="M12 22.08V12"/></svg></div></div>`;

  /* ---------- full pages ---------- */
  function buildIndexHtml(data) {
    const cfg = data.config || {};
    const brand = cfg.brand || "Bahrain3D";
    const currency = cfg.currency || "BHD";
    const title = `${brand} — Custom 3D printed products`;
    const desc = clampDesc(cfg.tagline_en || "Custom 3D-printed products made in Bahrain. Choose your size and color and order on WhatsApp.");
    const gsv = (cfg.google_site_verification || "").trim();
    const cards = (data.products || []).map(p => productCard(p, data)).join("\n      ");
    const og = ogBlock({ type: "website", title, desc, url: BASE + "/", image: BASE + "/assets/img/og-default.jpg" });
    const head = `  <title>${esc(title)}</title>
  <meta name="description" content="${escAttr(desc)}">
  <link rel="canonical" href="${BASE}/">
${gsv ? `  <meta name="google-site-verification" content="${escAttr(gsv)}">\n` : ""}  <meta name="theme-color" content="#d81f2a">
  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
${FONT_HEAD}
  <link rel="stylesheet" href="/assets/css/styles.css">
${og}
  <script type="application/ld+json">
${jsonLd(jsonLdOrg(data))}
  </script>
  <script type="application/ld+json">
${jsonLd(jsonLdWebsite(data))}
  </script>`;
    const body = `${header(brand)}

  <section class="hero">
    <div class="container">
      <span class="eyebrow" data-cfg="tagline">${esc(cfg.tagline_en || "")}</span>
      <h1 data-cfg="hero_title">${esc(cfg.hero_title_en || "")}</h1>
      <p data-cfg="hero_subtitle">${esc(cfg.hero_subtitle_en || "")}</p>
      <a href="#shop" class="btn btn-primary btn-lg" data-i18n="shop_now">Shop now</a>
    </div>
  </section>

  <main class="section" id="shop">
    <div class="container">
      <div class="section-head">
        <div>
          <h2 data-i18n="all_products">All products</h2>
          <p data-i18n="all_products_sub">Pick a design, choose your options, and order on WhatsApp.</p>
        </div>
      </div>
      <div class="grid" id="grid">
      ${cards}
      </div>
    </div>
  </main>

${footer(brand)}

${OVERLAYS}`;
    return doc({ head, body, dataVersion: data.version });
  }

  function buildProductHtml(p, data) {
    const cfg = data.config || {};
    const brand = cfg.brand || "Bahrain3D";
    const currency = cfg.currency || "BHD";
    const nameEn = (p.name_en || "").trim();
    const nameAr = (p.name_ar || "").trim();
    const title = `${nameAr ? nameAr + " | " : ""}${nameEn} — ${brand}`;
    const desc = clampDesc(p.desc_ar || p.desc_en || "");
    const url = productUrl(p, data.products || []);
    const imgs = imgsOf(p);
    const mainImg = imgs[0] ? escAttr("/" + String(imgs[0]).replace(/^\/+/, "")) : "";
    const og = ogBlock({
      type: "product", title: `${nameEn}${nameAr ? " — " + nameAr : ""}`, desc, url,
      image: ogUrl(p, data),
      extra: [
        `<meta property="product:price:amount" content="${money(minPrice(p), currency)}">`,
        `<meta property="product:price:currency" content="${escAttr(currency)}">`
      ]
    });
    const head = `  <title>${esc(title)}</title>
  <meta name="description" content="${escAttr(desc)}">
  <link rel="canonical" href="${escAttr(url)}">
  <meta name="theme-color" content="#d81f2a">
  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
${FONT_HEAD}
  <link rel="stylesheet" href="/assets/css/styles.css">
${og}
  <script type="application/ld+json">
${jsonLd(jsonLdProduct(p, data))}
  </script>
  <script type="application/ld+json">
${jsonLd(jsonLdBreadcrumb(p, data))}
  </script>`;
    // Pre-rendered (crawlable, no-JS) content; store.js hydrates the interactive UI over it.
    const mediaHtml = mainImg
      ? `<div class="pd-main"><img id="pdMainImg" src="${mainImg}" alt="${escAttr(nameEn)}" width="800" height="600" decoding="async" loading="eager" fetchpriority="high"></div>`
      : `<div class="pd-main">${PLACEHOLDER}</div>`;
    const body = `${header(brand)}

  <main class="pd-page container" id="productDetail">
    <a class="back-link" href="/"><span class="back-arrow">‹</span> <span data-i18n="back_to_products">All products</span></a>
    <nav class="pd-breadcrumb" aria-label="Breadcrumb" style="font-size:13px;color:var(--text-soft);margin-bottom:10px">
      <a href="/">Home</a> / <span>${esc(nameEn)}</span>
    </nav>
    <div class="pd pd-full">
      <div class="pd-media" id="pdMedia">${mediaHtml}</div>
      <div class="pd-info" id="pdInfo">
        <h2>${esc(nameEn)}</h2>
        ${nameAr ? `<p class="pd-name-ar" dir="rtl" style="margin:0 0 6px;color:var(--text-soft)">${esc(nameAr)}</p>` : ""}
        <p class="pd-desc">${esc(clampDesc(p.desc_en || p.desc_ar || "", 400))}</p>
        <div class="pd-price">from ${money(minPrice(p), currency)}<span class="cur">${esc(currency)}</span></div>
      </div>
    </div>
  </main>

${footer(brand)}

${OVERLAYS}`;
    return doc({ head, body, dataVersion: data.version, extraInline: `window.__PRODUCT_ID__=${JSON.stringify(p.id)};` });
  }

  function doc(o) {
    return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
${o.head}
</head>
<body>

${o.body}

${scripts(o.dataVersion, o.extraInline)}
</body>
</html>
`;
  }

  /* ---------- sitemap + robots ---------- */
  function buildSitemap(data, lastmod) {
    lastmod = lastmod || new Date().toISOString().slice(0, 10);
    const urls = [BASE + "/"].concat((data.products || []).map(p => productUrl(p, data.products)));
    const body = urls.map(u =>
      `  <url><loc>${u}</loc><lastmod>${lastmod}</lastmod></url>`).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
  }
  function buildRobots() {
    return `User-agent: *
Allow: /
Disallow: /admin.html

Sitemap: ${BASE}/sitemap.xml
`;
  }

  /* ---------- convenience: everything the export needs ---------- */
  function buildAll(data, lastmod) {
    const pages = (data.products || []).map(p => ({
      path: productPath(p, data.products).replace(/^\//, "") + "index.html",  // p/<slug>/index.html
      url: productUrl(p, data.products),
      html: buildProductHtml(p, data)
    }));
    return {
      index: buildIndexHtml(data),
      products: pages,
      sitemap: buildSitemap(data, lastmod),
      robots: buildRobots()
    };
  }

  return {
    BASE, slugify, slugFor, productPath, productUrl, minPrice, money, clampDesc,
    thumbOf, ogUrl, cardSwatches, productCard,
    jsonLdOrg, jsonLdWebsite, jsonLdProduct, jsonLdBreadcrumb,
    buildIndexHtml, buildProductHtml, buildSitemap, buildRobots, buildAll
  };
});
