#!/usr/bin/env bun
/**
 * Single command-line entry point for the presentation skill.
 *
 * The Node scripts in scripts/ already do the work: a viewport and clipping QA
 * matrix, an em dash report, a per-slide word budget, a markdown Contents
 * checker, a visual gate, an icon search, a versioned PDF export, and a slide
 * screenshot capture. Every one of them still runs standalone, every one has
 * --help, and this file changes none of them. It is a front door in front of
 * them. Its job is to let an agent that has never seen this folder run one
 * command, learn what the workflow is, and get a single verdict with the exact
 * command that fixes each failing step printed beside it.
 *
 *   bun cli.mjs                     the overview, same text as --help
 *   bun cli.mjs check [opts]        QA, visuals, docs, density, dashes; blockers first, one verdict
 *   bun cli.mjs test [opts]         same as check: the one command that runs every test
 *   bun cli.mjs new <target.html>   copy templates/template.html, print what is next
 *   bun cli.mjs pdf|qa|dashes|density|docs|shot [args]   forwarded to the script
 *
 * Design rules this file holds itself to:
 *
 *   - Paths resolve from this file, so the command works from any working
 *     directory and a deck path with a space in it is not a special case.
 *   - Nothing is reimplemented. The six scripts stay the only place a check
 *     lives, so a check cannot drift between the standalone script and here.
 *   - Nothing is weakened. A script that exits non-zero makes check exit
 *     non-zero, and there is no flag that skips a step.
 *   - Every failure prints what to do next, as a command that can be pasted.
 *   - Decks are light. This file offers no dark option and does not imply one
 *     exists, because the skill does not have one.
 *
 * Exit 0 clean, 1 a check found problems, 2 usage error or unreadable input.
 * Those are the same three codes the underlying scripts use, so a caller
 * reading only the exit code learns the same thing either way.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI_PATH = fileURLToPath(import.meta.url);
const ROOT = path.dirname(CLI_PATH);
const SCRIPTS = path.join(ROOT, "scripts");
const TEMPLATE = path.join(ROOT, "templates", "template.html");
const NODE = process.execPath;

/** The wrapped scripts, keyed by the subcommand that reaches them. */
const SCRIPT_OF = {
  pdf: "export-pdf.mjs",
  qa: "qa-matrix.mjs",
  dashes: "check-dashes.mjs",
  density: "check-density.mjs",
  docs: "check-docs.mjs",
  shot: "shot.mjs",
  visuals: "check-visuals.mjs",
  motion: "verify-motion.mjs",
  frames: "motion-frames.mjs",
  icons: "find-icon.mjs",
  pattern: "get-pattern.mjs",
  doc: "get-doc.mjs",
  refs: "check-refs.mjs",
};

const SUBCOMMANDS = ["check", "test", "new", "qa", "dashes", "ste", "density", "docs", "pdf", "shot", "visuals", "motion", "frames", "icons", "pattern", "doc", "refs"];

/** One line each, for the overview and for the unknown-command error. */
const SUMMARY_OF = {
  check: "QA, visuals, docs, density and dashes in one pass, blockers first, non-zero on any failure",
  test: "same as check: one command that runs every test, blockers first",
  new: "copy templates/template.html to a target and print the next command",
  qa: "per slide, per viewport: stage scaled, nothing clipped, diagrams legible",
  dashes: "em dash report, with the one safe rewrite behind --fix",
  ste: "ASD-STE100 structural lint over markdown, advisory, and never a gate on a deck",
  density: "word budget per slide, naming the longest paragraphs when over",
  docs: "every markdown file has a Contents list that matches its headings",
  pdf: "versioned PDF: <stem>-vNNN.pdf plus a <stem>-latest.pdf",
  shot: "screenshot slide n, range a-b, or all, plus the QA verdict per slide",
  visuals: "icons in every zone with provenance, no emoji, mermaid vendored and registered, plus a per-slide visual audit",
  motion: "auto-animate pairs, per-line code boxes, fragments, and what a capture sees",
  frames: "capture each auto-animate transition mid-flight and each fragment step, so the motion can be looked at",

  icons: "search the vendored icon library by keyword, with the file and data-icon to use",  icons: "search the vendored icon library by keyword, with the file and data-icon to use",
  pattern: "one gallery pattern's markup with its caption, or the whole menu",
  doc: "one section of a reference file, heading-first",
  refs: "verify the prose claims about the environment still hold",
};

/**
 * Flags that claim the token after them, per script. Used only to work out
 * which bare tokens are free to be read as a deck path; a token already claimed
 * by --out-dir or --words is never mistaken for one.
 */
const VALUE_FLAGS_OF = {
  "export-pdf.mjs": new Set(["deck", "out-dir", "wait"]),
  "qa-matrix.mjs": new Set(["deck", "explain"]),
  "check-density.mjs": new Set(["deck", "words"]),
  "check-dashes.mjs": new Set(),
  "check-docs.mjs": new Set(),
  "shot.mjs": new Set(["deck", "out-dir"]),
  "check-visuals.mjs": new Set(["deck"]),
};

/**
 * Directories that never hold a markdown file a person maintains by hand.
 *
 * `skills` holds vendored third-party skills, byte for byte from upstream, so it
 * is skipped for the same reason check-docs skips it: their prose is not ours to
 * fix. Keep this list identical to the one in scripts/check-docs.mjs, because the
 * comment on markdownUnder below promises the two agree.
 */
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "out", "coverage", "skills"]);

/* ------------------------------------------------------------------ output -- */

/**
 * Every error goes through here, and every error carries a command to run. An
 * agent that hit a failure must never have to guess which flag was wanted.
 */
function die(message, next, extra = []) {
  console.error(`cli.mjs: ${message}`);
  for (const line of extra) console.error(`  ${line}`);
  if (next) console.error(`  next: ${next}`);
  process.exit(2);
}

/** A path as a person would type it: relative when that is readable, absolute otherwise. */
function printable(target) {
  const rel = path.relative(process.cwd(), target);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : target;
}

/** A command line that can be pasted as-is from any working directory. */
const cmd = (args) => `bun ${JSON.stringify(CLI_PATH)}${args ? ` ${args}` : ""}`;

/* ---------------------------------------------------------------- overview -- */

/** The name this package installs itself as, for the short form in help text. */
const BIN = "presentation-skill";

const OVERVIEW = [
  "presentation-skill  build premium HTML slide decks and export them to PDF",
  "",
  "One self-contained .html file per deck. No framework, no build step. Type over",
  "Google Fonts with system fallbacks. Decks ship light (--bg #F3F7F7); the cover",
  "carries a presenter switcher for dark mode and palettes.",
  "",
  "Commands are written below as `presentation-skill <command>`. That name comes",
  "from the bin entry in this package; get it with `bun link` run in this folder,",
  "or call this file directly, which takes the same arguments from any directory:",
  `  bun ${JSON.stringify(CLI_PATH)} <command>`,
  "",
  "First run, if the checks are missing:",
  `  cd ${ROOT} && bun install && bunx playwright install chromium`,
  "",
  "The workflow, in order",
  "  1  new <topic>               copy the template, then write your slides",
  "  2  read SKILL.md, then content_philosophy.md at plan time, then DESIGN.md",
  "  3  write ONE slide, then look at it before writing the next:",
  "     presentation-skill shot <n> --deck <topic>.html --no-qa",
  "     Open that PNG, write down what you see (what the eye lands on, one",
  "     defect with a measurement, the fix), re-shoot, then move on. The",
  "     first look is never the last: a deck written without looking at each",
  "     slide is the template with different words in it.",
  "  4  check --deck <topic>.html   all six checks, one verdict; rerun until green",
  "  5  shot all --deck <topic>.html   then read every PNG: the deck pass, for",
  "     the cross-slide judgements no single slide can make",
  "  6  pdf --deck <topic>.html --here   the shipped PDF beside the deck",
  "     No script can see a stranded icon or an invisible brand mark; only",
  "     looking finds those. shot is for humans, so it is not part of check,",
  "     which stays non-interactive and fast.",
  "Two commands do everything once the deck exists: check (every measurable",
  "gate in one verdict, rerun it until it is green) and shot (pictures for",
  "eyes: n, a-b, or all). icons finds the vendored glyph for any word.",
  "",
  "File map",
  "  SKILL.md                operating instructions, the workflow above in full",
  "  content_philosophy.md     the eight rules a slide obeys, read at plan time",
  "  templates/template.html     scaffold: 7 sample slides, all copied from the gallery",
  "  templates/slides/patterns.html a gallery of every implemented pattern, one",
  "                           per slide, each captioned with when to use it and when not",
  "                          saying when to use it and when not to. A menu, not",
  "                          a template. Open it before choosing a treatment.",
  "  DESIGN.md               tokens, type scale, chrome, treatments, motion",
  "  ICONS.md                inline SVG icons, sizes, the variant traps",
  "  MERMAID.md              vendored Mermaid: CSS patch, readiness, legibility",
  "  icons/index.tsv         the icon tag index, read by the icons command",
  "  scripts/                each check also runs standalone, each with --help",
  "  skills/asd-ste100/     vendored ASD-STE100 sub-skill for sentence-level copy,",
  "                         byte for byte from danyuchn/asd-ste100-skill. Rule 8 of",
  "                         content_philosophy.md says where it applies. Not edited.",
  "",
  "Commands",
  ...SUBCOMMANDS.map((k) => `  ${k.padEnd(8)} ${SUMMARY_OF[k]}`),
  "",
  "  help                    this text. `<command> --help` is one screen.",
  "",
  "Defaults: a deck is $DECK, else this skill's templates/template.html, and the file",
  "chosen is always named in the output. check writes nothing.",
].join("\n");

