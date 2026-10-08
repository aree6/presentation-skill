#!/usr/bin/env bun
/**
 * Dash checker for slide decks and docs.
 *
 * Em dashes read as filler and usually mark a sentence doing two jobs that
 * should be two sentences. Report mode is the default, because prose is not
 * safely machine-fixable. --fix applies only the one rewrite that cannot change
 * meaning (an em dash wrapping a parenthetical aside becomes a comma) and leaves
 * the rest for a human.
 *
 *   bun scripts/check-dashes.mjs <deck.html>
 *   bun scripts/check-dashes.mjs --en <deck.html>   also flag en dashes
 *   bun scripts/check-dashes.mjs --fix <deck.html>
 *   bun scripts/check-dashes.mjs --en=true --fix=false <deck.html>
 *
 * Numeric ranges ("0-6", "0–6") are range punctuation rather than
 * violations, and are skipped even under --en.
 *
 * Input is validated before any scanning: a directory or a missing path is a
 * usage error (2), not a crash. A file that is not valid UTF-8 cannot be
 * scanned, because decoding it substitutes U+FFFD for every bad byte and
 * hides exactly the em dash a cp1252 Word or Excel export writes. Those are
 * reported loudly and the run exits 2 rather than claiming clean.
 *
 * --fix never touches JavaScript or TypeScript source. A template literal or a
 * string in code is data, not prose, and rewriting it silently corrupts the
 * program; .mjs/.ts files are still reported, just never auto-rewritten.
 *
 * Exit 0 clean, 1 violations found, 2 usage or unreadable input.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const EM = "\u2014";
const EN = "\u2013";
const BAR = "\u2015";

/** `--flag value` and `--flag=value` both set the flag; `--flag=false` clears it. */
function parseArgv(argv) {
  const flags = new Map();
  const positional = [];
  for (const arg of argv) {
    if (arg === "-h") {
      flags.set("help", true);
    } else if (arg.startsWith("--") && arg.length > 2) {
      const eq = arg.indexOf("=");
      if (eq === -1) flags.set(arg.slice(2), true);
      else {
        const name = arg.slice(2, eq);
        const value = arg.slice(eq + 1);
        flags.set(name, /^(0|false|no|off)$/i.test(value) ? false : value);
      }
    } else {
      positional.push(arg);
    }
  }
  return {
    flags,
    positional,
    // Any value that is not an explicit falsy turns the flag on, so --en,
    // --en=1 and --en=yes all work while --en=false does not.
    on: (name) => {
      const v = flags.get(name);
      return v !== undefined && v !== false;
    },
  };
}

const HELP = [
  "usage: bun scripts/check-dashes.mjs [--en] [--fix] <file>...",
  "",
  "  --en      also flag en dashes; numeric ranges are still allowed",
  "  --fix     rewrite only the safe cases, in place (never in JS/TS source)",
  "  --help, -h  print this and exit 0",
  "",
  "Both --flag value and --flag=value are accepted; --flag=false clears a flag.",
  "",
  "Exit 0 clean, 1 violations found, 2 usage error or unreadable input.",
].join("\n");

const opts = parseArgv(process.argv.slice(2));
if (opts.on("help")) {
  console.log(HELP);
  process.exit(0);
}

const FIX = opts.on("fix");
const INCLUDE_EN = opts.on("en");
const paths = opts.positional;

/** Extensions whose em dashes live in code, not prose, so --fix must skip them. */
const NO_FIX_EXT = new Set([".mjs", ".cjs", ".js", ".jsx", ".ts", ".tsx"]);

if (!paths.length) {
  console.error("pass at least one file to scan");
  process.exit(2);
}

// Validate every path first: a directory or a missing file is a usage error,
// and it is better to say so than to die inside readFileSync with EISDIR.
for (const f of paths) {
  if (!existsSync(f)) {
    console.error(`no such file: ${f}`);
    process.exit(2);
  }
  let st;
  try {
    st = statSync(f);
  } catch (err) {
    console.error(`cannot stat ${f}: ${err.message}`);
    process.exit(2);
  }
  if (st.isDirectory()) {
    console.error(`not a file (is a directory): ${f}`);
    process.exit(2);
  }
  if (!st.isFile()) {
    console.error(`not a regular file: ${f}`);
    process.exit(2);
  }
}

