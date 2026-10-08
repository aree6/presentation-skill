#!/usr/bin/env bun
/**
 * Motion gate: does the deck's motion actually do what it claims?
 *
 * Five things break silently in a deck that uses auto-animate or fragments, and
 * none of them shows up as an error, a screenshot or a PDF page:
 *
 *   1. the code was never split into per-line boxes, so the code slides morph as
 *      opaque blocks and the line-by-line effect the deck was written for is gone;
 *   2. a line that stayed in the source is being reprinted instead of held, which
 *      reads as a flash of different code under the reader;
 *   3. the pair never ran at all, because one of the two sections lost its
 *      data-auto-animate, or the ids stopped matching;
 *   4. a fragment is invisible in a capture, so a screenshot, a PDF and a word
 *      count all describe a slide with its own argument missing;
 *   5. the stage was left mid-flight: a leftover data-anim-target or .animating,
 *      which means the next arrival on that slide has no entrance to play.
 *
 * So this drives the deck with the keyboard and with show(n), and reads the
 * numbers off the live DOM: which elements were given a transform, which were
 * given an unmatched fade, how many fragments a press advanced, and what a
 * capture sees.
 *
 * Deck-agnostic on purpose. It reads the pairs, the code blocks and the fragments
 * out of the document, so it works on a deck with none of them (and says so) and
 * on a deck with thirty of each.
 *
 *   bun cli.mjs motion --deck decks/<topic>/<topic>.html
 *
 * Exit 0 clean, 1 findings, 2 usage error. Needs Chromium.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(
    [
      "usage: bun cli.mjs motion --deck <deck.html>",
      "",
      "Drives the deck and checks what its motion actually did: code split into",
      "per-line boxes, a line that stayed put held rather than reprinted, an",
      "auto-animate pair that ran and settled, one key press per fragment, and a",
      "capture that sees every fragment.",
      "",
      "Prints what it found whether or not anything failed, because 'the morph",
      "did not run' and 'the morph ran on nothing' are different bugs.",
      "",
      "Exit 0 clean, 1 findings, 2 usage error.",
    ].join("\n"),
  );
  process.exit(0);
}
// --deck <path> and --deck=<path> are both spellings the CLI uses.
const eq = argv.find((a) => a.startsWith("--deck="));
const deckArg = eq
  ? eq.slice("--deck=".length)
  : argv[argv.indexOf("--deck") + 1] && !argv[argv.indexOf("--deck") + 1].startsWith("--")
    ? argv[argv.indexOf("--deck") + 1]
    : argv.find((a) => a.endsWith(".html"));
if (!deckArg || !existsSync(path.resolve(deckArg))) {
  console.error("motion: no such deck: " + (deckArg || "(none given)"));
  console.error("  usage: bun cli.mjs motion --deck <deck.html>");
  process.exit(2);
}
const DECK = path.resolve(deckArg);
// templates/ holds the scaffold and the gallery reference, neither of which
// is a shipped deck (same scope as the scaffold check in check-visuals.mjs).
const isTemplateMotion = /(^|[\\/])templates[\\/]/.test(DECK);
const findings = [];
const notes = [];
const ok = (label, cond, detail) => {
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
  if (!cond) findings.push(label);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`motion: ${deckArg}  (given)`);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 180)));
await page.goto(pathToFileURL(DECK).href, { waitUntil: "load" });
await page.evaluate(async () => {
  if (window.__deckReady && typeof window.__deckReady.then === "function") {
    try {
      await window.__deckReady;
    } catch {
      /* the deck reports its own */
    }
  }
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
});
await wait(400);

/* What the deck declares, read off the document rather than hard-coded here.
   A pair is what the ENGINE will run, not what the attributes suggest: both
   sections carry the attribute, the ids agree (absent agrees with absent),
   and neither side restarts. Anything less and animPlan returns null, so a
   shape that counted attribute adjacency would promise a pair the engine
   refuses — a FAIL reading like broken markup for a contract nobody stated. */
