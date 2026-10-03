#!/usr/bin/env bun
/**
 * Export a self-contained HTML slide deck to a versioned PDF.
 *
 * Method: render each slide fullscreen at the exact 1920x1080 design size
 * (screen media + backgrounds), capture one PDF page per slide via
 * page.pdf(), then merge with pdf-lib. This avoids the pagination and
 * margin pitfalls of single-pass printing.
 *
 * The deck MUST expose `window.show(n)` (zero-based slide activator) and
 * mark the visible slide with class `active`. Both are provided by
 * templates/template.html. Floating nav chrome (`.edge`, `.nav`) is hidden
 * so it never burns into the PDF.
 *
 * Rendering readiness. A deck may draw itself asynchronously (a diagram
 * library, a chart, an image decode), so a capture fired too early photographs
 * an empty container. This is the one contract, and there is no second guess
 * layered on top of it: before the first capture, and again after every
 * `show(n)`, the export awaits
 *   1. `window.__deckReady`, the promise the deck template builds from whatever
 *      it passed to `defer()`. The deck registers; the template owns the
 *      promise. Nothing assigns `window.__deckReady` itself.
 *   2. `document.fonts.ready`.
 * Then a short fixed settle, which exists for CSS transitions, not for loading.
 * The load signal is `waitUntil: "load"`, never `networkidle`: see the note in
 * `qa-matrix.mjs`, which makes the same choice for the same reason. A rejected
 * `__deckReady` is reported but does not abort the run, so the PDF still lands
 * and the failure is visible in the log.
 *
 * A diagram that failed to parse is caught too. Mermaid renders its error card
 * as a successful SVG, so readiness alone would happily export one. The
 * `[data-mermaid-error]` attribute and the `error` aria-roledescription are the
 * two signals; either one is reported like a page error, which is a non-zero
 * exit, because a PDF with a Mermaid error card on it is a defect that looks
 * like a clean export.
 *
 * Usage:
 *   bun scripts/export-pdf.mjs [--deck <file>] [--out-dir <dir>] [--wait <ms>]
 *   bun scripts/export-pdf.mjs --deck=<file> --out-dir=<dir>
 *
 * With no --deck, exactly one .html file must sit in process.cwd(); several
 * candidates is a usage error rather than a silent pick. With no --out-dir the
 * PDF lands in process.cwd()/presentations.
 *
 * Output:
 *   <out-dir>/<deck-stem>-vNNN.pdf        (new version each run)
 *   <out-dir>/<deck-stem>-latest.pdf      (always the newest build)
 *
 * Exit 0 ok, 1 the deck threw a page error or drew a diagram error card,
 * 2 usage error.
 *
 * Requires: bun add playwright pdf-lib && bunx playwright install chromium
 * (playwright + pdf-lib must be resolvable from this script's directory)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launchChromium } from "./lib/chromium.mjs";
import { PDFDocument } from "pdf-lib";

/**
 * Flags that take a value. Listed rather than inferred, because a value-taking
 * flag has to claim its own token: with two of them, a parser that just lets
 * the first one eat the first bare token turns `--wait 0 --deck x` into
 * a deck called "0". Claiming in argv order is the only unambiguous reading.
 */
const VALUE_FLAGS = new Set(["deck", "out-dir", "wait"]);

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
    /** The value of a value-taking flag, from `--flag=v` or the token after it. */
    take(name) {
      const v = flags.get(name);
      return typeof v === "string" ? v : "";
    },
    on(name) {
      // Any value that is not an explicit falsy turns the flag on, so
      // --en, --en=1 and --en=yes all work while --en=false does not.
      const v = flags.get(name);
      return v !== undefined && v !== false;
    },
  };
}

const HELP = [
  "usage: bun scripts/export-pdf.mjs [--deck <file>] [--out-dir <dir>] [--wait <ms>]",
  "",
  "  --deck <file>     deck to export; also --deck=<file>. Defaults to the one",
  "                    .html file in process.cwd(); several is a usage error.",
  "  --out-dir <dir>   where to write; also --out-dir=<dir>. Defaults to",
  "                    process.cwd()/presentations.",
  "  --wait <ms>       settle time after each show(n); also --wait=<ms>. Default 500.",
  "  --help, -h        print this and exit 0",
  "",
  "Writes <deck-stem>-vNNN.pdf and <deck-stem>-latest.pdf. Waits on",
  "window.__deckReady and document.fonts.ready before capturing, and reports",
  "any Mermaid error card as a failure.",
  "",
  "Exit 0 ok, 1 the deck threw a page error or drew a diagram error card,",
  "2 usage error.",
].join("\n");