/* ------------------------------------------------------------------- help -- */

const HELP_OF = {
  check: [
    "usage: presentation-skill check [--deck <file>] [--md <path>] [--words <n>] [--en]",
    `  also: bun ${JSON.stringify(CLI_PATH)} check   (same arguments)`,
    "",
    "  --deck <file>    deck to check; also --deck=<file>. Default $DECK, then",
    "                   this skill's templates/template.html. The choice is printed.",
    "  --md <path>      markdown the docs step reads; repeatable, and a directory",
    "                   is walked recursively. Default: nothing, and the step says",
    "                   so, because a deck's folder is the caller's and a gate that",
    "                   fails on a stranger's speaker-notes.md is a gate people",
    "                   switch off. To read the markdown beside the deck:",
    "                     check --deck d.html --md \"$(dirname d.html)\"",
    "                   That step is the DECK's markdown. This skill's own markdown",
    "                   is the `docs` command, which walks the whole folder.",
    "",
    "  --words <n>      density cap in words per slide, forwarded as is.",
    "  --en             also flag en dashes. Off by default.",
    "  --help, -h       print this and exit 0",
    "",
    "Six steps, blockers first, then one verdict:",
    "  1  qa       every slide at four viewports: stage scaled, nothing clipped by",
    "              the stage, every diagram over 14px projected. Chromium. If the",
    "              deck does not render, nothing below matters.",
    "  2  visuals  icons in every zone with provenance, no emoji, and the",
    "              Mermaid vendoring contract when a diagram is present. Text only.",
    "  3  motion   drives the deck with the keyboard and show(n): every auto-animate",
    "              pair ran and settled, every code block split into per-line boxes,",
    "              no unchanged line reprinted, one press per fragment, and a",
    "              capture that sees every fragment. Chromium.",
    "  4  docs     every markdown file in scope has a Contents list matching its",
    "              headings. Text only; skipped unless --md names files.",
    "  5  density  every slide within the word cap, and the longest paragraphs",
    "              named when a slide is over. Chromium. A judgement call.",
    "  6  dashes   no em dashes in the deck. Text only. Cosmetic, so last: a deck",
    "              with a broken slide should not wait on punctuation to hear it.",
    "",
    "All six run even after one fails. None of them reads another's result, so",
    "stopping early would hide findings rather than fix them.",
    "",
    "check writes nothing, and does not check this skill's own markdown. To do",
    "that: presentation-skill docs",
    "",
    "Exit 0 all six clean, 1 a step found problems, 2 a step could not run.",
  ].join("\n"),

  new: [
    "usage: presentation-skill new <topic> | <target.html> [--force]",
    `  also: bun ${JSON.stringify(CLI_PATH)} new   (same arguments)`,
    "",
    "  <topic>         a bare name writes decks/<topic>/<topic>.html and",
    "                  creates the folder's images/ and images/icons/. This is",
    "                  the default shape: one HTML, one PDF, one images folder.",
    "                  With no argument the topic is \"deck\".",
    "  <target.html>   an explicit path instead, for a deck that does not follow",
    "                  the default shape. images/ and images/icons/ are still",
    "                  created beside it.",
    "  --force         overwrite an existing file. Off by default.",
    "  --help, -h      print this and exit 0",
    "",
    "Copies templates/template.html. One substitution only: the skill-asset root,",
    "rewritten to the correct relative path from the new deck, so the icon modal",
    "resolves wherever the deck lives. No placeholder",
    "is filled in, and the template itself is never edited, so the same starting",
    "point is there for the next deck. The copy lands through a temporary file,",
    "so a failure never leaves half a deck behind and --force cannot destroy an",
    "existing one.",
    "",
    "The copy has 7 sample slides, every one of them copied out of",
    "templates/slides/patterns.html, which is where treatment markup lives. Replace the",
    "<section class=\"slide\"> elements with yours — never start from a blank",
    "file, which is how the grid, the rail and the readiness contract get rebuilt",
    "wrong. Keep the template's relabel()",
    "and window.show(n), then run the check command printed at the end.",
    "",
    "Every word of copy in those sample slides is fictional, about an invented",
    "clinic called Meridian, with invented figures and an invented speaker. It is",
    "here to show the treatments. Replace all of it; a deck that ships one",
    "surviving sample name is a deck about a company that does not exist.",
    "",
    "The copy carries data-diagrams=\"none\" on <body>, which waives the",
    "zero-diagram gate while the sample slides are still the scaffold's own",
    "treatments. The waiver is printed on every check. Delete both attributes once",
    "your deck carries a real diagram, or the gate keeps passing a deck it never",
    "judged.",
    "",
    "Exit 0 written, 2 refused or the template is missing.",
  ].join("\n"),

  motion: [
    "usage: presentation-skill motion [<deck.html>] [--deck <file>]",
    `  also: bun ${JSON.stringify(CLI_PATH)} motion   (same arguments)`,
    "",
    "Drives the deck and reads what its motion did, because every failure it",
    "looks for is silent: a screenshot, a PDF and a word count all look fine when",
    "the morph does not run. Prints each finding whether or not it passed.",
    "",
    "A deck with no data-auto-animate and no .fragment says so and passes.",
    "",
    "Exit 0 clean, 1 findings, 2 usage error.",
  ].join("\n"),

  frames: [
    "usage: presentation-skill frames [<deck.html>] [--deck <file>]",
    `  also: bun ${JSON.stringify(CLI_PATH)} frames   (same arguments)`,
    "",
    "Writes <deck-dir>/<stem>-motion/: the outgoing slide, the incoming slide at",
    "rest, the same transition caught at 40/150/280/420ms, and one frame per",
    "fragment step. A morph that measures correctly and looks wrong is still",
    "wrong, and no assertion can see that.",
    "",
    "Exit 0 clean, 2 usage error.",
  ].join("\n"),

  qa: [
    "usage: presentation-skill qa [<deck.html>] [flags]",
    `  also: bun ${JSON.stringify(CLI_PATH)} qa   (same arguments)`,
    "",
    "Per slide, at 1920x950, 1600x900, 1440x900 and 1280x720: the stage scaled,",
    "no document scroll, and nothing clipped by the stage's overflow:hidden box.",
    "Every rendered diagram is measured for projected type size, below 14px is a",
    "failure, and slide body word counts are reported rather than failed.",
    "",
    "Forwarded to scripts/qa-matrix.mjs, which has the full flag list:",
    "  presentation-skill qa --help",
    "",
    "A bare path is accepted as the deck, so `qa deck.html` and",
    "`qa --deck deck.html` are the same command. Default $DECK, then the",
    "template. Exit 0 green, 1 failures, 2 usage error, as the script returns it.",
  ].join("\n"),

  dashes: [
    "usage: presentation-skill dashes <file>... [--en] [--fix]",
    `  also: bun ${JSON.stringify(CLI_PATH)} dashes   (same arguments)`,
    "",
    "Em dashes read as filler and usually mark a sentence doing two jobs. Report",
    "mode is the default, because prose is not safely machine-fixable. --fix",
    "rewrites only the one case that cannot change meaning, an em dash bracketing",
    "an aside, and never touches JS or TS source.",
    "",
    "With no file given, the default deck is scanned and the choice is printed.",
    "",
    "Forwarded to scripts/check-dashes.mjs, which has the full flag list:",
    "  presentation-skill dashes --help",
    "",
    "Exit 0 clean, 1 violations, 2 usage error or a file that is not UTF-8.",
  ].join("\n"),

  ste: [
    "usage: presentation-skill ste <file.md>... [--baseline <n>] [--disable <rules>] [--json]",
    "       presentation-skill ste --selftest",
    `  also: bun ${JSON.stringify(CLI_PATH)} ste   (same arguments)`,
    "",
    "Runs the vendored ASD-STE100 linter over markdown. It reports semicolons,",
    "sentence length, a short list of soft phrasal verbs, nominalisation,",
    "marketing adjectives, synonym rotation, dangling conjunctions in list items,",
    "passive voice and compound tenses.",
    "",
    "This is NOT one of the six steps in check, on purpose. check's contract is",
    "Bun and Playwright, and this command is the only thing here that needs an",
    "interpreter outside Bun. It is also a judgement, not a measurement: the same",
    "sentence can be right for a caption and flat for a title, which is why",
    "content_philosophy.md rule 8 scopes it per text rather than across the deck.",
    "",
    "It never flags a hedge, because a hedge is content, and it never claims",
    "compliance with ASD's official word dictionary, which the standard does not",
    "permit redistributing. Read its findings and decide.",
    "",
    "Expect findings if you point this at the skill's own prose. The rule tables",
    "quote the patterns they forbid, so 'spin up', 'seamless' and 'has paid' all",
    "report, and a regex linter cannot tell a quoted example from a live one. The",
    "vendored skill says the same about its own README. Read those as evidence",
    "the rules work, not as defects.",
    "",
    "  --baseline <n>   pass unless hard findings exceed n, for adopting on prose",
    "                   that already exists",
    "  --disable <list> silence named rules, comma separated",
    "  --json           structured output",
    "  --selftest       assert the linter itself still works, no file needed",
    "",
    "Forwarded to skills/asd-ste100/scripts/ste-lint.py, which has the full list:",
    "  python3 skills/asd-ste100/scripts/ste-lint.py --help",
    "",
    "Exit 0 clean, 1 hard findings, 2 usage error, unreadable input, or no python3.",
    "Nothing here is a gate on the deck: read the report, then change the copy or",
    "keep it and say why.",
  ].join("\n"),

  density: [
    "usage: presentation-skill density [<deck.html>] [--words <n>] [--json]",
    `  also: bun ${JSON.stringify(CLI_PATH)} density   (same arguments)`,
    "",
    "Loads the deck in Chromium, walks it slide by slide, and counts the words",
    "and characters actually painted, excluding chrome: the topbar, the footer",
    "label, the slide number, the screen reader live region, anything inside an",
    "svg, and any aria-hidden subtree. The takeaway band is counted.",
    "",
    "A slide over the cap is a failure, and the report names the longest blocks of",
    "text on it. There is no --fix and never will be one: condensing copy is a",
    "judgement about which argument survives.",
    "",
    "Forwarded to scripts/check-density.mjs, which has the full flag list:",
    "  presentation-skill density --help",
    "",
    "A bare path is accepted as the deck. Default $DECK, then templates/template.html.",
    "Exit 0 within cap, 1 over cap, 2 usage error, as returned by the script.",
  ].join("\n"),

  docs: [
    "usage: presentation-skill docs [<file-or-dir>...]",
    `  also: bun ${JSON.stringify(CLI_PATH)} docs   (same arguments)`,
    "",
    "Per markdown file: a Contents section near the top, every heading at level 2",
    "or deeper listed in it, and every contents link to an anchor in the same file",
    "resolving to a real heading. Headings inside fenced code blocks are ignored.",
    "",
    "With no path given, every .md in this skill folder is checked, recursively,",
    "skipping node_modules, dist, build, out, coverage, skills and dot directories.",
    "skills is skipped because it holds vendored third-party skills whose prose is",
    "not this skill's to fix.",
    "",
    "Forwarded to scripts/check-docs.mjs, which has the full details:",
    "  presentation-skill docs --help",
    "",
    "Exit 0 clean, 1 findings, 2 usage error or a file that is not UTF-8.",
  ].join("\n"),

  pdf: [
    "usage: presentation-skill pdf [<deck.html>] [--out-dir <dir>] [--wait <ms>]",
    `  also: bun ${JSON.stringify(CLI_PATH)} pdf   (same arguments)`,
    "",
    "Renders every slide at 1920x1080 and writes <stem>-vNNN.pdf plus a",
    "<stem>-latest.pdf copy. Waits on window.__deckReady and document.fonts.ready",
    "before capturing, and fails if the deck threw a page error or drew a Mermaid",
    "error card, because both look like a clean export and are not.",
    "",
    "With no deck given, the one .html file in the current directory is used, and",
    "several .html files there is a usage error rather than a silent pick. PDFs",
    "land in ./presentations. To choose:",
    "  presentation-skill pdf deck.html --out-dir ./presentations",
    "",
    "Forwarded to scripts/export-pdf.mjs, which has the full flag list:",
    "  presentation-skill pdf --help",
    "",
    "Exit 0 ok, 1 a page error or a diagram error card, 2 usage error.",
  ].join("\n"),

  shot: [
    "usage: presentation-skill shot <n | a-b | all> [<deck.html>] [--out-dir <dir>] [--no-qa] [--context]",
    `  also: bun ${JSON.stringify(CLI_PATH)} shot   (same arguments)`,
    "",
    "Captures slide n, slides a through b, or every slide as PNGs at 1920x1080.",
    "The deck path resolves from the current directory, so from the skill root",
    "name it whole: shot all --deck decks/<topic>/<topic>.html. A bare",
    "shot all --deck <topic>.html only works with the deck folder as cwd.",
    "Waits on window.__deckReady exactly like qa, hides .edge/.nav chrome",
    "exactly like pdf, and prints one absolute path per line plus the QA",
    "verdict for each captured slide. PNGs land in <deck-dir>/<stem>-shots.",
    "",
    "--no-qa skips that QA verdict, which walks the WHOLE deck at four",
    "viewports. Use it when reviewing one slide at a time as you build.",
    "",
    "--context widens a single <n> to its neighbours: captures n-1 and n+1,",
    "writes a side-by-side s<n>-context.html, and prints the live rhythm",
    "line with the deck-level variety advisories.",
    "",
    "For humans, not for check: check stays non-interactive and fast, so shot",
    "is never one of its steps. Run it and look at the pictures.",
    "",
    "Forwarded to scripts/shot.mjs, which has the full flag list:",
    "  presentation-skill shot --help",
    "",
    "Exit 0 captures written, 2 usage error or a deck that cannot be driven.",
  ].join("\n"),

  visuals: [
    "usage: presentation-skill visuals [<deck.html>] [--deck <file>]",
    `  also: bun ${JSON.stringify(CLI_PATH)} visuals   (same arguments)`,
    "",
    "Static visual gate, no browser: every slide carries inline SVG, every",
    "icon zone (.tagline, stat tile .hd, .takeaway)",
    "carries its glyph, every slide names its rail icon (data-rail, Phosphor",
    "only, bytes verified against the per-deck registry), every inlined icon",
    "data-icon, no emoji sits in slide copy, every deck carries minimum one",
    "Mermaid diagram, no table ships flat, and a deck that uses Mermaid",
    "vendors the library next to the deck and registers the render.",
    "",
    "Forwarded to scripts/check-visuals.mjs, which has the full flag list:",
    "  presentation-skill visuals --help",
    "",
    "A bare path is accepted as the deck. Default $DECK, then templates/template.html.",
    "Exit 0 clean, 1 findings, 2 usage error, as returned by the script.",
  ].join("\n"),

  icons: [
    "usage: presentation-skill icons <word>... [--limit <n>] [--emit]",
    "       presentation-skill icons build",
    `  also: bun ${JSON.stringify(CLI_PATH)} icons   (same arguments)`,
    "",
    "Search the vendored icon library by keyword and print the exact file to",
    "copy plus the data-icon value, with the ICONS.md variant rule applied.",
    "Every word must match somewhere in the name, title or tags.",
    "",
    "  --emit         print the finished <svg> markup for each match, ready to",
    "                 paste, instead of the file path. Use it: check-visuals.mjs",
    "                 compares a deck's inline glyph with the library byte for",
    "                 byte and fails a redrawn one.",
    "",
    "`icons build` regenerates the browser-side search data the in-deck icon",
    "modal reads (assets/icon-index.js plus assets/icon-files/). Run it again",
    "after adding icons; both are generated, never committed.",
    "",
    "Forwarded to scripts/find-icon.mjs, which documents any further flags:",
    "  bun scripts/find-icon.mjs --help",
    "",
    "Exit 0 (even when nothing matches), 2 usage error.",
  ].join("\n"),

  pattern: [
    "usage: presentation-skill pattern <n> [--css] | --list | --find <words> [--full-icons] [--covers]",
    `  also: bun ${JSON.stringify(CLI_PATH)} pattern   (same arguments)`,
    "",
    "Prints one pattern from the gallery (templates/slides/patterns.html): its",
    "number, its name, and its own use-when / not-for caption, then the markup.",
    "The caption prints with the markup on purpose — in the gallery it sits",
    "~150 lines below the slide it describes.",
    "",
    "  <n>            one pattern's markup, 1-based",
    "  --css          with <n>: also print the gallery CSS the markup needs,",
    "                 ready to paste (minus what the template already has)",
    "  --list         every pattern with its caption (the menu)",
    "  --find <words> the menu, filtered to captions matching a word",
    "  --full-icons   keep the inline SVG paths (they collapse by default)",
    "  --covers       read templates/slides/covers.html instead",
    "",
    "Inline icons collapse to <svg class=\"ph\" data-icon=\"...\"> because the",
    "deck sources its glyphs from icons/ anyway. Prints to stdout.",
  ].join("\n"),

  doc: [
    "usage: presentation-skill doc <file> <heading>",
    "       presentation-skill doc --list [<file>]",
    `  also: bun ${JSON.stringify(CLI_PATH)} doc   (same arguments)`,
    "",
    "Prints one section of a reference file, heading-first, through its",
    "sub-headings. Number prefixes are ignored, so 7.1.1 and \"Flowchart\" both",
    "find the Flowchart section.",
    "",
    "  files: SKILL.md  DESIGN.md  MERMAID.md  ICONS.md  content_philosophy.md",
    "",
    "Refuses with the closest three headings rather than guessing: a section",
    "printed on a near miss is worse than no section, because the caller cannot",
    "tell it apart from the right one.",
  ].join("\n"),
};

