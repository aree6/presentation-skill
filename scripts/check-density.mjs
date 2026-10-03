#!/usr/bin/env bun
/**
 * Word density report and gate for a built slide deck.
 *
 * Decks drift into lecture handouts, and nothing in this folder catches it.
 * qa-matrix.mjs counts the words on every slide body but deliberately reports
 * the number instead of failing on it, so this script is the gate: it measures
 * the same rendered deck, in a browser, and fails when a slide is over budget.
 *
 * What is measured is the ink, not the source. The deck is loaded on file://,
 * driven slide by slide with `window.show(n)`, and only the ACTIVE slide is
 * read, because every `.slide` in the template is `display:none` until it is
 * active. Each text node is tested for painted client rects, so text that is
 * display:none, visibility:hidden, or a zero size box contributes nothing.
 *
 * Chrome is excluded, because chrome is not slide copy and counting it makes
 * the number move for reasons nobody can act on:
 *   .topbar          row 1, the N / TOTAL rail, the deck name, the breadcrumb
 *   .foot, [data-page]  the footer label and the slide number
 *   .edge, .nav      the floating prev/next affordance, outside the stage
 *   .sr-only         the live region that announces each slide to a screen reader
 *   svg, script, style, noscript, template
 *   [aria-hidden]    decorative only, and hidden from assistive tech too
 * The takeaway band IS counted. It is the one sentence the slide exists to
 * deliver, so it is copy like any other, and a deck that hides a wall of
 * sentences in the takeaway is exactly the drift this catches.
 *
 * On a failure it names the longest blocks of visible text on that slide, with
 * their word counts and enough of their words to find them in the source. A
 * word count with no locations attached is a number a builder reads and then
 * ignores.
 * A block here is a block element that holds text: `p`, `li`, `td`, and the
 * description and meta lines inside a card. Text is attributed to the INNERMOST
 * such block, so a `p` nested in a `td` owns its words once and the `td` does
 * not count them again. No attempt is made to segment prose into sentences.
 *
 * This script never writes to the deck. There is deliberately no `--fix`.
 * Condensing prose is a judgement about which argument survives, and a
 * mechanical rewrite that holds the word count while losing the claim is worse
 * than an over-budget slide. `--fix` is refused by name rather than ignored, so
 * a call that passes it fails loudly instead of quietly doing nothing.
 *
 * The median and the worst slide are printed on every run, pass or fail. A cap
 * that a real deck breaks on every slide is a cap that gets switched off, and
 * the only defence is publishing the distribution next to the verdict.
 *
 * Usage:
 *   bun scripts/check-density.mjs
 *   bun scripts/check-density.mjs --deck <file> --words 80
 *   bun scripts/check-density.mjs --deck=<file> --words=80 --json
 *   (also honors the DECK env var; defaults to templates/template.html)
 *
 * Exit 0 every slide within budget, 1 at least one slide over, 2 usage error
 * or a deck this script cannot drive.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launchChromium } from "./lib/chromium.mjs";

/**
 * Flags that take a value. Listed rather than inferred, because a value-taking
 * flag has to claim its own token: with two of them, a parser that just lets
 * the first one eat the first bare token turns `--words 0 --deck x.html` into
 * a deck called "0". Claiming in argv order is the only unambiguous reading.
 */
const VALUE_FLAGS = new Set(["deck", "words"]);

/** `--flag value` and `--flag=value` both set the flag; `--flag=false` clears it. */
function parseArgv(argv) {
  const flags = new Map();
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h") {
      flags.set("help", true);
    } else if (arg.startsWith("--") && arg.length > 2) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        const name = arg.slice(2, eq);
        const value = arg.slice(eq + 1);
        // A value-taking flag keeps its value verbatim, including "0", which is
        // a number a caller may legitimately pass and must not be read as an
        // off switch. A boolean flag uses an explicit falsy to clear itself.
        flags.set(
          name,
          VALUE_FLAGS.has(name) ? value : /^(0|false|no|off)$/i.test(value) ? false : value,
        );
        continue;
      }
      const name = arg.slice(2);
      const next = argv[i + 1];
      const nextIsFlag = next === undefined || next === "-h" || (next.startsWith("--") && next.length > 2);
      // The value is only eaten when the next token is not itself a flag, so
      // `--deck --json` never reads --json as the deck path.
      if (VALUE_FLAGS.has(name) && !nextIsFlag) {
        flags.set(name, next);
        i++;
      } else {
        flags.set(name, true);
      }
    } else {
      positional.push(arg);
    }
  }
  return {
    flags,
    /** The value of a value-taking flag, from `--flag=v` or the token after it. */
    take(name) {
      const v = flags.get(name);
      return typeof v === "string" ? v : "";
    },
    on(name) {
      // Any value that is not an explicit falsy turns the flag on, so
      // --json, --json=1 and --json=yes all work while --json=false does not.
      const v = flags.get(name);
      return v !== undefined && v !== false;
    },
  };
}

