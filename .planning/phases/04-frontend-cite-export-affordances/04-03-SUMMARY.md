---
phase: 04-frontend-cite-export-affordances
plan: 03
status: complete
---

# 04-03 Summary — Editor pre-computation of BibTeX/BibLaTeX export strings

`save()` is synchronous and cannot call the async citation-js export builders, so per-citation BibTeX and BibLaTeX strings are now pre-computed in the editor and stored on each citation. The `<details>` panels from Plan 02 then render those links with no runtime work.

## What changed

- **New `src/hooks/compute-export-strings.js`** — shared `computeExportStrings(cslObjects, citationStyle)` helper. Resolves each entry independently via `buildBibtexExportContent`/`buildBiblatexExportContent`; on failure an entry falls back to `''` (never `undefined`), so one bad citation never blocks the rest.
- Wired into all **four format-then-`setAttributes` sites**, each with a cancel-guard re-check after the export `await`:
  - `use-citation-editor-state.js` — style change (Site 1) and structured-edit save (Site 2)
  - `use-citation-import-actions.js` — paste/import (Site 3)
  - `use-manual-citation-actions.js` — manual add (Site 4)
- Each site now also assigns a **stable `id`** (`entry.id || crypto.randomUUID()`) on the format pass — idempotent (existing ids preserved), satisfying REST-API-M0-CITATION-ID.

## Tests

- **New `compute-export-strings.test.js`** — pair-per-citation ordering, single-`[{ csl }]` builder calls, error→`''` fallback, empty/undefined input.
- **`use-citation-editor-state.test.js`** — mocks the helper; new cases assert export strings + stable id propagate after style change and structured-edit save.
- **New `use-citation-import-actions.test.js`** and **`use-manual-citation-actions.test.js`** — first test harnesses for these hooks; each asserts imported / manually-added citations carry `exportBibtex`/`exportBiblatex`.

## Deviation from plan

The plan suggested defining `computeExportStrings` inside `use-citation-editor-state.js`. It was extracted to its own module (`compute-export-strings.js`) instead, so all three hooks import one implementation rather than duplicating it or creating a hook-to-hook dependency. Same behavior, cleaner boundaries, and independently unit-tested.

## Verification

- `npm test` — 570 passed, 2 skipped (perf benchmarks), 0 failed.
- `lint:js`, `lint:css`, `lint:php`, `npm run build` — all pass.

## Next

Wave 3 — Plan 04-04 (Metadata output panel). After that, the phase PR.