/* ----------------------------------------------------------------- helpers -- */

/** Run a wrapped script with stdio inherited, so it is indistinguishable from a direct run. */
function runScript(script, args) {
  const res = spawnSync(NODE, [path.join(SCRIPTS, script), ...args], { stdio: "inherit" });
  if (res.error) return { code: 127, note: `could not start runtime: ${res.error.message}` };
  if (res.signal) return { code: 128, note: `killed by ${res.signal}` };
  return { code: typeof res.status === "number" ? res.status : 1, note: "" };
}

/** What a non-zero exit from a wrapped script means, in that script's own terms. */
function explain(code, note) {
  if (code === 0) return "clean";
  if (code === 1) return "FAIL: findings, listed above";
  if (code === 2) return "could not run: usage error or unreadable input, see above";
  if (code === 127) return `ERROR: ${note}`;
  if (code === 128) return `ERROR: ${note}`;
  return `ERROR: the script did not finish (exit ${code}), most likely a missing dependency`;
}

function isReadableFile(p) {
  try {
    return fs.statSync(p).isFile() && (fs.accessSync(p, fs.constants.R_OK), true);
  } catch {
    return false;
  }
}

/** Every .md directly inside a directory, which is the default docs scope. */
function markdownBeside(dir) {
  let items;
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return items
    .filter((e) => e.isFile() && !e.name.startsWith(".") && /\.(md|markdown)$/i.test(e.name))
    .map((e) => path.join(dir, e.name))
    .sort();
}

