#!/usr/bin/env bun
/**
 * Print one pattern from the gallery, or the whole menu.
 *
 * The gallery is 2,481 lines and 296KB — 102KB of it inline SVG path data. An
 * agent that opens it to choose a treatment pays for every pattern to use one,
 * and 57% of what it reads is icon geometry it is meant to replace with
 * `data-icon` anyway.
 *
 * So the menu is the cheap artifact and the markup is opt-in:
 *   --list   every pattern: number, name, and its own caption. ~2,400 tokens.
 *   <n>      one pattern's markup, with its icons collapsed to `data-icon`.
 *   --find   the list, filtered by a word in a caption.
 *
 * The caption is co-located with the markup on purpose. In the gallery it lives
 * in a `.galcap` in the footer, ~150 lines below the slide it describes, so an
 * agent reading the markup has to scroll back up to find out what the pattern is
 * for. Printing them together is the whole point.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { galleryPatterns, cssForPattern } from "./lib/patterns.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const HELP = [
  "usage: bun scripts/get-pattern.mjs <n> [--css] | --list | --find <words>",
  "",
  "  --list            every pattern with its caption, cheapest first",
  "  --find <words>    the list, filtered to captions matching a word",
  "  <n>               one pattern's markup (1-based, as numbered in the gallery)",
  "  --css             with <n>: also print the gallery CSS the markup needs,",
  "                    ready to paste (minus what templates/template.html has)",
  "  --full-icons      keep the inline SVG paths instead of collapsing them",
  "  --covers          read covers.html instead of patterns.html",
  "  --help, -h        print this and exit 0",
  "",
  "Icons collapse to <svg class=\"ph\" data-icon=\"...\"> because the deck is",
  "meant to source its glyphs from icons/ anyway; --full-icons restores them.",
  "Prints to stdout, so `> slide.html` works.",
].join("\n");

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

const wantsCovers = argv.includes("--covers");
const fullIcons = argv.includes("--full-icons");
const wantCss = argv.includes("--css");
const file = wantsCovers ? path.join(ROOT, "templates", "slides", "covers.html") : path.join(ROOT, "templates", "slides", "patterns.html");

if (!fs.existsSync(file)) {
  console.error(`get-pattern: no gallery at ${file}`);
  process.exit(2);
}

// The parse lives in lib/patterns.mjs, shared with check-visuals.mjs, so
// the menu, the markup and the rhythm readout can never disagree about what
// the gallery holds. --covers parses the covers file through the same parser.
const src = fs.readFileSync(file, "utf8");
/**
 * Replace each inline SVG with a placeholder naming its source. The deck is
 * built from `icons/`, and `check-visuals.mjs` verifies `data-icon` provenance
 * rather than the inlined bytes, so the geometry is not information the builder
 * needs — it is 102KB of it.
 */
function collapseIcons(markup) {
  return markup.replace(
    /<svg\b[^>]*data-icon="([^"]*)"[^>]*>[\s\S]*?<\/svg>/g,
    (_m, icon) =>
      `<svg class="ph" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" data-icon="${icon}"><!-- glyph from icons/${icon.replace(/^[^/]+\//, "")}.svg --></svg>`,
  );
}

const all = galleryPatterns(src);
if (!all.length) {
  console.error(`get-pattern: no patterns parsed out of ${path.basename(file)}`);
  process.exit(2);
}

const findIdx = argv.indexOf("--find");
if (findIdx !== -1) {
  const needle = (argv[findIdx + 1] || "").toLowerCase();
  if (!needle) {
    console.error("get-pattern: --find needs a word to look for");
    process.exit(2);
  }
  const hits = all.filter((p) => `${p.name} ${p.use} ${p.notFor}`.toLowerCase().includes(needle));
  if (!hits.length) {
    console.error(`get-pattern: nothing matches ${JSON.stringify(needle)}`);
    console.error(`  ${all.length} patterns; try a broader word, or read the whole menu:`);
    console.error("  bun scripts/get-pattern.mjs --list");
    process.exit(2);
  }
  printList(hits);
  process.exit(0);
}

const listIdx = argv.indexOf("--list");
if (listIdx !== -1) {
  printList(all);
  process.exit(0);
}

const n = Number(argv.find((a) => /^\d+$/.test(a)));
if (!n) {
  console.error("get-pattern: give a pattern number, --list, or --find <words>");
  console.error(`  bun scripts/get-pattern.mjs --help   (${all.length} patterns available)`);
  process.exit(2);
}

const p = all.find((x) => x.n === n);
if (!p) {
  console.error(`get-pattern: no pattern ${n}. The gallery has ${all[0].n}-${all[all.length - 1].n}.`);
  process.exit(2);
}

const markup = fullIcons ? p.markup : collapseIcons(p.markup);
console.log(`# pattern ${p.n} — ${p.name}`);
console.log(`# source: ${path.relative(ROOT, file)}:${p.line}`);
console.log(`# use when: ${p.use}`);
if (p.notFor) console.log(`# not for: ${p.notFor}`);
console.log(`# ${markup.length} bytes${fullIcons ? "" : " with icons collapsed (--full-icons to keep them)"}`);
console.log("");
console.log(markup.trim());

if (wantCss) {
  // The CSS the markup needs, derived from the gallery's own <style> minus
  // what the template already carries: core rules to paste, shared-class
  // extensions named, template-owned classes noted. See lib/patterns.mjs.
  const r = cssForPattern(p.markup, file);
  console.log("");
  console.log(`/* ---- CSS for pattern ${p.n} (${p.name}): paste into the deck's <style> ---- */`);
  for (const rule of r.core) console.log(rule);
  if (r.motionSkipped) {
    console.log(`/* motion: add .${p.bodyClass} to the deck's tile-cascade :is() list (DESIGN.md Motion) —`);
    console.log(`   do not paste the gallery's cascade rules beside the template's motion block. */`);
  }
  if (r.supportClasses.length) {
    console.log(`/* also uses gallery extensions of shared classes: ${r.supportClasses.join(", ")} —`);
    console.log(`   the deck already carries the template base for these; copy the gallery's`);
    console.log(`   rules only if the render differs. */`);
  }
  if (r.alreadyInTemplate.length) {
    console.log(`/* already in templates/template.html, nothing to copy: ${r.alreadyInTemplate.join(", ")} */`);
  }
  if (r.undefined.length) {
    console.log(`/* defined nowhere, write them yourself: ${r.undefined.join(", ")} */`);
  }
}

/**
 * The menu. One line per pattern with its own caption, because the caption is
 * the decision and the number is the handle — an agent picking a treatment needs
 * both and nothing else.
 */
function printList(list) {
  console.log(`${list.length} pattern${list.length === 1 ? "" : "s"} in ${path.basename(file)}`);
  console.log("");
  for (const p of list) {
    console.log(`${String(p.n).padStart(2)}  ${p.name}`);
    if (p.use) console.log(`    use when:  ${p.use}`);
    if (p.notFor) console.log(`    not for:   ${p.notFor}`);
  }
  console.log("");
  console.log(`markup for one: bun scripts/get-pattern.mjs ${list[0].n}`);
}
