# Phase 2 Plan: Performance and stability remediation

## Objective

Eliminate the current hidden bibliography-size cliff and harden the
editor/formatter path before starting broader feature work. This phase
operationalizes
`/Users/danknauss/Developer/GitHub/wp-bibliography-block/docs/planning/performance-stability-remediation-plan.md`
into an executable GSD plan.

## Current-state baseline checked 2026-05-09

Recent commits reviewed before planning:

-   `809b9d5` — revised
    `/Users/danknauss/Developer/GitHub/wp-bibliography-block/docs/planning/performance-stability-remediation-plan.md`
    with the deeper review findings.
-   `b0527ed` — added the initial performance/stability remediation plan.
-   `a99b7e3`, `6c05c63`, `77f77a9` — implemented and hardened PMID resolution
    through the WordPress REST proxy.
-   `3a5ae89` — added release workflow dispatch behavior.
-   `c577c5c` — development dependency bump only.

Current implementation facts:

-   `/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/lib/parser.js`
    caps one paste at 50 entries and 1 MB, with parse concurrency 4.
-   `/Users/danknauss/Developer/GitHub/wp-bibliography-block/bibliography-builder.php`
    caps one formatter request at 50 CSL items and 1 MB.
-   Editor mutation paths still send the entire merged bibliography to
    `/bibliography/v1/format`, so repeated additions can still create a hidden
    51-entry cliff.
-   `/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/lib/formatting/csl.js`
    still caches fallback formatter output in the same cache path as successful
    output.
-   Manual entry still formats once in `createManualCitationFromCsl()` and again
    for the merged bibliography in `handleManualAdd()`.
-   Structured edit has cancellation guards, but paste/import, manual add,
    delete, and style-switch flows do not yet share one latest-operation guard.
-   PMID resolution now uses the REST proxy, but proxy responses are not cached.
-   The release artifact still includes known dead weight such as
    `composer.lock` and vendor docs/images.

## Scope

This phase is a correctness-first hardening phase, not a broad optimization
sprint. Prioritize visible product reliability over speculative speedups.

In scope:

1. total bibliography size policy and hidden 51-entry cliff
2. formatter fallback cache poisoning
3. manual-entry double formatting
4. stale async commits in editor mutation flows
5. authoritative benchmark harness
6. release-package dead-weight pruning
7. PMID/DOI network hardening
8. safe formatter/cache improvements only after the correctness fixes land

Out of scope until this phase is complete:

-   frontend Cite/Export affordances
-   writable REST/Abilities implementation
-   language-pack expansion
-   large parser/editor/PHP module splits unless required to complete the
    hardening work safely
-   whole-bibliography reformat skipping except where correctness can be proven
    with style-context tests

## Model and reasoning allocation

Use a high-reasoning frontier coding model for the P0 sequence. The first wave
is correctness-sensitive: superficial fixes can break citeproc context, editor
state, fallback semantics, or the static-save contract.

| Work area                                                        | Recommended model/reasoning   | Notes                                                                                                  |
| ---------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| REQ-C1 — total bibliography size policy / hidden 51-entry cliff  | GPT-5.5, high reasoning       | Phase lead should own. This is a product-policy + implementation + test problem, not a cap-only patch. |
| REQ-C2 — fallback cache correctness                              | GPT-5.5 high, or GPT-5.4 high | Must preserve successful-cache behavior while preventing fallback poisoning.                           |
| REQ-C3 — manual-entry double-format removal                      | GPT-5.4 high acceptable       | Bounded implementation, but verify formatter call counts and fallback notices.                         |
| REQ-S1 — async stale-result guards                               | GPT-5.5, high reasoning       | Highest race-condition risk; should be handled by the strongest executor.                              |
| REQ-B1 — benchmark harness hardening                             | GPT-5.4 high, or GPT-5.5 high | Needs careful distinction between real formatter, controlled test double, and fallback.                |
| REQ-P1 — release-package pruning                                 | GPT-5.4 medium                | Mechanical if license/notice obligations are preserved and package smoke checks run.                   |
| REQ-N1/N2 — PMID/DOI network hardening                           | GPT-5.4 high                  | Avoid widening arbitrary-fetch or SSRF exposure.                                                       |
| REQ-P2/P3 — formatter/server cache and JS cache-key optimization | GPT-5.5, high reasoning       | Cache invalidation, transient churn, memory bounds, and formatter correctness interact.                |
| Documentation/GSD updates                                        | GPT-5.4 medium                | Keep synchronized with implementation decisions and verification results.                              |

If GPT-5.5 is unavailable, use the strongest available coding model with high
reasoning for Wave 1. Do not assign a lower-reasoning model to own REQ-C1,
REQ-S1, or REQ-P2/P3 unsupervised. Lower-reasoning or smaller models may assist
only with tightly bounded mechanical subtasks such as release-file pruning, docs
copy updates, or fixture generation, with review by the phase lead.

