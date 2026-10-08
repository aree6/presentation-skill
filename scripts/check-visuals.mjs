#!/usr/bin/env bun
/**
 * Visual enforcement gate: icons in every zone, no emoji, mermaid contract.
 *
 * Static (no browser): parses the deck HTML as text and fails on what can be
 * decided without rendering. What needs eyes (a stranded icon, a brand mark
 * that vanished on the light canvas, a mistinted row) stays with the
 * screenshot review in SKILL.md section 4. This gate exists so a deck that
 * was built from hand-drawn glyphs, or that reaches for a CDN at render time,
 * never gets as far as a browser.
 *
 *   bun scripts/check-visuals.mjs --deck <file.html>
 *   bun scripts/check-visuals.mjs <file.html>   (bare path also works)
 *
 * What it checks, per slide (<section class="slide">):
 *   1. at least one inline <svg> anywhere in the section;
 *   2. every icon zone carries a glyph: .tagline, .st .hd, .takeaway, and
 *      every slide's data-rail entry (no bottom chrome footer: position lives
 *      in the topbar and the rail);
 *   3. every inlined <svg> inside a slide carries data-icon="<path under
 *      icons/>", and that file exists (provenance: bytes must come from
 *      icons/phosphor/ or icons/coloredIconsMustUse/, never hand-drawn);
 *   4. no emoji in slide copy (the single carve-out, emoji as quoted data,
 *      cannot be told apart statically, so flag it and decide by eye);
 *   5. when the deck uses Mermaid: the library is vendored next to the deck
 *      (never a CDN, never the CORS-blocked ESM entry), initialize() runs
 *      with startOnLoad:false, source is parsed before render, the render is
 *      registered with defer(), and the .mmdwrap theming patch is present.
 *
 * Advisory only (reported, never failed): a per-slide visual audit. Every
 * slide gets a status (STRONG / ADEQUATE / LIGHT / NEEDS FIX), its inventory
 * (glyph count, zone coverage, marks, diagram type, body words), and concrete
 * upgrade suggestions: text-only bodies, word-heavy bodies with no visual
 * anchor, brand names in copy that lack a colored mark, and over-repeated
 * glyphs. The audit tells an author exactly which slides to upgrade and how.
 *
 * Exit 0 clean, 1 findings, 2 usage error or unreadable input.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markList, treatmentOf, treatmentList, CARD_DNA, HERO } from "./lib/patterns.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const ICONS = path.join(ROOT, "icons");

const HELP = [
  "usage: check-visuals [<deck.html>] [--deck <file>]",
  "",
  "Static visual gate for a deck: icons in every zone, no emoji, and the",
  "Mermaid vendoring contract when a diagram is present. Text only, no",
  "browser. Fails on missing glyphs, missing data-icon provenance, emoji,",
  "and CDN or unregistered diagram renders. Prints a per-slide visual audit:",
  "status, inventory, and upgrade suggestions for every slide.",
  "",
  "  <deck.html>      deck to check (bare path also accepted)",
  "  --deck <file>    same thing as a flag; also --deck=<file>",
  "  --help, -h       print this and exit 0",
  "",
  "Exit 0 clean, 1 findings, 2 usage error or unreadable input.",
].join("\n");

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Brand names that can carry a colored mark: flat files + variant folders. */
function brandNames() {
  const dir = path.join(ICONS, "coloredIconsMustUse");
  const names = new Set();
  const STOP = new Set(["app", "web", "api", "ios", "os", "tv", "go", "ai",
    "js", "css", "cdn", "vpn", "dns", "cms", "crm", "erp", "bi", "qa", "hr",
    "pr", "io", "db", "ml", "ui", "ux"]);
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const base = e.isDirectory() ? e.name : e.name.replace(/\.svg$/i, "");
    if (base.length >= 4 && !STOP.has(base.toLowerCase())) names.add(base.toLowerCase());
  }
  return [...names];
}

function parseArgv(argv) {
  const out = { deck: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") { out.help = true; continue; }
    if (a === "--deck") {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) return { error: "--deck needs a value" };
      out.deck = next; i++; continue;
    }
    if (a.startsWith("--deck=")) { out.deck = a.slice("--deck=".length); continue; }
    if (a.startsWith("--")) return { error: `unknown flag: ${a}` };
    if (out.deck) return { error: `one deck only, got ${JSON.stringify(a)} as well` };
    out.deck = a;
  }
  return out;
}

