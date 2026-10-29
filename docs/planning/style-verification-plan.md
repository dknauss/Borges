# Style Verification Plan

How Borges checks that each bundled citation style is **correct** (an entry reads the way its manual says) and **complete** (every entry type and rule a user can reach has been checked), and which outside tools help.

## Status

- **Drafted:** 2026-10-29
- **State:** Phase 1 in progress. The citeproc-js and AnyStyle checks (`tools/style-reference/`) and this plan are in the same pull request. Nothing below changes a style or a golden yet; every finding is listed for review against the manual first.
- **Canonical path:** `docs/planning/style-verification-plan.md`

## TL;DR

Today one corpus of 20 items (`tests/fixtures/csl-styles/items.json`) pins each style's output, and the goldens were reviewed by hand. That catches regressions, but it cannot say whether a golden is right, and it covers 14 of the roughly 45 CSL types the importers can produce.

The plan adds three things:

1. **Outside references for correctness.** Render the same corpus with other engines and the official CSL styles, and triage every difference against the manual. The first of these, citeproc-js with the official styles, found two likely style gaps on its first run (abbreviated page ranges in Chicago and MLA).
2. **A coverage matrix for completeness.** Per style: which types, author-count thresholds, and manual rules have a golden, and which do not. The first gaps are concrete: no `et al.` threshold is tested at its boundary, and no golden covers a treaty, bill, encyclopedia entry, dataset, or software.
3. **Manual-sourced cases as ground truth.** For each style, a small set of cases built from the manual's own rules and examples, each citing its section, so a golden is right because the manual says so, not because it was reviewed once.

## What exists today

| Layer | What it checks | Where |
| --- | --- | --- |
| Style goldens | Each style's output for the 20-item corpus, byte for byte | `tests/phpunit/CslStyleGoldenTest.php`, `tests/fixtures/csl-styles/` |
| Entry independence | No entry depends on the entries rendered before it | same test |
| PHP version parity | The goldens on PHP 7.4–8.4 | `scripts/runtime-matrix/smoke.sh` |
| Style data | `styles.json` against `block.json`, the CSL files, and locales | `tests/phpunit/StyleDataTest.php` |
| Sort conformance | Borges's sort against citeproc-js's bibliography order | `src/lib/sorter.conformance.test.js` |
| Save parity | The PHP `save()` port against the JS output | save-parity fixtures |
| Formatter adaptations | citeproc-php workarounds | `tests/phpunit/FormatterAdaptationTest.php` |
| Reader round trip | Zotero's own OpenURL reader on the COinS spans | `tools/markup-value/zotero-coins.mjs` |

All of these are regression checks. None compares a style's text with a source outside the project.

## Correctness: outside tools

A reference is useful in proportion to how independent it is. Zotero, Mendeley, citation.js, and the official CSL styles all run on citeproc-js, so they count as one opinion, not four.