/**
 * Every .md under a directory, recursively, for an explicit --md. The skip list
 * is the same one check-docs uses, so an explicit directory and check-docs'
 * own walk agree on what is in scope.
 */
function markdownUnder(dir, out = []) {
  let items;
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of items) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) markdownUnder(full, out);
    } else if (e.isFile() && /\.(md|markdown)$/i.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * The deck to work on, resolved the way qa-matrix and check-density resolve it:
 * an explicit path, then $DECK, then this skill's template. Always named in the
 * output, because a check that ran against a file the caller did not choose is
 * a check whose result cannot be trusted.
 */
function resolveDeck(explicit) {
  return path.resolve(explicit || process.env.DECK || TEMPLATE);
}

/** How the deck was chosen, for the one line that has to say so out loud. */
function deckWhy(explicit) {
  return explicit ? "given" : process.env.DECK ? "$DECK" : "default, templates/template.html";
}

function requireDeck(explicit) {
  const deck = resolveDeck(explicit);
  if (!fs.existsSync(deck)) {
    die(
      `no such deck: ${deck}`,
      cmd(`new ${JSON.stringify(printable(deck))}`),
      [
        `or point at a deck that exists: ${cmd("check --deck <file.html>")}`,
        `  (scaffold one with: ${cmd("new")}, list what is here with: ls *.html)`,
      ],
    );
  }
  if (!isReadableFile(deck)) {
    die(`not a readable file: ${deck}`, cmd("check --deck <file.html>"), [
      "a directory is not a deck, and an unreadable file cannot be rendered.",
    ]);
  }
  return deck;
}

/**
 * The indices of the tokens in a forwarded argv that no value flag has already
 * claimed. Mirrors the rule check-density documents: a value-taking flag claims
 * its own token, in argv order, so `--out-dir out` never leaves `out` looking
 * like a deck path. Indices rather than values, so removing one later cannot
 * remove a duplicate by accident.
 */
function freePositions(script, argv) {
  const takes = VALUE_FLAGS_OF[script] || new Set();
  const free = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h") continue;
    if (a.startsWith("--") && a.length > 2) {
      if (a.indexOf("=") === -1 && takes.has(a.slice(2))) i++;
      continue;
    }
    free.push(i);
  }
  return free;
}

const hasFlag = (argv, name) =>
  argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));

/** The value of a flag, from --flag=v or the token after --flag. */
function flagValue(argv, name) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === `--${name}`) {
      const next = argv[i + 1];
      if (next !== undefined && !(next.startsWith("--") && next.length > 2)) return next;
      return "";
    }
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return "";
}

/* ------------------------------------------------------------ passthrough -- */

/**
 * Hand a command to its script with the arguments the caller gave. A bare path
 * is promoted to --deck for the three deck commands, because `qa deck.html` is
 * what everyone types, and the scripts on their own ignore a bare token there,
 * which would quietly check a different file than the one named.
 */
function passthrough(key, argv) {
  const script = SCRIPT_OF[key];
  let out = argv.slice();

  if (key === "docs") {
    if (!out.length) console.log(`docs: no path given, walking every .md under ${ROOT}`);
    // check-docs validates all of this itself, but its message is only "no such
    // file or directory: x" or "not a markdown file: x", and an agent reading
    // either has to guess the flag it wanted. The script still validates after
    // this, so nothing is decided here that the script would not decide too.
    for (const i of freePositions(script, out)) {
      const full = path.resolve(out[i]);
      if (!fs.existsSync(full)) {
        die(
          `no such file or directory: ${full}`,
          cmd(`docs ${JSON.stringify(printable(full))}`),
          [
            "this checker reads .md and .markdown, and expands a directory to every",
            ".md inside it. List the candidates:",
            "  ls *.md",
            "or check this skill's own markdown:",
            cmd("docs"),
          ],
        );
      }
      if (!fs.statSync(full).isDirectory() && !/\.(md|markdown)$/i.test(full)) {
        die(
          `not a markdown file: ${full}`,
          cmd("docs"),
          [
            "this checker reads .md and .markdown, nothing else.",
            "to check a deck's em dashes instead:",
            cmd("dashes"),
          ],
        );
      }
    }
    process.exit(runScript(script, out).code);
  }

  if (key === "dashes") {
    // `--deck x` is what everyone types and check-dashes has no such flag, so it
    // would be ignored while the token after it happened to be scanned as a
    // file. That works by accident. Turning it into the positional it means
    // makes it work on purpose, and the file list is then known exactly. This
    // runs before the default is considered, or `--deck x` would be read as "no
    // file given" and the default deck would be scanned as well.
    const viaDeck = flagValue(out, "deck");
    if (viaDeck) {
      const stripped = [];
      for (let i = 0; i < out.length; i++) {
        if (out[i] === "--deck" && out[i + 1] === viaDeck) i++;
        else if (out[i] !== `--deck=${viaDeck}`) stripped.push(out[i]);
      }
      out = stripped;
      out.push(viaDeck);
    }
    // check-dashes takes files and has no default of its own, so an empty call
    // would exit 2 with nothing to act on. The default deck is the sensible
    // answer here, and the choice is printed rather than assumed.
    if (!freePositions(script, out).length) {
      const fallback = requireDeck(null);
      console.log(`deck: ${fallback}  (${deckWhy(null)}), no file given to dashes`);
      out.unshift(fallback);
    }
    // The script validates these itself and says so, but its message is only
    // "no such file: x", and an agent that reads that has to guess the flag it
    // wanted. The script still runs the full validation after this.
    for (const i of freePositions(script, out)) {
      const full = path.resolve(out[i]);
      if (!fs.existsSync(full) || !isReadableFile(full)) {
        die(
          `no such file to scan: ${full}`,
          cmd(`dashes ${JSON.stringify(printable(full))}`),
          ["list what is here:", "  ls *.html *.md", "or scan the default deck:", cmd("dashes")],
        );
      }
    }
    console.log(`dashes: scanning ${freePositions(script, out).map((i) => out[i]).join(", ")}`);
    process.exit(runScript(script, out).code);
  }

  // qa, density and pdf all take a deck.
  const given = hasFlag(out, "deck");
  const bare = given ? [] : freePositions(script, out);
  if (bare.length > 1) {
    die(
      `${key} takes one deck, and got ${bare.length}: ${bare
        .map((i) => JSON.stringify(out[i]))
        .join(", ")}`,
      cmd(`${key} --deck ${JSON.stringify(out[bare[0]])}`),
      [
        "nothing was read or written. If one of those was a value rather than a",
        `deck, give it as a flag: ${cmd(`${key} --out-dir <dir>`)}`,
      ],
    );
  }

  let deck = given ? flagValue(out, "deck") : "";
  if (!deck && bare.length === 1) {
    deck = out[bare[0]];
    out.splice(bare[0], 1);
  }

  if (deck) {
    const full = path.resolve(deck);
    if (!fs.existsSync(full)) {
      die(
        `no such deck: ${full}`,
        cmd(`new ${JSON.stringify(printable(full))}`),
        [`or point at a deck that exists: ${cmd(`${key} --deck <file.html>`)}`],
      );
    }
    if (!isReadableFile(full)) {
      die(`not a readable file: ${full}`, cmd(`${key} --deck <file.html>`), [
        "a directory is not a deck, and an unreadable file cannot be rendered.",
      ]);
    }
    console.log(`deck: ${full}  (given)`);
    // The = form, appended last: all three parsers keep the last one set, so it
    // wins over a dangling `--deck` with nothing after it.
    out.push(`--deck=${full}`);
  } else if (key === "pdf") {
    // export-pdf has its own rule and it is a good one: the single .html in the
    // cwd, and a refusal to guess between several.
    if (process.env.DECK) {
      console.log(`deck: ${path.resolve(process.env.DECK)}  ($DECK)`);
    } else {
      console.log(`pdf: no deck given, using the one .html file in ${process.cwd()}`);
      console.log(
        "  export-pdf treats several .html files there as a usage error rather than a",
        "  silent guess, so pass one: presentation-skill pdf deck.html",
      );
    }
  } else {
    const fallback = requireDeck(undefined);
    console.log(`deck: ${fallback}  (${deckWhy(undefined)})`);
    out.push(`--deck=${fallback}`);
  }

  process.exit(runScript(script, out).code);
}

