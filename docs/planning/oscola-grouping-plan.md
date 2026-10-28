# OSCOLA tables and bibliography: grouping plan

| | |
|---|---|
| Drafted | 2026-10-28, against `main` at `9fddeb9` (1.16.0) |
| Status | In progress: D1–D3 decided 2026-10-28 (the recommended options); T1–T4 built in #220 |
| Owner | TBD |
| Replaces | The "Scope sketch" in `sort-conformance-plan.md`, Epic-OSCOLA (REQ-S5 deferred) |

## TL;DR

- **The Epic-OSCOLA sketch groups the wrong way.** It splits an OSCOLA list into five groups: cases, legislation, books, articles, and online sources. OSCOLA 5 (2026) asks for tables of primary sources (cases first, then legislation, then other tables such as treaties) and one bibliography of secondary sources. It says "It is unnecessary to separate the various types of secondary sources from each other" (§1.7).
- **The design:** when an OSCOLA block holds cases, legislation, or treaties, `save()` writes one labelled list per group, in OSCOLA's order: Cases, Legislation, Treaties, Secondary sources. Each group has its own label and list. A block that holds only secondary sources saves exactly as it does today.
- **Case names in the table of cases are not italicised** (§1.6.2), and cases sort by their first significant word, so "Re Farquar's Estate" files under F.
- **One `save()` change, so one deprecation.** The change reaches only OSCOLA blocks with primary sources. The JS and PHP ports change together, pinned by the save-parity fixtures.
- **Effort:** about 1.5–2 weeks. That's less than the sketch's 2–3 weeks, because secondary sources stay one list and exports stay flat.
- **Two more OSCOLA 5 rules came up in this reading**, and both belong in separate tickets (T8 and T9): the double em-dash for repeated authors, and chronological order for one author's works.

## 1. What OSCOLA 5 asks for

The source is OSCOLA, 5th edition (Faculty of Law, University of Oxford, 2026), §§1.6–1.7. Newcastle University's OSCOLA 5 example bibliography uses the same three parts: "Table of UK Cases", "Table of UK Legislation", and "Secondary Sources".

| Rule | Section | What it means for Borges |
|---|---|---|
| The table of cases comes first, then the table of legislation, then other tables (such as international treaties) | §1.6 | Group order is Cases, Legislation, Treaties, then the bibliography |
| Primary sources are left out of the bibliography, because the tables list them | §1.7 | A case never appears in the secondary-sources list |
| "In a table of cases, case names are not italicised" | §1.6.2 | The title italics that `save()` adds for `legal_case` are turned off inside the Cases group |
| Cases are ordered by the first significant word: "Re Farquar's Estate" is tabled as "Farquar's Estate, Re", and "Re F" files under F | §1.6.2 | A sort key that skips a leading "Re". D2 decides whether the displayed text is rewritten too |
| Unless there are very few cases, divide them by jurisdiction | §1.6.2 | Out of scope: CSL has `jurisdiction`, but imports rarely fill it (§5) |
| In criminal-law works, "R v Smith" files as "Smith"; in other works it files under R | §1.6.2 | Keep filing under R, which is the general rule. A per-block "criminal law work" switch is out of scope |
| List statutory instruments after the statutes, or in a separate table if there are many | §1.6.3 | Inside Legislation, `legislation` and `bill` sort before `regulation` |
| Order legislation by the first significant word of its title | §1.6.3 | The existing title sort already skips English leading articles |
| Secondary sources go in one list, alphabetical by author, with no subdivision by type | §1.7 | Books, articles, and web pages stay together, sorted as today |
| Tables must be indexed | §§1.6.2–1.6.3 | That's a property of a printed book, so it doesn't apply to a web page |

## 2. Where the 2026-05-07 sketch differs

| Sketch | This plan | Why |
|---|---|---|
| Five groups: cases, legislation, books, articles, online | Four groups at most: Cases, Legislation, Treaties, Secondary sources | §1.7 says not to subdivide secondary sources |
| Groups always shown for OSCOLA | Groups shown only when the block holds a primary source | A secondary-only list is already correct, and leaving it alone keeps every existing block valid |
| CSL-JSON export embeds group metadata | Exports stay flat and unchanged | The group follows from `type`, so storing it again would only create a second source of truth |
| Plain-text export prints the group headings | The plain-text export prints the groups' labels | Same as the sketch |
| Headings hard-coded as `<h3>` | One level below the block heading, or a paragraph when the block heading is a paragraph | Keeps to the Heading Level setting (1.9.0), whose default doesn't add headings to the outline |

## 3. Design

### 3.1 Data