const shape = await page.evaluate(() => {
  const slides = [...document.querySelectorAll(".slide")];
  const anim = slides.map((el, k) => ({ k, has: el.hasAttribute("data-auto-animate") }));
  const pairs = [];
  for (let k = 1; k < anim.length; k++) {
    const a = slides[k - 1];
    const b = slides[k];
    if (!anim[k].has || !anim[k - 1].has) continue;
    if ((a.dataset.autoAnimateId || "") !== (b.dataset.autoAnimateId || "")) continue;
    if (a.hasAttribute("data-auto-animate-restart") || b.hasAttribute("data-auto-animate-restart")) continue;
    pairs.push([k - 1, k]);
  }
  return {
    total: slides.length,
    pairs,
    ids: slides.map((el) => el.getAttribute("data-auto-animate-id")),
    frags: slides.map((el, k) => ({ k, n: el.querySelectorAll(".fragment").length })).filter((f) => f.n),
    /* Directional fragments inside a rendered diagram. Mermaid positions nodes
       with the SVG transform ATTRIBUTE, and a CSS transform property replaces
       it instead of composing: .fade-up/down/left/right (or .custom) on a node
       piles every node off-screen, including in captures. Opacity-only effects
       work the same as plain ones and are not flagged; the breakage is
       movement. Measured, not reasoned: five nodes at x:-84 with .fade-up. */
    mmdDir: slides
      .map((el, k) => ({
        k,
        n: [...el.querySelectorAll(".mmdwrap .fragment")].filter((f) =>
          ["fade-up", "fade-down", "fade-left", "fade-right", "custom"].some((c) => f.classList.contains(c)),
        ).length,
      }))
      .filter((f) => f.n),
    codes: slides.map((el, k) => ({ k, n: el.querySelectorAll("pre > code").length })).filter((c) => c.n),
    /* Rendered code lines per slide, line numbers stripped: the pair checks
       below and the reprint check both need the text as the audience sees it,
       and `.cl` textContent carries the `.cln` number prefix. */
    codeLines: slides.map((el, k) => ({
      k,
      lines: [...el.querySelectorAll("pre code > .cl")].map((l) => l.textContent.replace(/^\d+/, "").trimEnd()),
    })).filter((c) => c.lines.length),
  };
});

/* --------------------------------- 1b. code that persists across a boundary
 * morphs. A code block that grows slide to slide is the base the next slide
 * builds on, and reprinting it static is the one motion error with no honest
 * threshold: either the lines travel or they flash. So any two ADJACENT slides
 * whose code shares real lines without an auto-animate pair between them is a
 * finding. Non-adjacent repetition cannot morph and is not checked; a single
 * isolated snippet has nothing to travel to and is not checked either.
 *
 * "Real lines" is doing the load-bearing work against false positives: three
 * shared lines with actual code in them, and at least 40% of the smaller
 * block. Two React snippets can share `}` or an import line by coincidence;
 * they cannot share half a block by coincidence. templates/ is exempt (same
 * scope as the scaffold check): the gallery documents treatments, it does not
 * ship decks. */
if (!isTemplateMotion) {
  const bySlide = new Map(shape.codeLines.map((c) => [c.k, c.lines]));
  const paired = new Set(shape.pairs.map(([a, b]) => `${a}-${b}`));
  const distinctive = (lines) => {
    const seen = new Set();
    for (const l of lines) {
      const t = l.trim();
      if (!t) continue;
      if ((t.match(/[A-Za-z0-9]/g) || []).length < 4) continue;
      seen.add(t);
    }
    return seen;
  };
  for (let k = 1; k < shape.total; k++) {
    if (paired.has(`${k - 1}-${k}`)) continue;
    const a = bySlide.get(k - 1);
    const b = bySlide.get(k);
    if (!a || !b) continue;
    const da = distinctive(a);
    const db = distinctive(b);
    const shared = [...da].filter((l) => db.has(l));
    const small = Math.min(da.size, db.size);
    const real = shared.length >= 3 && small > 0 && shared.length / small >= 0.4;
    // When both sections already carry the attribute, the usual reason they
    // still do not pair is the ids: one side names an id the other does not
    // share, and animPlan returns null on exactly that. Name it, because
    // "put data-auto-animate on both" reads as already-done otherwise.
    const ida = shape.ids[k - 1];
    const idb = shape.ids[k];
    const idHint = ida !== idb ? ` — both sections already carry the attribute, but the ids disagree (${JSON.stringify(ida)} vs ${JSON.stringify(idb)}): match them or drop both` : "";
    ok(
      `s${k}->s${k + 1}: code shared across the boundary morphs instead of reprinting`,
      !real,
      real
        ? `${shared.length} shared line(s), e.g. ${JSON.stringify(shared[0].slice(0, 50))}: put data-auto-animate on both sections (and data-anim on the pres) so the lines travel, or rewrite one side so they share nothing${idHint}`
        : "no shared code across the boundary",
    );
  }
} else {
  notes.push("templates/ reference: shared-code pairing not checked (the gallery documents, it does not ship)");
}

