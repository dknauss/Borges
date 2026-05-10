# Performance, Stability & Footprint Remediation Plan

This document turns the 2026-05-08 plugin audit and the 2026-05-09 follow-up
review into a concrete engineering plan focused on editor efficiency, formatter
stability, release-package footprint, and long-term maintainability. It
supplements the authoritative
`/Users/danknauss/Developer/GitHub/wp-bibliography-block/SPEC.md`; it does not
replace it.

It is structured as a sequence of self-contained requirements grouped into
phases. Each requirement is intended to be liftable into the issue tracker with
minimal rewriting.

## Status

-   **Drafted:** 2026-05-08
-   **Revised:** 2026-05-09 — incorporated deep-dive performance/stability
    findings
-   **State:** Phase 2 implementation stabilized; final review/commit pending
-   **Owner:** TBD
-   **Stakeholders:** Plugin maintainers, performance reviewer, release
    engineering
-   **Canonical path:**
    `docs/planning/performance-stability-remediation-plan.md`

---

## TL;DR

The plugin's public runtime is already strong: normal bibliography output is
static saved HTML, there is no plugin-owned frontend runtime JS, frontend CSS is
tiny, and formatter dependencies are loaded only when formatter routes are used.
Borges is not currently frontend-bloated.

The highest-risk assumption in the original audit was that existing input caps
fully bound worst-case work. They do not. The 50-entry paste cap and 1 MB input
cap protect individual paste operations, but editor mutation paths send the
**entire merged bibliography** to the formatter. Because the formatter endpoint
also caps requests at 50 items, a block can reach a hidden 51-entry cliff after
repeated additions. At that point, full-list formatting can fail and the editor
can fall back to weak raw-title formatting.

The highest-return near-term work is now:

1. Define and enforce a **total bibliography size policy** so 50+ existing
   entries cannot hit a hidden formatter cliff
2. Stop **caching fallback formatter output** as if it were successful formatted
   output
3. Remove **manual-entry double formatting**
4. Add **stale async-result guards** across all editor mutation paths
5. Make the **benchmark harness authoritative** so fallback timings cannot
   masquerade as real formatter timings
6. **Prune release-package dead weight**
7. Cache **PMID resolution** responses and pre-dedupe/cache DOI lookups where
   safe

The benchmark work remains P0 because budgets are currently unreliable, but the
51-entry cliff is the first product-facing fix to plan and implement.

Longer-term work should reduce whole-bibliography reformatting only where
style-context correctness is preserved, replace expensive cache-key generation,
and split monolithic modules after behavior is covered by tests.

---

## Audit summary

### Current strengths

-   **Frontend footprint is excellent**
    -   Saved output is static HTML
    -   No plugin-owned frontend runtime JS for normal bibliography rendering
    -   `/Users/danknauss/Developer/GitHub/wp-bibliography-block/build/style-index.css`
        is ~1.7 KB raw
-   **Public runtime has no obvious WordPress performance anti-patterns**
    -   No `session_start()` / frontend cookies
    -   No public-page database writes
    -   No public-page formatter work
    -   No dynamic render callback for normal bibliography output
-   **Runtime safety rails exist for paste operations**
    -   `/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/lib/parser.js`
        caps individual paste size at 1 MB and detected entries at 50
    -   Parse concurrency is capped at 4
-   **Formatter bootstrap is lazy**
    -   `/Users/danknauss/Developer/GitHub/wp-bibliography-block/bibliography-builder.php`
        only loads Composer formatter dependencies when formatter routes are
        used
-   **Test coverage is substantial**
    -   JS, PHP, sort-conformance, save-output, parser, accessibility, runtime,
        and E2E coverage are present

### Primary risks

1. **Hidden total-size cliff**
    - Individual paste operations are capped at 50 entries, but repeated
      additions can create a bibliography over 50 total entries
    - Editor mutation paths send the entire merged bibliography to
      `/bibliography/v1/format`
    - The formatter endpoint rejects more than
      `BIBLIOGRAPHY_BUILDER_MAX_FORMAT_ITEMS` items, currently 50
2. **Whole-bibliography work on small edits**
    - Add, delete, manual add, structured edit, and style-switch flows often
      reformat and re-sort the entire list
    - This is sometimes necessary for style-context correctness, but not every
      current whole-list path is justified
3. **Fallback formatter output can be cached**
    - `/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/lib/formatting/csl.js`
      stores fallback title/container text in the same in-session cache as
      successful formatter responses
    - A transient formatter failure can poison identical style+bibliography
      lookups for the rest of the editor session
4. **Manual entry double-formats**
    - Manual add formats the single new entry in `createManualCitationFromCsl()`
      and then formats the full merged bibliography in `handleManualAdd()`
5. **Expensive and memory-heavy cache lookups**
    - `/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/lib/formatting/csl.js`
      uses deep stable-stringify of the full CSL payload for cache keys
    - The formatter cache is currently entry-count bounded, not byte-bounded, so
      repeated distinct full-bibliography payloads can retain large key strings
      for the rest of the editor session
6. **External network fragility**
    - PMID resolution is proxied through WordPress but uncached
    - DOI resolution remains client-side through `citation-js`; duplicate DOI
      pastes can still trigger network requests before duplicate detection runs
7. **Async stale-result exposure**
    - Structured editing has useful cancel guards, but paste/import, manual add,
      delete, and style switch do not share one consistent latest-operation
      guard
8. **Benchmark ambiguity**
    - The current benchmark harness passes while exercising formatter fallback
      in the Jest environment, so its formatter timings are not authoritative
