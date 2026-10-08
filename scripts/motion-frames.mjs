/**
 * Capture the deck mid-transition, because a morph that measures correctly and
 * looks wrong is still wrong, and no number in verify-motion.mjs can see it.
 *
 *   node scripts/motion-frames.mjs decks/motion-demo/motion-demo.html
 *
 * Writes <deck-dir>/<stem>-motion/<slide-pair>-<ms>.png: the outgoing slide, the
 * incoming slide at rest, and the same transition caught at 0/120/240/360/520ms.
 */
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const HELP = [
  "usage: bun cli.mjs frames --deck <deck.html>",
  "",
  "Writes <deck-dir>/<stem>-motion/: the outgoing slide, the incoming slide at",
  "rest, the same transition caught at 40/150/280/420ms, and one frame per",
  "fragment step. It exists because a morph that measures correctly and looks",
  "wrong is still wrong, and no assertion in cli.mjs motion can see that.",
  "",
  "Prints one absolute path per line, in the order they were taken.",
  "",
  "Exit 0 clean, 2 usage error.",
].join("\n");
if (process.argv.slice(2).includes("--help") || process.argv.slice(2).includes("-h")) {
  console.log(HELP);
  process.exit(0);
}
const eq = process.argv.slice(2).find((a) => a.startsWith("--deck="));
const pos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DECK = eq ? eq.slice("--deck=".length) : pos[pos.length - 1];
if (!DECK || !DECK.endsWith(".html")) {
  console.error("motion-frames: no deck given.");
  console.error("  usage: bun cli.mjs frames --deck <deck.html>");
  process.exit(2);
}
const abs = path.resolve(DECK);
const outDir = path.join(path.dirname(abs), path.basename(abs, ".html") + "-motion");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
await page.goto(pathToFileURL(abs).href, { waitUntil: "load" });
await page.waitForTimeout(400);

/* Every transition the deck declares, read off the sections themselves so this
   script never carries its own idea of the deck's shape. */
const pairs = await page.evaluate(() =>
  [...document.querySelectorAll(".slide")]
    .map((el, k) => ({ k, name: el.getAttribute("data-name"), anim: el.hasAttribute("data-auto-animate") }))
    .filter((s) => s.anim)
    .map((s, idx, all) => ({ from: s.k - 1, to: s.k, name: s.name, auto: idx }))
    .filter((p) => p.from >= 0),
);
const fragStep = await page.evaluate(
  () => [...document.querySelectorAll(".slide")].findIndex((el) => el.querySelector(".fragment")),
);

const shots = [];
async function grab(label) {
  const file = path.join(outDir, `${label}.png`);
  await page.screenshot({ path: file });
  shots.push(file);
}

for (const p of pairs) {
  const tag = `s${p.from + 1}-to-s${p.to + 1}`;
  await page.evaluate((n) => window.show(n), p.from);
  await page.waitForTimeout(900);
  await grab(`${tag}-0-out`);
  await page.evaluate((n) => window.show(n), p.to);
  await page.waitForTimeout(1100);
  await grab(`${tag}-6-rest`);
  // 0ms is not a useful sample: the incoming slide's own fade is 10ms, so a frame
  // caught inside it is a blank canvas and says nothing about the morph. 40ms is
  // the first frame where the morph is genuinely in flight.
  for (const ms of [40, 150, 280, 420]) {
    await page.evaluate((n) => window.show(n), p.from);
    await page.waitForTimeout(900);
    await page.evaluate((n) => window.show(n), p.to);
    await page.waitForTimeout(ms);
    await grab(`${tag}-${ms}ms`);
  }
  await page.waitForTimeout(700);
}

/* The fragment slide: one frame per step, so the reveal can be read as a
   sequence instead of inferred from the settled slide. */
if (fragStep >= 0) {
  await page.evaluate((n) => window.show(n), fragStep);
  await page.waitForTimeout(600);
  const total = await page.evaluate(() => document.querySelectorAll(".slide.active .fragment").length);
  for (let n = -1; n <= total; n++) {
    await page.evaluate((i) => window.show(i), fragStep);
    await page.waitForTimeout(500);
    if (n >= 0) {
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(450);
    }
    await grab(`frag-step${String(n + 1).padStart(2, "0")}`);
  }
}

await browser.close();
if (errs.length) console.log("PAGEERROR", errs.join(" | "));
console.log(`motion-frames: ${shots.length} frames in ${outDir}`);
for (const s of shots) console.log("  " + s);