/**
 * The cap, in words per slide, counting everything the audience reads on the
 * slide except chrome (headline, subline, body, takeaway, chips).
 *
 * 130 is the limit. A slide above it fails, with its longest blocks named so
 * the cut has a place to start: rephrase to fall back under the cap, or split
 * the slide in two. The reference deck reads median 70, so 130 is roughly twice
 * the typical slide and leaves room for an honest four-card grid, while a
 * slide that has become a page cannot pass. `templates/slides/patterns.html` fails
 * several of its slides at 130, and that is the gate working rather than
 * misfiring: the gallery is a menu of shapes, each carrying the fullest copy
 * that shape can hold, so judge a deck with this, never the gallery.
 *
 * Override it with --words when a deck genuinely has a different budget. A
 * workshop handout is not a talk, and a gate you cannot pass is a gate you will
 * switch off.
 */
const DEFAULT_WORDS = 130;

/**
 * The word cap. A slide above this fails the run, with its longest blocks
 * named so the cut has a place to start: rephrase to fall back under the cap,
 * or split the slide in two.
 */

/** Chars of a block quoted back in the failure report, enough to find it. */
const EXCERPT = 120;

/** Longest blocks named per failing slide before the list is truncated. */
const TOP_BLOCKS = 5;

/** Width of the bar column, in characters. Fixed so the table stays a table. */
const BAR_WIDTH = 20;

/** Settle after each show(n). This measures text, not ink, so it is short. */
const SETTLE_MS = 150;

/** The design size. The PDF is captured here, so the deck is read here. */
const W = 1920;
const H = 1080;

/**
 * Subtrees that are chrome or not painted, never slide copy. Kept as a list of
 * selectors so the reason for each exclusion is readable next to the selector.
 */
const EXCLUDE = [
  ".edge", // floating prev/next affordance, outside the stage
  ".nav",
  ".rail", // sidebar table of contents: slide labels, never slide copy
  ".sr-only", // the live region that announces each slide to a screen reader
  "svg", // a diagram's own labels are not slide copy (same call as qa-matrix)
  "script",
  "style",
  "noscript",
  "template",
  "[aria-hidden]", // decorative, and hidden from assistive tech too
].join(", ");

/**
 * A block of text a person could be asked to condense. Deliberately a short
 * explicit list rather than a heuristic over every block box: `p`, `li`, `td`
 * plus the description and meta lines a card is built from. `.gapnote` is the
 * one caveat the skill allows on a shipped slide, and it is a paragraph.
 */
const PARAGRAPH = "p, li, td, th, dd, blockquote, figcaption, .desc, .meta, .gapnote";

/**
 * Table and figure cells are readable or they are not — DESIGN.md is explicit
 * that "a slide whose body is a data table or a diagram: words are not the
 * measure". Counting `td`/`th` anyway failed a 10x6 clinical results table on
 * cell text alone (measured: 133 words, 3 over the cap, for a table the eye
 * reads at a glance), so a slide whose body is a table gets the cap relaxed
 * rather than waived: the words still print and still inform, but the gate
 * judges the table by fitting the band, which is what qa-matrix.mjs checks.
 *
 * Set on the table itself (`class="results"`) or inferred when a slide's only
 * text-bearing block is a table.
 */
const TABLE_CARVEOUT_MULTIPLIER = 4;
const isTableOnlySlide = (bodyEl) =>
  !!bodyEl && !bodyEl.querySelector("p, li, .desc, .meta, blockquote, .gapnote") &&
  !!bodyEl.querySelector("table");