const opts = parseArgv(process.argv.slice(2));
if (opts.on("help")) {
  console.log(HELP);
  process.exit(0);
}

const SCRIPTS_DIR = path.resolve(fileURLToPath(new URL(".", import.meta.url)));
const ROOT = path.dirname(SCRIPTS_DIR);
const CWD = process.cwd();

const pickDeck = () => {
  const direct = opts.take("deck");
  if (direct) return path.resolve(direct);
  let entries;
  try {
    entries = fs.readdirSync(CWD, { withFileTypes: true });
  } catch (err) {
    console.error(`export-pdf: cannot read ${CWD}: ${err.message}`);
    process.exit(2);
  }
  const found = entries
    .filter((e) => e.isFile() && e.name.endsWith(".html") && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
  if (!found.length) {
    console.error(`export-pdf: no .html deck in ${CWD}.`);
    console.error(`  pass --deck <file>, e.g. --deck ${path.join(ROOT, "templates", "template.html")}`);
    process.exit(2);
  }
  if (found.length > 1) {
    // Picking one of several silently exports the wrong deck. Refuse.
    console.error(`export-pdf: ${found.length} .html files in ${CWD}, cannot choose:`);
    for (const f of found) console.error(`  ${f}`);
    console.error("  pass --deck <file> to pick one");
    process.exit(2);
  }
  return path.join(CWD, found[0]);
};

const DECK = pickDeck();
const STEM = path.basename(DECK, ".html");
const OUT_DIR = path.resolve(opts.take("out-dir") || path.join(CWD, "presentations"));
const WAIT_RAW = opts.take("wait") || "500";
const WAIT = Number(WAIT_RAW);
const W = 1920;
const H = 1080;

if (!Number.isFinite(WAIT) || WAIT < 0) {
  console.error(`export-pdf: --wait must be a non-negative number, got "${WAIT_RAW}"`);
  process.exit(2);
}
try {
  if (!fs.existsSync(DECK)) {
    console.error(`export-pdf: no such deck: ${DECK}`);
    process.exit(2);
  }
  if (!fs.statSync(DECK).isFile()) {
    console.error(`export-pdf: not a file: ${DECK}`);
    process.exit(2);
  }
  fs.accessSync(DECK, fs.constants.R_OK);
} catch (err) {
  if (err && err.code === "EACCES") {
    console.error(`export-pdf: deck is not readable: ${DECK}`);
    process.exit(2);
  }
  throw err;
}

/** A stem like `deck[v2` is a filename, not a pattern. */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function nextVersion() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const re = new RegExp(`^${escapeRe(STEM)}-v(\\d{3})\\.pdf$`);
  const versions = fs
    .readdirSync(OUT_DIR)
    .map((f) => f.match(re))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  return String((versions.length ? Math.max(...versions) : 0) + 1).padStart(3, "0");
}

// Resolve the output name BEFORE rendering.
const version = nextVersion();
const versioned = path.join(OUT_DIR, `${STEM}-v${version}.pdf`);
const latest = path.join(OUT_DIR, `${STEM}-latest.pdf`);
if (fs.existsSync(versioned)) {
  console.error(`export-pdf: refusing to overwrite ${versioned}`);
  process.exit(2);
}

const browser = await launchChromium("export-pdf");
const page = await browser.newPage({ viewport: { width: W, height: H } });

const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e && e.message ? e.message : e).slice(0, 200)));

await page.goto(pathToFileURL(DECK).href, { waitUntil: "load" });
await page.emulateMedia({ media: "screen" });
// Injected CSS, so nav chrome never burns in. `.themebar,.themehit` is the
// presenter's theme switcher: injected rather than keyed off a body attribute
// because `body[data-themebar]` is how a presenter asks for the switcher, and a
// PDF must never inherit that request.
await page.addStyleTag({
  content: ".edge,.nav,.themebar,.themehit,.editmodal{display:none !important;}",
});

/**
 * Let the deck finish whatever it draws asynchronously. Re-run after every
 * show(n) so per-slide rendering is covered too; awaiting an already-settled
 * promise costs nothing.
 */
async function settle(where) {
  const waited = await page.evaluate(async () => {
    const got = [];
    const ready = window.__deckReady;
    if (ready && typeof ready.then === "function") {
      try {
        await ready;
        got.push("__deckReady");
      } catch (e) {
        got.push(`__deckReady REJECTED (${String(e && e.message ? e.message : e).slice(0, 120)})`);
      }
    }
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
      got.push("fonts");
    }
    return got;
  });
  if (where === "load") console.log(`  ready: ${waited.join(", ") || "no async work declared"}`);
  return waited;
}

