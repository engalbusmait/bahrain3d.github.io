/* ==========================================================================
   Bahrain3D storefront logic
   ========================================================================== */
(function () {
  "use strict";

  const LS_CART = "b3d_cart";
  const LS_LANG = "b3d_lang";

  const state = {
    lang: localStorage.getItem(LS_LANG) || "en",
    config: {},
    library: { colors: [], materials: [] },
    discounts: [],
    discount: null,   // applied discount {code, percent}
    deliveryOptions: [],  // configured delivery/pickup methods {label_en, label_ar, price}
    delivery: null,       // chosen delivery method for the open checkout
    products: [],
    cart: loadCart(),
    current: null,        // product open in modal
    currentOptions: [],   // resolved option groups for the open product
    selection: {},        // option index -> chosen value object
    qty: 1
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const T = () => window.I18N[state.lang];
  const t = (k) => (T()[k] ?? k);

  /* ---------- data helpers ---------- */
  function loadCart() {
    try { return JSON.parse(localStorage.getItem(LS_CART)) || []; }
    catch { return []; }
  }
  function saveCart() { localStorage.setItem(LS_CART, JSON.stringify(state.cart)); }

  const L = (obj, base) => obj[`${base}_${state.lang}`] || obj[`${base}_en`] || "";
  const currency = () => state.config.currency || "BHD";
  const decimals = () => (currency() === "BHD" ? 3 : 2);
  const money = (n) => Number(n || 0).toFixed(decimals());
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Resolve a product's full list of option groups: its own custom groups (e.g. Size),
  // plus one combined Material+Color group built from the global library. Each library
  // color carries its material, so a choice is a single "PETG – Black"-style option.
  // A product's color "parts" (e.g. Base color, Top color). Supports legacy single `colors[]`.
  function getColorParts(p) {
    if (Array.isArray(p.colorParts) && p.colorParts.length) return p.colorParts;
    if (Array.isArray(p.colors) && p.colors.length) return [{ name_en: "", name_ar: "", colors: p.colors }];
    return [];
  }
  function partName(part, idx, count, lang) {
    const nm = lang === "ar" ? part.name_ar : part.name_en;
    if (nm) return nm;
    const base = lang === "ar" ? "اللون" : "Color";
    return count > 1 ? `${base} ${idx + 1}` : base;
  }

  function getOptions(p) {
    const lib = state.library || { colors: [], materials: [] };
    const mats = lib.materials || [];
    const groups = [];
    const inlineColorGroups = [];
    // custom groups (e.g. Size) pass through; color/colormat groups are handled separately
    (p.options || []).forEach(g => {
      if (g.type === "color" || g.type === "colormat") inlineColorGroups.push(g);
      else groups.push(g);
    });

    const buildVals = (ids) => (ids || [])
      .map(id => lib.colors.find(c => c.id === id))
      .filter(c => c && (c.label_en || c.label_ar))   // ignore blank/garbage library entries
      .map(c => {
        const mat = mats.find(m => m.id === c.material);
        const matEn = mat && mat.label_en ? mat.label_en + " – " : "";
        const matAr = mat && mat.label_ar ? mat.label_ar + " – " : "";
        return { label_en: matEn + c.label_en, label_ar: matAr + (c.label_ar || c.label_en), value: matEn + c.label_en, swatch: c.swatch };
      });

    const parts = getColorParts(p);
    if (parts.length && Array.isArray(lib.colors)) {
      parts.forEach((part, idx) => {
        const vals = buildVals(part.colors);
        if (vals.length) groups.push({ name_en: partName(part, idx, parts.length, "en"), name_ar: partName(part, idx, parts.length, "ar"), type: "colormat", values: vals });
      });
    } else if (inlineColorGroups.length) {
      // legacy fallback: a raw pre-migration file with an inline color group
      const g = inlineColorGroups.find(x => (x.values || []).length);
      if (g) groups.push({ name_en: g.name_en || "Color", name_ar: g.name_ar || "اللون", type: "color", values: g.values });
    }
    return groups;
  }

  function productMinPrice(p) {
    let min = Number(p.price) || 0;
    getOptions(p).forEach(g => {
      if (g.type === "text") { if (g.required) min += Number(g.priceDelta) || 0; return; }
      const deltas = (g.values || []).map(v => Number(v.priceDelta) || 0);
      if (deltas.length) min += Math.min(...deltas);
    });
    return min;
  }

  /* ---------- placeholder image ---------- */
  function placeholder() {
    return `<div class="ph"><div class="ph-inner">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <path d="M3.27 6.96 12 12.01l8.73-5.05"/><path d="M12 22.08V12"/>
      </svg></div></div>`;
  }
  const media = (img) => img ? `<img src="${img}" alt="" loading="lazy">` : placeholder();
  // a product's images as an array (supports legacy single `image`)
  const imgs = (p) => (Array.isArray(p.images) && p.images.length) ? p.images : (p.image ? [p.image] : []);

  /* ---------- render products ---------- */
  function renderProducts() {
    const grid = $("#grid");
    if (!grid) return;
    if (!state.products.length) { grid.innerHTML = `<p class="muted">—</p>`; return; }
    grid.innerHTML = state.products.map(p => {
      const colorGroup = getOptions(p).find(g => g.type === "color" || g.type === "colormat");
      const swatches = colorGroup ? colorGroup.values.slice(0, 5).map(v =>
        `<span class="dot" style="background:${v.swatch || "#ccc"}" title="${L(v, "label")}"></span>`).join("") : "";
      return `<a class="card" href="product.html?id=${encodeURIComponent(p.id)}">
        <div class="card-media">${media(imgs(p)[0])}${imgs(p).length > 1 ? `<span class="media-count"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M7 21h12a2 2 0 0 0 2-2V9"/></svg>${imgs(p).length}</span>` : ""}</div>
        <div class="card-body">
          <h3 class="card-title">${L(p, "name")}</h3>
          <p class="card-desc">${L(p, "desc")}</p>
          ${swatches ? `<div class="card-swatches">${swatches}</div>` : ""}
          <div class="card-foot">
            <span class="price"><span class="from">${t("from")}</span>${money(productMinPrice(p))}<span class="cur">${currency()}</span></span>
            <span class="btn btn-primary card-cta">${t("view")}</span>
          </div>
        </div>
      </a>`;
    }).join("");
  }

  /* ---------- product detail (own page) ---------- */
  function mountProduct(id) {
    const p = state.products.find(x => x.id === id);
    if (!p) { const info = $("#pdInfo"); if (info) info.innerHTML = `<h2>—</h2>`; return; }
    state.current = p;
    state.currentProductId = id;
    state.currentOptions = getOptions(p);
    state.qty = 1;
    state.selection = {};
    // default-select single-value groups
    state.currentOptions.forEach((g, i) => { if ((g.values || []).length === 1) state.selection[i] = g.values[0]; });

    const info = $("#pdInfo");
    info.innerHTML = `
      <h2>${L(p, "name")}</h2>
      <p class="pd-desc">${L(p, "desc")}</p>
      <div class="pd-price" id="pdPrice"></div>
      <div id="pdOptions"></div>
      <div class="qty-row">
        <span class="opt-label" style="margin:0">${t("quantity")}</span>
        <div class="qty">
          <button type="button" id="qMinus" aria-label="-">−</button>
          <input id="qInput" type="number" min="1" value="1" inputmode="numeric">
          <button type="button" id="qPlus" aria-label="+">+</button>
        </div>
      </div>
      <button class="btn btn-primary btn-lg btn-block" id="addBtn">${t("add_to_cart")}</button>`;

    renderGallery(p);

    // render option groups
    const optWrap = $("#pdOptions");
    optWrap.innerHTML = state.currentOptions.map((g, gi) => {
      const isColor = g.type === "color";
      const isColorMat = g.type === "colormat";
      if (g.type === "text") {
        const sel = state.selection[gi];
        const cur = sel ? sel.value : "";
        const fee = Number(g.priceDelta) || 0;
        const feeTxt = fee ? ` <span class="delta">+${money(fee)}</span>` : "";
        const reqMark = g.required ? `<span class="req">*</span>` : `<span class="opt-tag">(${t("optional")})</span>`;
        const maxAttr = g.maxLen ? `maxlength="${g.maxLen}"` : "";
        const counter = g.maxLen ? `<small class="pd-text-help"><span data-count="${gi}">${cur.length}</span>/${g.maxLen}</small>` : "";
        return `<div class="opt-group">
          <div class="opt-label"><span>${L(g, "name")}${feeTxt}</span>${reqMark}</div>
          <input type="text" class="pd-text-input" data-gtext="${gi}" ${maxAttr} placeholder="${esc(L(g, "placeholder"))}" value="${esc(cur)}">
          ${counter}
        </div>`;
      }
      const values = (g.values || []).map((v, vi) => {
        const delta = Number(v.priceDelta) || 0;
        const deltaTxt = delta ? `<span class="delta">+${money(delta)}</span>` : "";
        if (isColor) {
          return `<button type="button" class="swatch" data-g="${gi}" data-v="${vi}" style="background:${v.swatch || "#ccc"}">
            <span class="tip">${L(v, "label")}${delta ? " +" + money(delta) : ""}</span></button>`;
        }
        if (isColorMat) {
          return `<button type="button" class="chip chip-swatch" data-g="${gi}" data-v="${vi}">
            <span class="dot" style="background:${v.swatch || "#ccc"}"></span>${L(v, "label")}</button>`;
        }
        return `<button type="button" class="chip" data-g="${gi}" data-v="${vi}">${L(v, "label")}${deltaTxt}</button>`;
      }).join("");
      return `<div class="opt-group">
        <div class="opt-label"><span>${L(g, "name")}</span><span class="req">*</span></div>
        <div class="${isColor ? "swatches" : "opt-values"}">${values}</div>
      </div>`;
    }).join("");

    // option click handlers
    $$("[data-g]", optWrap).forEach(btn => {
      btn.addEventListener("click", () => {
        const gi = +btn.dataset.g, vi = +btn.dataset.v;
        state.selection[gi] = state.currentOptions[gi].values[vi];
        // toggle active within group
        $$(`[data-g="${gi}"]`, optWrap).forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        updatePdPrice();
      });
    });
    // custom text inputs
    $$("[data-gtext]", optWrap).forEach(inp => {
      const gi = +inp.dataset.gtext;
      inp.addEventListener("input", () => {
        const g = state.currentOptions[gi];
        const txt = inp.value.trim();
        const cnt = optWrap.querySelector(`[data-count="${gi}"]`);
        if (cnt) cnt.textContent = inp.value.length;
        if (txt) {
          state.selection[gi] = {
            value: txt,
            label_en: `${g.name_en || "Text"}: ${txt}`,
            label_ar: `${g.name_ar || g.name_en || "Text"}: ${txt}`,
            priceDelta: Number(g.priceDelta) || 0,
            __text: true
          };
        } else {
          delete state.selection[gi];
        }
        updatePdPrice();
      });
    });

    // reflect defaults
    Object.keys(state.selection).forEach(gi => {
      const g = state.currentOptions[gi];
      if (!g || !Array.isArray(g.values)) return;
      const vi = g.values.indexOf(state.selection[gi]);
      const b = optWrap.querySelector(`[data-g="${gi}"][data-v="${vi}"]`);
      if (b) b.classList.add("active");
    });

    // qty handlers
    const qi = $("#qInput");
    $("#qMinus").addEventListener("click", () => { qi.value = Math.max(1, (+qi.value || 1) - 1); state.qty = +qi.value; updatePdPrice(); });
    $("#qPlus").addEventListener("click", () => { qi.value = (+qi.value || 1) + 1; state.qty = +qi.value; updatePdPrice(); });
    qi.addEventListener("input", () => { qi.value = qi.value.replace(/\D/g, ""); state.qty = Math.max(1, +qi.value || 1); updatePdPrice(); });

    $("#addBtn").addEventListener("click", addCurrentToCart);

    updatePdPrice();
  }

  // Product gallery: big main image + thumbnail strip (if >1 image)
  function renderGallery(p) {
    const list = imgs(p);
    const wrap = $("#pdMedia");
    if (!list.length) { wrap.innerHTML = `<div class="pd-main">${placeholder()}</div>`; return; }
    wrap.innerHTML = `
      <div class="pd-main"><img id="pdMainImg" src="${list[0]}" alt="${L(p, "name")}"></div>
      ${list.length > 1 ? `<div class="pd-thumbs">${list.map((src, i) =>
        `<button type="button" class="pd-thumb ${i === 0 ? "active" : ""}" data-i="${i}"><img src="${src}" alt=""></button>`).join("")}</div>` : ""}`;
    if (list.length > 1) {
      const main = $("#pdMainImg");
      $$(".pd-thumb", wrap).forEach(btn => btn.addEventListener("click", () => {
        main.src = list[+btn.dataset.i];
        $$(".pd-thumb", wrap).forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      }));
    }
  }

  function unitPrice() {
    let price = Number(state.current.price) || 0;
    Object.values(state.selection).forEach(v => { price += Number(v.priceDelta) || 0; });
    return price;
  }
  function updatePdPrice() {
    const total = unitPrice() * Math.max(1, state.qty || 1);
    $("#pdPrice").innerHTML = `${money(total)}<span class="cur">${currency()}</span>`;
  }

  function addCurrentToCart() {
    const p = state.current;
    const groups = state.currentOptions;
    // a group needs a selection unless it's an optional text field
    const missing = groups.filter((g, gi) => !state.selection[gi] && !(g.type === "text" && !g.required));
    if (missing.length) {
      toast(t("select_required"));
      groups.forEach((g, gi) => {
        if (!state.selection[gi] && !(g.type === "text" && !g.required)) {
          const lbl = $$(".opt-label", $("#pdOptions"))[gi];
          if (lbl) { lbl.animate([{ color: "var(--danger)" }, { color: "" }], { duration: 900 }); }
        }
      });
      return;
    }
    const opts = groups.map((g, gi) => {
      const sel = state.selection[gi];
      if (!sel) return null; // optional text left blank
      return {
        name_en: g.name_en, name_ar: g.name_ar,
        value: sel.value,
        label_en: sel.label_en, label_ar: sel.label_ar
      };
    }).filter(Boolean);
    const key = p.id + "|" + opts.map(o => o.value).join("|");
    const existing = state.cart.find(l => l.key === key);
    if (existing) { existing.qty += state.qty; }
    else {
      state.cart.push({
        key, id: p.id, name_en: p.name_en, name_ar: p.name_ar,
        image: imgs(p)[0] || "", unit: unitPrice(), qty: state.qty, opts
      });
    }
    saveCart();
    updateCartCount();
    toast(t("added"));
    openDrawer();
  }

  /* ---------- cart drawer ---------- */
  function cartTotal() { return state.cart.reduce((s, l) => s + l.unit * l.qty, 0); }
  function cartCount() { return state.cart.reduce((s, l) => s + l.qty, 0); }

  function updateCartCount() {
    const el = $("#cartCount");
    const n = cartCount();
    el.textContent = n;
    el.classList.toggle("show", n > 0);
  }

  function renderCart() {
    const body = $("#drawerBody");
    if (!state.cart.length) {
      body.innerHTML = `<div class="cart-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <p>${t("cart_empty")}</p>
        <button class="btn btn-ghost" id="emptyBrowse">${t("keep_shopping")}</button>
      </div>`;
      $("#emptyBrowse").addEventListener("click", closeDrawer);
      $("#drawerFoot").classList.add("hidden");
      return;
    }
    $("#drawerFoot").classList.remove("hidden");
    body.innerHTML = state.cart.map((l, i) => {
      const optTxt = l.opts.map(o => `${L(o, "label")}`).join(" · ");
      return `<div class="line">
        <div class="line-media">${media(l.image)}</div>
        <div>
          <p class="line-title">${L(l, "name")}</p>
          <p class="line-opts">${optTxt}</p>
          <div class="line-ctl">
            <div class="qty">
              <button type="button" data-act="dec" data-i="${i}">−</button>
              <input type="text" value="${l.qty}" data-i="${i}" data-act="set" inputmode="numeric" style="width:40px">
              <button type="button" data-act="inc" data-i="${i}">+</button>
            </div>
            <button class="line-remove" data-act="rm" data-i="${i}">${t("remove")}</button>
          </div>
        </div>
        <div class="line-price">${money(l.unit * l.qty)}<br><span class="muted" style="font-size:12px">${currency()}</span></div>
      </div>`;
    }).join("");

    $("#cartTotal").textContent = money(cartTotal());
    $("#cartCurrency").textContent = currency();

    $$("[data-act]", body).forEach(el => {
      const i = +el.dataset.i, act = el.dataset.act;
      if (act === "inc") el.addEventListener("click", () => { state.cart[i].qty++; commitCart(); });
      if (act === "dec") el.addEventListener("click", () => { state.cart[i].qty = Math.max(1, state.cart[i].qty - 1); commitCart(); });
      if (act === "rm") el.addEventListener("click", () => { state.cart.splice(i, 1); commitCart(); });
      if (act === "set") el.addEventListener("change", () => {
        const n = Math.max(1, parseInt(el.value.replace(/\D/g, ""), 10) || 1);
        state.cart[i].qty = n; commitCart();
      });
    });
  }
  function commitCart() { saveCart(); updateCartCount(); renderCart(); }

  /* ---------- overlays / drawer ---------- */
  function openOverlay(sel) { const el = $(sel); if (!el) return; el.classList.add("open"); document.body.style.overflow = "hidden"; }
  function closeOverlay(sel) { const el = $(sel); if (el) el.classList.remove("open"); if (!$(".overlay.open") && !$(".drawer.open")) document.body.style.overflow = ""; }
  function openDrawer() { $("#drawer").classList.add("open"); $("#drawerScrim").classList.add("open"); document.body.style.overflow = "hidden"; renderCart(); }
  function closeDrawer() { $("#drawer").classList.remove("open"); $("#drawerScrim").classList.remove("open"); if (!$(".overlay.open")) document.body.style.overflow = ""; }

  /* ---------- discount ---------- */
  function discountInfo() {
    const subtotal = cartTotal();
    const percent = state.discount ? (Number(state.discount.percent) || 0) : 0;
    const amount = subtotal * percent / 100;
    // delivery is a flat fee added on top of the (discounted) goods total
    const delivery = state.delivery ? (Number(state.delivery.price) || 0) : 0;
    return { subtotal, percent, amount, delivery, total: subtotal - amount + delivery, code: state.discount ? state.discount.code : "" };
  }
  function applyDiscountCode() {
    const raw = ($("#cCode").value || "").trim();
    const msg = $("#discountMsg");
    if (!raw) { state.discount = null; msg.innerHTML = ""; renderCheckoutSummary(); return; }
    const found = (state.discounts || []).find(d => (d.code || "").trim().toLowerCase() === raw.toLowerCase() && (Number(d.percent) || 0) > 0);
    if (found) {
      state.discount = { code: found.code, percent: Number(found.percent) };
      msg.innerHTML = `<span class="msg-ok">✓ ${t("code_applied")} — ${found.percent}%</span>`;
    } else {
      state.discount = null;
      msg.innerHTML = `<span class="msg-err">${t("invalid_code")}</span>`;
    }
    renderCheckoutSummary();
  }
  function renderCheckoutSummary() {
    const el = $("#summaryLines");
    if (!el) return;
    const d = discountInfo();
    const showBreakdown = d.percent > 0 || !!state.delivery;
    const rows = [];
    if (showBreakdown) rows.push(`<div class="summary-row"><span>${t("subtotal")}</span><span>${money(d.subtotal)} ${currency()}</span></div>`);
    if (d.percent > 0) rows.push(`<div class="summary-row" style="color:var(--ok)"><span>${t("discount")} (${d.code} · ${d.percent}%)</span><span>−${money(d.amount)} ${currency()}</span></div>`);
    if (state.delivery) {
      const feeTxt = d.delivery > 0 ? `${money(d.delivery)} ${currency()}` : t("free");
      rows.push(`<div class="summary-row"><span>${L(state.delivery, "label")}</span><span>${feeTxt}</span></div>`);
    }
    rows.push(`<div class="summary-total"><span>${t("total")}</span><span>${money(showBreakdown ? d.total : d.subtotal)} ${currency()}</span></div>`);
    el.innerHTML = rows.join("");
  }

  /* ---------- checkout ---------- */
  function openCheckout() {
    if (!state.cart.length) return;
    state.discount = null; // fresh each time the checkout opens
    state.delivery = state.deliveryOptions.length ? state.deliveryOptions[0] : null; // default to first method
    closeDrawer();
    const delivHtml = state.deliveryOptions.length ? `
        <div class="field">
          <label>${t("delivery_method")}</label>
          <div class="deliv-opts" id="delivOpts">
            ${state.deliveryOptions.map((o, i) => {
              const feeTxt = (Number(o.price) || 0) > 0 ? `${money(o.price)} ${currency()}` : t("free");
              return `<label class="deliv-opt">
                <input type="radio" name="deliv" value="${i}" ${i === 0 ? "checked" : ""}>
                <span class="deliv-name">${L(o, "label")}</span>
                <span class="deliv-fee">${feeTxt}</span>
              </label>`;
            }).join("")}
          </div>
        </div>` : "";
    const m = $("#checkoutModal .modal-inner");
    m.innerHTML = `
      <div class="checkout">
        <h2>${t("review_order")}</h2>
        <p class="sub">${t("checkout_sub")}</p>
        <div class="field"><label>${t("name")}</label><input id="cName" type="text" autocomplete="name"></div>
        <div class="field"><label>${t("phone")} <span class="opt-tag">(${t("optional")})</span></label><input id="cPhone" type="tel" autocomplete="tel"></div>
        <div class="field"><label>${t("area")}</label><input id="cArea" type="text"></div>
        ${delivHtml}
        <div class="field"><label>${t("notes")} <span class="opt-tag">(${t("optional")})</span></label><textarea id="cNotes"></textarea></div>
        <div class="field">
          <label>${t("discount_code")} <span class="opt-tag">(${t("optional")})</span></label>
          <div class="discount-row">
            <input id="cCode" type="text" autocapitalize="characters" autocomplete="off">
            <button type="button" class="btn btn-ghost" id="applyCode">${t("apply")}</button>
          </div>
          <div id="discountMsg" class="discount-msg"></div>
        </div>
        <div id="summaryLines"></div>
        <button class="btn btn-primary btn-lg btn-block" id="placeBtn">${t("place_order")}</button>
        <p class="note">${L(state.config, "delivery_note")}</p>
      </div>`;
    renderCheckoutSummary();
    $$('input[name="deliv"]', m).forEach(r => r.addEventListener("change", () => {
      state.delivery = state.deliveryOptions[+r.value] || null;
      renderCheckoutSummary();
    }));
    $("#applyCode").addEventListener("click", applyDiscountCode);
    $("#cCode").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); applyDiscountCode(); } });
    $("#placeBtn").addEventListener("click", placeOrder);
    openOverlay("#checkoutModal");
  }

  function genOrderNo() {
    const d = new Date();
    const p = (x) => String(x).padStart(2, "0");
    const ymd = `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}`;
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `BH3-${ymd}-${rand}`;
  }

  // Order message is ALWAYS English (per requirement) to avoid encoding/length issues.
  function buildMessage(orderNo, cust) {
    const lines = [];
    lines.push(`*New Order — ${state.config.brand || "Bahrain3D"}*`);
    lines.push(`Order #: ${orderNo}`);
    lines.push("");
    state.cart.forEach((l, i) => {
      lines.push(`${i + 1}) ${l.name_en} x${l.qty}`);
      l.opts.forEach(o => lines.push(`   - ${o.name_en}: ${o.value}`));
      lines.push(`   Line: ${money(l.unit * l.qty)} ${currency()}`);
    });
    lines.push("");
    const d = discountInfo();
    const showBreakdown = d.percent > 0 || !!state.delivery;
    if (showBreakdown) {
      lines.push(`Subtotal: ${money(d.subtotal)} ${currency()}`);
      if (d.percent > 0) lines.push(`Discount code: ${d.code} (${d.percent}% off) -${money(d.amount)} ${currency()}`);
      if (state.delivery) lines.push(`Delivery: ${state.delivery.label_en || "Delivery"} (${money(d.delivery)} ${currency()})`);
      lines.push(`Total: ${money(d.total)} ${currency()}`);
    } else {
      lines.push(`Total: ${money(d.subtotal)} ${currency()}`);
    }
    lines.push("");
    if (cust.name) lines.push(`Customer: ${cust.name}`);
    if (cust.phone) lines.push(`Phone: ${cust.phone}`);
    if (cust.area) lines.push(`Area: ${cust.area}`);
    if (cust.notes) lines.push(`Notes: ${cust.notes}`);
    return lines.join("\n");
  }

  function waLink(msg) {
    const num = String(state.config.whatsapp || "").replace(/\D/g, "");
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  }

  function isMobile() { return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }

  function placeOrder() {
    const cust = {
      name: $("#cName").value.trim(),
      phone: $("#cPhone").value.trim(),
      area: $("#cArea").value.trim(),
      notes: $("#cNotes").value.trim()
    };
    const orderNo = genOrderNo();
    const msg = buildMessage(orderNo, cust);
    const link = waLink(msg);

    const m = $("#checkoutModal .modal-inner");
    m.innerHTML = `
      <div class="confirm">
        <div class="check">✓</div>
        <h2>${t("order_ready")}</h2>
        <div style="color:var(--text-soft);font-size:14px">${t("order_number")}</div>
        <div class="order-no">${orderNo}</div>
        <div id="confirmBody"></div>
        <div class="actions">
          <button class="btn btn-ghost" id="newOrderBtn">${t("new_order")}</button>
        </div>
      </div>`;

    const body = $("#confirmBody");
    const waBtn = `<a class="btn btn-primary btn-lg btn-block" href="${link}" target="_blank" rel="noopener" id="waBtn">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.13c-.24.68-1.42 1.32-1.95 1.36-.5.05-1.13.24-3.8-.79-3.2-1.26-5.24-4.5-5.4-4.71-.16-.21-1.3-1.72-1.3-3.28 0-1.56.82-2.33 1.11-2.65.29-.32.63-.4.84-.4.21 0 .42 0 .6.01.19.01.45-.07.7.53.24.6.83 2.07.9 2.22.07.15.12.32.02.53-.1.21-.15.32-.3.5-.15.18-.32.4-.45.53-.15.15-.31.32-.13.63.18.32.79 1.3 1.69 2.11 1.16 1.03 2.14 1.35 2.45 1.5.31.15.5.13.68-.08.18-.21.79-.92.99-1.24.21-.32.42-.26.7-.16.29.11 1.82.86 2.13 1.01.31.16.52.24.6.37.07.13.07.74-.17 1.42Z"/></svg>
        ${t("send_whatsapp")}</a>`;
    const qrBlock = `<div class="qr-box" id="qrBox"></div><p class="qr-hint">${t("scan_hint")}</p>`;

    if (isMobile()) {
      body.innerHTML = waBtn + `<div class="divider-or">${t("or")}</div>` + qrBlock;
    } else {
      body.innerHTML = qrBlock + `<div class="divider-or">${t("or")}</div>` + waBtn;
    }

    // render QR
    try {
      const qr = qrcode(0, "L");
      qr.addData(link);
      qr.make();
      $("#qrBox").innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    } catch (e) {
      $("#qrBox").innerHTML = `<p class="muted" style="padding:20px">${t("send_whatsapp")}</p>`;
    }

    $("#newOrderBtn").addEventListener("click", () => {
      state.cart = []; state.discount = null; saveCart(); updateCartCount();
      closeOverlay("#checkoutModal");
    });
  }

  /* ---------- language ---------- */
  function applyLang() {
    const conf = T();
    document.documentElement.lang = state.lang;
    document.documentElement.dir = conf.dir;
    // static strings
    $$("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
    $$("[data-i18n-html]").forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
    // config-driven
    $$("[data-cfg]").forEach(el => { el.textContent = L(state.config, el.dataset.cfg); });
    const lt = $("#langToggle"); if (lt) lt.textContent = t("lang_switch");
    document.title = `${state.config.brand || "Bahrain3D"} — ${L(state.config, "tagline")}`;
    if (state.page === "product") { if (state.currentProductId) mountProduct(state.currentProductId); }
    else renderProducts();
    const drawer = $("#drawer");
    if (drawer && drawer.classList.contains("open")) renderCart();
  }

  function toggleLang() {
    state.lang = state.lang === "en" ? "ar" : "en";
    localStorage.setItem(LS_LANG, state.lang);
    applyLang();
  }

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  /* ---------- boot ---------- */
  let booted = false;
  async function boot() {
    if (booted) return;
    booted = true;
    try {
      const res = await fetch("data/products.json", { cache: "no-store" });
      const data = await res.json();
      state.config = data.config || {};
      state.library = data.library || { colors: [], materials: [] };
      state.discounts = data.discounts || [];
      state.deliveryOptions = data.delivery || [];
      state.products = data.products || [];
    } catch (e) {
      state.config = { brand: "Bahrain3D", whatsapp: "97334499469", currency: "BHD" };
      state.library = { colors: [], materials: [] };
      state.discounts = [];
      state.deliveryOptions = [];
      state.products = [];
    }

    // which page are we on?
    state.page = $("#productDetail") ? "product" : "index";
    if (state.page === "product") {
      state.currentProductId = new URLSearchParams(location.search).get("id");
    }

    // brand
    const brand = state.config.brand || "Bahrain3D";
    const bn = $("#brandName"); if (bn) bn.textContent = brand;
    const b2 = $("#brandName2"); if (b2) b2.textContent = brand;

    // wire controls (guarded — pages share most, but not all, of these)
    const on = (sel, evt, fn) => { const el = $(sel); if (el) el.addEventListener(evt, fn); };
    on("#langToggle", "click", toggleLang);
    on("#cartBtn", "click", openDrawer);
    on("#drawerClose", "click", closeDrawer);
    on("#drawerScrim", "click", closeDrawer);
    on("#checkoutBtn", "click", openCheckout);
    $$(".modal-close").forEach(b => b.addEventListener("click", () => closeOverlay("#" + b.closest(".overlay").id)));
    // Close only on a genuine backdrop click (mouse pressed AND released on the backdrop), so a
    // text-selection drag that ends on the backdrop doesn't close the modal and lose typed input.
    $$(".overlay").forEach(o => {
      let downOnScrim = false;
      o.addEventListener("mousedown", e => { downOnScrim = e.target === o; });
      o.addEventListener("click", e => { if (e.target === o && downOnScrim) closeOverlay("#" + o.id); });
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") { $$(".overlay.open").forEach(o => closeOverlay("#" + o.id)); closeDrawer(); }
    });
    // footer WA link
    const num = String(state.config.whatsapp || "").replace(/\D/g, "");
    $$("[data-wa]").forEach(a => a.href = `https://wa.me/${num}`);

    updateCartCount();
    applyLang();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