/* ------------------------------------------------- 1. the code got split --
 * Not "the deck has a code block" but "every line is its own box of one line's
 * height", which is the thing the morph depends on and the thing a screenshot
 * cannot see.
 */
if (!shape.codes.length) {
  notes.push("no code block in this deck, so there are no per-line boxes to check");
} else {
  for (const c of shape.codes) {
    await page.evaluate((k) => window.show(k), c.k);
    await wait(700);
    const r = await page.evaluate(() => {
      const blocks = [...document.querySelectorAll(".slide.active pre > code")];
      const rows = blocks.map((b) => [...b.querySelectorAll(":scope > .cl")].map((l) => Math.round(l.getBoundingClientRect().height)));
      return {
        blocks: blocks.length,
        rows,
        raw: blocks.map((b) => b.querySelectorAll(":scope > .cl").length),
      };
    });
    const split = r.blocks === c.n;
    ok(`s${c.k + 1}: every <code> split into one .cl box per line`, split, `${r.raw.join(",")} lines`);
    const flat = r.rows.flat();
    const oneLine = new Set(flat).size === 1 && flat[0] > 12;
    ok(
      `s${c.k + 1}: every line box is one line high, blank lines included`,
      oneLine,
      `heights ${[...new Set(flat)].join(",")}`,
    );
    const numbered = await page.evaluate(() =>
      [...document.querySelectorAll(".slide.active pre > code")].every(
        (b) => !b.closest("[data-lineno]") || b.querySelector(".cln"),
      ),
    );
    ok(`s${c.k + 1}: data-lineno produced a visible number on every line`, numbered);
  }
}

