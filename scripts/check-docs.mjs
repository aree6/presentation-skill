#!/usr/bin/env bun
/**
 * Table of contents checker for this skill's markdown.
 *
 * Every markdown file in a skill folder has to open with a `## Contents` list,
 * and every heading in the file has to appear in it. Headings drift silently as
 * files are edited, which is how a table of contents becomes a lie: nothing
 * breaks, the links still resolve, and a reader is sent to a section that no
 * longer says what the list promised.
 *
 * What is checked, per file:
 *
 *   1. a `## Contents` heading exists near the top, and the run of list items
 *      under it is read as the contents list;
 *   2. every heading at level 2 or deeper appears in that list, matched on
 *      heading text. A heading is listed if it matches either on its full text
 *      or on its text with a leading number prefix removed, so `## 4. The
 *      light-canvas theming block` satisfies both `[4. The light-canvas
 *      theming block](#...)` and a nested `[The light-canvas theming
 *      block](#...)`. Deep headings under a numbered parent are the reason the
 *      trailing form exists at all;
 *   3. every contents entry that is a link to an anchor in the SAME file
 *      resolves to a real anchor. Anchors are generated the way GitHub
 *      generates them, so this catches a rename even when the heading is still
 *      there under a different slug. Links to other files and to the web are
 *      not in scope and are counted, not checked.
 *
 * What is deliberately NOT checked:
 *
 *   - Headings inside fenced code blocks. A `# from the folder that holds your
 *     deck` line in a shell snippet is a comment, not a heading, and this
 *     folder is full of mermaid, bash, html and css blocks. Getting this wrong
 *     produces a page of false failures, which is the fastest way to teach
 *     people to ignore a checker.
 *   - Setext headings (`Title` underlined with `===`). This folder separates
 *     sections with `---`, and a thematic break under a paragraph line is
 *     indistinguishable from a setext H2 without a real parser. Only ATX
 *     headings are read, which is what every file here uses.
 *   - Explicit `{#id}` anchors. No file in this folder uses them.
 *   - Nesting depth, ordering, and duplicate entries. A flat list with the
 *     right headings in it is a correct contents list.
 *
 * The level 1 heading is exempt: it is the document title, and a contents list
 * that repeats its own title is noise. So is the `## Contents` heading, which
 * cannot list itself.
 *
 * Usage:
 *   bun scripts/check-docs.mjs
 *   bun scripts/check-docs.mjs DESIGN.md MERMAID.md
 *   bun scripts/check-docs.mjs docs/            (a directory expands to its .md)
 *   bun scripts/check-docs.mjs --help
 *
 * With no file arguments, every .md file in the skill folder is checked,
 * recursively, skipping node_modules, dist, build and dot directories.
 *
 * Exit 0 clean, 1 findings, 2 usage error or a file that could not be read as
 * UTF-8.
 *
 * No dependencies. Plain Node, because a checker that needs installing is a
 * checker that does not run.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Only `--help` takes no value, so this parser is boolean only. */
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
    on(name) {
      // Any value that is not an explicit falsy turns the flag on, so
      // --help, --help=1 and --help=yes all work while --help=false does not.
      const v = flags.get(name);
      return v !== undefined && v !== false;
    },
  };
}

/** Extensions this checker will read. Anything else is a usage error. */
const MARKDOWN = new Set([".md", ".markdown"]);

/** Directories that never hold a file anyone maintains by hand. */
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "out", "coverage"]);

/**
 * How far down a file the `## Contents` heading may sit and still count as
 * "near the top". The one file in this folder that has a Contents puts it on
 * line 6. A reader who has to scroll past sixty lines of preamble to find the
 * index is not using the index, so a contents list that late is the defect
 * rather than the fix.
 */
const CONTENTS_MAX_LINE = 60;

/** Distinct items listed per file before the list is truncated. */
const MAX_LISTED = 12;

import {
  ATX,
  FENCE,
  LIST_ITEM,
  LINK,
  trailing,
  baseSlug,
  slug,
  parse,
} from "./lib/markdown.mjs";

