#!/usr/bin/env bun
/**
 * Build the browser-side icon search data for edit mode.
 *
 * The deck opens over file://, where fetch() is CORS-blocked but <script>
 * tags load fine. So the modal's search data ships as generated JS, loaded
 * lazily only when the icon modal opens:
 *
 *   assets/icon-index.js        [key, title, tags, dataIcon] for every unit
 *   assets/icon-files/<b>.js    {key: "<svg...>"} per first-letter bucket
 *
 * Units mirror find-icon.mjs exactly: phosphor names, flat theSVG names, and
 * variant folders resolved through the same variantPick. A bucket holds only
 * the resolved file's bytes, so the modal replaces with the same glyph the
 * CLI would hand out and check-visuals keeps passing.
 *
 * Generated, never committed: rebuild after adding icons.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const ICONS = path.join(ROOT, "icons");
const OUT_DIR = path.join(ROOT, "assets");
const FILES_DIR = path.join(OUT_DIR, "icon-files");

const HELP = [
  "usage: bun cli.mjs icons build",
  "",
  "Reads icons/index.tsv plus the vendored .svg files and writes",
  "assets/icon-index.js and assets/icon-files/<bucket>.js for the",
  "in-browser icon modal. Run again after adding icons.",
].join("\n");

if (process.argv.slice(2).includes("--help") || process.argv.slice(2).includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

// Same preference find-icon.mjs applies: light wins, dark never ships.
function variantPick(folder) {
  const has = (n) => fs.existsSync(path.join(folder, n));
  if (has("light.svg")) return "light.svg";
  if (has("default.svg")) return "default.svg";
  if (has("color.svg")) return "color.svg";
  const rest = fs.readdirSync(folder).filter((f) => f.endsWith(".svg")
    && !/dark|wordmark|lockup|white|gold/i.test(f));
  return rest.length ? rest.sort()[0] : null;
}

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && e.name.endsWith(".svg")) out.push(full);
  }
  return out;
};

const catalog = new Map();
for (const line of fs.readFileSync(path.join(ICONS, "index.tsv"), "utf8").split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const [key, title = "", tags = ""] = line.split("\t");
  if (key) catalog.set(key.toLowerCase(), { title, tags });
}

// Units, in find-icon's own terms: [key, file, dataIcon].
const units = [];
for (const f of walk(path.join(ICONS, "phosphor"))) {
  const name = path.basename(f, ".svg");
  units.push([name, f, `phosphor/${name}`]);
}
for (const f of walk(path.join(ICONS, "coloredIconsMustUse"))) {
  const rel = path.relative(path.join(ICONS, "coloredIconsMustUse"), f);
  const parts = rel.split(path.sep);
  if (parts.length === 1) {
    const name = parts[0].slice(0, -4);
    units.push([name, f, `coloredIconsMustUse/${name}`]);
  } else {
    const folder = parts[0];
    const pick = variantPick(path.join(ICONS, "coloredIconsMustUse", folder));
    if (pick && parts[1] === pick) {
      units.push([folder, f, `coloredIconsMustUse/${folder}/${pick.replace(/\.svg$/, "")}`]);
    }
  }
}

const bucketOf = (key) => {
  const c = (key[0] || "").toLowerCase();
  return /[a-z0-9]/.test(c) ? c : "misc";
};

const index = [];
const buckets = new Map();
for (const [key, file, dataIcon] of units) {
  const c = catalog.get(key.toLowerCase()) || { title: "", tags: "" };
  index.push([key, c.title, c.tags, dataIcon]);
  const svg = fs.readFileSync(file, "utf8");
  const b = bucketOf(key);
  if (!buckets.has(b)) buckets.set(b, {});
  buckets.get(b)[key] = svg;
}

index.sort((a, b) => (a[0] < b[0] ? -1 : 1));
fs.mkdirSync(FILES_DIR, { recursive: true });
fs.writeFileSync(
  path.join(OUT_DIR, "icon-index.js"),
  `window.__ICON_INDEX=${JSON.stringify(index)};\n`,
);
let bytes = 0;
for (const [b, map] of buckets) {
  const file = path.join(FILES_DIR, `${b}.js`);
  const body = `window.__ICON_FILES=window.__ICON_FILES||{};Object.assign(window.__ICON_FILES,${JSON.stringify(map)});\n`;
  fs.writeFileSync(file, body);
  bytes += body.length;
}
console.log(`icons build: ${index.length} units, ${buckets.size} buckets, ${(bytes / 1048576).toFixed(1)} MB of svg`);