await settle("load");

/**
 * Mermaid draws its parse errors instead of throwing them, so a deck can satisfy
 * the readiness contract and still put an error card on a slide. Two signals,
 * both set by the failure paths MERMAID.md section 2 documents: the
 * `data-mermaid-error` attribute written by the render loop's catch, and the
 * `error` aria-roledescription Mermaid stamps on its error SVG.
 *
 * Reported rather than thrown, because a thrown error here would lose the PDF
 * that was already written; the exit code is still non-zero, which is what
 * "done" is judged on.
 */
const diagramErrors = await page.evaluate(() =>
  [...document.querySelectorAll("[data-mermaid-error], svg[aria-roledescription='error']")].map((n) => {
    const slide = n.closest(".slide");
    const at = slide
      ? [...document.querySelectorAll(".slide")].indexOf(slide) + 1
      : 0;
    return `slide ${at || "?"}: ${(n.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100)}`;
  }),
);
for (const line of diagramErrors) pageErrors.push(`MERMAID ERROR CARD ${line}`);
if (diagramErrors.length) {
  console.log(`  ${diagramErrors.length} diagram(s) rendered a Mermaid error card, not a diagram.`);
}

// document.fonts.status reports "loaded" for a stylesheet that never arrived,
// so count the faces actually registered rather than trusting the status.
const fonts = await page.evaluate(() => {
  const remote = [...document.querySelectorAll("link[rel~='stylesheet'][href]")]
    .map((l) => l.href)
    .filter((h) => /fonts\.|typekit|googleapis/i.test(h));
  return { faces: document.fonts ? document.fonts.size : 0, remote };
});
if (fonts.remote.length && fonts.faces === 0) {
  console.log(
    `  WARNING: ${fonts.remote.length} remote font stylesheet(s) registered 0 faces, so text is laid out in a fallback face.`,
  );
  for (const href of fonts.remote) console.log(`    ${href}`);
}

await page.waitForTimeout(600);
// Freeze morph transitions so every capture is the settled slide.
await page.evaluate(() => { window.__noMorph = true; });

const total = await page.evaluate(() => document.querySelectorAll(".slide").length);
if (!total) {
  console.error(`export-pdf: no .slide elements found in ${DECK}`);
  await browser.close();
  process.exit(2);
}
if ((await page.evaluate(() => typeof window.show)) !== "function") {
  console.error(`export-pdf: ${DECK} does not expose window.show(n); cannot drive the deck.`);
  await browser.close();
  process.exit(2);
}
console.log(`deck: ${path.basename(DECK)} · ${total} slides · ${W}x${H}`);

const merged = await PDFDocument.create();
for (let k = 0; k < total; k++) {
  await page.evaluate((n) => window.show(n), k);
  await settle("slide");
  await page.waitForTimeout(WAIT);
  const active = await page.evaluate(
    () => [...document.querySelectorAll(".slide")].findIndex((s) => s.classList.contains("active")),
  );
  if (active !== k) throw new Error(`Slide ${k} did not activate (got ${active}).`);
  const buf = await page.pdf({
    width: `${W}px`,
    height: `${H}px`,
    printBackground: true,
    preferCSSPageSize: false,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
    pageRanges: "1",
  });
  const single = await PDFDocument.load(buf);
  const [copied] = await merged.copyPages(single, [0]);
  merged.addPage(copied);
  console.log(`  page ${k + 1}/${total} captured`);
}

const stamp = new Date();
merged.setTitle(`${STEM} - slide deck`);
merged.setCreator("presentation-skill/scripts/export-pdf.mjs (Playwright + pdf-lib)");
merged.setProducer("Chromium headless print");
merged.setCreationDate(stamp);
merged.setModificationDate(stamp);

const bytes = await merged.save();
fs.writeFileSync(versioned, bytes);
fs.writeFileSync(latest, bytes);
await browser.close();

const check = await PDFDocument.load(bytes);
if (check.getPageCount() !== total) {
  throw new Error(`Page mismatch: PDF has ${check.getPageCount()}, deck has ${total}.`);
}
console.log(`wrote ${versioned} (${(bytes.length / 1024).toFixed(0)} KB, ${check.getPageCount()} pages)`);
console.log(`latest -> ${latest}`);

if (pageErrors.length) {
  console.error(`\n${pageErrors.length} page error(s) in the deck; the PDF may be missing content:`);
  for (const e of pageErrors) console.error(`  PAGEERROR: ${e}`);
  process.exit(1);
}