9. **Large, multi-responsibility files**
    - `src/edit.js`, `src/lib/free-text-parser.js`,
      `src/hooks/use-citation-editor-state.js`, and `bibliography-builder.php`
      are the clearest future fragility points
10. **PHP dependency deprecations**
    - PHPUnit currently passes, but PHP 8.5 reports deprecations from
      `seboettg/citeproc-php v2.7.1`; this is a future-compatibility risk to
      track before PHP 9

### Release-package observations

-   Current release zip observed in
    `output/release/borges-bibliography-builder.zip`: ~588 KB
-   Current unpacked release observed in
    `output/release/borges-bibliography-builder`: ~1.9 MB
-   High-return prune candidates include:
    -   `composer.lock` (~205 KB raw)
    -   `vendor/seboettg/collection/class-diagram.png` (~200 KB raw / ~169 KB
        compressed)
    -   non-runtime vendor docs/examples/images such as READMEs, changelogs,
        diagrams, examples, test folders, and CI config
-   Language files are a material portion of unpacked release size (~320 KB
    observed) but should not be pruned casually because they are product assets,
    not dead vendor weight

### Current-state verification notes

The 2026-05-09 review verified the current working tree before revising
recommendations:

-   `/Users/danknauss/Developer/GitHub/wp-bibliography-block/build/style-index.css`
    is 1,736 bytes raw
-   `/Users/danknauss/Developer/GitHub/wp-bibliography-block/build/index.js` is
    57,755 bytes raw
-   `block.json` registers editor assets and frontend CSS, but no plugin-owned
    frontend runtime script for saved bibliography output
-   `/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/lib/parser.js`
    currently sets `MAX_ENTRIES_PER_PASTE = 50`, `MAX_INPUT_SIZE = 1024 * 1024`,
    and `PARSE_CONCURRENCY = 4`
-   `/Users/danknauss/Developer/GitHub/wp-bibliography-block/bibliography-builder.php`
    currently sets `BIBLIOGRAPHY_BUILDER_MAX_FORMAT_ITEMS = 50` and
    `BIBLIOGRAPHY_BUILDER_MAX_FORMAT_BYTES = 1048576`
-   `/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/lib/formatting/csl.js`
    currently caches by full stable-stringified bibliography payload and stores
    fallback output in the same cache path as successful formatter output
-   `/Users/danknauss/Developer/GitHub/wp-bibliography-block/scripts/package-release.sh`
    currently copies `composer.lock` and prunes some vendor test/example
    folders, but still ships known non-runtime vendor docs/images

---

## Corrected assumptions

The following assumptions should guide sprint planning:

1. **Input caps do not fully bound worst-case editor work.** They bound a single
   paste, not total bibliography size.
2. **Formatter caching is useful, but it is not the first fix.** Correctness
   around fallback, total-size policy, and async commits comes first.
3. **Transient fallback for full-bibliography formatter caches is risky.**
   Dynamic full-payload transient keys can create `wp_options` churn on hosts
   without persistent object cache.
4. **Whole-list reformatting is sometimes required.** Same-author/same-year
   suffixes and citeproc disambiguation can depend on bibliography context, so
   per-entry optimization must be style/context aware.
5. **Benchmark budgets are not actionable until fallback detection is fixed.**
   Current benchmark output cannot be used as a formatter baseline.
6. **Release size budgets should focus first on dead vendor weight, not language
   assets.** Language files are sizable but intentional.

---

## Success criteria

This plan is complete when:

-   The plugin remains **frontend-zero-JS** for normal rendered bibliography
    output
-   No normal public page render performs remote requests or formatter work
-   The editor has a clear, tested total-bibliography size policy and no hidden
    51-entry formatter cliff
-   Fallback formatter output cannot poison the successful-format cache
-   Manual add performs no redundant formatter request
-   Async editor flows cannot commit stale state after user-visible cancellation
    or superseding operations
-   Performance reporting becomes trustworthy and budget-driven
-   Repeated formatter actions benefit from caching without creating unbounded
    transient churn
-   The release package is materially smaller with no runtime regressions
-   PHP dependency deprecations are tracked and either resolved or explicitly
    accepted for the supported PHP matrix
-   The largest logic hotspots are either reduced in scope or scheduled for
    controlled decomposition

---

## Budget guardrails

These are planning targets, not yet CI-enforced hard gates.

### Frontend

-   Plugin-owned frontend runtime JS: **0 KB**
-   Frontend CSS per direction: **< 3 KB**
-   No remote requests during saved bibliography rendering
-   No PHP `render_callback` for normal bibliography output

### Release package

-   Release zip: **< 450 KB** after dead-weight pruning
-   Unpacked release: **< 1.4 MB** after dead-weight pruning, excluding any
    explicit decision to keep all translation assets
-   No non-runtime vendor docs/examples/images in the shipped package

### Editor bundles

-   `/Users/danknauss/Developer/GitHub/wp-bibliography-block/build/index.js`:
    **< 60 KB raw** near-term
-   Total shipped plugin JS chunks: report-only until bundle analysis is
    refreshed; then set a realistic raw and gzip budget
-   Heavy citation parsing/export paths should remain dynamically imported where
    practical

### Editor interaction budgets

Budgets below are provisional until REQ-B1 makes benchmark results
authoritative.

-   Deferred parse, 50-entry paste: **p50 < 20 ms**, **p95 < 60 ms**
-   Warm batch format, same style, 50 entries: **p50 < 40 ms**, **p95 < 100 ms**
-   Full style switch, 50 entries: **p50 < 120 ms**, **p95 < 250 ms**
-   Single-entry add/edit/delete, 50-entry bibliography: **p50 < 50 ms**, **p95
    < 120 ms**