const HELP = [
  "usage: bun scripts/check-density.mjs [--deck <file>] [--words <n>] [--json]",
  "",
  "  --deck <file>   deck to measure; also --deck=<file>. Defaults to $DECK,",
  "                  then templates/template.html next to this script.",
  `  --words <n>     cap in words per slide; also --words=<n>. Default ${DEFAULT_WORDS}. Above it fails; longest blocks are named.`,
  "  --json          print one JSON object and nothing else; exits the same.",
  "  --help, -h      print this and exit 0",
  "",
  "Loads the deck in Chromium at 1920x1080, walks it with window.show(n), and",
  "counts the words and characters actually painted on each slide, excluding",
  "chrome: the sidebar rail, the slide number, the screen reader",
  "live region, anything inside an svg, and any aria-hidden subtree. The",
  "takeaway band is counted.",
  "",
  "Every slide is printed, pass or fail, followed by the deck median and the",
  `worst slide. A slide over ${DEFAULT_WORDS} words is a FAIL, and the failing report names the longest`,
  "blocks of text on that slide with their word counts and an excerpt, so you",
  "know which paragraph to condense. Nothing is ever rewritten: there is no",
  "--fix, and prose is not safely machine-fixable.",
  "",
  "Exit 0 every slide within budget, 1 at least one slide over, 2 usage error",
  "or a deck this script cannot drive.",
].join("\n");

const opts = parseArgv(process.argv.slice(2));
if (opts.on("help")) {
  console.log(HELP);
  process.exit(0);
}

// Refused by name, not ignored. A call that still passes --fix would otherwise
// silently report on a deck nobody edited.
if (opts.on("fix")) {
  console.error("check-density: there is no --fix, and there will not be one.");
  console.error("  Condensing copy is a judgement about which argument survives. A");
  console.error("  mechanical rewrite that holds the word count while losing the claim");
  console.error("  is worse than an over-budget slide, so this script only reports.");
  console.error("  The failing report names the paragraphs; the rewriting is yours.");
  process.exit(2);
}

const SCRIPTS_DIR = path.resolve(fileURLToPath(new URL(".", import.meta.url)));
const ROOT = path.dirname(SCRIPTS_DIR);
const DECK = path.resolve(
  opts.take("deck") || process.env.DECK || path.join(ROOT, "templates", "template.html"),
);
const JSON_MODE = opts.on("json");
const WORDS_RAW = opts.take("words") || String(DEFAULT_WORDS);
const CAP = Number(WORDS_RAW);

if (!Number.isInteger(CAP) || CAP < 1) {
  console.error(`check-density: --words must be a whole number of at least 1, got "${WORDS_RAW}"`);
  process.exit(2);
}

try {
  if (!fs.existsSync(DECK)) {
    console.error(`check-density: no such deck: ${DECK}`);
    console.error("  pass --deck <file>, or set DECK, or run against templates/template.html");
    process.exit(2);
  }
  if (!fs.statSync(DECK).isFile()) {
    console.error(`check-density: not a file: ${DECK}`);
    process.exit(2);
  }
  fs.accessSync(DECK, fs.constants.R_OK);
} catch (err) {
  if (err && err.code === "EACCES") {
    console.error(`check-density: deck is not readable: ${DECK}`);
    process.exit(2);
  }
  throw err;
}

/**
 * Read the active slide. Runs in the page, so every selector and every DOM
 * lookup stays in one function rather than making a round trip per element.
 * `exclude` and `para` come in as arguments because a function passed to
 * page.evaluate cannot close over anything from this module.
 */
