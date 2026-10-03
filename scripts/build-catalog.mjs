#!/usr/bin/env bun
/**
 * Build icons/index.tsv from the icon library plus its tag vocabulary.
 *
 * find-icon reads the TSV as a machine sidecar; no agent ever opens it. A TSV
 * is the honest form for this — one line per indexable unit, no prose, no
 * alias-triple padding. (It replaces a 656KB markdown catalog that cost every
 * reader a regex and left the Phosphor half unparseable.)
 *
 * The tags are the only column the filesystem cannot supply. They live in the
 * TSV itself once built: adding an icon means rebuilding (titles de-slug from
 * the filename, tags for genuinely new vocabulary go in by hand), and --check
 * verifies the file is fresh.
 *
 * Format, one unit per line: key \\t title \\t tags
 *   key     the lookup name (flat filename, folder name, or phosphor name)
 *   title   human title; de-slugged from the filename where the old catalog had none
 *   tags    comma-separated. Tags that merely repeat the key (the name re-split
 *           on punctuation, the slug verbatim) are dropped at build time: the
 *           key already matches those, so keeping them costs bytes for nothing.
 *
 * No file column. find-icon walks icons/ itself and resolves the exact file
 * plus the variant pick at search time; duplicating the path here would be a
 * second source of truth for the layout, and the layout is the environment's job.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const ICONS = path.join(ROOT, "icons");
const OUT = path.join(ICONS, "index.tsv");

const HELP = [
  "usage: bun scripts/build-catalog.mjs [--check]",
  "",
  "Reads the files under icons/ plus the tag vocabulary, writes icons/index.tsv.",
  "--check exits 1 when the TSV is out of date instead of writing it.",
].join("\n");

const CHECK = process.argv.slice(2).includes("--check");
if (process.argv.slice(2).includes("--help") || process.argv.slice(2).includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

/** filename-slug to Title: airplane-tilt -> Airplane Tilt. */
function deslug(s) {
  return s
    .split(/[-_]/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** The same variant preference find-icon applies: light > color > default. */
function variantPick(dir) {
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".svg"));
  } catch {
    return { file: "", why: "" };
  }
  if (!files.length) return { file: "", why: "" };
  const ranked = ["light.svg", "wordmark-light.svg", "color.svg", "default.svg"];
  for (const want of ranked) {
    if (files.includes(want)) return { file: want, why: `prefers ${want}` };
  }
  return { file: files.sort()[0], why: "first file" };
}

// Tags and titles, keyed by lookup name. First build reads CATALOG.md if it is
// still around; every build after that reads the TSV itself, so the tags
// survive the markdown's deletion and a rebuild never loses vocabulary it
// cannot regenerate from filenames.
const known = new Map();
const catPath = path.join(ROOT, "CATALOG.md");
if (fs.existsSync(catPath)) {
  for (const line of fs.readFileSync(catPath, "utf8").split("\n")) {
    const m = line.match(/^- (\S+) \((.*?)\) — (.*)$/);
    if (m) known.set(m[1].toLowerCase(), { title: m[2], tags: m[3] });
  }
}
const tsvPath = path.join(ICONS, "index.tsv");
if (!known.size && fs.existsSync(tsvPath)) {
  for (const line of fs.readFileSync(tsvPath, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("\t");
    if (parts[0]) known.set(parts[0].toLowerCase(), { title: parts[1] || "", tags: parts[2] || "" });
  }
}

const rows = [];

// Phosphor: flat, no subfolders. The old catalog never indexed these (its format
// requires a parenthesised title), so titles are de-slugged and tags are empty.
// That is still strictly more searchable than before, not less.
for (const f of fs.readdirSync(path.join(ICONS, "phosphor"))) {
  if (!f.endsWith(".svg")) continue;
  const key = f.slice(0, -4);
  const k = known.get(key.toLowerCase()) || { title: deslug(key), tags: "" };
  rows.push([key, k.title, k.tags]);
}

// theSVG flat marks.
const flatDir = path.join(ICONS, "coloredIconsMustUse");
for (const e of fs.readdirSync(flatDir, { withFileTypes: true })) {
  if (!e.isFile() || !e.name.endsWith(".svg")) continue;
  const key = e.name.slice(0, -4);
  const k = known.get(key.toLowerCase()) || { title: deslug(key), tags: "" };
  rows.push([key, k.title, k.tags]);
}

// theSVG variant folders: one row per folder, file is the picked variant.
for (const e of fs.readdirSync(flatDir, { withFileTypes: true })) {
  if (!e.isDirectory()) continue;
  const pick = variantPick(path.join(flatDir, e.name));
  if (!pick.file) continue;
  const k = known.get(e.name.toLowerCase()) || { title: deslug(e.name), tags: "" };
  rows.push([e.name, k.title, k.tags]);
}

/**
 * Drop tags that merely repeat the key: the slug verbatim, the name re-split on
 * punctuation, the name with spaces. The key already matches all of those, so
 * they cost bytes for nothing. What survives is the vocabulary the filesystem
 * cannot supply — categories, aliases, related words.
 */
function pruneTags(key, tags) {
  const parts = new Set(key.toLowerCase().split(/[-_./\d]+/).filter(Boolean));
  const spaced = key.toLowerCase().replace(/[-_]/g, " ");
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter((t) => {
      const l = t.toLowerCase();
      return l && l !== key.toLowerCase() && l !== spaced && !parts.has(l);
    })
    .join(", ");
}

rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
const tsv =
  `# key\ttitle\ttags — generated by scripts/build-catalog.mjs; do not hand-edit\n` +
  rows.map(([key, title, tags]) => [key, title, pruneTags(key, tags)].join("\t")).join("\n") +
  "\n";

if (CHECK) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (cur !== tsv) {
    console.error(`build-catalog: ${path.relative(ROOT, OUT)} is out of date (${rows.length} units). Run without --check to rebuild.`);
    process.exit(1);
  }
  console.log(`build-catalog: clean — ${rows.length} units`);
  process.exit(0);
}

fs.writeFileSync(OUT, tsv);
console.log(`build-catalog: wrote ${path.relative(ROOT, OUT)} — ${rows.length} units`);