/* --------------------------------------------------------------------- ste -- */

/**
 * The vendored ASD-STE100 linter, behind the same front door as everything else.
 *
 * Deliberately not one of the six steps in check, for two reasons that both
 * matter. check's contract is Bun and Playwright, and a checker needing something
 * the reader may not have installed is a checker that does not run. And ste-lint
 * judges structure, where a deck's copy is a judgement: the same sentence can be
 * correct for a caption and flat for an assertion title, which is exactly why
 * content_philosophy.md rule 8 scopes this per text instead of across the deck.
 *
 * So this reports and never gates, and it says so in its own output rather than
 * leaving the caller to assume it is one of the gates. A missing python3 exits 2
 * rather than 0: exiting clean here would report a deck that nothing ever read.
 */
function runSte(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP_OF.ste);
    return 0;
  }

  const LINTER = path.join(ROOT, "skills", "asd-ste100", "scripts", "ste-lint.py");
  if (!fs.existsSync(LINTER)) {
    die(`the vendored linter is missing: ${LINTER}`, "git clone https://github.com/danyuchn/asd-ste100-skill", [
      "skills/asd-ste100/ is a byte-for-byte copy of that repository's tracked",
      "files. Replacing the folder with a fresh clone restores the linter.",
    ]);
  }

  // Probed before anything is parsed or run, so the interpreter question is
  // answered before the caller starts fixing findings that were never measured.
  const py = ["python3", "python"].find((bin) => {
    const probe = spawnSync(bin, ["--version"], { stdio: "ignore" });
    return !probe.error && probe.status === 0;
  });
  if (!py) {
    die("no python3 on PATH, so nothing was linted", `python3 ${printable(LINTER)} <file.md>`, [
      "this is the only command in the skill that needs an interpreter outside Bun,",
      "which is why it is not one of the six steps in check.",
      "Install python3, or read the rules instead:",
      `  ${cmd("doc content_philosophy.md 'Sentence-Level Clarity'")}`,
    ]);
  }

  // ste-lint.py reads a flag value as the token after it, so a value flag has to
  // claim that token here too or a path-shaped number would be read as a file.
  const VALUE_FLAGS = new Set(["--baseline", "--disable"]);
  const forward = [];
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      die("ste takes nothing after --", cmd("ste --help"), [
        "every flag this command understands is listed there.",
      ]);
    }
    if (a.startsWith("--") && a.length > 2) {
      forward.push(a);
      if (VALUE_FLAGS.has(a) && !a.includes("=")) {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("--")) {
          die(`${a} needs a value and got none`, cmd(`ste <file.md> ${a} <value>`));
        }
        forward.push(next);
        i++;
      }
      continue;
    }
    const full = path.resolve(a);
    if (!fs.existsSync(full)) {
      die(`no such file to lint: ${full}`, cmd(`ste ${JSON.stringify(printable(full))}`), [
        "ste reads markdown. The usual first target is a deck's plan:",
        "  presentation-skill ste decks/<topic>/plan.md",
      ]);
    }
    if (!isReadableFile(full)) {
      die(`not a readable file: ${full}`, cmd("ste <file.md>..."), [
        "a directory is not markdown. Point at the files inside it instead.",
      ]);
    }
    files.push(full);
  }

  if (!files.length && !forward.includes("--selftest")) {
    die("ste needs at least one file, and got none", cmd(`ste ${JSON.stringify(printable(path.join("decks", "<topic>", "plan.md")))}`), [
      "there is no default scope on purpose: linting every markdown file in this",
      "skill would report hundreds of findings in prose that is not a deck's, and",
      "linting the whole folder would drag in the vendored sub-skills.",
      "To check this skill's own markdown contents instead:",
      cmd("docs"),
    ]);
  }

  console.log("ste: structural findings only. It never flags a hedge, because a hedge is content.");
  console.log("ste: advisory. Not one of the six steps in check. Read it and decide.\n");

  const res = spawnSync(py, [LINTER, ...forward, ...files], { stdio: "inherit" });
  if (res.error) {
    die(`could not start ${py}: ${res.error.message}`, cmd("ste <file.md>..."), [
      `run it by hand to see the same thing: ${py} ${printable(LINTER)} <file.md>`,
    ]);
  }
  if (res.signal) {
    die(`the linter was killed by ${res.signal}`, cmd("ste <file.md>..."));
  }
  return typeof res.status === "number" ? res.status : 1;
}

/* ------------------------------------------------------------------- shot -- */

/**
 * Screenshot capture. Separate from passthrough because the positional is a
 * slide spec, not a deck: `shot 5` names slide 5, and a bare deck path is the
 * second positional at most. Anything that is not exactly one spec refuses
 * with the valid forms, exit 2.
 */
