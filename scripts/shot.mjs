#!/usr/bin/env bun
/**
 * Screenshot capture for a slide deck, one PNG per slide.
 *
 * This is the one place screenshots happen. Nothing here is invented:
 *
 *   - Readiness is the QA path's wait, line for line: `waitUntil: "load"`,
 *     then `window.__deckReady`, then `document.fonts.ready`, then a fixed
 *     settle for CSS transitions. A diagram that renders late is captured
 *     rendered, not empty, for the same reason QA measures it rendered.
 *   - Overlay and navigation chrome is hidden the way export-pdf hides it:
 *     `.edge,.nav{display:none !important;}` as an injected style tag.
 *   - The per-slide verdict is not a second implementation of anything. After
 *     capturing, this script runs qa-matrix.mjs on the same deck and prints
 *     the lines it printed for the captured slides, so the judgement beside
 *     each screenshot is the QA matrix's own.
 *
 * Usage:
 *   bun scripts/shot.mjs <n> [--deck <file>] [--out-dir <dir>]
 *   bun scripts/shot.mjs <a-b> [--deck <file>] [--out-dir <dir>]
 *   bun scripts/shot.mjs all [--deck <file>] [--out-dir <dir>]
 *   (also honors DECK env var; defaults to templates/template.html)
 *
 * The spec is required: a bare number captures one slide, `a-b` captures the
 * inclusive range, `all` captures every slide. Anything else is exit 2.
 *
 * Output is `<deck-dir>/<stem>-shots/sNN.png` unless --out-dir says
 * otherwise. Absolute paths print one per line in slide order, then the QA
 * verdict lines for those slides.
 *
 * Screenshots are for humans: this script is deliberately not part of `check`,
 * which must stay non-interactive and fast. Run it and look at the pictures.
 *
 * Exit 0 captures written, 1 unused (QA findings print but do not fail the
 * capture), 2 usage error or a deck this script cannot drive.
 *
 * Requires: playwright (+ installed Chromium) resolvable from this script's
 * directory.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launchChromium } from "./lib/chromium.mjs";

/**
 * Flags that take a value. Listed rather than inferred, because a value-taking
 * flag has to claim its own token: with two of them, a parser that just lets
 * the first one eat the first bare token turns `--deck x --out-dir y` into
 * noise. Claiming in argv order is the only unambiguous reading.
 */
const VALUE_FLAGS = new Set(["deck", "out-dir"]);

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
        // A value-taking flag keeps its value verbatim. A boolean flag uses an
        // explicit falsy to clear itself.
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
      // `--deck --help` never reads --help as the deck path.
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
    positional,
    /** The value of a value-taking flag, from `--flag=v` or the token after it. */
    take(name) {
      const v = flags.get(name);
      return typeof v === "string" ? v : "";
    },
    on(name) {
      // Any value that is not an explicit falsy turns the flag on, so
      // --help, --help=1 and --help=yes all work while --help=false does not.
      const v = flags.get(name);
      return v !== undefined && v !== false;
    },
  };
}

