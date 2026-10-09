/**
 * Fragment navigation in templates/template.html.
 *
 * Three promises, and the template's own comments used to claim the first two
 * while the code did neither:
 *
 *   1. A JUMP (rail click, Home/End, window.show(n)) arrives SETTLED. A jump is
 *      not a walk, so there is no presenting left to do on the slide you landed
 *      on, and an audience must never look at an empty one.
 *   2. Arrow keys walk the fragments FORWARD AND BACKWARD, popping the stack.
 *   3. The active slide is never observably empty, however it was reached.
 *
 * The deck under test is the real template with its sample slides swapped for
 * three minimal ones, because what is being tested is the template's navigation
 * script, not its sample content. Everything else — the stylesheet, the rail,
 * the morph, the .cl splitter — is the shipped file, unmodified.
 *
 * Run: bun test test/frag-navigation.test.mjs
 */

import { test, expect, beforeAll, afterAll, describe } from "bun:test";
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(HERE, "..", "templates", "template.html");

/** Three slides: a plain one, one with three fragments, and a plain one. */
const FRAG_SLIDE = [
  '<section class="slide" data-toc="Fragments" data-name="Three steps" data-rail="phosphor/list">',
  '<header class="s-head"><h2 class="head">Three steps</h2><p class="sub">One fragment each.</p></header>',
  '<div class="s-body"><div class="steps3">',
  '<div class="step fragment fade-up"><h4>One</h4><p>First step.</p></div>',
  '<div class="step fragment fade-up"><h4>Two</h4><p>Second step.</p></div>',
  '<div class="step fragment fade-up"><h4>Three</h4><p>Third step.</p></div>',
  "</div></div>",
  '<footer class="s-foot"><div class="takeaway" data-morph="take">Fragments walk both ways.</div></footer>',
  "</section>",
].join("\n");

const DECK = [
  '<section class="slide" data-toc="Open" data-name="Plain opener">',
  '<header class="s-head"><h2 class="head">Plain opener</h2><p class="sub">No fragments here.</p></header>',
  "<div class=\"s-body\"><p>Nothing to step through.</p></div>",
  "</section>",
  FRAG_SLIDE,
  '<section class="slide" data-toc="Close" data-name="Plain closer">',
  '<header class="s-head"><h2 class="head">Plain closer</h2><p class="sub">No fragments here.</p></header>',
  "<div class=\"s-body\"><p>Also nothing to step through.</p></div>",
  "</section>",
].join("\n\n");

/**
 * The shipped template with its sample slide block replaced. The block is found
 * by its own anchors rather than by line number, so the test breaks loudly
 * (deck has 0 slides) rather than silently testing nothing if the template's
 * sample section ever moves.
 */
function buildDeck() {
  const tpl = fs.readFileSync(TEMPLATE, "utf8");
  const first = tpl.indexOf('<section class="slide');
  const last = tpl.lastIndexOf("</section>");
  if (first < 0 || last < 0) throw new Error("template.html has no sample <section class=\"slide\">");
  return tpl.slice(0, first) + DECK + tpl.slice(last + "</section>".length);
}

let browser;
let tmp;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "frag-nav-"));
  fs.writeFileSync(path.join(tmp, "frag.html"), buildDeck());
  browser = await chromium.launch();
});

afterAll(async () => {
  if (browser) await browser.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

/**
 * Opens the deck in a fresh page and waits for the template's boot to settle.
 * `noAnim` puts body.no-anim on after boot, which is the reduced-motion path:
 * every fragment is forced on through CSS (see the capture guard in the
 * template), so `painted` below stops being the probe and `stepped` takes over.
 */
async function open({ noAnim = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(path.join(tmp, "frag.html")).href, { waitUntil: "load" });
  await page.evaluate(() => window.__deckReady);
  if (noAnim) await page.evaluate(() => document.body.classList.add("no-anim"));
  await page.waitForTimeout(60);
  return { page, ctx, errors };
}

/** The slide number currently showing. */
const at = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".slide")].findIndex((el) => el.classList.contains("active")),
  );

/** data-fragment on the active slide, the attribute CSS and captures read. */
const dataFrag = (page) =>
  page.evaluate(() => {
    const s = document.querySelector(".slide.active");
    return s ? s.getAttribute("data-fragment") : null;
  });

