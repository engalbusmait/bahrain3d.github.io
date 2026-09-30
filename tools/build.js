#!/usr/bin/env node
/*
 * Regenerate the static, crawlable site from data/products.json using the shared
 * sitegen module. Writes:
 *   - index.html                (homepage with pre-rendered product grid + SEO)
 *   - p/<slug>/index.html        (one per product)
 *   - sitemap.xml, robots.txt
 *
 * This is the SAME output the admin "Export site package" button produces in the
 * browser (both call assets/js/sitegen.js). Use this when you want to rebuild the
 * pages locally instead of through the admin UI.
 *
 * Usage:  node tools/build.js       (from the repo root)
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SG = require(path.join(ROOT, "assets", "js", "sitegen.js"));

const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "products.json"), "utf8"));
const out = SG.buildAll(data);

fs.writeFileSync(path.join(ROOT, "index.html"), out.index);
out.products.forEach(pg => {
  const dest = path.join(ROOT, pg.path.replace(/\//g, path.sep));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, pg.html);
});
fs.writeFileSync(path.join(ROOT, "sitemap.xml"), out.sitemap);
fs.writeFileSync(path.join(ROOT, "robots.txt"), out.robots);

console.log(`Built index.html, ${out.products.length} product pages, sitemap.xml, robots.txt`);
out.products.forEach(pg => console.log("  /" + pg.path.replace(/index\.html$/, "")));