const RANGE_RE = /\b\d+\s*[-–—]\s*\d+\b/g;
const SLASH_PAIR_RE = /\b\d+\s*\/\s*\d+\b/g;

/**
 * A `//` comment is masked only when it OPENS A LINE. That is the narrow reading
 * and it is the right one: a `//` in the middle of a line is far more often the
 * second slash of a URL than the start of a comment, and masking `https://x//y`
 * plus everything after it hides the very sentence this gate exists to find.
 * A trailing comment after code on one line is left in scope, which costs a
 * finding the author can see is inside code.
 *
 * Comments are masked out before anything is scanned.
 *
 * A deck copies treatment CSS out of templates/slides/patterns.html verbatim,
 * and that file annotates its own rules with em dashes. Following the skill
 * literally therefore produced a deck that failed the skill's own gate on a
 * sentence no audience will ever read, and `--fix` cannot rewrite it either: it
 * refuses to touch code. A comment is not prose on a slide, so it is not prose
 * this gate is about.
 *
 * All four comment syntaxes are covered, because a deck is HTML with a <style>
 * and a <script> inside it and an author writes whichever comes to hand.
 */
const COMMENTS_RE = /<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g;
const LINE_COMMENT_RE = /^[ \t]*\/\/[^\n]*/gm;

/** Machine-generated indexes whose separator is fixed by the format itself. */
const FORMAT_FILES = new Set([
  "index.tsv",
  "bun.lock",
  "package-lock.json",
  // The checker's own source carries the characters it matches on, in its
  // constants and in this comment, so it would always report itself.
  "check-dashes.mjs",
  "check-dashes.ts",
]);

/**
 * Decode as UTF-8 strictly. A byte that is not valid UTF-8 becomes U+FFFD, and
 * a cp1252 em dash (0x97) is exactly that, so the substitution would hide the
 * single most likely offender. Re-encoding and comparing proves the round trip
 * failed, which is the only honest answer available for such a file.
 */
function readStrictUtf8(f) {
  const buf = readFileSync(f);
  const src = buf.toString("utf8");
  const reencoded = Buffer.from(src, "utf8");
  if (!reencoded.equals(buf)) {
    let at = 0;
    while (at < buf.length && buf[at] === reencoded[at]) at++;
    const byte = buf[at] === undefined ? 0x00 : buf[at];
    return {
      src,
      problem: `not valid UTF-8 (first bad byte at offset ${at}: 0x${byte.toString(16).padStart(2, "0")})`,
    };
  }
  // A UTF-16 file (Word's other export) is byte-for-byte valid UTF-8 full of
  // NULs, so the round trip passes and every em dash decodes as control bytes.
  // No prose contains NUL, so treat that as unparseable too.
  const nul = src.indexOf("\u0000");
  if (nul !== -1) {
    return {
      src,
      problem:
        `not UTF-8 text (first NUL at offset ${nul}); looks like UTF-16 or a binary file. ` +
        "Word's UTF-16 output hides every dash this way.",
    };
  }
  return { src, problem: null };
}

/**
 * The only rewrite made unattended: an em dash used as a bracket around a
 * trailing aside, e.g. "the answer — pay, grind, or guess" or "a plan (11
 * tracks — 104 stages)". Both become a comma, which cannot change meaning.
 */
function safeFix(line) {
  if (!line.includes(EM) && !line.includes(BAR)) return null;
  const re = /\(([^()]*?)\s[―—]\s([^()]*?)\)/;
  if (re.test(line)) return line.replace(re, (_m, a, b) => `(${a}, ${b})`);
  return null;
}

