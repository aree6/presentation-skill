# Plan: React states (state and setState, updates, batching, re-render behaviour)

Audience: developers who use React but guess about renders.
Argument in one line: state is a snapshot per render, setState queues the next render, and batching decides how many renders one event costs.

## Slides (9)

1. Cover (cover-flow, pattern 27). Message: React state is memory with a queue.
   Visual: three nodes Event / State / Render. Rail: megaphone.
2. State is a snapshot, and the setter queues the next one (grid3, pattern 16).
   Cards: Snapshot / Setter queues / Component scope. Fragments: one card per step.
   Rail: database.
3. useState declares the memory one component owns (code frame, pattern 33).
   Code: counter with three setCount(count + 1). Auto-animate pair with 4.
   Rail: file-code.
4. The updater form reads the queue, not the snapshot (code frame, pattern 33).
   Code: same block, three setCount(c => c + 1). Pair morphs line by line.
   Rail: file-code.
5. Bridge (ask, pattern 28, data-group bridge): So when do three updates become one render?
   No icon, no takeaway, no rail entry. Leads into 6.
6. Batching turns one event into one render (diagram + readout, pattern 1).
   Diagram: flowchart TD, 4 nodes, click to paint. Readout: 1 render, 0 renders
   for mutation, queue order. Rail: chart-bar.
7. Three rules keep state predictable (steps3, pattern 23).
   Steps: replace never mutate / updater form / lift only what is shared.
   Each step carries its exit test. Fragments: one step per press. Rail: check-circle.
8. Three calls in one handler cost one render (vbars + chiprow, pattern 6 core).
   Bars: mutate 0 / one handler 1 / three handlers 3. Rail: gauge.
9. Pull close (pattern 29): Treat state as a snapshot and the UI stays honest.
   Bigstrip of three counts from the deck. Rail: quotes.

## Treatments in order

cover-flow, grid3, code, code, ask, chartcol+diagram, steps3, vbars, pull.
The code pair is one auto-animate object. No other treatment repeats adjacently.
Card DNA appears once (slide 2). One oversized moment: the pull close.
One full diagram: slide 6. One bridge: slide 5.

## Motion

- Slides 3+4: data-auto-animate pair, data-anim="src" on both codeframes.
- Slides 2 and 7: .fragment steps in a row (layout reserved, horizontal).
- Motion coverage target: 4 of 9 slides step.

## Copy notes

- Titles are assertions. One idea per slide. No em dashes anywhere in the file.
- Code lines under 78 chars, 24px frame.
- Numbers on slide 8 are teaching counts (0, 1, 3), stated as such.
- STE: strict in plan, flavored in captions and key points, never in titles.

## Assets

- Icons: Phosphor UI glyphs only, plus the React brand mark (react/light.svg)
  on the cover. Rail icons reuse the template RAIL_ICONS registry, no new entries.
- Mermaid 12.0.0 vendored to decks/react-states/images/mermaid.min.js.
  Flowchart needs section 4 theming plus section 8 sizing, no type addendum.
