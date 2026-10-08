#!/usr/bin/env bun
/**
 * Verify the factual claims the prose makes about the environment.
 *
 * Five bugs in this skill's history were the same bug: a hand-written number
 * or name that the artefact moved out from under. Gallery slide numbers off by
 * two, "27 slides" in a 33-slide gallery, a dead `deck.html`, a word cap
 * credited to the wrong script, an icon catalog 2,145 entries short of the
 * files on disk. Editing them by hand means they come back.
 *
 * So this script checks the ones a script can check, and exits non-zero when
 * any of them is wrong. It is the gate that stops the rot returning. Run it as
 * part of any docs change, not as part of `check` — a deck author cannot fix a
 * finding about this skill's own documentation.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse } from "./lib/markdown.mjs";
import {
  galleryPatterns,
  TEMPLATE_EXTRAS,
  CARD_DNA,
} from "./lib/patterns.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const HELP = [
  "usage: bun scripts/check-refs.mjs",
  "",
  "Checks every factual claim the skill's prose makes about its own files:",
  "gallery slide counts, section anchors, script names, token names, icon",
  "counts, and the gallery boot script against the template it is copied from.",
  "Exit 0 all hold, 1 something drifted, 2 usage error.",
].join("\n");

if (process.argv.slice(2).includes("--help") || process.argv.slice(2).includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

const findings = [];
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** A claim failed: file it with both sides, the way every other checker does. */
function fail(where, claim, truth) {
  findings.push(`${where}: claims ${claim}; measured ${truth}`);
}

/* ---------------------------------------------------------------- gallery -- */

/** Slide count in a gallery file, by section elements. */
function slideCount(rel) {
  const src = read(rel);
  return [...src.matchAll(/<section\b/g)].length;
}

/** Every "NN slides" / "NN-slide" number the prose states about the gallery. */
function galleryClaims() {
  const n = slideCount("templates/slides/patterns.html");
  const prose = [
    ["SKILL.md", read("SKILL.md")],
    ["DESIGN.md", read("DESIGN.md")],
    ["README.md", read("README.md")],
    ["cli.mjs", read("cli.mjs")],
  ];
  for (const [file, src] of prose) {
    // "33-slide gallery", "33 slides", "fails 7 of 33", "10 sample slides" is
    // the *template*, not the gallery — different number, exclude it.
    for (const m of src.matchAll(/(\d+)\s*-?slides?\b/gi)) {
      const v = Number(m[1]);
      const ctx = src.slice(Math.max(0, m.index - 60), m.index + m[0].length + 20);
      if (/sample|template\.html|starter/i.test(ctx)) continue; // the 10-slide base
      if (/appendix|backup|Q&A/i.test(ctx)) continue; // the Q&A backup guidance
      if (v !== n) fail(file, `"${m[0]}" near “…${ctx.replace(/\s+/g, " ").slice(-50)}”`, `${n} sections in patterns.html`);
    }
  }
  // The gallery's own header must agree with its own sections. Only comments
  // count: slide copy like "3 slides after this one" is dummy content, not a
  // claim about the gallery.
  const gal = read("templates/slides/patterns.html");
  for (const m of gal.matchAll(/<!--[\s\S]*?-->/g)) {
    const comment = m[0];
    const base = gal.slice(0, m.index).split("\n").length;
    for (const n2 of comment.matchAll(/(\d+)\s*-?slides?\b/gi)) {
      const v = Number(n2[1]);
      if (v !== n) {
        const line = base + comment.slice(0, n2.index).split("\n").length - 1;
        fail(`templates/slides/patterns.html:${line}`, `"${n2[0]}"`, `${n} sections`);
      }
    }
  }
}

/* ----------------------------------------------------------------- anchors -- */

/** Every `FILE.md` → "Section" pointer in SKILL.md must name a real section. */
function sectionPointers() {
  const skill = read("SKILL.md");
  const files = ["DESIGN.md", "MERMAID.md", "ICONS.md", "content_philosophy.md"];
  const parsed = {};
  for (const f of files) parsed[f] = parse(read(f)).headings.map((h) => h.text.toLowerCase());
  // `FILE.md` → "Section" and FILE.md §N. Bare §N with no file is unresolvable
  // by construction and is a separate finding, not this checker's job.
  for (const m of skill.matchAll(/`([A-Z_a-z]+\.md)`\s*→\s*"([^"]+)"/g)) {
    const [, file, section] = m;
    if (!parsed[file]) continue;
    const want = section.toLowerCase();
    if (!parsed[file].some((h) => h.includes(want) || want.includes(h))) {
      fail("SKILL.md", `${file} → "${section}"`, `no such heading (closest: ${closest(parsed[file], want)})`);
    }
  }
}

