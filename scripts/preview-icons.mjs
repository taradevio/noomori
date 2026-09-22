// Run: bun scripts/preview-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { appIconGlyphs, appIconSvg } from "../src/shared/ui/app-icon-glyphs.ts";
import colors from "../src/shared/design-system/colors.json";

const root = resolve(import.meta.dirname, "..");
const image = (name) => `data:image/webp;base64,${readFileSync(resolve(root, `assets/images/${name}.webp`)).toString("base64")}`;
const icon = (name, size, color = colors.primary, accented = false) =>
  `<img alt="${name}" width="${size}" height="${size}" src="data:image/svg+xml;base64,${Buffer.from(appIconSvg(name, color, accented)).toString("base64")}">`;

const rows = Object.keys(appIconGlyphs).map((name) =>
  `<div class="glyph"><span>${name}</span>${[14, 20, 24, 42].map((size) => `<div style="display:grid;gap:10px">${icon(name, size)}${icon(name, size, colors.primary, true)}</div>`).join("")}</div>`,
).join("");

writeFileSync(resolve(root, "specs/icon-review.html"), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Noomori · Icon review</title>
<style>
*{box-sizing:border-box}body{margin:0;background:${colors.background};color:${colors.textPrimary};font:15px/1.5 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:40px 32px}h1{font-size:32px;letter-spacing:-1px;margin:0}h2{font-size:18px;margin:28px 0 12px}p{color:${colors.textSecondary};margin:6px 0 20px}.references{display:flex;gap:16px}.references img{width:calc(50% - 8px);border-radius:16px}.states{display:flex;flex-wrap:wrap;gap:12px}.state{min-width:142px;display:flex;align-items:center;justify-content:center;gap:12px;padding:18px;border-radius:14px;background:${colors.surfaceSubtle}}.inverse{background:${colors.primary};color:white}.catalogue{display:grid;grid-template-columns:1fr 1fr;gap:0 32px}.glyph{display:grid;grid-template-columns:minmax(116px,1fr) repeat(4,48px);align-items:center;min-height:112px;padding:8px 0;border-bottom:1px solid ${colors.border}}.glyph div{display:flex;justify-content:center}.glyph span{font-size:13px;color:${colors.textSecondary}}.labels{font-size:12px;color:${colors.textSecondary}}.tabs{display:flex;gap:50px;align-items:center}.tab{display:grid;justify-items:center;gap:3px;font-size:12px}.options{display:flex;gap:24px;margin-left:32px}.options>div{display:flex;align-items:center;gap:10px}.options img{box-sizing:content-box;padding:12px;background:white;border-radius:12px}@media(max-width:800px){main{padding:24px 16px}.catalogue{grid-template-columns:1fr}.options{margin:0;flex-wrap:wrap}.states{gap:8px}}
</style>
<main><h1>Noomori icons</h1><p>Hand-drawn silhouettes · Bowed pen strokes · Teal ink, pale yellow and mint</p>
<div class="references"><img alt="Cookbook illustration" src="${image("cookbook")}"><img alt="Household illustration" src="${image("household")}"></div>
<h2>In context</h2><div class="states"><div class="tabs">${["recipes", "household", "account"].map((name, i) => `<div class="tab">${icon(name, 22, i === 0 ? colors.primary : colors.textSecondary, i === 0)}${["Recipes", "Household", "Account"][i]}</div>`).join("")}</div><div class="options">${["write", "paste", "link"].map((name, i) => `<div>${icon(name, 24, colors.primaryStrong, true)}${["Write", "Paste", "Import"][i]}</div>`).join("")}</div></div>
<h2>State treatments</h2><div class="states"><div class="state">${icon("household", 24)}Default</div><div class="state">${icon("household", 24, colors.primary, true)}Selected</div><div class="state">${icon("search", 20, colors.textSecondary)}Muted</div><div class="state">${icon("delete", 22, colors.error)}Error</div><div class="state inverse">${icon("add", 28, colors.onPrimary)}Inverse</div></div>
<h2>Complete set · Actual display sizes</h2><p>Each pair shows monochrome above, accented below. Utility controls stay monochrome.</p><div class="catalogue">${[0, 1].map(() => '<div class="glyph labels"><span>Icon</span><div>14px</div><div>20px</div><div>24px</div><div>42px</div></div>').join("")}${rows}</div>
</main></html>`);
console.log("Wrote specs/icon-review.html");
