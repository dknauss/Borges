---
created: 2026-06-23T00:00:00Z
title: Test more reference-manager exports (Mendeley, Zotero, EndNote, etc.)
area: testing
files:
  - /Users/danknauss/Developer/GitHub/wp-bibliography-block/src/lib/parser.js
  - /Users/danknauss/Developer/GitHub/wp-bibliography-block/src/lib/free-text-parser.js
  - /Users/danknauss/Developer/GitHub/wp-bibliography-block/docs/supported-input-style-matrix.md
  - /Users/danknauss/Developer/GitHub/wp-bibliography-block/docs/qa-matrix-checklist.md
  - /Users/danknauss/Developer/GitHub/wp-bibliography-block/docs/free-text-samples.md
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

## Acceptance targets

- A fixtures set of real (anonymized) exports from at least Zotero and Mendeley
  across the common record types.
- Parser behavior verified for each; regression tests added for any quirk that
  was mishandled.
- `docs/supported-input-style-matrix.md` and `docs/qa-matrix-checklist.md`
  updated to reflect which reference-manager exports are supported.
- An explicit in/out-of-scope decision recorded for RIS.