const HELP = [
  "usage: bun scripts/shot.mjs <n | a-b | all> [--deck <file>] [--out-dir <dir>] [--no-qa] [--context]",
  "",
  "  <n>             capture slide n (1-based), e.g. `shot 5`",
  "  <a-b>           capture slides a through b inclusive, e.g. `shot 1-10`",
  "  all             capture every slide",
  "  --deck <file>   deck to capture; also --deck=<file>. Defaults to $DECK,",
  "                  then templates/template.html next to this script.",
  "  --out-dir <dir> where to write; also --out-dir=<dir>. Defaults to",
  "                  <deck-dir>/<stem>-shots.",
  "  --no-qa         skip the QA matrix pass beside the capture. That pass walks",
  "                  the WHOLE deck at four viewports, so a per-slide review loop",
  "                  (build one, shoot one, look, fix) pays for it once per shot.",
  "  --context       with a single <n>: also capture n-1 and n+1, write a",
  "                  side-by-side s<n>-context.html, and print the live rhythm",
  "                  line plus the deck-level variety advisories. Repetition and",
  "                  arc are properties of neighbours, not of one slide.",
  "  --help, -h      print this and exit 0",
  "",
  "Waits on window.__deckReady and document.fonts.ready exactly like",
  "qa-matrix.mjs, so a late diagram is captured rendered, and hides .edge/.nav",
  "chrome exactly like export-pdf.mjs. Prints one absolute PNG path per line in",
  "slide order, then the QA matrix verdict for each captured slide (or just the",
  "paths, with --no-qa).",
  "",
  "Screenshots are for humans and are not part of `check`, which stays",
  "non-interactive and fast. Run this and look at the pictures.",
  "",
  "Exit 0 captures written, 2 usage error or a deck that cannot be driven.",
].join("\n");

const opts = parseArgv(process.argv.slice(2));
if (opts.on("help")) {
  console.log(HELP);
  process.exit(0);
}

const SCRIPTS_DIR = path.resolve(fileURLToPath(new URL(".", import.meta.url)));
const ROOT = path.dirname(SCRIPTS_DIR);
const DECK = path.resolve(
  opts.take("deck") || process.env.DECK || path.join(ROOT, "templates", "template.html"),
);
const STEM = path.basename(DECK, path.extname(DECK));
const OUT_DIR = path.resolve(opts.take("out-dir") || path.join(path.dirname(DECK), `${STEM}-shots`));

/** The design size. The PDF is captured here, so screenshots happen here too. */
const W = 1920;
const H = 1080;

/** Settle after each show(n): transitions, not loading. Readiness is awaited. */
const SETTLE_MS = 300;

function die(message) {
  console.error(`shot: ${message}`);
  console.error("  valid forms: shot <n> | shot <a-b> | shot all   (e.g. shot 5, shot 1-10, shot all)");
  process.exit(2);
}

try {
  if (!fs.existsSync(DECK)) die(`no such deck: ${DECK}. Pass --deck <file>, or set DECK.`);
  if (!fs.statSync(DECK).isFile()) die(`not a file: ${DECK}`);
  fs.accessSync(DECK, fs.constants.R_OK);
} catch (err) {
  if (err && err.code === "EACCES") die(`deck is not readable: ${DECK}`);
  throw err;
}

if (opts.positional.length !== 1) {
  if (!opts.positional.length) die("no slide given.");
  die(`one slide spec, and got ${opts.positional.length}: ${opts.positional.map((s) => JSON.stringify(s)).join(", ")}`);
}
const SPEC = opts.positional[0];

// The shape is validated before Chromium launches; the bounds need the slide
// count, so they wait until the deck is loaded. Either way the message names
// the valid forms.
if (!/^(all|\d+|\d+-\d+)$/i.test(SPEC)) die(`not a slide spec: ${JSON.stringify(SPEC)}.`);
if (opts.on("context") && !/^\d+$/.test(SPEC)) die("--context takes a single slide, e.g. `shot 5 --context`.");

const browser = await launchChromium("shot");
const page = await browser.newPage({ viewport: { width: W, height: H } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e && e.message ? e.message : e).slice(0, 200)));

await page.goto(pathToFileURL(DECK).href, { waitUntil: "load" });
await page.emulateMedia({ media: "screen" });
// Same mechanism export-pdf uses: injected CSS, so nav chrome never burns in.
// `.themebar,.themehit` is the presenter's theme switcher. Injected rather than
// keyed off a body attribute because `body[data-themebar]` is how a presenter
// *asks* for the switcher — a capture must never inherit that request.
await page.addStyleTag({
  content: ".edge,.nav,.themebar,.themehit,.editmodal{display:none !important;}",
});