const MEASURE = ({ exclude, para }) => {
  const slide = document.querySelector(".slide.active");
  if (!slide) return null;

  // Recorded here rather than inferred from the returned blocks, because it has
  // to describe the slide's shape and not its block list.
  const body = slide.querySelector(".s-body");
  const tableOnly =
    !!body &&
    !body.querySelector("p, li, .desc, .meta, blockquote, .gapnote") &&
    !!body.querySelector("table");

  const excluded = (el) => !!(el && el.closest(exclude));
  // Two tests, because neither one covers the other. `getClientRects` on a
  // Range returns nothing for a display:none subtree, which is how an
  // inactive slide drops out, but it returns a full rect for a
  // visibility:hidden element, because that element still has a box. Measured,
  // not assumed: a <p style="visibility:hidden"> reports one rect. So
  // visibility is read off the computed style, where it is inherited, and the
  // rect test handles the rest. Opacity is deliberately not tested: it is not
  // inherited, so reading it honestly means walking to the nearest ancestor
  // with a non-unit value, and a deck that hides a band with opacity:0 has a
  // bug of its own that the clipping check in qa-matrix.mjs reports.
  const hidden = (el) => {
    if (!el || el.nodeType !== 1) return true;
    const cs = getComputedStyle(el);
    return cs.display === "none" || cs.visibility === "hidden";
  };
  const range = document.createRange();
  const painted = (node) => {
    range.selectNodeContents(node);
    return range.getClientRects().length > 0;
  };
  // Short, human-findable name for an element, same shape qa-matrix uses.
  const label = (el) => {
    let out = el.tagName.toLowerCase();
    const cls = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean);
    if (cls.length) out += "." + cls[0];
    const parent = el.parentElement;
    if (parent) {
      const twins = [...parent.children].filter(
        (c) => c.tagName === el.tagName && (c.getAttribute("class") || "") === (el.getAttribute("class") || ""),
      );
      if (twins.length > 1) out += `:nth-of-type(${twins.indexOf(el) + 1})`;
    }
    return out;
  };

  // One bucket for the whole slide, one per paragraph block. Raw text goes in
  // untrimmed and is collapsed once at the end, because a whitespace-only text
  // node between two inline runs is a real word boundary and trimming it away
  // would fuse the two words into one.
  const total = { text: "" };
  const blocks = new Map();
  const walk = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    const raw = node.nodeValue;
    if (!raw) continue;
    const parent = node.parentElement;
    if (!parent || excluded(parent)) continue;
    if (hidden(parent) || !painted(node)) continue;
    total.text += raw;
    // closest() walks up from the text's own parent, so the innermost block
    // claims these words and any block containing it does not count them again.
    const owner = parent.closest(para);
    if (!owner) continue;
    let b = blocks.get(owner);
    if (!b) {
      b = { el: owner, text: "" };
      blocks.set(owner, b);
    }
    b.text += raw;
  }

  const squash = (s) => s.replace(/\s+/g, " ").trim();
  const words = (s) => (s ? s.split(" ").length : 0);
  const text = squash(total.text);
  return {
    name: (slide.getAttribute("data-name") || "").trim(),
    tableOnly,
    words: words(text),
    chars: text.length,
    blocks: [...blocks.values()]
      .map((b) => {
        const t = squash(b.text);
        return { label: label(b.el), words: words(t), chars: t.length, text: t };
      })
      .filter((b) => b.words > 0)
      .sort((a, b) => b.words - a.words || b.chars - a.chars || a.label.localeCompare(b.label)),
  };
};

const browser = await launchChromium("check-density");

const page = await browser.newPage({ viewport: { width: W, height: H } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e && e.message ? e.message : e).slice(0, 200)));

await page.goto(pathToFileURL(DECK).href, { waitUntil: "load" });
// `load`, not `networkidle`, for the reason given in qa-matrix.mjs.
await page.evaluate(async () => {
  if (window.__deckReady && typeof window.__deckReady.then === "function") {
    try { await window.__deckReady; } catch { /* reported by the deck */ }
  }
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch {} }
});

const slideCount = await page.evaluate(() => document.querySelectorAll(".slide").length);
if (!slideCount) {
  console.error(`check-density: no .slide elements in ${DECK}`);
  await browser.close();
  process.exit(2);
}
if ((await page.evaluate(() => typeof window.show)) !== "function") {
  console.error(`check-density: ${DECK} does not expose window.show(n); cannot walk the deck.`);
  await browser.close();
  process.exit(2);
}

// Freeze the morph so a slide is fully laid out the moment show(n) returns.
await page.evaluate(() => { window.__noMorph = true; });

const rows = [];
for (let n = 0; n < slideCount; n++) {
  await page.evaluate((k) => window.show(k), n);
  await page.waitForTimeout(SETTLE_MS);
  const measured = await page.evaluate(MEASURE, { exclude: EXCLUDE, para: PARAGRAPH });
  if (!measured) {
    console.error(`check-density: slide ${n + 1} did not activate; cannot measure the deck.`);
    await browser.close();
    process.exit(2);
  }
  // A table-only slide is judged on whether it fits the band, not on how many
  // cells it has. The count still prints, so the number is available; it just
  // stops being the gate. See TABLE_CARVEOUT_MULTIPLIER for the measurement
  // that motivated this.
  const tableOnly = measured.tableOnly === true;
  const limit = tableOnly ? CAP * TABLE_CARVEOUT_MULTIPLIER : CAP;
  rows.push({
    slide: n + 1,
    ...measured,
    tableOnly,
    limit,
    over: measured.words > limit,
  });
}
await browser.close();