/** Every markdown file under a directory, sorted, skipping vendored trees. */
function walk(dir, out) {
  let items;
  try {
    items = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    console.error(`check-docs: cannot read ${dir}: ${err.message}`);
    process.exit(2);
  }
  for (const e of items) {
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    // isDirectory() is false for a symlink, so a symlink loop is not a risk.
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && MARKDOWN.has(path.extname(e.name).toLowerCase())) out.push(full);
  }
  return out;
}

const HELP = [
  "usage: bun scripts/check-docs.mjs [<file-or-dir>...]",
  "",
  "  <file-or-dir>   markdown to check. A directory expands to every .md inside",
  "                  it, recursively. Defaults to every .md in the skill folder.",
  "  --help, -h      print this and exit 0",
  "",
  "Per file it checks that a `## Contents` section sits near the top, that every",
  "heading at level 2 or deeper appears in that list, and that every contents",
  "link to an anchor in the same file resolves to a real heading anchor. A",
  "heading is matched on its full text or on its text with the number prefix",
  "removed, so a nested entry works for a deep heading under a numbered parent.",
  "",
  "Headings inside fenced code blocks are ignored. Setext headings, `{#id}`",
  "anchors, nesting depth, entry order and links to other files are not checked.",
  "",
  "Exit 0 clean, 1 findings, 2 usage error or a file that could not be read as",
  "UTF-8.",
].join("\n");

const opts = parseArgv(process.argv.slice(2));
if (opts.on("help")) {
  console.log(HELP);
  process.exit(0);
}

const SCRIPTS_DIR = path.resolve(fileURLToPath(new URL(".", import.meta.url)));
const ROOT = path.dirname(SCRIPTS_DIR);

// Validate before scanning: a missing path or a non-markdown file is a usage
// error (2), and saying so beats failing later inside readFileSync.
const targets = [];
for (const arg of opts.positional) {
  const full = path.resolve(arg);
  if (!existsSync(full)) {
    console.error(`check-docs: no such file or directory: ${full}`);
    process.exit(2);
  }
  const st = statSync(full);
  if (st.isDirectory()) walk(full, targets);
  else if (st.isFile() && MARKDOWN.has(path.extname(full).toLowerCase())) targets.push(full);
  else {
    console.error(`check-docs: not a markdown file: ${full}`);
    console.error("  this checker reads .md and .markdown, nothing else");
    process.exit(2);
  }
}
if (!targets.length && !opts.positional.length) {
  walk(ROOT, targets);
  if (!targets.length) {
    console.error(`check-docs: no markdown found under ${ROOT}`);
    process.exit(2);
  }
}
if (!targets.length) {
  // An explicit scope that holds no markdown is a usage error, not a silent
  // pass and not a walk of the skill folder: the caller named a directory,
  // and the message names it back rather than a folder nobody passed.
  console.error(
    `check-docs: no markdown found in ${opts.positional.map((a) => path.resolve(a)).join(", ")}`,
  );
  console.error("  an explicit directory expands to every .md inside it, recursively;");
  console.error("  an empty scope checks nothing, so it fails loudly instead of passing silently");
  process.exit(2);
}
targets.sort();

const report = [];
const unreadable = [];
let findings = 0;
let badFiles = 0;

