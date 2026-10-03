#!/usr/bin/env bun
/**
 * Viewport, clipping and legibility QA for a slide deck.
 *
 * For every slide at every viewport, asserts:
 *   1. the stage scaled (the computed transform matrix on `.slide.active` is a
 *      non-identity scale, so a deck that scales via a class or scale3d() is
 *      still recognised), and
 *   2. nothing overflows the document (`scrollHeight` vs `clientHeight` on the
 *      scrolling element and on `body`), and
 *   3. nothing is clipped by the stage. Every `.slide` is a fixed
 *      `overflow:hidden` box, so content can never reach the document scroll
 *      height and check 2 cannot see it. The load-bearing check is therefore a
 *      real geometry comparison: any descendant whose bounding rect extends
 *      past the stage rect is being cropped, whatever the document reports.
 *
 * For every rendered diagram it also:
 *   4. measures projected type size, and fails below MIN_PROJECTED_PX. A diagram
 *      letterboxes into the body band by a factor read from its own viewBox, and
 *      nothing else in this folder can see that factor, so a diagram can pass
 *      every other check here and still project 16 px text at 6 px. The measured
 *      number is printed for every diagram whether it passes or fails, so a human
 *      reads the number rather than trusting a boolean.
 *   5. reports the word count of every slide body. Density is a judgement, not a
 *      gate: it is reported, never failed. See DESIGN.md -> "Density budget".
 *
 * Any failure prints `VIEWPORT sN: ...` lines naming the slide and the
 * offending elements; silence (plus `done`) means the whole matrix is green.
 *
 * Usage:
 *   bun scripts/qa-matrix.mjs [--deck <file>]
 *   bun scripts/qa-matrix.mjs --deck=<file>
 *   (also honors DECK env var; defaults to templates/template.html)
 *
 * Exit 0 green, 1 failures found, 2 usage error.
 *
 * Requires: playwright (+ installed Chromium) resolvable from this script's
 * directory. Viewports mirror common projection / laptop sizes.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launchChromium } from "./lib/chromium.mjs";

/**
 * Flags that take a value. Listed rather than inferred, because a value-taking
 * flag has to claim its own token: with two of them, a parser that just lets
 * the first one eat the first bare token turns `--wait 0 --deck x` into
 * a deck called "0". Claiming in argv order is the only unambiguous reading.
 */
const VALUE_FLAGS = new Set(["deck", "explain"]);

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
        // a value a caller may legitimately pass and must not be read as an
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

/**
 * The floor for projected type size inside a diagram, in CSS px at the 1920x1080
 * design size. Why 14 and not something rounder:
 *
 *  - Mermaid picks 16 user units for flowchart labels and 14 to 16 elsewhere, so
 *    14 is the point at which a diagram is allowed to be letterboxed to 0.875 of
 *    Mermaid's own default and no further. A 16px floor would be equivalent to
 *    "never scale a diagram below 1:1", which forbids the letterboxing the sizing
 *    recipe in MERMAID.md section 4 depends on.
 *  - The deck's own scale stops at 16px (.foot chrome) and its smallest body copy
 *    is 21px (.desc). 14px is below anything the deck authors deliberately, which
 *    is the correct place for a hard floor on borrowed artwork: it is saying the
 *    diagram has stopped being readable, not that you missed a style rule.
 *  - It is a floor, not a target. Nothing in this skill designs toward 14px; a
 *    12px label on a 1920px stage is one the back row cannot read.
 */
const MIN_PROJECTED_PX = 14;

/**
 * How far label ink may sit outside its <foreignObject> before it counts as
 * clipped, in viewBox user units. A label that fits is centred in its box, so it
 * reports exactly 0 and the tolerance is only there for sub-pixel rounding on a
 * fractional viewBox.
 */
const CLIP_TOLERANCE_PX = 0.5;

