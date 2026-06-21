---
phase: 07-free-text-embedded-identifier-resolution
verified: 2026-06-21T17:30:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
---

# Phase 7: Free-Text Embedded Identifier Resolution — Verification Report

**Phase Goal:** When a free-text citation pasted into the block contains an embedded DOI (`10.\d{4,}/…`) or PMID, extract that identifier and resolve it through the existing DOI/PMID resolver backend before falling back to the heuristic free-text parser — so a work that resolves cleanly as a bare identifier no longer fails when pasted as a full citation that carries the identifier inline. Scope is Tier 1 only.
**Verified:** 2026-06-21T17:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `extractEmbeddedIdentifier(chunk)` returns a DOI result when a chunk contains an embedded DOI | VERIFIED | Test: "extracts an embedded DOI from a full free-text citation string" — passes |
| 2 | `extractEmbeddedIdentifier(chunk)` returns a PMID result when a chunk contains a labeled PMID | VERIFIED | Test: "extracts a labeled PMID from a free-text citation string" — passes; "PMID 12345678" space form also covered |
| 3 | `extractEmbeddedIdentifier(chunk)` returns null when no identifier is present | VERIFIED | Test: "returns null for a free-text string with no embedded identifier" — passes |
| 4 | DOI is preferred over PMID when both co-occur in one chunk | VERIFIED | Test: "returns DOI when both a DOI and a labeled PMID are present in the same chunk" — passes |
| 5 | Chapter/page/decimal references do not match as DOIs | VERIFIED | Three false-positive guard tests ("Chapter 10.", "Table 10.1", "Pages 10.1000") all return null |
| 6 | Bare 8-digit numbers without a PMID label do not match as PMIDs | VERIFIED | Two tests ("Call 12345678", "pp. 12345678-12345680") return null |
| 7 | URL-wrapped DOIs and trailing sentence punctuation are normalized via normalizeDoiInput | VERIFIED | Test: "strips trailing sentence punctuation from an extracted DOI" — `.` stripped, value ends `10.1234/abcd` |
| 8 | A free-text citation carrying an embedded DOI resolves via CrossRef and yields inputFormat 'doi' | VERIFIED | Integration test: "resolves an embedded DOI via CrossRef and returns inputFormat 'doi'" — passes; fetchFn called with api.crossref.org |
| 9 | A free-text citation carrying an embedded PMID resolves via the PMID REST proxy and yields inputFormat 'pmid' | VERIFIED | Integration test: "resolves an embedded PMID via the PMID backend and returns inputFormat 'pmid'" — passes; fetchFn called with api.ncbi.nlm.nih.gov |
| 10 | When the resolver fails, the original full citation is retried through the freetext backend before any error is surfaced | VERIFIED | Test: "falls back to freetext when the embedded-DOI resolver returns a 404" — 404 triggers freetext, inputFormat 'freetext', no error surfaced |
| 11 | When both resolver and freetext fail, SUPPORTED_INPUT_MESSAGE appears in errors and the original full string appears in remainingInput | VERIFIED | Test: "surfaces SUPPORTED_INPUT_MESSAGE and original string when both resolver and freetext fail" — errors[0] contains 'Paste a DOI', remainingInput === FULL_CITATION |
| 12 | An embedded DOI already present in existingDoiValues is skipped (skippedDuplicateCount incremented), exactly like a bare-DOI paste | VERIFIED | Test: "deduplicates embedded DOI identically to a bare-DOI paste" — skippedDuplicateCount === 1, entries length 0, fetchFn not called |
| 13 | No fetch call is made to any host other than the existing CrossRef/NCBI/PMID-proxy endpoints | VERIFIED | Test: "fetchFn is only called with CrossRef or NCBI fixed hosts — no arbitrary URL fetch" — all mock.calls checked against ALLOWED_HOSTS |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/parser.js` | EMBEDDED_DOI_REGEX, EMBEDDED_PMID_REGEX, exported extractEmbeddedIdentifier(); detectFormat wired to use it with fallbackValue; createDetectedItem carries fallbackValue; mapWithConcurrency catch block degrades to freetext | VERIFIED | All symbols confirmed present at correct line ranges; implementation is substantive (165-line helper section); wired into detectFormat at line 432, fallbackValue threaded through splitChunkIntoDetectedItems at lines 511, 524 |
| `src/lib/parser.test.js` | `describe('extractEmbeddedIdentifier')` unit block (13 tests) + `describe('parsePastedInput — embedded identifier resolution')` integration block (8 tests) | VERIFIED | Both describe blocks present at lines 1508 and 1622; 21 new tests; all 86 parser tests pass |
| `docs/free-text-samples.md` | "Supported embedded-identifier samples" section with canonical DOI case (10.1234/abcd) and PMID case | VERIFIED | Section present at line 110; contains both samples; section intro explains bypass-and-degrade chain |
| `docs/free-text-unsupported-samples.md` | Clarifying note that inline DOI/PMID citations now resolve as of Phase 7 | VERIFIED | Note present at lines 7-9: "no longer unsupported — as of Phase 7 it is extracted and resolved via the existing DOI/PMID resolver" |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `extractEmbeddedIdentifier` | `normalizeDoiInput` | DOI match passed through normalizeDoiInput before return | VERIFIED | parser.js line 148: `value: normalizeDoiInput(doiMatch[0])` |
| `detectFormat` | `extractEmbeddedIdentifier` | Called as final branch before freetext return | VERIFIED | parser.js lines 432-435: `const embedded = extractEmbeddedIdentifier(chunk); if (embedded) { return { ...embedded, fallbackValue: chunk }; }` |
| `mapWithConcurrency catch block` | `PARSER_BACKENDS.freetext` | item.fallbackValue retry before formatting an error | VERIFIED | parser.js lines 794-812: `if (item.fallbackValue !== undefined)` guard wraps freetext retry |
| `dedup filter` | `normalizeDoiValueForLookup` | Embedded DOI item.format === 'doi' flows through unchanged | VERIFIED | No dedup filter modification; embedded DOI items carry format='doi' and a normalizeDoiInput-processed value that normalizeDoiValueForLookup can then further normalize for lookup — confirmed by dedup parity test |
| `splitChunkIntoDetectedItems` allLinesLookStandalone path | `createDetectedItem` with fallbackValue | detectedLine.fallbackValue passed at line 511 | VERIFIED | parser.js line 511: `detectedLine.fallbackValue` |
| `splitChunkIntoDetectedItems` single-chunk path | `createDetectedItem` with fallbackValue | detectedChunk.fallbackValue passed at line 524 | VERIFIED | parser.js line 524: `detectedChunk.fallbackValue` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| EMBED-EXTRACT | 07-01 | Extraction helper: DOI + PMID, unanchored, specific | SATISFIED | EMBEDDED_DOI_REGEX / EMBEDDED_PMID_REGEX + extractEmbeddedIdentifier() present and exported; 13-case unit block green |
| EMBED-FALSEPOS | 07-01 | False-positive guard + DOI-over-PMID precedence | SATISFIED | 5 false-positive guard tests pass; DOI-over-PMID test passes |
| EMBED-ROUTE | 07-02 | detectFormat routes embedded DOI/PMID to existing backends | SATISFIED | detectFormat wired at line 432; integration tests confirm CrossRef/NCBI routing |
| EMBED-DEGRADE | 07-02 | Graceful degradation: resolver fail -> freetext -> SUPPORTED_INPUT_MESSAGE | SATISFIED | mapWithConcurrency catch block updated; three degradation integration tests pass |
| EMBED-DEDUP | 07-02 | Extracted DOI flows through existing dedup/normalization + remainingInput | SATISFIED | Dedup parity test: skippedDuplicateCount === 1, fetchFn not called; no dedup filter changes needed |
| EMBED-NOSSRF | 07-02 | No new outbound fetch surface | SATISFIED | CROSSREF_CSL_API and NCBI_CSL_API constants unchanged; SSRF guard test asserts all fetchFn calls to known fixed hosts only |
| EMBED-FIXTURES | 07-03 | Fixture docs reflect new embedded-identifier support | SATISFIED | docs/free-text-samples.md section added; docs/free-text-unsupported-samples.md clarifying note added |
| Specific extraction that avoids false positives | 07-01/07-02 | DOI regex requires registrant prefix + slash + path; PMID requires label | SATISFIED | EMBEDDED_DOI_REGEX uses `(?<!\w)10\.\d{4,}\/[^\s]+`; EMBEDDED_PMID_REGEX uses `\bPMID[:\s]\s*(\d{1,8})\b`; all false-positive guard tests pass |
| Graceful degradation to heuristic freetext and SUPPORTED_INPUT_MESSAGE | 07-02 | Resolver fail -> freetext -> SUPPORTED_INPUT_MESSAGE | SATISFIED | Both degradation levels implemented and tested |
| Reuse of existing dedup/normalization path | 07-02 | normalizeDoiValueForLookup, existingDoiValues | SATISFIED | Embedded DOI items carry format='doi'; dedup filter required zero modification |
| No new SSRF surface | 07-02 | Fixed-host CrossRef/NCBI resolvers and authenticated PMID REST proxy only | SATISFIED | No new fetch constants, routes, or host strings added |
| TDD-first with fixture docs | 07-01/07-02/07-03 | Tests written before implementation; fixture docs updated | SATISFIED | Commit history confirms test commits precede feat commits; fixture docs updated in 07-03 |
| Excludes Tier 2 and Tier 3 | All | Generic monograph fallback and CRF/ML parsing excluded | SATISFIED | No monograph resolver, no ML dependency, no new backends added |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No TODO/FIXME/placeholder comments, empty implementations, or stub returns found in phase-07 modified files.

### Human Verification Required

None. All phase requirements are verifiable programmatically:
- Identifier extraction: unit tests confirm correct format/value/rawValue for all input shapes
- Pipeline routing: integration tests mock fetch transports and assert on result fields
- No UI, visual, or real-time behavior changed by this phase

### Gaps Summary

No gaps. All 13 must-have truths verified, all 4 artifacts confirmed substantive and wired, all 7 key links confirmed present, all requirements satisfied, full test suite green (670 tests, 1 pre-existing skip unrelated to this phase).

---

## Test Suite Results

- `npm test -- src/lib/parser.test.js`: 86 passed, 0 failed
  - `describe('extractEmbeddedIdentifier')`: 13 tests, all green
  - `describe('parsePastedInput — embedded identifier resolution')`: 8 tests, all green
  - All pre-existing parser tests: no regressions
- `npm test` (full suite): 670 passed, 2 skipped (pre-existing, unrelated), 0 failed

## Commit Trail

| Commit | Type | Description |
|--------|------|-------------|
| `8db8115` | feat | add extractEmbeddedIdentifier helper to parser (Plan 01 Task 1) |
| `b3f8397` | test | cover embedded-identifier false positives and DOI precedence (Plan 01 Task 2) |
| `a06c115` | fix | fix prettier formatting in false-positive guard tests |
| `c9b5539` | feat | route embedded DOIs and PMIDs to existing resolvers (Plan 02 Tasks 1+2) |
| `6d70138` | test | assert embedded-DOI dedup parity and no new fetch surface (Plan 02 Task 3) |
| `0b2c073` | docs | document embedded-identifier resolution samples (Plan 03) |

All commits are on branch `phase-07/free-text-embedded-identifier-resolution`. No production code, route, or external host was added beyond what was present before this phase.

---

_Verified: 2026-06-21T17:30:00Z_
_Verifier: Claude (gsd-verifier)_
