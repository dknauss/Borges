---
phase: 04-frontend-cite-export-affordances
plan: 01
status: complete
---

# 04-01 Summary — Foundation: attribute + export + deprecation

Lays the three foundations required before any `save()` shape change in Plan 02.

## What changed

- **block.json** — added two attributes following the `outputCoins`/`outputCslJson` pattern:
  - `outputCiteExport` (boolean, default `false`) — the opt-in for per-entry cite/export affordances.
  - `bibliographyId` (string, default `""`) — stable per-block id for the future writable REST work (REST-API-M0-BLOCK-ID).
- **src/edit.js** — added a one-shot `useEffect([])` that assigns `crypto.randomUUID()` to `bibliographyId` on first insertion when empty (idempotent on later renders).
- **src/lib/export.js** — added the `export` keyword to `cslToRisEntry`; the function body is unchanged. `save()` can now generate per-entry RIS synchronously in Plan 02.
- **src/deprecated.js** — prepended a new `deprecated[0]` that freezes the current pre-Phase-4 `save()` shape (mirrors `src/save.js`: `sortEntries: true, headingTag: 'p', entryTag: 'cite'`, no `<details>`). Existing entries shifted to `[1]`–`[5]`. This is the migration gate that keeps already-saved blocks valid once `<details>` is introduced.

## Tests

- **src/lib/export.test.js** — three `cslToRisEntry` cases: named-export importability, `TY  - JOUR` opener / `ER  - ` terminator, and `AU` line for a named author.
- **src/deprecated.test.js** — new case asserting `deprecated[0]` renders `<li>` with no `<details>`; existing index references shifted by one.

## Deviation from plan

The plan's `<interfaces>` snippet (authored 2026-05-10) described a "current" `deprecated[0]` without `includeDeprecatedBiblioEntryRole`. The live `deprecated.js` had since gained that option, while live `src/save.js` does **not** emit the role. The new `deprecated[0]` was therefore matched to the **actual current `save.js` shape** (no role, no `linkVisibleUrls` arg since it defaults true) rather than the stale snapshot — same intent, accurate to current state.

## Verification

- `npm test` — 554 passed, 2 skipped (perf benchmarks), 0 failed.
- `lint:js`, `lint:css`, `lint:php`, `npm run build` — all pass.

## Next

Wave 2 — Plan 02 (save markup `<details>` panels) and Plan 03 (editor pre-computation of BibTeX/BibLaTeX export strings).
