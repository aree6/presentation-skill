# Slide Philosophy

Seven rules about the argument, and one about the sentences that carry it. A slide
must obey all eight to be worth the audience's attention. Read at plan time,
before any HTML exists.

## Contents

- [1. Assertion-Evidence Architecture](#1-assertion-evidence-architecture)
- [2. The "So What?" Chain](#2-the-so-what-chain)
- [3. The Insight Bridge](#3-the-insight-bridge)
- [4. Cognitive Constraint (One Slide, One Idea)](#4-cognitive-constraint-one-slide-one-idea)
- [5. Translation to Consequence](#5-translation-to-consequence)
- [6. Radical Clarity \& Intellectual Honesty](#6-radical-clarity--intellectual-honesty)
  - [6.1 The deck ships complete](#61-the-deck-ships-complete)
- [7. The Narrative vs. Appendix Split](#7-the-narrative-vs-appendix-split)
- [8. Sentence-Level Clarity (ASD-STE100)](#8-sentence-level-clarity-asd-ste100)
  - [Where it applies, and where it does not](#where-it-applies-and-where-it-does-not)
  - [What it agrees with, and what it costs](#what-it-agrees-with-and-what-it-costs)
  - [The three ways a STE rewrite goes wrong](#the-three-ways-a-ste-rewrite-goes-wrong)
  - [Checking it](#checking-it)
- [Check](#check)

## 1. Assertion-Evidence Architecture

Never use topical labels for slide titles (e.g. "Methodology," "Background," or
"Results"). Every slide title must be a complete, declarative sentence stating
the exact conclusion the audience must accept. The slide body exists solely as
visual evidence to prove that single claim.

**Self-test:** cover the slide body and read only the title to someone outside
your field. If they cannot state the takeaway, the title failed.

| Label (fails) | Assertion (works) |
|---|---|
| Market Opportunity | 3.1M US software engineers re-prep for technical interviews every year |
| Our Solution | We turn a job description into a 6-week, evidence-backed study plan in 40 seconds |
| Traction | 412 candidates used the extension this month; 34% returned a second week |
| Data Moat | We normalized 4.2M public records into one schema no one has assembled |
| Team | We spent 9 months inside the interview loop before writing a line of product code |

## 2. The "So What?" Chain

Filter every fact through a relentless "so what?" test until it yields a
concrete consequence the audience cares about. Apply the Pyramid Principle:
give the conclusion first, followed by mutually exclusive supporting arguments,
then the evidence. If a bullet point does not change how the audience thinks or
acts, delete it.

Chain template, applied until it terminates:

> **[Observation]** → so what? → **[Interpretation]** → so what? → **[Decision
> you made]** → so what? → **[Business consequence]**

Rule of three is not arbitrary: humans hold 3-4 items in working memory.

## 3. The Insight Bridge

Presentations fail when they jump from a generic problem to a conclusion. Strong
narratives pivot on an insight: a reframe, a hidden mechanism, or a challenge to
the status quo. Frame the current state as a specific friction or
misconception, then introduce the insight that makes your thesis inevitable.

The insight gets its own slide. Do not merge it into the problem slide, and do
not let the solution arrive without it. A problem to solution deck with no
bridge is a feature pitch.

A seam may earn a smaller bridge: a single `.ask` slide (gallery 28) asking the
one question the previous slide earned, before the next slide answers it.
Socratic order — the audience doesn't know what's coming, so the question
opens their thinking and the answer lands. The question is unwritable unless
both neighbours are known, which is what makes it the plan's coherence test: a
bridge you cannot phrase means the seam has no argument yet.

The strongest insights are non-consensus and right: they dissolve the belief
that makes the problem hard. Test one by asking five people about the idea. If
four say they dislike it because they have not been conditioned to, you have
found the insight. If four shrug and agree, you have written a consensus
observation.

## 4. Cognitive Constraint (One Slide, One Idea)

A slide must communicate exactly one obvious concept. Dense text, heavy data
tables and complex diagrams act as cognitive mazes. If a stranger outside the
field cannot state the core takeaway after a three-second glance, the slide has
failed.

- Title occupies 30-50% of the slide. Maximum 2-3 bullets.
- Diagrams maximum five boxes.
- Screenshots are almost always illegible and non-obvious. Use a bulleted step
  list, or a reconstructed detail at presentation type size. The one exception
  is when the complexity is itself the argument.
- **Density:** at most one block of prose per slide, and a single prose block
  over about 25 words gets cut. A slide that is two prose blocks is a document.
  The total word count of a slide is not the measure, because a four-card grid
  with four honest descriptions is not a handout; `DESIGN.md`'s density test is
  the say-it-aloud timer, and `qa-matrix.mjs` prints the count so you have
  something to apply it to. If copy does not fit, the content is wrong, the
  layout is wrong, or the slide is two slides. Never the type size.

## 5. Translation to Consequence

Never present abstract data, specialized methodology or raw facts in a vacuum.
Data must prove judgment, not thoroughness. Translate every metric or technical
detail into its real-world impact: a harm avoided, a capability unlocked, or a
truth revealed.

The move is **fact → what it changes → who feels it**. The middle hop is
whatever your audience cares about: avoided harm, a capability unlocked, a cost
removed, a risk retired. Lead with the decision the number forces, not the number:

| Fact | Fails | Translated |
|---|---|---|
| 1,400 automated tests | "We have extensive test coverage" | "1,400 checks run on every commit, so a regression reaches users less often than before we automated them." |
| Median wait 14 minutes | "We have a queue" | "Half the people who call us are put on hold long enough to hang up. We removed the wait, not the queue." |
| 92% concordance with reference | "High agreement" | "On 200 paired reads our path matched the reference 186 times, so a second reader adds little." |
| Same input, same output | "Deterministic rendering" | "Every ranking we produce is reproducible and auditable, so a disputed result can be re-run rather than argued." |
| Data never leaves the device | "Privacy-first by design" | "The data that decides the user's outcome never leaves their machine. No DPA conversation, no security review bottleneck." |

**Name a decision you made and rejected.** That row reads as judgment in a way
no amount of polish substitutes for: "we rejected a coverage gate, because
threshold-driven suites produce tests that test nothing" tells the audience you
weighed it.

## 6. Radical Clarity & Intellectual Honesty

Audiences trust clarity of thought. Strip out jargon, institutional speak and
buzzwords. Explain core concepts as simply as possible. Acknowledge nuances,
trade-offs and limitations directly.

- If a number has never been validated against reality, **name it as such on the
  slide.** Naming the one unvalidated assumption is worth more than a page of
  confident arithmetic.
- Rename a traction slide to "progress" or "milestones" when the honest version
  is too thin. A weak traction slide draws attention to what is missing.
- State known product gaps rather than hiding them.
- Never claim "no competition." Absence of competitors reads as lack of
  homework. Name the boring ones: the spreadsheet, the manual process.

### 6.1 The deck ships complete

A deliverable deck contains no placeholders and no instructions to the author.

- Every slide states what is known and what is not. A missing fact is either
  omitted or said out loud on the slide.
- A dashed `.gapnote` is a caveat you are making **to** the audience ("no
  participant has paid yet"), never a note to yourself. It goes in `.s-body`
  under the content it qualifies; `DESIGN.md` carries its styling.
- Anything you need from the author, ask before the deck is built rather than
  annotating it onto the slide.

## 7. The Narrative vs. Appendix Split

The core presentation must be a seamless, standalone narrative. Push
exhaustive methodology, dense reference data, complex architecture and
peripheral proof points into a cleanly designed appendix. If a slide requires
the audience to stop listening in order to read and analyze it, it does not
belong in the main flow.

- **Main flow carries claims. Appendix carries proof.** Anything that exists to
  be checked rather than believed goes to the appendix: method detail, full data
  tables, protocol steps, source lists, system diagrams, and every number behind
  a claim made in the main flow.
- The appendix is designed to the same grid, type scale and colours as the main
  deck, and gets the same per-slide look.
- End the main flow on substance, the ask or the close, not on a decorative
  thank-you slide.
- A live talk usually needs more slides than the argument does. Build the backup
  Q&A material as appendix slides, so the answer is already designed when it is
  needed.

## 8. Sentence-Level Clarity (ASD-STE100)

Rules 1 to 7 are about the argument: what the deck claims, in what order, and
what it owes the audience. This rule is about the sentences carrying it, and it
is delegated rather than restated. The standard is
[`skills/asd-ste100/`](skills/asd-ste100/SKILL.md), vendored here byte for byte
from [danyuchn/asd-ste100-skill](https://github.com/danyuchn/asd-ste100-skill).
That folder's `SKILL.md` holds the rules, `references/writing-rules.md` holds the
citations, and `scripts/ste-lint.py` lints the structural ones. Read that file for
the rules themselves. This section only says where they apply to a deck, because
applied blind they fight rules 1 to 7.

### Where it applies, and where it does not

ASD-STE100 is a controlled-language standard built by aerospace and defence
manufacturers so a technician cannot misread an instruction. It is deliberately
flat and literal, which is exactly wrong for an assertion title and exactly right
for a caption. Scope it by who reads the text:

| The text | Mode | Why |
|---|---|---|
| An assertion title | **Neither** | Rule 1 governs it. A title flattened until it passes a controlled language has stopped being a claim. |
| Card text, captions, axis labels, `.meta` key points, tooltips, footers, `.gapnote` | **STE-flavored** | Structural rules in full: active voice, one idea per sentence, simple tenses, no semicolons, no phrasal verbs, no nominalisation. The one-word-one-meaning lockdown stays advisory, because a caption needs some range. |
| A takeaway line, a speaker note, or any string a script or a downstream agent parses | **Strict** | A wrong reading here means a misread, not a weak slide. Full rules, length caps included. |
| `plan.md`, when it is the brief handed to a builder subagent | **Strict** | A subagent parses it with no human to ask. That is the exact reader the standard was built for. |

### What it agrees with, and what it costs

- **Rule 4 and STE landed on the same number.** Rule 4 cuts a prose block at about
  25 words. STE caps a descriptive sentence at 25 and an instruction at 20. Two
  standards arriving at one cap is the strongest evidence in this file that the cap
  is right. Run `density` first, then let STE settle the sentences that survive it.
- **Rule 5 and the marketing-adjective rule are the same move.** Replace the
  adjective with the measurement that earns it is the same instruction as lead with
  the decision the number forces. Apply it twice. `seamless`, `robust`,
  `blazing-fast`, `effortless` and `world-class` get deleted, not reworded.
- **Rule 6 already asked for this.** Stripping buzzwords is the standard's premise.
- **It bans the semicolon, and `check-dashes` reports the em dash.** They are
  complementary rather than duplicate, and a deck needs both. A sentence that trips
  both is two sentences.
- **The cost is voice.** Flattened copy stops sounding like a person wrote it. That
  is the right trade for a caption and the wrong one for a title, which is what the
  table above says. When a rewrite has cost a sentence its only human touch, keep
  the touch and accept the finding.

### The three ways a STE rewrite goes wrong

The sub-skill files these as boundaries. They are worth repeating here because a
deck is where they bite hardest.

1. **It promotes a hedge into a fact.** "No participant has paid yet" must not
   become "No participant has paid". Rule 6 makes naming the unknown mandatory, so a
   rewrite that drops the uncertainty breaks this file as well as the claim.
2. **It adds a fact the source never stated.** A shorter sentence that supplies a
   cause, a frequency, or a mechanism has stopped being a rewrite. Rule 5 is
   exactly where that temptation lives.
3. **It polishes a hollow sentence.** The standard fixes the form of a text, not its
   substance. A gap note with nothing in it becomes a clean, short, empty gap note,
   which rule 6.1 forbids shipping. Fix the content or keep the rough version. Do not
   let a linter make an empty slide look finished.

### Checking it

```
bun cli.mjs ste <file.md>
```

runs the vendored linter over any markdown. Point it at `plan.md` first, then at
the prose blocks of a deck's copy once they are drafted. It is deliberately **not**
one of the five steps in `check`, because that command's contract is Bun and
Playwright only, and a checker needing a language nobody installed is a checker that
does not run.

The linter reads structure only: semicolons, sentence length, a short list of soft
phrasal verbs, nominalisation, marketing adjectives, synonym rotation, dangling
conjunctions in list items, passive voice and compound tenses. It never flags a
hedge, because a hedge is content. Its exit code is not a gate on the deck. Read
the findings and decide, which is the same relationship rule 6 has with every other
judgement in this file.

---

## Check

Read the titles alone, in order, as a list. They should form an argument someone
could repeat from memory. If they read as a table of contents, the deck is
topical rather than assertive: go back to rule 1.

Then read the body copy alone, with the visuals gone. Every sentence should be one
idea an audience member could not have taken two readings of. If a sentence needs
a comma to survive or a second look to parse, it is a rule 8 problem, not a layout
problem.