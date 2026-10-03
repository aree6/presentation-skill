# Deck plan — Jev by TypeSafe AI

Source: typesafe.ai, docs.typesafe.ai, evals.typesafe.ai, jevtypesafeai.com, plus the
TypeSafe AI blog posts "Introducing System One Models & Jev" and "The Bitterest Lesson".

## The argument, in one line

Frontier models were optimised for a person reading words, so almost none of that
intelligence runs unattended inside software. Jev is built for the machine instead:
it returns typed values with calibrated probabilities instead of generated text.

## Chain applied

- **Observation** → RLHF made models superhuman at chat; after trillions of dollars,
  most software still isn't meaningfully intelligent.
- **So what?** → the bottleneck is not raw intelligence, it is that today's
  intelligence is hard to build on.
- **Interpretation** → strings must be parsed, validated, and cannot be trusted to be
  well-typed; software needs a decision it can branch on.
- **Decision** → give up string generation: new architecture, parallel sampler, RLCD.
- **Consequence** → 70–500 ms, 40–200× faster, $42/Btok in and output free, and a schema
  match guaranteed by construction rather than by retry.

## Slides (assertions, in order)

| # | Assertion (title) | Proof / visual | Treatment | Source |
|---|---|---|---|---|
| 1 | Cover: Jev, TypeSafe AI's first System One model | three-node cover flow | pattern 1 | typesafe.ai |
| 2 | RLHF optimised every frontier model for a person on the other side of the screen | five identical rows, chat vs program | `.compare` | blog frontiers table |
| 3 | Bridge: what does a model look like when it is built to be called rather than read? | one centred question | pattern 2 `.ask` | — |
| 4 | A Jev call is one request, and every field of the response is code | fan-out/fan-in diagram | `.mmdbox` + mermaid | docs quickstart response |
| 5 | Three question types cover the decisions software actually has to make | Choice / Score / Noul with real output | `.grid3` | docs primitives |
| 6 | Every LLM answer today is a four-rung ladder your code has to climb | stepped silhouette, 5 treads | `.ladder` | inferred from JSON mode + validation |
| 7 | Seventy milliseconds to half a second, and a fraction of a cent per decision | four equal metrics + caveat | `.stat-rail` | docs models; blog nuance |
| 8 | Everything else in the contract is a published limit you can check | spec table, pricing row tinted | `.dtable` | docs models |
| 9 | On their own workflows TypeSafe reports 193.6× faster and 444.6× cheaper | one 172px figure + two tiles + caveat | `.hero-split` + `.bigstat` | typesafe.ai; blog nuance |
| 10 | Training scores the probability against the outcome, not the wording against a rater | training loop diagram | `.mmdbox` + mermaid | docs ML primer; blog |
| 11 | Confidence is what turns an answer into a routing decision | decision-tree diagram + three numbers | `.chartcol` + `.readout` | docs confidence |
| 12 | The workloads that want this are the ones where the answer shape is already known | four equal cards | `.gridQ` | docs patterns; jevtopics |
| 13 | One POST in, and the branch you were going to write anyway | reconstructed request/response in a window frame | `.shot` | docs quickstart |
| 14 | Use an LLM to write. Use Jev to decide. | lone sentence | `.pull` | jevtypesafeai API page |
| A1 | Jev 1.13.0's published limits | spec table | `.dtable` | docs models |
| A2 | Five things TypeSafe has not published | numbered list | `.numbered` | blog nuance; wikipedia |
| A3 | How confidence is computed from the distribution | formula table | `.dtable` | docs confidence |

Narrative ends on substance at 14. Appendix carries the checkable proof: 10, 11 and A2
are the honesty slides and stay in the main flow.

## Bridges

- 2 → 4: slide 3 asks the question slide 2 earned. Cover it and the only remaining
  answer is slide 4's shape.

## Variety read out loud

cover-flow, compare, ask, diagram, grid, ladder, rail, table, hero-split, diagram,
diagram-beside-readout, grid, shot-frame, pull.

Two card-DNA slides in two windows of four (2+5, 9+12), never adjacent. Gear changes
at 9 (172px figure) and 14 (lone sentence). The two adjacent diagrams at 10 and 11
change frame (full band vs chartcol) and silhouette (cycle vs decision tree).

## Design deviations

None. `DESIGN.md` as shipped, `tex-dots` texture, light theme, gallery extension CSS
copied by name.

## Carried honesty

- Slide 7 gapnote: published evals run from laptops on the US West Coast; TypeSafe
  says it cannot yet prove the price is not subsidised.
- Slide 9 gapnote: TypeSafe says 193.6×/444.6× are the high end, workflows were written
  by their own team, and the reference is the average of two frontier models.
- Slide 10 gapnote: architecture, weights and parameter count are not published.
- Slide 6: the ladder is this deck's reading of what schema validation costs, stated as
  such in the subline.