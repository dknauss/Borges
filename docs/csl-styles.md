# Bundled citation styles

Borges formats bibliographies with `citeproc-php` against nine CSL styles and three locales that live in this repository:

- styles: `packages/citation-style-language-styles/`
- locales: `packages/citation-style-language-locales/`

## Why they are project-authored

The CSL project's official styles and locales are licensed CC BY-SA 3.0, which is not GPL-compatible. WordPress.org requires GPL-compatible code and assets, so Borges must not bundle them (see `THIRD-PARTY-NOTICES.txt` and `SPEC.md`).

Instead, every style here was written for Borges from its style manual's own rules, and is licensed GPL-2.0-or-later. Style rules themselves are not copyrightable. The official CSL files were not used as a source.

Earlier releases shipped about 2 KB stand-ins. Those initialized every given name, dropped volume, issue and pages, and ignored editors, translators, editions and access dates. The locales had no month names or quotation marks, and pt-BR was a copy of English.

## Styles

| Key | File | Source | Notes |
| --- | --- | --- | --- |
| `chicago-notes-bibliography` | `chicago-notes-bibliography.csl` | Chicago Manual of Style, 18th ed. (2024), ch. 14 (bibliography entries) | First author inverted, "and" before the last name, 7+ authors cut to 3 + "et al."; publisher without place; no month when a journal has volume and issue |
| `chicago-author-date` | `chicago-author-date.csl` | Chicago Manual of Style, 18th ed. (2024), ch. 15 | Year after the author; 7+ authors cut to 3 + "et al."; publisher without place; journal form `27 (2): 97–111` |
| `apa-7` | `apa.csl` | APA Publication Manual, 7th ed., ch. 9–10 | Initials, `&`, up to 20 authors, 21+ as the first 19, "…", and the last; no publisher place |
| `mla-9` | `modern-language-association.csl` | MLA Handbook, 9th ed., ch. 5 | 3+ authors as "First, et al."; MLA month abbreviations (June, July, Sept.) |
| `harvard` | `harvard1.csl` | Cite Them Right, 13th ed. (2025) | en-GB; publisher without place; `article 108125` for numbered articles; initials without spaces, 4+ authors "et al.", `(eds)`, `edn`, single quotes, "Available at: … (Accessed: …)" |
| `ieee` | `ieee.csl` | IEEE Reference Guide (2023) | Initials first; 7+ authors as first + "et al."; `doi:` form; "[Online]. Available:" |
| `vancouver` | `vancouver.csl` | NLM *Citing Medicine*, 2nd ed. (ICMJE) | `Green S`; 7+ authors as 6 + "et al."; `2020 Apr;27(2):97-111`; "[Internet] … [cited …]" |
| `oscola` | `oscola.csl` | OSCOLA, 5th ed. (2026) (bibliography) | en-GB; a DOI is preferred and needs no access date; `Alvarez MI`, 4+ "and others"; `(2020) 27 Journal 97`; `Smith v Jones [2019] UKSC 12`; no final full stop |
| `abnt` | `abnt.csl` | ABNT NBR 6023:2025 | pt-BR; a DOI needs no access date; SURNAMES in capitals, `;` between authors, 4+ "et al."; `3. ed.`, `(org.)`, `In:`, `[S. l.]`, `[s. d.]`, "Disponível em: … Acesso em: …" |

Each style follows its manual's current edition, last checked on 2026-10-05. When a manual publishes a new edition, update the style's rules, the edition named in its header comment, this table, and the goldens in `tests/fixtures/csl-styles/` (review every changed line), in one change. Already-saved bibliographies keep their text until an entry is added or edited, or the style is changed.

Deviations shared by every style, all forced by how the block stores and renders entries:

