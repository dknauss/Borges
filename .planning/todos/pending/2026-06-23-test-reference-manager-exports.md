---
created: 2026-06-23T00:00:00Z
title: Test more reference-manager exports (Mendeley, Zotero, EndNote, etc.)
area: testing
files:
  - src/lib/parser.js
  - src/lib/free-text-parser.js
  - docs/supported-input-style-matrix.md
  - docs/qa-matrix-checklist.md
  - docs/free-text-samples.md
---

## Problem

Input parsing (DOI, PubMed/PMID, BibTeX, free text) is exercised mostly with
hand-authored or single-source samples. Real users will paste exports straight
out of reference managers — Mendeley, Zotero, EndNote, Papers, RefWorks,
JabRef, etc. — and each tool has its own quirks in how it emits BibTeX (entry
types, field naming, brace/escaping conventions, `month` formats, non-ASCII
handling, abstracts/keywords/file fields) and RIS. We don't yet have a
systematic test corpus of real exports, so we can't be confident the parser
handles them gracefully.

## Solution

Build a small corpus of real export files captured from the major reference
managers (start with Zotero and Mendeley, then EndNote/JabRef) covering common
record types: journal article, book, book chapter, conference paper, report,
webpage. Feed each through the parser and verify the resulting CSL-JSON and
rendered citations are correct (or degrade cleanly with a clear notice when a
field/format is unsupported). Capture findings in the supported-input-style
matrix and QA checklist, and add regression fixtures/tests for any
manager-specific quirks that currently break or silently drop data.

Decision: RIS input is explicitly out of scope for now. Borges supports RIS as
an export format for citation-manager interoperability, but not as an import
format. Reference-manager testing should focus first on BibTeX, CSL-JSON, DOI,
PMID, and free-text export paths; revisit RIS import only as a separately scoped
feature.

## Progress (2026-09-25)

A first corpus of **hand-authored** fixtures landed in
`src/lib/__fixtures__/reference-manager-exports/` with
`src/lib/reference-manager-exports.test.js`: Zotero BibTeX, Zotero BibLaTeX,
Mendeley, EndNote, JabRef, and a Zotero CSL-JSON paste, across article, book,
chapter, conference paper, thesis, and webpage records. It found and fixed
four quirks:

- a blank line inside a field (multi-paragraph Zotero abstract) split the
  entry and lost the record;
- JabRef's `% Encoding` header, `@String` macros, and `@Comment{jabref-meta}`
  footer each raised an error, and macro-valued fields lost their value;
- EndNote's `type = {Journal Article}` became a CSL `genre`;
- a CSL-JSON paste came back as a nonsense webpage citation.

Still open: replace the hand-authored fixtures with **real, anonymized
exports** (at least Zotero and Mendeley), and add Papers, RefWorks, and
BibDesk once real samples exist.

## Acceptance targets

- A fixtures set of real (anonymized) exports from at least Zotero and Mendeley
  across the common record types.
- Parser behavior verified for each; regression tests added for any quirk that
  was mishandled.
- `docs/supported-input-style-matrix.md` and `docs/qa-matrix-checklist.md`
  updated to reflect which reference-manager exports are supported.
- An explicit in/out-of-scope decision recorded for RIS.
