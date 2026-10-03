# presentation-skill

Builds visually rich HTML slide decks and exports them to PDF. Decks are heavy on
visuals, icons and diagrams, and light on words.

## Contents

- [Install](#install)
- [Use](#use)
- [The rules that matter most](#the-rules-that-matter-most)
- [Licence](#licence)

## Install

Copy this folder into a skills directory — `.opencode/skills/`, `.claude/skills/`,
or whatever your agent scans — then install once:

```
bun install && bunx playwright install chromium
```

## Use

`SKILL.md` is the operating instruction. The short version:

```
bun cli.mjs new my-topic         # decks/my-topic/my-topic.html + images/
bun cli.mjs shot 1 --deck decks/my-topic/my-topic.html --no-qa  # look before slide 2
bun cli.mjs check --deck decks/my-topic/my-topic.html
bun cli.mjs shot all --deck decks/my-topic/my-topic.html
bun cli.mjs pdf --deck decks/my-topic/my-topic.html --here
```

One request, one folder: `decks/<topic>/` holds the deck, one PDF, `plan.md`,
`images/` and the screenshots. `SKILL.md` → "Output structure" is the rule.

## The rules that matter most

- **Titles are assertions.** The title states the conclusion; the body is the
  evidence (`content_philosophy.md` rule 1).
- **Every slide is looked at** before the next one is written. The commands
  passing is not the deck being finished — no script can see a stranded icon.
- **The deck ships complete.** No placeholders, no notes to the author.

## Licence

Your own files are yours. `icons/` is MIT-licensed third-party (theSVG, Phosphor)
— see `LICENSE`.