/* ------------------------------------- 2. each auto-animate pair runs and lands */
if (!shape.pairs.length) {
  notes.push("no two adjacent sections both carry data-auto-animate, so no pair to drive");
} else {
  for (const [from, to] of shape.pairs) {
    await page.evaluate((k) => window.show(k), from);
    // Long enough for the previous transition to land, its entrance to finish and
    // its settle timer to expire. show() deliberately skips the plan while the
    // outgoing slide has an animation in flight, so a gate that measures too early
    // reports a healthy deck as a dead pair.
    await wait(1600);
    const before = await page.evaluate(
      (k) =>
        [...document.querySelectorAll(".slide")[k].querySelectorAll("pre code > .cl")].map((l) =>
          l.textContent.replace(/^\d+/, ""),
        ),
      from,
    );
    const flight = await page.evaluate((args) => {
      const [f, t] = args;
      // Infinite-iteration animations (ambient edge flow, and nothing else in
      // this deck) never settle by definition, so they are not "in flight":
      // judging them would fail every pair beside a flowing diagram.
      const timing = (a) => { try { return a.effect && a.effect.getTiming ? a.effect.getTiming() : null; } catch { return null; } };
      const busy = document.querySelectorAll(".slide")[f]
        .getAnimations({ subtree: true })
        .filter((a) => a.playState === "running" && !(timing(a) && timing(a).iterations === Infinity)).length;
      window.show(t);
      const slide = document.querySelector(".slide.active");
      const animating = slide.classList.contains("animating");
      let moved = 0;
      const movedLines = [];
      const faded = [];
      for (const a of slide.getAnimations({ subtree: true })) {
        const el = a.effect && a.effect.target;
        if (!el) continue;
        const kf = a.effect.getKeyframes ? a.effect.getKeyframes() : [];
        const hasT = kf.some((k) => k.transform);
        const hasO = kf.some((k) => k.opacity !== undefined);
        if (hasT) {
          moved++;
          if (el.classList && el.classList.contains("cl")) movedLines.push(el.textContent);
        } else if (hasO && el.classList && el.classList.contains("cl")) {
          faded.push(el.textContent.replace(/^\d+/, ""));
        }
      }
      return { busy, animating, moved, movedLines: movedLines.length, faded };
    }, [from, to]);
    ok(
      `s${from + 1}->s${to + 1}: the outgoing slide was settled before the pair ran`,
      flight.busy === 0,
      `${flight.busy} animation(s) still in flight`,
    );
    ok(
      `s${from + 1}->s${to + 1}: the pair ran`,
      flight.animating && flight.moved > 0,
      `animating=${flight.animating}, ${flight.moved} element(s) transformed, ${flight.movedLines} of them code lines` +
        (flight.moved === 0
          ? " — no transform ran, which is healthy when the slides share nothing: a codeless cross-fade has nothing to glide, and the head still floats in"
          : ""),
    );
    // A pair whose geometry is identical on both slides (a pure append, or an
    // in-place change that correctly faded) is legitimately still — only a row
    // change demands travel. Row indices of lines unique on both sides decide:
    // a kept line on a new row with nothing travelling means the insertion
    // above it never pushed it down.
    const after = await page.evaluate(() => {
      const slide = document.querySelector(".slide.active");
      return [...slide.querySelectorAll("pre code > .cl")].map((l) => l.textContent.replace(/^\d+/, ""));
    });
    const posAfter = new Map();
    after.forEach((t, i) => {
      if (!posAfter.has(t)) posAfter.set(t, []);
      posAfter.get(t).push(i);
    });
    const posBefore = new Map();
    before.forEach((t, i) => {
      if (!posBefore.has(t)) posBefore.set(t, []);
      posBefore.get(t).push(i);
    });
    let shifted = "";
    for (const [t, ib] of posBefore) {
      const ia = posAfter.get(t);
      if (ib.length === 1 && ia && ia.length === 1 && ia[0] !== ib[0]) { shifted = t; break; }
    }
    ok(
      `s${from + 1}->s${to + 1}: at least one code line travelled`,
      before.length === 0 || flight.movedLines > 0 || !shifted,
      shifted && flight.movedLines === 0
        ? `line ${JSON.stringify(shifted.slice(0, 40))} changed rows but nothing travelled: an insertion above it must push it down`
        : `${flight.movedLines} line(s) travelling`,
    );
    // The defect this catches: a line whose text is unchanged on both slides being
    // handed to the unmatched fade, which is a flash of new code under the reader.
    // Lines whose text occurs more than once on either side are excluded: with no
    // single identity, first-match-wins pairing leaves the duplicates to fade,
    // which is the documented rule working rather than a reprint (a `}` closing
    // two different blocks, a blank line twice in one block).
    const countBefore = new Map();
    before.forEach((t) => countBefore.set(t, (countBefore.get(t) || 0) + 1));
    const countAfter = new Map();
    after.forEach((t) => countAfter.set(t, (countAfter.get(t) || 0) + 1));
    const reprinted = flight.faded.filter(
      (t) => before.includes(t) && countBefore.get(t) === 1 && (countAfter.get(t) || 0) <= 1,
    );
    ok(
      `s${from + 1}->s${to + 1}: no unchanged line was reprinted instead of held`,
      reprinted.length === 0,
      reprinted.length ? `${reprinted.length} reprinted: ${reprinted[0].slice(0, 40)}` : `${flight.faded.length} genuinely new line(s) faded in`,
    );
    // Past the longest possible morph: 1s pair duration with the unmatched fade
    // ending at 200ms + 800ms. Reading earlier reports a healthy deck as
    // unsettled, which is exactly what the 900ms this replaced did once the
    // duration matched reveal.js's own default.
    await wait(1400);
    const rest = await page.evaluate(() => {
      const slide = document.querySelector(".slide.active");
      return {
        animating: slide.classList.contains("animating"),
        targets: document.querySelectorAll("[data-anim-target]").length,
        inline: [...slide.querySelectorAll("[style*='transform']")].length,
      };
    });
    ok(
      `s${from + 1}->s${to + 1}: the transition settled (no leftover state)`,
      !rest.animating && rest.targets === 0 && rest.inline === 0,
      `animating=${rest.animating} targets=${rest.targets} inline transforms=${rest.inline}`,
    );
  }
}

/* --------------------------------------------- 3. one press per fragment, and
 * the capture sees them all. Plus the one fragment placement that breaks the
 * slide instead of stepping it: a directional or custom fragment class inside
 * a rendered diagram displaces the node it sits on (CSS transform replaces
 * the SVG positioning attribute), so it fails by class name, before anything
 * is stepped. */
