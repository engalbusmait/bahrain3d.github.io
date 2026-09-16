/* ==========================================================================
   Bahrain3D — Admin / Catalog builder
   Builds data/products.json in-browser. Autosaves to localStorage.
   ========================================================================== */
(function () {
  "use strict";

  const LS_DRAFT = "b3d_admin_draft";
  const IMG_MAX = 1000;      // max image dimension (px)
  const IMG_QUALITY = 0.82;  // jpeg quality

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  let data = { config: {}, products: [] };
  let editIndex = null;   // index being edited (null = new)
  let edit = null;        // working copy of the product

  const CFG_FIELDS = [
    "brand", "whatsapp", "currency",
    "tagline_en", "tagline_ar",
    "hero_title_en", "hero_title_ar",
    "hero_subtitle_en", "hero_subtitle_ar",
    "delivery_note_en", "delivery_note_ar"
  ];

  /* ---------------- toast ---------------- */
  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg; el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  /* ---------------- persistence ---------------- */
  function markSaved() { const s = $("#saveState"); s.classList.remove("dirty", "err"); $("#saveText").textContent = "Saved locally"; }
  function markDirty() { $("#saveState").classList.add("dirty"); $("#saveText").textContent = "Saving…"; }
  let quotaWarned = false;
  function autosave() {
    markDirty();
    try {
      localStorage.setItem(LS_DRAFT, JSON.stringify(data));
      setTimeout(markSaved, 250);
    } catch (e) {
      // localStorage is ~5MB; embedded photos can exceed it. Don't lose the in-memory work.
      $("#saveState").classList.add("err");
      $("#saveState").classList.remove("dirty");
      $("#saveText").textContent = "Too big to auto-save — use Download";
      if (!quotaWarned) {
        quotaWarned = true;
        toast("Your catalog is too large to auto-save in the browser. Your work is safe — just click Download products.json to keep it.");
      }
    }
  }

  async function loadInitial() {
    const draft = localStorage.getItem(LS_DRAFT);
    if (draft) {
      try { data = JSON.parse(draft); } catch { data = { config: {}, products: [] }; }
    } else {
      await loadLive(true);
    }
    data.config = data.config || {};
    data.products = data.products || [];
    migrateData();
    renderSettings();
    renderLibrary();
    renderDiscounts();
    renderList();
    autosave();
  }

  function ensureLibrary() {
    data.library = data.library || {};
    data.library.colors = data.library.colors || [];
    data.library.materials = data.library.materials || [];
    // guarantee every item has a stable id, and every color is tied to a material
    data.library.materials.forEach(m => { if (!m.id) m.id = "m_" + rid(); });
    const firstMat = data.library.materials[0];
    data.library.colors.forEach(c => {
      if (!c.id) c.id = "c_" + rid();
      if (!c.material && firstMat) c.material = firstMat.id;
    });
  }
  const rid = () => Math.random().toString(36).slice(2, 8);

  // Heal legacy/inconsistent data: drop blank library entries, migrate any inline
  // color groups into the library (combined model), and normalize product image fields.
  function migrateData() {
    ensureLibrary();
    data.discounts = Array.isArray(data.discounts) ? data.discounts : [];
    data.library.materials = data.library.materials.filter(m => (m.label_en || "").trim());
    data.library.colors = data.library.colors.filter(c => (c.label_en || "").trim());
    data.library.materials.forEach(m => delete m.priceDelta);
    data.library.colors.forEach(c => delete c.priceDelta);
    if (!data.library.materials.length) data.library.materials.push({ id: "m_" + rid(), label_en: "PLA", label_ar: "بي إل إيه" });
    const defMat = data.library.materials[0].id;
    data.library.colors.forEach(c => { if (!c.material) c.material = defMat; });

    const findOrCreate = (label_en, label_ar, swatch) => {
      let c = data.library.colors.find(x => x.label_en === label_en && (x.swatch || "") === (swatch || "") && x.material === defMat);
      if (!c) { c = { id: "c_" + rid(), label_en, label_ar: label_ar || label_en, swatch: swatch || "#dddddd", material: defMat }; data.library.colors.push(c); }
      return c.id;
    };

    const validId = id => data.library.colors.some(c => c.id === id);
    (data.products || []).forEach(p => {
      // gather any legacy single-list colors + inline color groups into one id set
      const legacy = new Set((p.colors || []).filter(validId));
      (p.options || []).filter(o => o.type === "color" || o.type === "colormat").forEach(g => {
        (g.values || []).forEach(v => { if (v.label_en) legacy.add(findOrCreate(v.label_en, v.label_ar, v.swatch)); });
      });
      // normalize color parts
      if (Array.isArray(p.colorParts)) {
        p.colorParts = p.colorParts.map(part => ({
          name_en: part.name_en || "", name_ar: part.name_ar || "",
          colors: (part.colors || []).filter(validId)
        }));
      } else {
        p.colorParts = [];
      }
      if (!p.colorParts.length && legacy.size) p.colorParts = [{ name_en: "", name_ar: "", colors: [...legacy] }];
      delete p.colors;
      p.options = (p.options || []).filter(o => o.type !== "color" && o.type !== "colormat");
      if (!Array.isArray(p.images)) p.images = p.image ? [p.image] : [];
      delete p.image;
    });
  }

  async function loadLive(silent) {
    try {
      const res = await fetch("data/products.json", { cache: "no-store" });
      const j = await res.json();
      data = { config: j.config || {}, library: j.library || {}, discounts: j.discounts || [], products: j.products || [] };
      migrateData();
      renderSettings(); renderLibrary(); renderDiscounts(); renderList(); autosave();
      if (!silent) toast("Loaded live products.json");
    } catch (e) {
      if (!silent) toast("Couldn't load live file");
      data = data || { config: {}, library: { colors: [], materials: [] }, products: [] };
    }
  }

  /* ---------------- settings ---------------- */
  function renderSettings() {
    CFG_FIELDS.forEach(f => { const el = $("#cfg_" + f); if (el) el.value = data.config[f] || ""; });
  }
  function bindSettings() {
    CFG_FIELDS.forEach(f => {
      const el = $("#cfg_" + f);
      if (!el) return;
      el.addEventListener("input", () => {
        data.config[f] = f === "whatsapp" ? el.value.replace(/[^\d]/g, "") : el.value;
        if (f === "whatsapp" && el.value !== data.config[f]) el.value = data.config[f];
        autosave();
      });
    });
  }

  /* ---------------- colors & materials library ---------------- */
  function renderLibrary() {
    renderLibColors();
    renderLibMaterials();
  }

  function matOptions(selectedId) {
    return data.library.materials.map(m =>
      `<option value="${m.id}" ${m.id === selectedId ? "selected" : ""}>${escapeHtml(m.label_en || "(unnamed)")}</option>`).join("");
  }

  function renderLibColors() {
    const wrap = $("#libColors");
    if (!data.library.materials.length) {
      wrap.innerHTML = `<p class="hint" style="margin:0">Add at least one material first — each color belongs to a material.</p>`;
      return;
    }
    wrap.innerHTML = data.library.colors.map((c, i) => `
      <div class="libc-row" data-ci="${i}">
        <input placeholder="Color name EN (e.g. Red)" data-cf="label_en" value="${escapeHtml(c.label_en || "")}">
        <input placeholder="الاسم بالعربية" dir="rtl" data-cf="label_ar" value="${escapeHtml(c.label_ar || "")}">
        <input type="color" data-cf="swatch" value="${c.swatch || "#dddddd"}" title="Swatch color">
        <select data-cf="material" title="Material">${matOptions(c.material)}</select>
        <button class="icon-btn" data-delc="${i}" title="Remove color">×</button>
      </div>`).join("") || `<p class="hint" style="margin:0">No colors yet — add your first one below.</p>`;

    $$("[data-cf]", wrap).forEach(el => {
      const evt = el.tagName === "SELECT" ? "change" : "input";
      el.addEventListener(evt, () => {
        const c = data.library.colors[+el.closest("[data-ci]").dataset.ci];
        c[el.dataset.cf] = el.value;
        autosave();
      });
    });
    $$("[data-delc]", wrap).forEach(b => b.addEventListener("click", () => {
      data.library.colors.splice(+b.dataset.delc, 1); autosave(); renderLibColors();
    }));
  }

  function renderLibMaterials() {
    const wrap = $("#libMaterials");
    wrap.innerHTML = data.library.materials.map((m, i) => `
      <div class="libm-row" data-mi="${i}">
        <input placeholder="Material name EN (e.g. PLA)" data-mf="label_en" value="${escapeHtml(m.label_en || "")}">
        <input placeholder="الاسم بالعربية" dir="rtl" data-mf="label_ar" value="${escapeHtml(m.label_ar || "")}">
        <button class="icon-btn" data-delm="${i}" title="Remove material">×</button>
      </div>`).join("") || `<p class="hint" style="margin:0">No materials yet — add your first one below.</p>`;

    $$("[data-mf]", wrap).forEach(el => el.addEventListener("input", () => {
      const m = data.library.materials[+el.closest("[data-mi]").dataset.mi];
      m[el.dataset.mf] = el.value;
      autosave();
    }));
    $$("[data-delm]", wrap).forEach(b => b.addEventListener("click", () => {
      data.library.materials.splice(+b.dataset.delm, 1); autosave(); renderLibMaterials(); renderLibColors();
    }));
  }

  function bindLibrary() {
    $("#addLibColor").addEventListener("click", () => {
      const firstMat = data.library.materials[0];
      data.library.colors.push({ id: "c_" + rid(), label_en: "", label_ar: "", swatch: "#dddddd", material: firstMat ? firstMat.id : "" });
      autosave(); renderLibColors();
    });
    $("#addLibMaterial").addEventListener("click", () => {
      data.library.materials.push({ id: "m_" + rid(), label_en: "", label_ar: "" });
      autosave(); renderLibMaterials(); renderLibColors();
    });
  }

  /* ---------------- discount codes ---------------- */
  function renderDiscounts() {
    const wrap = $("#discountList");
    if (!wrap) return;
    data.discounts = data.discounts || [];
    wrap.innerHTML = data.discounts.map((d, i) => `
      <div class="disc-row" data-di="${i}">
        <input placeholder="CODE (e.g. WELCOME10)" data-df="code" value="${escapeHtml(d.code || "")}" style="text-transform:uppercase">
        <div class="disc-pct"><input type="number" min="0" max="100" step="1" placeholder="0" data-df="percent" value="${d.percent || 0}"><span>%</span></div>
        <button class="icon-btn" data-deld="${i}" title="Remove code">×</button>
      </div>`).join("") || `<p class="hint" style="margin:0">No discount codes yet — add one below.</p>`;

    $$("[data-df]", wrap).forEach(el => el.addEventListener("input", () => {
      const d = data.discounts[+el.closest("[data-di]").dataset.di];
      const f = el.dataset.df;
      if (f === "percent") d.percent = Math.max(0, Math.min(100, parseInt(el.value, 10) || 0));
      else d.code = el.value.replace(/\s+/g, "").toUpperCase();
      if (f === "code" && el.value !== d.code) el.value = d.code;
      autosave();
    }));
    $$("[data-deld]", wrap).forEach(b => b.addEventListener("click", () => {
      data.discounts.splice(+b.dataset.deld, 1); autosave(); renderDiscounts();
    }));
  }
  function bindDiscounts() {
    const add = $("#addDiscount");
    if (add) add.addEventListener("click", () => {
      data.discounts = data.discounts || [];
      data.discounts.push({ code: "", percent: 10 });
      autosave(); renderDiscounts();
    });
  }

  /* ---------------- product list ---------------- */
  const money = (n) => {
    const dec = (data.config.currency || "BHD") === "BHD" ? 3 : 2;
    return Number(n || 0).toFixed(dec);
  };
  const cur = () => data.config.currency || "BHD";

  function placeholderThumb() {
    return `<div class="ph"><div class="ph-inner" style="border-radius:0">
      <svg viewBox="0 0 24 24" width="40" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <path d="M3.27 6.96 12 12.01l8.73-5.05"/><path d="M12 22.08V12"/></svg></div></div>`;
  }

  function renderList() {
    const list = $("#prodList");
    const tiles = data.products.map((p, i) => `
      <div class="prod-tile">
        <div class="thumb">${(p.images && p.images[0]) ? `<img src="${p.images[0]}" alt="">${p.images.length > 1 ? `<span class="thumb-count">${p.images.length}</span>` : ""}` : (p.image ? `<img src="${p.image}" alt="">` : placeholderThumb())}</div>
        <div class="meta">
          <b>${escapeHtml(p.name_en || "(no name)")}</b>
          <small>${escapeHtml(p.name_ar || "")}</small>
          <small>${money(p.price)} ${cur()} · ${(p.colorParts || []).length} color part(s)${(p.options || []).length ? " · " + p.options.length + " more group(s)" : ""}</small>
        </div>
        <div class="tile-actions">
          <button data-edit="${i}">✎ Edit</button>
          <button class="del" data-del="${i}">🗑 Delete</button>
        </div>
      </div>`).join("");
    list.innerHTML = tiles + `<button class="add-tile" id="addProd">＋ Add product</button>`;

    $("#addProd").addEventListener("click", () => openEditor(null));
    $$("[data-edit]", list).forEach(b => b.addEventListener("click", () => openEditor(+b.dataset.edit)));
    $$("[data-del]", list).forEach(b => b.addEventListener("click", () => {
      const i = +b.dataset.del;
      if (confirm(`Delete "${data.products[i].name_en || "this product"}"?`)) {
        data.products.splice(i, 1); autosave(); renderList(); toast("Product deleted");
      }
    }));
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  /* ---------------- editor ---------------- */
  function blankProduct() {
    return { id: "p_" + rid(), name_en: "", name_ar: "", desc_en: "", desc_ar: "", price: 0, images: [], colorParts: [{ name_en: "", name_ar: "", colors: [] }], options: [] };
  }
  function blankGroup(type) {
    return { name_en: "", name_ar: "", type: type || "select", values: [blankValue(type)] };
  }
  function blankValue(type) {
    return { label_en: "", label_ar: "", value: "", priceDelta: 0, swatch: type === "color" ? "#d81f2a" : undefined };
  }

  function openEditor(index) {
    editIndex = index;
    edit = index === null ? blankProduct() : JSON.parse(JSON.stringify(data.products[index]));
    edit.options = edit.options || [];
    // migrate legacy fields on the working copy
    if (!Array.isArray(edit.colorParts)) {
      edit.colorParts = (Array.isArray(edit.colors) && edit.colors.length) ? [{ name_en: "", name_ar: "", colors: edit.colors }] : [];
    }
    if (!edit.colorParts.length) edit.colorParts = [{ name_en: "", name_ar: "", colors: [] }];
    delete edit.colors;
    if (!Array.isArray(edit.images)) edit.images = edit.image ? [edit.image] : [];
    delete edit.image;
    renderEditor();
    $("#editor").classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeEditor() {
    $("#editor").classList.remove("open");
    document.body.style.overflow = "";
    edit = null; editIndex = null;
  }

  function renderEditor() {
    const b = $("#editorBody");
    b.innerHTML = `
      <h2>${editIndex === null ? "New product" : "Edit product"}</h2>

      <div class="row2">
        <div class="field"><label>Name (English) *</label><input data-p="name_en" type="text" value="${escapeHtml(edit.name_en)}"></div>
        <div class="field"><label>Name (Arabic)</label><input data-p="name_ar" type="text" dir="rtl" value="${escapeHtml(edit.name_ar)}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Description (English)</label><textarea data-p="desc_en">${escapeHtml(edit.desc_en)}</textarea></div>
        <div class="field"><label>Description (Arabic)</label><textarea data-p="desc_ar" dir="rtl">${escapeHtml(edit.desc_ar)}</textarea></div>
      </div>
      <div class="row2">
        <div class="field">
          <label>Base price (${cur()}) *</label>
          <input data-p="price" type="number" min="0" step="0.001" value="${edit.price || 0}">
          <small class="help">The starting price. Option add-ons below are added on top.</small>
        </div>
        <div class="field"></div>
      </div>

      <div class="field">
        <label>Product photos <span class="opt-tag" style="font-weight:500;color:var(--text-soft);font-size:12px">— add one or more; the first is the main photo</span></label>
        <div id="imgArea"></div>
        <input type="file" id="imgFile" class="filepick" accept="image/*" multiple>
      </div>

      <div class="field" style="margin-top:8px">
        <label>Color parts <span class="opt-tag" style="font-weight:500;color:var(--text-soft);font-size:12px">— tick the colors for each part. Add a part for multi-color prints (e.g. Base color + Top color).</span></label>
        <div id="colorParts"></div>
        <button class="btn btn-ghost mini" id="addColorPart" style="margin-top:6px">＋ Add color part</button>
      </div>

      <div class="field" style="margin-top:8px">
        <label>Other option groups <span class="opt-tag" style="font-weight:500;color:var(--text-soft);font-size:12px">(optional)</span></label>
        <small class="help">For anything beyond color — e.g. a "Size" group (Small / Medium / Large). Add-on price is optional per choice.</small>
        <div id="optWrap"></div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button class="btn btn-ghost mini" id="addSelect">＋ Add option group</button>
        </div>
      </div>`;

    // product-level inputs
    $$("[data-p]", b).forEach(el => el.addEventListener("input", () => {
      const k = el.dataset.p;
      edit[k] = k === "price" ? (parseFloat(el.value) || 0) : el.value;
    }));

    renderImages();
    renderColorParts();
    renderOptions();

    $("#imgFile").addEventListener("change", handleImage);
    $("#addColorPart").addEventListener("click", () => { edit.colorParts.push({ name_en: "", name_ar: "", colors: [] }); renderColorParts(); });
    $("#addSelect").addEventListener("click", () => { serializeOptions(); edit.options.push(blankGroup("select")); renderOptions(); });
  }

  // Render one editable "color part" block per entry in edit.colorParts
  function renderColorParts() {
    const host = $("#colorParts");
    if (!data.library.colors.length) {
      host.innerHTML = `<p class="hint" style="margin:0">No colors in your library yet — add materials and colors in the "Colors &amp; Materials library" section above.</p>`;
      return;
    }
    const many = edit.colorParts.length > 1;
    host.innerHTML = edit.colorParts.map((part, pi) => `
      <div class="cpart" data-pi="${pi}">
        <div class="cpart-head">
          <input class="mini" placeholder="Part name EN (e.g. Base color)${many ? "" : " — optional"}" data-cpf="name_en" value="${escapeHtml(part.name_en || "")}">
          <input class="mini" dir="rtl" placeholder="اسم الجزء (اختياري)" data-cpf="name_ar" value="${escapeHtml(part.name_ar || "")}">
          ${many ? `<button class="icon-btn" data-delpart="${pi}" title="Remove this part">🗑</button>` : ""}
        </div>
        <div class="pick-grid-host" data-pickhost="${pi}"></div>
      </div>`).join("");

    edit.colorParts.forEach((part, pi) => renderPartPicker(pi));

    $$("[data-cpf]", host).forEach(el => el.addEventListener("input", () => {
      edit.colorParts[+el.closest("[data-pi]").dataset.pi][el.dataset.cpf] = el.value;
    }));
    $$("[data-delpart]", host).forEach(btn => btn.addEventListener("click", () => {
      edit.colorParts.splice(+btn.dataset.delpart, 1);
      if (!edit.colorParts.length) edit.colorParts.push({ name_en: "", name_ar: "", colors: [] });
      renderColorParts();
    }));
  }

  // Library tick-box picker for a single color part (index pi)
  function renderPartPicker(pi) {
    const cWrap = $(`[data-pickhost="${pi}"]`);
    const selected = edit.colorParts[pi].colors;
    const mats = data.library.materials;
    const chipFor = (c, withMat) => {
      const on = selected.includes(c.id);
      const label = withMat ? `${escapeHtml(mats.find(m => m.id === c.material) ? mats.find(m => m.id === c.material).label_en : "")} – ${escapeHtml(c.label_en || "(unnamed)")}` : escapeHtml(c.label_en || "(unnamed)");
      return `<button type="button" class="pick ${on ? "on" : ""}" data-pick-c="${c.id}"><span class="pick-sw" style="background:${c.swatch || "#ccc"}"></span><span>${label}</span></button>`;
    };
    const groupsHtml = mats.map(m => {
      const colors = data.library.colors.filter(c => c.material === m.id);
      if (!colors.length) return "";
      return `<div class="pick-mat"><div class="pick-mat-h">${escapeHtml(m.label_en || "(unnamed)")}</div><div class="pick-grid">${colors.map(c => chipFor(c, true)).join("")}</div></div>`;
    }).join("");
    const orphans = data.library.colors.filter(c => !mats.find(m => m.id === c.material));
    const orphanHtml = orphans.length ? `<div class="pick-mat"><div class="pick-mat-h">(no material)</div><div class="pick-grid">${orphans.map(c => chipFor(c, false)).join("")}</div></div>` : "";

    cWrap.innerHTML = groupsHtml + orphanHtml;
    $$("[data-pick-c]", cWrap).forEach(b => b.addEventListener("click", () => {
      const id = b.dataset.pickC;
      const i = selected.indexOf(id);
      if (i >= 0) selected.splice(i, 1); else selected.push(id);
      b.classList.toggle("on");
    }));
  }

  function renderImages() {
    const area = $("#imgArea");
    const list = edit.images;
    const thumbs = list.map((src, i) => `
      <div class="img-thumb ${i === 0 ? "primary" : ""}" data-i="${i}">
        <img src="${src}" alt="">
        ${i === 0 ? `<span class="img-badge">Main</span>` : ""}
        <div class="img-thumb-ctl">
          ${i > 0 ? `<button type="button" class="img-mini" data-primary="${i}" title="Make main photo">★</button>` : ""}
          ${i > 0 ? `<button type="button" class="img-mini" data-left="${i}" title="Move left">‹</button>` : ""}
          ${i < list.length - 1 ? `<button type="button" class="img-mini" data-right="${i}" title="Move right">›</button>` : ""}
          <button type="button" class="img-mini del" data-rm="${i}" title="Remove">×</button>
        </div>
      </div>`).join("");
    area.innerHTML = `
      <div class="img-grid">${thumbs}
        <button type="button" class="img-add" id="imgAddBtn">＋<br><small>Add photo(s)</small></button>
      </div>
      <small class="help">First photo is the main one shown on the product card. Add several to show a gallery. Auto-resized to keep the file small.</small>`;

    $("#imgAddBtn").addEventListener("click", () => $("#imgFile").click());
    $$("[data-rm]", area).forEach(b => b.addEventListener("click", () => { edit.images.splice(+b.dataset.rm, 1); renderImages(); }));
    $$("[data-primary]", area).forEach(b => b.addEventListener("click", () => { const i = +b.dataset.primary; edit.images.unshift(edit.images.splice(i, 1)[0]); renderImages(); }));
    $$("[data-left]", area).forEach(b => b.addEventListener("click", () => { const i = +b.dataset.left; [edit.images[i - 1], edit.images[i]] = [edit.images[i], edit.images[i - 1]]; renderImages(); }));
    $$("[data-right]", area).forEach(b => b.addEventListener("click", () => { const i = +b.dataset.right; [edit.images[i + 1], edit.images[i]] = [edit.images[i], edit.images[i + 1]]; renderImages(); }));
  }

  function resizeToDataURL(fileDataUrl) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > IMG_MAX) { height = Math.round(height * IMG_MAX / width); width = IMG_MAX; }
        else if (height > IMG_MAX) { width = Math.round(width * IMG_MAX / height); height = IMG_MAX; }
        const c = document.createElement("canvas");
        c.width = width; c.height = height;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(c.toDataURL("image/jpeg", IMG_QUALITY));
      };
      img.onerror = () => resolve(null);
      img.src = fileDataUrl;
    });
  }

  function handleImage(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    let done = 0;
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = async () => {
        const url = await resizeToDataURL(reader.result);
        if (url) edit.images.push(url);
        if (++done === files.length) { renderImages(); toast(files.length > 1 ? files.length + " images added" : "Image added"); }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }

  /* ---- options builder ---- */
  function renderOptions() {
    const wrap = $("#optWrap");
    wrap.innerHTML = edit.options.map((g, gi) => {
      const values = g.values.map((v, vi) => `
        <div class="val-row no-swatch">
          <input placeholder="Label EN" data-gi="${gi}" data-vi="${vi}" data-vf="label_en" value="${escapeHtml(v.label_en || "")}">
          <input placeholder="Label AR" dir="rtl" data-gi="${gi}" data-vi="${vi}" data-vf="label_ar" value="${escapeHtml(v.label_ar || "")}">
          <input placeholder="+ price" type="number" step="0.001" min="0" data-gi="${gi}" data-vi="${vi}" data-vf="priceDelta" value="${v.priceDelta || 0}">
          <button class="icon-btn" data-delv="${gi}:${vi}" title="Remove choice">×</button>
        </div>`).join("");
      return `<div class="opt-block">
        <div class="opt-head">
          <input class="mini" style="flex:1" placeholder="Group name EN (e.g. Size)" data-gi="${gi}" data-gf="name_en" value="${escapeHtml(g.name_en || "")}">
          <input class="mini" style="flex:1" placeholder="اسم المجموعة" dir="rtl" data-gi="${gi}" data-gf="name_ar" value="${escapeHtml(g.name_ar || "")}">
          <button class="icon-btn" data-delg="${gi}" title="Remove group">🗑</button>
        </div>
        ${values}
        <button class="btn btn-ghost mini" data-addv="${gi}" style="margin-top:4px">＋ Add choice</button>
      </div>`;
    }).join("") || `<p class="hint" style="margin:8px 0 0">No extra options — this product will be ordered with just its colors.</p>`;

    // bind
    $$("[data-delg]", wrap).forEach(btn => btn.addEventListener("click", () => {
      serializeOptions(); edit.options.splice(+btn.dataset.delg, 1); renderOptions();
    }));
    $$("[data-addv]", wrap).forEach(btn => btn.addEventListener("click", () => {
      serializeOptions();
      const gi = +btn.dataset.addv;
      edit.options[gi].values.push(blankValue(edit.options[gi].type));
      renderOptions();
    }));
    $$("[data-delv]", wrap).forEach(btn => btn.addEventListener("click", () => {
      serializeOptions();
      const [gi, vi] = btn.dataset.delv.split(":").map(Number);
      edit.options[gi].values.splice(vi, 1);
      if (!edit.options[gi].values.length) edit.options[gi].values.push(blankValue(edit.options[gi].type));
      renderOptions();
    }));
  }

  // Read all option inputs from the DOM back into edit.options (preserves typing before a re-render)
  function serializeOptions() {
    const wrap = $("#optWrap"); if (!wrap) return;
    $$("[data-gf]", wrap).forEach(el => { edit.options[+el.dataset.gi][el.dataset.gf] = el.value; });
    $$("[data-vf]", wrap).forEach(el => {
      const g = +el.dataset.gi, v = +el.dataset.vi, f = el.dataset.vf;
      const target = edit.options[g].values[v];
      target[f] = f === "priceDelta" ? (parseFloat(el.value) || 0) : el.value;
    });
  }

  function saveEditor() {
    serializeOptions();
    if (!edit.name_en.trim()) { toast("Please enter an English name"); return; }
    // derive "value" (the English label sent on WhatsApp) for each choice
    edit.options.forEach(g => g.values.forEach(v => { v.value = (v.label_en || v.value || "").trim(); }));
    // drop empty groups / empty choices
    edit.options = edit.options
      .map(g => ({ ...g, values: g.values.filter(v => v.label_en || v.label_ar) }))
      .filter(g => g.values.length);
    // keep only color parts that actually have colors ticked
    edit.colorParts = (edit.colorParts || []).filter(part => (part.colors || []).length);
    delete edit.colors;    // legacy single color list replaced by colorParts
    delete edit.materials; // legacy field no longer used (color carries its material)
    delete edit.image;     // legacy single-image field replaced by images[]

    if (editIndex === null) data.products.push(edit);
    else data.products[editIndex] = edit;
    autosave();
    renderList();
    closeEditor();
    toast("Product saved");
  }

  /* ---------------- import / export ---------------- */
  function exportJson() {
    ensureLibrary();
    const discounts = (data.discounts || []).filter(d => (d.code || "").trim()).map(d => ({ code: d.code.trim(), percent: Number(d.percent) || 0 }));
    const out = JSON.stringify({ config: data.config, library: data.library, discounts, products: data.products }, null, 2);
    const blob = new Blob([out], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "products.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Downloaded products.json — now upload it to GitHub");
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const j = JSON.parse(reader.result);
        data = { config: j.config || {}, library: j.library || {}, discounts: j.discounts || [], products: j.products || [] };
        migrateData();
        renderSettings(); renderLibrary(); renderDiscounts(); renderList(); autosave();
        toast("Imported");
      } catch (e) { toast("That file isn't valid JSON"); }
    };
    reader.readAsText(file);
  }

  /* ---------------- boot ---------------- */
  let booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    bindSettings();
    bindLibrary();
    bindDiscounts();
    $("#editorClose").addEventListener("click", closeEditor);
    $("#cancelEdit").addEventListener("click", closeEditor);
    $("#saveEdit").addEventListener("click", saveEditor);
    $("#editor").addEventListener("click", e => { if (e.target.id === "editor") closeEditor(); });
    $("#exportBtn").addEventListener("click", exportJson);
    $("#loadLiveBtn").addEventListener("click", () => { if (confirm("Replace your current edits with the live products.json from the site?")) loadLive(false); });
    $("#importBtn").addEventListener("click", () => $("#importFile").click());
    $("#importFile").addEventListener("change", e => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ""; });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#editor").classList.contains("open")) closeEditor(); });
    loadInitial();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
