# Plan: React for JavaScript developers

## Contents

- [Slides](#slides)
- [Bridges](#bridges)
- [Stepping](#stepping)
- [Treatments in order](#treatments-in-order)
- [Copy rules](#copy-rules)

Audience: fluent in modern JavaScript (closures, modules, DOM). Never used React.
Thesis: React is JavaScript aimed at the screen. Each slide bridges one JS idea to one React move.

## Slides

1. Cover (cover-flow): React Is JavaScript Aimed At The Screen. Message: you bring functions, closures, modules. React adds three moves. Visual: 3 cover nodes. Steps: nodes fragment in.
2. Bridge (data-group=bridge): You Know Functions, Closures And The DOM. What Does React Add. Message: the seam question. Visual: none (bridge).
3. Compare: A Component Is A Function Whose Return Value Is UI. Proof: row-by-row JS function vs component. Visual: compare pair, fragments per side.
4. Code A: Plain JavaScript Already Describes This Button. Proof: createElement call block. Visual: code frame. Pair with 5 (data-auto-animate, data-anim=src).
5. Code B: JSX Is That Call Wearing HTML Clothes. Proof: same block rewritten in JSX. Visual: code frame, lines morph.
6. Diagram plus readout: React Re-runs Your Function, Then Patches Only What Changed. Proof: flowchart TD render loop. Visual: mermaid flowchart plus 3 readout numbers. Readout fragments.
7. Compare: State Is Memory That Re-runs The Function. Proof: let variable vs useState rows. Visual: compare pair.
8. Diagram full band: Props Flow Down, Events Call Back Up. Proof: sequenceDiagram parent to child. Visual: mermaid sequence, full band frame.
9. Steps: An Effect Syncs Your Component With The Outside World. Proof: 3 steps each with exit test. Visual: steps3, fragments.
10. Checklist: Four Rules Keep Hooks Honest. Proof: checklist with verdicts. Visual: checklist gates.
11. Table: Five JS Ideas Map To Five React Moves. Proof: dtable with hot row and delta. Visual: dtable.
12. Pull close: You Do Not Learn React. You Aim JavaScript At The Screen. Proof: bigstrip of three counts. Visual: pull plus bigstrip.

## Bridges

- s1 to s3 via s2: s1 names three moves, s2 asks what React adds, s3 answers with the first move.
- s5 to s6: code shows what UI looks like, s6 asks when it updates, answers with the loop.
- s8 to s9: props move data, s9 asks about the world outside props, answers with effects.
- s11 to s12: table maps each idea, s12 closes with the single sentence.

## Stepping

- Fragments: s1 nodes, s3 sides, s6 readout, s7 rows, s9 steps, s12 strip.
- Auto-animate pair: s4 to s5 code morph (data-anim=src).

## Treatments in order

cover, bridge, compare, code, code, diagram plus readout, compare, diagram full, steps, checklist, table, pull. No two adjacent share a body object except the deliberate code pair. Card DNA appears at s3 and s7 only, never twice in any window of four.

## Copy rules

Assertion titles. One idea per sentence. Active voice. No semicolons in prose. No em dashes. Numbers carry the claim.
