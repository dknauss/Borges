# Performance, Stability & Footprint Remediation Plan

This document turns the 2026-05-08 plugin audit into a concrete engineering plan focused on editor efficiency, release-package footprint, and long-term maintainability. It supplements the authoritative `/Users/danknauss/Developer/GitHub/wp-bibliography-block/SPEC.md`; it does not replace it.

It is structured as a sequence of self-contained requirements grouped into four phases. Each requirement is intended to be liftable into the issue tracker with minimal rewriting.

## Status

- **Drafted:** 2026-05-08
- **State:** Ready for sprint planning
- **Owner:** TBD
- **Stakeholders:** Plugin maintainers, performance reviewer, release engineering
- **Canonical path:** `docs/planning/performance-stability-remediation-plan.md`

---

## TL;DR

The plugin's public runtime is already strong: static save keeps the frontend lean, CSS is tiny, formatter dependencies are loaded lazily, and the existing input caps bound worst-case work. The main risk is not frontend bloat; it is **editor-side whole-bibliography work** and the growing complexity of a few large files.

The highest-return near-term work is:

1. Add **server-side formatter caching**
2. Add **PMID response caching**
3. Add **stale async-result guards** across all editor mutation paths
4. **Prune release-package dead weight**
5. Fix the **benchmark harness** so it measures the real formatting path and fails loudly on fallback

Longer-term work should focus on reducing whole-list reformatting for add/edit/delete flows, replacing the expensive bibliography cache-key strategy, and splitting monolithic modules before they become correctness hazards.

---

## Audit summary

### Current strengths

- **Frontend footprint is excellent**
  - Saved output is static HTML
  - No plugin-owned frontend runtime JS for normal bibliography rendering
  - `/Users/danknauss/Developer/GitHub/wp-bibliography-block/build/style-index.css` is ~1.7 KB
- **Runtime safety rails are already in place**
  - `/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/lib/parser.js` caps paste size at 1 MB and entries at 50
  - Parse concurrency is capped at 4
- **Formatter bootstrap is lazy**
  - `/Users/danknauss/Developer/GitHub/wp-bibliography-block/bibliography-builder.php` only loads Composer formatter dependencies when formatter routes are used
- **Test coverage is substantial**
  - 45 test files across JS, PHP, E2E, accessibility, and runtime validation

### Primary risks

1. **Whole-bibliography work on small edits**
   - Add, delete, structured edit, and style-switch flows often reformat and re-sort the entire list
2. **Expensive cache lookups**
   - `/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/lib/formatting/csl.js` uses deep stable-stringify of the full CSL payload for cache keys
3. **No persistent server-side formatter cache**
   - Repeated REST formatting requests can repay style file loading + citeproc rendering cost
4. **External fragility on PMID resolution**
   - `/Users/danknauss/Developer/GitHub/wp-bibliography-block/bibliography-builder.php` performs uncached network lookups
5. **Large, multi-responsibility files**
   - `src/edit.js`, `src/lib/free-text-parser.js`, `src/hooks/use-citation-editor-state.js`, and `bibliography-builder.php` are the clearest future fragility points
6. **Benchmark ambiguity**
   - The current harness can report timings influenced by formatter fallback behavior in non-WordPress environments

### Release-package observations

- Current release zip: ~588 KB
- Current unpacked release: ~1.9 MB
- Obvious prune candidates include:
  - `composer.lock`
  - non-runtime vendor docs/images/examples

---

## Success criteria

This plan is complete when:

- The plugin remains **frontend-zero-JS** for normal rendered bibliography output
- The release package is materially smaller with no runtime regressions
- Repeated editor formatting actions benefit from caching
- Async editor flows cannot commit stale state after user-visible cancellation or overlap
- Performance reporting becomes trustworthy and budget-driven
- The largest logic hotspots are either reduced in scope or scheduled for controlled decomposition

---

## Budget guardrails

These are planning targets, not yet CI-enforced hard gates.

### Frontend

- Plugin-owned frontend runtime JS: **0 KB**
- Frontend CSS per direction: **< 3 KB**
- No remote requests during saved bibliography rendering

### Release package

- Release zip: **< 450 KB**
- Unpacked release: **< 1.4 MB**
- No non-runtime vendor docs/examples/images in the shipped package

### Editor bundles

- `/Users/danknauss/Developer/GitHub/wp-bibliography-block/build/index.js`: **< 60 KB raw**
- Total shipped plugin JS chunks: **< 220 KB raw** near-term, **< 180 KB raw** stretch target