// The QA path's wait, mirrored rather than reinvented: window.__deckReady is
// the readiness contract, fonts.ready settles webfonts, and the fixed settle
// exists for CSS transitions, not for loading. `load`, never `networkidle`,
// for the reason qa-matrix.mjs gives.
await page.evaluate(async () => {
  if (window.__deckReady && typeof window.__deckReady.then === "function") {
    try { await window.__deckReady; } catch { /* reported by the deck */ }
  }
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch {} }
});
await page.waitForTimeout(700);
// Freeze morph transitions so every capture is the settled slide.
await page.evaluate(() => { window.__noMorph = true; });

const total = await page.evaluate(() => document.querySelectorAll(".slide").length);
if (!total) {
  console.error(`shot: no .slide elements found in ${DECK}`);
  await browser.close();
  process.exit(2);
}
if ((await page.evaluate(() => typeof window.show)) !== "function") {
  console.error(`shot: ${DECK} does not expose window.show(n); cannot drive the deck.`);
  await browser.close();
  process.exit(2);
}

let wanted;
if (/^all$/i.test(SPEC)) {
  wanted = Array.from({ length: total }, (_, i) => i + 1);
} else if (/^\d+$/.test(SPEC)) {  const n = Number(SPEC);
  if (n < 1 || n > total) {
    console.error(`shot: slide ${SPEC} is outside 1..${total}`);
    await browser.close();
    process.exit(2);
  }
  wanted = [n];
} else if (/^(\d+)-(\d+)$/.test(SPEC)) {
  const [, a, b] = SPEC.match(/^(\d+)-(\d+)$/);
  const lo = Number(a);
  const hi = Number(b);
  if (lo < 1 || hi > total || lo > hi) {
    console.error(`shot: range ${SPEC} is outside 1..${total} (need a-b with 1 <= a <= b <= ${total})`);
    await browser.close();
    process.exit(2);
  }
  wanted = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
} else {
  await browser.close();
  die(`not a slide spec: ${JSON.stringify(SPEC)}.`);
}

// --context widens a single slide to its neighbours: repetition and arc are
// properties of the sequence, and a loop that only ever sees one slide cannot
// judge them. Ranges and `all` already carry their own context. (Single-spec
// is validated before launch, above.)
let focus = 0;
if (opts.on("context")) {
  focus = Number(SPEC);
  wanted = [focus - 1, focus, focus + 1].filter((x) => x >= 1 && x <= total);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const pad = String(total).length;
const written = [];
for (const n of wanted) {
  const k = n - 1;
  await page.evaluate((i) => window.show(i), k);
  // Per-slide readiness, the way export-pdf settles after every show(n):
  // awaiting an already-settled promise costs nothing, a late diagram costs
  // an empty screenshot.
  await page.evaluate(async () => {
    if (window.__deckReady && typeof window.__deckReady.then === "function") {
      try { await window.__deckReady; } catch { /* reported by the deck */ }
    }
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch {} }
  });
  await page.waitForTimeout(SETTLE_MS);
  const active = await page.evaluate(
    () => [...document.querySelectorAll(".slide")].findIndex((s) => s.classList.contains("active")),
  );
  if (active !== k) {
    console.error(`shot: slide ${n} did not activate (got ${active + 1}).`);
    await browser.close();
    process.exit(2);
  }
  const dest = path.join(OUT_DIR, `s${String(n).padStart(pad, "0")}.png`);
  await page.screenshot({ path: dest });
  written.push(dest);
}
await browser.close();

for (const f of written) console.log(f);

/* The verdict beside each capture is the QA matrix's own. This script runs
 * qa-matrix.mjs on the same deck and prints the lines it printed for the
 * captured slides: viewport failure lines name the slide (`sN:`), and the
 * legibility section names it too (`sN` plus two spaces, so s1 never matches
 * s15). A captured slide QA said nothing about is clean as far as QA knows.
 */