/** What the AUDIENCE can see: fragments painted on, by computed style. */
const painted = (page) =>
  page.evaluate(() => {
    const s = document.querySelector(".slide.active");
    if (!s) return -1;
    return [...s.querySelectorAll(".fragment")].filter((f) => {
      const cs = getComputedStyle(f);
      return cs.visibility !== "hidden" && +cs.opacity > 0.01;
    }).length;
  });

/**
 * What the NAVIGATION SCRIPT believes: fragments carrying .visible. Under
 * body.no-anim this is the only honest probe, because the capture guard paints
 * every fragment whether or not the deck stepped to it.
 */
const stepped = (page) =>
  page.evaluate(() => {
    const s = document.querySelector(".slide.active");
    if (!s) return -1;
    return [...s.querySelectorAll(".fragment")].filter((f) => f.classList.contains("visible")).length;
  });

/**
 * "Visible", resolved for the mode under test: with motion on the class and the
 * paint must agree, so painted is the assertion; with no-anim the paint is
 * forced, so stepped is the assertion and painted is checked for the capture
 * contract instead (see "the capture contract still reveals everything").
 */
const visibleCount = (page, noAnim) => (noAnim ? stepped(page) : painted(page));

const press = async (page, key, times = 1) => {
  for (let n = 0; n < times; n++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(70);
  }
};