/**
 * How much of its band a diagram must actually occupy, as a fraction of the
 * band's area after the letterbox.
 *
 * Why this needs its own number: the projected-type floor above only says a
 * diagram is *readable*. A five-node `flowchart LR` is a 1465x70 ribbon that
 * letterboxes to 0.978 of a 1432x540 band, so every label measures a
 * comfortable 15.6px and the slide still reads as a strip of pills floating in
 * an empty box. That is a composition defect, not a legibility one, and before
 * this number existed nothing in the folder could see it: the diagram passes,
 * the PDF exports clean, and only the screenshot review catches it, by eye,
 * every time.
 *
 * The fix is never to shrink the drawing. It is to match the drawing's shape to
 * the band: a chain that reads 20:1 belongs in a wide band, and a tall band
 * wants a tall graph (MERMAID.md section 3 picks the direction). 0.25 is the
 * floor, not a target. Measured for comparison: a Gantt in a matching band
 * 1.0, a four-participant sequence diagram 0.96, C4Context 0.63, a pie 0.60,
 * and the ribbon above 0.13.
 */
const MIN_BAND_FILL = 0.25;

/** How far two things meant to share a centreline may drift, in slide px. */
const ALIGN_TOLERANCE_PX = 2;

const HELP = [
  "usage: bun scripts/qa-matrix.mjs [--deck <file>] [--explain <n>]",
  "",
  "  --deck <file>   deck to test; also --deck=<file>. Defaults to $DECK,",
  "                  then templates/template.html next to this script.",
  "  --explain <n>   print slide n's full geometry (stage rect, centrelines,",
  "                  diagram numbers, clipped elements) whether or not it",
  "                  failed, at the first viewport only. Inspection, not a",
  "                  verdict: the exit code still reflects the whole deck.",
  "  --help, -h      print this and exit 0",
  "",
  "Checks every slide at every viewport for: an unscaled stage, document or",
  "body overflow (scrollHeight > clientHeight), and elements clipped by the",
  "stage's overflow:hidden box.",
  "",
  "Also measures every rendered diagram: its viewBox against its rendered box",
  "gives the letterbox factor, and the smallest text in that drawing times the",
  `factor gives the projected type size. Below ${MIN_PROJECTED_PX}px is a FAIL, and so is`,
  "a label whose ink falls outside its <foreignObject> while the box is still",
  "clipping it.",
  "",
  `Two composition checks: a diagram filling less than ${MIN_BAND_FILL} of its band is a`,
  "FAIL, because a readable diagram floating in an empty box is still a bad",
  "slide. And any pair meant to share a centreline is asserted: a .timeline dot",
  "against its rail, a .qhead icon tile against the heading beside it, and the",
  ".s-head / .s-foot bands against the .s-body band.",
  "",
  "Slide body word counts are reported, not failed.",
  "",
  "Exit 0 green, 1 failures found, 2 usage error.",
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

try {
  if (!fs.existsSync(DECK)) {
    console.error(`qa-matrix: no such deck: ${DECK}`);
    console.error("  pass --deck <file>, or set DECK, or run against templates/template.html");
    process.exit(2);
  }
  if (!fs.statSync(DECK).isFile()) {
    console.error(`qa-matrix: not a file: ${DECK}`);
    process.exit(2);
  }
  fs.accessSync(DECK, fs.constants.R_OK);
} catch (err) {
  if (err && err.code === "EACCES") {
    console.error(`qa-matrix: deck is not readable: ${DECK}`);
    process.exit(2);
  }
  throw err;
}

const VIEWPORTS = [
  [1920, 950],
  [1600, 900],
  [1440, 900],
  [1280, 720],
];

/** Distinct offenders to name per slide before the list is truncated. */
const MAX_OFFENDERS = 6;

/**
 * Diagram legibility and slide density, measured once, on the first viewport.
 *
 * Both are properties of the deck, not of the window. The band a diagram
 * letterboxes into is the same in slide coordinates at every viewport, and the
 * measurement divides the stage scale back out before comparing anything, so the
 * projected size does not move when the QA window is resized: measured, the same
 * bad diagram reads 13.5px at 1920x950, 1600x900, 1440x900 and 1280x720 alike.
 * So the first viewport reports and asserts on it, and the remaining three would
 * print the same number four times and count one defect as four.
 */
const report = { diagrams: [], words: [], viewport: null };

const browser = await launchChromium("qa-matrix");
let failed = 0;

// --explain <n>: print one slide's full geometry whether or not it failed.
// The twelve one-off probe scripts this folder accumulated (probe2..probe13,
// each hardcoding one slide) all reached for the same capability: look at a
// *passing* slide's numbers. The FAIL block below prints everything, but only
// on failure — so there was no supported way to inspect a slide that passed,
// and the probes were rebuilt instead. One flag inside the tool that owns the
// measurement, instead of twelve copies of the harness.
const EXPLAIN = (() => {
  const v = opts.take("explain");
  if (!v) return 0;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) {
    console.error(`qa-matrix: --explain takes a 1-based slide number, and got ${JSON.stringify(v)}`);
    process.exit(2);
  }
  return n;
})();
const VIEWPORTS_RUN = EXPLAIN ? [VIEWPORTS[0]] : VIEWPORTS;
for (const [w, h] of VIEWPORTS_RUN) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
  // `load`, not `networkidle`. MERMAID.md section 2 says never to wait on
  // networkidle, and the scripts obey: `load` is the earliest event that
  // guarantees a vendored <script src> on file:// has been parsed and executed,
  // which is the only reason the script needed a load signal at all. Once
  // window.__deckReady exists it is the readiness contract, and networkidle adds
  // nothing but a second guess at a 500ms quiet window.
  await page.goto(pathToFileURL(DECK).href, { waitUntil: "load" });
  // A deck may render deferred content (a diagram library, for instance) behind
  // window.__deckReady. Without this, QA measures an empty container and the
  // screenshot pass photographs a half-drawn slide.
  await page.evaluate(async () => {
    if (window.__deckReady && typeof window.__deckReady.then === "function") {
      try { await window.__deckReady; } catch { /* reported by the deck */ }
    }
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch {} }
  });
  await page.waitForTimeout(700);
  const total = await page.evaluate(() => document.querySelectorAll(".slide").length);
  if (!total) {
    failed++;
    console.log(`${w}x${h}: FAIL (no .slide elements in ${DECK})`);
    await page.close();
    continue;
  }
  if (EXPLAIN && EXPLAIN > total) {
    console.error(`qa-matrix: --explain ${EXPLAIN}, but the deck has ${total} slide(s)`);
    await browser.close();
    process.exit(2);
  }
  for (let n = 0; n < total; n++) {
    const first = w === VIEWPORTS[0][0] && h === VIEWPORTS[0][1];
    const r = await page.evaluate(([minPx, clipTol, alignTol, minFill, measureLegibility]) => {
      const s = document.querySelector(".slide.active");
      if (!s) return { ok: false, why: "no active slide", clipped: [], stage: null };

      /* Measure the settled slide, not the entrance. The tile cascade runs
         `rise`, whose from-state is translateY(18px), and QA advances with
         ArrowRight then reads within 120ms — so every tile is measured 18px
         from where it is about to land. That is the template's own `.measuring`
         escape hatch, the same one show() uses for its FLIP measurement, and it
         exists for exactly this reason. Without it a centreline check reports
         the animation's travel distance as a geometry defect, and a clipping
         check reads boxes that are about to move. It is added and removed
         inside one task, so nothing is ever painted in this state. */
      s.classList.add("measuring");
      try {
      // eslint-disable-next-line no-lone-blocks
      {

      // Read the computed matrix, not the inline string: a deck may scale via
      // a class, a stylesheet rule, or scale3d(). m11 is matrix[0] and
      // matrix3d[0] alike.
      const computed = getComputedStyle(s).transform;
      const m = /^(matrix|matrix3d)\(([^)]*)\)$/.exec(computed);
      const nums = m ? m[2].split(",").map(Number) : [];
      const scaleX = nums.length === 6 || nums.length === 16 ? nums[0] : NaN;
      const scaled = Number.isFinite(scaleX) && Math.abs(scaleX) > 0.01;
      // A scale of exactly 1 is legal (a 1920x1080 window on a 1920x1080 stage),
      // so the divisor falls back to 1 rather than producing a NaN measurement.
      const stageScale = Number.isFinite(scaleX) && scaleX > 0.01 ? scaleX : 1;

      // Document-level overflow. Kept as a smoke test for a stage that has
      // outgrown the viewport; it cannot see stage clipping on its own.
      const docEl = document.scrollingElement || document.documentElement;
      const docScroll =
        docEl.scrollHeight > docEl.clientHeight + 1 ||
        document.body.scrollHeight > document.body.clientHeight + 1;

      // Short, human-findable name for an element.
      const label = (el) => {
        let out = el.tagName.toLowerCase();
        if (el.id) out += "#" + el.id;
        const cls = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean);
        if (cls.length) out += "." + cls.slice(0, 2).join(".");
        const parent = el.parentElement;
        if (parent) {
          const twins = [...parent.children].filter(
            (c) => c.tagName === el.tagName && (c.getAttribute("class") || "") === (el.getAttribute("class") || ""),
          );
          if (twins.length > 1) out += `:nth-of-type(${twins.indexOf(el) + 1})`;
        }
        return out;
      };

      // The load-bearing check: compare every descendant's painted box against
      // the stage box. Anything outside is cropped by overflow:hidden.
      const stage = s.getBoundingClientRect();
      const TOL = 1;
      const seen = new Map();
      let clippedCount = 0;
      for (const el of s.querySelectorAll("*")) {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 && rect.height <= 0) continue;
        const over = [];
        if (rect.top < stage.top - TOL) over.push("above");
        if (rect.bottom > stage.bottom + TOL) over.push("below");
        if (rect.left < stage.left - TOL) over.push("left");
        if (rect.right > stage.right + TOL) over.push("right");
        if (!over.length) continue;
        clippedCount++;
        const name = label(el);
        const prev = seen.get(name);
        if (prev) prev.count++;
        else {
          seen.set(name, {
            name,
            count: 1,
            over: over.join("/"),
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            text: el.children.length
              ? ""
              : (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 48),
          });
        }
      }

      /* ---- diagram legibility -------------------------------------------
       * A diagram is the only thing in a deck that is scaled by a factor nobody
       * chose: the SVG fills the band, and preserveAspectRatio letterboxes its
       * viewBox into whatever shape is left over. So the projected size of its
       * smallest label is (font size in viewBox user units) x (the letterbox
       * factor), and both halves are readable from the DOM.
       *
       * Both are read in SLIDE coordinates (the stage scale divided back out) so
       * the number describes the deck at 1920x1080, which is the size the PDF is
       * captured at, and does not drift as the QA window is resized.
       */
      const diagrams = [];
      // Anchor on all three states of a rendered diagram. The source node
      // carries class="mermaid"; the render step removes it and adds "mmd"
      // (so .mermaid stops matching the moment the diagram is on screen);
      // .mmdwrap is the wrapper the deck adds and never changes. MERMAID.md
      // section 4 states the same rule for CSS. Querying .mermaid alone
      // measures an empty container on every rendered deck and reports
      // "no rendered diagram", a silent false-green on this exact check.
      // The rendered node sits inside its wrapper, so one diagram matches
      // twice; each SVG is measured once.
      const seenSvg = new Set();
      for (const host of measureLegibility ? s.querySelectorAll(".mermaid, .mmd, .mmdwrap") : []) {
        const svg =
          host.tagName && host.tagName.toLowerCase() === "svg" ? host : host.querySelector("svg");
        if (!svg) continue;
        if (seenSvg.has(svg)) continue;
        seenSvg.add(svg);
        const rect = svg.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const boxW = rect.width / stageScale;
        const boxH = rect.height / stageScale;

        // The viewBox is the only honest statement of the drawing's natural size.
        // Without it there is nothing to scale by, and a diagram nobody can
        // measure is a diagram nobody has looked at.
        const vb = (svg.getAttribute("viewBox") || "")
          .trim()
          .split(/[\s,]+/)
          .map(Number);
        const hasBox = vb.length === 4 && vb[2] > 0 && vb[3] > 0;
        const scale = hasBox ? Math.min(boxW / vb[2], boxH / vb[3]) : null;

        // Smallest computed font size in viewBox user units. getComputedStyle
        // inside an SVG with a viewBox reports user units, not screen px, which
        // is exactly the unit the letterbox factor multiplies.
        let smallest = Infinity;
        let sample = "";
        for (const el of svg.querySelectorAll("span,p,tspan,text,div")) {
          if (el.closest("defs") || el.closest("marker")) continue;
          if (!el.textContent || !el.textContent.trim()) continue;
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") continue;
          const fs = parseFloat(cs.fontSize);
          if (!Number.isFinite(fs) || fs <= 0) continue;
          if (fs < smallest) {
            smallest = fs;
            sample = el.textContent.replace(/\s+/g, " ").trim().slice(0, 48);
          }
        }
        const projected = scale !== null && Number.isFinite(smallest) ? smallest * scale : null;

        /* ---- band fill ------------------------------------------------------
         * The share of the band the drawing actually covers. The SVG element fills
         * the band, so the unused share is the letterbox slack on each axis:
         *   fill = (viewBox width x scale / band width) x (height likewise)
         * This is the number that catches a readable diagram in an empty box.
         */
        const fill =
          scale !== null ? Math.min(1, (vb[2] * scale) / boxW) * Math.min(1, (vb[3] * scale) / boxH) : null;

        let why = "";
        if (!hasBox) why = "no viewBox, so the letterbox factor cannot be computed";
        else if (projected === null) why = "note: no text in this drawing, nothing to measure";
        else if (projected < minPx) {
          why = `projected ${projected.toFixed(1)}px is below the ${minPx}px floor`;
        } else if (fill !== null && fill < minFill) {
          // Legibility passed, so say plainly that this is about shape: the
          // readable-but-stranded diagram is the failure the type floor misses.
          why =
            `fills only ${Math.round(fill * 100)}% of its band, so it reads as a strip floating in an ` +
            `empty box; give it a band that matches the drawing's shape, or a drawing that matches ` +
            `the band (change the graph direction, or set the band height to the drawing)`;
        }

        /* ---- foreignObject clipping ---------------------------------------
         * Mermaid lays a label out once to decide how wide its <foreignObject>
         * needs to be, and Chromium paints the text from its own font
         * measurement. The two disagree by a few percent, the default
         * `overflow` on a foreignObject is `hidden`, and the tail of the longest
         * line is sliced off mid-word. Nothing else in a deck can see it: the ink
          * is still inside the node rect and inside the stage, so the clipping check
          * passes and the PDF exports cleanly.
          *
          * The measurement is a Range per text node, which gives the painted box
          * of the text rather than the box of the block around it. A centred label
          * that fits reports exactly 0, so anything above half a user unit is real.
          * The fix is the one line in MERMAID.md section 4:
          *   .mmdwrap foreignObject{overflow:visible !important}
          * anchored on the wrapper, because the render step removes .mermaid.
         */
        let worstInk = 0;
        let worstText = "";
        let clipped = 0;
        if (scale !== null) {
          const range = document.createRange();
          for (const fo of svg.querySelectorAll("foreignObject")) {
            const foW = Number(fo.getAttribute("width"));
            if (!Number.isFinite(foW)) continue;
            const fbox = fo.getBoundingClientRect();
            let maxRight = -Infinity;
            let minLeft = Infinity;
            const walker = document.createTreeWalker(fo, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
              if (!node.nodeValue || !node.nodeValue.trim()) continue;
              range.selectNodeContents(node);
              const r = range.getBoundingClientRect();
              if (r.width === 0) continue;
              if (r.right > maxRight) {
                maxRight = r.right;
                worstText = node.nodeValue.replace(/\s+/g, " ").trim().slice(0, 48);
              }
              if (r.left < minLeft) minLeft = r.left;
            }
            if (maxRight === -Infinity) continue;
            const left = (minLeft - fbox.left) / stageScale / scale;
            const right = (maxRight - fbox.left) / stageScale / scale;
            const outside = Math.max(0, -left) + Math.max(0, right - foW);
            if (outside > worstInk) worstInk = outside;
            // Ink outside the box only costs the audience something while the box
            // is still clipping it. Chromium's default overflow on a foreignObject
            // is hidden, which is why the patch rule is needed at all; a deck that
            // has applied it paints the overflow into the node's own padding,
            // where it is harmless. So the fail is on "is it being clipped", and
            // the geometry is reported either way.
            if (getComputedStyle(fo).overflow === "visible") continue;
            if (outside > clipped) clipped = outside;
          }
        }
        const ink = Math.round(worstInk * 100) / 100;
        const cut = Math.round(clipped * 100) / 100;
        if (cut > clipTol && !why) {
          why = `a label paints ${cut}px outside its foreignObject and is clipped by it; add .mmdwrap foreignObject{overflow:visible !important}`;
        }

        diagrams.push({
          boxW: Math.round(boxW),
          boxH: Math.round(boxH),
          natural: hasBox ? `${Math.round(vb[2])}x${Math.round(vb[3])}` : null,
          scale: scale === null ? null : Math.round(scale * 1000) / 1000,
          fill: fill === null ? null : Math.round(fill * 100) / 100,
          smallest: Number.isFinite(smallest) ? smallest : null,
          projected: projected === null ? null : Math.round(projected * 10) / 10,
          ink,
          cut,
          inkText: cut > clipTol ? worstText : "",
          sample,
          why,
        });
      }

      /* ---- centrelines that are supposed to agree ---------------------------
       * Three pairs where the CSS looks right in isolation and wrong together, so
       * nothing upstream can see it and the screenshot review has to catch it:
       *
       *  1. A .timeline dot against the rail behind it. The rail is a ::before
       *     positioned from the track's top edge and the dot is a 20px box in
       *     normal flow, so the two only share a centreline if the rail's `top`
       *     is (dot height / 2 - rail height / 2). Off by the dot radius, the
       *     rail passes above the dots and every dot looks like it is floating.
       *
       *  2. A .qhead icon tile against the heading beside it. The tile is 78px
       *     and the heading stack is one or two lines, so with
       *     `align-items:flex-start` the tile hangs below short text (and the
       *     text hangs below a tall stack). `center` is what puts them on one
       *     line, and the check is what keeps a template edit from undoing it.
       *
       *  3. The .s-head and .s-foot bands against the .s-body band. The sidebar
       *     rail owns column 1, so head, body and foot all belong in column 2:
       *     a spanning head (grid-column:1/-1) centres over rail+content and sits
       *     ~160px left of the body content it belongs to. `grid-column:2` is
       *     what puts the three bands in the same column, and the check is what
       *     keeps a template edit from undoing it.
       *
       * All are read in slide coordinates so the tolerance does not drift with
       * the viewport, the same as every other measurement here.
       */
      const off = [];
      for (const tl of s.querySelectorAll(".timeline")) {
        const dot = tl.querySelector(".tp .dot");
        if (!dot) continue;
        const cs = getComputedStyle(tl, "::before");
        const railTop = parseFloat(cs.top);
        const railH = parseFloat(cs.height);
        if (!Number.isFinite(railTop) || !Number.isFinite(railH)) continue;
        const railMid = tl.getBoundingClientRect().top / stageScale + railTop + railH / 2;
        const dr = dot.getBoundingClientRect();
        const dotMid = (dr.top + dr.height / 2) / stageScale;
        const drift = Math.abs(dotMid - railMid);
        if (drift > alignTol) {
          off.push({
            over: "centrelines",
            count: 1,
            drift: Math.round(drift * 10) / 10,
            name: ".timeline dot against its rail",
            text: "set the rail's top to the dot's centre, not the dot's top edge",
          });
        }
      }
      for (const qh of s.querySelectorAll(".qhead")) {
        const tile = qh.querySelector(".qicon");
        const stack = Array.from(qh.children).find((el) => el !== tile);
        if (!tile || !stack) continue;
        const a = tile.getBoundingClientRect();
        const b = stack.getBoundingClientRect();
        if (!a.height || !b.height) continue;
        const drift = Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) / stageScale;
        if (drift > alignTol) {
          off.push({
            over: "centrelines",
            count: 1,
            drift: Math.round(drift * 10) / 10,
            name: ".qhead icon tile against its heading",
            text: "align-items:center puts the tile and the heading on one centreline",
          });
        }
      }
      /* The header and footer bands share the body's column, not the stage. The
         rail owns column 1, so a spanning head centres over rail+content while
         the body sits in column 2 alone. Compare horizontal centre-x in slide
         coordinates, exactly like the pairs above; skip slides lacking either
         element, and skip zero-width bands (an empty foot has no centre). */
      const head = s.querySelector(".s-head");
      const bodyEl = s.querySelector(".s-body");
      const foot = s.querySelector(".s-foot");
      if (head && bodyEl) {
        const a = head.getBoundingClientRect();
        const b = bodyEl.getBoundingClientRect();
        if (a.width > 0 && b.width > 0) {
          const drift = Math.abs(a.left + a.width / 2 - (b.left + b.width / 2)) / stageScale;
          if (drift > alignTol) {
            off.push({
              over: "centrelines",
              count: 1,
              drift: Math.round(drift * 10) / 10,
              name: ".s-head centre-x against .s-body centre-x",
              text: "grid-column:2 puts head, body and foot in the same column",
            });
          }
        }
      }
      if (foot && bodyEl) {
        const a = foot.getBoundingClientRect();
        const b = bodyEl.getBoundingClientRect();
        if (a.width > 0 && b.width > 0) {
          const drift = Math.abs(a.left + a.width / 2 - (b.left + b.width / 2)) / stageScale;
          if (drift > alignTol) {
            off.push({
              over: "centrelines",
              count: 1,
              drift: Math.round(drift * 10) / 10,
              name: ".s-foot centre-x against .s-body centre-x",
              text: "grid-column:2 puts head, body and foot in the same column",
            });
          }
        }
      }

      /* ---- density, reported and never failed -----------------------------
       * Counted on the body band only, and never on anything inside an <svg>:
       * a diagram's own labels are not slide copy, and counting them would turn
       * a measurement into noise. See DESIGN.md -> "Density budget" for why this
       * is a number to read rather than a threshold to satisfy.
       */
      const body = s.querySelector(".s-body");
      let words = 0;
      if (body) {
        const clone = body.cloneNode(true);
        for (const junk of clone.querySelectorAll("svg,.sr-only,script,style")) junk.remove();
        const text = (clone.textContent || "").replace(/\s+/g, " ").trim();
        words = text ? text.split(" ").length : 0;
      }

      return {
        ok:
          scaled &&
          !docScroll &&
          clippedCount === 0 &&
          off.length === 0 &&
          !diagrams.some((d) => d.why && !d.why.startsWith("note:")),
        why: !scaled
          ? "unscaled"
          : docScroll
            ? "docScroll"
            : clippedCount
              ? `clipped:${clippedCount}`
              : off.length
                ? `centrelines:${off.length}`
                : diagrams.find((d) => d.why && !d.why.startsWith("note:"))?.why,
        clipped: [...seen.values()],
        centre: off,
        diagrams,
        words,
        stage: {
          top: Math.round(stage.top),
          bottom: Math.round(stage.bottom),
          left: Math.round(stage.left),
          right: Math.round(stage.right),
        },
      };
      }
      } finally {
        s.classList.remove("measuring");
      }
    }, [MIN_PROJECTED_PX, CLIP_TOLERANCE_PX, ALIGN_TOLERANCE_PX, MIN_BAND_FILL, first]);
    if (first) {
      for (const d of r.diagrams) report.diagrams.push({ slide: n + 1, ...d });
      report.words.push({ slide: n + 1, words: r.words });
      report.viewport = `${w}x${h}`;
    }
    // --explain prints the same block for a passing slide. The gate (`failed++`,
    // the FAIL label, the exit code) still only fires on failure — explaining a
    // slide is inspection, not a verdict.
    const show = !r.ok || (EXPLAIN && n + 1 === EXPLAIN);
    if (!r.ok) failed++;
    if (show) {
      console.log(`${w}x${h} s${n + 1}: ${r.ok ? "explain" : `FAIL (${r.why})`}`);
      if (r.stage) {
        console.log(
          `    stage ${r.stage.left},${r.stage.top} -> ${r.stage.right},${r.stage.bottom} (viewport px)`,
        );
      }
      for (const c of r.centre || []) {
        console.log(`    centreline: ${c.name} differs by ${c.drift}px (tolerance ${ALIGN_TOLERANCE_PX}px), ${c.text}`);
      }
      for (const d of r.diagrams.filter((d) => d.why)) {
        const bits = [
          d.natural ? `viewBox ${d.natural} in ${d.boxW}x${d.boxH}` : `box ${d.boxW}x${d.boxH}`,
          d.scale !== null ? `letterbox x${d.scale}` : null,
          d.fill !== null ? `fills ${Math.round(d.fill * 100)}% of band` : null,
          d.smallest !== null ? `smallest text ${d.smallest}px` : null,
          d.projected !== null ? `-> ${d.projected}px projected` : null,
          `label ink outside its box ${d.ink}px${d.cut > 0.5 ? `, of which ${d.cut}px is clipped` : ""}`,
        ].filter(Boolean);
        console.log(`    diagram: ${bits.join(", ")} | ${d.why}${d.sample ? ` | smallest "${d.sample}"` : ""}`);
      }
      for (const c of r.clipped.slice(0, MAX_OFFENDERS)) {
        const extra = c.count > 1 ? ` x${c.count}` : "";
        console.log(
          `    clipped ${c.over} stage: ${c.name}${extra} at y ${c.top}..${c.bottom}${c.text ? ` "${c.text}"` : ""}`,
        );
      }
      if (r.clipped.length > MAX_OFFENDERS) {
        console.log(`    ... and ${r.clipped.length - MAX_OFFENDERS} more distinct element(s)`);
      }
    }
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(120);
  }
  if (errs.length) {
    failed += errs.length;
    for (const e of errs) console.log(`${w}x${h}: PAGEERROR: ${e}`);
  }
  await page.close();
}
await browser.close();