-   Any supported total size above 50 entries must get explicit benchmark
    budgets before being enabled

### Stability

-   Zero stale async commits in automated tests
-   Zero formatter-fallback cache poisoning regressions
-   No production hotspot file should grow by more than 10% without explicit
    review
-   New parser heuristics require regression fixtures/tests in the same PR

---

## Phase summary

| Phase | Theme                                  | Requirements       | Outcome                                                           |
| ----- | -------------------------------------- | ------------------ | ----------------------------------------------------------------- |
| 1     | Measurement and correctness guardrails | B1, C1, C2, C3, C4 | Trustworthy performance data and no hidden formatting cliffs      |
| 2     | Async and network hardening            | S1, N1, N2         | Fewer stale commits and less upstream/network fragility           |
| 3     | Footprint and safe caching             | P1, P2, P3         | Smaller package and cautious repeat-format wins                   |
| 4     | Editor efficiency refactors            | E1, E2, E3         | Reduced unnecessary work with style-context correctness preserved |
| 5     | Maintainability hardening              | M1, M2, M3, M4     | Lower fragility in core modules and dependencies                  |

Recommended execution order: **C1 → C2 → C3 → S1 → B1 → C4 → P1 → N1 → N2 → P2 →
P3 → E3/E1/E2 → M1/M2/M3/M4**

C1 leads because the hidden 51-entry cliff is the clearest current product
reliability issue. B1 should run as early as practical, and can run in parallel
with C1/C2, but it should not delay adding an explicit total-size policy.

---

## Phase 1 — Measurement and correctness guardrails

## REQ-B1 — Make the benchmark harness authoritative

-   **Priority:** P0
-   **Effort:** S–M
-   **Risk:** Low
-   **Dependencies:** None

### Goal

Ensure the benchmark harness measures the real formatting path or fails loudly.

### Scope

Update
`/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/benchmarks/performance-benchmark.test.js`
and related docs to:

-   detect formatter fallback and fail the benchmark, or mark output invalid and
    non-authoritative
-   treat console fallback warnings, `onFallback` callbacks, and missing REST
    formatter responses as invalid benchmark conditions
-   record cold vs warm formatting separately
-   include p50/p95, not just averages
-   annotate execution environment in output
-   record whether the benchmark hit a real WordPress REST formatter, a
    controlled test double, or fallback
-   avoid silently writing `latest.json` / `latest.md` that look authoritative
    when the formatter did not run

### Acceptance criteria

-   [ ] benchmark output clearly distinguishes parse, cold format, warm format,
        and style-switch work
-   [ ] fallback-based timings are not silently treated as authoritative
-   [ ] benchmark output includes p50 and p95
-   [ ] docs explain how to run and interpret the harness
-   [ ] budgets in this plan can be compared against benchmark output

### Files affected

-   `src/benchmarks/performance-benchmark.test.js`
-   `docs/performance-benchmark-harness.md`

---

## REQ-C1 — Define and enforce total bibliography size policy

-   **Priority:** P0
-   **Effort:** S–M
-   **Risk:** Medium
-   **Dependencies:** B1 preferred, but not required for the policy decision

### Goal

Remove the hidden cliff where repeated additions can produce a bibliography
larger than the formatter endpoint accepts.

### Scope

Decide and implement one explicit policy:

1. **Conservative policy:** hard cap total citations per block at 50 until
   larger bibliographies are benchmarked and supported; or
2. **Expanded policy:** raise `BIBLIOGRAPHY_BUILDER_MAX_FORMAT_ITEMS` and all
   related editor caps to a tested total size, with benchmark budgets and UX
   warnings; or
3. **Hybrid policy:** keep 50 as the no-warning target, allow a larger soft cap
   with explicit editor warnings and tested formatter behavior.

Implementation should update both JS editor behavior and PHP formatter
validation so they agree.

### Acceptance criteria

-   [ ] adding citations to an existing 50-entry bibliography has deterministic,
        user-facing behavior
-   [ ] editor and REST formatter limits agree
-   [ ] tests cover existing 49 + add 1, existing 50 + add 1, and style switch
        at the supported maximum
-   [ ] legacy or externally modified blocks above the supported maximum get a
        deterministic warning/state instead of silently falling into formatter
        fallback
-   [ ] no path silently downgrades to raw-title fallback solely because the
        bibliography exceeded an undocumented request cap
-   [ ] `SPEC.md` or adjacent planning docs state the total-size policy

### Files affected

-   `src/edit.js`
-   `src/lib/parser.js` if cap exports/messages change
-   `bibliography-builder.php`
-   related JS/PHP tests
-   `SPEC.md` or documentation as needed

---

## REQ-C2 — Do not cache fallback formatter output as successful formatting

-   **Priority:** P0
-   **Effort:** XS–S
-   **Risk:** Low
-   **Dependencies:** None

### Goal

Prevent transient formatter failures from poisoning the in-session
successful-format cache.

### Scope

Update
`/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/lib/formatting/csl.js`
so fallback output from failed formatter requests is not stored in
`BIBLIOGRAPHY_CACHE` as if it were a successful formatter response.

Possible behaviors:

-   do not cache fallback output at all; or
-   maintain a separate short-lived negative/fallback state that is never
    returned as successful formatted output and can be retried explicitly.

### Acceptance criteria

-   [ ] failed formatter request returns fallback text for that call
-   [ ] a subsequent identical request after formatter recovery calls the
        formatter again
-   [ ] successful formatter output is still cached
-   [ ] tests cover failure → recovery for identical style+bibliography input

### Files affected

-   `src/lib/formatting/csl.js`
-   `src/lib/formatting/csl.test.js`
-   `src/lib/formatting/csl.context-cache.test.js` as needed

