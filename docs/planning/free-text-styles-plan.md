# Free-text parser: more input styles (scope)

Scoping for [#231](https://github.com/dknauss/Borges/issues/231): teaching
`parseFreeTextCitation()` (`src/lib/free-text-parser.js`) to read Harvard,
IEEE, Vancouver, ABNT, and OSCOLA citations, which Borges formats but cannot
read back. Proposed 2026-11-09. Nothing here is built yet; the decisions in
[Open questions](#open-questions) are Dan's.

The issue already lays out the per-style patterns, the size estimate, and the
collision risk. This plan adds what a closer look at the current code turned
up, and reorders the work around it.

## Summary

- **The parser already makes wrong records from IEEE and ABNT input.** It does
  not decline them, as `docs/free-text-parsing.md` assumed: a labelled IEEE or
  ABNT journal article is accepted as a *book* whose title runs into the
  volume and page labels, at `medium` confidence. On AnyStyle's labelled
  references, more than half of the IEEE-shaped entries the parser accepts get
  the wrong title (details below).
- **The `confidence` the parser returns is thrown away.** `PARSER_BACKENDS.freetext`
  in `src/lib/parser.js` keeps only `.csl`, so a `low` parse looks exactly
  like a sure one in the editor. The review flag that DOI imports use
  (`parseWarnings`, counted in `use-citation-import-actions.js`) is never set
  for free text.
- **Two of the five styles break before the parser sees them.** Numbered
  prefixes (`[1]` in IEEE, `1.` in Vancouver) are passed through into the
  first author's name. A multi-line OSCOLA paste whose entries end in a page
  number, with no full stop, is joined into one entry by
  `splitChunkIntoDetectedItems()` in `parser-segment.js`.
- **Recommendation:** start with a small *Phase 0* that makes the parser fail
  closed on these styles and surfaces its confidence, which is worth doing
  even if no new style is ever added. Then the issue's phases, in its order,
  each behind a measured gate, with a stop-or-go decision after IEEE and
  Vancouver.

## What the parser does with these styles today

### Wrong records, not refusals

The first matching pattern wins, and `parseSentenceBookCitation()`
(`Author. Title. Publisher, Year.`) matches journal articles whose labels
contain full stops:

| Input | Parsed as |
|---|---|
| `[1] A. B. Smith and C. D. Jones, "A study of things," IEEE Trans. Softw. Eng., vol. 12, no. 3, pp. 34–43, 2001.` | `book`, title `Softw. Eng., vol. 12, no. 3, pp`, publisher `34–43`, first author's given name `[1] A. B.`, second author family `C. D. Jones` with given `"A study of things` |
| `SMITH, João. Estudo das coisas. Revista de Coisas, v. 12, n. 3, p. 34-43, 2001.` | `book`, title `Estudo das coisas. Revista de Coisas, v. 12, n. 3, p`, publisher `34-43` |
| `Smith, J. (2001) 'A study of things', Journal of Stuff, 12(3), pp. 34–43.` (Harvard) | declined |
| `1. Smith AB, Jones CD. A study of things. JAMA. 2001;284(5):34-43.` (Vancouver) | declined |
| `Hart HLA, Punishment and Responsibility (OUP 1968)` (OSCOLA) | declined |

Harvard, Vancouver, and OSCOLA fail closed today. IEEE and ABNT do not, which
is why the issue's table shows IEEE accepting 16 of 36 entries but recovering
only 7 details.

### Measured on AnyStyle's labelled references

AnyStyle 1.6.0 ships its training data: 7,846 hand-labelled references in
`res/parser/core.xml`, `gold.xml`, and `good.xml`, each with its title and
date marked. Running the current parser over them (method in
[Appendix A](#appendix-a-reproducing-the-measurements)):

| Subset (selected by a rough pattern) | References | Accepted | Accepted with the wrong title |
|---|---|---|---|
| All | 7,846 | 2,412 (31%) | 13% |
| IEEE-like (`"Title,"` in quotes) | 478 | 146 | 53% |
| Labelled `vol. … pp.` | 168 | 32 | 69% |
| ABNT-like (`SURNAME, ` in capitals) | 287 | 84 | 24% |
| Harvard-like (`Surname, I. (Year)`) | 55 | 0 | – |

"Wrong title" means the parsed title is neither the labelled title nor a
prefix of it (or the reverse). Years are right on 98% of accepted entries, so
title is the field that goes wrong.

That 13% overall is the parser's baseline rate of quiet mistakes on mixed
real-world input, and it is the number a new style must not raise.

## Phases

Each phase is one pull request, with its own tests, and is gated by the
measurements in [Gates](#gates). Sizes are source lines in `src/lib/`, tests
excluded.

### Phase 0: fail closed and show confidence (recommended first)

Independent of the new styles.

1. **Stop the book patterns from swallowing labelled articles.** Decline a
   book match whose title or publisher contains a volume/issue/page label
   (`vol.`, `no.`, `pp.`, `v.`, `n.`, `p.` followed by a number), or a quoted
   title followed by a comma. Those inputs become notices again until a style
   module claims them.
2. **Carry confidence through.** Map `confidence: 'low'` to a new
   `parseWarnings` entry (say `free-text-low-confidence`) in
   `PARSER_BACKENDS.freetext`, so the editor's existing review count and
   notice cover it. Decide whether `medium` is flagged too (question 3).
3. **Strip list numbering** (`[12]`, `12.`, `12)`) from the start of a
   free-text entry before parsing, in `parser.js`, not in the segmenter.
   Keep it in `rawValue` so the notice shows what was pasted.
4. **Add the precision check** from Appendix A as a tool
   (`tools/markup-value/anystyle-precision.mjs` or similar, reading AnyStyle's
   XML at a pinned gem version), reported beside `npm run sweep`.

About 80 to 150 lines plus 20 to 30 tests. Expected effect: IEEE and ABNT
acceptance drops toward zero on the sweep (fewer details, but no wrong ones),
and the overall wrong-title rate on AnyStyle's data drops below 13%.

### Phase 1: style hint, module layout, Harvard

- Pass `styleKey` from `parsePastedInput()` (it already has it) to
  `parseFreeTextCitation( input, { styleHint } )`. The hinted style's
  patterns run first; the rest follow in today's order.
- Move to per-style modules behind the same entry point:
  `src/lib/free-text/` with `chicago.js` and `apa.js` holding today's
  patterns unchanged, a shared `common.js` (dates, publishers, trailing
  URL/DOI fields), and one file per new style. `free-text-parser.js` stays as
  the public entry point, so `parser.js`, the tests, and
  `tools/markup-value/borges-parser.mjs` keep their import path.
- Harvard (the `harvard1` variant `styles.json` formats): author-date
  with `Surname, I.` names, `(Year)` with no full stop after it,
  ‘single-quoted’ article and chapter titles, `in Surname, I. (ed.)`
  chapters, `Available at: URL (Accessed: date)`.

About 250 to 350 lines (the move itself is net zero). This phase is the
collision test: Harvard and APA differ by a few characters, so a Harvard
pattern can claim an APA citation and parse it worse.

### Phase 2: IEEE and Vancouver

- A second author parser for initials-first names (`A. B. Smith`, IEEE) and
  one for unpunctuated initials-last names (`Smith AB`, Vancouver), next to
  `free-text-authors.js`. Both handle `et al.` and `and`.
- IEEE: quoted `"Title,"`, `vol.`, `no.`, `pp.`, `[Online]. Available:`,
  abbreviated journal names (kept as `container-title` and also stored as
  `container-title-short`, which the IEEE and Vancouver formatters print), conference papers (`in Proc. …`).
- Vancouver: `Journal. Year;Vol(Issue):Pages.`, `Available from: URL`,
  `[cited YYYY Mon DD]`, books as `Place: Publisher; Year.`

About 350 to 500 lines. **Stop-or-go point:** after this phase the numeric
styles most likely to be pasted without a DOI are covered. Phases 3 and 4
should wait for evidence that someone needs them (question 4).

### Phase 3: ABNT

`SURNAME, Given.` in capitals (name-cased on import, as resolved records are),
title then container, `v.`, `n.`, `p.`, `Disponível em:` / `Acesso em:`,
Portuguese month abbreviations (`jan.`, `fev.`, … `dez.`), and `In:` for
chapters. About 200 to 300 lines.

### Phase 4: OSCOLA secondary sources

- First fix segmentation: `looksLikeStandaloneCitationLine()` requires a line
  to end in a full stop, `)`, `!`, `?`, or a URL, so OSCOLA lines ending in a
  page number are joined. With the style hint on OSCOLA, accept a line
  ending in a digit as a whole entry.
- Books `Author, Title (Publisher Year)`, articles
  `Author, 'Title' (Year) Vol Journal Page`, chapters
  `Author, 'Title' in Editor (ed), Book (Publisher Year)`.
- Names as `Surname Initials` without full stops, like Vancouver's, so it
  reuses Phase 2's author parser.

About 250 to 350 lines. **Out of scope:** cases, legislation, and treaties.
They are their own grammar (`R v Smith [2001] UKHL 1`, `Human Rights Act 1998,
s 3`) and map to `legal_case`, `legislation`, and `treaty`; they belong in a
separate issue, if anyone asks.

## Test corpus

Three sources, each with a different job:

| Source | What it gives | Job |
|---|---|---|
| `tools/markup-value` corpora (12 and 36 works, rendered in all nine styles) | Exact ground truth per style, since Borges rendered them | Recall: details recovered per style (`npm run sweep`) |
| AnyStyle's labelled references (7,846 in `core`, `gold`, `good`) | Real-world, mixed-style input with labelled titles and dates | Precision: wrong-title rate on everything accepted; IEEE and ABNT examples |
| Hand-written cases from each style's guide | The forms the corpora lack: chapters, theses, web pages, reports, ABNT dates, OSCOLA chapters | Unit tests in `free-text-parser.test.js` and `docs/free-text-samples.md` |

AnyStyle's data has plenty of IEEE and some ABNT-shaped references, but
almost no Vancouver (1 match), Harvard (55), or OSCOLA (none), so for those
styles the rendered corpora and hand-written cases carry the load.

**Licence.** The issue asked whether `anystyle-data` may be used. That gem is
only a word dictionary (`dict.txt.gz`, BSD-2-Clause). The labelled references
are in the `anystyle` gem itself (`res/parser/*.xml`), also under a BSD-2-Clause
licence (Copyright 2011–2023 Sylvester Keil). BSD-2-Clause allows copying with
the notice kept. Two ways to use it (question 5): fetch the pinned gem in the
tool, as `parser-baseline.mjs` already runs AnyStyle, and commit nothing; or
commit a small selected subset as Jest fixtures with the notice added to
`THIRD-PARTY-NOTICES.txt`.

## Gates

Every phase's pull request reports, before and after:

1. `npm run sweep` on both corpora: details recovered and entries accepted
   per style. No existing style's score may drop.
2. The AnyStyle precision check: overall wrong-title rate must not rise;
   per-subset rates for the style being added must fall or hold.
3. `free-text-parser.test.js` and the `docs/free-text-samples.md` cases pass
   unchanged; `docs/free-text-unsupported-samples.md` cases still decline
   unless the phase deliberately supports them (and moves them).

Stop after any phase where gate 1 or 2 fails and can't be fixed without
loosening an existing pattern.

## Effort

| Phase | Source lines | Tests | Size |
|---|---|---|---|
| 0: fail closed, confidence, numbering, precision tool | 80–150 | 20–30 | One sitting |
| 1: style hint, modules, Harvard | 250–350 | 30–40 | One to two sittings |
| 2: IEEE and Vancouver | 350–500 | 40–50 | Two sittings |
| 3: ABNT | 200–300 | 20–30 | One sitting |
| 4: OSCOLA secondary sources | 250–350 | 20–30 | One to two sittings |

Totals match the issue's estimate (about 1,100 to 1,650 lines, +8 to 12 KB
minified in the lazy import chunk only). Visitors never load the parser.

## Risks

- **Collisions** (the issue's main risk) are handled by the style hint and the
  gates, and tested first with Harvard against APA.
- **Phase 0 lowers the IEEE and ABNT sweep numbers** before later phases raise
  them. That is intended: those details are wrong today.
- **Review fatigue.** Flagging every `low` parse (and perhaps `medium`) adds
  notices. The existing count-based notice keeps it to one line per import.
- **The style hint can mislead** when an author pastes citations copied from a
  source in another style. The hint only reorders patterns, so the other
  styles are still tried.
- **Corpus drift.** The rendered corpora come from Borges's own formatter, so
  they test reading Borges's output, which is tidier than what people paste.
  The AnyStyle data and hand-written cases cover the messier side.

## Open questions

1. **Phase 0 first, as its own PR?** Recommended: it removes wrong records
   that exist today and is useful whether or not more styles follow.
2. **How strong is the style hint?** Recommended: reorder only (hinted style
   first, then all others). The alternative, trying only the hinted style,
   collides less but refuses citations copied from elsewhere.
3. **Which confidence levels get the review flag?** Recommended: flag `low`;
   leave `medium` unflagged until the precision tool shows how often
   `medium` is wrong per pattern.
4. **Where to stop?** Recommended: commit to Phases 0 to 2, then decide on
   ABNT and OSCOLA from user reports. Do you know of Brazilian or UK law users
   who paste citations without identifiers?
5. **AnyStyle's labelled data:** fetch it in the tool only (nothing committed,
   recommended), or commit a subset as Jest fixtures with its notice?

## Appendix A: reproducing the measurements

```bash
gem fetch anystyle -v 1.6.0
tar xf anystyle-1.6.0.gem && tar xzf data.tar.gz   # res/parser/*.xml
```

Each `<sequence>` in the XML is one reference; its children (`author`,
`title`, `date`, …) are the labelled parts, in order. Joining the children's
text gives the reference as printed; the first `title` and `date` give the
expected title and year. Each reference goes through `parseFreeTextCitation()`
(loaded with `tools/markup-value/src-esm-hooks.mjs`, as `borges-parser.mjs`
does). Titles are compared lowercased with punctuation removed, counting a
match when one is a prefix of the other. Measured on `main` at 3c15625.