## Execution waves

### Wave 1 — P0 correctness fixes

1. **REQ-C1: define and enforce total bibliography size policy**

    - Decide whether 1.x hard-caps total citations at 50 or raises the supported
      total size with benchmarks and UX warnings.
    - Update editor and REST formatter limits so they agree.
    - Cover existing 49 + add 1, existing 50 + add 1, existing above-limit
      legacy block, and style switch at the supported maximum.
    - No path should silently downgrade to fallback text solely because the
      bibliography exceeded an undocumented request cap.

2. **REQ-C2: stop caching fallback formatter output as success**

    - A failed formatter request may return fallback text for that call, but
      identical input after formatter recovery must call the formatter again.
    - Successful formatter output remains cacheable.

3. **REQ-C3: remove manual-entry double formatting**

    - Common manual-add path should perform one formatter request, not one
      single-entry request plus one merged-bibliography request.
    - Duplicate manual entries should still short-circuit before formatting.

4. **REQ-S1: add latest-operation guards across async editor mutation flows**
    - Extend stale-result protection beyond structured edit to paste/import,
      manual add, delete, and style switch.
    - Preserve current focus-management behavior.

### Wave 2 — measurement and packaging guardrails

5. **REQ-B1: make the benchmark harness authoritative**

    - Fallback-based timings must fail or be marked non-authoritative.
    - Report cold/warm formatting, p50/p95, environment, and whether the
      formatter path was real REST, a controlled double, or fallback.

6. **REQ-C4: preserve frontend zero-JS architecture**

    - Keep static saved output as a review gate for this and future phases.

7. **REQ-P1: prune release-package dead weight**
    - Stop shipping `composer.lock`.
    - Remove non-runtime vendor docs/examples/images/tests while preserving
      license/notice obligations.
    - Rebuild the release zip and record before/after size.

### Wave 3 — network/cache hardening

8. **REQ-N1: cache PMID proxy responses**

    - The REST proxy exists; this task adds bounded cache behavior for success,
      not-found, and short-lived upstream failures.

9. **REQ-N2: reduce avoidable DOI network work**

    - Pre-detect duplicate DOI values before `citation-js` resolution where
      safe.
    - Add in-session DOI metadata reuse where correctness and error reporting
      remain clear.
    - Resolve or explicitly defer the CrossRef polite-pool configuration from
      `SPEC.md`.

10. **REQ-P2: add cautious server-side formatter caching**

    - Prefer persistent object cache.
    - Do not cache formatter failures.
    - Keep transient fallback disabled, opt-in, or tightly bounded.

11. **REQ-P3: replace expensive and memory-heavy JS formatter cache keys**
    - Avoid full-payload stable-string keys where practical.
    - Add memory-aware eviction or an approximate byte budget in addition to the
      entry-count LRU.

### Wave 4 — measured optimization and maintainability follow-up

12. **REQ-E3: add supported-size performance fixtures**

    -   Match fixtures to the size policy from Wave 1.

13. **REQ-E1: optimize whole-bibliography reformatting only where style-context
    safe**

    -   Preserve same-author/year suffixes, disambiguation, numeric-family
        numbering, sorting, and `displayOverride` behavior.

14. **REQ-E2: revisit editor bundle targets**

    -   Refresh raw/gzip bundle data after correctness work.

15. **REQ-M1/M2/M3/M4: maintainability hardening**
    -   Split large modules and track citeproc-php PHP-version compatibility
        after behavior is stabilized.

## Execution progress — 2026-05-09

Implemented in the first execution pass:

-   **REQ-C1:** Chose the conservative 1.x policy: 50 total citations per
    bibliography block. Editor add/manual/style-change paths now guard against
    over-limit full-bibliography formatter requests, and `SPEC.md` documents the
    total cap.
-   **REQ-C2:** Fallback formatter output is returned for the failed call but is
    no longer stored as a successful cache hit. Recovery for identical input now
    calls the formatter again.
-   **REQ-C3:** Manual add now creates the citation record without single-entry
    pre-formatting and formats the merged bibliography exactly once in the
    common path.
-   **REQ-S1:** Added shared latest-operation guards for paste/import, manual
    add, delete, style change, and structured-edit save. Added regression
    coverage for a pending parse superseded by delete; existing structured-edit
    cancellation tests continue to pass.
-   **REQ-B1:** Benchmark harness now uses an explicit controlled formatter test
    double, records p50/p95 and cold/warm format timings, and fails if formatter
    fallback warnings are detected.
-   **REQ-P1:** Release packaging now installs from the lock file but removes
    `composer.lock` from the staged package and prunes non-runtime vendor docs
    and images. Release zip size is ~386 KB in local verification after adding
    the new `includes/` runtime module.
