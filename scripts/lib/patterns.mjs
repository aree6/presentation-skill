/**
 * The gallery is the only list of treatments. Everything else reads it.
 *
 * Five bugs in this skill's history were the same bug: a hand-typed copy of
 * the treatment list that the gallery moved out from under (ladder and ba
 * missing from the visual gate, card-DNA prose disagreeing with the script,
 * a hand-copied boot script missing its finally, a 33-row index table nobody
 * updated). So nothing here is typed: the patterns are parsed out of
 * templates/slides/patterns.html at runtime, and the three word-lists below
 * are derived from that parse plus one explicit extras list.
 *
 * Imported by check-visuals.mjs (rhythm + marks), get-pattern.mjs (menu,
 * markup, --css) and check-refs.mjs (freshness tests). No browser, no build
 * step: parsing 295KB of gallery costs milliseconds.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const GALLERY = path.join(ROOT, "templates", "slides", "patterns.html");
const TEMPLATE = path.join(ROOT, "templates", "template.html");

function strip(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&mdash;/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * One entry per <section> in the gallery: number (from the gallery's own
 * <!-- NN. Name --> comment), data-name, caption use/not-for, first line,
 * and the body treatment class. Parsed the way get-pattern always parsed
 * it — sections anchored, number read off the nearest preceding comment —
 * so the two can never disagree: get-pattern reads this module.
 */
export function galleryPatterns(src = fs.readFileSync(GALLERY, "utf8")) {
  // Scripts first: covers.html documents its own <section> anatomy inside a
  // <script> comment, and the section regex cannot tell code about a slide
  // from a slide. Gallery sections carry no scripts, so nothing real is lost.
  const clean = src.replace(/<script[\s\S]*?<\/script>/g, "");
  const out = [];
  const re = /<section\b[\s\S]*?<\/section>/g;
  let m;
  while ((m = re.exec(clean))) {
    const markup = m[0];
    const before = clean.slice(0, m.index);
    const lastComment = before.lastIndexOf("<!--");
    let num = out.length + 1;
    let commentName = "";
    if (lastComment !== -1) {
      const closer = before.indexOf("-->", lastComment);
      const comment = closer === -1 ? "" : before.slice(lastComment + 4, closer + 2);
      const head = comment.match(/(\d{1,2})\.\s*([^\n]*)/);
      // covers.html carries no numbered comments: position is the number and
      // data-name is the name. A section with neither is chrome, not a pattern.
      if (head) { num = Number(head[1]); commentName = head[2].trim(); }
      else if (!/data-name="[^"]+"/.test(markup)) continue;
    } else if (!/data-name="[^"]+"/.test(markup)) continue;
    const dataName = (markup.match(/data-name="([^"]*)"/) || [])[1] || commentName;
    if (!dataName) continue;
    const caption = (markup.match(/<span class="ct">([\s\S]*?)<\/span>/) || [])[1] || "";
    const avoid = (markup.match(/<span class="avoid">([\s\S]*?)<\/span>/) || [])[1] || "";
    out.push({
      n: num,
      name: dataName,
      use: strip(caption),
      notFor: strip(avoid),
      bodyClass: bodyClassOf(markup),
      line: clean.slice(0, m.index).split("\n").length,
      markup,
    });
  }
  return out;
}

/**
 * The body treatment of one gallery section. Specific beats generic:
 * minicloud rides inside a grid3 wrapper, mxwrap is the matrix frame,
 * ghost is the divider figure — the inner class is the treatment, the
 * outer is the container it borrowed.
 */
export function bodyClassOf(markup) {
  const classes = new Set(
    [...markup.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)),
  );
  if (classes.has("minicloud")) return "minicloud";
  if (classes.has("mxwrap")) return "matrix";
  if (classes.has("ghost")) return "divider";
  const ORDER = [
    "cover-flow", "toc", "grid3", "tvo", "chartcol", "waterfall", "ladder",
    "timeline", "numbered", "compare", "ba", "dtable", "checklist", "bigstat",
    "stat-rail", "pull", "bento", "dotfield", "stack", "donutrow", "funnel",
    "divider", "icongrid", "steps3", "mmdbox", "cascade", "zigzag", "blobstage",
    "ask",
  ];
  for (const c of ORDER) if (classes.has(c)) return c;
  return "other";
}

/**
 * Treatments that live only in templates/template.html, never in the
 * gallery: hero-split and bigstat lead deck 7, gridQ is deck 4, ring/vbars/
 * pillbar are deck 6/8 marks, shot frames deck 10, gapnote qualifies deck 6.
 * check-refs.mjs verifies each one is really there, so a template edit that
 * removes one fails loudly instead of silently unlisting it.
 */
export const TEMPLATE_EXTRAS = [
  "hero-split", "gridQ", "ring", "vbars", "pillbar", "shot", "gapnote",
];

/** Inner marks that never head a body but still anchor it visually. */
const INNER_MARKS = ["meter", "mermaid"];

/**
 * Every body treatment a deck can carry, gallery order first (specific
 * before generic: minicloud precedes grid3, chartcol precedes mmdbox, so a
 * borrowed wrapper never wins over the treatment inside it), template-only
 * treatments after, inner marks last. First match wins in treatmentOf.
 */
export function treatmentList() {
  const seen = new Set();
  const out = [];
  for (const p of galleryPatterns()) {
    if (p.bodyClass !== "other" && !seen.has(p.bodyClass)) {
      seen.add(p.bodyClass);
      out.push(p.bodyClass);
    }
  }
  // The deck spells two of these differently from the canonical name.
  out.push("mxwrap"); // the matrix frame's own class
  for (const c of TEMPLATE_EXTRAS) {
    if (!seen.has(c)) { seen.add(c); out.push(c); }
  }
  for (const c of INNER_MARKS) {
    if (!seen.has(c)) { seen.add(c); out.push(c); }
  }
  return out;
}