function runShot(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP_OF.shot);
    return 0;
  }
  let deckFlag = "";
  let outDir = "";
  let noQa = false;
  let context = false;
  const bare = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--deck" || a === "--out-dir") {
      const next = argv[i + 1];
      if (next === undefined || (next.startsWith("--") && next.length > 2) || next === "-h") {
        die(
          `${a} needs a value and got none`,
          a === "--deck" ? cmd("shot all --deck deck.html") : cmd("shot all --out-dir ./shots"),
        );
      }
      if (a === "--deck") deckFlag = next;
      else outDir = next;
      i++;
    } else if (a.startsWith("--deck=")) {
      deckFlag = a.slice("--deck=".length);
    } else if (a.startsWith("--out-dir=")) {
      outDir = a.slice("--out-dir=".length);
    } else if (a === "--no-qa" || a.startsWith("--no-qa=")) {
      // Forwards to shot.mjs, which skips the whole-deck QA pass. The pass is
      // the right thing beside `shot all` and pure overhead beside a per-slide
      // review loop, which shoots one slide and looks at the picture.
      noQa = true;
    } else if (a === "--context" || a.startsWith("--context=")) {
      // Forwards to shot.mjs, which widens a single slide to its neighbours
      // plus the live rhythm line. Single slide only; ranges carry context.
      context = true;
    } else if (a.startsWith("--")) {
      die(`shot does not take ${a}`, `bun ${CLI_PATH} shot --help`, [
        "shot takes a slide spec, --deck, --out-dir, --no-qa, --context and --help, and nothing else.",
      ]);
    } else {
      bare.push(a);
    }
  }

  const isSpec = (t) => /^(all|\d+|\d+-\d+)$/i.test(t);
  const specs = bare.filter(isSpec);
  const decks = bare.filter((t) => !isSpec(t));
  if (specs.length !== 1 || decks.length > 1) {
    die(
      `shot takes one slide spec${decks.length > 1 ? " and one deck" : ""}, and got: ${bare.map((b) => JSON.stringify(b)).join(", ") || "nothing"}`,
      cmd("shot all --deck deck.html"),
      [
        "valid forms: shot <n> | shot <a-b> | shot all   (e.g. shot 5, shot 1-10, shot all)",
        "a bare path is the deck, so `shot 5 deck.html` captures slide 5 of deck.html.",
      ],
    );
  }

  const fwd = [specs[0]];
  if (decks.length === 1) {
    const full = path.resolve(decks[0]);
    if (!fs.existsSync(full)) {
      die(
        `no such deck: ${full}`,
        cmd(`new ${JSON.stringify(printable(full))}`),
        [`or point at a deck that exists: ${cmd("shot all --deck <file.html>")}`],
      );
    }
    if (!isReadableFile(full)) {
      die(`not a readable file: ${full}`, cmd("shot all --deck <file.html>"), [
        "a directory is not a deck, and an unreadable file cannot be rendered.",
      ]);
    }
    console.log(`deck: ${full}  (given)`);
    fwd.push(`--deck=${full}`);
  } else if (deckFlag) {
    const full = path.resolve(deckFlag);
    if (!fs.existsSync(full)) {
      die(
        `no such deck: ${full}`,
        cmd(`new ${JSON.stringify(printable(full))}`),
        [`or point at a deck that exists: ${cmd("shot all --deck <file.html>")}`],
      );
    }
    if (!isReadableFile(full)) {
      die(`not a readable file: ${full}`, cmd("shot all --deck <file.html>"), [
        "a directory is not a deck, and an unreadable file cannot be rendered.",
      ]);
    }
    console.log(`deck: ${full}  (given)`);
    fwd.push(`--deck=${full}`);
  } else {
    const fallback = requireDeck(undefined);
    console.log(`deck: ${fallback}  (${deckWhy(undefined)})`);
    fwd.push(`--deck=${fallback}`);
  }
  if (outDir) fwd.push(`--out-dir=${path.resolve(outDir)}`);
  if (noQa) fwd.push("--no-qa");
  if (context) fwd.push("--context");

  process.exit(runScript(SCRIPT_OF.shot, fwd).code);
}

/* ------------------------------------------------------------------- check -- */

const CHECK_HELP = HELP_OF.check;

function parseCheck(argv) {
  const VALUE = new Set(["deck", "words", "md"]);
  const BOOL = new Set(["en", "help"]);
  const out = { deck: null, words: null, md: [], en: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      out.help = true;
      continue;
    }
    if (a === "--") {
      die("check takes nothing after --", `bun ${CLI_PATH} check --help`);
    }
    if (!a.startsWith("--") || a.length < 3) {
      die(
        `check takes no bare argument, and got ${JSON.stringify(a)}`,
        `bun ${CLI_PATH} check --deck ${JSON.stringify(a)}`,
        ["the deck comes from --deck, so it is never ambiguous which file was checked."],
      );
    }
    const eq = a.indexOf("=");
    const name = eq === -1 ? a.slice(2) : a.slice(2, eq);
    const inline = eq === -1 ? null : a.slice(eq + 1);
    if (VALUE.has(name)) {
      let value = inline;
      if (value === null) {
        const next = argv[i + 1];
        if (next === undefined || (next.startsWith("--") && next.length > 2)) {
          die(
            `--${name} needs a value and got none`,
            name === "md"
              ? `bun ${CLI_PATH} check --md README.md`
              : name === "words"
                ? `bun ${CLI_PATH} check --words 160`
                : `bun ${CLI_PATH} check --deck deck.html`,
          );
        }
        value = next;
        i++;
      }
      if (name === "md") out.md.push(value);
      else out[name] = value;
      continue;
    }
    if (BOOL.has(name)) {
      out[name] = inline === null ? true : !/^(0|false|no|off)$/i.test(inline);
      continue;
    }
    die(
      `check does not take --${name}`,
      `bun ${CLI_PATH} check --help`,
      [
        "check takes --deck, --md, --words, --en and --help, and nothing else.",
        "a flag of one of the scripts is reached through its own subcommand:",
        cmd(`<command> ${a}`),
      ],
    );
  }
  return out;
}

/**
 * The subcommand a token was probably meant for. Ranked on distance minus the
 * shared prefix rather than distance alone, because at equal distance a shared
 * prefix is the real evidence: `dens` is three letters from `docs` and four
 * from `density`, but four of its four letters start `density`, and a checker
 * that answered `docs` there would send the caller to the wrong checker.
 */
function nearestCommand(word) {
  const lcp = (a, b) => {
    let n = 0;
    while (n < a.length && n < b.length && a[n] === b[n]) n++;
    return n;
  };
  const dist = (a, b) => {
    const row = [...Array(b.length + 1).keys()];
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return row[b.length];
  };
  let best = null;
  for (const c of SUBCOMMANDS) {
    const d = dist(word, c);
    if (d > 3) continue;
    const score = d - lcp(word, c);
    if (score > 2) continue;
    if (!best || score < best.score) best = { c, score };
  }
  return best ? best.c : null;
}

/**
 * What to print when a step exited 2 or died, rather than reported findings.
 * The finding advice would be a lie here: nothing was measured, so there is
 * nothing in the deck to fix yet, and saying otherwise sends a builder editing
 * copy to fix a missing dependency.
 */
function couldNotRunAdvice(step, deck, result) {
  const out = [
    "this step did not run to completion, so the report above is the whole story.",
  ];
  if (result.code > 2) {
    out.push(
      "an exit above 2 is almost always a missing dependency rather than a bad deck:",
      `  cd ${ROOT} && bun install && bunx playwright install chromium`,
    );
  } else {
    out.push(
      "exit 2 is a usage error or input the script cannot read, printed above.",
      "a deck the browser steps can drive has .slide elements and a window.show(n),",
      "which is what templates/template.html provides, so a fresh scaffold is a known-good",
      "way to tell a broken deck from a broken file:",
      `  ${cmd(`new ${JSON.stringify(path.join(path.dirname(deck), "deck.html"))}`)}`,
    );
  }
  out.push(`then rerun the step: ${cmd(`${step.key} --deck ${JSON.stringify(deck)}`)}`);
  return out;
}