| Tool | Independent of | Verdict | Why |
| --- | --- | --- | --- |
| **citeproc-js + official CSL styles** | Borges's styles | **Added** (`tools/style-reference/compare.mjs`) | The CSL project's styles are maintained by people who read the manuals. Their output is a second reading of each manual. They are CC BY-SA, so they are downloaded at a pinned commit and never committed. |
| **citeproc-js + Borges's CSL** | citeproc-php | **Added** (the "engine" column) | Separates engine behavior from style rules. Only the two documented formatter adaptations differ today, so it could run in CI with no network (Phase 2). |
| **AnyStyle** (reference parser) | Every formatter | **Added** (`tools/style-reference/anystyle.mjs`) | Parses the formatted text back into fields: can a reader recover the title, authors, year, container, volume, pages, DOI? It also gives the free-text parser (#231) a baseline to compare against. Ruby gem, BSD-2, dev only. |
| **pandoc `--citeproc`** (citeproc-hs, Haskell) | citeproc-js and citeproc-php | **Recommended next** | A third engine and a tiebreaker when citeproc-js and the official style disagree with Borges, or when citeproc-js itself misbehaves (it prints `UKSC ___` for a case with no page). Installs on GitHub runners with `apt` or `pandoc/actions/setup`; one more function in `compare.mjs`. Replaces the retired `pandoc-citeproc`. |
| **Reference-manager exports: EndNote, Word** | CSL entirely | **Recommended, by hand** | EndNote and Word's built-in citations use their own engines and style files, so they are the only machine references that do not share CSL's assumptions. Import the corpus (`reference-manager-exports/borges-sample.ris` is a start), export the bibliography in each style they offer, and store the text as reference fixtures. EndNote needs a licence or trial (backlog #200). Word covers APA, Chicago, MLA, Harvard, IEEE. |
| **Manual sample pages** | Every tool | **Required** (ground truth) | Only the manual decides. Free sources: NLM *Citing Medicine* (a US government work, public domain, so examples can be transcribed), the IEEE Reference Guide PDF, the OSCOLA 5 PDF, the APA Style and MLA Style Center sample pages, and CMOS Online's quick guide. Paid: Cite Them Right, ABNT NBR 6023. |
| **CSL test suite** | — | **Later, targeted** | It tests engines, not styles. Worth running a subset (names, page ranges, dates, disambiguation) against citeproc-php plus Borges's formatter adaptations, to find engine bugs before users do. Not a style-correctness check. |
| Zotero's rendering, Mendeley, citation.js | — | **Skip** | All citeproc-js; `compare.mjs` already covers them. Zotero still matters as an importer, which the COinS check covers. |
| citeproc-rs | — | **Skip** | No release in years; not maintained. |
| GROBID, CERMINE (other parsers) | — | **Skip for now** | Java services, heavier than AnyStyle for the same question. |

### How to triage a difference

Every non-exact entry in a `compare.mjs` report gets one label, recorded in Phase 2's expected-differences file with a reason and, where it applies, the manual section:

- **Borges gap:** the manual agrees with the reference. Fix the style or formatter, regenerate the golden, review the diff.
- **Reference gap:** the manual agrees with Borges (the official style or engine is wrong or incomplete).
- **Edition gap:** the reference follows another edition (official Harvard is Cite Them Right 12th, Borges the 13th; official OSCOLA is the 4th, Borges the 5th).
- **Deliberate deviation:** listed in `docs/csl-styles.md` (stored title case, linkable URLs, no citation numbers, unabbreviated journal titles).
- **Engine:** citeproc-js and citeproc-php read the same CSL differently; covered by the formatter adaptations.
- **Data:** the corpus item itself is ambiguous (for example, a thesis whose place is only implied).

### First run (2026-10-29)

Full output: `tools/style-reference/results/2026-10-29.md`. Exact matches out of 20 against the official style: Chicago notes-bibliography 11, Chicago author-date 9, APA 13, MLA 14, Harvard 7, IEEE 8, Vancouver 7 (plus 4 differing only by dash form), OSCOLA 8, ABNT 3. Against Borges's own CSL in citeproc-js, every style matches except the two documented adaptations.

Initial triage. Each "likely" item needs a check against the manual before anything changes.

| Style | Entry | Difference | Initial label |
| --- | --- | --- | --- |
| Chicago (both), MLA | articles, conference paper | Borges `301–322`, official `301–22` | **Likely Borges gap.** CMOS 18 (ch. 9, inclusive numbers) and MLA 9 abbreviate inclusive page numbers. Borges omits `page-range-format` because citeproc-php then joins with a hyphen (`docs/csl-styles.md`, convention 5); the fix belongs in the formatter, which already rewrites ranges. |
| Harvard | books, report | official adds the place (`Chicago:`) | Edition gap: Cite Them Right 13th dropped the place. |
| Harvard | preprint | Borges `arXiv [Preprint]` | Edition gap or reference gap; check CTR 13th. |
| APA | report | Borges `(Report No. NLC-2020-4)` | Reference gap: APA 7 §10.4 prints "Report No." |
| APA | thesis | `[PhD diss., University of Toronto]` vs official `[PhD diss.]. University of Toronto.` | Check APA 7 §10.6: unpublished dissertations put the university inside the brackets, published ones after. Data question. |
| APA, Harvard, IEEE, Vancouver, OSCOLA | `article-eight-authors` | `J.-W.` vs `J.` | Engine: citeproc-js drops the second initial. Borges keeps both initials, as APA 7 does. Vancouver (`J-W` vs `J woo`) needs a *Citing Medicine* check on hyphenated given names. |
| IEEE | translated book | official drops the translator | Reference gap. |
| IEEE | book with no date | Borges adds `n.d.` | Check the IEEE guide. |
| Vancouver | webpage | order of title and `[Internet]` | Likely reference gap: *Citing Medicine*'s web site examples put the title first. |
| OSCOLA | journal articles | official adds the DOI in angle brackets | Edition gap; OSCOLA 5's DOI rule needs a check, since Borges prints no DOI for a print journal. |
| OSCOLA | report | official quotes the title, Borges italicizes | Check OSCOLA 5 (reports are cited like books in the 4th). |
| ABNT | translated book | `Tradução de Helen Wright` vs `Tradução: Helen Wright` | Check NBR 6023:2025. |
| ABNT | articles | official prints no DOI | Likely reference gap: NBR 6023 includes the DOI; check the 2025 section. |
| All | legal case, statute | widely different | Out of scope for the general styles; OSCOLA's tables are the legal path (`docs/planning/oscola-grouping-plan.md`). |

### AnyStyle baseline (2026-10-29)

Fields recovered from the golden text are high for the author-date and numeric styles (title 15–18 of 20, first author 15 of 15, DOI 8 of 8). The low scores are AnyStyle's limits, not Borges's: OSCOLA (no year 9 of 18, no volume or page; AnyStyle was not trained on legal citation) and ABNT volume (`v. 27`, 0 of 4). Organizations as authors and the conference paper's container are the entries most often misread in every style. Track the table per run; act on a drop, not on the absolute number.

## Completeness: the coverage matrix

A style is complete when every case below has a reviewed golden, for every style. Phase 3 adds a script that reads `items.json` and prints this matrix, so a gap is visible rather than remembered.

### Entry types

The corpus covers 14 types: `book` (with and without author, edited, translated), `chapter`, `article-journal`, `article-magazine`, `article-newspaper`, `webpage`, `thesis`, `report`, `paper-conference`, `article` (preprint), `legal_case`, `legislation`.

The importers can produce about 45. Priority for new corpus items, by how often users will hit them:

1. `entry-encyclopedia` and `entry-dictionary`, `review-book`, `dataset`, `software`, `post` and `post-weblog`, `motion_picture` and `broadcast` (common in the humanities and in web citing);
2. `treaty`, `bill`, `regulation` (OSCOLA tables), `patent`, `standard`;
3. the rest (`interview`, `personal_communication`, `manuscript`, `map`, `musical_score`, `speech`, `song`, `graphic`, `pamphlet`, `hearing`, `classic`): one item each, so no type renders untested.

### Rules each style must show

| Rule | Cases needed | Today |
| --- | --- | --- |
| `et al.` threshold | One entry below and one at each style's cut: MLA 3; Harvard, OSCOLA, ABNT 4; Chicago, IEEE, Vancouver 7; APA 21 | Only 1, 2, 3, 8, and 22 authors, so **no threshold is tested at its boundary** (4, 6, 7, 20 are missing) |
| Name forms | particles (`van`, `de la`), suffixes (`Jr.`), hyphenated and compound given names, a single-part name, an organization, non-Latin script | hyphenated given name and organizations only |
| Dates | full date, month only, season, range, BCE, `n.d.`, original date (reprints) | full date, year, `n.d.` (BCE in other tests) |
| Pages | range, single page, article number, ranges over 100 that abbreviate | ranges, article number |
| Identifiers | DOI, URL with and without access date, arXiv, PMID | DOI, URL, arXiv |
| Contributors | editor plus author, translator, edition plus translator, multiple editors, chapter in edited book | most |
| Year suffix | two works, same author and year (APA, Chicago author-date, Harvard, ABNT) | in other tests only, not in the style goldens |
| Repeated author | MLA's `---.` | in `save()` tests only |
| Locale | en-US, en-GB, pt-BR terms and months | covered by the style mix |

## Manual-sourced cases

For each style, 10 to 20 cases taken from the manual's own rules, in `tests/fixtures/csl-styles/manual/<style-key>.json`:

```json
{
	"rule": "Inclusive page numbers are abbreviated",
	"source": "CMOS 18, ch. 9 (inclusive numbers)",
	"item": { "type": "article-journal", "page": "301-322" },
	"expected": "… 301–22."
}
```

- Build each item from the rule, with our own titles and names. Copy only the pattern, not the manual's examples, except from public-domain sources (NLM *Citing Medicine*).
- `expected` is written by hand from the manual. A PHPUnit test renders each case; a failing case is a known gap until the style is fixed, recorded as expected to fail with its issue number, so the suite stays green and the gap stays visible.
- These cases become the authority. When `compare.mjs` and a manual case disagree, the manual case wins.

## CI integration

| Check | Where | Blocking | Network |
| --- | --- | --- | --- |
| Style goldens, manual cases, coverage matrix | PHPUnit in `ci.yml` | Yes | No |
| Borges's CSL in citeproc-js (engine parity) | Jest in `ci.yml`, with the two adaptations listed | Yes | No |
| citeproc-js and pandoc against the official styles | New scheduled workflow, weekly and by hand | No: it fails only on a difference missing from `tools/style-reference/expected-diffs.json` | Yes (pinned downloads) |
| AnyStyle round trip | Same scheduled workflow | No: it warns when a field's score drops below the stored baseline | RubyGems |
| EndNote, Word exports | By hand, once per manual edition | — | — |

The official styles stay out of pull-request CI: they need the network, and their CC BY-SA licence keeps them out of the repository.

## Phases

| Phase | Work | Size |
| --- | --- | --- |
| 1 | `compare.mjs`, `anystyle.mjs`, this plan, first-run triage | Done in this PR |
| 2 | Check the triage table against the manuals; fix the confirmed Borges gaps (page-range abbreviation first); `expected-diffs.json`; the engine-parity Jest test; add pandoc to `compare.mjs` | M |
| 3 | Grow the corpus: threshold boundaries, name forms, dates, the priority-1 types; the coverage-matrix script | M |
| 4 | Manual-sourced cases, one style at a time, starting with the most used (Chicago notes-bibliography, APA, MLA) | L |
| 5 | Scheduled workflow; EndNote and Word reference exports | S–M |

## Open questions

1. Should a growing corpus stay one `items.json`, or split by area (names, dates, types) so a failing golden says which area broke?
2. Which styles matter most to current users? That decides the order in Phase 4.
3. ABNT NBR 6023:2025 and Cite Them Right 13th are paid. Is there a copy to check against, or should those styles rely on the official CSL styles plus outside sample pages?
