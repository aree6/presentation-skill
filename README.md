# presentation-skill

Builds visually rich HTML slide decks and exports them to PDF. Decks built
with this skill are heavy on visuals, icons and diagrams, and light on words.
One self-contained `.html` file per deck, no framework, no build step.

`SKILL.md` is the operating instruction an agent reads. This README is for
the human: how to install the skill, update it, and run every command in it.

## Contents

- [What this is](#what-this-is)
- [Requirements](#requirements)
- [Install](#install)
- [Use as a skill](#use-as-a-skill)
- [Workflow](#workflow)
- [Commands](#commands)
- [Project structure](#project-structure)
- [Example decks](#example-decks)
- [Vendored sub-skill](#vendored-sub-skill)
- [Licence](#licence)
- [Troubleshooting](#troubleshooting)

## What this is

A portable agent skill plus the scripts behind one interface (`cli.mjs`):
scaffold a deck from a template, pick treatments from a gallery, source
vendored icons, draw Mermaid diagrams, gate the deck with six checks,
screenshot every slide for review, and export one PDF.

The gates read the deck file, not the workflow, so hand-editing and
script-generated HTML are equally legitimate. What matters is the output:
exit 0 from `check`, every PNG looked at, one PDF beside the deck.

## Requirements

- Bun >= 1.0. Every command below runs through `bun cli.mjs`.
- Chromium via Playwright, for the steps that render: `qa`, `shot`, `pdf`,
  `density`, `motion`, `frames`. Installed once (see Install).
- Python 3, only for `ste` (the advisory prose lint). Nothing else needs it,
  which is why `ste` is not one of the six steps in `check`.
- No network at render time. Type arrives over a Google Fonts link with
  system fallbacks, Mermaid is vendored beside the deck, icons are inlined.

## Install

```bash
git clone https://github.com/aree6/presentation-skill.git
cd presentation-skill
bun install
bunx playwright install chromium
```

Check the install with the text-only gates (no browser needed):

```bash
bun cli.mjs docs
```

That walks every markdown file this skill owns and reports clean when each
one carries a Contents list that matches its headings. If `bun install`
cannot reach a registry, `docs` still runs: only the Chromium steps need
the install to have completed.

## Use as a skill

Copy or symlink this folder into whatever skills directory your agent scans:

```bash
cp -r presentation-skill ~/.opencode/skills/presentation-skill
```

Known locations: `.opencode/skills/`, `.claude/skills/`, or whatever your
agent scans. No build step, no registration. The agent reads `SKILL.md`
from the folder; `cli.mjs` resolves its paths from its own location, so it
works from any working directory.

To update to a newer upstream, pull and re-copy:

```bash
cd presentation-skill && git pull
cp -r presentation-skill ~/.opencode/skills/presentation-skill
```

Your decks live in `decks/<topic>/` inside the skill folder, so back those
up before replacing it, or keep the skill copy pristine and pass explicit
deck paths from elsewhere.

## Workflow

```bash
bun cli.mjs new my-topic
bun cli.mjs motion --deck decks/my-topic/my-topic.html
bun cli.mjs shot 1 --deck decks/my-topic/my-topic.html --no-qa
bun cli.mjs check --deck decks/my-topic/my-topic.html
bun cli.mjs shot all --deck decks/my-topic/my-topic.html
bun cli.mjs pdf --deck decks/my-topic/my-topic.html --here
```

In order: `new` copies the template into `decks/my-topic/` with an
`images/` folder. Write one slide, screenshot it (`shot`), look at the PNG
before writing the next. `check` runs all six gates with one verdict; rerun
it until green. `shot all` captures every slide for the review pass, which
is done with eyes, not scripts. `pdf --here` writes the single shipped PDF
beside the deck.

`SKILL.md` (section Workflow) is the full procedure: planning the argument,
casting treatments, scouting visuals, the per-slide review loop, and the
verdict format. Start there when building a real deck.

## Commands

`bun cli.mjs` with no arguments prints the overview. `bun cli.mjs --help`
and every `bun cli.mjs <command> --help` print one screen each.

| Command | What it does |
|---|---|
| `check [--deck <file>]` | All six gates (qa, visuals, motion, docs, density, dashes), blockers first, one verdict. `test` is the same command. |
| `new <topic>` | Copy `templates/template.html` to `decks/<topic>/<topic>.html` with `images/` beside it. |
| `shot <n \| a-b \| all> --deck <file>` | Screenshot slides as PNGs beside the deck. `--no-qa` skips the whole-deck QA pass for the per-slide loop. |
| `pdf --deck <file> --here` | Export the deck to PDF. `--here` writes the single PDF beside the deck. |
| `qa --deck <file>` | Per slide, at four viewports: stage scaled, nothing clipped, diagrams legible. |
| `visuals --deck <file>` | Text-only visual gate: icons with provenance in every zone, no emoji, Mermaid vendored and registered. |
| `motion --deck <file>` | Drives the deck: auto-animate pairs ran, code split per line, one press per fragment step. |
| `frames --deck <file>` | Capture each transition mid-flight and each fragment step, so motion can be looked at. |
| `density --deck <file>` | Word budget per slide, naming the longest blocks when over. |
| `dashes <file>` | Em dash report, with the one safe rewrite behind `--fix`. |
| `docs [<path>]` | Contents list matches headings, per markdown file. Bare `docs` walks the skill. |
| `refs` | Verify the prose claims about the environment still hold (counts, anchors, script names). |
| `icons <word> --emit` | Search the vendored icon library; `--emit` prints paste-ready `<svg>`. `icons build` regenerates the in-deck search data. |
| `pattern <n> [--css]` | One gallery treatment with its caption; `--list` prints the menu. `--css` prints the CSS the markup needs. |
| `doc <file> <heading>` | One section of a reference file, heading-first. |
| `ste <file.md>` | ASD-STE100 structural lint over markdown. Advisory, never a gate. Needs Python 3. |

## Project structure

```text
presentation-skill/
  SKILL.md                operating instructions (what an agent reads)
  README.md               this file (what a human reads)
  LICENSE                 licence notes for the vendored parts
  content_philosophy.md   the argument rules, read at plan time
  DESIGN.md               tokens, treatments, motion, density budget
  MERMAID.md              vendored-Mermaid contract: patch, readiness, legibility
  ICONS.md                icon rules: provenance, variants, contrast traps
  cli.mjs                 single front door over scripts/
  package.json            scripts, pinned devDependencies (mermaid, pdf-lib, playwright)
  bun.lock                locked dependency tree
  icons/                  vendored library: Phosphor UI glyphs, theSVG brand marks, index.tsv
  templates/              template.html (the scaffold) and slides/patterns.html (the gallery)
  scripts/                one check per file; each also runs standalone with --help
  skills/asd-ste100/      vendored ASD-STE100 sub-skill for sentence-level copy
  research/               design notes (how the motion port works)
  assets/                 generated icon search data (regenerate with icons build, not committed)
  decks/                  example decks, one folder per deck (see below)
  presentations/          default PDF output dir when --here is not passed (not committed)
```

## Example decks

`decks/` holds example decks, one folder per deck:

```text
decks/<topic>/
  <topic>.html      the deck, self-contained
  <topic>.pdf       the export, from pdf --here
  plan.md           the argument, written before any HTML
  images/           everything the HTML points at (vendored mermaid.min.js lives here)
```

Screenshots (`*-shots/`) and motion frames (`*-motion/`) are derived output
and are not committed. Regenerate them any time:

```bash
bun cli.mjs shot all --deck decks/<topic>/<topic>.html
bun cli.mjs frames --deck decks/<topic>/<topic>.html
```

A second deck is a second folder and a second `new`, never a second file in
the first folder. The scaffold's sample slides carry fictional copy about an
invented clinic; `new` says so each time, and every word of it is replaced
before export.

## Vendored sub-skill

`skills/asd-ste100/` is ASD-STE100 (Simplified Technical English), copied
byte for byte from its own repository and not edited here. It is the
sentence-level companion to `content_philosophy.md`: the philosophy governs
the argument, the sub-skill governs the wording that carries it.
`content_philosophy.md` says which text takes the strict treatment, which
takes the light one, and which takes neither.

```bash
bun cli.mjs ste decks/<topic>/plan.md
```

To update it, replace the folder with a fresh clone. `docs` skips it, since
its prose is not this skill's to fix.

## Licence

This skill's own files are unlicensed: yours to use as you see fit.

Two parts are not ours, and each carries its own licence beside it: `icons/`
(theSVG brand marks and Phosphor UI glyphs, redistributed unmodified under
the MIT licence, which requires the notice to travel with the files) and
`skills/asd-ste100/` (MIT, see its own LICENSE). Keep those files with the
folder if you redistribute it. See `LICENSE`.

## Troubleshooting

- `bunx playwright install chromium` was skipped: every render step (`qa`,
  `shot`, `pdf`, `density`, `motion`) fails without it. Install once per
  machine, then rerun.
- The in-deck icon picker is empty: `assets/` is generated and not
  committed. Run `bun cli.mjs icons build` to put it back.
- `ste` reports no python3: install Python 3, or read the rules in
  `skills/asd-ste100/` instead. It is advisory either way.
- A deck renders blank screenshots: `window.show(n)` was broken by a
  hand edit. `check` runs `qa` first precisely to catch this; fix the deck
  script before reading any later step.
- `check` fails on a stranger's markdown: pass `--md` with the deck's own
  folder, since the docs step inside `check` reads nothing until scoped.
  Bare `docs` is for this skill's own markdown.