---

## REQ-C3 — Remove manual-entry double formatting

-   **Priority:** P0
-   **Effort:** XS–S
-   **Risk:** Low
-   **Dependencies:** None

### Goal

Avoid redundant formatter work when adding a manual citation.

### Scope

Current flow:

1. `createManualCitationFromCsl()` formats the new single entry
2. `handleManualAdd()` immediately formats the full merged bibliography

Refactor so manual add formats exactly once:

-   either build the new manual citation with `formattedText: null` and format
    the merged bibliography once; or
-   if the bibliography is empty, use the single-entry formatter result and skip
    the merged reformat; otherwise use only the merged reformat.

### Acceptance criteria

-   [ ] manual add performs one formatter request in the common path
-   [ ] fallback notices remain correct
-   [ ] duplicate manual entries still short-circuit before formatting
-   [ ] tests assert formatter call count for empty and non-empty bibliography
        manual adds

### Files affected

-   `src/lib/manual-entry.js`
-   `src/edit.js`
-   `src/edit.test.js`
-   `src/lib/manual-entry.test.js` as needed

---

## REQ-C4 — Preserve frontend zero-JS architecture

-   **Priority:** P0
-   **Effort:** Policy / review gate
-   **Risk:** High if violated
-   **Dependencies:** None

### Goal

Protect the plugin's strongest performance property: static saved output without
a plugin-owned frontend runtime.

### Scope

Document and enforce that new work must not casually introduce:

-   a PHP `render_callback` for normal bibliography output
-   frontend re-rendering logic
-   per-page formatter work on public requests
-   public-page remote requests

### Acceptance criteria

-   [ ] this requirement is referenced in future planning/review discussions
-   [ ] PRs introducing frontend runtime behavior justify it explicitly against
        `SPEC.md`
-   [ ] release/runtime smoke tests continue to confirm no frontend script is
        registered for normal bibliography rendering

### Files affected

-   planning docs, review checklists, architecture notes as needed

---

## Phase 2 — Async and network hardening

## REQ-S1 — Add stale-result guards to all async editor mutation flows

-   **Priority:** P0
-   **Effort:** M
-   **Risk:** Medium
-   **Dependencies:** None

### Goal

Prevent older async editor work from overwriting newer user intent.

### Scope

Apply a consistent latest-operation token/ref pattern to async flows in:

-   `/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/edit.js`
-   `/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/hooks/use-citation-editor-state.js`

Especially cover:

-   paste/parse/import
-   manual add
-   delete
-   style switch
-   structured edit save, preserving its existing cancel guards

### Acceptance criteria

-   [ ] pending async work cannot commit after cancellation
-   [ ] pending async work cannot commit after a newer operation supersedes it
-   [ ] tests cover paste-twice, style-switch-during-parse,
        delete-during-formatting, manual-add-during-style-switch, and
        structured-save cancellation
-   [ ] no regressions to current focus-management behavior

### Files affected

-   `src/edit.js`
-   `src/hooks/use-citation-editor-state.js`
-   related tests in `src/edit.test.js` and hook tests

---

## REQ-N1 — Cache PMID resolution responses

-   **Priority:** P1
-   **Effort:** S
-   **Risk:** Low
-   **Dependencies:** None

### Goal

Reduce network latency, upstream dependency pressure, and repeated editor
failures for the same PMID.

### Scope

In
`/Users/danknauss/Developer/GitHub/wp-bibliography-block/bibliography-builder.php`:

-   cache successful PMID lookups by PMID
-   cache 404/not-found responses separately
-   optionally cache transient upstream failures briefly
-   keep PMID validation numeric and fixed-endpoint only

### Suggested TTLs

-   success: **24h**
-   not found: **1h**
-   upstream failure: **5–15 min**

### Acceptance criteria

-   [ ] repeated PMID lookup for the same ID usually avoids a remote request
-   [ ] cached 404 behavior is deterministic and user-safe
-   [ ] upstream failure caching does not mask recovery for too long
-   [ ] tests cover success, 404, and transient failure paths

### Files affected

-   `bibliography-builder.php`
-   PHPUnit coverage for PMID route behavior

---

## REQ-N2 — Reduce avoidable DOI network work

-   **Priority:** P1
-   **Effort:** S–M
-   **Risk:** Medium
-   **Dependencies:** None

### Goal

Avoid unnecessary DOI network requests and make DOI resolution behavior more
predictable.

### Scope

DOI resolution remains client-side through `citation-js` for now. Improve editor
behavior around that constraint:

-   pre-detect normalized DOI values before calling `citation-js`
-   skip DOI resolution when the DOI is already present in existing citations or
    earlier items in the same paste
-   add an in-session DOI metadata cache for successful DOI resolutions where
    safe
-   preserve current error reporting for unresolved or malformed DOI input
-   revisit CrossRef polite-pool configuration from `SPEC.md` and either
    implement it or document why it is deferred

### Acceptance criteria

-   [x] duplicate DOI pastes do not trigger avoidable network resolution before
        duplicate feedback
-   [x] repeated DOI resolution in the same editor session can reuse cached
        metadata
-   [x] tests cover duplicate DOI against existing citations and duplicate DOI
        within one paste
-   [x] CrossRef polite-pool decision is implemented or documented

### Files affected

-   `src/lib/parser.js`
-   `src/edit.js` if pre-dedupe belongs at the editor boundary
-   parser/edit tests
-   `SPEC.md` or planning notes as needed

---

## Phase 3 — Footprint and safe caching

## REQ-P1 — Prune release-package dead weight

-   **Priority:** P0
-   **Effort:** XS–S
-   **Risk:** Low
-   **Dependencies:** None