-   **REQ-N1:** PMID proxy responses now cache successful CSL responses and
    404/not-found responses with bounded transient TTLs.
-   **REQ-N2:** Existing DOI values are passed into the parser so
    already-present DOI-only inputs skip `citation-js`; successful DOI metadata
    has bounded in-session reuse, and duplicate DOI lines share pending
    resolution work. CrossRef polite-pool configuration is documented as
    deferred until a server-side DOI proxy or user-configurable contact setting
    exists.
-   **REQ-P2:** Successful formatter responses are cached only through
    persistent object cache with a short TTL; transient fallback remains
    intentionally unused for full-bibliography payloads.
-   **REQ-P3:** The JS formatter cache now uses a bounded stable hash key and an
    approximate byte budget in addition to entry-count LRU eviction.
-   **REQ-E3:** Supported-size benchmark fixtures already cover 10, 25, and the
    50-citation maximum with cold/warm formatter timing.
-   **REQ-E1:** The measured safe no-reformat path remains numeric-family
    deletion, where list markers provide numbering. Author-date/notes add,
    delete, and structured-edit paths intentionally keep full-bibliography
    reformatting because citeproc context can affect disambiguation and
    same-author/year output.
-   **REQ-E2:** The benchmark report now records build asset raw/gzip sizes.
    Latest local build footprint is 261.54 KB raw / 80.15 KB gzip across build
    CSS/JS/PHP assets; `index.js` is 59.79 KB raw / 18.1 KB gzip.
-   **REQ-M1:** Paste/import, manual-entry, and clipboard/export side effects
    were extracted from `edit.js` into focused hooks:
    `useCitationImportActions()`, `useManualCitationActions()`, and
    `useBibliographyExportActions()`. UI markup remains in `edit.js`, now ~845
    lines, and the shared async-operation guard remains owned by the editor
    shell and injected into mutation hooks.
-   **REQ-M2:** PMID cache, permission, and resolver callbacks now live in
    `includes/pmid.php`; `bibliography-builder.php` is ~1,030 lines and the
    release package includes the new runtime include. Deeper formatter/REST
    route splitting is optional follow-up, not a Phase 2 blocker.
-   **REQ-M3:** Free-text author parsing and author-confidence helpers now live
    in `src/lib/free-text-authors.js`; `free-text-parser.js` is ~761 lines.
-   **REQ-M4:** citeproc-php compatibility is documented in the release
    checklist; `composer outdated seboettg/citeproc-php --direct` reports
    v2.7.1 as the latest stable release as of 2026-05-10, so the PHP 8.5 vendor
    deprecations remain accepted tracked debt for now.

Remaining follow-up work:

-   Optional follow-up: extract delete/list-mutation behavior from `edit.js` if
    future editor work makes the shell grow again.
-   Optional follow-up: split formatter/REST route helpers out of
    `bibliography-builder.php` after the PMID include proves stable.
-   Optional follow-up: split free-text parser by citation type if future
    heuristic growth resumes.

These optional splits are not Phase 2 stabilization blockers.

Verification completed for this pass:

-   `npm run lint:js`
-   `npm run lint:css`
-   `TMPDIR="$PWD/.tmp" npm run test -- --runInBand`
-   `TMPDIR="$PWD/.tmp" RUN_PERF_BENCHMARK=1 npm run test -- --runInBand --runTestsByPath src/benchmarks/performance-benchmark.test.js`
-   `npm run build`
-   `npm run package:release`
-   `unzip -l output/release/borges-bibliography-builder.zip | grep 'includes/pmid.php'`
-   `composer test:php` — passes with the existing 4 vendor deprecations
-   `composer analyze:php` — no errors, existing info-level issues remain
-   `composer outdated seboettg/citeproc-php --direct` — v2.7.1 is current
-   `git diff --check`

## Acceptance criteria

-   The hidden 51-entry formatter cliff is removed or replaced by an explicit,
    tested total-size policy.
-   Formatter fallback output cannot poison successful-format caches.
-   Manual add no longer performs redundant formatter work in the common path.
-   Async editor flows cannot commit stale state after cancellation or a newer
    operation supersedes them.
-   Benchmark output is trustworthy enough to support performance budgets.
-   Release package pruning reduces shipped dead weight without runtime
    regressions.
-   PMID/DOI network behavior is less fragile without widening SSRF or
    arbitrary-fetch exposure.
-   Public bibliography output remains static saved HTML with no plugin-owned
    frontend runtime JS.

## Verification gates

For documentation-only slices:

```bash
git diff --check
```

For JS/editor changes:

```bash
npm run lint:js
npm run test -- --runInBand
npm run build
```

For PHP/REST/release changes:

```bash
composer test:php
composer analyze:php
npm run package:release
```

For benchmark work:

```bash
npm run benchmark:perf
```

The benchmark gate is only authoritative after REQ-B1 lands.