function closest(headings, want) {
  const words = want.split(/[^a-z]+/).filter((w) => w.length > 2);
  let best = null;
  for (const h of headings) {
    const hits = words.filter((w) => h.includes(w)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { h, hits };
  }
  return best ? `"${best.h}"` : "nothing close";
}

/* ----------------------------------------------------------------- scripts -- */

/** Every `bun cli.mjs <sub>` and `bun scripts/<file>` in prose must exist. */
function scriptRefs() {
  const pkg = JSON.parse(read("package.json"));
  const npmScripts = new Set(Object.keys(pkg.scripts || {}));
  // cli subcommands are SCRIPT_OF keys plus check/new. `ste` is not one of
  // those: it is the only command with no script behind it, because its linter
  // is a vendored Python file under skills/ rather than a scripts/*.mjs. It is
  // named here so the prose that tells a reader to run it is checked like the
  // rest, instead of being the one claim this gate cannot see.
  const cliSrc = read("cli.mjs");
  const subMap = cliSrc.match(/const SCRIPT_OF = \{([\s\S]*?)\};/);
  const subs = new Set(["check", "test", "new", "ste"]);
  if (subMap) for (const m of subMap[1].matchAll(/^\s*([a-z]+):/gm)) subs.add(m[1]);
  const files = new Set(fs.readdirSync(path.join(ROOT, "scripts")).filter((f) => f.endsWith(".mjs")));

  for (const doc of ["SKILL.md", "README.md", "DESIGN.md", "MERMAID.md", "ICONS.md"]) {
    const src = read(doc);
    for (const m of src.matchAll(/(?:node|bun) cli\.mjs ([a-z]+)/g)) {
      if (!subs.has(m[1])) fail(doc, `cli.mjs ${m[1]}`, `no such subcommand (${[...subs].join(", ")})`);
    }
    for (const m of src.matchAll(/(?:node|bun) scripts\/([a-z-]+\.mjs)/g)) {
      if (!files.has(m[1])) fail(doc, `scripts/${m[1]}`, "no such file in scripts/");
    }
    for (const m of src.matchAll(/(?:npm|bun) run ([a-z]+)/g)) {
      if (!npmScripts.has(m[1])) fail(doc, `run ${m[1]}`, "no such package.json script");
    }
  }
}

/* ------------------------------------------------------------------ tokens -- */

/** Every `var(--x)` in the templates must be defined in :root or inline. */
function tokenRefs() {
  const defined = new Set();
  for (const f of ["templates/template.html", "templates/slides/patterns.html", "templates/slides/covers.html"]) {
    const src = read(f);
    const root = (src.match(/:root\{([\s\S]*?)\}/) || [])[1] || "";
    for (const m of root.matchAll(/--([a-z0-9-]+):/g)) defined.add(m[1]);
    // Per-instance custom properties, set inline on the element that uses
    // them: --p (ring percentage), --g (donut gradient), --i. Same pattern as
    // the documented --p contract, so they are definitions, not drift.
    for (const m of src.matchAll(/style="[^"]*?--([a-z0-9-]+):/g)) defined.add(m[1]);
  }
  for (const f of ["templates/template.html", "templates/slides/patterns.html", "templates/slides/covers.html"]) {
    const src = read(f);
    const used = new Set([...src.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((m) => m[1]));
    for (const u of used) {
      if (!defined.has(u)) fail(f, `var(--${u})`, "no such token in any :root");
    }
  }
}

/* --------------------------------------------------------------------- boot --
 * templates/slides/patterns.html keeps its own copy of the base CSS and of the
 * boot script, and says in its own comment that the two files must not drift.
 * They drift silently: nothing breaks, the gallery still renders, and the only
 * symptom is that a transition the template performs no longer happens there.
 *
 * So this compares the blocks the two files share, with comments stripped first.
 * Comments are the one difference the gallery is allowed to have (it annotates its
 * own cascade list and its own rail), and stripping them makes the comparison
 * exact where a byte comparison would be a nuisance. Any other difference is a
 * finding, and the report names the block and the first line that differs.
 */
const SHARED = [
  ["fade", "@keyframes fade{", "/* ---- background texture"],
  ["motion", "/* ---- motion: staged entrance", "/* ---- chrome: constant across every slide"],
  ["fragments + code", "/* ---- fragments: one slide", "\n/* ---- chrome:"],
  ["fragment + engine js", "/* ---- fragments: the step inside one slide", "function show(n,instant){"],
  // Stops at the rail registry: the gallery's rail is its own pattern-jump list
  // with its own icon names, so everything from there down is legitimately its own.
  ["navigation", "function stage(){", "const RAIL_ICONS={"],
];

/** Strip comments and collapse whitespace, so the comparison is about code. */
function bare(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trimEnd())
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
}