function runCheck(argv) {
  const o = parseCheck(argv);
  if (o.help) {
    console.log(CHECK_HELP);
    return 0;
  }

  const deck = requireDeck(o.deck || undefined);

  // The docs step inside `check` reads the markdown that belongs to the deck, not
  // this skill's own documentation, because the skill's own markdown is not the
  // caller's deck and a gate that cannot be fixed by editing the deck is a gate
  // people switch off.
  //
  // It reads NOTHING unless asked. An earlier version of this comment claimed the
  // scope was the deck's own directory by default, which was never true, and a
  // `--md` error message told the caller to drop `--md` to get that behaviour.
  // Three descriptions of one default, none of them matching the code, is how a
  // reader ends up convinced the step ran when it did not. So: --md names the
  // scope and recurses, because the caller asked for it; without --md the step
  // prints "not applicable" and the verdict says so. An explicit scope with no
  // markdown in it is a usage error, not a silent pass.
  //
  // To read the markdown beside the deck, name it:
  //   check --deck d.html --md "$(dirname d.html)"
  // and for this skill's own markdown, that is the `docs` command, which walks
  // the whole skill folder by default. Two commands, two scopes, named apart.
  let mdScope = [];
  if (o.md.length) {
    for (const m of o.md) {
      const full = path.resolve(m);
      if (!fs.existsSync(full)) {
        die(`no such file or directory: ${full}`, cmd("check --md <path>"), [
          `or check this skill's own markdown: ${cmd("docs")}`,
        ]);
      }
      const st = fs.statSync(full);
      if (st.isDirectory()) mdScope.push(...markdownUnder(full));
      else mdScope.push(full);
    }
    if (!mdScope.length) {
      die(
        "no markdown found in the --md scope",
        cmd("docs"),
        [
          "check refuses to pass a docs step that could not read anything, because",
          "that is indistinguishable from a checker that never ran. Name a scope",
          "that holds markdown, or drop --md and read the step as not applicable:",
          cmd("check --deck deck.html"),
          "for this skill's own markdown, use the docs command instead:",
          cmd("docs"),
        ],
      );
    }
  } else {
    // Off by default. A deck's directory is the caller's, not the skill's, so
    // failing `check` because somebody's speaker-notes.md has no `## Contents`
    // list is a finding the caller cannot act on from the deck — and it is the
    // one finding most likely to make them stop reading the rest. Ask instead.
    mdScope = [];
    if (process.env.PRESENTATION_SKILL_CHECK_DOCS_BESIDE === "1") {
      mdScope = markdownBeside(path.dirname(deck));
    }
  }

  // Order is deliberate: blockers first, judgement calls last. QA proves the deck
  // renders at all — nothing else matters if the stage is broken. Visuals
  // proves the gates hold. Docs is usually skipped and costs nothing when it
  // runs. Density is a judgement call, dashes cosmetic; both go last so a deck
  // with a broken slide does not wait on a word count to hear about it.
  const steps = [
    {
      key: "qa",
      cost: "Chromium, 4 viewports x every slide",
      note: null,
      args: ["--deck", deck],
      why: () => "a stage that did not scale, content clipped by the stage, a diagram under 14px projected, or a page error",
      fix: (d) => [
        "the report names the slide and the offending elements. Fix the deck, then:",
        `  ${cmd(`qa --deck ${JSON.stringify(d)}`)}`,
      ],
    },
    {
      key: "visuals",
      cost: "text only",
      note: null,
      args: ["--deck", deck],
      why: () => "a slide with no icons, an icon zone with no glyph, an icon with no vendored source, emoji in copy, or a Mermaid diagram that is not vendored and registered",
      fix: (d) => [
        "the report names the slide and the offending zone. Source the glyph",
        "from icons/ (bold Phosphor for UI, colored theSVG for tech), tag it",
        "data-icon, then:",
        `  ${cmd(`visuals --deck ${JSON.stringify(d)}`)}`,
      ],
    },
    {
      key: "motion",
      cost: "Chromium, 1 viewport, only the slides that carry the features",
      note: null,
      args: ["--deck", deck],
      why: () =>
        "an auto-animate pair that never ran, a code block that was never split into per-line boxes, a line that stayed put being reprinted instead of held, or a fragment that is invisible to a capture",
      fix: (d) => [
        "the report names the pair, the slide and the count. Motion is template",
        "behaviour, so a failure here is a template or an attribute problem, not",
        "a styling one. Check the section carries data-auto-animate, that both",
        "sides of a pair carry it, and that the deck's show(n) is the template's.",
        `Then:  ${cmd(`motion --deck ${JSON.stringify(d)}`)}`,
      ],
    },
    {
      key: "docs",
      cost: "text only",
      note: null,
      // The expanded file list, not the directory: one walker decides what is in
      // scope, so the count printed here is the count check-docs actually read.
      args: mdScope.length ? mdScope : null,
      why: () =>
        mdScope.length
          ? `no Contents section, a heading missing from it, or a dead anchor in ${mdScope.length} file(s)`
          : "skipped by design, not a failure: check reads only markdown you name with --md, because a deck's folder is the caller's and not the skill's",
      fix: (d) => [
        "add the missing heading to that file's ## Contents list, then rerun:",
        `  ${cmd(`check --deck ${JSON.stringify(d)} --md <that file>`)}`,
        ...(mdScope.length
          ? [`to read that one file: ${cmd(`docs ${JSON.stringify(mdScope[0])}`)}`]
          : []),
      ],
    },
    {
      key: "density",
      cost: "Chromium, 1 viewport x every slide",
      note: null,
      args: o.words ? ["--deck", deck, "--words", o.words] : ["--deck", deck],
      why: () => "a slide over the word cap, or a page error that makes the count unreliable",
      fix: (d) => [
        "the report names the longest blocks of text on the failing slide. Condense",
        "those; there is no mechanical fix, by design. Then rerun:",
        `  ${cmd(`density --deck ${JSON.stringify(d)}`)}`,
        o.words
          ? ""
          : `if this deck genuinely has a different budget, say so: ${cmd(`density --deck ${JSON.stringify(d)} --words <n>`)}`,
      ],
    },
    {
      key: "dashes",
      cost: "text only",
      note: null,
      args: o.en ? ["--en", deck] : [deck],
      why: () => "em dashes in the deck, which read as filler and usually mean one sentence is doing two jobs",
      fix: (d) => [
        "--fix rewrites only the one case that cannot change meaning (an em dash",
        "bracketing an aside becomes a comma) and never touches JS or TS source:",
        `  ${cmd(`dashes --fix ${JSON.stringify(d)}`)}`,
        "the rest are a judgement about which job belongs in its own sentence.",
      ],
    },
  ];

  console.log("");
  console.log(`check  ${deck}  (${deckWhy(o.deck || undefined)})`);
  console.log(
    `all ${steps.length} steps run even if an earlier one fails: none reads another's result,`,
  );
  console.log("so stopping early would hide findings rather than fix them.");
  console.log("");

  const results = [];
  for (const [i, step] of steps.entries()) {
    if (step.args === null) {
      console.log(
        `[${i + 1}/${steps.length}] ${step.key}  (${step.cost})  not applicable: ${step.why()}`,
      );
      results.push({ step, code: 0, skipped: true });
      continue;
    }
    console.log(`[${i + 1}/${steps.length}] ${step.key}  (${step.cost})`);
    const { code, note } = runScript(SCRIPT_OF[step.key], step.args);
    results.push({ step, code, note, skipped: false });
    console.log(`      -> ${explain(code, note)}`);
    console.log("");
  }

  const ran = results.filter((r) => !r.skipped);
  const failed = ran.filter((r) => r.code !== 0);
  const couldNotRun = ran.some((r) => r.code === 2 || r.code > 2);
  const width = Math.max(...ran.map((r) => r.step.key.length));

  console.log("verdict");
  for (const r of results) {
    const state = r.skipped ? "not applicable" : explain(r.code, r.note);
    console.log(`  ${r.step.key.padEnd(width)}  ${r.skipped ? "n/a " : `exit ${r.code}`}  ${state}`);
  }
  console.log("");

  if (failed.length) {
    for (const r of failed) {
      console.log(`FAILED: ${r.step.key}`);
      if (r.code === 2 || r.code > 2) {
        for (const line of couldNotRunAdvice(r.step, deck, r)) if (line) console.log(`  ${line}`);
      } else {
        console.log(`  why: ${r.step.why()}`);
        for (const line of r.step.fix(deck)) if (line) console.log(`  ${line}`);
      }
      console.log("");
    }
  }

  if (couldNotRun) {
    console.log(
      `check: ${failed.length} of ${ran.length} applicable step(s) failed, and at least one could not run at all.`,
    );
    console.log(
      `  a step that could not run is not a pass. If it is a missing dependency:`,
    );
    console.log(`  cd ${ROOT} && bun install && bunx playwright install chromium`);
    console.log(`  then rerun: ${cmd(`check --deck ${JSON.stringify(deck)}`)}`);
    return 2;
  }
  if (failed.length) {
    console.log(`check: FAIL, ${failed.length} of ${ran.length} applicable step(s) failed.`);
    console.log(`  rerun the whole pass when they are fixed: ${cmd(`check --deck ${JSON.stringify(deck)}`)}`);
    return 1;
  }
  const nApplicable = ran.length;
  console.log(
    `check: clean, ${nApplicable} step(s) passed${
      results.some((r) => r.skipped) ? " and 1 had nothing to check" : ""
    }.`,
  );
  console.log(
    "  scripts cannot see a stranded icon or an invisible brand mark. Open every",
  );
  console.log("  PNG and look at it before calling the deck done:");
  console.log(`  ${cmd(`shot all --deck ${JSON.stringify(deck)}`)}`);
  console.log(
    "  if you wrote slides without looking at each one as you went, go back and",
  );
  console.log(`  do that now, one at a time: ${cmd(`shot <n> --deck ${JSON.stringify(deck)} --no-qa`)}`);
  return 0;
}

/* --------------------------------------------------------------------- new -- */