if (shape.mmdDir.length) {
  for (const f of shape.mmdDir) {
    ok(
      `s${f.k + 1}: no directional fragment inside a diagram`,
      false,
      `${f.n} .fragment(s) with fade-up/down/left/right/custom inside .mmdwrap: use bare .fragment (MERMAID.md §5a) or move the step to HTML callouts beside the diagram`,
    );
  }
}
if (!shape.frags.length) {
  notes.push("no .fragment in this deck, so the step-through has nothing to check");
} else {
  const f = shape.frags[0];
  await page.evaluate((k) => window.show(k), f.k);
  await wait(400);
  const seen = [];
  for (let n = 0; n <= f.n + 1; n++) {
    seen.push(
      await page.evaluate(() => ({
        at: document.querySelector(".slide.active").getAttribute("data-fragment"),
        live: document.getElementById("live") ? document.getElementById("live").textContent : "",
      })),
    );
    await page.keyboard.press("ArrowRight");
    await wait(110);
  }
  const steps = seen.slice(0, f.n + 1).map((s) => s.at);
  ok(
    `s${f.k + 1}: one press per fragment, from step zero`,
    steps.join(",") === Array.from({ length: f.n + 1 }, (_, i) => i - 1).join(","),
    `${f.n} fragment(s): ${steps.join(",")}`,
  );
  const moved = await page.evaluate(
    () =>
      [...document.querySelectorAll(".slide")].findIndex(
        (el, k) => k > 0 && el.classList.contains("active"),
      ) !== -1 ||
      document.querySelector(".slide.active").getAttribute("data-fragment") === "-1",
  );
  ok(`s${f.k + 1}: the deck moves on once the steps run out`, moved);
  const named = seen.slice(1, f.n + 1).filter((s) => s.live && !/^Slide \d+ of/.test(s.live));
  ok(
    `s${f.k + 1}: the live region names each step, not only the slide`,
    named.length >= Math.min(2, f.n),
    `${named.length} of ${f.n} steps announced something specific`,
  );
  const capture = await page.evaluate(async () => {
    window.__noMorph = true;
    // show() is what applies the class from the flag, and re-showing the
    // current slide early-returns before it does — so the test applies the
    // class the same way show() would, then waits two frames for the style to
    // land. Reading synchronously after setting the flag alone measures the
    // deck before it could answer, which is why this passed with every
    // fragment on the active (already stepped) slide and failed the moment
    // fragments spread across slides.
    document.body.classList.add("no-anim");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const hidden = [...document.querySelectorAll(".slide .fragment")].filter((f) => {
      const cs = getComputedStyle(f);
      return cs.opacity !== "1" || cs.visibility === "hidden";
    });
    const out = { hidden: hidden.length, total: document.querySelectorAll(".slide .fragment").length };
    window.__noMorph = false;
    document.body.classList.remove("no-anim");
    return out;
  });
  ok(
    `__noMorph reveals every fragment, so a capture judges the settled slide`,
    capture.hidden === 0,
    `${capture.total} fragment(s), ${capture.hidden} invisible`,
  );
}

/* ------------------------------------------------- 4. reduced motion, asked
 * for before load, which is the only way the boot class is real. Emulating it
 * after the deck has loaded tests nothing: the flag was read once at boot and a
 * deck that answered a late change would be doing something no user ever asked
 * for. So this is a second browser context.
 */
const rmCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
const rmPage = await rmCtx.newPage();
const rmErrs = [];
rmPage.on("pageerror", (e) => rmErrs.push(String(e).slice(0, 180)));
await rmPage.goto(pathToFileURL(DECK).href, { waitUntil: "load" });
await rmPage.waitForTimeout(400);
const rm = await rmPage.evaluate(async () => {
  const slides = [...document.querySelectorAll(".slide")];
  const k = Math.max(0, slides.findIndex((el) => el.hasAttribute("data-auto-animate")));
  window.show(k);
  await new Promise((r) => setTimeout(r, 700));
  window.show(Math.min(k + 1, slides.length - 1));
  await new Promise((r) => setTimeout(r, 120));
  return {
    body: document.body.className,
    animating: document.querySelector(".slide.active").classList.contains("animating"),
    running: document.querySelector(".slide.active").getAnimations({ subtree: true }).length,
    hidden: [...document.querySelectorAll(".slide .fragment")].filter((x) => getComputedStyle(x).opacity !== "1").length,
    fragments: document.querySelectorAll(".slide .fragment").length,
  };
});
ok("prefers-reduced-motion sets no-anim at boot", /no-anim/.test(rm.body), `body="${rm.body}"`);
ok("prefers-reduced-motion runs no transition at all", !rm.animating && rm.running === 0, JSON.stringify(rm));
ok(
  "prefers-reduced-motion shows every fragment",
  rm.hidden === 0,
  `${rm.fragments} fragment(s), ${rm.hidden} invisible`,
);
ok("no page errors under reduced motion", rmErrs.length === 0, rmErrs.join(" | "));
await rmCtx.close();