for (const file of targets) {
  // Paths inside the skill folder are shown relative to it, because that is how
  // a person refers to them. A file from outside gets its absolute path rather
  // than a chain of `..` that hides which file it is.
  const rel = path.relative(ROOT, file);
  const name = rel.startsWith("..") || path.isAbsolute(rel) ? file : rel;

  // Decoding is verified, because a file that is not UTF-8 has every byte
  // after the bad one replaced by U+FFFD, which turns real headings into text
  // that matches nothing and would report a clean file as broken. A UTF-16
  // Word export is byte-for-byte valid UTF-8 full of NULs and decodes the same
  // way, so the round trip is checked both ways.
  const buf = readFileSync(file);
  const src = buf.toString("utf8");
  const roundTripped = Buffer.from(src, "utf8").equals(buf);
  if (!roundTripped || src.indexOf("\u0000") !== -1) {
    unreadable.push(name);
    findings++;
    badFiles++;
    report.push(`${name}  1 finding(s)`);
    report.push("  not valid UTF-8, so no heading could be read; re-save as UTF-8");
    continue;
  }

  const { headings, entries, contentsLine } = parse(src);

  // Anchors come from every heading outside a fence, level 1 included, because
  // a contents entry is allowed to point at the document title.
  const anchors = new Set();
  for (const h of headings) slug(h.text, anchors);

  const required = headings.filter((h) => h.level >= 2 && h.line !== contentsLine);
  const listed = new Set(entries.map((e) => baseSlug(e.text)));
  const missing = required.filter(
    (h) => !listed.has(baseSlug(h.text)) && !listed.has(baseSlug(trailing(h.text))),
  );

  // A link that points somewhere other than an anchor in this file is out of
  // scope: another file, or the web. Counted so it is never silently dropped.
  const offsite = [];
  const broken = [];
  for (const e of entries) {
    for (const l of e.links) {
      if (!l.href.startsWith("#") || l.href.length < 2) {
        offsite.push(l.href);
        continue;
      }
      let frag = l.href.slice(1);
      try {
        frag = decodeURIComponent(frag);
      } catch {
        // A fragment that is not valid percent encoding cannot have been
        // produced by a slugger, so it is reported as written.
      }
      if (!anchors.has(frag)) broken.push({ line: e.line, frag, text: l.text });
    }
  }

  // "Near the top" is part of the requirement, not a preference, so a Contents
  // that exists but sits below the window is a finding. It has to be counted
  // here as well as printed below, or the file is reported clean while the
  // message that would have explained it is never reached.
  const lateContents = contentsLine > CONTENTS_MAX_LINE;
  const fileFindings = (contentsLine === -1 || lateContents ? 1 : 0) + missing.length + broken.length;
  if (!fileFindings) {
    const checked = entries.reduce((a, e) => a + e.links.length, 0) - offsite.length;
    report.push(
      `${name}  OK  (${headings.length} heading(s), ${entries.length} entr${entries.length === 1 ? "y" : "ies"}, ` +
        `${checked} anchor link(s) resolve${offsite.length ? `, ${offsite.length} off-file link(s) not checked` : ""})`,
    );
    continue;
  }

  findings += fileFindings;
  badFiles++;
  report.push(`${name}  ${fileFindings} finding(s)`);
  if (contentsLine === -1) {
    report.push(`  no Contents section: no \`## Contents\` heading in the first ${CONTENTS_MAX_LINE} lines`);
  } else if (contentsLine > CONTENTS_MAX_LINE) {
    report.push(`  Contents is on line ${contentsLine}, past the top ${CONTENTS_MAX_LINE} lines`);
  }
  if (missing.length) {
    report.push(`  ${missing.length} heading(s) not in Contents:`);
    for (const h of missing.slice(0, MAX_LISTED)) {
      report.push(`    L${String(h.line).padEnd(5)} ${"h".repeat(h.level)} ${h.text}`);
    }
    if (missing.length > MAX_LISTED) report.push(`    ... and ${missing.length - MAX_LISTED} more`);
  }
  if (broken.length) {
    report.push(`  ${broken.length} Contents link(s) with no matching anchor:`);
    for (const b of broken.slice(0, MAX_LISTED)) {
      report.push(`    L${String(b.line).padEnd(5)} #${b.frag}  [${b.text}]`);
    }
    if (broken.length > MAX_LISTED) report.push(`    ... and ${broken.length - MAX_LISTED} more`);
  }
}

console.log(report.join("\n"));
console.log("");
if (findings) {
  console.log(
    `check-docs: ${findings} finding(s) across ${badFiles} of ${targets.length} file(s)`,
  );
} else {
  console.log(`clean: ${targets.length} file(s), every heading is in a Contents list`);
}
if (unreadable.length) {
  console.error("");
  console.error(`check-docs: ${unreadable.length} file(s) could not be read as UTF-8:`);
  for (const f of unreadable) console.error(`  ${f}`);
  console.error("  Nothing was checked in them. Re-save as UTF-8 (Word: File > Save As > UTF-8).");
  process.exit(2);
}
process.exit(findings ? 1 : 0);