function region(src, start, end, where) {
  const i = src.indexOf(start);
  if (i === -1) return null;
  const j = src.indexOf(end, i);
  return j === -1 ? null : src.slice(i, j);
}

function bootDrift() {
  const tpl = read("templates/template.html");
  const gal = read("templates/slides/patterns.html");
  for (const [label, start, end] of SHARED) {
    const a = region(tpl, start, end, "template");
    const b = region(gal, start, end, "gallery");
    if (a === null) {
      fail("templates/template.html", `boot block "${label}"`, "the anchor is gone; this gate needs updating");
      continue;
    }
    if (b === null) {
      fail("templates/slides/patterns.html", `boot block "${label}"`, "missing: copy the block from the template");
      continue;
    }
    /* The template's lines have to appear in the gallery's, in order. It is a
       subsequence rather than an equality because the gallery legitimately adds
       lines of its own inside a region (its rail builds its jump list from its own
       element names), and the difference worth failing on is a CHANGED line, not
       an extra one. Duplicated code still fails: the second copy stops matching. */
    const A = bare(a).split("\n").filter((l) => l.length);
    const B = bare(b).split("\n").filter((l) => l.length);
    let k = 0;
    for (const line of A) {
      const at = B.indexOf(line, k);
      if (at === -1) {
        fail(
          "templates/slides/patterns.html",
          `boot block "${label}" is missing a line the template has`,
          `template ${JSON.stringify(line.slice(0, 90))} — nothing in the gallery's copy matches it from line ${k + 1}`,
        );
        break;
      }
      k = at + 1;
    }
  }
}

/* ------------------------------------------------------------------- icons -- */

/**
 * icons/index.tsv must cover the library's indexable units: one row per flat
 * file, one per variant folder, one per Phosphor glyph. A stale TSV silently
 * unlists icons, so the count is the guard — rebuild with build-catalog.mjs.
 */
function catalogCount() {
  const flat = fs.readdirSync(path.join(ROOT, "icons", "coloredIconsMustUse"), { withFileTypes: true });
  const units =
    flat.filter((e) => e.isFile() && e.name.endsWith(".svg")).length +
    flat.filter((e) => e.isDirectory()).length +
    fs.readdirSync(path.join(ROOT, "icons", "phosphor")).filter((f) => f.endsWith(".svg")).length;
  const tsv = read("icons/index.tsv");
  const entries = tsv.split("\n").filter((l) => l && !l.startsWith("#")).length;
  if (entries !== units) {
    fail("icons/index.tsv", `${entries} rows`, `${units} indexable units — run scripts/build-catalog.mjs`);
  }
}

/**
 * The icon modal's asset root must resolve on both sides of the contract: the
 * template declares `window.__SKILL_ASSETS__` with the next-to-the-tree
 * default, and `new` rewrites exactly that marker to the correct relative path
 * from the deck. If either side drifts, decks built by `new` get a modal that
 * loads nothing.
 */
const MARKER_REF = 'window.__SKILL_ASSETS__="../assets"';
function assetRoot() {
  const tpl = read("templates/template.html");
  if (!tpl.includes(MARKER_REF)) {
    fail("templates/template.html", "the __SKILL_ASSETS__ default", "marker missing or changed");
  }
  const cli = read("cli.mjs");
  if (!cli.includes(MARKER_REF)) {
    fail("cli.mjs", "`new` rewriting the __SKILL_ASSETS__ marker", "substitution missing or changed");
  }
}

/**
 * The gallery is the only list of treatments, so this checks the derivation
 * holds both ways: every gallery section parses to a recognised body class
 * (a new pattern with unmapped markup fails here, not silently in the rhythm
 * readout), every template-only treatment in lib/patterns.mjs really lives in
 * templates/template.html, and DESIGN.md's card-DNA prose names exactly the
 * script's CARD_DNA set — the two copies that once disagreed.
 */
function galleryTreatments() {
  for (const p of galleryPatterns()) {
    if (p.bodyClass === "other") {
      fail("templates/slides/patterns.html", `pattern ${p.n} (${p.name})`, "no recognised body class in lib/patterns.mjs bodyClassOf");
    }
  }
  const tpl = read("templates/template.html");
  for (const c of TEMPLATE_EXTRAS) {
    if (!new RegExp(`class="[^"]*\\b${c}\\b`).test(tpl)) {
      fail("scripts/lib/patterns.mjs", `TEMPLATE_EXTRAS "${c}"`, "no such class in templates/template.html");
    }
  }
  const design = read("DESIGN.md");
  const vr = design.slice(design.indexOf("### The variety rule"));
  const section = vr.slice(0, vr.indexOf("\n### ", 1) === -1 ? undefined : vr.indexOf("\n### ", 1));
  for (const c of CARD_DNA) {
    if (!section.includes(`\`.${c}\``)) {
      fail("DESIGN.md", `### The variety rule naming \`.${c}\``, "card-DNA class missing from the prose");
    }
  }
}