/* The measurements, printed whether or not anything failed. A builder needs the
 * number, not just a boolean: a diagram at 15px passes and is still not good,
 * and only the printed figure says so. */
if (report.diagrams.length) {
  console.log(`\ndiagram legibility (measured at ${report.viewport}, deck at 1920x1080, floor ${MIN_PROJECTED_PX}px):`);
  for (const d of report.diagrams) {
    const bits = [
      d.natural ? `viewBox ${d.natural}` : "viewBox MISSING",
      `in ${d.boxW}x${d.boxH}`,
      d.scale !== null ? `letterbox x${d.scale}` : "",
      d.fill !== null ? `fills ${Math.round(d.fill * 100)}% of band` : "",
      d.smallest !== null ? `smallest ${d.smallest}px` : "",
      d.projected !== null ? `-> ${d.projected}px projected` : "",
      `ink outside box ${d.ink}px, clipped ${d.cut}px`,
    ].filter(Boolean);
    console.log(`  s${d.slide}  ${bits.join("  ")}${d.why ? `  [${d.why}]` : ""}`);
  }
} else {
  console.log("\ndiagram legibility: no rendered diagram in this deck");
}
if (report.words.length) {
  const counts = report.words.map((r) => r.words);
  const max = Math.max(...counts);
  const over = counts.filter((c) => c > 60).length;
  console.log(
    `\nslide body words: max ${max}, median ${counts.slice().sort((a, b) => a - b)[Math.floor(counts.length / 2)]}, ${over} of ${counts.length} above 60 (reported, not failed: see DESIGN.md "Density budget")`,
  );
}

console.log(failed ? `MATRIX: ${failed} failure(s)` : "done");
process.exit(failed ? 1 : 0);