- `includes/styles.json` gains a `groups` array on the `oscola` entry. Each group has a `key`, a `label`, and the CSL `types` it takes:

  ```json
  "groups": [
      { "key": "cases", "label": "Table of Cases", "types": [ "legal_case" ], "romanTitles": true },
      { "key": "legislation", "label": "Table of Legislation", "types": [ "legislation", "bill", "regulation" ] },
      { "key": "treaties", "label": "Table of Treaties", "types": [ "treaty" ] },
      { "key": "secondary", "label": "Secondary Sources", "types": "*" }
  ]
  ```

  JS reads it through `getStyleGroups()` and PHP through `bibliography_builder_save_style_groups()`. `romanTitles` marks the table of cases. The secondary group is labelled "Secondary Sources", as in Newcastle's example, so it never repeats the block heading's default "Bibliography". `StyleDataTest.php` checks that each CSL type appears in only one group and that the catch-all comes last. No other style declares `groups`, so the other eight styles are unaffected.
- `block.json` gets no new attribute. The grouping follows from the style and from each entry's `type`. An entry whose type is edited moves to its new group on the next save, the way it already moves when it's re-sorted.

### 3.2 Order

- New module `src/lib/bibliography-groups.js` (ported in `includes/save-sort.php`): `groupCitations( sortedCitations, styleKey )` returns `[ { key, label, romanTitles, citations } ]`, or `null` when the style declares no groups or the block holds only secondary sources.
- `sortCitations()` takes `sourceGroups` (default `true`; `save()` up to 1.16.0 sorted with it off). Its comparator puts each group in turn.
- Groups come in the order `groups` lists them. Empty groups are skipped.
- Inside a table of primary sources, entries file by type (in the order the group lists them, so `legislation`, then `bill`, then `regulation`: statutory instruments after statutes, §1.6.3), then by filing title, then by the notes-family comparator. The filing title skips a leading article, and for `legal_case` also a leading `Re` or `In re`, so "Re Farquar's Estate" files under F (§1.6.2). Secondary sources keep the notes-family order unchanged.
- The flat order that `sortCitations()` returns elsewhere (exports, the read routes, `wp borges export`) becomes the grouped order read top to bottom, so every surface lists entries the way the page shows them.

### 3.3 Markup

When `groupCitations()` returns groups, the one `<ul>` becomes one labelled list per group, inside the existing `role="doc-bibliography"` wrapper:

```html
<section class="wp-block-bibliography-builder-bibliography" role="doc-bibliography" aria-label="Bibliography">
    <h2 class="bibliography-builder-heading">Sources</h2>
    <div class="bibliography-builder-group bibliography-builder-group-cases">
        <h3 class="bibliography-builder-group-heading" id="bibliography-group-cases-donoghue">Table of Cases</h3>
        <ul class="bibliography-builder-list bibliography-builder-list-unordered bibliography-builder-list-oscola" aria-labelledby="bibliography-group-cases-donoghue">
            <li id="ref-donoghue">…</li>
        </ul>
    </div>
    <div class="bibliography-builder-group bibliography-builder-group-secondary">…</div>
</section>
```

- **Group heading level (D3).** One level below the block heading (`h2` → `h3`, `h6` → a paragraph). When the block heading is a paragraph, which is the default, the group labels are paragraphs too. In both cases the list's `aria-labelledby` names it for screen readers ("Table of Cases, list, 3 items").
- **A `<div>`, not a `<section>`, wraps each group.** A named `<section>` is a region landmark, and four landmarks per bibliography would crowd a screen reader's landmark list.
- **The `id` suffix** is the group's first citation ID. Citation IDs are UUIDs, so two blocks on one page don't share label IDs, and blocks saved before `bibliographyId` existed need nothing new.
- **Group labels are saved in English,** as the style's default heading ("Bibliography") already is. OSCOLA is an en-GB style, and saved markup must not depend on the editor's locale (see `save.js`). Editable labels can follow if authors ask for them.
- **Entries keep their `<li id="ref-…">` markup,** `data-cite-*` attributes, and COinS spans. The JSON-LD `ItemList` keeps one `ListItem` per entry, in the grouped order, so `json-ld-enrichment.php`, which matches entries by `<li id="ref-…">` order, needs no change.
- **Italics:** inside the Cases group, the title of a `legal_case` entry is not italicised. Italics in the stored text (`<i>`) are still honoured, so a hand-edited entry keeps what the author wrote.
- **CSS:** the stylesheet gains a margin rule for `.bibliography-builder-group`. Nothing depends on it, so email and feed output still read correctly. `includes/email-output.php` needs no change, because it rewrites entries, not lists.

### 3.4 Editor