/**
 * MERMAID.md §5 prints the deck boot script by hand while the gallery carries
 * the running copy; the hand copy once lost its finally, leaving non-active
 * slides stuck .active. The two are intentionally different presentations, so
 * byte-identity would be the wrong test — structure is the test: the printed
 * block must show the slide, try, catch, and the finally that puts it back.
 */
function mermaidFinally() {
  const doc = read("MERMAID.md");
  const s5 = doc.slice(doc.indexOf("## 5."));
  const code = (s5.match(/```html([\s\S]*?)```/) || [])[1] || "";
  for (const [frag, why] of [
    ["classList.add(\"active\", \"measuring\")", "showing the slide for measurement"],
    ["try {", "the render attempt"],
    ["} catch (e) {", "the error card"],
    ["finally {", "putting the slide back"],
    ["remove(\"active\", \"measuring\")", "removing both classes"],
  ]) {
    if (!code.includes(frag)) fail("MERMAID.md", `§5 boot script ${why}`, `missing ${frag}`);
  }
}
galleryClaims();
sectionPointers();
scriptRefs();
tokenRefs();
catalogCount();
assetRoot();
galleryTreatments();
bootDrift();
mermaidFinally();

/**
 * Every inline <script> in every HTML file parses. The boot engine is copied
 * by hand into the template, the gallery and each deck, and a brace miscount
 * in any copy kills that file with "Unexpected end of input" and no other
 * symptom: window.show never exists, every gate that drives the deck errors,
 * and nothing names the file. Extraction follows the parser, not regex: HTML
 * comments are skipped (one mentions `<script>` in prose) and script contents
 * are taken element-wise, so a `</script>` inside a JS string cannot truncate
 * the block the way a regex split does.
 */
function inlineJsParses() {
  // One probe up front: without a node runtime there is nothing to check
  // syntax with, and failing every file for a missing interpreter would be a
  // finding about the machine, not the skill.
  const probe = (() => {
    try {
      const r = spawnSync("node", ["--check", "/dev/null"], { encoding: "utf8" });
      return !r.error;
    } catch {
      return false;
    }
  })();
  if (!probe) {
    console.log("note  inlineJsParses skipped: no node runtime on PATH");
    return;
  }
  const files = ["templates/template.html", "templates/slides/patterns.html"];
  try {
    for (const d of fs.readdirSync(path.join(ROOT, "decks"))) {
      const dir = path.join(ROOT, "decks", d);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith(".html")) files.push(path.join("decks", d, f));
      }
    }
  } catch { /* no decks directory: nothing to check */ }
  for (const rel of files) {
    const src = read(rel);
    // Element-wise: comment contents (including a prose `<script>`) never open
    // a block, and block contents run to their own close tag.
    const blocks = [];
    const re = /<!--[\s\S]*?-->|(<script(?:\s[^>]*)?>)([\s\S]*?)(<\/script>)/gi;
    let m;
    while ((m = re.exec(src))) {
      if (m[1] !== undefined) blocks.push(m[2]);
    }
    blocks.forEach((code, i) => {
      if (!code.trim()) return;
      // .cjs, not .mjs: an inline <script> without type=module parses as a
      // classic script, and checking it as a module would invent failures.
      const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jscheck-")), "block.cjs");
      fs.writeFileSync(tmp, code);
      const r = spawnSync("node", ["--check", tmp], { encoding: "utf8" });
      try { fs.rmSync(path.dirname(tmp), { recursive: true }); } catch { /* best effort */ }
      if (r.status !== 0) {
        const line = (r.stderr || "").split("\n").find((l) => /:\d+\s*$/.test(l)) || "";
        fail(rel, `inline <script> block ${i} does not parse${line ? ` (${line.trim()})` : ""}`, "node --check output above; a hand-copied engine edit unbalanced it");
      }
    });
  }
}
inlineJsParses();

if (!findings.length) {
  console.log("check-refs: clean — every prose claim about the environment holds");
  process.exit(0);
}
console.log(`check-refs: ${findings.length} finding(s)`);
for (const f of findings) console.log(`  FAIL  ${f}`);
process.exit(1);