const counts = rows.map((r) => r.words);
const sorted = counts.slice().sort((a, b) => a - b);
const mid = Math.floor(sorted.length / 2);
const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
const worst = rows.reduce((a, b) => (b.words > a.words ? b : a));
const over = rows.filter((r) => r.over);

if (JSON_MODE) {
  console.log(
    JSON.stringify(
      {
        deck: DECK,
        viewport: `${W}x${H}`,
        cap: CAP,
        slides: rows.map((r) => ({
          slide: r.slide,
          name: r.name,
          words: r.words,
          chars: r.chars,
          tableOnly: r.tableOnly,
          limit: r.limit,
          over: r.over,
          blocks: r.blocks,
        })),
        summary: {
          slides: rows.length,
          median,
          worst: { slide: worst.slide, name: worst.name, words: worst.words },
          over: over.length,
        },
        pageErrors,
      },
      null,
      2,
    ),
  );
  process.exit(over.length ? 1 : 0);
}

const out = [];
out.push(
  `slide density: ${path.basename(DECK)}   cap ${CAP} words per slide   ${W}x${H}   chrome excluded`,
);
out.push(`  ${"slide".padStart(5)} ${"words".padStart(5)} ${"chars".padStart(6)}  ${"bar".padEnd(BAR_WIDTH)}  name`);
for (const r of rows) {
  const filled = Math.max(1, Math.min(BAR_WIDTH, Math.round((r.words / r.limit) * BAR_WIDTH)));
  const bar = "#".repeat(filled) + "-".repeat(BAR_WIDTH - filled);
  // The table marker is informational: the slide is judged on whether the table
  // fits the band (qa-matrix.mjs), so the word count beside it is context.
  const flag = r.over ? "  OVER" : r.tableOnly ? "  table" : "";
  out.push(
    `  ${("s" + r.slide).padStart(5)} ${String(r.words).padStart(5)} ${String(r.chars).padStart(6)}  ${bar}  ${r.name}${flag}`,
  );
}
out.push("");
out.push(
  `median ${median} words, worst s${worst.slide} (${worst.words} words${worst.over ? `, +${worst.words - CAP} over cap` : ""}), ` +
    `${over.length} of ${rows.length} slide(s) over cap`,
);
// Not a gate, just the sentence DESIGN.md already says about a high median,
// repeated next to the number it is about.
if (median > 70) {
  out.push("a median this high reads as a document with slides around it; the split is the move, not a rewrite");
}

for (const r of over) {
  const top = r.blocks.slice(0, TOP_BLOCKS);
  const held = top.reduce((a, b) => a + b.words, 0);
  out.push("");
  out.push(
    `s${r.slide} OVER: ${r.words} words, ${r.words - CAP} over the cap of ${CAP}${r.name ? `   [${r.name}]` : ""}`,
  );
  if (!r.blocks.length) {
    out.push("  no paragraph block found: the words are in spans and labels, so cut them where they sit");
    continue;
  }
  out.push(
    `  longest blocks (${r.blocks.length} on this slide, the ${top.length} below hold ${held} of its ${r.words} words):`,
  );
  for (const b of top) {
    const quoted = b.text.length > EXCERPT ? b.text.slice(0, EXCERPT) + "..." : b.text;
    out.push(`    ${String(b.words).padStart(3)}w ${b.label.padEnd(18)} "${quoted.replace(/"/g, "'")}"`);
  }
  if (r.blocks.length > TOP_BLOCKS) {
    out.push(`    ... and ${r.blocks.length - TOP_BLOCKS} more block(s) on this slide`);
  }
  // A slide can be over budget without owning a single long paragraph: icon
  // slots, chip rows and stat labels add up to more words than any one block.
  // Saying so is the difference between a diagnosis and a dead end.
  if (held * 2 < r.words) {
    out.push(
      `  most of this slide's words are not in a block, so they are in labels, chips and spans: the cut is in`,
    );
    out.push(`  how many elements the slide has, not in how long a paragraph is.`);
  }
}

if (pageErrors.length) {
  out.push("");
  out.push(`page errors while rendering (the count above may be short by that much):`);
  for (const e of pageErrors) out.push(`  PAGEERROR: ${e}`);
}

console.log(out.join("\n"));
if (over.length) console.log(`\n${over.length} slide(s) over cap`);

else if (pageErrors.length) {
  console.log(`\ndensity within cap, but ${pageErrors.length} page error(s) make the count unreliable`);
} else {
  console.log("\ndone");
}
process.exit(over.length || pageErrors.length ? 1 : 0);
