#!/usr/bin/env bun
/**
 * Print one section of one of this skill's markdown files.
 *
 * `DESIGN.md` is 63KB and `MERMAID.md` is 70KB. Neither is meant to be read
 * whole; both are meant to be entered at a heading. But the only tool for that
 * was `sed -n '952,993p'`, which needs the line numbers already — and the line
 * numbers are exactly what goes stale every time the file is edited.
 *
 * So: `bun cli.mjs doc DESIGN.md Motion` and it prints the section, heading
 * first, up to the next heading of the same level.
 *
 * On a heading it cannot find, it refuses with the three closest matches. That
 * is the important behaviour. A retrieval tool that silently returns the wrong
 * section is worse than one that says no, because the caller cannot tell the
 * difference between "this is Motion" and "this is the section whose text
 * happens to contain the word motion".
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, sectionRange, trailing, baseSlug } from "./lib/markdown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const DOCS = ["SKILL.md", "DESIGN.md", "MERMAID.md", "ICONS.md", "content_philosophy.md"];

const HELP = [
  "usage: bun scripts/get-doc.mjs <file> <heading>",
  "       bun scripts/get-doc.mjs --list [<file>]",
  "",
  "  <file>      one of: " + DOCS.join(", "),
  "  <heading>    any part of it. Number prefixes are ignored, so 7.1.1 and",
  "               \"Flowchart\" both find the Flowchart section.",
  "  --list       every heading in the file, with line numbers",
  "",
  "Prints the section heading-first, through its sub-headings, up to the next",
  "heading of the same or higher level. Refuses with the closest three matches",
  "rather than guessing.",
].join("\n");

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h") || !argv.length) {
  console.log(HELP);
  process.exit(argv.length ? 0 : 2);
}

if (argv[0] === "--list") {
  const file = resolveFile(argv[1]);
  if (!file) process.exit(2);
  const name = path.basename(file);
  const { headings } = parse(read(file));
  console.log(`${headings.length} headings in ${name}`);
  console.log("");
  for (const h of headings) {
    console.log(`  L${String(h.line).padStart(5)}  ${"  ".repeat(h.level - 1)}${h.text}`);
  }
  console.log("");
  console.log(`one section: bun scripts/get-doc.mjs ${name} "<heading>"`);
  process.exit(0);
}

const file = resolveFile(argv[0]);
if (!file) process.exit(2);

const needle = argv.slice(1).join(" ").trim();
if (!needle) {
  console.error("get-doc: needs a heading to look for");
  console.error(`  bun scripts/get-doc.mjs --list ${file.name}`);
  process.exit(2);
}

const src = read(file);
const lines = src.split(/\r?\n/);
const { headings } = parse(src);

if (!headings.length) {
  console.error(`get-doc: no headings in ${file.name}`);
  process.exit(2);
}

/**
 * Exact slug first, then slug match, then a word-overlap score. Ordered because
 * the cheap and certain answers must win: `doc MERMAID.md 7.1` should never
 * return `7.1.1` by accident when `7.1` exists.
 */
const want = baseSlug(trailing(needle)).toLowerCase();
const words = want.split("-").filter((w) => w.length > 2);

let index = headings.findIndex((h) => baseSlug(h.text) === want);
if (index === -1) index = headings.findIndex((h) => baseSlug(trailing(h.text)) === want);
if (index === -1) {
  index = headings.findIndex((h) => baseSlug(h.text).startsWith(want + "-") || want.startsWith(baseSlug(h.text) + "-"));
}

if (index === -1 && words.length) {
  const scored = headings
    .map((h, i) => {
      const s = baseSlug(trailing(h.text)).split("-");
      const hits = words.filter((w) => s.includes(w)).length;
      return { i, hits };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  if (scored.length) index = scored[0].i;
}

const NAME = path.basename(file);

if (index === -1) {
  console.error(`get-doc: no heading matching ${JSON.stringify(needle)} in ${NAME}`);
  const near = nearest(headings, want, words).slice(0, 3);
  if (near.length) {
    console.error("  closest:");
    for (const n of near) {
      console.error(`    ${NAME}  L${n.line}  ${n.text}`);
      console.error(`      bun scripts/get-doc.mjs ${NAME} ${JSON.stringify(n.text)}`);
    }
  } else {
    console.error(`  ${headings.length} headings in the file; list them:`);
    console.error(`    bun scripts/get-doc.mjs --list ${NAME}`);
  }
  process.exit(2);
}

const h = headings[index];
const { startLine, endLine } = sectionRange(headings, index);
const body = lines.slice(startLine - 1, endLine).join("\n");

console.log(`# ${path.basename(file)} — ${h.text}  (L${h.line}${endLine === Infinity ? "" : `-${endLine}`})`);
console.log("");
console.log(body.replace(/\s+$/, ""));

/** Token overlap on the slug's words, ranked. Cheap and good enough to suggest. */
function nearest(hs, want, words) {
  const wantWords = new Set(want.split("-").filter(Boolean));
  return hs
    .map((h) => {
      const s = new Set(baseSlug(trailing(h.text)).split("-"));
      let hits = 0;
      for (const w of wantWords) if (s.has(w)) hits++;
      for (const w of words) if (s.has(w)) hits++;
      return { ...h, score: hits };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || a.line - b.line);
}

function resolveFile(name) {
  const base = path.basename(name || "");
  const full = path.resolve(ROOT, base);
  if (!name) {
    console.error(`get-doc: needs a file. One of: ${DOCS.join(", ")}`);
    process.exit(2);
  }
  if (!fs.existsSync(full)) {
    console.error(`get-doc: no such file: ${full}`);
    console.error(`  one of: ${DOCS.join(", ")}`);
    process.exit(2);
  }
  return full;
}

function read(f) {
  try {
    return fs.readFileSync(f, "utf8");
  } catch (err) {
    console.error(`get-doc: cannot read ${f}: ${err.message}`);
    process.exit(2);
  }
}