### Editor interaction budgets (50-entry bibliography)

- Deferred parse: **p50 < 20 ms**, **p95 < 60 ms**
- Warm batch format, same style: **p50 < 40 ms**, **p95 < 100 ms**
- Full style switch: **p50 < 120 ms**, **p95 < 250 ms**
- Single-entry add/edit/delete: **p50 < 50 ms**, **p95 < 120 ms**

### Stability

- Zero stale async commits in automated tests
- No production hotspot file should grow by more than 10% without explicit review
- New parser heuristics require regression fixtures/tests in the same PR

---

## Phase summary

| Phase | Theme | Requirements | Outcome |
| --- | --- | --- | --- |
| 1 | Quick wins | P1, P2, P3, P4 | Smaller package, faster repeated formatting, less network fragility |
| 2 | Correctness hardening | S1, S2 | Async editor stability and reliable benchmarks |
| 3 | Editor efficiency refactors | E1, E2, E3 | Reduced whole-list work and cheaper cache lookups |
| 4 | Maintainability hardening | M1, M2, M3 | Lower fragility in core modules and public API extraction |

Recommended execution order: **P1 → P2 → P3 → P4 → S1 → S2 → E1 → E2 → E3 → M1/M2/M3**

---

## Phase 1 — Quick wins

## REQ-P1 — Prune release-package dead weight

**Priority:** P0  
**Effort:** XS–S  
**Risk:** Low  
**Dependencies:** None

### Goal

Reduce shipped plugin size without changing runtime behavior.

### Scope

Update `/Users/danknauss/Developer/GitHub/wp-bibliography-block/scripts/package-release.sh` to:

- stop copying `composer.lock`
- prune non-runtime files from `vendor/` more aggressively
- verify expected package contents explicitly

### Acceptance criteria

- [ ] `composer.lock` is not present in the staged release directory
- [ ] known non-runtime vendor docs/examples/images are removed
- [ ] release zip is reduced from ~588 KB to **< 450 KB**
- [ ] unpacked release is reduced from ~1.9 MB to **< 1.4 MB**
- [ ] release smoke checks remain green

### Files affected

- `scripts/package-release.sh`
- release verification docs/checklists as needed

---

## REQ-P2 — Cache formatter responses server-side

**Priority:** P0  
**Effort:** S–M  
**Risk:** Low  
**Dependencies:** None

### Goal

Avoid repeating expensive citeproc work for identical style + bibliography inputs.

### Scope

In `/Users/danknauss/Developer/GitHub/wp-bibliography-block/bibliography-builder.php`:

- derive a stable cache key from:
  - style key
  - locale
  - normalized CSL payload hash
- cache formatted bibliography arrays
- prefer object cache, fallback to transients
- default TTL: **1 hour**

### Acceptance criteria

- [ ] identical repeat formatting requests hit cache
- [ ] cache miss path still returns identical output to current behavior
- [ ] warm-path formatter requests are measurably faster than cold-path requests
- [ ] tests cover cold and warm cache paths

### Files affected

- `bibliography-builder.php`
- PHP tests for formatter endpoints/services

---

## REQ-P3 — Cache PMID resolution responses

**Priority:** P1  
**Effort:** S  
**Risk:** Low  
**Dependencies:** None

### Goal

Reduce network latency, upstream dependency pressure, and repeated editor failures for the same PMID.

### Scope

In `/Users/danknauss/Developer/GitHub/wp-bibliography-block/bibliography-builder.php`:

- cache successful PMID lookups by PMID
- cache 404/not-found responses separately
- optionally cache transient upstream failures briefly

### Suggested TTLs

- success: **24h**
- not found: **1h**
- upstream failure: **5–15 min**

### Acceptance criteria

- [ ] repeated PMID lookup for the same ID usually avoids a remote request
- [ ] cached 404 behavior is deterministic and user-safe
- [ ] upstream failure caching does not mask recovery for too long
- [ ] tests cover success, 404, and transient failure paths

### Files affected

- `bibliography-builder.php`
- PHPUnit coverage for PMID route behavior

---

## REQ-P4 — Preserve frontend zero-JS architecture

**Priority:** P0  
**Effort:** Policy / review gate  
**Risk:** High if violated  
**Dependencies:** None

### Goal