/** Balanced extraction of every <div|span class="... cls ...">...</> block. */
function blocks(html, cls) {
  const out = [];
  const open = new RegExp(
    `<(div|span)[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, "g");
  let m;
  while ((m = open.exec(html))) {
    const tag = m[1];
    let depth = 1;
    const tagRe = new RegExp(`<(/?)${tag}(?=[\\s>])`, "g");
    tagRe.lastIndex = m.index + m[0].length;
    let t;
    let closed = false;
    while ((t = tagRe.exec(html))) {
      const gt = html.indexOf(">", t.index);
      const selfClose = gt > 0 && html[gt - 1] === "/";
      if (t[1] === "/") {
        depth--;
        if (depth === 0) { out.push(html.slice(m.index, gt + 1)); closed = true; break; }
      } else if (!selfClose) depth++;
    }
    if (!closed) out.push(html.slice(m.index));
    open.lastIndex = m.index + m[0].length;
  }
  return out;
}

function short(s, n = 90) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "..." : t;
}

/** Normalise SVG paint for comparison: comments, titles, commas, whitespace.
 * Def ids are normalised too: each inlined brand instance carries a unique
 * id suffix so url(#..) can never leak across instances (see ICONS.md), and
 * the suffix is not part of the artwork. */
function normSvg(s) {
  return s
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<title>[\s\S]*?<\/title>/g, " ")
    .replace(/\bid="[^"]*"/g, 'id="#"')
    .replace(/url\(#[^)]*\)/g, "url(#)")
    .replace(/href="#[^\"]*"/g, 'href="#"')
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Raw inner markup of a vendored file (between root open and </svg>). */
function fileInner(src) {
  const fromSvg = src.slice(src.indexOf("<svg"));
  const body = fromSvg.slice(fromSvg.indexOf(">") + 1);
  return body.slice(0, body.lastIndexOf("</svg>"));
}

const fileCache = new Map();
function readIcon(rel) {
  if (!fileCache.has(rel)) {
    const full = path.join(ICONS, rel);
    try {
      if (!fs.statSync(full).isFile()) fileCache.set(rel, null);
      else fileCache.set(rel, fs.readFileSync(full, "utf8"));
    } catch {
      fileCache.set(rel, null);
    }
  }
  return fileCache.get(rel);
}

function main() {
  const args = parseArgv(process.argv.slice(2));
  if (args.help) { console.log(HELP); return 0; }
  if (args.error) { console.error(`check-visuals: ${args.error}`); return 2; }
  if (!args.deck) { console.error("check-visuals: no deck given: check-visuals --deck <file.html>"); return 2; }
  const deck = path.resolve(args.deck);
  let html;
  try {
    if (!fs.statSync(deck).isFile()) { console.error(`check-visuals: not a file: ${deck}`); return 2; }
    html = fs.readFileSync(deck, "utf8");
  } catch (e) {
    console.error(`check-visuals: cannot read ${deck}: ${e.message}`);
    return 2;
  }

  const deckDir = path.dirname(deck);
  const findings = [];
  const waived = [];

  const sections = [...html.matchAll(/<section(?=[^>]*class="[^"]*\bslide\b)[^>]*>[\s\S]*?<\/section>/g)].map((m) => m[0]);
  if (!sections.length) { console.error("check-visuals: no <section class=\"slide\"> in file"); return 2; }

  // The gallery is the only list of treatments: MARK is every body treatment
  // the gallery parses to, plus the diagram container. See lib/patterns.mjs.
  const MARK = markList();
  const BRANDS = brandNames();
  const registry = {};
  for (const m of html.matchAll(/"((?:phosphor|coloredIconsMustUse)\/[^"]+)":`([^`]*)`/g)) {
    registry[m[1]] = m[2];
  }
  const audits = [];
  /* A brand advisory fires once per deck, not once per slide. The subject of
     the deck is named on every slide by definition — a deck about React names
     React throughout — so repeating the same advisory after it is read and
     deliberately left open is a nag, and a nag trains authors to stop reading
     the audit. The first occurrence carries the signal; the rest would only
     repeat the decision. */
  const brandSaid = new Set();

  // Treatment per slide, for the rhythm readout. Read off the gallery by
  // lib/patterns.mjs: first distinctive body class wins, specific before
  // generic, so a minicloud inside a grid3 wrapper still reads as minicloud.
  // Unknown markup reads as "other": two unknowns in a row still count as
  // repetition, because an unclassifiable repeated object is monotonous
  // whatever it is.
  sections.forEach((sec, i) => {
    const n = i + 1;
    const name = (sec.match(/data-name="([^"]*)"/) || [])[1] || `slide ${n}`;
    const label = `s${n} (${name})`;

    const svgEls = [...sec.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/g)].map((m) => m[0]);

    for (const el of svgEls) {
      const open = el.slice(0, el.indexOf(">") + 1);
      const inner = el.slice(open.length, el.lastIndexOf("</svg>"));
      if (/role="img"/.test(open)) {
        if (!/aria-label="[^"]+"/.test(open) && !/<title>/.test(inner)) {
          findings.push(`${label}: illustration <svg role="img"> needs an accessible name: ${short(open, 70)}`);
        }
        continue;
      }
      if (!/data-icon="[^"]+"/.test(open)) {
        findings.push(`${label}: inlined <svg> without data-icon provenance: ${short(open, 70)}`);
        continue;
      }
      const value = open.match(/data-icon="([^"]+)"/)[1];
      let rel = value.replace(/^icons\//, "").replace(/^\.\//, "");
      if (!/\.svg$/i.test(rel)) rel += ".svg";
      const src = readIcon(rel);
      if (src === null) {
        findings.push(`${label}: data-icon points nowhere: ${value}`);
        continue;
      }
      const wantBox = ((src.match(/<svg[^>]*viewBox="([^"]*)"/) || [])[1] || "").replace(/\s+/g, " ").trim();
      const gotBox = ((open.match(/viewBox="([^"]*)"/) || [])[1] || "").replace(/\s+/g, " ").trim();
      if (wantBox !== gotBox) {
        const root = src.match(/<svg[^>]*>/)[0];
        const w = (root.match(/\bwidth="([\d.]+)/) || [])[1] || "";
        const h = (root.match(/\bheight="([\d.]+)/) || [])[1] || "";
        const derived = w && h ? `0 0 ${w} ${h}` : "";
        if (!(wantBox === "" && gotBox === derived)) {
          findings.push(`${label}: data-icon viewBox mismatch (file has "${wantBox || "(none, " + derived + ")"}", deck has "${gotBox}"): ${value}`);
        }
      }
      if (normSvg(inner) !== normSvg(fileInner(src))) {
        findings.push(`${label}: data-icon bytes differ from the vendored file (copy, do not redraw): ${value}`);
      }
    }

    const zones = [];
    let zTotal = 0, zCovered = 0;
    const zoneHas = (b) => /<svg\b/.test(b);
    for (const z of ["tagline", "takeaway"]) {
      for (const b of blocks(sec, z)) {
        zTotal++;
        if (zoneHas(b)) zCovered++;
        else zones.push(`.${z} without a glyph: "${short(b.replace(/<[^>]+>/g, " "))}"`);
      }
    }
    const hasTiles = /<div[^>]*class="[^"]*\bst\b[^"]*"/.test(sec);
    for (const b of blocks(sec, "hd")) {
      if (zoneHas(b)) { zTotal++; zCovered++; continue; }
      // .hd also names non-tile headings; only stat tiles must carry one.
      if (hasTiles) {
        zTotal++;
        zones.push(`.st .hd without a glyph: "${short(b.replace(/<[^>]+>/g, " "))}"`);
      }
    }
    for (const z of zones) findings.push(`${label}: ${z}`);
    const rdm = sec.match(/ data-rail="([^"]+)"/);
    let railOK = false;
    // Bridges are fillers, not narrative: no rail entry (data-group="bridge"
    // skips them in the template's rail), so no rail icon either. The inline
    // glyph the bridge carries satisfies the artwork rule below on its own.
    const isBridge = /<section[^>]*data-group="bridge"/.test(sec);
    if (!rdm) {
      if (!isBridge) findings.push(`${label}: slide names no rail icon (data-rail): every rail entry carries an icon`);
    } else if (!rdm[1].startsWith("phosphor/")) {
      findings.push(`${label}: rail icon must be a Phosphor UI glyph, not ${rdm[1]}: brand marks are unreadable small and shared def ids cross-contaminate`);
    } else {
      let rrel = rdm[1] + ".svg";
      const rsrc = readIcon(rrel);
      if (rsrc === null) findings.push(`${label}: data-rail points nowhere: ${rdm[1]}`);
      else {
        const reg = registry[rdm[1]];
        if (reg === undefined) findings.push(`${label}: data-rail icon missing from the RAIL_ICONS registry: ${rdm[1]}`);
        else if (normSvg(reg) !== normSvg(fileInner(rsrc))) findings.push(`${label}: registry bytes differ from the vendored file (copy, do not redraw): ${rdm[1]}`);
        else railOK = true;
      }
    }
    if (!svgEls.length && !railOK && !isBridge) findings.push(`${label}: no inline <svg> anywhere in the slide and no verified rail icon either`);

    const copy = sec
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<style[\s\S]*?<\/style>/g, " ")
      .replace(/<svg[\s\S]*?<\/svg>/g, " ")
      .replace(/<[^>]+>/g, " ");
    const emo = copy.match(/[\p{Extended_Pictographic}]/u);
    if (emo) findings.push(`${label}: emoji in slide copy: "${emo[0]}" (only emoji-as-quoted-data is allowed, decide by eye)`);

    const markIn = (frag, c) => new RegExp(`class="[^"]*\\b${c}\\b`).test(frag);
    const marks = MARK.filter((c) => markIn(sec, c));
    const bodies = blocks(sec, "s-body");
    const exempt = bodies.some((b) => /class="[^"]*\b(pull|divider)\b/.test(b));
    let textOnly = false;
    for (const body of bodies) {
      const bare = body.replace(/<svg[\s\S]*?<\/svg>/g, " ");
      const hasMark = MARK.some((c) => markIn(bare, c));
      if (!/<svg\b/.test(body) && !hasMark && !/<img\b/.test(body)) textOnly = true;
    }
    let bodyWords = 0;
    for (const body of bodies) {
      const words = body
        .replace(/<script[\s\S]*?<\/script>/g, " ")
        .replace(/<svg[\s\S]*?<\/svg>/g, " ")
        .replace(/<[^>]+>/g, " ")
        .split(/\s+/)
        .filter((w) => /[A-Za-z0-9]/.test(w));
      bodyWords += words.length;
    }
    const values = [...sec.matchAll(/data-icon="([^"]+)"/g)].map((m) => m[1].toLowerCase());
    const repeats = new Map();
    for (const v of values) repeats.set(v, (repeats.get(v) || 0) + 1);
    let topRepeat = null;
    for (const [v, c] of repeats) {
      if (c >= 5 && (!topRepeat || c > topRepeat[1])) topRepeat = [v, c];
    }
    // Brand opportunities: a capitalized proper noun in a CLAIM that resolves to
    // a vendored colored mark but has none on the slide. Claims are titles,
    // takeaways, card and stat headings, table cells: places where a named
    // product is the subject. Body prose (desc, meta, sub, paragraphs, list
    // items) is excluded on purpose: a sentence mentioning "Chrome and Firefox"
    // is a mention, and inlining two logos beside it would violate the
    // one-visual-language-per-slide rule the advisory would otherwise push
    // toward. Lowercase matches are ignored, as are slugs that collide with
    // ordinary English, which are genuinely ambiguous and stay silent.
    const claims = sec
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<style[\s\S]*?<\/style>/g, " ")
      .replace(/<svg[\s\S]*?<\/svg>/g, " ")
      .replace(/<(p|li|blockquote|figcaption)[^>]*>[\s\S]*?<\/\1>/g, " ")
      .replace(/<[^>]*class="[^"]*\b(desc|meta|sub)\b[^"]*"[^>]*>[\s\S]*?<\/[a-zA-Z][^>]*>/g, " ")
      .replace(/<[^>]+>/g, " ");
    const WORDY = new Set(("about,above,after,again,answer,before,being,below,between,both,build,claim,company,companies,cover,data,date,drift,eight,every,file,files,first,fresh,from,group,history,into,local,matter,meaning,medium,month,months,note,notes,number,often,other,people,plan,plans,problem,proof,progress,question,rank,rate,recent,second,session,signal,stage,stages,state,sync,takeaway,target,thing,things,third,time,track,tracks,value,volume,work,years,zero").split(","));
    const brandHits = [];
    for (const name of BRANDS) {
      if (WORDY.has(name)) continue;
      const spaced = name.replace(/[-_]/g, " ");
      const re = new RegExp(`\\b${escapeRegExp(name)}\\b|\\b${escapeRegExp(spaced)}\\b`, "i");
      const m = claims.match(re);
      if (!m || !/[A-Z]/.test(m[0])) continue;
      const covered = values.some((v) => v.startsWith("colorediconsmustuse/") && v.includes(name));
      if (!covered) brandHits.push(name);
    }
    const DIAGRAMS = ["flowchart", "sequenceDiagram", "stateDiagram", "gantt",
      "pie", "quadrantChart", "xychart", "radar-beta", "sankey", "treemap-beta",
      "treeView-beta", "mindmap", "usecase-beta", "C4Context", "architecture-beta"];
    let diagram = null;
    for (const pre of [...sec.matchAll(/<pre[^>]*class="[^"]*\bmermaid\b[^"]*"[^>]*>([\s\S]*?)<\/pre>/g)].map((m) => m[1])) {
      for (const d of DIAGRAMS) {
        if (new RegExp(`(^|[^A-Za-z])${escapeRegExp(d)}([^A-Za-z]|$)`).test(pre)) { diagram = d; break; }
      }
      if (diagram) break;
    }
    const failCount = findings.filter((f) => f.startsWith(`${label}:`)).length;
    let status;
    if (failCount) status = `NEEDS FIX (${failCount} finding${failCount > 1 ? "s" : ""} above)`;
    else if (diagram) status = "STRONG";
    else if (marks.length >= 2 || svgEls.length >= 8) status = "STRONG";
    else if (svgEls.length >= 4 || marks.length >= 1) status = "ADEQUATE";
    else status = "LIGHT";
    const upgrades = [];
    if (textOnly && !exempt) {
      upgrades.push("body is text-only: give it an icon tile, a data mark, or a diagram (DESIGN.md Visual vocabulary)");
    }
    if (!textOnly && bodyWords >= 70 && !diagram && marks.length === 0) {
      upgrades.push(`approx ${bodyWords} body words with no visual anchor: split the slide or promote its shape to a diagram`);
    }
    const freshBrands = brandHits.filter((b) => !brandSaid.has(b));
    for (const b of brandHits) brandSaid.add(b);
    if (freshBrands.length) {
      const shown = freshBrands.slice(0, 3).join(", ");
      upgrades.push(`names ${shown} with no colored mark: run bun cli.mjs icons ${freshBrands[0]} and inline the logo beside the name`);
    }
    if (topRepeat) {
      upgrades.push(`glyph ${topRepeat[0]} appears ${topRepeat[1]}x on one slide: fine if one concept repeats, otherwise vary (ICONS.md optical sizes)`);
    }
    if (diagram && !failCount) {
      upgrades.push("diagram present: the QA step verifies 14px legibility — read the number, not just the verdict");
    }
    audits.push({
      label, status, svgs: svgEls.length, zTotal, zCovered, marks, diagram,
      bodyWords, textOnly: textOnly && !exempt, upgrades: upgrades.slice(0, 4),
      treatment: treatmentOf(sec) + (diagram ? `+${diagram}` : ""),
    });
  });

  const isScaffold = deck.startsWith(path.join(ROOT, "templates") + path.sep);
  const diagramSlides = sections.filter((sec) => /<pre[^>]*class="[^"]*\bmermaid\b/.test(sec));

  // A deck may opt out of the diagram gate, but only by saying why. The reason
  // is required so the escape hatch stays a decision rather than a shrug: decks
  // whose content genuinely has no flow, topology, lifecycle or comparison are
  // real (a pharmacology mechanism lecture, a literature review, a case series,
  // a brand manifesto) and used to have no way to pass. Written as
  // `<body data-diagrams="none" data-diagram-reason="...">`.
  const diagramOptOut = /<body[^>]*\bdata-diagrams=["']none["']/i.test(html);
  const diagramReason = (html.match(/\bdata-diagram-reason=["']([^"']*)["']/i) || [])[1];

  if (!diagramSlides.length && !isScaffold && !diagramOptOut) {
    findings.push("deck contains zero Mermaid diagrams: content with a shape (flow, timeline, comparison, system) ships as a diagram, not as cards — MERMAID.md §3 picks the type, DESIGN.md Visual vocabulary names the trigger. If this deck genuinely has no shape to draw, opt out on the body: <body data-diagrams=\"none\" data-diagram-reason=\"why\">");
  } else if (!diagramSlides.length && diagramOptOut && !diagramReason) {
    findings.push('data-diagrams="none" needs a data-diagram-reason saying why this deck has no diagram: name the nearest CSS treatment you used instead');
  } else if (!diagramSlides.length && diagramOptOut) {
    waived.push(`diagram gate waived: ${diagramReason}`);
  }

  /* A pair that rebuilds a diagram does not morph it. Two adjacent sections
     that will pair (both carry data-auto-animate, ids agree, no restart) and
     render DIFFERENT diagram sources produce the silent failure MERMAID.md §5a
     measured: labels glide without their boxes, edges fly origin-relative,
     and the SVG looks clean while the motion lies. Identical sources hold
     still and are fine. Sources compare normalized (whitespace-collapsed), so
     reformatting alone never fires this. */
  const mmdOf = (sec) =>
    [...sec.matchAll(/<pre[^>]*class="[^"]*\bmermaid\b[^"]*"[^>]*>([\s\S]*?)<\/pre>/g)]
      .map((m) => m[1].replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n---\n");
  const aaOf = (sec) => {
    const tag = (sec.match(/^<section[^>]*>/) || [""])[0];
    if (!/\bdata-auto-animate\b/.test(tag)) return null;
    return {
      id: (tag.match(/\bdata-auto-animate-id="([^"]*)"/) || [])[1] || "",
      restart: /\bdata-auto-animate-restart\b/.test(tag),
    };
  };
  sections.forEach((sec, i) => {
    if (i === 0) return;
    const a = aaOf(sections[i - 1]);
    const b = aaOf(sec);
    if (!a || !b || a.restart || b.restart || a.id !== b.id) return;
    const sa = mmdOf(sections[i - 1]);
    const sb = mmdOf(sec);
    if (sa && sb && sa !== sb) {
      const name = (sec.match(/data-name="([^"]*)"/) || [])[1] || `slide ${i + 1}`;
      findings.push(
        `s${i}→s${i + 1} (${name}): paired sections render different diagrams, which morphs shared nodes incorrectly (labels glide without boxes, edges fly origin-relative) — drop data-auto-animate from one side for a clean cut, or render the identical source on both (MERMAID.md §5a)`,
      );
    }
  });

  sections.forEach((sec, i) => {
    const name = (sec.match(/data-name="([^"]*)"/) || [])[1] || `slide ${i + 1}`;
    const label = `s${i + 1} (${name})`;
    for (const t of [...sec.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/g)].map((m) => m[0])) {
      // A table earns its highlight by marking what the table is *for* — the
      // significant value, the outlier, the row under discussion. The old test
      // was three finance class names, which both over- and under-fired: it
      // passed a table that merely mentioned "Edwin" and failed a clinical
      // results table for having no winner. These are emphasis devices, not
      // finance vocabulary.
      if (!/class="[^"]*\b(hot|win|dlt|note|flag|ns|outlier|hi|lo)\b/i.test(t)) {
        findings.push(
          `${label}: flat table with no emphasis: mark what the table is for — tint one row (tr.hot), the significant or outlier value (.win/.outlier), a signed delta (.dlt), or a threshold note (.note/.ns). Every row identical reads as a data dump`,
        );
      }
    }
  });

  /* The scaffold check. `bun cli.mjs new` copies templates/template.html whole,
   * and every gate in this skill passes on that copy: it has its icons, its rail,
   * its treatments and its word counts. So a deck that was scaffolded and never
   * replaced ships as a deck about an invented clinic, and nothing says so.

     It is checked by content, not by a marker: the strings below are the
     scaffold's own copy, and the one thing an author cannot do by accident is
     keep all of them. Comments are stripped first: an author who replaced every
     slide but left a scaffold comment behind has still replaced every slide,
     and failing them for a comment teaches surgery on the file instead of
     replacement of the content. */
  const SCAFFOLD_COPY = [
    "Meridian",
    "Maria Santos",
    "Pantry Director",
    "neighbors home",
  ];
  const decommented = html.replace(/<!--[\s\S]*?-->/g, " ");
  const scaffoldHits = SCAFFOLD_COPY.filter((t) => decommented.includes(t));
  // The scaffold is not a finding against itself. templates/template.html is the
  // sample content BY DEFINITION and templates/slides/*.html are the gallery's own
  // dummy copy, so the check is scoped to a deck an author is shipping. This
  // skill's own default `check` runs against templates/template.html, and a gate
  // that fails the folder's own starting point teaches people to skip it.
  const inTemplates = /(^|[\\/])templates[\\/]/.test(deck);
  if (inTemplates && scaffoldHits.length) {
    waived.push(`scaffold check skipped: ${path.basename(deck)} is the scaffold itself, not a deck`);
  } else if (scaffoldHits.length) {
    findings.push(
      `still the scaffold: ${scaffoldHits.length} of ${SCAFFOLD_COPY.length} sample strings survive (${scaffoldHits.join(", ")}) — ` +
        "`bun cli.mjs new` copies the template whole and every other gate passes on it, so the only thing that catches " +
        "an unreplaced deck is this. Replace the sample slides with your own (SKILL.md section 3), or delete them",
    );
  }
  // The template's own waiver text is the same fact in another form: a deck that
  // still carries it has not touched its body tag.
  if (!inTemplates && /data-diagram-reason="untouched templates\/template\.html/.test(html)) {
    findings.push(
      "still the scaffold: <body> carries the template's diagram waiver (\"untouched templates/template.html sample slides\") — " +
        "you have not edited this deck's body tag",
    );
  }

  /* A treatment without its CSS. `templates/template.html` ships CSS for
     eleven of the thirty gallery treatments, so the other nineteen live only
     in templates/slides/patterns.html. Nothing said so out loud, and nothing
     failed when the CSS stayed behind: a `.checklist` with no `.checklist` rule
     still renders, as a stack of left-aligned divs, and every gate is green
     because nothing about it is an error. The only way it becomes visible is to
     look at the slide, which is the same answer to every silent fault.

     So it is checked here, by asking the deck's own stylesheet whether it knows
     the class. The fix is one command, which is why the message names it. */
  const deckCss = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [])
    .map((m) => m.replace(/<style[^>]*>/i, "").replace(/<\/style>/i, ""))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const deckSelectors = [...deckCss.matchAll(/(?:^|[{};])\s*([^{}@]{2,600}?)\s*\{/g)]
    .map((m) => m[1])
    .join(" ");
  /* `meter` and `mermaid` are inner marks, not treatments: a diagram is drawn by
     Mermaid and styled through its wrapper, so no deck defines a `.mermaid` rule
     and a check that demanded one would fail every deck with a diagram in it. */
  const STYLE_CLS = treatmentList().filter((t) => t !== "meter" && t !== "mermaid");
  const usedTreatments = new Set();
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    const cls = m[1].split(/\s+/).filter(Boolean);
    const hit = STYLE_CLS.find((t) => cls.includes(t));
    if (hit) usedTreatments.add(hit);
  }
  // Which treatments the template itself carries, so the message names a real
  // count instead of one that drifts the day a treatment moves into the template.
  const TEMPLATE_CSS = (fs.readFileSync(path.join(HERE, "..", "templates", "template.html"), "utf8")
    .match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [])
    .map((m) => m.replace(/<style[^>]*>/i, "").replace(/<\/style>/i, ""))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const inTemplate = new Set(
    STYLE_CLS.filter((t) => new RegExp(`\\.${t}(?![\\w-])`).test(TEMPLATE_CSS)),
  );
  const missing = [...usedTreatments].filter(
    (t) => !new RegExp(`\\.${t}(?![\\w-])`).test(deckSelectors),
  );
  if (missing.length) {
    const only = STYLE_CLS.filter((t) => !inTemplate.has(t));
    findings.push(
      `treatment CSS missing: this deck uses ${missing.map((t) => "." + t).join(", ")} but its <style> has no rule that mentions ${missing.length > 1 ? "them" : "it"}, so ${missing.length > 1 ? "those slides render" : "that slide renders"} unstyled (a table that is not a table).\n    The template carries CSS for ${inTemplate.size} of ${STYLE_CLS.length} treatments; the other ${only.length} live only in templates/slides/patterns.html. Bring the CSS across with:\n    bun cli.mjs pattern <n> --css\n  where <n> is the pattern for ${missing.length > 1 ? "each class above, run it once per class," : "the class above,"} from bun cli.mjs pattern --list`,
    );
  }

  const usesMermaid = /class="mermaid"|mermaid\.initialize|mermaid\.render|mermaid\.min\.js/i.test(html);
  if (!/nav\.rail[\s{]/.test(html) || !/mountRail\(\)/.test(html)) {
    findings.push("sidebar rail missing: every slide must carry the position chrome as its first grid column (nav.rail built by mountRail) — a fixed overlay or no rail fails the rail's whole point");
  }
  /* A <script> inside an HTML comment never runs and never errors: an insert
     anchored on a comment-interior line lands the whole render block in the
     dark, and every gate stays green around it because there is nothing to
     fail — only the screenshot catches it. So the comment bodies are read as
     code here, once, for exactly that tag. */
  for (const m of html.matchAll(/<!--([\s\S]*?)-->/g)) {
    const sm = /<script(?=[\s>/])/.exec(m[1]);
    if (sm) {
      const line = html.slice(0, m.index).split("\n").length + m[1].slice(0, sm.index).split("\n").length - 1;
      findings.push(
        `commented-out <script> at line ${line}: a script tag inside an HTML comment never runs and never errors — the diagram it was meant to render stays an empty container with green gates. Uncomment it or delete it`,
      );
      break;
    }
  }
  if (usesMermaid) {
    const cdn = html.match(/https?:\/\/[^\s"']*mermaid[^\s"']*/i);
    if (cdn) findings.push(`mermaid from a CDN at render time (vendor it instead): ${cdn[0].slice(0, 80)}`);
    if (/mermaid\.esm\.m/i.test(html)) findings.push("mermaid ESM entry (CORS-blocked on file://): vendor dist/mermaid.min.js instead");
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]*mermaid[^"]*)"/gi)].map((m) => m[1]);
    if (!srcs.length && /class="mermaid"/.test(html)) {
      findings.push("a .mermaid container with no vendored mermaid <script src>: nothing will render it");
    }
    for (const s of srcs) {
      if (/^https?:\/\//i.test(s)) { findings.push(`mermaid <script src> is remote: ${s.slice(0, 80)}`); continue; }
      const full = path.resolve(deckDir, s);
      if (!fs.existsSync(full)) findings.push(`vendored mermaid not on disk next to the deck: ${s}`);
    }
    if (!/mermaid\.initialize/.test(html)) findings.push("mermaid.initialize() missing: call it synchronously, before any await");
    else if (!/startOnLoad\s*:\s*false/.test(html)) findings.push("mermaid.initialize() without startOnLoad:false: auto-start races the render");
    if (!/mermaid\.parse/.test(html)) findings.push("no mermaid.parse() before render(): a parse error draws a clean-looking error card");
    if (!/(?<!function )defer\(/.test(html)) findings.push("diagram render not registered with defer(): the export may capture an empty container");
    if (!/mmdwrap/.test(html) || !/overflow\s*:\s*visible/.test(html)) {
      findings.push("the .mmdwrap theming patch is missing (anchor on .mmdwrap, overflow:visible): labels can slice mid-word with no page error");
    }
    /* The theme-proof half of the §4 patch. Mermaid injects an ID-scoped
       stylesheet with the light tokens baked at render time, and nothing
       re-renders on a theme switch — the presenter switches to dark on the
       cover, one click away on every deck. Without these rules dark mode shows
       light pills on edges, invisible actor boxes and dark-on-dark message
       text, all with green gates in light mode. Each requirement is typed to
       the diagrams the deck actually carries, so a flowchart-only deck is not
       failed for missing sequence rules. */
    const mermaidSrc = [...html.matchAll(/<pre[^>]*class="[^"]*\bmermaid\b[^"]*"[^>]*>([\s\S]*?)<\/pre>/g)].map((m) => m[1]).join("\n");
    const hasDiagram = (name) => new RegExp(`(^|[^A-Za-z])${name}([^A-Za-z]|$)`).test(mermaidSrc);
    if (!/\.labelBkg/.test(deckSelectors)) {
      findings.push("mermaid theme-proof missing: no .labelBkg rule in this deck's <style>, so edge labels render as light pills in dark mode (MERMAID.md §4 theme-proof block)");
    }
    if (!/\.actor-box|\.actor-top/.test(deckSelectors) && hasDiagram("sequenceDiagram")) {
      findings.push("mermaid theme-proof missing: this deck draws a sequenceDiagram but its <style> names no .actor rule, so actor boxes and their labels keep the baked light paint in dark mode (MERMAID.md §4 theme-proof block)");
    }
    if (!/statediagram-state/.test(deckSelectors) && (hasDiagram("stateDiagram") || /stateDiagram-v2/.test(mermaidSrc))) {
      findings.push("mermaid theme-proof missing: this deck draws a state diagram but its <style> names no .statediagram-state rule, so state boxes keep the baked light paint in dark mode (MERMAID.md §4 theme-proof block)");
    }
  }

  console.log(`visuals: ${deck}`);
  console.log(`  slides: ${sections.length}, icon zones and provenance checked per slide`);
  for (const w of waived) console.log(`  note  ${w}`);
  for (const f of findings) console.log(`  FAIL  ${f}`);
  console.log(`  per-slide visual audit:`);
  for (const a of audits) {
    const bits = [`${a.svgs} svg`, `zones ${a.zCovered}/${a.zTotal}`];
    if (a.diagram) bits.push(`diagram ${a.diagram}`);
    if (a.marks.length) bits.push(`marks: ${a.marks.join(", ")}`);
    bits.push(`approx ${a.bodyWords} body words`);
    if (a.textOnly) bits.push(`text-only body`);
    console.log(`  audit ${a.label}: ${a.status} — ${bits.join("; ")}`);
    for (const u of a.upgrades) console.log(`      > ${u}`);
  }
  // Rhythm: the treatment sequence read aloud. Repetition you can hear here is
  // repetition the audience sees; no per-slide check can catch it, so it prints
  // as deck-level advisories, never findings. Card-DNA treatments share a
  // surface (white cards, pastel tiles, taglines), so three of them anywhere in
  // the deck is the smell even when none repeats consecutively.
  const seq = audits.map((a) => a.treatment);
  console.log(`  rhythm: ${audits.map((a, i) => `s${i + 1} ${a.treatment}`).join(", ")}`);
  const counts = {};
  for (const t of seq) counts[t.split("+")[0]] = (counts[t.split("+")[0]] || 0) + 1;
  for (const [t, c] of Object.entries(counts)) {
    if (c >= 3) console.log(`      > treatment ${t} appears ${c}x: vary the bodies (DESIGN.md "The variety rule")`);
  }
  const dna = seq.filter((t) => CARD_DNA.has(t.split("+")[0])).length;
  if (dna >= 3) console.log(`      > ${dna} card-DNA bodies (grids, compares, splits, rails): same surface repeated — break one with scale, density, or frame`);
  if (!seq.some((t) => HERO.has(t.split("+")[0]))) console.log(`      > no oversized moment (bigstat, pull, blobstage): every deck earns one slide that breaks the surface`);
  if (seq.includes("toc") && /nav\.rail[\s{]/.test(html))
    console.log(`      > a contents slide (${seq.filter((t) => t === "toc").length}x) in a deck that ships the rail: the rail is the deck's table of contents, so keep this only if the talk branches into sections (DESIGN.md "Sidebar table of contents")`);
  let run = 0;
  for (let i = 0; i <= audits.length; i++) {
    if (i < audits.length && audits[i].bodyWords >= 70) { run++; continue; }
    if (run >= 3) console.log(`      > dense run s${i - run + 1}-s${i}: three dense slides whatever the treatments — split with a pull, a single stat, or a divider`);
    run = 0;
  }
  if (findings.length) {
    console.log(`\n${findings.length} finding(s) across ${sections.length} slide(s)`);
    return 1;
  }
  console.log("\nclean: every slide carries icons, every zone has its glyph, no emoji, mermaid contract holds");
  return 0;
}

process.exit(main());
