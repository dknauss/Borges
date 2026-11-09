# Free-text parser: more input styles (scope)

Scoping for [#231](https://github.com/dknauss/Borges/issues/231): teaching
`parseFreeTextCitation()` (`src/lib/free-text-parser.js`) to read Harvard,
IEEE, Vancouver, ABNT, and OSCOLA citations, which Borges formats but cannot
read back. Proposed 2026-11-09.

**Status:** On 2026-11-09 Dan chose Phase 0 first, then Phases 1 and 2, with
ABNT and OSCOLA waiting for demand. The other open questions take the
recommended answers unless he says otherwise. Phase 0 is merged (#267),
Phase 1 is merged (#274), and Phase 2 is built (see each section for the
measured result). That is the stop-or-go point: Phases 3 and 4 wait for
demand.

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
3. **Strip list numbering** (`[12]`, `12.`, `12)`, `(12)`) from the start
   of a free-text entry before parsing, in `parseFreeTextCitation()` (not in
   the segmenter, so `rawValue` and the notice keep what was pasted, and the
   measurement tools see the same input the editor does).
4. **Add the precision check** from Appendix A as a tool
   (`tools/markup-value/anystyle-precision.mjs` or similar, reading AnyStyle's
   XML at a pinned gem version), reported beside `npm run sweep`.

About 80 to 150 lines plus 20 to 30 tests. Expected effect: IEEE and ABNT
acceptance drops toward zero on the sweep (fewer details, but no wrong ones),
and the overall wrong-title rate on AnyStyle's data drops below 13%.

**Built 2026-11-09.** `isMisreadParse()` in `free-text-parser.js` discards a
pattern's result, and the next pattern is tried, when the title holds
`vol. 12, no. 3` / `v. 12, n. 3` or ends in a cut-off `, pp`; the publisher is
only a page number or range; a name holds a quotation mark; or a book's title
holds a quoted article title (`"Title,"`) or starts with a second ABNT author
(`CHABERT, Catherine`). `npm run anystyle-precision`, before and after:

| Subset | Accepted | Wrong title |
|---|---|---|
| All (7,846) | 2,412 → 2,240 | 311 (12.9%) → 184 (8.2%) |
| IEEE-like | 146 → 58 | 77 (52.7%) → 0 |
| Labelled `vol. … pp.` | 32 → 0 | 22 (68.8%) → 0 |
| ABNT-like | 84 → 71 | 20 (23.8%) → 7 (9.9%) |
| Numbered (`[n]`, `n.`) | 196 → 148 | 59 (30.1%) → 12 (8.1%) |

Of the 172 references no longer accepted, nearly all were wrong records
(chapters and articles read as books, page ranges as publishers); a few with
a right title also carried a wrong type or field. One correct book is lost,
"Novels: “The Scarlet Letter,” …", whose title quotes other titles.

The sweep, on the same rendered pages (details recovered):

| Corpus, style | Before | After | What changed |
|---|---|---|---|
| 12 works, Chicago N-B / A-D, APA, MLA | 40, 18, 38, 13 | same | – |
| 12 works, ABNT | 3 | 1 | 1 article no longer read as a book |
| 36 works, Chicago N-B / A-D, APA | 60, 17, 49 | same | – |
| 36 works, MLA | 37 | 35 | 1 article declined: it was a book titled "“Widow, Orphan, …” Journal of Near Eastern Studies, vol" published by "21" |
| 36 works, IEEE | 7 | 6 | 10 web pages declined: each was a book titled "Accessed: Oct" published by "27" |
| 36 works, ABNT | 31 | 29 | 1 article declined, as for MLA |

Every drop is a declined wrong record whose author or year happened to
score, so gate 1 holds in spirit: no correctly read entry was lost.

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

**Built 2026-11-09**, with one change to the layout above. Moving every
Chicago and APA pattern into `src/lib/free-text/` would have been a large
diff that changes nothing, so the new code follows the repository's flat
naming instead: `free-text-common.js` holds the shared helpers (moved out of
`free-text-parser.js` unchanged), `free-text-harvard.js` holds the Harvard
reader, and `free-text-parser.js` keeps the Chicago and APA patterns and the
entry point. Phase 2 adds `free-text-ieee.js` and `free-text-vancouver.js`
the same way. The hint is `parseFreeTextCitation( input, { styleKey } )`,
passed from `parsePastedInput()`: `STYLE_PATTERN_GROUPS` lists each style's
patterns (APA's three and Harvard's one so far), which run first; with no
group, or no hint, Harvard runs last, after every pattern that was there
before, so it only reads what they turned away.

Harvard is one function, `parseHarvardCitation()`. It splits on the year
(`(1997)` or `(no date)` with no full stop after it, which leaves APA's
`(1997).` alone), takes `Available at:` and `(Accessed: …)` off the end, and
reads what is left as a journal article (`‘Title’, Journal, 27(2), pp. 1–2`
or `…, May, p. 44`), a chapter or conference paper (`‘Title’, in Editor, A.
(eds) Book. Publisher, pp. 1–2`), a preprint (`‘Title’. arXiv
[Preprint]`), an encyclopedia entry with no author, a book (`Title. 3rd
edn. Place: Publisher.`), or a web page (a title with a link, with or
without an author). Everything is `low` confidence.

`npm run borges-parser` now passes the rendered style as the hint, as the
editor does. Before and after, details recovered:

| Corpus | Harvard | Every other style |
|---|---|---|
| 12 works | 0 → 59 of 67 (59 printed; AnyStyle 51) | unchanged |
| 36 works | 0 → 108 of 130 (113 printed; AnyStyle 82) | unchanged |

On AnyStyle's labelled references, with no hint: 106 more accepted, 2 more
wrong titles (2,240 accepted, 8.2% wrong → 2,346, 7.9%), and 30 of the 55
Harvard-like references read with no wrong title. The two new misreads (a
title standing where the author goes, and an original date in brackets,
`(1968) [1916].`) are now declined, and covered by tests. So are two found
while covering every branch: lower-case prose read as an editor ("in a few
friends of mine (eds)") and an empty quoted title (`‘’`).

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

**Built 2026-11-09**, as `free-text-ieee.js` (`parseIeeeCitation()`) and
`free-text-vancouver.js` (`parseVancouverCitation()`), about 510 lines each
with their comments. Each keeps its own name reader (`parseIeeeNames()`,
`parseVancouverNames()`) in the same file rather than in
`free-text-authors.js`, since neither is shared. Both are in
`STYLE_PATTERN_GROUPS` and run last without a hint, after Harvard.

- IEEE needs an initials-first first author ("C. R. Harris", "M.-W. Chang",
  "S. J. van der Walt"), which no other style prints, so it never claims a
  Chicago, MLA, APA, or Harvard citation. It reads `“Title,”` followed by a
  journal (`vol.`, `no.`, `pp.`, `Art. no.`, a date), `in` a book with
  `Eds.` or proceedings with a publisher, `arXiv:…`, a thesis, or a site with
  `[Online]. Available:` and `Accessed:`; an unquoted book
  (`Title, 3rd ed. Place: Publisher, Year`); and an encyclopedia entry or
  web page with no author. An organization is read only before a quoted
  title, so "Adobe, Structured Data Validator. GitHub, n.d." is declined.
- Vancouver reads `Surname AB` names (with `et al`, `Jr`, and hyphenated
  initials), an article by its `Year[ Mon[ DD]];Vol(Issue):Pages` tail, a
  book by `Place: Publisher; Year`, a chapter by `In:` (with `editors`), and
  a web page or preprint by `[Internet]` or `[Preprint]`, plus
  `[cited …]`, `Available from:`, `doi:`, and `PMID:` (kept as `PMID`). A
  marker decides the form, so a chapter that does not read is declined
  rather than read as a book with "In:" in its title. Shortened page ranges
  are written out ("357-62" → 357-362). An organization author is a short
  run of capitalized words with no commas ("University of Chicago Press").
- `container-title-short` is not set: whether a printed journal name is
  already the abbreviation can't be told from the text alone, so the name is
  kept as printed in `container-title`.

Details recovered, before and after:

| Corpus | IEEE | Vancouver | Every other style |
|---|---|---|---|
| 12 works | 2 → 64 of 67 (64 printed; AnyStyle 59) | 0 → 63 of 67 (58 printed; AnyStyle 46) | unchanged |
| 36 works | 6 → 107 of 130 (120 printed; AnyStyle 95) | 0 → 124 of 130 (123 printed; AnyStyle 76) | unchanged |

Vancouver passes "printed" because the written-out page ranges now match.
Most of what IEEE misses is not printed (years of web pages, publishers of
sites) or is one of three organization-authored books it declines.

On AnyStyle's labelled references, with no hint: 2,346 accepted with 184
wrong titles (7.9%) before, 2,636 with 184 (7.0%) after, so 290 more
references are read and none of them gets a wrong title; wrong years go
from 44 to 44. The IEEE-like subset reads 174 of 478 with no wrong title.
The first build added 50 wrong titles, all from one shape: names closed by
a full stop before an unquoted title ("R. Fagin, J. Halpern, and M. Vardi. A
model-theoretic analysis…", common in ACM and Springer lists, and
"Dietz, R. S., McHone, J. F., Volcanic…" read as Vancouver). Both readers
now decline a title that starts inside a name list, and a Vancouver
organization must have no commas or lone initials.

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
