# Design Language

Soft modern premium SaaS. Minimal, polished, friendly. Whitespace, typography,
soft pastel surfaces and rounded geometry create hierarchy: never heavy shadows,
neon colour, sharp corners, or dense layouts.

Token, type and grid values below were read out of `templates/template.html` and
`templates/slides/patterns.html`, the 33-slide pattern gallery, which carries the
same token block verbatim and holds a working reference for most treatments.

## Contents

- [Theme: light by default, switchable by the presenter](#theme-light-by-default-switchable-by-the-presenter)
  - [Tokens](#tokens)
    - [Signed data marks](#signed-data-marks)
    - [`--p` belongs to `.ring` alone](#--p-belongs-to-ring-alone)
  - [Typography](#typography)
    - [The type scale, as shipped](#the-type-scale-as-shipped)
    - [Emphasis inside a line](#emphasis-inside-a-line)
  - [Density budget](#density-budget)
    - [The 130-word gate](#the-130-word-gate)
    - [The test](#the-test)
    - [Per-zone rules (shape, not word count)](#per-zone-rules-shape-not-word-count)
  - [Slide anatomy (fixed, do not re-improvise)](#slide-anatomy-fixed-do-not-re-improvise)
    - [Never put flex on `.slide.active`](#never-put-flex-on-slideactive)
    - [Header text discipline](#header-text-discipline)
  - [Background texture (pick one per deck, then never change it)](#background-texture-pick-one-per-deck-then-never-change-it)
  - [Data marks](#data-marks)
  - [Slide chrome (every slide)](#slide-chrome-every-slide)
    - [Sidebar table of contents](#sidebar-table-of-contents)
    - [Icon coverage: mandatory, checked by a gate](#icon-coverage-mandatory-checked-by-a-gate)
  - [Vertical rhythm: centre, never stretch](#vertical-rhythm-centre-never-stretch)
  - [Screenshots and images: the window frame](#screenshots-and-images-the-window-frame)
    - [Blend mode: one white line over saturated cores](#blend-mode-one-white-line-over-saturated-cores)
  - [Diagrams](#diagrams)
  - [Visual vocabulary](#visual-vocabulary)
    - [Tile counts](#tile-counts)
    - [The variety rule](#the-variety-rule)
    - [Tables always highlight](#tables-always-highlight)
  - [Reference implementations](#reference-implementations)
    - [From `templates/template.html`](#from-templatestemplatehtml)
    - [From `templates/slides/patterns.html` (gallery only)](#from-templatesslidespatternshtml-gallery-only)
  - [Motion](#motion)
  - [Accessibility and robustness](#accessibility-and-robustness)
    - [Edit mode (presenter edits in the browser)](#edit-mode-presenter-edits-in-the-browser)
    - [The readiness contract](#the-readiness-contract)
  - [Pre-flight](#pre-flight)

## Theme: light by default, switchable by the presenter

**A deck ships light.** `--bg: #F3F7F7` on a white surface is the canvas: a
projected deck is read in a bright room by people who did not choose to be
there, and these decks get emailed, printed and forwarded, where dark prints as
a black rectangle. A deck that mixes light and dark slides reads as two
different products, which undermines the argument the deck is making.

**But the presenter can move it.** The first slide carries a theme switcher —
dark mode plus four palettes (slate, ink, forest, clay) — visible only while the
pointer is over the top strip of that slide, and nowhere else. The choice lives
on `<html>` as `[data-theme]` and `[data-palette]`, persists in localStorage,
and never reaches a capture: export and screenshots hide the switcher by
injection. Light stays the default the deck is designed against; dark is
something a presenter opts into for a screen, in the room.

**The tokens are the theming contract.** Every colour in the deck is a
`--bg/--surface/--text/--ink/--muted/--accent/--p1..p5/--pos/--neg/--warn`
token, and the whole alpha family hangs off `--ink-rgb` — one triple behind all
101 hairlines, tints and shadows (`rgba(var(--ink-rgb),a)`), so dark mode is a
token swap rather than a rewrite. A palette is a complete fifteen-token set:
canvas, surface, two text weights, accent, five pastels. Pastels sit behind
`--text`, so they stay light enough to clear 4.5:1; the accent is the only hue
held dark enough to read as text on `--surface`. Dark inverts the same fifteen
tokens once — surfaces lift rather than the canvas dropping.

A new palette is one `[data-palette]` rule setting the same fifteen tokens, and
the switcher discovers it from the stylesheet with nothing else to update. Name
it by intent, not by hue.

**Do not restyle a deck dark because the product it describes is dark.** A deck
should look like the category it presents to, professional and printable, not
like a screenshot of its own UI. If the product is dark-first, lift its semantic
hues into small accents inside the light deck — and the switcher is there for
the room that wants the whole deck dark.

## Tokens

The token block below is the default palette of `templates/template.html`. Read
the live block in the template before using it — it carries `[data-palette]` and
`[data-theme]` sets this table does not. There is no `--shadow` token: depth comes
from the background texture and the pastel surfaces, never from a drop shadow.

```css
:root{
  --bg:#F3F7F7;          /* page background; light is the default */
  --surface:#FFFFFF;     /* cards, frames */
  --text:#17191C;        /* primary text */
  --muted:#96999D;       /* captions, footers, axis labels only */
  --ink:#6B6F73;         /* darkened muted, for body copy that must be read */
  --ink-rgb:23,25,28;    /* the triple behind every rgba(var(--ink-rgb),a) */
  --accent:#2563EB;      /* the one hue allowed to mean something */
  --p1:#D3E7E5; --p2:#F7D1E1; --p3:#FFE3A0; --p4:#DCCFEA; --p5:#D8E7E8;
  --pos:#2C7A6B; --neg:#B8413B; --warn:#E9A93C;  /* signed data marks */
  --radius-lg:24px;      /* cards, tiles, panels (24-28px range) */
  --radius-sm:14px;      /* chips, inner blocks, stat tiles (12-16px range) */
  --radius-pill:999px;   /* every data mark and bar */
  --border:1.5px solid rgba(var(--ink-rgb),.08);
}
```

Contrast check before shipping: `--muted` (#96999D) on `--surface` (#FFFFFF) is
**2.8:1**, fine for decorative labels but **fails WCAG AA for body text**. Any
copy a reader is expected to read gets `--text` or `--ink`.

Rotate the five pastels across cards, badges and section accents so no two
adjacent elements share a surface tint.

### Signed data marks

Both templates declare these on `:root`, for marks that carry a direction or a
warning and must not wear the accent:

```css
:root{--pos:#2C7A6B; --neg:#B8413B}
```

They are the deepened forms of `--p1` and `--p2`, so the palette is darkened
rather than replaced. `--warn` is the amber hot mark, and both templates name it
rather than hard-coding the hex. Use these only where a mark carries a sign: a
waterfall bar, a delta in a table, a run that missed quota.

### `--p` belongs to `.ring` alone

`--p` is a bare number, `0`-`100`, set only by a ring's own `style="--p:92"`.
Nothing else on the slide touches it: `.ring` computes `calc(var(--p,50) * 1%)`,
and any inherited width value under the same name voids the conic gradient on
every ring, silently. Never share a custom-property name between two unrelated
marks.

## Typography

Two families, one job each, over the same Google Fonts link the production decks
use. Headless captures with no network fall back to Georgia/Inter/Arial, which
is why every stack ends in system fonts rather than assuming the webfont:

- **Nunito** carries everything read as information: body copy, labels, numbers,
  captions. Weights 400-800 from one variable file.
- **Lora 500 italic** carries only the assertion — `.head` and `.title-xl`.
  One cut, so both declare `font-weight:500` with slightly open tracking
  (`.005em`): a serif italic set tight goes loose and gappy, and a 700/800
  declaration against a 500-only file asks the browser to fake a weight.
- Muted sub-header under every hero title.
- **Type size is the main defence against the lecture-slide look.** If a slide
  only works at 20px body copy, the copy is too long, not the type too small.
  Card body copy belongs at 21 to 24px.

### The type scale, as shipped

Every row is a declaration in `templates/template.html`. Do not restate these
numbers in a deck; change the class, not the value.
| Class | Size / leading | Weight | Tracking | Role |
|---|---|---|---|---|
| `.title-xl` | 88px / 1.12 | 500 | +0.005em | cover title, centred, `.title-xl span` in accent |
| `.head` | 56px / 1.18 | 500 | +0.005em | slide assertion, `max-width:1600px` |
| `.head.sm` | 44px | 500 | +0.005em | assertion when the title is genuinely long |
| `.pull .q` | 70px / 1.16 | 700 | -0.03em | the one sentence that must land |
| `.subc` | 29px | 500 | | cover subtitle, centred, `.subc b` in accent |
| `.sub` | 27px / 1.4 | 500 | | the interpretive line under a `.head`, `max-width:1400px` |
| `.bigstat .n` | 172px / 0.92 | 800 | -0.05em | the one number, in accent |
| `.card h3` | 28px / 1.22 | 700 | -0.02em | card title |
| `.takeaway` | 23px / 1.35 | 600 | | the bottom band sentence, `b` in accent |
| `.toc .ti` | 23px | 600 | | contents entry label |
| `.pull .by` | 24px | 600 | | attribution under a pull quote |
| `.stat-rail .st .n` | 38px | 800 | -0.02em | stat tile number, in accent |
| `.glue` | 34px | 600 | | the separator between process steps |
| `.step h4` | 25px | 700 | | step title |
| `.ring span` | 36px | 800 | | the share, inside the ring, in accent |
| `.desc` | 21px / 1.46 | 400 | | card body copy on a tinted inner block |
| `.step p` | 20px / 1.44 | 400 | | step body copy |
| `.cnode .lbl` | 20px | 700 | | cover flow node label |
| `.vbars .vb .vv` | 20px | 800 | | bar value, in accent |
| `.meta` | 19px / 1.5 | 400 | | the key-point line, `b` in accent |
| `.badge` | 19px | 700 | | top-right status chip |
| `.toc .ti .ap` | 19px | 500 | | contents entry section label |
| `.stat-rail .st .t` | 19px / 1.4 | 400 | | stat tile caption |
| `.tagline` | 18px | 700 | +0.09em, uppercase | card tag, in accent |
| `.chip` | 18px | 700 | | the chip row under a mark |
| `.vbars .vb .lb` | 18px | 700 | | bar category label |
| `.stat-rail .st .hd` | 17px | 700 | +0.07em, uppercase | stat tile heading |
| `.cnode .sub` | 17px | 500 | | cover flow node gloss |

`.sub` is overloaded: it is the header subtext at 27px and `.cnode .sub` is the
cover gloss at 17px. Do not add a third meaning to it.

### Emphasis inside a line

Accent text (`span`/`b`/`em` in accent) is the default emphasis and usually
enough. Two more devices live in the template for the line that must land
harder, both inheriting the surrounding type so they work at any size:

- `.sketch` draws the hand circle in accent around one word. One per slide at
  most.
- `.mark` washes the marker behind two to four words.

Never both on one line. Gallery 7 washes its pull line, gallery 2 circles
its bridge word.

## Density budget

Run the gate on every deck and the three-step test on your own rendered slide.

### The 130-word gate

`bun scripts/check-density.mjs` fails a slide over **130 words** (or `node
cli.mjs check`, which runs it fifth; `--words` overrides the cap). The count
covers what the audience reads, headline, subline, body, takeaway and chips,
and excludes chrome; a diagram's own labels are not slide copy. The number is
measured, not tasted: `templates/template.html` reads median 60, worst 113 on a
four-card grid, so 130 sits just above the densest slide the reference deck
ships, with a copy edit of headroom. 130 is a floor, not a budget to fill.

`templates/slides/patterns.html` fails 7 of 33 at 130, median 110, worst s9 at
206, and that is the gate working: the gallery carries the fullest copy each
shape can hold, so judge a deck with this, never the gallery. On a failure,
rephrase to fall back under the cap, or split the slide in two.

Read the median the report prints: under 40 with nothing over 60, the shape is
almost certainly fine; over 70, the deck is a document with slides around it, and
the appendix split in `content_philosophy.md` rule 7 is the move, not a rewrite
of every sentence.

### The test

Run it on your own rendered slide, in this order.

1. **Say it aloud, with a timer.** Read the body out loud, at the pace you would
   actually speak. Under 25 seconds, it is evidence. Over 25, you are reading,
   not presenting, and the slide is a handout with a headline.
   25 seconds is about 60 words at a normal speaking pace. The count and the
   timer agree; the timer is the one you can actually run.
2. **Cover the body, read only the title to someone outside your field.** If they
   cannot state the takeaway, the body was not evidence, it was the argument.
   (This is `content_philosophy.md` rule 1. It is the load-bearing test.)
3. **Shrink the browser to 25% and look at the slide from across the room.** Name
   the single most important thing in three seconds. If the answer is "a
   paragraph", the slide is a handout. If the answer is a number, a shape or a
   sentence, it is a slide.

### Per-zone rules (shape, not word count)

| Zone | Rule |
|---|---|
| Slide headline | An assertion, sayable in one breath. About 12 seconds. |
| Prose blocks | At most one per slide, cut past about 35 words: `content_philosophy.md` rule 4. |
| Card copy | One claim plus its evidence. Card copy is not a place to put a paragraph. |
| Stat tile | A number, plus at most 8 words. |
| Bullets on a slide | 3, and the third has to earn its place. |
| A slide whose body is a data table or a diagram | Words are not the measure. Judge it by the legibility check in `MERMAID.md` §8, or by whether the table fits the band. |

The cap is per *prose*, not per slide element. A slide whose only body text is a
table gets the cap relaxed rather than waived — the count still prints, marked
`table`, and the slide is judged on fitting the band. That is not a hole: a
10×6 results table measured 128 words in cell text alone and failed the 130 cap
by 3, which is a gate measuring the wrong thing.

## Slide anatomy (fixed, do not re-improvise)

Every slide is exactly four bands, in this order, and the order never changes.
This is baked into the template as a four-row grid. Do not invent padding, do not
move the title, do not invent a header or footer.

```
row 1   the rail spans 1/-1 in column 1; every band sits in column 2
row 2   s-head    the assertion and subtext, centred
row 3   s-body    content, always the MIDDLE
row 4   s-foot    takeaway, centred
```

```css
.slide{display:none;width:1920px;height:1080px;flex:none;position:relative;
       overflow:hidden;background:var(--bg);padding:38px 120px 34px 48px}
.slide.active{display:grid;grid-template-columns:264px 1fr;column-gap:56px;
              grid-template-rows:auto auto minmax(0,1fr) auto;
              animation:fade .2s ease}
.s-head{grid-row:2;padding-top:4px}
.s-body{grid-row:3;display:flex;flex-direction:column;justify-content:center;
        min-height:0;padding:24px 0}
.s-foot{grid-row:4;padding-top:20px}
.s-head,.s-foot{grid-column:2}.s-body{grid-column:2}
nav.rail{grid-row:1/-1;grid-column:1}
```

Every band is `grid-column:2`. A `1/-1` on `.s-head` or `.s-foot` spans both columns and lands the title on top of the rail (measured: a 1752px header against a 264px rail).

- **The header is always at the top**, the **body always in the middle** and
  optically centred, the **takeaway always at the bottom** in `.s-foot`, centred.
  The centring comes from `justify-content:center` on `.s-body`, which is a flex
  column inside a grid row that has already been given `minmax(0,1fr)`.
- **Chrome is part of the grid, not an overlay.** `.s-foot` is row 4 and the rail
  spans rows 1/-1, so neither can drift out of alignment with the content. Two
  things are taken out of the stage flow because they must sit on top of it:
  `.badge`, which docks top-right, and `.slide::before`, the background texture.
  Two more are absolute inside their own component rather than the stage:
  `.ring::after`, which cuts the hole in a share ring, and `.sr-only`, which
  parks the live region off the page. `.edge` is `position:fixed` and lives
  outside every slide.
- **The takeaway is the slide's own conclusion**, written as a full sentence. Not
  a label, not "Key point:", not a repeat of the title. It is the sentence you
  would say out loud while pointing at the body.

### Never put flex on `.slide.active`

The grid above is what pins the title to the top and the footer to the bottom.
Overriding `.slide.active` with `display:flex; flex-direction:column;
justify-content:center` collapses the row structure into one centred stack: the
title drops from y=66 to y=229 and the footer lifts off the bottom edge.
Centring belongs on `.s-body` only, and that is already there.

### Header text discipline

Title is the assertion, centred, shrink-wrapped by `max-width` so a short
title reads compact and a long one takes the room it needs. Subtext is the
single interpretive line under it, centred with the title. If the title needs
a paragraph under it, that paragraph is body copy and the title is too weak.

So: "The raw inputs are public. The assembly is not." over "Anyone can download
the same four corpora. Rebuilding this is the part nobody has done." — never
"Defensibility" over a paragraph of context.

## Background texture (pick one per deck, then never change it)

Give every slide the same faint texture, faded out toward the edges so it never
competes with content. Choose one and carry it through the entire deck:
switching mid-deck is worse than a flat canvas.

Copy the texture block from `templates/template.html` (option A, `tex-dots`, the default) or `templates/slides/patterns.html` (option B, `tex-grid`, for tables and rails). Both live behind content, masked so they fade before the edges; `.slide.hero-slide` widens the mask. Set one on `<body>`, one per deck, never changed.

## Data marks

Marks are rounded geometry all the way down. Nothing in this deck is a sharp
rectangle: no square-ended bars, no angular charts, no 3D, no drop shadows on
data. `--radius-pill: 999px` everywhere a bar or track appears.

Copy the mark blocks from `templates/template.html`: `.pillbar`, `.vbars`, `.ring`
(`--p` is a bare number there), `.chiprow`.

`.pillbar` for counts against a maximum, `.chiprow` for labels and values, and
the choice between `.vbars`, `.ring`, `.meter` and the rest is in the treatment
table below. Label every mark directly; a mark with no number next to it is
decoration.

The gallery adds more marks, all documented in "Reference implementations" below.

## Slide chrome (every slide)

Chrome is **the rail plus the takeaway**, nothing else. There is no topbar
and no bottom footer: position lives in the rail, conclusion in the takeaway.

- **`.badge` docks top-right and is `position:absolute`.** It is for a status or a date, never a restatement of the slide title.
- **The takeaway hugs its content** (`width:fit-content`, centred): a full-width
  band behind two words reads as an empty bar, not emphasis. `check-density.mjs`
  excludes `.rail` like all chrome: sidebar labels are never slide copy.
  `check-visuals.mjs` fails a slide with no `nav.rail`.

### Sidebar table of contents

Position lives in a rail that is part of the slide, not an overlay pinned to
the viewport: every slide carries the same nav as its first grid column, so
it scales, prints, and exports with the slide instead of floating beside it.
It lists the main narrative only, with the current slide highlighted, so the
audience always sees where the talk stands.

**The rail is the deck's table of contents.** Build a `.toc` slide only when the
talk branches into sections worth walking the audience through, or when the deck
is read somewhere the rail does not travel. A linear argument does not need one:
the rail already carries the position, one entry per slide, and it is clickable.

- Each `section.slide` opens with its own `<nav class="toc">`, cloned from one
  builder (never hand-written per slide). One nav per slide keeps print, PDF,
  and screenshots correct with no special cases.
- Built at load from the real slide order: label from `data-toc`, falling back
  to `data-name`. One slide, one entry, in deck order, so a topic spanning
  slides gets one entry per slide with slice names rather than one entry
  quietly covering several. Two exceptions share one rule — the rail is the
  table of contents, not an index of everything: `data-group="bridge"` slides
  are skipped but highlight the entry of the slide they lead into, and every
  `data-group="appendix"` slide
  shares a single `Appendix` entry (icon borrowed from the first appendix
  slide's `data-rail`, click lands on the first appendix slide, highlighted on
  any of them) instead of one entry per slide.
- Short labels: 1 to 3 words each (`Problem`, `How it works`, `Provenance`).
  A `data-toc` longer than 4 words defeats the rail it sits in.
- Entries are `<button>`s calling `show(i)`: icon plus short label, no slide
  numbers — order is top to bottom, and numbers add nothing the position does
  not already say. The active entry wears the accent pill; hover stays subtle.
  The edge buttons yield clicks to the rail (`.edge` passes pointer events
  through except on its own button).
- Every rail entry carries an icon: each slide names one Phosphor UI glyph in
  `data-rail`, inlined at load from the per-deck `RAIL_ICONS` byte registry so
  provenance verifies exactly like slide art. A new glyph means a new registry
  entry: copy the vendored file's inner path bytes under its `data-icon` key,
  or the gate fails it as missing from the registry. Rail icons are never brand
  marks: unreadable small, and shared def ids across instances cross-contaminate.
- The rail is visually seamless: transparent background inheriting the slide
  canvas and texture, no border, no title label — only entries and the active
  pill. Entries are vertically centred in the column.
- Keyboard: Up/Down move slides exactly like Left/Right (plus space, PgUp,
  PgDn, Home, End). A focused rail entry consumes Space itself so one press
  never moves two slides.
- The rail never scrolls. It is `overflow:hidden`, vertically centred, with a
  constant full-slide height on every slide, and it steps down through **three**
  densities so every entry stays visible: `compact` past 16 main slides, and
  `micro` past 28. Two tiers are not enough, which the 33-slide gallery proves:
  the compact rows push the last entry onto the footer band, so the overview the
  rail exists to give is the thing that gets lost first. Measured, 33 entries
  need `micro`.
- Grid: the rail spans all rows (`grid-row:1/-1`) in column 1 so its height
  never depends on content — a rail sized by its neighbours drifts up and down
  between slides. Head, body and foot all take column 2; a head spanning 1/-1
  centres over rail+content while the body sits in column 2 alone, and that is
  the misalignment the header/body centreline check in `qa-matrix.mjs` fails on.
  Re-run the QA matrix on any deck that gains a rail: layouts tuned for full
  width can clip.

### Icon coverage: mandatory, checked by a gate

Every one of these carries an icon, always, no exceptions: every card
`.tagline`, every stat tile `.hd`, every `.takeaway`, and every rail entry (via
its slide's `data-rail` icon).

A zone without a glyph fails `bun cli.mjs check`: the visuals gate names the slide and the naked zone. Beyond the zones, **no slide body ships text-only**: each `.s-body` carries at least one icon tile, data mark, diagram, or framed image. The only bodies allowed to be pure words are the pull close and the section divider, and both still carry icon chrome.

Every glyph is copied byte for byte from `icons/` and tagged `data-icon` with its source path, so provenance is machine-checked: bold Phosphor for UI, colored theSVG for anything technical. Hand-drawn approximations, duotone or regular weights, and guessed brand marks never ship. Inline SVG only, per `ICONS.md`.

Note that `.tagline .ph` and `.stat-rail .st .hd .ph` set their own size and
outrank the `.ph` size classes. Do not fight them with `class="ph xl"`.

## Vertical rhythm: centre, never stretch

The defect to hunt is a card whose last child is **not** a `.meta` key-point
line, so `margin-top:auto` has nothing to pin and the void opens under a
paragraph. Equal height is correct and is not the defect: `.gridQ` and `.grid3`
are CSS grids, a grid item stretches to its row by default, and three cards in a
row are one shape that the eye compares.

- **`margin-top:auto` is the anti-stranding mechanism, not the thing that
  stretches them.** `.card` and `.step` are flex columns; the auto margin pins
  the last child (the `.meta` key-point line) to the bottom of that equal box
  while the heading and description stay packed at the top. The void, if there
  is one, lands *between* the description and the key-point line, where it reads
  as breathing room.

- **`margin-top:auto` replaces the child's own `margin-top`, it does not add to
  it.** So `.meta{margin-top:14px}` is silently discarded on any card where the
  meta is the last child, and a short card ends up with its key-point line flush
  against the paragraph above it, which reads as a typesetting mistake rather
  than as a pinned line. That is why both templates ship
  `.card>*:last-child{margin-top:auto;padding-top:14px}`: the auto margin does the
  pinning and the padding guarantees the gap.

- **An icon tile and the heading beside it share one centreline, so `.qhead` is
  `align-items:center` and not `flex-start`.** The tile is a fixed 78px and the
  heading stack beside it is one or two lines, so top-aligning hangs the tile
  below a one-line title and hangs the text below a two-line one; either way the
  pair stops reading as one object. `qa-matrix.mjs` asserts both centrelines
  within 2px, so this cannot quietly regress.

- Grids size their items by content and then equalise the row. Never `flex:1` a
  grid of cards, and never `align-items:start` on one, because then the cards are
  different heights and the row stops reading as a row.
- Never pin a `.takeaway` with `margin-top:auto`; it has `margin-top:26px` and
  lives in `.s-foot`, so the void can never open above it.
- Only a full-bleed image frame or a diagram may stretch. A `.stat-rail` does
  not need a fill mode: put the ring in `.st` and centre it with
  `align-self:center`, which is what deck slide 8 does.

**Centred is not the same as empty.** If content genuinely occupies less than
roughly 45% of the stage, the slide is under-built: add a `.takeaway`, a
`.stat-rail`, a third column, or move to a treatment with more shape.

## Screenshots and images: the window frame

Any slide holding a screenshot or a photograph puts it inside a macOS-style
window frame.

**The frame needs a visible edge, and this is not a detail.** `--surface` is
`#FFFFFF` and `--bg` is `#F3F7F7`: white on near-white is 1.04:1, so a frame with
no border has no silhouette at all, and the shot inside it reads as pasted onto
the canvas rather than captured in something. Give `.shot` the same
`1.5px solid rgba(var(--ink-rgb),.08)` hairline every other surface uses. No shadow:
`--shadow` does not exist in this system on purpose.

**And the frame needs a background, or the edge is not enough.** A window reads as
a window because its parts differ from each other, so give it
three tints inside the palette: a `--p5` tinted strip under the chrome bar that
fades to `--surface` by 42%, a bar that runs `--bg` into a translucent `--p1`,
and a "lit display" for the image area at `#FAFCFC` into `#EDF3F3`. Nothing
shadowed, nothing new in the palette, and the difference between the three is
what the eye reads as depth.

> **Implemented in `templates/template.html`, slide 10.** Copy the block from the
> template. `templates/slides/patterns.html` carries the same classes (line 646)
> but ships no slide that uses them.

The class names have no dashes: `.shotbar`, `.shotimg`, `.shotcap`, and the
address pill is `.shotbar .addr`. Copy them exactly. Then, for the frame itself:

- **`object-fit: contain`, never `cover` and never `fill`.** `cover` crops the
  screenshot and hides the part of the UI that proves the claim. `fill`
  distorts it.
- The three dots are decorative: `aria-hidden="true"` if they are real elements.
- The address pill is optional. When the screenshot's origin is the point, show
  it; when it is not, omit the element and leave the bar as three dots.
- The caption is a **band below the image**, inside the frame, not text
  floating over the image.
- Keep the frame's aspect ratio close to the source image. A 16:10 screenshot on
  a 1080px stage cannot fill the body band; `.shotimg` centres it with flex
  rather than a fill mode.

### Blend mode: one white line over saturated cores

`mix-blend-mode` belongs in exactly one place in this skill: one white line
over saturated colour cores, with `difference`. White resolves near-black on
`#F3F7F7` and inverts into a vivid complement where the line crosses a core:
accent blue answers in orange-gold, amber answers in blue, deep teal answers in
mauve. The word never changes colour and never goes translucent-pale; the
background answers it. It exists for one case: a long header overflowing onto
edge decoration, which has to stay readable there and visibly shift colour.

Copy `.blobstage`, `.blob` and `.bthead` from `templates/slides/patterns.html`
(gallery 32); the rules below are why each value is what it is.

1. **Single-colour type only.** The word is `#fff` and nothing else. A second
   colour doubles the backdrop interactions and neither can be reasoned about,
   because a blend has only one known colour and contrast arithmetic needs two.
2. **Cores must be saturated, or difference collapses to mud.** Over pastel
   tints white-minus-pastel is a muddy dark (measured), which is why this is
   the one place saturated colour is allowed — and only hues already in the
   skill (`--accent`, the `#E9A93C` hot mark, `--pos` teal), never a new one.
   Each core is solid to ~32% and gone by ~68%: a hard disc reads as a sticker.
   Blobs sit at the edges and never under body copy; only the headline may
   cross them. No blur filter is needed and none is allowed.
3. **No `screen`, `overlay`, `soft-light` or `color-dodge`.** Every one of them
   lifts ink lighter on this canvas, and nothing in this folder measures blended
   pixels, so any of them on text is unauditable.
4. **`isolation:isolate` is load-bearing.** Without it the glyph blends against
   the whole stacking context including the slide's own background, and the
   effect silently changes with whatever sits behind the stage.

**Show the code.** The pattern carries a three-line dark snippet (`.bcode`:
the one dark surface allowed, code display only) because the technique is the
content a builder copies. Property in sky, value in sand, nothing else.

Screenshot review is the only verification for blended pixels; there is no
checker for them and there cannot be.

**Gradients carry geometry in this deck, never surface colour.** No gradient
text, no gradient fills, no gradient surfaces. The gradients that exist are the
skill's own background texture and its mask, `.rule-fade`'s 1px
transparent-to-transparent hairline, and the fills inside three data marks:
`.ring`'s conic, `.donut`'s `--g`, and the `.blob` cores' radial fade to nothing
by 68%. Every other surface is a flat token. A reader cannot tell which stop
they got, so one stop that is too light fails silently for everyone, and on a
projected deck that is a word nobody can read and no tool in the folder reports.

## Diagrams

When the content is a system, a flow, a lifecycle, a schedule or a topology, it
belongs in a diagram, not in cards and not in a list. `MERMAID.md` is the
reference: Mermaid 12.0.0 syntax for fifteen diagram types, the light-canvas
theming workarounds, and the sizing recipes. Vendoring is a step, not optional:
`mermaid@12.0.0` is a pinned devDependency, so `bun install` here plus one copy
of the UMD build into the deck's own `assets/` (never a CDN; the ESM entry is
CORS-blocked on `file://`). See `MERMAID.md` §1 for the copy, §5 for the
readiness contract, and §4 for the theming that keeps a diagram from reading as
a screenshot pasted in from another product.

**A legible diagram in the wrong shape is still a bad slide.** The QA step
checks two independent things and the second is the one people forget: the
projected type size (floor 14px) and the share of its band the drawing occupies
(floor 25%). A five-node `flowchart LR` in a tall band letterboxes to a
comfortable 0.978, passes the type floor, fills 13% of the band, and reads as a
strip of pills in an empty box. A slide band is wider than it is
tall, so the default direction for a chain is `flowchart TD`, not `LR`;
`MERMAID.md` §3a is the table of band shape to direction.

## Visual vocabulary

Choose the treatment from the **shape of the content**, not from habit: a deck
where every slide is a three-up card grid reads as a template.

When the content has a shape, the treatment is not a choice: a process or
pipeline ships as a flow diagram, phases over time as a timeline or Gantt
(**undated phases** take `.timeline`; **a plan against elapsed time**, where the
relative lengths or the sequencing carry the argument, takes a Gantt anchored to a
stated base date, MERMAID §7.2.1),
two positions as `.compare`, a composition as a ring, meter or pie, a
hierarchy as a stack, treemap or mindmap, and a system as an architecture or
flowchart diagram. Cards are the treatment of last resort, for content with
genuinely no shape. A slide whose content matches a row in the table below
and still ships as cards is a missed visual, and the visual scouting pass in
`SKILL.md` exists to catch it before the build. A shippable deck with zero
Mermaid diagrams fails `check` (scaffolds under `templates/` are exempt:
starting points, not decks).

The fourth column says where a working reference implementation lives. **Deck**
means `templates/template.html`, **gallery** means `templates/slides/patterns.html`, and the
number is the slide in that file. Copy from there rather than retyping CSS.

| Content shape | Treatment | Why it fits | Reference |
|---|---|---|---|
| Three or four equal ideas | `.grid3` / `.gridQ` | Uniform weight is the point | Deck 3, 4. Gallery 3 |
| One item outweighs the rest | `.hero-split` + `.bigstat` | Asymmetric lead column at 560px | Deck 7 |
| Row of small equal metrics | `.stat-rail` | Equal-weight numbers, `.hd` per tile | Deck 8. Gallery 5 |
| One dominant number | `.bigstat` | 172px figure plus one caption line | Deck 7. Gallery 6 |
| Ordered sequence | `.numbered` | Editorial 01/02/03 with hairline rules | Gallery 10 |
| Phases over time, no dates | `.timeline` + `.exits` | Dots on a rail, owner and rollback each | Gallery 9 |
| A plan against elapsed time | Mermaid `gantt` | Durations and dependencies a row of dots cannot show | MERMAID §7.2.1 |
| Three horizons | `.steps3` + `.glue` + `.meta` | Each step carries its exit test | Deck 5. Gallery 8 |
| One sentence that must land | `.pull` | Centred statement, nothing competes | Deck 9. Gallery 7 |
| A distribution of shares | `.ring` | One share against one whole | Deck 8 (rail tiles carry rings; bare-number `--p`) |
| Categories against a value | `.vbars` | Rounded columns, labelled, no axis | Deck 6. Gallery 12 |
| Proportional bars with end labels | `.meter` | Label, bar, value in one ruled row | Gallery 11, 15 |
| Ordered climb with no plateaus | `.ladder` | Contiguous treads read as a stair | Gallery 18 |
| How a start became an end | `.waterfall` | Anchors on the baseline, signed bars | Gallery 17 |
| Stage to stage drop | `.funnel` | Honest widths, conversion per stage | Gallery 23 |
| Many similar items, none the point | `.dotfield` | Dot carries count and state at once | Gallery 21 |
| One share split several ways | `.donutrow` | Donut plus a legend with amounts | Gallery 22 |
| Exact row-by-row comparison | `.dtable` | Hairline rows, right-aligned numerals | Gallery 25 |
| Two positions on identical rows | `.compare` | The pair is the claim | Gallery 4 |
| A change a customer can feel | `.ba` | Muted before, tinted after | Gallery 27 |
| Qualifications or gates | `.checklist` | Every line is true or false | Gallery 26 |
| Layered system or pipeline | `.stack` | Offset cards implying depth | Gallery 20 |
| Mixed importance, three to five items | `.bento` | Tile sizes encode importance | Gallery 19 |
| A pipeline or system, alone | Mermaid + `.mmdbox` | The drawing is the slide; band shaped to the drawing | Gallery 13 |
| A pipeline plus three numbers | Mermaid + `.chartcol` | Diagram two thirds, readout names what to say | Gallery 14 |
| A plan against elapsed time | Mermaid `gantt` + `.readout` | Durations and sequencing, anchored to a printed date | Gallery 15, MERMAID §7.2.1 |
| A handover or integration | Mermaid `sequenceDiagram` | Drawing above, a `.bigstrip` of three numbers below, on a `hero-slide` | Gallery 16 |
| An ordered priority, no magnitudes | `.cascade` | Full-width bars, each inset further; order is the claim | Gallery 29 |
| A sequence to follow, four to six steps | `.zigzag` | One rail, entries alternating; halves the width each needs | Gallery 30 |
| A long tail that arrives pre-grouped | Three cards + `.minicloud` | Each card fills with uniform pills; no rotation inside a card | Gallery 31 |
| A long line overflowing onto decoration | `.blobstage` | One white headline, `difference`, edge blobs | Gallery 32 |
| Positioning on two dimensions | `.mxwrap` + `.matrix` | Both axes named and scaled | Gallery 24 |
| Four equal answers | `.gridQ` | Same anatomy on every card | Deck 4 |
| A change of gear | `.divider` + `.ghost` | Carries the section number, nothing else | Gallery 28 |
| Prose plus the numbers that prove it | `.tvo` | 40/60 split, never 50/50 | Gallery 11 |
| Chart dominant with a readout | `.chartcol` + `.readout` | Chart takes two thirds | Gallery 12 |
| Contents | `.toc` + `.ti` | Two columns, real slide numbers | Deck 2 |
| Cover | `.cover-flow` + `.cnode` | Three nodes is the ceiling | Deck 1. Gallery 1 |
| Screenshot or photo | `.shot` | Window frame, see above | Deck 10 |
| A caveat made to the audience | `.gapnote` | Dashed edge, no fill, under the claim it qualifies | Deck 6. Gallery 25 |

### Tile counts

`.numbered` is three to four. `.stat-rail` ships `repeat(4,1fr)`; with three
tiles, override to `repeat(3,1fr)` on the slide, or the fourth column renders as
a visible gap. `.timeline` is four windows: the gallery ships
`repeat(4,1fr)`, and the matching `.exits` strip below it is also `repeat(4,1fr)`,
so the two stay column-aligned. To run three phases you change both templates to
`repeat(3,1fr)`; never one alone. Never more than five items in any treatment.

The `.timeline` rail arithmetic is load-bearing, and `qa-matrix.mjs` measures
both centrelines and fails on the drift. The rail is drawn at `top:9px`, not at
the dot's top edge: the dot is a 20px box in normal flow, so its centre is 10px
down, and the rail is 2px tall, so for the two to share a centreline its top has
to be `10 - 1 = 9`. Set it to the dot's height and the rail passes one
dot-radius above every dot, so the dots look like they are floating over the
line instead of threaded on it.

```css
.timeline{display:grid;grid-template-columns:repeat(4,1fr);gap:0;position:relative}
.timeline::before{content:"";position:absolute;left:0;right:0;top:9px;height:2px;
                  background:rgba(var(--ink-rgb),.12)}
.timeline .tp .dot{width:20px;height:20px;border-radius:50%;background:var(--accent);
                   border:5px solid var(--bg);position:relative;z-index:1}
.exits{display:grid;grid-template-columns:repeat(4,1fr);gap:26px}
```

### The variety rule

Chrome is constant by design — rail, header, takeaway never change — so all
variety lives in `.s-body`. **Never use the same treatment on more than two
consecutive slides, and never let the body read as one object across the deck.**
When a section repeats a shape, change the treatment, not just the words.
Alternate card grids with hero splits, stat rails and pulls so no two adjacent
slides feel like the same object.

Treatments that share card DNA — `.grid3`, `.gridQ`, `.compare`, `.stat-rail`,
`.tvo`, `.numbered`, `.hero-split`, `.bento`, `.minicloud` — count as the same
object at deck scale even when they differ slide to slide: white cards, pastel
tiles, taglines on light canvas. Two card-DNA slides in any window of four is
the smell, and the fix is never a third card treatment.

Where the argument moves, prefer a bridge over another treatment. A `.ask`
bridge (gallery 2) asks the one question the previous slide earned, before
the next slide answers it — ask before you tell, since the audience doesn't
know what's coming: one centred line in `.title-xl`, key words in accent like
a cover title, nothing else on the slide, and `data-group="bridge"` so the
rail skips it. It earns its place when the next slide is the only answer:
cover everything after the question, and if it still asks for the next slide,
it stays.

What breaks card DNA, cheapest first:

- **Scale.** One figure at 172px (`.bigstat`, gallery 6) or one sentence alone
  (`.pull`, gallery 7) resets the eye. Every deck earns at least one such
  slide: a deck with no oversized moment has no gear change.
- **Density.** A sparse slide after two dense ones, or the reverse. Three dense
  slides in a row is a run regardless of treatment; split it with a pull, a
  single stat, or a section divider.
- **Frame.** Full-bleed diagram band, `.shot` frame, blobstage display line
  (gallery 32). Same content, different object.
- **Anchor.** Centered is the default; one left-anchored or asymmetric body per
  deck (hero-split, `.tvo` 40/60) breaks the mechanical down-the-middle rhythm.

A deck whose argument *is* a system, a lifecycle or a build legitimately needs
three diagrams in a row, and a content spec that asks for diagrams on two
consecutive slides is not contradicting itself. What the rule protects against is
two slides that look like the same object, and two diagrams do.

So when a run of diagrams is the right answer, change something else:

- **Alternate the frame, not the diagram.** One diagram full-bleed in the body
  band; the next diagram in a `.gridQ` beside a `.pull` quote or a short
  argument; the next in a `.shot` frame with a caption. Same `.mermaid` inside,
  three different slide objects.
- **Alternate the shape of the drawing**, which is free: `flowchart LR`, then
  `sequenceDiagram`, then `stateDiagram-v2` are three different silhouettes, so
  the slides do not read as one repeated object even in the same frame.
- **Never three identical frames in a row.** If two consecutive diagrams have to
  share a frame, the third must not, and if you cannot give the third a
  different frame then two of the three belong on one slide or in the appendix.
- **A single diagram repeated verbatim on two slides is a defect**, not an
  exception. It is either a build that did not get updated, or a leftover.

### Tables always highlight

A table is an argument, not a spreadsheet dump. Every table marks its point with
at least one of the emphasis devices `check-visuals.mjs` accepts — `tr.hot` for
the row under discussion, `.win` / `.outlier` for the value the table exists to
isolate, `.dlt` for a signed delta, `.note` / `.ns` for a threshold, `.hi` /
`.lo` / `.flag` for a band edge. A table where every row looks identical is
flat, and flat tables fail `check`: if nothing in the table deserves emphasis,
the content wants a different treatment, not a table.

## Reference implementations

Everything in this block exists in one of the two templates. Copy the block from
the template rather than retyping it here, because a copy nobody can diff rots
silently.

### From `templates/template.html`

The **Deck** column of the treatment table above is the slide-by-slide index;
copy from those. The template also carries the takeaway band, the token block,
the type scale, the four-row grid, the texture, the motion block and the
readiness contract.

### From `templates/slides/patterns.html` (gallery only)

These are the extra containers the gallery adds. They are not in
`templates/template.html`. Each is its own `/* ---- named ---- */` block in the
gallery's `<style>`, so find it by name rather than by line number: `.panel`,
`.own`, `.rule-fade`, `.kpi`, `.mini2`, `.meter`, `.numbered`, `.timeline`,
`.exits`, `.compare`, `.ba`, `.checklist`, `.stack`, `.bento`, `.dotfield`,
`.ladder`, `.waterfall`, `.funnel`, `.donutrow`, `.dtable`, `.mxwrap`/`.matrix`,
`.tvo`, `.chartcol`/`.readout`, `.divider`/`.ghost`, `.bigstrip`, `.cascade`,
`.zigzag`, `.minicloud`, `.blobstage` and the `.shot` frame.

Copy the block, or copy the whole gallery's extension section, when a deck needs
one. `.ghost` is the one place a large figure may sit behind content, at 3.5%
opacity, and only on a divider.

**Gallery 13 to 16 are the four diagram frames**, and they are the only place in
this skill where a Mermaid diagram appears in a working slide: 26 a `.mmdbox`
alone in a band shaped like the drawing, 27 a diagram inside `.chartcol` beside a
`.readout`, 28 a Gantt roadmap beside its horizons, 29 a `sequenceDiagram` above
a `.bigstrip` of three numbers on a `hero-slide`. Copying a diagram means copying
the **frame** as well as the source, because the frame is what makes the drawing
fill its band. Read `MERMAID.md` §3a first.

## Motion

Every selector in the motion block is on **one line**, and that is not a
formatting preference. Copy the block from `templates/template.html` verbatim: the
three band delays (40ms, 100ms, 200ms), the tile cascade over the ten containers
in the one-line `:is()` list with `--d` set on the tile, and the two identical
guards (`prefers-reduced-motion` plus `body.no-anim`). Keep every selector on
one line: a `:not()` or `:is()` list broken across lines parses as a descendant
combinator, which disables every `animation-delay` above while matching wrong
elements.

- **Slide change:** 0.2s opacity fade.
- **Staged entrance:** the three bands rise 18px and fade in, with delays of
  40ms, 100ms and 200ms, so a slide assembles rather than snapping on.
- **Cascade:** tiles inside the ten listed containers stagger individually, at
  80ms per tile, capped at the fifth. The delay is a custom property `--d` set
  on the tile, because a rule keyed on `.s-body`'s own children staggers the
  containers instead of the tiles inside them, which is the difference between a
  cascade and three cards arriving together.
- **Only those ten containers cascade**, and `.hero-split` is one of them: a new
  tile container will not animate until it is added to that `:is()` list, while
  a wrapper that merely holds a tile container, such as `.chartcol` or
  `.mxwrap`, is correctly left out so its contents never travel twice.
- **Morph between slides (FLIP shared element):** any element tagged
  `data-morph="<name>"` glides from its position on the outgoing slide to the
  same-named element on the incoming slide (450ms,
  `cubic-bezier(.22,.8,.24,1)`). The template pre-tags one name: `take` on
  `.takeaway`. The gallery adds `gal` on its caption band. Author more pairs
  deliberately for recurring diagrams or section headers, and never on unrelated
  blocks that merely look alike.
  **The morph travels vertically only.** This deck moves up and down: the rail is
  a column, the sidebar lists the talk top to bottom, and Up/Down are as real a
  navigation as Left/Right. The horizontal delta is measured and discarded, the
  scale runs from a `50% 50%` origin, and a pair whose only delta was horizontal is
  not a morph at all. Without that, `.takeaway` being `width:fit-content` and
  centred meant a longer sentence started further left, so the chrome drifted
  sideways on nearly every slide change while the audience was pressing down, and
  the deck read as a carousel rather than as a stack.
- **A pair that did not move does not glide.** The morph skips any pair whose
  vertical delta is zero and whose scale is 1. The takeaway sits in row 4 on every
  slide, so a same-height takeaway has a zero delta and is skipped; a takeaway
  whose height changed is the one that glides, which is exactly why it is the one
  to author for.
- **Navigation:** translucent edge-hover arrows plus the sidebar rail (click any
  entry to jump), clamped at the ends, no wrap.
- `window.__noMorph` sets `body.no-anim`, which kills the CSS animation, the
  staged entrance and the FLIP together. A PDF can otherwise capture a tile
  mid flight.

## Accessibility and robustness

These are in the template. Keep them.

- **Every slide carries `aria-label` naming its own position, and the template
  writes it.** `relabel()` runs once over every section at load and writes
  `Slide N of TOTAL: <data-name>` from the real slide count, so the number cannot
  drift when a slide is inserted. You supply only the name:

  ```html
  <section class="slide" data-name="two by two question grid, with a badge">
  ```

- **A live region announces the change.** `show()` copies the active slide's
  `aria-label` into `#live`, which is `role="status" aria-live="polite"
  aria-atomic="true"` and `.sr-only`. Because the text is read off the slide's own
  label, the announcement cannot drift from the slide.
- **A contents entry is a `.ti` element, not an anchor.** `href="#"` is
  focusable, announced as a link, and goes nowhere. Use `<a class="ti">` only
  where the entry really navigates.
- **The edge arrows stop propagation, not just the default.** Space and Enter
  are handled on the arrow *and* on the document handler, so `preventDefault`
  alone lets one key press move two slides.
- **The arrows leave the tab order at the ends** via `visibility:hidden` on
  `.edge.off`, and `.edge:focus-visible` reveals the button while suppressing
  the container outline.
- **`@media print` is a real path.** It turns every slide back on with
  `display:grid !important`, gives each one `break-after:page`, hides the fixed
  nav arrows (which would otherwise land on every page), the themebar and hit
  strip, and the icon modal, and kills all motion.
  Ctrl-P therefore produces one slide per page.

### Edit mode (presenter edits in the browser)

A human path, not an agent path: agents build decks through this skill, and a
presenter fixes a typo or swaps a glyph without touching source. Toggled from
the themebar as Edit, available on every slide, off on load.

- **Scope is an allowlist, not the document.** Titles, body copy, captions,
  table cells: `.head`, `.sub`, `.takeaway`, card and step copy, stat and strip
  numbers, `td`, `th`. Chrome (rail, themebar, modal) is never editable, and
  the deck's own arrow-key navigation stands down inside editable text, form
  fields, buttons, and the modal — typing a space in a headline must not
  advance the slide.
- **Editing is a body class.** `body.editing` draws the outlines and enables
  `contenteditable`; leaving edit mode removes every attribute it added, so a
  deck restored to non-editing is byte-identical to one never edited. Nothing
  written while editing survives except the text and the replaced icons.
- **Icon search reads generated data.** `bun cli.mjs icons build` writes
  `assets/icon-index.js` plus per-letter `assets/icon-files/` from the vendored
  library; the modal lazy-loads both over `<script>` (which file:// allows)
  only when it opens. Matching mirrors find-icon's scoring, and replacement
  keeps the old node's sizing contract while taking the new file's bytes, which
  is what the provenance gate checks.
- **Exports keep the look, never the editing state.** HTML serializes the live
  document minus outlines and attributes (plus a self-closing-tag collapse, or
  serialization alone breaks byte-provenance on every glyph), keeping the theme
  choice. PDF is the print path. Captures hide the modal by injection, like the
  themebar.

### The readiness contract

A deck may draw itself asynchronously: a diagram library, a chart widget, a web
font. Anything that measures, screenshots or exports must wait for it. **The
template owns the promise; a deck registers work and never assigns it.**

Register any deferred work with `defer(...)`, from any script **after the
template's own script**, which is the last script in the document:

```js
defer(renderDiagrams());          // inside the deck script
window.__deckDefer(renderDiagrams());   // or from a separate <script> tag
```

Three things this deliberately is not:

- **Not a collected array.** `Promise.all(deferred)` has to be evaluated at one
  fixed line, and that line is an ordering rule every caller must know. A counter
  has no snapshot point, so there is nothing to get wrong.
- **Not assignable by a deck.** `window.__deckReady = myPromise` replaces the
  template's promise, and the template's own `Promise.all` then runs over an
  empty list and resolves immediately while the render is still in flight.
- **Not a fixed timeout.** Both scripts await the promise, then `document.fonts`,
  then a short settle for CSS transitions. A deck that lazy-loads anything must
  `defer()` it, which is the same contract.

`scripts/export-pdf.mjs` and `scripts/qa-matrix.mjs` await
`window.__deckReady`, which a deck that draws nothing extra resolves at `load`.
See `MERMAID.md` for the diagram side, which is where it is mandatory, and for
the two ordering rules that are not obvious: call `mermaid.initialize()` before
any `await`, and register rather than assign.

## Pre-flight

1. Titles alone, in order: they form an argument (`content_philosophy.md` rule 1). Density test on the densest slide ("Density budget").
2. No stranded cards (a void under a paragraph means a missing `.meta`), no naked icon zone anywhere ("Vertical rhythm", "Icon coverage").
3. Treatment variety holds, diagrams alternate frame or type ("The variety rule"). Content with a shape ships as a diagram, never as cards ("Visual vocabulary"). No `TBD`, `TODO`, `lorem`, bracketed notes; a `.gapnote` reads like a claim (`content_philosophy.md` rule 6.1).
4. `bun cli.mjs check --deck <deck>.html`: one verdict over docs, dashes, visuals, QA and density. Read the per-slide visual audit, the diagram figures and the median, because a pass is not the same as good.
5. Feed every screenshot to the reviewer and sign off each slide against the eight-line checklist in `SKILL.md` section 4. If the deck has a diagram, run the diagram pre-flight at the end of `MERMAID.md` too.
6. Motion plays on every slide; the export wrote `N pages` with no `PAGEERROR`.