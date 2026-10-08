# Icons

**Search, do not guess.** `bun cli.mjs icons <words>` (or `scripts/find-icon.mjs`)
prints the exact file plus the `data-icon` value to use, with the variant rule already
applied. A guessed slug fails loudly, and this search is the only source of names —
every step below assumes it came first. Filter by source when the intent is clear:
`--ui` for interface glyphs (bold Phosphor), `--brand` for named products and
institutions (colored theSVG). An unfiltered UI query surfaces brand marks first,
which is the wrong answer for a glyph.

Two sources, both vendored inside `icons/`. Decks render offline in headless Chromium, so
anything not already there has to be vendored *before* the build.

## Contents

- [What is actually in `icons/`](#what-is-actually-in-icons)
- [Pick the variant, then check it](#pick-the-variant-then-check-it)
- [Phosphor is one weight: bold](#phosphor-is-one-weight-bold)
- [Size classes the template actually defines](#size-classes-the-template-actually-defines)
- [Contextual overrides outrank the size classes](#contextual-overrides-outrank-the-size-classes)
- [Where glyphs must sit (zones)](#where-glyphs-must-sit-zones)
- [Inlining: copy the root element, never rebuild it](#inlining-copy-the-root-element-never-rebuild-it)
- [Marks that vanish on this canvas](#marks-that-vanish-on-this-canvas)
- [What to do about it](#what-to-do-about-it)
- [Brand rows need a fixed box](#brand-rows-need-a-fixed-box)
- [Fetching something the bundle misses](#fetching-something-the-bundle-misses)
- [Rules](#rules)

## What is actually in `icons/`

Measured, not estimated. Re-check any time:

```sh
cd <skill>
find icons/coloredIconsMustUse -type f -name '*.svg' | wc -l
find icons/coloredIconsMustUse -maxdepth 1 -type f -name '*.svg' | wc -l
find icons/coloredIconsMustUse -mindepth 1 -type d | wc -l
find icons/phosphor -type f -name '*.svg' | wc -l
find icons -type f -name '*.svg' | wc -l
```

| Source | Path | Files | Shape |
| --- | --- | --- | --- |
| theSVG single-file marks | `icons/coloredIconsMustUse/<name>.svg` | 6465 | flat, one file per mark |
| theSVG variant marks | `icons/coloredIconsMustUse/<name>/` | 3105 across 960 folders | two or more files per folder, plus 22 single `color.svg` folders |
| Phosphor UI glyphs | `icons/phosphor/<name>.svg` | 1512 | flat, zero subfolders, every file `viewBox="0 0 256 256"` |

The split is mechanical: one flat `<name>.svg`, or one nested `<name>/<variant>.svg`
folder, never a mix of the two.

`bun cli.mjs icons <words>` is the index; it reads `icons/index.tsv`, which
`scripts/build-catalog.mjs` generates from the library plus its tag vocabulary.
Never read the TSV by hand — it is 8,937 rows of machine text. One word often
reaches an unrelated-looking file, because the tags carry categories and aliases
the filenames do not.

**Highest preference for anything with a real, recognisable identity: a company, a
product, an institution, an agency, a standard body, a language.** A card naming one
wants the real logo, not a generic glyph, so search `coloredIconsMustUse/` first. The
bundle is not software-only — `mayo-clinic`, `pfizer`, `novartis`, `gsk`,
`khan-academy`, `harvard`, `gov-uk-badge` all ship, and Phosphor carries `syringe`,
`microscope`, `gavel`, `scales`, `graduation-cap`, `bank`, `leaf`. When the bundle
misses a named institution, fetch it (see *Fetching something the bundle misses*);
a generic glyph is the wrong answer for something that has its own logo.

## Pick the variant, then check it

`coloredIconsMustUse` keeps colour. Its 9570 files break down as:

| Filename | Count | What it is |
| --- | --- | --- |
| `<name>.svg` (flat) | 6465 | the usual first choice |
| `default.svg` (nested only) | 938 | the usual first choice inside variant folders |
| `64.svg` / `32.svg` / `16.svg` | 326 each | fixed-pixel exports |
| `wordmark.svg` | 315 | the logotype, not the glyph |
| `dark.svg` | 198 | **for dark backgrounds. Never on this deck.** |
| `light.svg` | 197 | the light-background variant. Use it when present. |
| `color.svg` | 184 | full-colour version |
| `wordmark-dark.svg` | 113 | never |
| `wordmark-light.svg` | 111 | light-background logotype |
| `line.svg` | 38 | outline variant |
| `wordmarkDark.svg` / `wordmarkLight.svg` | 16 / 10 | stray casings, same meaning |
| `white.svg` `gold.svg` `logo.svg` `lockup.svg` `lockup-dark.svg` `icon.svg` `horizontal.svg` | 1 each | one-offs |

The rule:

1. If the mark is a flat `<name>.svg` file, use it.
2. If the mark is a nested folder, prefer `default.svg`, and that folder's `light.svg`
   over it when there is one.
3. **Never** `dark.svg`, `wordmark-dark.svg`, `wordmarkDark.svg`, or `lockup-dark.svg`.
   Picking the wrong one of these gives you an invisible mark and no error.
4. **Then verify the fill.** The filename convention is not sufficient on its own.

Two traps in the naming, both in nested variant folders:

- `dark.svg` sorts before `default.svg`, so `ls icons/coloredIconsMustUse/apple/*.svg | head -1`
  hands you the invisible one. Always name the file explicitly, never take the first glob
  match.
- `default.svg` is sometimes the white mark, so the nested rule alone is not safe. For
  `apple` the correct file is `light.svg`, which carries no fill attribute at all and
  therefore renders solid black.

## Phosphor is one weight: bold

`icons/phosphor/` is 1512 flat `.svg` files with zero subdirectories, all
`viewBox="0 0 256 256"`. There is **no** weight folder, no `regular/`, no `duotone/`,
and no `-duotone.svg` suffix anywhere in the bundle, so bold is the only weight there
is to choose.

The vendored set is **bold**, and you can prove it from the file: `airplane.svg` draws
its counters with `A12,12` / `a36,36`, where upstream regular uses `A8,8` / `a32,32`.
When the bundle misses a glyph, vendor its **bold** form with the fetch step below,
before the build starts, never from inside a slide.

## Size classes the template actually defines

`grep '\.ph' templates/template.html`, measured in headless Chromium:

| Selector | Size | Use |
| --- | --- | --- |
| `.ph` | 40px | the default in-card glyph |
| `.ph.xs` | 24px | inline, beside text |
| `.ph.xl` | 78px | standalone display glyph |
| `.qicon` | 78px tile, `border-radius:18px`, `background:var(--p1)` | pastel icon tile |
| `.qicon.sm` | 62px tile, `border-radius:16px` | smaller tile |

There is **no `.ph.sm`, no `.ph.md`, and no `.md` class anywhere.** Writing one anyway
fails quietly, in two different ways:

- `class="ph sm"` and `class="ph md"` both render at **40px**. The unknown class is
  dropped and the base `.ph` rule applies.
- `class="md"` on its own renders at **300x150**, the browser default size for a replaced
  element. That overflows the stage.

**No size class lands in a tile's 60 to 70% band.** `.ph` (40px) inside `.qicon` (78px)
is 51% of the tile, and `.ph.xl` (78px) is 100% of it and overflows `.qicon.sm` (62px)
by 26%. So the in-tile size is the one the template is missing — add it to the CSS:

```css
.ph.md{width:52px;height:52px}   /* 67% of .qicon, 84% of .qicon.sm */
```

Or set it inline: `<svg class="ph" style="width:52px;height:52px">`.

### Contextual overrides outrank the size classes

Two selectors set `.ph` width by ancestor, and each of them beats `.ph.xs` and `.ph.xl`.
Measured inside those containers, `class="ph xl"` renders *smaller*, not larger: 22px in
`.tagline`, 24px in `.stat-rail .st .hd`. Use the container's own size there.

## Where glyphs must sit (zones)

Four places, no exceptions — `check-visuals.mjs` names the slide and the naked
zone when one ships without a glyph:

- `.tagline`: every card tag carries its glyph.
- `.st .hd`: every stat tile heading carries its glyph.
- `.takeaway`: the bottom band carries its glyph.
- `data-rail`: every slide names one Phosphor UI glyph, rendered from the
  per-deck `RAIL_ICONS` registry in the template's own `<script>`.

That is the whole list the gate checks. `DESIGN.md` → "Icon coverage" states
the same rule from the deck's side, including the one that has no zone: no
`.s-body` ships text-only (pull close and section divider excepted).

## Inlining: copy the root element, never rebuild it

The body of a copied glyph is byte-checked: `check-visuals.mjs` compares it against the
vendored file, so a re-drawn or rebuilt body fails the gate. The rest of the root open
tag is not — only `viewBox` is — so a dropped `fill`, `stroke`, `width` or `height` there
passes, and that is the silent one.

- **4245 of the 9570 files (44%) put a `fill` attribute on the root `<svg>`**, and
  **3244 of those carry their only colour there**, with no fill on any child. Verified:
  `docker/default.svg` is `fill="#008fe2"`, `clickhouse.svg` is `fill="#FFCC01"`,
  `snowflake/default.svg` is `fill="#29B5E8"`.

  A tool that re-emits the root tag drops that attribute and the mark paints black. (288
  of the 3244 are `#000000`, where the damage is invisible; 124 are `currentColor`; the
  rest are brand colours that go black.) Only a screenshot catches it.

- **Copy the glyph's inner markup byte for byte; the root tag needs `viewBox`,
  `data-icon`, and its fill semantics, nothing else.** The provenance gate
  compares inner bytes only, so `width`, `height`, `xml:space` and the prolog
  are free — the deck's own CSS sizes every `.ph`. Never assemble the children
  from parts and never "normalise" them.

- **Namespace every instance's def ids.** Gradient, clip and mask ids are
  document-global: two inlined brand marks sharing `id="a"` resolve
  `url(#a)` to whichever comes first, so one logo silently wears another's
  paint (measured: a Google mark in Firefox colours, a blank Firefox). Append
  a per-instance suffix (`id="a-i2"`, and the same suffix in every
  `url(#a-i2)` and `href="#a-i2"` that names it). `check-visuals.mjs`
  normalises the suffix away before comparing bytes, so namespaced copies
  still verify as exact.

Before inlining a brand mark, see where its colour lives:

```sh
head -c 200 icons/coloredIconsMustUse/<name>.svg           # flat mark
head -c 200 icons/coloredIconsMustUse/<name>/default.svg   # nested folder
```

Colour in that first tag is the root-fill case.

## Marks that vanish on this canvas

The canvas is `--bg:#F3F7F7` (`templates/template.html`) and cards are
`--surface:#FFFFFF`. Contrast below roughly 1.35 against `#F3F7F7` reads as blank.
**814 files** fall below 1.35, and another 469 sit between 1.35 and 1.90. Measured by
dominant fill:

| Mark | File | Fill | Contrast |
| --- | --- | --- | --- |
| Apple, Notion, OpenAI, Vercel, MySQL, Go, Rust, Flask, Anthropic | `<name>/default.svg`, and `apple/dark.svg` | `#fff`, `#ffffff`, `#ffff` | 1.08 |
| Apple, **use this** | `apple/light.svg` | no fill attr, renders black | 19.46 |
| GitHub, dark variant only | `github/dark.svg` (`github/default.svg` is fine) | `#ffffff` | 1.08 |
| PostgreSQL wordmark | `postgresql/wordmark.svg` | `#fff` | 1.08 |
| PostgreSQL wordmark, **use this** | `postgresql/wordmark-light.svg` | `#336791` | 5.58 |
| JavaScript | `javascript/default.svg` | `#f0db4f` | 1.30 |
| ClickHouse | `clickhouse.svg` | `#FFCC01` | 1.40 |
| MongoDB | `mongodb/default.svg` | `#00ed64` | 1.46 |
| React | `react/default.svg` | `#58c4dc` | 1.88 |
| React, **use this** | `react/light.svg` | `#087ea4` | 4.29 |
| AWS | `aws/default.svg` | `#f90` | 1.98 |
| Figma | `figma/default.svg` | `#0acf83` | 1.90 |
| Snowflake | `snowflake/default.svg` | `#29B5E8` | 2.19 |
| Snowflake, better | `snowflake/color.svg` | `#249edc` | 2.78 |

Every one of those white `default.svg` marks except Notion has a `light.svg` beside it,
so `notion/` goes straight to step 2 of the ladder: its wordmark.

Note that `#fff`, `#ffffff`, and `#ffff` are all white: a four-digit hex doubles each
digit, so `#ffff` is `#ffffff`. Any script reading fills has to normalise 3, 4, and 6
digit hex or it will miss these.

A further 30 files are `fill="none"` with `stroke="#fff"`, so they draw nothing at all
here, mostly the flat `azure-*.svg` files.

### What to do about it

In order of preference:

1. **Use the light-background variant**: `light.svg`, `wordmark-light.svg`, or
   `color.svg` inside a nested folder as the case may be. Verify its contrast, never assume it.
2. **Use the wordmark instead of the glyph.** `wordmark-light.svg` is often the only
   dark-ink version of a mark whose glyph is white.
3. **Fall back to the UI glyph.** A Phosphor `currentColor` glyph at the same size is
   honest and legible; a blank 78px tile is not.
4. **Fall back to the product's own logo asset**, if the deck has one vendored.
5. **Last resort**, keep the shape and give it a darker brand-adjacent fill in CSS, then
   say so in `.meta` — the one recolour the native-colour rule allows.

Screenshot the slide before shipping. Contrast arithmetic is a screen, not a proof.

## Brand rows need a fixed box

viewBoxes are wildly inconsistent. Measured across the 9570 theSVG files: **1199
distinct width/height pairs**, width from 0 to 13547, height from 0 to 8782. Most common
are `24x24` (3867 files), `1024x1024` (883), `18x18` (617), `48x48` (454). A further 51
have a negative origin and 229 have no usable viewBox at all.

Phosphor is the opposite — all 1512 files are exactly `256x256` — so it needs no such box.
Left alone, a row of brand marks side by side will render at inconsistent visual sizes,
because each svg is fitted to its CSS box and then its viewBox is fitted inside that. Give
every mark in the row the same fixed box and let the viewBox letterbox within it:

```html
<div class="brandrow">
  <div class="brand"><svg viewBox="<the file's own>" preserveAspectRatio="xMidYMid meet"
       style="width:64px;height:64px" aria-hidden="true"><!-- copied file body --></svg></div>
</div>
```

```css
.brandrow{display:flex;gap:28px;align-items:center}
.brand{width:96px;height:96px;display:flex;align-items:center;justify-content:center;
       background:var(--surface);border-radius:var(--radius-sm)}
```

Keep the original `viewBox` and its negative origin. Rewriting the origin to `0 0 W H`
shifts the artwork. `preserveAspectRatio` already defaults to `xMidYMid meet`, so stating
it is belt and braces rather than the fix.

## Fetching something the bundle misses

Do this before the build, never from inside a slide. A single-file mark lands as
`icons/coloredIconsMustUse/<name>.svg` and a variant mark as
`icons/coloredIconsMustUse/<name>/<variant>.svg`; then run
`bun scripts/build-catalog.mjs` so the new mark is searchable.

- **theSVG**, MIT, no attribution required:
  `https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/<name>/default.svg`
  Detail page is `https://thesvg.org/icon/<name>`. Verified 200.
- **Phosphor bold**:
  `https://cdn.jsdelivr.net/gh/phosphor-icons/core@main/assets/bold/<name>-bold.svg`
  Verified 200. Note both the `assets/` segment and the `-bold` filename suffix;
  `.../assets/bold/<name>.svg` 404s. Check what you got: bold draws its counters `A12,12`,
  where regular draws `A8,8`.

## Rules

- **Balance optical sizes.** Glyphs differ in visual weight, so scale the svg inside its
  tile until two adjacent tiles look equally filled. Target 60 to 70% of the tile.
- **One visual language per slide.** Do not mix Phosphor outline glyphs with theSVG
  coloured brand marks in the same row. Group brand logos together, UI glyphs together.
- **An icon that carries the meaning gets the big tile.** Process steps, pipeline stages,
  tool and product cards: a full tile, never a 16px glyph lost in the text.
- **Colour.** `currentColor` for UI glyphs so the surrounding CSS drives them; the
  vendored Phosphor files already carry `fill="currentColor"` on the root. Brand marks
  keep their native colour; when a mark is invisible on this canvas, swap in
  `light.svg`/`wordmark-light.svg`/`color.svg`, and only as a last resort tint the paint
  darker in CSS and note it in `.meta`.
- **Light only.** Nothing gets a dark treatment, and `dark.svg` is never the right file
  for any slide in this deck.
- **Accessibility.** Decorative icons get `aria-hidden="true"`. Meaningful images keep
  real `alt` text. Inline SVG has no alt, so a meaningful mark needs a `<title>` or an
  adjacent visible label.
- **No emoji, ever.** Not in slides, not as icon substitutes, not in captions, not in
  button labels. The single carve-out is emoji inside quoted data, where the emoji is
  itself the content being shown.
- **Provenance on every glyph.** Each inlined `<svg>` inside a slide carries
  `data-icon="<path under icons/>"` (for example `phosphor/database` or
  `coloredIconsMustUse/google/default`), and `check-visuals.mjs` fails the deck
  when the attribute is missing or the file does not exist.
- **Never draw, always copy.** A re-drawn approximation of a bundled glyph is a
  failure, not a shortcut: the optical sizes, the counters and the root fill
  are measured properties of the file, and a lookalike carries none of them.
- **Gallery glyphs are schematic.** The glyphs inside
  `templates/slides/patterns.html` show placement, not artwork. Do not copy their bytes
  into a deck; source every glyph from `icons/` instead. `bun cli.mjs pattern <n>`
  collapses them to `data-icon` for exactly this reason.