function runNew(argv) {
  let force = false;
  const positional = [];
  for (const a of argv) {
    if (a === "--force") force = true;
    else if (a === "--help" || a === "-h") {
      console.log(HELP_OF.new);
      return 0;
    } else if (a.startsWith("--")) {
      die(`new does not take --${a.slice(2)}`, `bun ${CLI_PATH} new --help`, [
        "new takes a target path, --force and --help, and nothing else.",
      ]);
    } else positional.push(a);
  }
  if (positional.length > 1) {
    die(
      `new takes one target path, and got ${positional.length}`,
      `bun ${CLI_PATH} new ${JSON.stringify(path.join(process.cwd(), "deck.html"))}`,
      ["one command, one deck. Build a second deck with a second run."],
    );
  }

  if (!isReadableFile(TEMPLATE)) {
    die(
      `the template is missing or unreadable: ${TEMPLATE}`,
      `ls ${path.join(ROOT, "templates")}`,
      ["new copies templates/template.html and has no other starting point."],
    );
  }

  /* The target is either a path to a .html file, or a bare topic name. A bare
     name is the documented default and it is what keeps the skill folder
     tidy: `new jev` writes decks/jev/jev.html rather than dropping a deck, a
     plan, a shots folder and a PDF into whatever directory the agent happened
     to be standing in. The structure a deck ships in is defined in SKILL.md
     under "Output structure", and this is the half of it a command can
     enforce. */
  const arg = positional[0];
  const looksLikePath =
    arg && (arg.includes("/") || arg.includes(path.sep) || /\.html?$/i.test(arg));
  const topic = !arg || !looksLikePath ? (arg || "deck") : null;
  if (topic && !/^[\w][\w .-]*$/.test(topic)) {
    die(`that is not a usable topic name: ${JSON.stringify(topic)}`, cmd("new <topic>"), [
      "a topic becomes a folder name, so it takes letters, digits, spaces, dots",
      "and dashes. Pass an explicit path if you need anything else:",
      cmd(`new ${JSON.stringify(path.join("decks", "my-deck", "my-deck.html"))}`),
    ]);
  }
  const target = path.resolve(
    topic
      ? path.join(ROOT, "decks", topic, `${topic}.html`)
      : path.join(process.cwd(), arg),
  );
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    die(`that path is a directory, not a file: ${target}`, cmd("new <target>.html"), [
      "give new a file name to write, for example:",
      cmd(`new ${JSON.stringify(path.join(target, "deck.html"))}`),
    ]);
  }
  if (fs.existsSync(target) && !force) {
    die(
      `refusing to overwrite an existing file: ${target}`,
      cmd(`new --force ${JSON.stringify(target)}`),
      [
        "or write to a different name:",
        cmd(`new ${JSON.stringify(path.join(path.dirname(target), "deck2.html"))}`),
        "--force replaces it atomically, so the existing deck survives a failure.",
      ],
    );
  }

  const bytes = fs.readFileSync(TEMPLATE);
  // The deck folder is a deliverable, so `new` builds the shape SKILL.md
  // promises rather than leaving the agent to remember it: images/ holds
  // everything the HTML points at, and images/icons/ is where a vendored or
  // captured image file goes. Created empty and idempotently, because a deck
  // with no images still ships the folder and a later run must not fail on it.
  const dir = path.dirname(target);
  const images = path.join(dir, "images");
  for (const sub of ["", "icons"]) {
    try {
      fs.mkdirSync(path.join(images, sub), { recursive: true });
    } catch (err) {
      die(`cannot create ${path.join(images, sub)}: ${err.message}`, cmd(`new ${JSON.stringify(target)}`), [
        "the deck folder is not writable, so it cannot hold the images/ subfolder.",
      ]);
    }
  }
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`created ${dir}`);
    } catch (err) {
      die(`cannot create ${dir}: ${err.message}`, cmd(`new ${JSON.stringify(target)}`), [
        "new will not write a deck it cannot place.",
      ]);
    }
  }

  // One substitution, and only one: the skill-asset root the in-deck icon modal
  // reads. The template default (`../assets`) serves decks next to the skill
  // tree; a deck anywhere else gets the correct relative path computed here,
  // so the modal's lazy search data resolves wherever the deck lives. Sample
  // content is never touched: that is still yours to replace.
  const MARKER = 'window.__SKILL_ASSETS__="../assets"';
  let text = bytes.toString("utf8");
  if (text.includes(MARKER)) {
    let rel = path.relative(dir, path.join(ROOT, "assets")) || ".";
    if (!rel.startsWith(".")) rel = "./" + rel;
    text = text.replace(MARKER, `window.__SKILL_ASSETS__=${JSON.stringify(rel)}`);
  }

  // Write beside the target, then rename. Rename is atomic on one filesystem, so
  // a failure anywhere above leaves no half-written deck, and --force cannot
  // destroy a good deck on the way to replacing it.
  const tmp = path.join(dir, `.${path.basename(target)}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, target);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // Nothing to clean up if the temp file never landed.
    }
    die(`could not write ${target}: ${err.message}`, cmd(`new ${JSON.stringify(target)}`), [
      "the deck was not written, and nothing was left behind.",
    ]);
  }

  // Count the slides the way the browser will, so the number matches what the
  // checks report. The template carries one sample <section> inside its own
  // documentation, in an HTML comment in the head and a JS comment in the
  // script, and counting those says 11 when the deck really has 10.
  const slides = (
    bytes
      .toString("utf8")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .match(/<section class="slide/g) || []
  ).length;
  console.log(
    `wrote ${target}  (${(bytes.length / 1024).toFixed(0)} KB from templates/template.html, ${slides} sample slide(s))`,
  );
  console.log("the sample content is yours to replace; only the skill-asset path was resolved.");
  if (force) console.log("the previous file at that path was replaced.");
  console.log("  images/mermaid.min.js  if this deck carries a diagram");
  console.log("");
  console.log("next:");
  console.log(`  1  replace the ${slides} <section class=\"slide\"> elements with your own,`);
  console.log("     keeping relabel(), window.show(n) and the four-row grid");
  console.log(`  2  ${cmd(`check --deck ${JSON.stringify(target)}`)}`);
  console.log(`  3  ${cmd(`pdf --deck ${JSON.stringify(target)} --here`)}`);
  console.log("");
  console.log(
    `shipped shape: ${path.basename(target)}, ${path.basename(target, ".html")}.pdf, images/`,
  );
  return 0;
}

/* ------------------------------------------------------------------- entry -- */

function main() {
  const argv = process.argv.slice(2);

  if (!argv.length) {
    console.log(OVERVIEW);
    return 0;
  }

  // `test` is the same command as `check` under its test-runner name: one
  // command that runs every test, blockers first. Normalized here so every
  // branch below, including --help and error messages, speaks one name.
  let first = argv[0];
  if (first === "test") first = "check";
  if (first === "--help" || first === "-h" || first === "help") {
    console.log(OVERVIEW);
    return 0;
  }

  if (first === "check") return runCheck(argv.slice(1));

  if (first === "new") return runNew(argv.slice(1));

  if (first === "shot") return runShot(argv.slice(1));

  if (first === "ste") return runSte(argv.slice(1));

  if (first === "icons") {
    const rest = argv.slice(1);
    if (rest.includes("--help") || rest.includes("-h")) {
      console.log(HELP_OF.icons);
      return 0;
    }
    // `icons build` is the one icons form that writes instead of reads: it
    // regenerates the modal's search data from the vendored library.
    if (rest[0] === "build") {
      process.exit(runScript("build-icon-data.mjs", rest.slice(1)).code);
    }
    process.exit(runScript(SCRIPT_OF.icons, rest).code);
  }

  // Retrieval, not checking: pattern, doc and refs take their own arguments (a
  // pattern number, a filename plus a heading, nothing at all), and none names
  // a deck, so the deck-promoting passthrough below would misread them. Forward
  // verbatim, exactly like icons.
  if (first === "pattern" || first === "doc" || first === "refs") {
    const rest = argv.slice(1);
    if (rest.includes("--help") || rest.includes("-h")) {
      console.log(HELP_OF[first]);
      return 0;
    }
    process.exit(runScript(SCRIPT_OF[first], rest).code);
  }

  if (Object.prototype.hasOwnProperty.call(SCRIPT_OF, first)) {
    const rest = argv.slice(1);
    if (rest.includes("--help") || rest.includes("-h")) {
      console.log(HELP_OF[first]);
      return 0;
    }
    passthrough(first, rest);
    return 0;
  }

  if (first.startsWith("-")) {
    die(
      `unknown option: ${first}`,
      `bun ${CLI_PATH} --help`,
      [
        "flags come after a command:",
        cmd("check --deck deck.html"),
        cmd("qa --help"),
      ],
    );
  }

  const near = nearestCommand(first);
  die(
    `unknown command: ${JSON.stringify(first)}`,
    `bun ${CLI_PATH} --help`,
    [
      `commands are: ${SUBCOMMANDS.join(", ")}`,
      near ? `did you mean: ${cmd(near)}` : "",
      "to check a deck in one pass, which is almost always what you want:",
      cmd("check --deck deck.html"),
    ].filter(Boolean),
  );
  return 2;
}

process.exit(main());
