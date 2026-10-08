# Auto-animate and fragments, as investigated

What reveal.js's two motion features actually do, read off its source rather than
its documentation, and what this skill kept, changed, and added when it ported
them. Written while building them: `decks/motion-demo/` is the deck that proves
it, `scripts/verify-motion.mjs` is the gate that keeps it honest, and every claim
below with a number in it was measured on that deck.

The upstream source is reveal.js 5.x, `js/controllers/autoanimate.js` (626 lines)
and `js/controllers/fragments.js` (375 lines), with the effect definitions in
`css/reveal.scss` and the property list in `js/config.ts`.

## Contents

- [Auto-animate: how it works](#auto-animate-how-it-works)
  - [Two phases, because a slide is display:none](#two-phases-because-a-slide-is-displaynone)
  - [Matching is four passes](#matching-is-four-passes)
  - [The transform, and the twelve properties that travel](#the-transform-and-the-twelve-properties-that-travel)
  - [Unmatched content](#unmatched-content)
  - [Code blocks](#code-blocks)
  - [The attributes](#the-attributes)
- [Fragments: how they work](#fragments-how-they-work)
  - [Sorting, and the index written back](#sorting-and-the-index-written-back)
  - [visible, current-fragment, and what each effect keys on](#visible-current-fragment-and-what-each-effect-keys-on)
  - [Nested fragments](#nested-fragments)
  - [Navigation](#navigation)
- [The port: six differences](#the-port-six-differences)
  - [1. Two mechanisms, not one](#1-two-mechanisms-not-one)
  - [2. Subtract the ancestors](#2-subtract-the-ancestors)
  - [3. Cancel the entrance, do not suppress it](#3-cancel-the-entrance-do-not-suppress-it)
  - [4. Lines pair by text](#4-lines-pair-by-text)
  - [5. The head arrives too, the rail never blinks](#5-the-head-arrives-too-the-rail-never-blinks)
  - [6. Restart is symmetric](#6-restart-is-symmetric)
- [What this deck adds that reveal.js has none of](#what-this-deck-adds-that-revealjs-has-none-of)
- [How it was verified](#how-it-was-verified)
- [What is deliberately not here](#what-is-deliberately-not-here)

## Auto-animate: how it works

The whole feature is one sentence: **when two adjacent slides both carry
`data-auto-animate`, find the elements that exist on both sides and animate each
one from where it was to where it now is.** Nothing is authored as a keyframe
except a list of CSS property names.

### Two phases, because a slide is display:none

`run(fromSlide, toSlide)` cannot measure the outgoing slide after the deck has
moved, so it does not try:

1. Both sections get `data-auto-animate="pending"`, which is also how it flags
   the direction for fragment buildup.
2. If the outgoing slide is hidden, it is temporarily given `display` so
   `getBoundingClientRect()` returns real numbers. Every measurement of the
   outgoing side happens here.
3. A **stylesheet** is built as a string of rules: for each pair, one rule pinning
   the from-state (`transition:none` plus the from transform) and one rule pinning
   the to-state under `[data-auto-animate="running"]`.
4. The whole stylesheet is assigned in one go (`insertRule` in a loop is
   documented as several times slower).
5. On the next `requestAnimationFrame` the section's attribute flips to
   `running`. That frame boundary is what applies the from-state before the
   to-state starts transitioning.

Everything is `!important` in that stylesheet, because inline styles on the
element would otherwise win.

### Matching is four passes

`getAutoAnimatePairs()` runs `findAutoAnimateMatches()` four times, and the order
is the design:

| Pass | Selector | Key |
|---|---|---|
| 1 | `[data-id]` | `tagName + data-id` |
| 2 | `h1`-`h6, p, li` | `tagName + textContent.trim()` |
| 3 | `img, video, iframe` | `tagName + src` |
| 4 | `pre` | `tagName + textContent.trim()` |

Inside a pass, for each element on the *incoming* side: the same key at the same
index wins, otherwise the nearest unused one. So a list that grows at the end
pairs entry for entry, and a key that appears twice cannot pair with the same
element twice.

After the passes, `getAutoAnimatableElements()` drops any pair whose incoming
element is already claimed, so the first pass wins per element. That is how
`data-id` beats an accidental text match.

Text pairs are marked `{scale: false}`: type is transitioned property by property
rather than scaled, because scaling text re-renders it at a fractional size.

### The transform, and the twelve properties that travel

`autoAnimateElements()` builds the delta in three parts:

- **translate** `((from.x - to.x) / presentationScale, (from.y - to.y) /
  presentationScale)`, rounded to three decimals to avoid sub-pixel blur;
- **scale** `from.width / to.width`, `from.height / to.height`, skipped when
  `scale: false`;
- **`transform-origin: top left`**, with `transform: none` on the to-side.

`presentationScale` is the divide-by-viewport-scale that every FLIP in a scaled
stage needs, and the reason is that reveal measures with `getBoundingClientRect()`
when centred and with `offsetLeft * scale` otherwise.

The property list lives in config as `autoAnimateStyles` and is short on purpose:
`opacity`, `color`, `background-color`, `padding`, `font-size`, `line-height`,
`letter-spacing`, `border-width`, `border-color`, `border-radius`, `outline`,
`outline-offset`. Anything else jumps. `line-height` is read as a ratio of the
computed values so an animating `font-size` carries it; the same value it
computes for the from side is computed while that slide is still displayed,
because a computed style read through `display:none` is not the same declaration.

Properties that come out equal are deleted, so an element whose geometry and paint
are unchanged gets no rule at all.

### Unmatched content

`getUnmatchedAutoAnimateElements()` walks the incoming slide's children: an
element is unmatched when it is not a target **and** holds no target, and the walk
recurses only into elements that do hold one. That guard exists for a reason the
comment states: fading a parent of a travelling element would fade the travel with
it.

Unmatched elements get one shared transition, `opacity`, for 80% of the duration
starting 20% in. `autoAnimateUnmatched: false` (or the attribute on the slide)
turns it off.

### Code blocks

This is the part worth stealing, and it is 20 lines. A `pre` pair gets
`{scale: false, styles: ['width','height']}`, and then, **inside** that pair,
`findAutoAnimateMatches` runs twice more:

- `.hljs .hljs-ln-code` keyed on the line's text, with
  `{scale:false, styles:[], measure: getLocalBoundingBox}`;
- `.hljs .hljs-ln-numbers[data-line-number]` keyed on the number.

Those classes exist because **highlight.js splits a code block into one element
per line when line numbers are on.** reveal.js does not ship a code splitter; it
borrows highlight.js's. The docs say so: *"Make sure that the code block has
`data-line-numbers` enabled and that all blocks have a matching `data-id` value."*

So the feature has a hidden dependency on a syntax highlighter it does not own.
Porting it to a deck with no highlighter means writing the splitter, which is
exactly what `.cl` is.

### The attributes

`data-auto-animate`, `data-auto-animate-id`, `data-auto-animate-restart`,
`data-auto-animate-duration`, `data-auto-animate-easing`, `data-auto-animate-delay`,
`data-auto-animate-unmatched`, plus `data-id` per element. Config: `autoAnimate`,
`autoAnimateMatcher` (a custom matcher function), `autoAnimateEasing`,
`autoAnimateDuration`, `autoAnimateUnmatched`, `autoAnimateStyles`.

Two details in the eligibility test that a port has to notice:

- `data-auto-animate-restart` is checked against **whichever slide is physically
  later in the document**, not against the direction of travel;
- `data-auto-animate-id` must be equal, **including absent on both sides**.

## Fragments: how they work

### Sorting, and the index written back

`sort(fragments)` splits them into two piles: those with a `data-fragment-index`,
bucketed by that number, and those without, each wrapped as its own group in
document order. The buckets are concatenated after the ordered ones, then
**renumbered 0,1,2... with no gaps**, and the new index is written back to
`data-fragment-index` on every fragment. So the index in the DOM is always dense
and always matches the step order, whatever the author wrote.

`update(index)` then walks that sorted list: `i <= index` gets `visible`, `i ===
index` gets `current-fragment` as well, and the current index lands on the
section as `data-fragment`.

### visible, current-fragment, and what each effect keys on

The base rule is `transition: all .2s ease` plus `opacity: 0; visibility: hidden`,
and `.visible` sets `opacity: 1; visibility: inherit`. Everything else is a
variant:

| Effect | Mechanism |
|---|---|
| `fade-out`, `semi-fade-out` | start visible, dim or hide on `.visible` |
| `fade-up` / `down` / `left` / `right` | a 40px translate, released on `.visible` |
| `grow`, `shrink`, `zoom-in` | a scale, released or applied on `.visible` |
| `strike` | `line-through` on `.visible` |
| `fade-in-then-out`, `current-visible` | keyed on `.current-fragment`, not `.visible` |
| `highlight-red` and friends | a hardcoded `#ff2c2d` / `#17ff2e` / `#1b91ff` |
| `custom` | suppresses the base rule so the deck writes its own |

Two facts fall out of that table and both matter to a port. **`visibility:
hidden` still occupies the box**, so a fragment layout is reserved from the first
step. And **an effect keyed on `.current-fragment` needs the sorted order to be
right**, since that is what decides which element is current.

### Nested fragments

Wrapping gives one element several steps: `fade-in` on the outside,
`highlight-red` inside, `fade-out` inside that. Each wrapper is its own fragment
and each contributes a step, in document order.

### Navigation

`navigateNext()` tries `fragments.next()` first and only moves the slide when that
returns false, so the key order is: this slide's steps, then the next slide. That
is the whole contract in three lines, and it is the same contract this skill
needed for its own arrow handler.

## The port: six differences

The port is in `templates/template.html`, inside the one `<script>`, and it is
named `animPlan()` / `playAnim()`. Same matching, same property list, same
timings as reveal's defaults: the pair runs `1.0s` on `ease`
(`autoAnimateDuration`, `autoAnimateEasing` in `js/config.ts`), and the unmatched
fade keeps reveal's own proportions, 20% of the duration in and 80% of it
fading. An earlier revision ran the morph at `0.55s` on the deck's snap easing,
on the theory that a projected deck steps faster than a laptop screen; against
the official site the result read as a different feature — same mechanics, none
of the float — so the timing now matches the site it was ported from.

### 1. Two mechanisms, not one

`data-morph` already existed and travels **vertically only**, on purpose: this
deck's rail is a column and Up/Down are as real a navigation as Left/Right, so a
morph that glided on X read as a carousel and the takeaway drifted sideways on
nearly every slide change. Auto-animate is content, and content moving from column
one to column three has to travel sideways to say so. So the port is a second
mechanism with a second rule, and an element may carry one or the other, never
both. It is the single most surprising thing about the result, and it is why the
two attribute families do not share a prefix in their names beyond
`data-auto-animate*`.

### 2. Subtract the ancestors

reveal.js gives every pair the full slide-relative delta. A card tagged
`data-id` whose `h3` also matches by text therefore gets a transform for the card
and another for the heading, and the heading lands at twice the card's travel.
reveal.js does not guard this, because the common case is a flat slide.

The port computes each pair's own travel as **its delta minus the accumulated
delta of its ancestor targets**, resolved recursively so the order pairs were found
in never decides the answer. That one rule produces all three of these correctly:

| Case | own delta | result |
|---|---|---|
| heading in a card that changed column | 968 - 968 = 0 | no transform, rides the card |
| line under a `<pre>` that moved up 36px because the block grew and re-centred | 36 - 36 = 0 | rides the block |
| the same line one row lower, pushed by an insertion above it | -36 - 36 = -72 | travels 72px inside a block that moved up 36, which is the 36px down the source asked for |

### 3. Cancel the entrance, do not suppress it

The first version suppressed the incoming slide's staged entrance and its tile
cascade with `.slide.animating>.s-body *{animation:none!important}`, which looked
correct in every frame captured inside the morph and was wrong at the end of it.
A suppressed CSS animation is not stopped, it is removed, and removing the class
re-creates it from zero, so the body rose a second time, 40% faded and 10px low,
as the morph landed. The same trap swallowed the section's own 0.2s fade, which
was first fixed with a permanent `.no-fade` class (`animation: fade .01s`) and is
now gone entirely.

`show()` cancels instead: `to.getAnimations({subtree:true})` filtered to the
section itself and everything inside `.s-body`, `.cancel()` each. A cancelled
animation stays cancelled, and `.animating` is left as a marker with no CSS of its
own, because a class that no animation rule mentions cannot restart anything when
it comes off. The head and the foot keep their entrance: they are chrome, and
chrome should arrive like chrome.

### 4. Lines pair by text

reveal.js pairs code lines by text with a same-index preference, which is right.
The port keeps that, and adds the part reveal.js does not have: the splitter.
`<pre><code>` becomes one `<span class="cl">` per line before the first `show()`,
walking nodes rather than text so a hand-written token span survives, and closing
and reopening a token that wraps a newline. A blank line keeps its span and CSS
gives it a `min-height`, because a blank line that collapses shifts every line
below it. Line numbers are stripped from the BLOCK key as well: the splitter
bakes a number into every line, so keying a numbered block on raw text
renumbered the whole block on any insertion and the pair never happened —
numbered blocks silently did not morph at all until this was fixed.

### 5. The head arrives too, the rail never blinks

reveal.js fades every unmatched direct child of the incoming slide, which on the
official site includes the title: it floats in late and quiet with everything
else. An early revision of the port started the walk at `.s-body`'s children, so
the head, the sub and the takeaway cut instantly while the body floated — the
biggest elements on the slide were the ones that never moved, which is what
"not the official animation" looked like from the audience. The walk now covers
the head, the body and the foot, and skips exactly two things: the rail, which
is on every slide so a fade on it would blink in the corner of the eye on every
change, and any `.fragment`, which owns its own opacity — a morph that faded one
in would flash a hidden step visible and snap it back at the end.

### 6. Restart is symmetric

reveal.js breaks the pair when the physically latter slide carries
`data-auto-animate-restart`, so travelling backwards through a restart boundary
still animates. The port breaks whichever way either side carries it. This deck
navigates up and down as well as left and right, so "the later slide" is a
direction rather than a position, and honouring it one way only leaves a
half-broken pair behind on the way back.

## What this deck adds that reveal.js has none of

- **A gate.** `scripts/verify-motion.mjs`, `bun cli.mjs motion`, the sixth step of
  `check`. It drives the deck and reads the numbers off the live DOM, because
  every failure mode above is silent: a screenshot, a PDF and a word count all
  look fine when the morph does not run.
- **The capture contract.** A fragment is invisible, not absent, so
  `body.no-anim` and `@media print` reveal all of them, and `qa-matrix.mjs`
  reveals them itself because it walks with the keyboard on purpose.
- **The live region names the step**, with `data-frag-label` to override what is
  read out for a fragment whose text is long.
- **The cascade skips fragments** (`:not(.fragment)` on every cascade rule),
  because a CSS animation beats a normal declaration and the `rise` fill would
  pin a fragment visible.
- **A settled-outgoing-slide rule.** `show()` skips the plan when the outgoing
  slide still has an animation in flight, since measuring through a moving element
  glides it from a place it was never at. The gate waits for the slide to settle
  before driving a pair, so the two agree.
- **A demo deck**, `decks/motion-demo/`, seven slides: three code slides that
  morph line by line, one slide with seven fragments, two card slides that swap
  columns.

## How it was verified

`scripts/verify-motion.mjs`, 33 assertions on `decks/motion-demo/`, all passing
(the count is per deck: it scales with the number of auto-animate pairs and
code blocks, because each pair is driven and read separately):

- every `<pre><code>` split into one `.cl` per line, every line box one line high
  (36px), `data-lineno` numbered on every line;
- each auto-animate pair: the outgoing slide settled, the pair ran, the count of
  transformed elements, and **no line whose text existed on both slides was handed
  to the unmatched fade**;
- each pair settles: no leftover `data-anim-target`, no `.animating`, no inline
  transform;
- the fragment slide: `data-fragment` reads `-1,0,1,2,3,4,5,6` across eight
  presses and the deck moves on after, the live region names each step, and
  `__noMorph` leaves zero fragments invisible;
- reduced motion asked for before load: `no-anim` set at boot, no transition, every
  fragment visible, no page error.

Numbers measured off the deck rather than asserted in prose:

- the queue card travels x 368 to 1336 across a column swap and lands exactly on
  1336, while the card that did not move has a delta of zero on both axes;
- the heading inside the moving card keeps a padding offset of 120px from the
  card's left edge before and after, which is the observable form of "it rode the
  card rather than doubling the travel";
- the code block grows 7 to 9 lines, three lines travel, and exactly the two new
  lines fade in;
- `return null`, which sat on row 6 of the first block, is row 8 of the third and
  is translating, not reprinted.

Plus `scripts/motion-frames.mjs`, which captures each transition at 40/150/280/420ms
and each fragment step, because a morph that measures correctly and looks wrong is
still wrong and no number in the gate can see it. The first version of that capture
found the defect in difference 3 above, four frames after the last frame anyone had
looked at.

## What is deliberately not here

- **A syntax highlighter.** Five hand-written token classes (`.tok-k`, `.tok-f`,
  `.tok-s`, `.tok-n`, `.tok-c`) and no library. The deck ships no dependency at
  render time, which is the same rule the icons and Mermaid are under, and a token
  is a span the author wrote. Every class also changes weight or style, so colour
  never carries meaning on its own.
- **A custom matcher hook.** `autoAnimateMatcher` is a reasonable extension point
  and there is nothing to plug into it yet.
- **Auto-animate on the print path.** Printing is one slide per page and no
  motion; every guard in this skill's motion section agrees.
- **Horizontal auto-animate on chrome.** The rule is one sentence and it is the
  difference between the two mechanisms: `data-morph` never glides on X, and
  `data-anim` never carries chrome.