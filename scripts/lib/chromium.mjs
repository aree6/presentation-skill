/**
 * One home for the "Chromium is available" contract.
 *
 * Every script that drives a browser needs the same two guards, and both have
 * to cover a different failure:
 *
 *   1. `playwright` itself is not resolvable. This kills the process during the
 *      *import* phase, before any code in the file runs, so a try/catch around
 *      `chromium.launch()` never sees it and the process exits 1. Exit 1 is
 *      what `cli.mjs` reads as "findings", so the deck gets reported as clipped
 *      and under-sized when it was never opened at all.
 *   2. `playwright` resolves but the browser binary is missing. That surfaces at
 *      launch and throws, which a bare `await chromium.launch()` also lets
 *      escape as a stack trace.
 *
 * So the import is dynamic and both paths exit 2, which `cli.mjs` already
 * classifies as could-not-run and answers with install advice. One script to
 * copy the contract into beats four that drift.
 */

export async function launchChromium(who) {
  const label = who || "this script";

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (err) {
    console.error(`${label}: playwright is not installed (${err.code || err.message}).`);
    console.error("  npm install");
    process.exit(2);
  }

  try {
    return await chromium.launch();
  } catch (err) {
    console.error(
      `${label}: cannot launch Chromium: ${err && err.message ? err.message : err}`,
    );
    console.error("  npx playwright install chromium");
    process.exit(2);
  }
}