function scan(src, includeEn) {
  const masked = src
    .replace(COMMENTS_RE, (m) => m.replace(/[^\n]/g, " "))
    .replace(LINE_COMMENT_RE, (m) => m.replace(/[^\n]/g, " "))
    .replace(RANGE_RE, (m) => " ".repeat(m.length))
    .replace(SLASH_PAIR_RE, (m) => " ".repeat(m.length));
  const hits = [];
  let line = 1;
  let col = 1;
  for (let i = 0; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === "\n") {
      line++;
      col = 1;
      continue;
    }
    if (ch === EM || ch === BAR || (includeEn && ch === EN)) {
      const start = src.lastIndexOf("\n", i) + 1;
      const end = src.indexOf("\n", i);
      const text = src.slice(start, end === -1 ? src.length : end).trim().slice(0, 120);
      hits.push({ line, col, char: ch, text, safe: safeFix(text) !== null });
    }
    col++;
  }
  return hits;
}

let total = 0;
let fixed = 0;
const report = [];
const problems = [];
const skipped = [];

for (const f of paths) {
  // Machine-generated indexes whose separator is fixed by the format itself
  // are not prose and cannot be rewritten, so they are skipped loudly rather
  // than scanned: a silent skip would read as "this file is clean", and the
  // clean count below counts only files actually scanned.
  if (FORMAT_FILES.has(path.basename(f))) {
    skipped.push(f);
    continue;
  }

  const { src, problem } = readStrictUtf8(f);
  if (problem) {
    problems.push(`${f}  ${problem}`);
    continue;
  }
  if (!src.includes(EM) && !src.includes(BAR) && !(INCLUDE_EN && src.includes(EN))) continue;

  const hits = scan(src, INCLUDE_EN);
  if (!hits.length) continue;
  total += hits.length;

  // JavaScript and TypeScript are reported but never rewritten: an em dash
  // there is inside a string or a comment the program depends on.
  const noFix = NO_FIX_EXT.has(path.extname(f).toLowerCase());
  let next = src;
  if (FIX && !noFix) {
    for (const line of new Set(hits.map((h) => h.text))) {
      const out = safeFix(line);
      if (out && out !== line) {
        next = next.split(line).join(out);
        fixed++;
      }
    }
    if (next !== src) writeFileSync(f, next);
  }

  const remaining = scan(next, INCLUDE_EN).length;
  report.push(`${f}  ${remaining} remaining${noFix && hits.length ? "  [never auto-fixed: JS/TS source]" : ""}`);
  for (const h of hits) {
    const kind = h.char === EN ? "en dash" : "em dash";
    report.push(`  ${f}:${h.line}:${h.col}  ${kind}${h.safe && !(noFix && FIX) ? "  [auto-fixable]" : ""}`);
    report.push(`    ${h.text}`);
  }
}

if (total === 0) {
  if (problems.length) {
    console.error(`check-dashes: ${problems.length} file(s) could not be read as UTF-8:`);
    for (const p of problems) console.error(`  ${p}`);
    console.error("  Nothing was checked in them. Re-save as UTF-8 (Word: File > Save As > UTF-8).");
    process.exit(2);
  }
  for (const f of skipped) console.log(`skipped (format file, not scanned): ${f}`);
  const scanned = paths.length - skipped.length;
  console.log(
    `clean: no ${INCLUDE_EN ? "em or en" : "em"} dashes in ${scanned} file(s)` +
      (skipped.length ? `, ${skipped.length} skipped as format files` : ""),
  );
  process.exit(0);
}

console.log(
  [...skipped.map((f) => `skipped (format file, not scanned): ${f}`), report.join("\n")].join("\n"),
);
const files = report.filter((l) => l.includes("remaining"));
const left = files.reduce((a, l) => {
  const m = l.match(/(\d+) remaining/);
  return a + (m ? Number(m[1]) : 0);
}, 0);
console.log(`\n${total} finding(s) across ${files.length} file(s)`);
if (FIX) console.log(`auto-fixed ${fixed}; ${left} need a rewrite`);

if (problems.length) {
  console.error(`\ncheck-dashes: ${problems.length} file(s) could not be read as UTF-8:`);
  for (const p of problems) console.error(`  ${p}`);
  console.error("  Nothing was checked in them. Re-save as UTF-8 (Word: File > Save As > UTF-8).");
  process.exit(2);
}
process.exit(1);