// `--no-qa` exists for the per-slide review loop. qa-matrix walks the whole
// deck at four viewports, so a loop that shoots one slide and looks at it pays
// for a full-deck measurement on every single shot. Skipping is not a weaker
// check: the loop's subject is the picture, and the QA verdict for the deck is
// `check`'s job, not the shooter's.
const SKIP_QA = opts.on("no-qa");
const qa = SKIP_QA
  ? { status: 0, stdout: "" }
  : spawnSync(process.execPath, [path.join(SCRIPTS_DIR, "qa-matrix.mjs"), `--deck=${DECK}`], {
      encoding: "utf8",
    });
const qaOut = (qa.stdout || "").split("\n");
if (SKIP_QA) {
  console.log("");
  console.log("qa skipped (--no-qa); run `bun cli.mjs check --deck <deck>` for the matrix verdict.");
} else {
console.log("");
console.log(`qa verdict for the captured slide(s), from scripts/qa-matrix.mjs (exit ${qa.status}):`);
for (const n of wanted) {
  const failRe = new RegExp(` s${n}:`);
  const legibRe = new RegExp(`^\\s+s${n}  `);
  const lines = qaOut.filter((l) => failRe.test(l) || legibRe.test(l));
  if (!lines.length) {
    console.log(`  s${n}: clean in the QA matrix (no viewport failure, no diagram finding)`);
  } else {
    console.log(`  s${n}:`);
    for (const l of lines) console.log(`    ${l.trim()}`);
  }
}
const matrixLine = qaOut.find((l) => /^MATRIX:|^done/.test(l.trim()));
if (matrixLine) console.log(`  ${matrixLine.trim()}`);
}
if (opts.on("context")) {
  // One page with the new slide flanked by its neighbours, so the reviewer
  // sees the sequence the per-slide loop otherwise hides. Plain <img>, no
  // build step: the reviewer opens it in a browser next to the verdicts.
  const name = (x) => `s${String(x).padStart(pad, "0")}.png`;
  const figs = wanted
    .map(
      (x) =>
        `    <figure style="flex:1;min-width:0;margin:0"><img src="./${name(x)}" style="width:100%" alt="slide ${x}"><figcaption style="font:600 20px system-ui;color:#fff;padding:8px 0">s${x}${x === focus ? " — this slide" : ""}</figcaption></figure>`,
    )
    .join("\n");
  const ctxPath = path.join(OUT_DIR, `s${String(focus).padStart(pad, "0")}-context.html`);
  fs.writeFileSync(
    ctxPath,
    `<!doctype html><html><head><meta charset="utf-8"><title>s${focus} in context</title></head><body style="margin:0;background:#111;padding:24px"><div style="display:flex;gap:24px;align-items:start">\n${figs}\n</div></body></html>`,
  );
  console.log("");
  console.log(`context: ${ctxPath}`);
  // The rhythm line is the visuals gate's own, not a second implementation:
  // deck-level advisories live after it, per-slide upgrades before it.
  const vis = spawnSync(process.execPath, [path.join(SCRIPTS_DIR, "check-visuals.mjs"), `--deck=${DECK}`], {
    encoding: "utf8",
  });
  const visLines = (vis.stdout || "").split("\n");
  const ri = visLines.findIndex((l) => l.startsWith("  rhythm:"));
  if (ri === -1) {
    console.log("  rhythm unavailable: check-visuals printed no rhythm line");
  } else {
    console.log(`  ${visLines[ri].trim()}`);
    for (let i = ri + 1; i < visLines.length; i++) {
      if (/^      > /.test(visLines[i])) console.log(`  ${visLines[i].trim()}`);
      else if (visLines[i].trim() !== "") break;
    }
  }
}
if (pageErrors.length) {
  console.log(`  ${pageErrors.length} page error(s) while capturing; the pictures may be missing content:`);
  for (const e of pageErrors) console.log(`    PAGEERROR: ${e}`);
}