- The entry list in `edit.js` shows the same groups under their labels, so the author sees the order that will be saved. Reordering stays off for OSCOLA (it's a sorted, notes-family style).
- The inspector's "OSCOLA … Borges currently renders a single alphabetized list" notice, and the matching "Known limitations" entries in `README.md` and `readme.txt`, are removed in the same PR, as REQ-DOC1 asks.

### 3.5 Deprecation

- `save()` gains a `groupedBibliography: true` option, and `deprecated.js` gets a new entry whose `save` passes `groupedBibliography: false`. The `migrate` function returns the attributes unchanged.
- Only OSCOLA blocks that hold a primary source save differently, so other blocks never reach the new entry. The deprecation-chain regression tests get an OSCOLA block with a case, a statute, and a book.
- Blocks are upgraded lazily, the next time the post is edited. No migration script.
- **Write routes and bulk reformat** rebuild markup with the PHP port, so a REST or WP-CLI write to an OSCOLA block also saves the groups. Switching a block to or from OSCOLA through `…/reformat` or `wp borges reformat` adds or removes the groups, since the style key decides it.

### 3.6 Exports

- BibTeX, BibLaTeX, RIS, and CSL-JSON stay flat and unchanged, apart from following the grouped order.
- The plain-text read (`?format=text`, `wp borges export --format=text`) prints each group's label on its own line before its entries.

## 4. Decisions (made 2026-10-28)

- **D1. Groups.** (a) **Chosen:** OSCOLA 5's four groups (Cases, Legislation, Treaties, Secondary sources), shown only when there is a primary source. (b) The sketch's five groups, which split secondary sources against §1.7. (c) (a), plus a block setting that splits secondary sources by type for authors whose institution asks for it.
- **D2. "Re" cases.** (a) **Chosen:** sort under the first significant word and leave the text as written ("Re Farquar's Estate", filed under F). (b) Also rewrite the displayed text to "Farquar's Estate, Re", as §1.6.2 shows. That changes the stored formatted text, and breaks the rule that `save()` prints what citeproc returned.
- **D3. Group heading level.** (a) **Chosen:** one level below the block heading, and a paragraph when the block heading is a paragraph. (b) Always `h3`. (c) Always a paragraph.

## 5. Out of scope

- Splitting the table of cases by jurisdiction (§1.6.2). CSL has `jurisdiction`, but DOI, BibTeX, and RIS imports rarely fill it. Revisit once a structured legal import exists.
- "R v" filing for criminal-law works, and cross-reference entries for trademark and shipping cases (§1.6.2).
- Statute sub-entries for the sections cited (§1.6.3). Those come from footnotes, which Borges doesn't hold.
- Grouping for any other style. The `groups` field is general, but only OSCOLA uses it.

## 6. Tickets

| Ticket | Scope | Effort |
|---|---|---|
| T1 | `groups` in `styles.json`; JS and PHP readers; `StyleDataTest` checks | S |
| T2 | `groupCitations()` in JS and PHP, the "Re" sort key, and the SI order; coordination cases for both ports | M |
| T3 | Grouped `save()` markup and the PHP port; case-name italics off; save-parity fixtures regenerated | M |
| T4 | `deprecated.js` entry and deprecation-chain tests | S |
| T5 | Editor list grouping; remove the inspector notice and both readmes' limitation entries | S–M |
| T6 | Plain-text read groups; flat exports in grouped order; write-route and bulk-reformat tests on an OSCOLA block | S |
| T7 | Docs: `docs/csl-styles.md`, `SPEC.md`, the QA matrix, the demo page (`playground/demo-content.json`, with a case and a statute), and CHANGELOG | S |
| T8 | **Separate, needs checking first:** OSCOLA 5 §1.7 says that after the first entry, "replace the author's name with a double em-dash". `docs/csl-styles.md` says OSCOLA 5 writes repeated authors in full. If the manual confirms it, extend `repeated-authors.js` (now MLA-only) to OSCOLA with the em-dash mark | S–M |
| T9 | **Separate, needs checking first:** §1.7 lists one author's works chronologically. The notes comparator sorts by title, then year. If confirmed, OSCOLA's secondary sources sort author, then year, then title | S |

T1 through T7 can ship as one PR, because the markup change must land together with its deprecation. T8 and T9 each change `save()` too, so if Dan wants them they should ride in the same release, so that blocks go through as few deprecations as possible.

## Sources

- OSCOLA, 5th edition (2026), §§1.6–1.7: <https://www.law.ox.ac.uk/sites/default/files/2026-03/OSCOLA%205.pdf>
- OSCOLA 5 key changes: <https://www.law.ox.ac.uk/sites/default/files/2026-04/OSCOLA%20key%20changes.pdf>
- Newcastle University, OSCOLA 5th Example Bibliography (UK sources): <https://www.ncl.ac.uk/mediav8/academic-skills-kit/file-downloads/manage-info/OSCOLA%205th%20Example%20Bibliography%20-%20UK%20sources.pdf>

The quotations above were read through a text extraction of the manual. Before T3, T8, or T9 is built, check them against the printed manual.

## Revision history

| Date | Change | Author |
| --- | --- | --- |
| 2026-10-28 | First draft, from OSCOLA 5 §§1.6–1.7; replaces the Epic-OSCOLA scope sketch | Plan synthesis |
| 2026-10-28 | D1–D3 decided (the recommended options); markup settled as a `<div>` per group with a labelled list, label IDs from the first citation, and "Secondary Sources" as the last label | Build |
