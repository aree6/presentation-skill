/**
 * The one markdown parser in this folder.
 *
 * `check-docs.mjs` and `get-doc.mjs` both need to find a heading and know which
 * lines it owns. Two parsers is how they start disagreeing about what a heading
 * is, and a retrieval tool that silently returns the wrong section is worse than
 * one that refuses.
 *
 * Moved out of check-docs.mjs verbatim so the behaviour cannot drift: the fence
 * rule, the GitHub anchor rules and the numbering-prefix strip all carry comments
 * explaining a decision that was measured rather than guessed.
 */

/** An ATX heading. The whitespace requirement stops `#hashtag` in prose counting. */
export const ATX = /^( {0,3})(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;

/** An opening or closing code fence; the info string is captured for the close test. */
export const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;

/** A list item, capturing its indent and its text after the bullet. */
export const LIST_ITEM = /^(\s*)(?:[-*+]|\d+[.)])[ \t]+(.*)$/;

/** A markdown inline link or image inside a list item. */
export const LINK = /!?\[([^\]]*)\]\(\s*([^)\s]*)[^)]*\)/g;

/** A leading numbering prefix: `4. `, `2.1 `, `IV `, `Section 3 `, `Step 2: `. */
export const NUM_PREFIX =
  /^(?:(?:section|part|chapter|step|appendix)\s+)?(?:\d+(?:\.\d+)*|[ivxlcdm]+)\.?\s+/i;

/** The heading text with a leading numbering prefix removed, so `7.1.1 Foo` matches `Foo`. */
export function trailing(s) {
  return s.replace(NUM_PREFIX, "").trim() || s;
}

/**
 * A GitHub anchor without the duplicate counter. This is the ONE way text is
 * compared in this folder, for heading matches and anchor matches alike, and
 * that is deliberate: two notions of "the same text" in one tool is how it grows
 * false positives, and a false positive teaches people to ignore the report.
 */
export function baseSlug(text) {
  return text
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s/g, "-");
}

/**
 * The anchor a heading actually owns. Repeated headings take a `-1`, `-2` suffix
 * in document order, so the anchor set is built by walking headings once in the
 * order they appear. The un-suffixed form is what a heading match uses, because
 * two headings with the same text are the same heading as far as "is it in the
 * list" is concerned.
 */
export function slug(text, taken) {
  const base = baseSlug(text);
  let out = base;
  let n = 0;
  while (taken.has(out)) {
    n++;
    out = `${base}-${n}`;
  }
  taken.add(out);
  return out;
}

/**
 * Read one file into headings and contents entries, skipping anything inside a
 * fenced code block. A fence opened with three or more backticks is closed by a
 * line of three or more backticks of the same character with no info string,
 * which is the CommonMark rule and the only one that keeps a ``` inside a
 * markdown block from ending it early.
 */
export function parse(src) {
  const lines = src.split(/\r?\n/);
  const headings = [];
  const entries = [];
  let fence = null;
  let contentsLine = -1;
  let collecting = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    const f = FENCE.exec(raw);

    if (fence) {
      if (f && f[2][0] === fence.char && f[2].length >= fence.len && !f[3].trim()) fence = null;
      continue;
    }
    if (f) {
      fence = { char: f[2][0], len: f[2].length };
      continue;
    }

    const h = ATX.exec(raw);
    if (h) {
      const level = h[2].length;
      const text = (h[3] || "").replace(/[ \t]+#+[ \t]*$/, "").trim();
      headings.push({ line: lineNo, level, text });
      // The contents list is the run of list items under the Contents heading,
      // so the next heading of any level ends it.
      if (contentsLine === -1 && baseSlug(trailing(text)) === "contents") {
        contentsLine = lineNo;
        collecting = true;
      } else {
        collecting = false;
      }
      continue;
    }

    if (collecting) {
      if (!raw.trim()) continue;
      const item = LIST_ITEM.exec(raw);
      if (!item) {
        collecting = false;
        continue;
      }
      const links = [...item[2].matchAll(LINK)].map((m) => ({ text: m[1], href: m[2] }));
      entries.push({ line: lineNo, indent: item[1].length, text: item[2], links });
    }
  }

  return { headings, entries, contentsLine };
}

/**
 * The lines a heading owns: from its own line to the line before the next
 * heading of the same or a higher level. Sub-headings come along, which is what
 * "give me the Motion section" should mean when Motion has four `####` children.
 */
export function sectionRange(headings, index) {
  const start = headings[index];
  let end = headings.length;
  for (let i = index + 1; i < headings.length; i++) {
    if (headings[i].level <= start.level) {
      end = i;
      break;
    }
  }
  return { startLine: start.line, endLine: headings[end] ? headings[end].line - 1 : Infinity };
}