ok("no page errors", errs.length === 0, errs.join(" | "));
await browser.close();
/* Every slide steps or pairs. A slide that argues in stages carries fragments;
   a slide that continues its neighbour pairs with it (even with nothing
   shared, when the pair is only a cross-fade rather than a glide — that is
   what the official site does with unrelated auto-animate slides, and the head
   still floats in). A slide that does neither dumps its knowledge whole, which
   is the one thing this skill exists to prevent, so it is a finding, not an
   advisory: advisories here were read and rejected in favour of the green
   gate. templates/ is exempt (same scope as the scaffold check): the gallery
   documents treatments, it does not ship decks. */
if (!isTemplateMotion) {
  const pairedMotion = new Set(shape.pairs.flat());
  const fraggedMotion = new Set(shape.frags.map((f) => f.k));
  const still = [];
  for (let k = 0; k < shape.total; k++) {
    if (!pairedMotion.has(k) && !fraggedMotion.has(k)) still.push(k);
  }
  ok(
    "every slide steps or pairs",
    still.length === 0,
    still.length
      ? `static: ${still.map((k) => `s${k + 1}`).join(", ")} — stage the argument with .fragment (DESIGN.md "Fragments") or morph into the neighbour with data-auto-animate on both sections`
      : `${shape.total} of ${shape.total} step or pair`,
  );
}
/* Coverage is reported, never failed — with one exception. A gate cannot tell
   a slide that argues in steps from one that does not, so no threshold would
   be honest; but a code block with no pair and no fragment anywhere in the
   deck is unambiguous. The code frame exists for one thing (DESIGN.md "The
   code frame, and why it is a treatment": the split is the whole reason a code
   slide can animate a line at a time), so a deck that carries code and steps
   nothing has built the machinery and never switched it on. That is a finding,
   not an advisory: an advisory here was read and rejected in favour of the
   green gate, which is how a technical deck ships with no motion in it. */
const stepped = new Set();
for (const [a, b] of shape.pairs) { stepped.add(a); stepped.add(b); }
for (const f of shape.frags) stepped.add(f.k);
const pairRefs = shape.pairs.map(([a, b]) => `s${a + 1}→s${b + 1}`).join(", ");
const fragRefs = shape.frags.map((f) => `s${f.k + 1}×${f.n}`).join(", ");
const staticCode = shape.codes.map((c) => c.k).filter((k) => !stepped.has(k));
// templates/ scope: see isTemplateMotion above (same scope as the scaffold
// check in check-visuals.mjs).
const isTemplate = isTemplateMotion;
console.log(
  `  coverage  ${stepped.size} of ${shape.total} slides step` +
    (pairRefs ? ` (auto-animate ${pairRefs})` : "") +
    (fragRefs ? ` (fragments ${fragRefs})` : ""),
);
if (staticCode.length && stepped.size === 0 && !isTemplate) {
  ok(
    "code that never moves",
    false,
    `static code on ${staticCode.map((k) => `s${k + 1}`).join(", ")} with zero auto-animate pairs and zero fragments in the deck: pair the code slides (data-auto-animate on both sections, data-anim="src" on the pre) or step the argument with .fragment (DESIGN.md "Auto-animate", "Fragments"; SKILL.md section 1 item 7)`,
  );
} else if (staticCode.length) {
  console.log(
    `  coverage  static code on ${staticCode.map((k) => `s${k + 1}`).join(", ")}: a code block that never morphs is a slide that could be a pair (DESIGN.md "Auto-animate")`,
  );
}
for (const n of notes) console.log(`  note  ${n}`);
console.log("");
console.log(
  findings.length
    ? `motion: ${findings.length} finding(s) across ${shape.total} slide(s)`
    : `clean: motion behaves as declared across ${shape.total} slide(s)` +
        (notes.length ? `, ${notes.length} feature(s) absent` : ""),
);
process.exit(findings.length ? 1 : 0);