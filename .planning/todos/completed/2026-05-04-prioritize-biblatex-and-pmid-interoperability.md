---
created: 2026-05-04T03:47:05.834Z
title: Prioritize BibLaTeX and PMID interoperability
area: interoperability
files:
  - src/lib/export.js
  - src/lib/parser.js
  - src/edit.js
  - package.json
  - .planning/ROADMAP.md
---

## Problem

Additional export/import formats came up during Zotero, Mendeley, and Google Scholar interoperability testing: EndNote XML/ENL, NBIB/MEDLINE, CIW/Web of Science tagged exports, and BibLaTeX. The project should avoid format sprawl while still supporting workflows that materially improve reuse. Current shipped formats are CSL-JSON, UTF-8 BibTeX, and RIS. BibLaTeX appears high-value and low-cost because the existing `@citation-js/plugin-bibtex` dependency already supports BibLaTeX input/output. NBIB is mostly useful for PubMed/biomedical workflows, but PMID resolution would likely deliver more user value before native NBIB import/export. EndNote XML may help EndNote/Mendeley users but is proprietary and lower priority than RIS/BibTeX. ENL is an EndNote library/database format and should stay out of scope. CIW/Web of Science tagged format is specialized and should wait for user demand because Web of Science also offers RIS/BibTeX exports.

## Solution

Plan export-format expansion in this order: (1) add BibLaTeX export and, if feasible with existing parser support, BibLaTeX import; (2) add PMID input/resolution before considering NBIB; (3) consider EndNote XML export only if manual EndNote/Mendeley testing proves RIS/BibTeX insufficient; (4) defer NBIB export and CIW/Web of Science tagged import/export until there is clear biomedical or bibliometrics demand; (5) keep ENL unsupported. Add tests against Zotero/Mendeley import behavior when each format is implemented.
