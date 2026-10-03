---
name: presentation-skill
description: Use when a deck should look designed rather than typed - building, editing or reviewing an HTML slide deck, choosing a slide treatment, sourcing an icon, adding a Mermaid diagram, or exporting to PDF. Every slide carries a visual, every slide is screenshotted and signed off, and one command gates the whole deck.
compatibility: Node 18+; Playwright with Chromium installed (bunx playwright install chromium) and pdf-lib. mermaid@12.0.0 only when a deck carries a diagram. No network needed at build or render time.
---

# Presentation Skill

Most presentation skills produce text slides. This one does not: decks built with it are heavy on visuals, icons and diagrams, and light on words.

Drop this folder into any agent skills directory — `.opencode/skills/`,
`.claude/skills/`, or whatever your agent scans. No build step, no framework. One
self-contained `.html` file per deck, plus scripts behind one interface
(`cli.mjs`).

## Contents

- [Reach for](#reach-for)
- [Workflow](#workflow)
- [1. Plan the argument](#1-plan-the-argument)
- [2. Cast each topic](#2-cast-each-topic)
- [Choose the treatment from the gallery](#choose-the-treatment-from-the-gallery)
- [Scout visuals with agents, in parallel](#scout-visuals-with-agents-in-parallel)
- [3. Build one self-contained HTML file](#3-build-one-self-contained-html-file)
- [4. Diagrams: vendor, patch, then register](#4-diagrams-vendor-patch-then-register)
- [5. QA, then the screenshot](#5-qa-then-the-screenshot)
- [Look at each slide before you build the next](#look-at-each-slide-before-you-build-the-next)
- [The deck pass, before export](#the-deck-pass-before-export)
- [Landed mechanics (do not reinvent)](#landed-mechanics-do-not-reinvent)
- [Splitting the work across agents](#splitting-the-work-across-agents)
- [Editing rules](#editing-rules)

## Reach for

One row per branch. Take the row whose trigger is true.

| When you are | Do this |
|---|---|
| **planning** | read `content_philosophy.md` — the seven rules, before any HTML exists |
| **choosing a treatment** | `bun cli.mjs pattern --list` for the menu, then `pattern <n>` for the markup |
| **a shape you cannot place** | `DESIGN.md` → "Visual vocabulary" maps content shape to treatment |
| **writing CSS** | `DESIGN.md`; the tokens and grid are already in `templates/template.html`'s `<style>` |
| **first icon** | `bun cli.mjs icons <word>`, then copy the file it names byte for byte |
| **first diagram** | `MERMAID.md` — §3 picks the type, §4 theming, §5 the readiness contract |
| **checking** | `bun cli.mjs check --deck <topic>.html` |
| **before shipping** | `bun cli.mjs shot all --deck <topic>.html`, then read every PNG |
| **a human wants to tweak** | open the deck in a browser: Edit in the themebar edits text and swaps icons in place, with HTML/PDF export beside it (`DESIGN.md` → "Edit mode") |

`bun cli.mjs --help` lists everything; every command has `--help`.

## Workflow

Work runs in four phases. Phases 1 and 2 are serial — the plan is the one thing
every later step reads. Phases 3 and 4 fan out: one worker per topic or slide
band, each running the per-slide loop on its own slides, because a slide's
critique depends only on its own render and never on its neighbours being final.

### 1. Plan the argument

Read **`content_philosophy.md`** first — a deck that breaks rule 1 (assertion titles) or rule 4 (one idea per slide) cannot be repaired by restyling afterwards. Settle before writing HTML:

1. Slide count and order (a numbered list of titles).
2. Per slide: message, proof (diagram / screenshot / table), the visual that carries it (named icon set, diagram type, or mark), and source. A slide with no named visual is an unplanned slide.
3. Bridges at the seams, where possible: where the argument moves, name the one question the previous slide earned and the next slide answers. The audience doesn't know what's coming, so ask before you tell — that is the whole move. No question in the seam, no bridge.
4. Which slides are appendix (per rule 7), and where the narrative ends.
5. Design deviations, if any (default: `DESIGN.md` as-is).

Write the plan down, get it confirmed, then build. Working solo, write it as
`plan.md` beside the deck — the confirmation is the file existing before any
HTML does, not a reply. The plan must cover everything
in the source data — a topic the plan skips is a topic the deck never answers.

### 2. Cast each topic

One topic may need one slide or several; that is a decision, not a default. For
each topic, pick the treatment from the gallery against the shape of its content
(`bun cli.mjs pattern --list` for the menu, `pattern <n>` for the markup), and
note where the choice is not obvious. Which images already exist on disk vs.
need to be supplied or captured is settled here too, per topic, so no worker
ever blocks on an asset.

Then read the treatment list aloud, in order — "grid, compare, steps, flow,
split, grid, rail, steps" — and if it sounds repetitive, it is. Rearrange here,
where treatments are still words on a list; rebuilding slides later costs ten
times more. Two card-DNA treatments in any window of four is the smell even
when neither repeats consecutively. One slide in every deck must break the
surface: a single oversized figure, a lone sentence, a full-bleed band
(`DESIGN.md` → "The variety rule").

### Choose the treatment from the gallery

**The gallery is a menu, not a template.** `bun cli.mjs pattern --list` prints all 33 patterns with their captions; `pattern <n>` prints one pattern's markup and caption. `pattern <n> --css` prints the gallery CSS the markup needs, ready to paste — never hand-extract a block by eye. Never ship a pattern unchanged — adapt the columns, labels, numbers, tile count and tints to your content, because a pattern that ships unchanged is a template deck with someone else's company name on it.

Read the caption before borrowing: a caption stating a limit (a bar cap, a tile ceiling) is a real limit on the pattern. `templates/template.html` demonstrates ten treatments; the rest exist only as markup in the gallery. `DESIGN.md`'s selection table has a "Reference" column saying which is which.

The captions that route to a sibling treatment are the ones worth reading twice. *"Not for: content where one card outweighs the rest, which wants the bento"* tells you what to reach for instead — a caption that only inverts the use-when line is telling you nothing the heading didn't.

### Scout visuals with agents, in parallel

**Delegate the visual pass to parallel scouts before the build starts.** Once the plan names every slide's message and treatment, fan out one scout per slide band. Each scout owns its slides outright and returns, per slide: 2-4 candidate icons with exact `icons/` paths and variant picks per `ICONS.md`; the brand mark where a real product, language, company or institution is named; the diagram type with a draft Mermaid source where the content has a shape; and a contrast verdict on every colored mark against the light canvas. Scouts return findings; they do not write the deck, and they do not restate design constraints — the skill is the only source of truth they point at.

Working solo, do the same pass inline before writing HTML: `bun cli.mjs icons <words>` per slide for candidates, `MERMAID.md` §3 for the diagram type, `ICONS.md` → "Marks that vanish" for the contrast verdict. Same findings, same order, no parallelism required.

The builder then assembles the deck from the plan plus the scout reports, runs `check` (the visuals gate verifies every scouted path resolves and every zone has its glyph), and hands the screenshots to the reviewer procedure in section 4. Scouting in parallel is what makes nineteen visually dense slides affordable: the icon hunt, the diagram drafts, and the copy pass never block each other, and a missed visual is a scout finding, not a builder accident discovered at screenshot time.

### 3. Build one self-contained HTML file

Every slide is art-directed on its own render, for the room it will be presented in. The bar is a person at the back, standing, reading it once. This is a template — tokens, grid and motion already decided — and the deck is yours to design past it.

- **Never write a deck from scratch.** Every deck starts as a copy of the base: `bun cli.mjs new <topic>.html` copies `templates/template.html`, which carries the tokens, the grid, the rail, the motion and the readiness contract. Hand-writing the scaffolding reproduces it wrong — that is what the grid, rail and contract sections of this file exist to prevent. Build one slide at a time on top of the copy and look at each before the next — see "Look at each slide before you build the next".
- All CSS in `<style>`, the deck's JS in the one `<script>` the template ships, images under `./assets/`. A deck with a diagram adds a second `<script src>` for the vendored library, and nothing else moves.
- Fixed stage `1920×1080`, scaled to viewport (see "Landed mechanics").
- **Keep the four-row slide grid.** `nav.rail` spans rows 1/-1 in column 1; `.s-head` row 2, `.s-body` row 3, `.s-foot` row 4, all three in column 2. Centring belongs on `.s-body`, which already carries `justify-content:center`. Setting `display:flex` on `.slide.active` collapses the bands, drops the title from the top of the stage and lifts the footer off the bottom — the mark of an unbuilt deck.
- Same chrome on every slide, and **no hand-written numbers.** The template writes each slide's `aria-label` from the real slide count at load; a `<section>` supplies only `data-name`. Insert, delete or reorder slides freely.
- **Keep the `window.show(n)` JS API exactly as scaffolded.** `pdf`, `shot` and `density` drive the deck through it and exit 2 without it. Only `qa` needs no JS API, so a green QA step is not proof the API survived.
- **A screenshot or image goes in the window frame** from `DESIGN.md` → "Screenshots and images", with `object-fit: contain`.
- **Icons are vendored, never drawn.** `bun cli.mjs icons <words>` finds the exact file; copy it byte for byte, including its root open tag, and tag it `data-icon` naming its source. Bold Phosphor for UI, theSVG for anything with a real identity. `check-visuals.mjs` fails a hand-drawn approximation and a guessed brand mark. Full rules in `ICONS.md`. The rail icon registry lives in the template's own `<script>` as `RAIL_ICONS`: one entry per `data-icon` key holding that file's inner path bytes verbatim, so a rail glyph verifies exactly like slide art. A new rail glyph means a new registry entry — the gate fails a missing one by name.
- **A slide body carries a visual**: an icon tile, a data mark, a diagram, or a framed image. Only the pull close and the section divider may be pure words. Two prose blocks is a document, not a slide.
- **Content with a shape ships as a diagram** — a process, timeline, comparison, composition, hierarchy or system. Trigger table in `DESIGN.md` → "Visual vocabulary"; `MERMAID.md` §3 picks the type. When torn between cards and a diagram, the diagram wins.
- **Every table marks what it is for** — a tinted hero row, the significant value, a signed delta, a threshold note. `check-visuals.mjs` fails a table whose rows are all identical.
- **Run the density test, not a word count**: read the body aloud against a 25-second timer, and shrink the browser to 25% to check the one-glance read. `density` is a separate step and the one that fails. Full wording in `DESIGN.md` → "Density budget".
- **Animate:** keep the staged entrance and tile cascade from `DESIGN.md` → "Motion" verbatim, including the one-line `:is()` list, and keep `body.no-anim` disabling all of it for PDF capture.

### 4. Diagrams: vendor, patch, then register

If a slide needs a system, a flow, a lifecycle, a schedule or a topology, reach for a diagram instead of cards or a list. `MERMAID.md` has the syntax for fifteen types and the light-canvas theming.

**Vendor the UMD build.** Mermaid is an npm package, not a browser feature, and the ESM entry is CORS-blocked on `file://`, which is how a deck is opened. `mermaid@12.0.0` is a pinned `devDependency` here, so after `bun install` the file is already on disk:

```bash
# once per deck, in the folder that holds <topic>.html
mkdir -p assets
cp <this-skill>/node_modules/mermaid/dist/mermaid.min.js assets/mermaid.min.js
```

Then `<script src="./assets/mermaid.min.js"></script>` in the deck. Never a CDN at render time, for the same reason icons are never a CDN.

Then the four non-negotiables:

- **Apply the §4 CSS patch**, including the one line that is not a colour: `.mmdwrap foreignObject{overflow:visible !important}`. Without it a label can be sliced mid-word with no page error and a clean PDF, because Chromium clips a `<foreignObject>` by default and Mermaid sizes that box from its own measurement. Anchor on `.mmdwrap`, never `.mermaid`: the render step removes `class="mermaid"` once a node is processed, so a `.mermaid` rule stops matching the moment the diagram is on screen.
- **Call `mermaid.initialize()` synchronously, before any `await`.** Mermaid's own auto-start gets to your containers first otherwise, and the failure names the wrong thing.
- **Register the render with `defer()`, never assign `window.__deckReady`.** The template owns that promise. `defer()` works from any script after the template's own, so there is no positioning to remember inside the deck script, and assigning over the promise is the bug this contract exists to prevent. Both scripts await it; without a registration a screenshot captures an empty container and the PDF looks like it exported fine.
- **A parse error does not throw.** `render()` and `run()` resolve on invalid source and draw an error card. Parse first with `mermaid.parse()` and never swallow the failure.

Also: ten diagram types ship with the wrong look unless per-diagram frontmatter says otherwise, and a diagram's projected type size is set by a letterbox factor. `qa-matrix.mjs` prints that number for every diagram and fails below 14px. Details in `MERMAID.md`.

### 5. QA, then the screenshot

```
bun cli.mjs check --deck <topic>.html
```

**`bun cli.mjs test` is the command: one run, one verdict.** (`test` and `check` are the same command; `bun run test` from this folder works too.) It runs all five checks, blockers first — QA, visuals, docs, density, dashes — and exits non-zero when any of them fails. `check` forwards `--deck` to all five, `--en` to dashes and `--words` to density, and expands `--md` into the file list docs reads. Each step also runs on its own through the same front door (`bun cli.mjs qa --deck <topic>.html`, `bun cli.mjs visuals --deck <topic>.html`), and every one has `--help`.

**What the QA step actually checks**, per slide, at 1920×950, 1600×900, 1440×900 and 1280×720:

1. the stage scaled, read from the **computed transform matrix** on `.slide.active`, so a deck that scales via a class or `scale3d()` is caught too;
2. the document does not scroll (`scrollHeight > clientHeight` on the scrolling element and on `body`);
3. **nothing is clipped by the stage.** Every `.slide` is a fixed `overflow:hidden` box, so content can never reach the document scroll height, which makes check 2 blind to it. Check 3 is the load-bearing one: it compares every descendant's bounding rect against the stage rect and reports `clipped:N` naming the offenders;
4. **every diagram is legible.** For each rendered diagram it reads the `viewBox` and the rendered box, derives the letterbox factor, multiplies it by the smallest font size in the drawing, and fails below **14px projected**. It also measures whether a label's ink falls outside its `<foreignObject>` while that box is still clipping, which is the mid-word slicing failure nothing else can see. Both numbers are printed per diagram, passing or failing;
5. **the diagram fills its band** — below **25%** a diagram passes legibility and still leaves the slide empty, so both numbers are printed;
6. **paired elements share a centreline** within 2px: a timeline's dots and its rail, a `.qhead` tile and its heading, and the head, body and foot columns against each other.

It also fails on any `pageerror` the deck throws, and advances with `ArrowRight` presses, needing no JS API.

**Density is a separate step, and the split is deliberate.** `check-density.mjs` fails a slide over the 130-word cap (`--words` overrides it) and names the longest blocks. `qa-matrix.mjs` prints a per-slide word count and never fails on it — that number is context for the judgement, not a gate. A slide whose body is a table prints its count too but is judged on whether the table fits the band. Full wording in `DESIGN.md` → "Density budget".

`check-dashes.mjs` reports em dashes, which read as AI filler and usually mean a sentence is doing two jobs. Fix by splitting the sentence or using a colon or comma, not by blanket deleting the dash. `--fix` only rewrites the one case that cannot change meaning (an em dash bracketing an aside becomes a comma), and never inside JS or TS source. It exits 2 rather than claiming clean when a file is not valid UTF-8, which is how a Word or Excel em dash hides.

#### Look at each slide before you build the next

Build one slide, then look at it. Not at the end — at every slide, while it is still the only thing you can change.

```
bun cli.mjs shot 7 --deck <topic>.html
```

One command, one PNG. Add `--no-qa` to skip the whole-deck QA pass that otherwise runs beside every capture; the loop does not need it. Add `--context` to capture the neighbours into a side-by-side page plus the live rhythm line — repetition is a property of the sequence, and the single-PNG loop cannot see it.

Open that PNG, then append a block to `<stem>-shots/verdicts.md`, keyed by slide number:

```
s7  eye lands on: what it is, not what it should be
s7  defect: what, where, the measurement that shows it
s7  fixed by: the one change
s7  re-shot: closed | open, because …
```

A defect names a measurement — px, size, count, position, contrast — because a vibe cannot be fixed and a number can. "Cramped" is a feeling; "the cards stop 60px short of the takeaway" is a fix. **`eye lands on` is the one field the HTML cannot answer**: where the eye actually rests is a property of the render, and guessing it from the source is how a slide that reads fine in code looks wrong on a screen.

Then make the one change, re-shoot, look again, append another block, and only then move to the next slide. **The first look is never the last** — a single look concludes nothing is wrong, which is how nineteen slides ship looking like one template.

A slide's art direction is settled when the next defect you could name is one you would not raise beside the person designing this deck. Three looks with a defect still open means the slide wants a **different treatment**, not a fourth fix.

`verdicts.md` is also the reviewer subagent's brief: hand it the shots directory and it reads the observations before the pictures.

#### The deck pass, before export

Then **capture all slides, open every PNG with vision, and sign off the deck** (`bun cli.mjs shot all --deck <topic>.html`, then read every PNG). The reviewer is an agent with image input, a human, or a dedicated reviewer subagent handed only the PNG directory. This is the step that catches what no script in this folder can see, and every slide gets a verdict on each of these:

1. Every icon tile holds a visible glyph: no blank tiles, no stranded glyphs, no brand mark that vanished on the light canvas (white or near-white fills read as empty; see `ICONS.md` → "Marks that vanish on this canvas").
2. One visual language per slide: UI glyphs and colored brand marks never share a row.
3. No card carries a void under a paragraph (a missing `.meta` key-point line), and no row of cards has one runt card breaking the row.
4. **Every slide earns its place**: the title states a conclusion the body then proves, no three consecutive slides share a treatment, and the bodies read as different objects across the deck — not five card grids with different words (`DESIGN.md` → "The variety rule"). One slide breaks the surface (oversized figure, lone sentence, full-bleed band); three dense slides in a row is a run however varied the treatments.
5. Every diagram reads at a glance: no mid-word sliced labels, no `?` glyphs, no black-ink chrome, no legend that collides.
6. No placeholder, bracketed note, `TBD`, or lorem anywhere; every number matches the content spec.
7. The deck hangs together: takeaway centred on every slide, and the sidebar lists the main narrative with the current slide highlighted, every entry with its icon, plus one Appendix entry when appendix slides exist (no scroll).
8. Every table marks what it is for: a tinted hero row, the significant value, a signed delta, a threshold note.

Items 4 and 7 are the only cross-slide judgements here, and the per-slide loop cannot make them: slide *N* has no view of slide *N+1*. Everything else the loop already covered, one slide at a time.

`shot` prints one absolute path per line precisely so the reviewer can walk them in order, and the integration pass in "Splitting the work across agents" re-runs this deck pass after assembly, because two correct halves can still collide at the boundary.

```
bun cli.mjs pdf --deck <topic>.html --out-dir ./presentations
```

**Done means:** exit 0, `wrote <stem>-vNNN.pdf ... N pages` where N equals the slide count, and **no** `PAGEERROR` line — plus a `verdicts.md` with a closed block for every slide and no open defect anywhere in the deck pass. A non-zero exit with page errors means the deck threw JavaScript and the PDF may be missing content: fix the deck and re-export rather than shipping it.

## Landed mechanics (do not reinvent)

Baked into the template. Keep them unless the user explicitly overrides:

- **Theme:** light by default. The first slide carries a presenter switcher (dark mode + four palettes), visible only on hover of the top strip; `DESIGN.md` → "Theme" for the contract.
- **Numbering:** the template owns it — `relabel()` writes each section's `aria-label` from the real slide count. Position lives in the rail, so a section supplies only `data-name`.
- **Stage:** `.slide` is exactly `1920×1080`; JS sets `scale(min(innerWidth/1920, innerHeight/1080))`. Never measure content to drive layout; `overflow: hidden` on every slide.
- **Navigation:** translucent edge-hover arrows plus the sidebar rail (click any entry to jump), clamped at the ends. Keyboard: arrows in both axes, space, PgUp, PgDn, Home, End.
- **Position display:** the in-slide `.toc` sidebar, main narrative only, current highlighted — it ships in the template.
- **Motion:** 0.2s fade on slide change, a staged band entrance at 40ms, 100ms and 200ms, an 80ms tile cascade, 0.25s on edge-button hover, a 450ms FLIP morph. `DESIGN.md` → "Motion".
- **Morph:** any element tagged `data-morph="<name>"` glides to the same-named element on the incoming slide, **vertically only**, because the deck navigates vertically (`DESIGN.md` → "Motion" for why, and for the pre-tagged pairs).
- **Text:** header copy is static; volatile detail lives in tooltips and footers.
- **Icons:** inline SVG copied byte for byte from `icons/`, tagged `data-icon` — bold Phosphor for UI, theSVG for anything with a real identity. `ICONS.md`.
- **Images:** `object-fit: contain` inside the `.shot` window frame. A cropped screenshot hides the part of the UI that proves the claim.
- **Contents entries:** a `.ti` entry is a `div`, not an `href="#"` — that would be focusable, announced as a link, and go nowhere. Rebuild from slide order when slides move.
- **Accessibility:** every slide carries an `aria-label` naming its position, written by the template, and `#live` announces it.

## Splitting the work across agents

Working solo, skip this section: one builder running the per-slide loop below,
with the inline scout pass from "Scout visuals with agents, in parallel".

One deck, several agents, no merge conflicts: give each agent one file area and never put two agents in the same file. For the deck, split by role — an icon scout (candidate icons, variant picks, contrast verdicts), a diagram designer (Mermaid sources), a builder (the deck HTML), and a reviewer that owns the screenshot directory. Each agent runs the per-slide loop on its own slides before handing off.

**Each agent's prompt gets two inputs and nothing else: this skill, and the content spec for its slides.** Keep design constraints out of the prompt. The skill teaches the tokens, the grid, the motion and the traps; a prompt that restates them is a second source of truth that drifts, and a prompt that contradicts them produces a deck that passes its own prompt and fails `check`.

One integration pass assembles the deck, re-runs `check`, and re-shoots every slide: two correct halves still collide at the boundary (duplicated `data-morph` names, a treatment repeated three slides running, a contents slide whose count is stale).

## Editing rules

1. Operate on explicit slide indices; assert the expected slide (title or marker) before mutating.
2. Prefer structural edits (parse sections, rebuild) over regex; after any surgery, assert div balance and section count before writing.
3. Scope replacements to one section. A global find/replace across slides is how decks get corrupted.
4. After every structural change: reload headless, assert zero page errors, re-run `check`, re-shoot the touched slides, look at them.
5. Do not commit anything unless asked.
