# Phase 7: Free-text embedded-identifier resolution (Tier 1) - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning
**Source:** Roadmap-derived locked scope (ROADMAP.md "Free-text parsing and
embedded-identifier resolution backlog", Tier 1)

<domain>
## Phase Boundary

**Delivers:** When a free-text citation pasted into the bibliography block
contains an embedded DOI (`10.\d{4,}/…`) or PMID, the plugin extracts that
identifier and resolves it through the **existing** DOI/PMID resolver backend
instead of routing the whole string to the heuristic free-text parser.

**The asymmetry being fixed:** a work that resolves cleanly when pasted as a
bare DOI/PMID currently FAILS when pasted as a full free-text citation that
carries the same identifier inline. `detectFormat()` in `src/lib/parser.js`
only recognizes identifiers when the **entire** chunk is the identifier
(`DOI_ONLY_REGEX` and `PMID_REGEX` are anchored `^…$`), so embedded identifiers
are never extracted and the input falls through to the brittle regex tower in
`src/lib/free-text-parser.js`.

**Out of scope (do NOT build):**
- Tier 2 — generic identifier-less monograph/article free-text fallback parser
- Tier 3 — CRF/ML free-text reference parsing (AnyStyle-style)
- Any new outbound-fetch surface beyond the existing fixed-host resolvers

</domain>

<decisions>
## Implementation Decisions (locked)

### Extraction
- Extract an embedded DOI using a specific pattern (`10.\d{4,}/…`) and an
  embedded PMID using the existing PMID shape.
- Extraction MUST be specific enough to avoid false positives from
  identifier-shaped substrings inside titles/quoted text.
- Prefer DOI over PMID when both are present (DOI is the richer, more
  authoritative resolver path), unless research surfaces a concrete reason to
  do otherwise.

### Routing & resolution
- On a detected embedded identifier, route to the EXISTING resolver backend
  (`PARSER_BACKENDS.doi` / `PARSER_BACKENDS.pmid`) — do not add a new backend.
- Extracted DOIs MUST flow through the existing dedup/normalization path
  (`normalizeDoiValueForLookup`, `existingDoiValues`) so duplicates are skipped
  exactly as bare-DOI pastes are today.

### Graceful degradation
- If resolver lookup fails (network/404/invalid), degrade gracefully: fall back
  to the heuristic free-text parse, then to the existing limited-support
  message. NEVER silently drop the input or store partial/guessed CSL.

### Security
- No new SSRF surface. Reuse only the fixed-host CrossRef/NCBI resolvers and the
  authenticated PMID REST proxy. Do not introduce arbitrary-URL fetching.

### Testing (TDD-strict, test-blocking pre-commit gate)
- Write failing unit tests FIRST for the extraction/detection helper
  (`expect(extractEmbeddedIdentifier(input)).toEqual(…)`) and watch them fail in
  the working tree before implementing.
- Because the pre-commit gate rejects failing commits, commit test +
  implementation together as ONE GREEN commit per task (RED lives in the working
  tree, not in history).
- Add positive fixtures to `docs/free-text-samples.md`; migrate the now-supported
  cases out of `docs/free-text-unsupported-samples.md`.

### Claude's Discretion
- Exact helper name/location (e.g. a new `extractEmbeddedIdentifier` in
  `src/lib/parser.js` vs. a small sibling module).
- Whether embedded-identifier detection lives inside `detectFormat`,
  `splitChunkIntoDetectedItems`, or a new pre-pass — planner to choose based on
  the cleanest integration with existing dedup/concurrency flow.
- Precise fallback wiring (try-resolve-then-freetext) so a failed lookup still
  reaches `parseFreeTextCitation`.

</decisions>

<specifics>
## Specific Ideas

- Canonical failing case: `Author. *Title*. Place: Publisher, 2020. https://doi.org/10.1234/abcd`
  should resolve via CrossRef instead of failing.
- PMID inline case: a citation ending in `PMID: 12345678` should resolve via the
  PMID REST proxy.
- Key existing code: `detectFormat` (parser.js:374), `DOI_ONLY_REGEX`
  (parser.js:22), `PMID_REGEX` (parser.js:25), `PARSER_BACKENDS` (parser.js:471),
  `splitChunkIntoDetectedItems` (parser.js:414), dedup filter (parser.js:675).
- Relevant docs: `docs/free-text-samples.md`,
  `docs/free-text-unsupported-samples.md`.

</specifics>

<deferred>
## Deferred Ideas

- Tier 2 generic monograph/article fallback parser — separate future phase.
- Tier 3 CRF/ML free-text parsing — direction only, not committed work.
- URL-based metadata resolution — already gated in the identifier backlog.

</deferred>

---

*Phase: 07-free-text-embedded-identifier-resolution*
*Context gathered: 2026-06-21 from roadmap-locked Tier 1 scope*
