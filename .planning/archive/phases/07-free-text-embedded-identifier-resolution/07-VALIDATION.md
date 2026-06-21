---
phase: 7
slug: free-text-embedded-identifier-resolution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-21
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x (via `@wordpress/scripts`) |
| **Config file** | root Jest config (`@wordpress/scripts` default); mocks in `src/__test-utils__/citation-js-mocks.js` |
| **Quick run command** | `npm test -- src/lib/parser.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5–15 seconds (single file) / full suite per existing baseline |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- src/lib/parser.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds (single-file quick run)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | Extraction helper | unit | `npm test -- src/lib/parser.test.js` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | False-positive guard / DOI precedence | unit | `npm test -- src/lib/parser.test.js` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 2 | Embedded DOI resolves via CrossRef | integration | `npm test -- src/lib/parser.test.js` | ❌ W0 | ⬜ pending |
| 07-02-02 | 02 | 2 | Embedded PMID resolves via REST proxy | integration | `npm test -- src/lib/parser.test.js` | ❌ W0 | ⬜ pending |
| 07-02-03 | 02 | 2 | Graceful degradation → freetext → SUPPORTED_INPUT_MESSAGE | integration | `npm test -- src/lib/parser.test.js` | ❌ W0 | ⬜ pending |
| 07-02-04 | 02 | 2 | Extracted DOI dedup + remainingInput on failure | integration | `npm test -- src/lib/parser.test.js` | ❌ W0 | ⬜ pending |
| 07-02-05 | 02 | 2 | No new SSRF fetch surface (fetchFn arg inspection) | unit | `npm test -- src/lib/parser.test.js` | ❌ W0 | ⬜ pending |
| 07-03-01 | 03 | 3 | Fixture docs updated/migrated | manual | doc diff review | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Plan/wave/task IDs above are an expected shape; the planner sets final IDs in the PLAN.md files.)*

---

## Wave 0 Requirements

- [ ] New `describe('extractEmbeddedIdentifier')` block in `src/lib/parser.test.js` — extraction unit cases (DOI, PMID, null, DOI-over-PMID precedence, URL-wrapped DOI, trailing punctuation, false-positive guards)
- [ ] New `describe('parsePastedInput — embedded identifier resolution')` block in `src/lib/parser.test.js` — integration cases with mocked CrossRef/PMID resolvers (`makeFetchFn` pattern + `citation-js-mocks.js`)
- [ ] Fixture additions in `docs/free-text-samples.md`
- [ ] Fixture migrations out of `docs/free-text-unsupported-samples.md` (for any previously-unsupported sample that now resolves via embedded identifier)

*Existing Jest setup, `citation-js-mocks.js`, and the `makeFetchFn` pattern cover all cases — no new test infrastructure needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Fixture docs reflect new support | Doc fixtures | Doc-content judgment, not assertable | Confirm the canonical embedded-DOI case appears in `docs/free-text-samples.md` and any now-supported case is removed from `docs/free-text-unsupported-samples.md` |

*All behavioral logic has automated verification; only the fixture-doc prose update is manual.*

---

## Observable Behaviors (Nyquist sampling targets)

1. **Embedded DOI happy path** — `Author. Title. Journal 1 (2024): 1–10. https://doi.org/10.1234/abcd` → one entry, `inputFormat: 'doi'`, CrossRef-sourced CSL (not heuristic).
2. **Embedded PMID happy path** — `Author. Title. PMID: 12345678` → one entry, `inputFormat: 'pmid'`, NCBI-sourced CSL.
3. **Graceful degradation (resolver 404)** — citation with `10.9999/doesnotexist` → freetext parse if it matches, else `SUPPORTED_INPUT_MESSAGE` in `errors` and original string in `remainingInput`.
4. **Dedup** — embedded DOI already in `existingDoiValues` → `skippedDuplicateCount: 1`, no entry (matches bare-DOI behavior).
5. **False-positive guard (DOI)** — "Chapter 10. Methods" → no DOI resolution attempt.
6. **PMID label required** — "Call 12345678 for support." → no PMID resolution attempt.
7. **No regression** — existing DOI-only, PMID, and freetext tests still pass.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