Protect the plugin's strongest performance property: static saved output without a plugin-owned frontend runtime.

### Scope

Document and enforce that new work must not casually introduce:

- a PHP `render_callback` for normal bibliography output
- frontend re-rendering logic
- per-page formatter work on public requests

### Acceptance criteria

- [ ] this requirement is referenced in future planning/review discussions
- [ ] PRs introducing frontend runtime behavior justify it explicitly against `SPEC.md`

### Files affected

- planning docs, review checklists, architecture notes as needed

---

## Phase 2 — Correctness hardening

## REQ-S1 — Add stale-result guards to all async editor mutation flows

**Priority:** P0  
**Effort:** M  
**Risk:** Medium  
**Dependencies:** None

### Goal

Prevent older async editor work from overwriting newer user intent.

### Scope

Apply a consistent operation-token / latest-request-ref pattern to async flows in:

- `/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/edit.js`
- `/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/hooks/use-citation-editor-state.js`

Especially cover:

- paste/parse/import
- manual add
- delete
- style switch

### Acceptance criteria

- [ ] pending async work cannot commit after cancellation
- [ ] pending async work cannot commit after a newer operation supersedes it
- [ ] tests cover paste-twice, style-switch-during-parse, and delete-during-formatting scenarios
- [ ] no regressions to current focus-management behavior

### Files affected

- `src/edit.js`
- `src/hooks/use-citation-editor-state.js`
- related tests in `src/edit.test.js` and hook tests

---

## REQ-S2 — Make the benchmark harness authoritative

**Priority:** P0  
**Effort:** S–M  
**Risk:** Low  
**Dependencies:** None

### Goal

Ensure the benchmark harness measures the real formatting path or fails loudly.

### Scope

Update `/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/benchmarks/performance-benchmark.test.js` and related docs to:

- detect fallback formatting and fail or mark output invalid
- record cold vs warm formatting separately
- include p50/p95, not just averages
- annotate execution environment in output

### Acceptance criteria

- [ ] benchmark output clearly distinguishes parse, cold format, warm format, and style-switch work
- [ ] fallback-based timings are not silently treated as authoritative
- [ ] docs explain how to run and interpret the harness
- [ ] budgets in this plan can be compared against benchmark output

### Files affected

- `src/benchmarks/performance-benchmark.test.js`
- `docs/performance-benchmark-harness.md`

---

## Phase 3 — Editor efficiency refactors

## REQ-E1 — Reduce whole-bibliography reformatting on small mutations

**Priority:** P0  
**Effort:** M–L  
**Risk:** Medium  
**Dependencies:** S1, S2

### Goal

Avoid paying full-bibliography formatting cost for operations that only change one item or list order.

### Scope

Refactor editor flows so:

- **single-entry add/edit** formats only what changed when safe
- **delete** generally re-sorts survivors without reformatting them
- **style switch** remains a full-batch reformat
- numeric-family edge cases preserve correctness

### Acceptance criteria

- [ ] add/edit/delete flows measurably reduce work versus current baseline
- [ ] style-switch behavior remains correct
- [ ] sort and display parity with current user-visible behavior is maintained
- [ ] 50-entry non-style mutations improve by roughly **40–60%** in benchmarked editor-path cost

### Files affected

- `src/edit.js`
- `src/hooks/use-citation-editor-state.js`
- formatting/sorting helpers as needed

---

## REQ-E2 — Replace expensive bibliography cache-key generation

**Priority:** P1  
**Effort:** M  
**Risk:** Medium  
**Dependencies:** S2

### Goal

Make cache checks cheap enough that the cache itself does not become a measurable hotspot.

### Scope

Refactor `/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/lib/formatting/csl.js` to replace deep stable-stringify of the full bibliography payload with a cheaper fingerprint strategy, such as:

- precomputed per-citation hashes
- a normalized minimal serializer of formatting-relevant fields
- a batch key composed from per-entry fingerprints + style context

### Acceptance criteria

- [ ] cache hit lookup cost becomes negligible compared with formatting work
- [ ] cache correctness is preserved across style and bibliography-context differences
- [ ] tests cover equivalence, non-equivalence, and LRU behavior after the refactor

### Files affected

- `src/lib/formatting/csl.js`
- related formatter cache tests

---

## REQ-E3 — Revisit editor bundle optimization targets already identified in SPEC

**Priority:** P2  
**Effort:** M  
**Risk:** Low–Medium  
**Dependencies:** None