### Goal

Reduce shipped plugin size without changing runtime behavior.

### Scope

Update
`/Users/danknauss/Developer/GitHub/wp-bibliography-block/scripts/package-release.sh`
to:

-   stop copying `composer.lock`
-   prune non-runtime files from `vendor/` more aggressively
-   explicitly remove known large vendor artifacts such as
    `vendor/seboettg/collection/class-diagram.png`
-   prune vendor docs/examples/images/tests/CI config where license obligations
    are still preserved
-   verify expected package contents explicitly

### Acceptance criteria

-   [x] `composer.lock` is not present in the staged release directory
-   [x] known non-runtime vendor docs/examples/images are removed
-   [x] release zip is reduced from ~588 KB to **< 450 KB**; latest local zip is
        ~386 KB
-   [x] unpacked release is reduced materially; latest local staging directory
        is ~1.5 MB with retained translation assets counted as product assets
-   [x] release smoke checks remain green
-   [x] required license/notice files remain present

### Files affected

-   `scripts/package-release.sh`
-   release verification docs/checklists as needed

---

## REQ-P2 — Add cautious server-side formatter caching

-   **Priority:** P1
-   **Effort:** S–M
-   **Risk:** Medium
-   **Dependencies:** B1, C1, C2 preferred

### Goal

Avoid repeating expensive citeproc work for identical style + bibliography
inputs without creating unbounded `wp_options` churn.

### Scope

In
`/Users/danknauss/Developer/GitHub/wp-bibliography-block/bibliography-builder.php`:

-   derive a stable cache key from:
    -   style key
    -   locale
    -   normalized CSL payload hash
    -   formatter/version context if needed
-   cache successful formatted bibliography arrays
-   prefer persistent object cache when available
-   make transient fallback explicitly size-limited, short-lived, filterable, or
    opt-in
-   do not cache formatter failures as successful responses
-   default TTL: short-lived for successful object-cache entries (currently 5
    minutes); transient fallback stays disabled unless explicitly accepted

### Acceptance criteria

-   [x] identical repeat formatting requests hit cache when caching is available
-   [x] cache miss path still returns identical output to current behavior
-   [ ] warm-path formatter requests are measurably faster than cold-path
        requests in an authoritative benchmark
-   [x] failures and too-many-items responses are not cached as success
-   [x] transient fallback cannot create unbounded dynamic rows for arbitrary
        payloads
-   [ ] tests cover cold, warm, failure, and transient-disabled paths
        (implemented tests cover cache read/write and disabled transient
        behavior; benchmark-backed warm-path measurement remains follow-up)

### Files affected

-   `bibliography-builder.php`
-   PHP tests for formatter endpoints/services

---

## REQ-P3 — Replace expensive and memory-heavy JS bibliography cache keys

-   **Priority:** P1
-   **Effort:** M
-   **Risk:** Medium
-   **Dependencies:** B1, C2

### Goal

Make client-side cache checks cheap enough that the cache itself does not become
a measurable CPU or memory hotspot.

### Scope

Refactor
`/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/lib/formatting/csl.js`
to replace deep stable-stringify of the full bibliography payload with a cheaper
fingerprint strategy that avoids retaining full-payload key strings, such as:

-   precomputed per-citation hashes
-   a normalized minimal serializer of formatting-relevant fields
-   a batch key composed from per-entry fingerprints + style context
-   an approximate byte budget or other memory-aware eviction rule in addition
    to the existing entry-count LRU cap

### Acceptance criteria

-   [ ] cache hit lookup cost becomes negligible compared with formatting work
-   [x] cache memory remains bounded for repeated distinct supported-size
        bibliographies
-   [x] cache correctness is preserved across style, locale, order, and
        bibliography-context differences
-   [x] fallback results are not treated as successful cache hits
-   [ ] tests cover equivalence, non-equivalence, order sensitivity,
        style/locale sensitivity, failure recovery, and LRU behavior
        (implemented tests cover stable equivalence, failure recovery, and
        byte-budget eviction; add explicit non-equivalence/style/locale/order
        assertions during E1/E2 optimization)

### Files affected

-   `src/lib/formatting/csl.js`
-   related formatter cache tests

---

## Phase 4 — Editor efficiency refactors

## REQ-E1 — Reduce whole-bibliography reformatting only where style-context safe

-   **Priority:** P1
-   **Effort:** M–L
-   **Risk:** Medium–High
-   **Dependencies:** B1, C1, C2, S1

### Goal

Avoid paying full-bibliography formatting cost for operations that do not
require whole-bibliography citeproc context, while preserving
same-author/same-year suffixes, disambiguation, numeric-family behavior, and
user-visible parity.

### Scope

Refactor editor flows with explicit safety rules:

-   **style switch** remains full-batch reformat
-   **author-date/notes add/edit/delete** may require full-batch formatting when
    citation-context-sensitive output can change
-   **delete** may avoid reformat only when a safe rule proves survivors'
    formatted output is unchanged
-   **numeric family** must preserve user order and numbering/list semantics
-   **displayOverride** entries should not have visible text overwritten, but
    their CSL still participates in metadata and context where relevant

### Acceptance criteria

-   [ ] each optimized path documents why whole-list reformat is safe to skip
-   [ ] tests cover same-author/same-year add/delete/edit cases where survivors
        may need suffix changes
-   [ ] style-switch behavior remains correct
-   [ ] sort and display parity with current user-visible behavior is maintained
-   [ ] benchmarked editor-path cost improves only after correctness tests prove
        safety

### Files affected

-   `src/edit.js`
-   `src/hooks/use-citation-editor-state.js`
-   formatting/sorting helpers as needed
-   sort/coordination fixtures as needed