describe.each([
  { label: "with motion", noAnim: false },
  { label: "with body.no-anim", noAnim: true },
])("fragment navigation ($label)", ({ noAnim }) => {
  test("arrow down walks the fragments forward", async () => {
    const { page, ctx, errors } = await open({ noAnim });
    try {
      await page.evaluate(() => window.show(0));
      await press(page, "ArrowDown"); // walks ONTO the fragment slide: step zero
      expect(await at(page)).toBe(1);
      expect(await stepped(page)).toBe(0);
      expect(await dataFrag(page)).toBe("-1");

      for (const n of [1, 2, 3]) {
        await press(page, "ArrowDown");
        expect(await visibleCount(page, noAnim)).toBe(n);
        expect(await stepped(page)).toBe(n);
        expect(await dataFrag(page)).toBe(String(n - 1));
      }
      expect(errors).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test("arrow up pops the stack in reverse", async () => {
    const { page, ctx, errors } = await open({ noAnim });
    try {
      // Walk in, exactly as a talk does: show(0) is the opening, one press
      // walks ONTO the fragment slide at step zero, three more walk the steps.
      // window.show(1) would be a JUMP and land settled, so it cannot be the
      // setup for a test about popping.
      await page.evaluate(() => window.show(0));
      await press(page, "ArrowDown");
      await press(page, "ArrowDown", 3);
      expect(await at(page)).toBe(1);
      expect(await visibleCount(page, noAnim)).toBe(3);

      await press(page, "ArrowUp", 2);
      expect(await visibleCount(page, noAnim)).toBe(1);
      expect(await stepped(page)).toBe(1);
      expect(await dataFrag(page)).toBe("0");
      expect(await at(page)).toBe(1); // still here: there was stack left to pop

      // The next step up empties the stack, so the caller moves the slide
      // instead of getting stuck at step -1 of the slide it is already on.
      await press(page, "ArrowUp");
      expect(await stepped(page)).toBe(0);
      expect(await at(page)).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test("stepping back up onto a slide pops it rather than resetting it", async () => {
    const { page, ctx, errors } = await open({ noAnim });
    try {
      // Walk forward onto the fragment slide and off the end of it, exactly as
      // a talk does: show(0), down onto slide 1, down through the steps, down
      // again to slide 2.
      await page.evaluate(() => window.show(0));
      await press(page, "ArrowDown");
      await press(page, "ArrowDown", 3);
      await press(page, "ArrowDown"); // steps run out -> slide 2
      expect(await at(page)).toBe(2);

      // Back up onto the slide the audience was just shown in full.
      await press(page, "ArrowUp");
      expect(await at(page)).toBe(1);
      expect(await visibleCount(page, noAnim)).toBe(3);
      expect(await dataFrag(page)).toBe("2");

      // And each further press takes one step back off that stack.
      await press(page, "ArrowUp", 2);
      expect(await visibleCount(page, noAnim)).toBe(1);
      expect(await at(page)).toBe(1);
      expect(errors).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test("a rail click arrives settled, not empty", async () => {
    const { page, ctx, errors } = await open({ noAnim });
    try {
      await page.evaluate(() => window.show(0));
      // A jump: no walking down to it first.
      await page.locator(".slide.active .rail-item").nth(1).click();
      await page.waitForTimeout(120);

      expect(await at(page)).toBe(1);
      expect(await visibleCount(page, noAnim)).toBe(3);
      expect(await dataFrag(page)).toBe("2");
      expect(errors).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test("a jump is settled on the FIRST frame, not faded in", async () => {
    const { page, ctx, errors } = await open({ noAnim: false });
    try {
      await page.evaluate(() => window.show(0));
      // One task, no settle wait: this is what the audience gets on the frame
      // the destination slide is first painted. A settle written after .active
      // would read 0 here and fade in over .4s.
      const firstFrame = await page.evaluate(async () => {
        document.querySelectorAll(".slide.active .rail-item")[1].click();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const s = document.querySelector(".slide.active");
        return {
          at: [...document.querySelectorAll(".slide")].indexOf(s),
          painted: [...s.querySelectorAll(".fragment")].filter((f) => {
            const cs = getComputedStyle(f);
            return cs.visibility !== "hidden" && +cs.opacity > 0.01;
          }).length,
        };
      });
      expect(firstFrame).toEqual({ at: 1, painted: 3 });
      expect(errors).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test("Home and End are jumps too", async () => {
    const { page, ctx, errors } = await open({ noAnim });
    try {
      await page.evaluate(() => window.show(0));
      await press(page, "End");
      expect(await at(page)).toBe(2);
      await press(page, "Home");
      expect(await at(page)).toBe(0);

      await press(page, "End");
      expect(await at(page)).toBe(2);
      await press(page, "ArrowLeft"); // walks back onto slide 1, settled
      expect(await at(page)).toBe(1);
      expect(await visibleCount(page, noAnim)).toBe(3);
      // A settled arrival leaves fragAt at the end of the stack, so DOWN moves
      // the deck on instead of re-walking fragments the audience has been shown.
      await press(page, "ArrowDown");
      expect(await at(page)).toBe(2);
      expect(errors).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test("the active slide is never empty, however it was reached", async () => {
    const { page, ctx, errors } = await open({ noAnim });
    try {
      for (const n of [0, 1, 2, 0, 2]) {
        await page.evaluate((k) => window.show(k), n);
        await page.waitForTimeout(60);
        const frags = await page.evaluate(
          () => document.querySelector(".slide.active").querySelectorAll(".fragment").length,
        );
        expect({ at: await at(page), shown: await stepped(page), frags }).toEqual({
          at: n,
          shown: frags,
          frags,
        });
      }
      expect(errors).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test("the edge buttons step like the arrows do", async () => {
    const { page, ctx, errors } = await open({ noAnim });
    try {
      // Walk in (window.show(1) would jump and land settled): onto the slide
      // at step zero, then three steps to the top of the stack.
      await page.evaluate(() => window.show(0));
      await press(page, "ArrowDown");
      await press(page, "ArrowDown", 3);
      expect(await visibleCount(page, noAnim)).toBe(3);
      await page.locator("#edgeL").click();
      await page.waitForTimeout(120);
      expect(await at(page)).toBe(1);
      expect(await visibleCount(page, noAnim)).toBe(2);
      await page.locator("#edgeL").click();
      await page.waitForTimeout(120);
      expect(await visibleCount(page, noAnim)).toBe(1);
      // The stack is at its first step: one more press up pops past zero, so
      // stepFrag returns false and the deck moves to the previous slide
      // instead of sitting at step -1 of the slide it is already on.
      await page.locator("#edgeL").click();
      await page.waitForTimeout(120);
      expect(await at(page)).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});

test("the capture contract still reveals every fragment on every slide", async () => {
  // __noMorph is the flag shot and export-pdf set before they drive show(n).
  // It must keep the template's own promise: a capture judges the SETTLED
  // slide, and no capture ever walks a fragment, so every fragment in the deck
  // has to be painted.
  const { page, ctx, errors } = await open({});
  try {
    const out = await page.evaluate(async () => {
      window.__noMorph = true;
      const slides = [...document.querySelectorAll(".slide")];
      for (const k of slides.keys()) window.show(k);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const hidden = [...document.querySelectorAll(".slide .fragment")].filter((f) => {
        const cs = getComputedStyle(f);
        return cs.visibility === "hidden" || +cs.opacity < 0.99;
      });
      const res = { hidden: hidden.length, total: document.querySelectorAll(".slide .fragment").length };
      window.__noMorph = false;
      return res;
    });
    expect(out.total).toBeGreaterThan(0);
    expect(out.hidden).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
  }
});