### Goal

Trim editor-only JS without sacrificing capability.

### Scope

Revisit `/Users/danknauss/Developer/GitHub/wp-bibliography-block/SPEC.md` bundle targets, especially:

- reducing `@wordpress/icons` overhead
- assessing `buffer` polyfill cost
- assessing `fetch-ponyfill` cost
- keeping heavy paths dynamically imported

### Acceptance criteria

- [ ] updated bundle analysis documents before/after wins
- [ ] `/build/index.js` remains under the 60 KB raw near-term budget
- [ ] total shipped JS trends downward or holds flat as features grow

### Files affected

- `src/lib/wp-icons.js`
- build/tooling config if needed
- documentation updates in `SPEC.md` or performance docs as appropriate

---

## Phase 4 — Maintainability hardening

## REQ-M1 — Split `src/edit.js` by responsibility

**Priority:** P1  
**Effort:** M  
**Risk:** Medium  
**Dependencies:** E1

### Goal

Reduce the biggest editor hotspot into smaller units that are easier to reason about, test, and optimize.

### Scope

Break `/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/edit.js` into smaller hooks/modules for:

- import flow
- manual entry flow
- list actions
- clipboard/export
- UI-only composition

### Acceptance criteria

- [ ] `src/edit.js` drops materially below its current size
- [ ] behavior and tests remain stable
- [ ] new module boundaries are coherent and documented in code comments or adjacent docs

---

## REQ-M2 — Split `bibliography-builder.php` into focused modules

**Priority:** P1  
**Effort:** M  
**Risk:** Medium  
**Dependencies:** P2, P3

### Goal

Reduce future fragility in the plugin bootstrap/runtime layer.

### Scope

Extract focused units for:

- REST route registration/callbacks
- formatter service/caching
- bibliography extraction helpers
- asset/bootstrap concerns

### Acceptance criteria

- [ ] core PHP logic is separated by responsibility
- [ ] formatter and REST code become easier to unit/integration test
- [ ] no public behavior changes

---

## REQ-M3 — Modularize free-text parsing heuristics

**Priority:** P2  
**Effort:** M–L  
**Risk:** Medium  
**Dependencies:** None

### Goal

Keep parser growth from turning into a correctness and maintenance bottleneck.

### Scope

Split `/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/lib/free-text-parser.js` into smaller heuristic modules by concern, such as:

- author parsing
- title/container extraction
- journal/article rules
- book rules
- cleanup/normalization
- warning/confidence generation

### Acceptance criteria

- [ ] parser heuristics are easier to test in isolation
- [ ] new parser work can land with targeted fixtures instead of touching one large file
- [ ] existing supported-input behavior remains stable

---

## Cross-cutting implementation notes

### Preserve existing safety constraints

Do not relax these without a separate architectural decision:

- 50-entry paste cap
- 1 MB payload cap
- static saved HTML output
- output sanitization at render/save boundaries per `SPEC.md`

### Prefer explicit “needs review” states over speculative parsing

For free-text parsing, a conservative warning is preferable to a wrong citation silently accepted as correct.

### Treat performance improvements as testable behavior

Where possible, accompany changes with:

- benchmark-harness updates
- regression tests for cache correctness
- tests that verify no stale async state can commit

---

## Suggested issue breakdown

If this plan is moved into the tracker, create tickets in roughly this order:

1. REQ-P1 — Release package pruning
2. REQ-P2 — Formatter response caching
3. REQ-P3 — PMID caching
4. REQ-S2 — Benchmark harness hardening
5. REQ-S1 — Async stale-result guards
6. REQ-E1 — Reduce whole-list reformatting
7. REQ-E2 — Cheaper cache keys
8. REQ-M1 — Split `edit.js`
9. REQ-M2 — Split `bibliography-builder.php`
10. REQ-M3 — Modularize free-text parser
11. REQ-E3 — Editor bundle optimization pass

---

## Open questions

1. Should formatter caching live entirely in PHP, or should the JS-side cache strategy be revised in the same sprint?
2. Are package-size budgets strict enough to justify release CI checks immediately, or should they begin as reporting-only?
3. For non-style mutations, is exact current batch-format parity required in all cases, or can some flows move to per-entry formatting if rendered output remains equivalent?

---

## Revision history

| Date | Change | Author |
| --- | --- | --- |
| 2026-05-08 | Initial draft created from repository audit and remediation recommendations | Codex |