---

## REQ-E2 — Revisit editor bundle optimization targets

-   **Priority:** P2
-   **Effort:** M
-   **Risk:** Low–Medium
-   **Dependencies:** None

### Goal

Trim editor-only JS without sacrificing capability or reintroducing fragile
build behavior.

### Scope

Refresh bundle analysis and revisit targets from `SPEC.md`, especially:

-   `@wordpress/icons` import behavior in
    `/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/lib/wp-icons.js`
-   `buffer` polyfill cost from citation-js internals
-   `fetch-ponyfill` cost from citation-js internals
-   preserving dynamic imports for DOI/BibTeX/export paths

### Acceptance criteria

-   [ ] updated bundle analysis documents before/after raw and gzip sizes
-   [ ] `/build/index.js` remains under the 60 KB raw near-term budget unless
        consciously revised
-   [ ] total shipped JS trends downward or has a documented reason to hold flat
-   [ ] no block-registration regression from icon import changes

### Files affected

-   `src/lib/wp-icons.js`
-   build/tooling config if needed
-   documentation updates in `SPEC.md` or performance docs as appropriate

---

## REQ-E3 — Add supported-size performance regression fixtures

-   **Priority:** P1
-   **Effort:** S–M
-   **Risk:** Low
-   **Dependencies:** B1, C1

### Goal

Make the supported total bibliography size a tested performance behavior instead
of an assumption.

### Scope

Add deterministic benchmark/test fixtures for the chosen total-size policy:

-   10 entries
-   25 entries
-   50 entries
-   the maximum supported total size if above 50
-   edge cases around same-author/same-year context

### Acceptance criteria

-   [x] benchmark fixtures match the supported-size policy
-   [ ] results report parse, cold format, warm format, style switch, add, edit,
        and delete paths
-   [x] fallback invalidates benchmark authority
-   [ ] documentation explains what sizes are officially supported vs.
        experimental

### Files affected

-   `src/benchmarks/fixtures/`
-   `src/benchmarks/performance-benchmark.test.js`
-   `docs/performance-benchmark-harness.md`

---

## Phase 5 — Maintainability hardening

## REQ-M1 — Split `src/edit.js` by responsibility

-   **Priority:** P1
-   **Effort:** M
-   **Risk:** Medium
-   **Dependencies:** S1 and C3 preferred; E1 if refactoring flow logic first

### Goal

Reduce the biggest editor hotspot into smaller units that are easier to reason
about, test, and optimize.

### Scope

Break `/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/edit.js` into
smaller hooks/modules for:

-   import flow
-   manual entry flow
-   list actions
-   clipboard/export
-   UI-only composition

### Acceptance criteria

-   [x] `src/edit.js` drops materially below its pre-phase size. Paste/import,
        manual-entry, and clipboard/export behavior now lives in focused hooks,
        leaving `edit.js` as the editor shell and UI composition layer.
-   [x] behavior and tests remain stable
-   [x] new module boundaries are coherent and documented in code comments for
        the extracted hooks
-   [x] async-operation guard ownership is clear after the split: the shared
        guard remains owned by `edit.js` and is injected into mutation hooks

---

## REQ-M2 — Split `bibliography-builder.php` into focused modules

-   **Priority:** P1
-   **Effort:** M
-   **Risk:** Medium
-   **Dependencies:** P2 and N1 preferred

### Goal

Reduce future fragility in the plugin bootstrap/runtime layer.

### Scope

Extract focused units for:

-   REST route registration/callbacks
-   formatter service/caching
-   PMID resolver/caching
-   bibliography extraction helpers
-   asset/bootstrap concerns

### Acceptance criteria

-   [x] core PHP logic is separated by responsibility for the Phase 2 network
        slice: PMID cache, permission, and resolver callbacks now live outside
        the main plugin file
-   [x] PMID code is easier to unit/integration test; deeper formatter and REST
        route extraction remains optional follow-up rather than a Phase 2
        blocker
-   [x] no public behavior changes
-   [x] Composer/autoload behavior remains compatible with release packaging

---

## REQ-M3 — Modularize free-text parsing heuristics

-   **Priority:** P2
-   **Effort:** M–L
-   **Risk:** Medium
-   **Dependencies:** None

### Goal

Keep parser growth from turning into a correctness and maintenance bottleneck.

### Scope

Split
`/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/lib/free-text-parser.js`
into smaller heuristic modules by concern, such as:

-   author parsing
-   title/container extraction
-   journal/article rules
-   book rules
-   review/thesis/webpage rules
-   cleanup/normalization
-   warning/confidence generation

### Acceptance criteria

-   [x] parser heuristics are easier to test in isolation for the author-parsing
        slice
-   [x] new author/parser work can land with targeted fixtures instead of
        touching one large file; deeper citation-type splits remain optional
        follow-up if heuristic growth resumes
-   [x] existing supported-input behavior remains stable

---

## REQ-M4 — Track citeproc-php PHP-version compatibility

-   **Priority:** P1
-   **Effort:** XS–S initially
-   **Risk:** Medium over time
-   **Dependencies:** None

### Goal

Prevent formatter stability surprises as PHP versions advance.

### Scope

Current PHPUnit runs pass, but PHP 8.5 reports deprecations from
`seboettg/citeproc-php v2.7.1`.
`composer outdated seboettg/citeproc-php --direct` checked on 2026-05-10 reports
v2.7.1 as the latest stable release, so there is no upstream update to apply
yet. Treat the current vendor deprecations as accepted tracked debt for now, and
re-check before release. Track this as a dependency stability item:

-   check whether newer `seboettg/citeproc-php` releases resolve deprecations
-   if not, decide whether to patch, fork, suppress in tests, or constrain
    supported PHP versions
-   keep runtime matrix coverage aligned with plugin support claims

### Acceptance criteria

-   [x] dependency compatibility decision is documented
-   [x] PHP deprecations are either resolved, suppressed with rationale, or
        tracked as accepted debt
-   [x] release checklist includes a PHP-version compatibility check for
        formatter dependencies

### Files affected

-   `composer.json` / `composer.lock` if updating dependency
-   PHP tests / runtime matrix docs as needed
-   release checklist docs

---

## Cross-cutting implementation notes

### Preserve existing safety constraints unless explicitly revised

Do not relax these without a separate architectural decision:

-   1 MB paste payload cap
-   static saved HTML output
-   output sanitization at render/save boundaries per `SPEC.md`
-   fixed PMID proxy URL and numeric PMID validation
-   no normal frontend runtime JS

The 50-entry paste cap and 50-item formatter cap may be revised only through
REQ-C1 with explicit benchmark and UX coverage.

### Treat fallback as degraded state, not normal success

Fallback citation text is useful for graceful editor behavior, but it must not
be confused with successful formatted output in caches, benchmarks, or success
notices.

### Prefer explicit “needs review” states over speculative parsing

For free-text parsing, a conservative warning is preferable to a wrong citation
silently accepted as correct.

### Treat performance improvements as testable behavior

Where possible, accompany changes with:

-   benchmark-harness updates
-   regression tests for cache correctness
-   tests that verify no stale async state can commit
-   fixtures that prove style-context-sensitive output remains correct

### Be cautious with WordPress transients for dynamic full-payload caches

Object cache is appropriate for formatter responses when available. Transients
for arbitrary full-bibliography payloads can create dynamic `wp_options` rows on
hosts without persistent object cache. If transient fallback is used, make it
bounded, short-lived, filterable, and tested.

---

## Execution progress

### 2026-05-09 first implementation pass

Completed or substantially implemented:

-   REQ-C1 conservative 50-total-citation policy for 1.x, with editor guards and
    `SPEC.md` documentation
-   REQ-C2 no successful-cache storage for formatter fallback output
-   REQ-C3 manual add no longer performs single-entry pre-formatting before the
    merged-bibliography format
-   REQ-S1 shared latest-operation guards across the main async editor mutation
    flows, with new stale-parse/delete regression coverage
-   REQ-B1 benchmark harness hardening with controlled formatter mode, p50/p95,
    cold/warm timings, and fallback detection
-   REQ-P1 release package pruning; local zip verification is ~386 KB
-   REQ-N1 PMID success and 404 response caching
-   REQ-N2 duplicate DOI reduction: existing DOI values are passed to the parser
    so already-present DOI inputs can skip `citation-js`; successful DOI
    metadata now has bounded in-session reuse; duplicate DOI lines share pending
    resolution work. CrossRef polite-pool configuration remains documented as
    deferred until a server-side DOI proxy or user-configurable contact setting
    exists.
-   REQ-P2 cautious server-side formatter caching: successful formatter
    responses are cached only in a persistent object cache with a short TTL; no
    transient fallback is used for full-bibliography payloads.
-   REQ-P3 cheaper/memory-bounded JS formatter cache keys: the editor formatter
    cache now uses a bounded stable hash key and an approximate byte budget in
    addition to entry-count LRU eviction.
-   REQ-E3 supported-size fixture coverage: benchmark fixtures already exercise
    10, 25, and the supported 50-citation maximum with cold/warm formatter
    timing.
-   REQ-E1 measured whole-bibliography optimization: the safe no-reformat path
    remains numeric-family deletion, where list markers provide numbering.
    Author-date/notes add, delete, and structured-edit paths intentionally keep
    full-bibliography reformatting because citeproc context can affect
    disambiguation and same-author/year output.
-   REQ-E2 refreshed bundle targets: the benchmark report now records build
    asset raw/gzip sizes. Latest local build footprint is 261.54 KB raw / 80.15 KB
    gzip across build CSS/JS/PHP assets; `index.js` is 59.79 KB raw / 18.1 KB gzip.
-   REQ-M1 editor decomposition: paste/import, manual-entry, and
    clipboard/export side effects now live in focused hooks. `src/edit.js` is
    reduced to ~845 lines while UI markup remains in the editor shell. The
    shared async-operation guard remains owned by the editor shell and injected
    into mutation hooks.
-   REQ-M2 PHP decomposition: PMID cache, permission, and resolver callbacks now
    live in `includes/pmid.php`; the main plugin file is reduced to ~1,030 lines
    and keeps route registration/bootstrap responsibilities.
-   REQ-M3 parser decomposition: author parsing and author-confidence helpers
    now live in `src/lib/free-text-authors.js`; `free-text-parser.js` is reduced
    to ~761 lines.
-   REQ-M4 compatibility tracking: citeproc-php remains at the latest stable
    v2.7.1 as of 2026-05-10, PHP 8.5 vendor deprecations remain accepted tracked
    debt, and the release checklist now requires a formatter dependency
    compatibility check.

Still open:

-   Optional follow-up: extract delete/list-mutation behavior from `edit.js` if
    future editor work makes the shell grow again
-   Optional follow-up: split formatter/REST route helpers out of
    `bibliography-builder.php` after the PMID include proves stable
-   Optional follow-up: split free-text parser by citation type if future
    heuristic growth resumes

These optional splits are not Phase 2 stabilization blockers.

---

## Execution model guidance

Use the following model/reasoning allocation when executing this plan:

| Work                                                      | Recommended model/reasoning  |
| --------------------------------------------------------- | ---------------------------- |
| C1 total bibliography size policy / hidden 51-entry cliff | GPT-5.5 high                 |
| C2 fallback cache correctness                             | GPT-5.5 high or GPT-5.4 high |
| C3 manual-entry double-format fix                         | GPT-5.4 high acceptable      |
| S1 async stale-result guards                              | GPT-5.5 high                 |
| B1 benchmark harness hardening                            | GPT-5.4 high or GPT-5.5 high |
| P1 release package pruning                                | GPT-5.4 medium               |
| N1/N2 network hardening                                   | GPT-5.4 high                 |
| P2/P3 cache optimization                                  | GPT-5.5 high                 |
| docs/GSD updates                                          | GPT-5.4 medium               |

Do not let a lower-reasoning model own C1, S1, or P2/P3 unsupervised. Smaller
models are acceptable only for narrow mechanical subtasks with phase-lead
review. If GPT-5.5 is unavailable, use the strongest available coding model with
high reasoning for the P0 sequence.

This guidance is mirrored in
`/Users/danknauss/Developer/GitHub/wp-bibliography-block/.planning/phases/02-performance-stability-remediation/02-PLAN.md`.

---

## Current priority list after recent commits

Recent commits changed the interpretation of the task list:

-   **Already done / re-scoped**
    -   PMID input now resolves through the WordPress REST proxy; remaining PMID
        work is cache/retry hardening, not adding the proxy itself
    -   structured-edit cancellation has post-format guards; remaining async
        work is to apply the same latest-operation model to paste/import, manual
        add, delete, and style switch
    -   the formatter cache is already LRU by entry count; remaining cache work
        is fallback correctness, cheaper keys, and memory/byte bounds
    -   the benchmark harness exists; remaining benchmark work is making it fail
        or mark output invalid when it measured fallback instead of real
        formatting
-   **P0 fixes before broader feature work**
    1. REQ-C1 — total bibliography size policy / hidden 51-entry cliff
    2. REQ-C2 — do not cache fallback formatter output as success
    3. REQ-C3 — remove manual-entry double formatting
    4. REQ-S1 — stale async-result guards across editor mutation flows
    5. REQ-B1 — authoritative benchmark harness
    6. REQ-C4 — preserve frontend zero-JS architecture as a review gate
-   **P1 hardening after P0 correctness**
    1. REQ-P1 — release-package pruning
    2. REQ-N1 — PMID response caching
    3. REQ-N2 — avoidable DOI network work
    4. REQ-P2 — cautious server-side formatter caching
    5. REQ-P3 — cheaper, memory-bounded JS formatter cache keys
-   **New development should wait until P0 is under control**
    -   frontend Cite/Export affordances
    -   writable REST/Abilities integration
    -   language-pack expansion
    -   large module splits not directly needed for the P0 fixes

This priority list is mirrored in
`/Users/danknauss/Developer/GitHub/wp-bibliography-block/.planning/phases/02-performance-stability-remediation/02-PLAN.md`.

---

## Suggested issue breakdown

If this plan is moved into the tracker, create tickets in roughly this order:

1. REQ-C1 — Total bibliography size policy
2. REQ-C2 — Do not cache fallback formatter output
3. REQ-C3 — Remove manual-entry double formatting
4. REQ-S1 — Async stale-result guards
5. REQ-B1 — Benchmark harness hardening
6. REQ-C4 — Preserve frontend zero-JS architecture
7. REQ-P1 — Release package pruning
8. REQ-N1 — PMID caching
9. REQ-N2 — Avoidable DOI network work
10. REQ-P2 — Cautious server-side formatter caching
11. REQ-P3 — Cheaper, bounded JS cache keys
12. REQ-E3 — Supported-size performance fixtures
13. REQ-E1 — Style-context-safe whole-list optimization
14. REQ-E2 — Editor bundle optimization pass
15. REQ-M1 — Split `edit.js`
16. REQ-M2 — Split `bibliography-builder.php`
17. REQ-M3 — Modularize free-text parser
18. REQ-M4 — Track citeproc-php PHP-version compatibility

---

## Open questions

1. Should the 1.x product support more than 50 total entries per block, or
   should 50 be the hard total cap until larger bibliographies are benchmarked?
2. If total support rises above 50, what is the first official size target: 100,
   250, or 500 entries?
3. Should full-bibliography formatter caching use transients at all when no
   persistent object cache is available?
4. Should DOI resolution remain fully client-side, or should a future server
   proxy provide cache, timeout, and polite-pool control?
5. Are release package budgets strict enough to justify CI gates immediately, or
   should they begin as reporting-only?
6. What approximate byte budget should the in-session JS formatter cache use
   after replacing full-payload keys?
7. For non-style mutations, which styles and metadata shapes are safe for
   per-entry formatting without whole-bibliography citeproc context?

---

## Revision history

| Date       | Change                                                                                                                                                                                                                                          | Author |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 2026-05-08 | Initial draft created from repository audit and remediation recommendations                                                                                                                                                                     | Codex  |
| 2026-05-09 | Revised priority order and requirements based on deeper performance/stability review: total-size cliff, fallback cache poisoning, manual double-formatting, DOI/PMID network risks, cautious formatter caching, and PHP dependency deprecations | Codex  |
| 2026-05-09 | Checked recent commits/current state, elevated the 51-entry cliff to the first execution item, and mirrored the task list into GSD Phase 2 planning                                                                                             | Codex  |
| 2026-05-09 | Added model/reasoning allocation guidance for Phase 2 execution, reserving high-reasoning frontier models for the P0 correctness sequence and cache optimization work                                                                           | Codex  |
