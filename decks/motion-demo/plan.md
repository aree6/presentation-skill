# Plan: motion-demo

The argument: **the change between two slides is information, so motion should
carry it.** A deck about motion has to demonstrate motion or it is a document with
slides around it, which is what this skill's own density rule says a deck should
not be.

Written before the HTML, per `SKILL.md` phase 1.

## Slides, in order, with the message and the visual

| # | Assertion title | Message | Proof / visual | Treatment | Bridge |
|---|---|---|---|---|---|
| 1 | The change between two slides **is the argument** | two motions, one rule | `.bigstrip` of three measured durations | hero cover | opens the question the code slides answer |
| 2 | The first pass is the smallest one that runs | the block before any change | `.codeframe`, 7 lines, numbered | code frame (gallery 33) | "and here is what one line costs you" |
| 3 | Two new lines slide everything below them down | a diff is a movement | same block, 9 lines | code frame | "and the last line is the claim" |
| 4 | The block ends where the argument ends | the throw replaces the shrug | same block, last line changed | code frame | "now leave the slide; the same rule holds inside one" |
| 5 | Three steps, and the presenter holds back two of them | the reveal is the presenter's | `.steps3` of seven fragments | steps3 + fragments | "and the change between slides is not the only motion" |
| 6 | Where the queue sits is the decision on this slide | order is the claim | `.grid3`, three cards tagged `data-anim` | grid3 | "so change the order and watch it move" |
| 7 | Moving the retry to the front halves the blast radius | the swap, stated | same three cards, two columns swapped | grid3 | close |

## Rules the deck holds itself to

- **Assertion titles** (content_philosophy rule 1): every title states a
  conclusion. None of them names the slide.
- **No filler:** seven slides, no appendix, no divider. One dense run is slides 2
  to 4, and they are a single walkthrough of one block growing, which is the one
  place a repeated treatment is the point.
- **Every slide body carries a visual:** a code frame on 2 to 4, seven fragments on
  5, a card grid on 6 and 7, a three-cell strip on 1.
- **The rail** lists all seven, main narrative only, each entry with its own
  glyph, and no two entries share a label.
- **Motion:** bare `data-auto-animate` on 1 through 7, so the chain links every
  boundary; the takeaway stays on `data-morph` because it is chrome; three
  `.fragment`s on 1 (the bigstrip cells), five `.fragment`s on 5. The bigstrip
  timing cell reads 1 s: the pair runs reveal.js's own duration, not the old
  0.55 s snap.
- **No diagram.** The deck's whole content is one code block and three cards, and
  there is no flow, timeline or system to draw. That is stated in the
  `data-diagram-reason` on `<body>` rather than left implicit.

## What this deck is for

It exists to prove the two features and to be the fixture the motion gate reads.
It is not a sample to copy: the gallery (pattern 33) is where a treatment lives.

- `decks/motion-demo/motion-demo.html` the deck
- `bun cli.mjs check --deck decks/motion-demo/motion-demo.html` the six checks
- `bun cli.mjs frames --deck decks/motion-demo/motion-demo.html` writes
  `motion-demo-motion/`, the mid-transition and per-step captures a script cannot
  judge
- `decks/motion-demo/motion-demo-shots/verdicts.md` the deck pass, with the
  measurement behind each defect it closed