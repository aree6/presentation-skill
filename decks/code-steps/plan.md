# Plan: code-steps

## Contents

- [Slides](#slides)
- [Motion](#motion)
- [Copy](#copy)

## Slides

1. Cover: Watch one program grow up (cover-flow: Declare, Grow, Run; three fragments).
2. Base: Five lines remember the count (code frame, 5 lines).
3. Handler: Growth pushes the old lines down (code frame, 9 lines; mid-block insertion).
4. Render: The frame grows with the lines (code frame, 10 lines).
5. Updater: Same rows, new reads (code frame, 10 lines, in-place updater rewrite; three fragment chips).
6. Close: Build up, never reprint (pull plus bigstrip, three fragment cells).

Narrative ends at slide 6. No appendix. No diagrams: the code is the diagram here
(`data-diagrams="none"` with the reason on `<body>`).

## Motion

All six sections carry bare data-auto-animate: the chain links s1 through s6.
Both pres carry data-anim src; the frame tweens with the lines. Fragments on
s1 (3 cnodes), s5 (3 chips), s6 (3 cells). Expected motion report: 6 of 6
slides step or pair; s2 to s3 moves 2 lines with 4 fading in; s3 to s4 moves 1
line with 2 fading in; s4 to s5 moves 0 lines with 1 fading in place (the
updater rewrite changes text, not rows).

## Copy

Titles are assertions. Line counts asserted nowhere except the cstep chips
("step N of 4"), which count code slides, not lines. Token palette tok-k/f/s/n
only; no comments in the code. No em dashes.
