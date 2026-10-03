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
import path from "node:path";
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
  "counts. Exit 0 all hold, 1 something drifted, 2 usage error.",
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
  // cli subcommands are SCRIPT_OF keys plus check/new.
  const cliSrc = read("cli.mjs");
  const subMap = cliSrc.match(/const SCRIPT_OF = \{([\s\S]*?)\};/);
  const subs = new Set(["check", "test", "new"]);
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
mermaidFinally();

if (!findings.length) {
  console.log("check-refs: clean — every prose claim about the environment holds");
  process.exit(0);
}
console.log(`check-refs: ${findings.length} finding(s)`);
for (const f of findings) console.log(`  FAIL  ${f}`);
process.exit(1);
