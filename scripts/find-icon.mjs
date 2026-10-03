#!/usr/bin/env bun
/**
 * Icon search: keywords in, vendored files out, ready to inline.
 *
 *   bun scripts/find-icon.mjs database chart
 *   bun scripts/find-icon.mjs --limit 5 meta google
 *
 * Searches icons/index.tsv plus the actual files under icons/ (flat theSVG
 * marks, nested variant folders, and the flat Phosphor set). Every word must
 * match somewhere in the name, title or tags. Prints the exact file to copy
 * and the data-icon value to tag it with, applying the ICONS.md variant rule
 * (flat wins; nested prefers light.svg over default.svg, never dark.svg).
 *
 * Copy the file's bytes, do not redraw them; see ICONS.md "Inlining".
 * Exit 0 (even on no matches), 2 usage error.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const ICONS = path.join(ROOT, "icons");

const HELP = [
  "usage: find-icon <word>... [--limit <n>]",
  "",
  "Search the vendored icon library by keyword. Every word must match",
  "somewhere in the icon name, title or tags. Prints the exact file to copy",
  "and the data-icon value, with the ICONS.md variant rule already applied.",
  "",
  "  <word>...      one or more keywords, e.g. find-icon database chart",
  "  --limit <n>    max results printed (default 12)",
  "  --ui           UI glyphs only (bold Phosphor): for interface chrome,",
  "                 tiles, rails. A UI query otherwise surfaces brand marks",
  "                 first, which is the wrong answer for a glyph.",
  "  --brand        brand marks only (colored theSVG): for a named product,",
  "                 company, institution or language.",
  "  --help, -h     print this and exit 0",
  "",
  "Exit 0 (even when nothing matches), 2 usage error.",
].join("\n");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && e.name.endsWith(".svg")) out.push(full);
  }
  return out;
}

function variantPick(folder) {
  const has = (n) => fs.existsSync(path.join(folder, n));
  if (has("light.svg")) return { file: "light.svg", why: "light-background variant" };
  if (has("default.svg")) return { file: "default.svg", why: "" };
  if (has("color.svg")) return { file: "color.svg", why: "full-colour version" };
  const rest = fs.readdirSync(folder).filter((f) => f.endsWith(".svg")
    && !/dark|wordmark|lockup|white|gold/i.test(f));
  if (rest.length) return { file: rest.sort()[0], why: "" };
  return { file: null, why: "" };
}

function main() {
  const argv = process.argv.slice(2);
  let limit = 12;
  let only = "";
  const words = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") { console.log(HELP); return 0; }
    if (a === "--limit") {
      const n = parseInt(argv[i + 1], 10);
      if (!Number.isInteger(n) || n < 1) { console.error("find-icon: --limit needs a positive integer"); return 2; }
      limit = n; i++; continue;
    }
    if (a.startsWith("--limit=")) {
      const n = parseInt(a.slice("--limit=".length), 10);
      if (!Number.isInteger(n) || n < 1) { console.error("find-icon: --limit needs a positive integer"); return 2; }
      limit = n; continue;
    }
    if (a === "--ui" || a === "--brand") { only = a.slice(2); continue; }
    if (a.startsWith("--")) { console.error(`find-icon: unknown flag: ${a}`); return 2; }
    words.push(a.toLowerCase());
  }
  if (!words.length) { console.error("find-icon: give at least one keyword: find-icon database"); return 2; }

  // Titles and tags live in icons/index.tsv (built by build-catalog.mjs), one
  // `key\ttitle\ttags` line per unit. The TSV is machine-readable on purpose:
  // The old markdown catalog's `- name (Title) — tags` format cost every reader a regex and
  // left the 1,512 Phosphor entries unparseable entirely.
  const catalog = new Map();
  try {
    for (const line of fs.readFileSync(path.join(ROOT, "icons", "index.tsv"), "utf8").split("\n")) {
      if (!line || line.startsWith("#")) continue;
      const [key, title = "", tags = ""] = line.split("\t");
      if (key) catalog.set(key.toLowerCase(), { name: key, title, tags });
    }
  } catch { /* catalog optional; filenames still searchable */ }

  const results = [];
  const seen = new Set();
  const push = (key, file, dataIcon, source, why) => {
    if (seen.has(key)) return;
    seen.add(key);
    const c = catalog.get(key.toLowerCase()) || { title: "", tags: "" };
    const hay = `${key} ${c.title} ${c.tags}`.toLowerCase();
    if (!words.every((w) => hay.includes(w) || key.toLowerCase().includes(w.replace(/-/g, "")))) return;
    let score = 0;
    for (const w of words) {
      if (key.toLowerCase() === w) score += 4;
      else if (key.toLowerCase().startsWith(w)) score += 3;
      else if (key.toLowerCase().includes(w)) score += 2;
      else if (c.title.toLowerCase().includes(w)) score += 1;
      else score += 0.5;
    }
    results.push({ score, key, file, dataIcon, source, why, title: c.title, tags: c.tags });
  };

  for (const f of walk(path.join(ICONS, "phosphor"))) {
    const name = path.basename(f, ".svg");
    push(name, path.relative(ROOT, f), `phosphor/${name}`, "phosphor bold", "");
  }
  for (const f of walk(path.join(ICONS, "coloredIconsMustUse"))) {
    const rel = path.relative(path.join(ICONS, "coloredIconsMustUse"), f);
    const parts = rel.split(path.sep);
    if (parts.length === 1) {
      const name = parts[0].slice(0, -4);
      push(name, path.relative(ROOT, f), `coloredIconsMustUse/${name}`, "theSVG flat", "");
    } else {
      const folder = parts[0];
      const pick = variantPick(path.join(ICONS, "coloredIconsMustUse", folder));
      if (pick.file && parts[1] === pick.file) {
        push(folder, `icons/coloredIconsMustUse/${folder}/${pick.file}`,
          `coloredIconsMustUse/${folder}/${pick.file.replace(/\.svg$/, "")}`,
          "theSVG variant", pick.why);
      }
    }
  }

  const filtered = only === "ui"
    ? results.filter((r) => r.source === "phosphor bold")
    : only === "brand"
      ? results.filter((r) => r.source !== "phosphor bold")
      : results;
  filtered.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1));
  if (!filtered.length) {
    console.log(`no matches for: ${words.join(" ")}${only ? ` with --${only}` : ""} — try fewer words, drop the filter, or raise --limit`);
    return 0;
  }
  for (const r of filtered.slice(0, limit)) {
    const sub = [r.title, r.tags].filter(Boolean).join(" · ");
    console.log(`${r.key}${sub ? ` — ${sub}` : ""}  [${r.source}${r.why ? `, ${r.why}` : ""}]`);
    console.log(`  inline: ${r.file}   data-icon="${r.dataIcon}"`);
  }
  if (filtered.length > limit) console.log(`...and ${filtered.length - limit} more; --limit raises the cap`);
  return 0;
}

process.exit(main());