- **Titles keep their stored capitalization.** APA's sentence case is not applied, and neither is ABNT's capitalized first word for title-first entries. The block re-applies italics by finding the stored title text in the formatted entry, so a case-transformed title would lose its italics.
- **URLs and DOIs stay linkable.** The block links `https://` URLs up to the next space. So OSCOLA prints URLs without angle brackets, and ABNT prints DOIs as `https://doi.org/` links.
- **Repeated authors are written out in full,** as Chicago 18, Cite Them Right, OSCOLA 5, ABNT (since 2018), APA, IEEE, and Vancouver all ask. MLA 9 is the exception: an entry by exactly the same author or authors as the entry before it starts with three hyphens (`---. Title`). The hyphens depend on list order, which the block sets when it sorts, so `save()` adds them (`src/lib/repeated-authors.js`, mirrored in `includes/save-markup.php`), not the CSL style. Screen readers hear the names, not the hyphens. The hyphens are saved as U+2011 non-breaking hyphens, because WordPress's typography filter turns ASCII hyphens into dashes on the front end, and the hidden names carry WordPress's `screen-reader-text` class, so both still display correctly if the plugin is deactivated. The rule is strict, and any doubt keeps the full names:
  - the two author lists must match field for field, so "Borges, Jorge Luis" and "Borges, J. L." stay apart;
  - an entry with manually edited display text is never shortened, nor is one whose text does not start with its own author names;
  - an entry with editors but no author keeps its names (MLA's `---, editor.` form is not applied).

  Only the saved bibliography carries the hyphens. The editor's list, copied text, and the exports keep the full names, so each entry still stands on its own.
- **Chicago keeps no place of publication for pre-1900 books.** The 18th edition still gives a place for books published before 1900, but CSL cannot compare years, so the place is dropped for every book.
- **No citation numbers.** Numeric styles number with the list element.
- **Journal titles print as stored.** They are not abbreviated (IEEE, Vancouver).

## Writing or changing a style

Follow these conventions. Each one works around citeproc-php 2.7 behavior (see `docs/external-eccentricities.md`):

1. **Suffix each part with `.` or `,` inside a space-delimited group.** citeproc-php moves punctuation inside a closing quote, and drops a doubled period ("eds.."), only for an element's own suffix, and only when it is exactly `.`, `,` or `;`. It never does this for a group delimiter.
2. **Use `<text term="editor" form="verb"/>` before the names for role phrases.** A `<label>` placed before a name loses its trailing space ("Translated byHelen").
3. **Choose creators explicitly when later conditions test them.** After `<substitute>`, citeproc-php treats the substituted variable as absent in every later `<if variable>`, so an edited book lost its title. Substitution is safe only when no later condition tests the substituted variable.
4. **Wrap the children of a nested `<choose>` in a delimited `<group>`.** A `<choose>` inside another branch joins its children with no delimiter ("15.Available").
5. **Omit `page-range-format` for en-dash styles.** Any `page-range-format` makes citeproc-php join the range with a hyphen, while none gives a full en-dash range ("97–111"). Vancouver (`minimal`) and ABNT (`expanded`) set one because they want hyphens.
6. **Use explicit `<date-part>` children.** Never use `form="text"` dates. See the "localized dates" entry.
7. **Keep sort keys in separate `sort-*` macros.** The `<sort>` blocks exist for the PHP/JS sort-coordination tests (`tests/phpunit/SortCoordinationTest.php`). Rendering a display macro as a sort key corrupts its name state, so the "and" disappears.

The formatter (`bibliography_builder_format_csl_items()`) also adapts input and output:

- **Per-entry rendering.** Each entry is rendered with its own formatter, because citeproc-php keeps name state across entries: once one entry is cut to "et al.", later entries lose their "and".
- **`bibliography_builder_prepare_csl_for_formatter()`**:
  - maps `{ "literal": … }` names to family-only names, because citeproc-php drops names without a family part;
  - derives `page-first`, for OSCOLA.
- **`bibliography_builder_normalize_formatted_text()`**:
  - removes the space citeproc-php puts before a label's comma;
  - fully initializes hyphenated given names ("J.-W.", not "J.- woo");
  - moves commas and periods inside closing quotes for `en-US` styles.

## Testing

`tests/phpunit/CslStyleGoldenTest.php` renders `tests/fixtures/csl-styles/items.json` in every style and compares the result with `tests/fixtures/csl-styles/<style-key>.txt`.

The corpus covers:

- books with one or two authors, a translator, and editors only;
- a chapter;
- journal articles with 1, 3, 8 and 22 authors;
- a magazine and a newspaper article;
- webpages with and without a date;
- a thesis, a report, a conference paper and a preprint;
- an entry with no author and no date;
- a case and a statute.

After an intended change:

```sh
BORGES_WRITE_STYLE_GOLDENS=1 composer test:php -- --filter CslStyleGolden
```

Then review the golden diff against the manual.

The same test fails when `vendor/citation-style-language/` is out of date with `packages/`. The formatter reads the vendor copy, so run `composer install` after editing a style.