/** The rhythm token of one deck section. mxwrap reads as matrix. */
export function treatmentOf(sec) {
  for (const t of treatmentList()) {
    if (new RegExp(`class="[^"]*\\b${t}\\b`).test(sec)) {
      return t === "mxwrap" ? "matrix" : t;
    }
  }
  return "other";
}

/**
 * What counts as a visual anchor for the text-only audit. Every treatment
 * is one (even toc and cover-flow: a cover without art fails elsewhere),
 * plus the diagram container itself.
 */
export function markList() {
  return [...treatmentList()];
}

/**
 * The canonical card-DNA set. These treatments share a surface — white
 * cards, pastel tiles, taglines on light canvas — so three of them anywhere
 * in a deck is the monotony smell even when none repeats consecutively.
 * DESIGN.md names exactly these words; check-refs.mjs holds the two together.
 */
export const CARD_DNA = new Set([
  "grid3", "gridQ", "compare", "stat-rail", "tvo",
  "numbered", "hero-split", "bento", "minicloud",
]);

/** Slides that break the surface instead of sharing it. */
export const HERO = new Set(["bigstat", "pull", "blobstage"]);

/**
 * Gallery furniture: classes that caption the gallery itself and never ship
 * in a deck. Rules mentioning only these are never pattern CSS.
 */
const GALLERY_ONLY = new Set(["galcap", "ct", "avoid"]);

function styleRules(src) {
  const style = (src.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
  // Comments out first: a rule's nhood comment would otherwise glue itself to
  // the selector and defeat the template dedupe below, since the two files
  // annotate identical rules differently.
  const bare = style.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  for (const m of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (!sel || sel.startsWith("@")) continue;
    out.push({ sel, body: m[2].trim() });
  }
  return out;
}

const normRule = (r) => `${r.sel} { ${r.body} }`.replace(/\s+/g, " ").trim();

function selectorClasses(sel) {
  return [...sel.matchAll(/\.([a-zA-Z][a-zA-Z0-9-]*)/g)].map((m) => m[1]);
}

/**
 * The CSS a pattern needs, ready to paste, in two piles. Core rules mention
 * the pattern's own family — its body class plus every class its markup uses
 * that the gallery defines and the template does not (pcloud, blob, mxwrap:
 * derived, never listed). Those are the block the builder used to hunt by
 * eye. Supporting rules are gallery extensions of shared classes the pattern
 * happens to use (.card, .qhead); they print as one comment line of names,
 * because the deck already carries the template's base for those.
 *
 * Returns { core, supportClasses, alreadyInTemplate, undefined }.
 * alreadyInTemplate are pattern classes the template defines (nothing to
 * copy); undefined are pattern classes defined nowhere (write them yourself).
 */
export function cssForPattern(markup, galleryFile = GALLERY) {
  const gal = fs.readFileSync(galleryFile, "utf8");
  const tpl = fs.readFileSync(TEMPLATE, "utf8");
  const galRules = styleRules(gal);
  const have = new Set(styleRules(tpl).map(normRule));
  const definedGal = new Set();
  for (const r of galRules) for (const c of selectorClasses(r.sel)) definedGal.add(c);
  const definedTpl = new Set();
  for (const r of styleRules(tpl)) for (const c of selectorClasses(r.sel)) definedTpl.add(c);
  const used = new Set(
    [...markup.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean),
  );
  const body = bodyClassOf(markup);
  const family = new Set([body]);
  for (const c of used) {
    if (definedGal.has(c) && !definedTpl.has(c)) family.add(c);
  }
  const inFam = (sel) => selectorClasses(sel).some((c) => family.has(c));
  const core = [];
  const support = new Set();
  let motionSkipped = false;
  // Containers the template's own tile cascade already covers: no pointer owed.
  const tplCascade = new Set();
  for (const m of tpl.matchAll(/:is\(([^)]*)\)/g)) {
    for (const c of m[1].split(",")) {
      const t = c.trim().replace(/^\./, "");
      if (t) tplCascade.add(t);
    }
  }
  for (const r of galRules) {
    const selCls = selectorClasses(r.sel);
    if (!selCls.some((c) => used.has(c))) continue;
    // Gallery furniture never ships: the caption band lives only in the gallery.
    if (selCls.includes("galcap")) continue;
    if (selCls.length && selCls.every((c) => GALLERY_ONLY.has(c))) continue;
    if (have.has(normRule(r))) continue;
    // Motion is the template's, not the pattern's: a new tile container joins
    // the deck's :is() list (DESIGN.md Motion), it never pastes gallery
    // cascade rules beside the template's own motion block.
    if (r.sel.includes(":is(")) {
      // A gallery cascade rule naming this pattern's family, and the template
      // does not cascade it yet: the move is joining the deck's :is() list.
      if (inFam(r.sel) && !tplCascade.has(body)) motionSkipped = true;
      continue;
    }
    if (inFam(r.sel)) core.push(`${r.sel} { ${r.body} }`);
    else for (const c of selCls) if (used.has(c)) support.add(c);
  }
  const SKIP = new Set(["slide", "active", "s-head", "s-body", "s-foot", "hero-slide", "ph", "xs", "xl", "sm", "ctr", "measuring"]);
  const alreadyInTemplate = [...used].filter((c) => !definedGal.has(c) && definedTpl.has(c));
  const undefined_ = [...used].filter(
    (c) => !definedGal.has(c) && !definedTpl.has(c) && !SKIP.has(c) && !GALLERY_ONLY.has(c),
  );
  return { core, supportClasses: [...support].sort(), alreadyInTemplate, undefined: undefined_, motionSkipped };
}

export { GALLERY, TEMPLATE };
