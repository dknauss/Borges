# Phase 7: Free-text Embedded-identifier Resolution (Tier 1) - Research

**Researched:** 2026-06-21
**Domain:** JS parser integration — identifier extraction, resolver routing, graceful degradation
**Confidence:** HIGH (all findings grounded in direct source-file reading; no external API calls required)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Extract embedded DOI using `10.\d{4,}/…` pattern; extract embedded PMID using
  the existing PMID shape.
- Extraction MUST be specific enough to avoid false positives from
  identifier-shaped substrings inside titles/quoted text.
- Prefer DOI over PMID when both are present (DOI is richer and more
  authoritative), unless research surfaces a concrete reason to do otherwise.
- On a detected embedded identifier, route to the EXISTING resolver backend
  (`PARSER_BACKENDS.doi` / `PARSER_BACKENDS.pmid`) — do not add a new backend.
- Extracted DOIs MUST flow through the existing dedup/normalization path
  (`normalizeDoiValueForLookup`, `existingDoiValues`) so duplicates are skipped
  exactly as bare-DOI pastes are today.
- If resolver lookup fails (network/404/invalid), degrade gracefully: fall back
  to the heuristic free-text parse, then to the existing limited-support
  message. NEVER silently drop the input or store partial/guessed CSL.
- No new SSRF surface. Reuse only the fixed-host CrossRef/NCBI resolvers and the
  authenticated PMID REST proxy. Do not introduce arbitrary-URL fetching.
- Write failing unit tests FIRST for the extraction/detection helper and watch
  them fail in the working tree before implementing.
- Because the pre-commit gate rejects failing commits, commit test +
  implementation together as ONE GREEN commit per task (RED lives in the working
  tree, not in history).
- Add positive fixtures to `docs/free-text-samples.md`; migrate now-supported
  cases out of `docs/free-text-unsupported-samples.md`.

### Claude's Discretion

- Exact helper name/location (e.g. a new `extractEmbeddedIdentifier` in
  `src/lib/parser.js` vs. a small sibling module).
- Whether embedded-identifier detection lives inside `detectFormat`,
  `splitChunkIntoDetectedItems`, or a new pre-pass — planner to choose based on
  the cleanest integration with existing dedup/concurrency flow.
- Precise fallback wiring (try-resolve-then-freetext) so a failed lookup still
  reaches `parseFreeTextCitation`.

### Deferred Ideas (OUT OF SCOPE)

- Tier 2 generic monograph/article fallback parser — separate future phase.
- Tier 3 CRF/ML free-text parsing — direction only, not committed work.
- URL-based metadata resolution — already gated in the identifier backlog.
</user_constraints>

---

## Summary

Phase 7 makes a small, surgical change to `src/lib/parser.js`: when
`detectFormat()` would classify a chunk as `freetext`, first scan it for an
embedded DOI or PMID; if found, return a `doi`/`pmid` format result so the
existing `PARSER_BACKENDS` take over and do a CrossRef/NCBI lookup. All the
machinery downstream — concurrency, dedup, normalization, error formatting,
`remainingInput` — is unchanged.

The existing `DOI_ONLY_REGEX` (line 22) and `PMID_REGEX` (line 25) are anchored
(`^…$`), which is why they only match bare identifiers. A new unanchored
extraction regex is needed that can find a DOI or PMID anywhere inside a
longer string. The extracted identifier value must then be passed to
`normalizeDoiValueForLookup` (line 116) before the dedup check, and must hit
`resolveDoiCslItems` (line 198) / `resolvePmidCsl` (line 70) through the
existing `PARSER_BACKENDS`, not a separate code path.

Graceful degradation requires a new `freetext-with-identifier` virtual flow:
try the identifier backend, catch any error, and on failure route the original
raw text through the `freetext` backend instead of surfacing the resolver error
to the user.

**Primary recommendation:** Add `extractEmbeddedIdentifier(chunk)` as a module-
private helper in `src/lib/parser.js` and call it inside `detectFormat()` as the
final fallback, replacing the current `return { format: 'freetext', value: chunk }`.
No new module; no change to PARSER_BACKENDS; no change to the concurrency or
dedup paths below `detectFormat`.

---

## Standard Stack

### Core (all already installed — no new dependencies)

| Module | Location | Role |
|--------|----------|------|
| `src/lib/parser.js` | existing | Integration point; contains `detectFormat`, `PARSER_BACKENDS`, dedup, concurrency |
| `src/lib/free-text-parser.js` | existing | `parseFreeTextCitation` — fallback when resolver fails |
| `src/lib/input-support.js` | existing | `SUPPORTED_INPUT_MESSAGE` — final error text |
| `@wordpress/api-fetch` | existing | PMID REST proxy transport |
| `window.fetch` / `fetchFn` | existing | CrossRef transport (injected for tests) |

No npm installs required.

---

## Architecture Patterns

### Integration Point: Inside `detectFormat` (Recommended)

`detectFormat` (parser.js:374–388) is the single gate that decides format for
every chunk. It currently returns `{ format: 'freetext', value: chunk }` as its
last branch. The cleanest integration replaces that final return with:

```
const embedded = extractEmbeddedIdentifier(chunk);
if (embedded) {
    return embedded;   // { format: 'doi'|'pmid', value: extractedId, embeddedIn: chunk }
}
return { format: 'freetext', value: chunk };
```

**Why `detectFormat`, not `splitChunkIntoDetectedItems`:**

`splitChunkIntoDetectedItems` (parser.js:414–469) calls `detectFormat` for
every line and chunk. Adding extraction there would require duplicating logic
across the `allLinesAreIdentifiers` path, the `allLinesLookStandalone` path,
and the single-chunk fallback. Doing it inside `detectFormat` means all three
paths benefit automatically, and the dedup filter at parser.js:675 stays
untouched because the returned `format` is already `'doi'` by the time dedup
runs.

**Why not a separate pre-pass above `splitChunkIntoDetectedItems`:**
A pre-pass would have to split, scan, and reassemble items before the existing
splitting logic runs, creating a duplicate split. The current architecture
already produces one `detected` item per entry; intervening before
`splitChunkIntoDetectedItems` would complicate truncation, overflow tracking,
and `rawValue` preservation.

### The `embeddedIn` Field

`createDetectedItem` (parser.js:390–396) already accepts `rawValue` as a third
argument distinct from `value`. The extracted identifier becomes `value` (what
the backend resolves) while the original full citation string becomes `rawValue`
(what goes into `remainingInput` on failure). This matches the existing pattern:
`splitChunkIntoDetectedItems` already passes `line` as both `value` and
`rawValue` for standalone identifier lines, and `chunk.trim()` as `rawValue`
for multi-line chunks.

For an embedded-identifier item:
- `format`: `'doi'` or `'pmid'`
- `value`: the extracted identifier only (e.g. `'10.1234/abcd'`)
- `rawValue`: the full original citation string (for `remainingInput` on failure)

No structural change to `createDetectedItem` is needed.

### Graceful Degradation Pattern

The current `mapWithConcurrency` resolver (parser.js:692–730) has a single try/
catch per item. On `doi`/`pmid` failure it formats the backend error; on
`freetext` failure it formats the unsupported-input message. A third path is
needed: when a `doi`/`pmid` item was extracted from free text, a resolver
failure should retry with `freetext` before surfacing any error.

The cleanest approach is to carry a `fallbackValue` alongside `embeddedIn`
items and check it in the catch block:

```javascript
} catch (err) {
    // If this was an embedded-identifier extracted from free text,
    // try the freetext backend before giving up.
    if (item.fallbackValue !== undefined) {
        try {
            const fallback = await PARSER_BACKENDS.freetext(item.fallbackValue);
            return { item, entries: fallback.cslItems.map(/* same normalize path */) };
        } catch (_fallbackErr) {
            // fall through to the standard error path
        }
    }
    return {
        item,
        error: item.format === 'freetext'
            ? formatUnsupportedInputError()
            : formatBackendParseError(item.format, err),
    };
}
```

`fallbackValue` would be the original full free-text string. It is `undefined`
for bare-identifier items, so the existing code path is untouched for those.

### Recommended Project Structure (no change)

```
src/lib/
├── parser.js          # Add extractEmbeddedIdentifier() here (private)
├── free-text-parser.js  # No change
├── input-support.js   # No change
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CrossRef resolution | New fetch logic | `resolveDoiCslItems` (parser.js:198) | Already has LRU cache, dedup-pending map, serialization queue |
| PMID resolution | New fetch/REST call | `resolvePmidCsl` (parser.js:70) | Already routes fetchFn vs. apiFetch vs. window.fetch |
| DOI normalization | New regex | `normalizeDoiInput` / `normalizeDoiValueForLookup` (parser.js:109, 116) | Strips trailing punctuation, doi: prefix, dx.doi.org prefix |
| Dedup | New Set logic | `existingDoiSet` filter at parser.js:675 | Already compares `normalizeDoiValueForLookup(item.value)` against `existingDoiValues` |
| Per-item concurrency | Promise.all | `mapWithConcurrency` (parser.js:522) | Already caps at `PARSE_CONCURRENCY = 4` |
| Error messages | Custom strings | `formatBackendParseError` / `formatUnsupportedInputError` (parser.js:546–590) | Already i18n-wrapped; PMID/DOI/freetext branches |

**Key insight:** Every piece of machinery this feature needs already exists. The
entire implementation is wiring — connecting `extractEmbeddedIdentifier` output
into the existing item format/value/rawValue fields.

---

## Regex Design

### DOI Extraction (unanchored)

The existing `DOI_ONLY_REGEX` (parser.js:22) anchors to `^…$`. A new unanchored
variant for embedded detection:

```javascript
// Matches a DOI anywhere in the string.
// Requires the 10.NNNN/ registrant prefix; captures up to the next whitespace
// or end of string. Trailing punctuation (.,;:) stripped in normalizeDoiInput.
const EMBEDDED_DOI_REGEX =
    /(?:(?:https?:\/\/)?(?:dx\.)?doi\.org\/|(?:https?:\/\/)?doi:|(?<!\w))10\.\d{4,}\/[^\s]+/iu;
```

**Specificity rationale:**
- The `10.\d{4,}/` registrant pattern is the globally unique DOI prefix —
  CrossRef requires it and it cannot appear by accident inside a title. "10."
  does appear in decimal numbers and page ranges, but paired with four or more
  digits and a slash it is diagnostic of a DOI.
- Lookbehind `(?<!\w)` prevents matching inside longer numeric strings. The
  word-boundary alternative `\b10\.` also works and has wider JS support; either
  is fine because the `10.` always follows whitespace or URL prefix in practice.
- The `[^\s]+` suffix captures through the end of the DOI including path
  segments with `/`, `(`, `)`, `-`, `_`. Trailing `.,;:` are stripped by the
  existing `normalizeDoiInput` call.

**False-positive avoidance:**
- A string like "Chapter 10. Methodology" produces `10.` but not `10.\d{4,}/`,
  so it does not match.
- A title containing `10.1000` (without a slash) does not match.
- A URL like `https://example.com/10.something` matches only if `something`
  begins with `\d{4,}/`, which normal URLs never do.

### PMID Extraction (unanchored)

The existing `PMID_REGEX` (parser.js:25) is `^PMID:\s*(\d{1,8})$/i`. An
unanchored variant:

```javascript
const EMBEDDED_PMID_REGEX = /\bPMID[:\s]\s*(\d{1,8})\b/iu;
```

**Specificity rationale:**
- Requires the `PMID` label. Raw 8-digit numbers are too ambiguous to extract
  without it (years, pages, ISBNs, etc. all look the same).
- The `\b` word boundary on both sides prevents partial matches.
- `[:\s]` allows both `PMID:12345678` and `PMID 12345678` variants common in
  PubMed export formats.

### Precedence: DOI before PMID

When both are present in the same string, extract DOI first. Rationale:
- DOI resolves via CrossRef, which returns full structured CSL (type, authors,
  journal metadata). PMID often returns only the PubMed record.
- A record with both identifier types typically has a DOI as the citable
  identifier. PMID is a database index key.
- This matches the implicit priority already in the existing `detectFormat`:
  `PMID_REGEX` is checked first for bare inputs, but for embedded detection the
  DOI is more authoritative when both co-occur.

### `extractEmbeddedIdentifier` Interface

```javascript
/**
 * Scan `chunk` for an embedded DOI or PMID.
 *
 * @param {string} chunk  A free-text citation string.
 * @return {{ format: 'doi'|'pmid', value: string, rawValue: string } | null}
 */
function extractEmbeddedIdentifier(chunk) {
    // DOI first (higher authority)
    const doiMatch = chunk.match(EMBEDDED_DOI_REGEX);
    if (doiMatch) {
        return {
            format: 'doi',
            value: normalizeDoiInput(doiMatch[0]),  // strip trailing punct + doi: prefix
            rawValue: chunk,
        };
    }

    // PMID second
    const pmidMatch = chunk.match(EMBEDDED_PMID_REGEX);
    if (pmidMatch) {
        return {
            format: 'pmid',
            value: `PMID:${pmidMatch[1]}`,          // normalized form PARSER_BACKENDS.pmid expects
            rawValue: chunk,
        };
    }

    return null;
}
```

The returned `value` for PMID uses the `PMID:NNNN` form already consumed by
`normalizePmidInput` (parser.js:40–42): `value.replace(/^PMID:\s*/iu, '').trim()`.

---

## Integration into `detectFormat`

```javascript
// parser.js:374–388 — modified detectFormat
function detectFormat(chunk) {
    if (PMID_REGEX.test(chunk)) {
        return { format: 'pmid', value: chunk };
    }

    if (DOI_ONLY_REGEX.test(chunk)) {
        return { format: 'doi', value: chunk };
    }

    if (BIBTEX_REGEX.test(chunk)) {
        return { format: 'bibtex', value: chunk };
    }

    // NEW: before falling through to freetext, try embedded identifier extraction.
    const embedded = extractEmbeddedIdentifier(chunk);
    if (embedded) {
        // embedded.rawValue = full citation string (for remainingInput on failure)
        // embedded.value    = extracted DOI/PMID (for resolver)
        return { ...embedded, fallbackValue: chunk };
    }

    return { format: 'freetext', value: chunk };
}
```

`fallbackValue: chunk` is the hook for graceful degradation inside
`mapWithConcurrency`. It is `undefined` for all non-embedded items, preserving
existing behavior exactly.

---

## Dedup Path for Extracted DOIs

The dedup filter at parser.js:670–688 runs on `detected` items after
`splitChunkIntoDetectedItems` returns them:

```javascript
detected = detected.filter((item) => {
    if (item.format !== 'doi') return true;
    const normalizedDoi = normalizeDoiValueForLookup(item.value);
    if (existingDoiSet.has(normalizedDoi)) {
        skippedDuplicateCount += 1;
        return false;
    }
    return true;
});
```

Because `extractEmbeddedIdentifier` sets `item.format = 'doi'` and `item.value`
to the normalized DOI string (after `normalizeDoiInput`), this filter runs
unchanged on embedded-DOI items. `normalizeDoiValueForLookup(item.value)` will
produce the same key as for a bare-DOI paste of the same DOI. No changes to the
dedup path.

The same LRU cache (`DOI_METADATA_CACHE`, parser.js:35) and pending-resolution
map (`PENDING_DOI_RESOLUTIONS`, parser.js:36) serve both bare and embedded DOIs
because the cache key is `normalizeDoiValueForLookup(value)` in both cases
(parser.js:199).

---

## Common Pitfalls

### Pitfall 1: Extracting DOI-shaped substrings from titles

**What goes wrong:** A title like "Chapter 10.1000 in Modern Computing" could
match a poorly-written DOI regex.
**Why it happens:** The `10.` prefix is common in decimal numbers and chapter
references. Without the registrant suffix (`\d{4,}/`), any decimal number
starting with 10 could be confused for a DOI.
**How to avoid:** Require the full `10.\d{4,}/` prefix with a path segment
after the slash. The `[^\s]+` suffix ensures at least one non-whitespace
character follows the slash.
**Warning signs:** Test inputs with chapter references like "see Section 10.2.3"
and "Table 10.1" to confirm they do not match.

### Pitfall 2: Stripping trailing punctuation before passing to backend

**What goes wrong:** A DOI extracted from `…https://doi.org/10.1234/abcd.` ends
with a period. Passing `10.1234/abcd.` to CrossRef returns 404.
**Why it happens:** Free-text citations often end with a period; DOIs at
sentence-end inherit it.
**How to avoid:** Pass the extracted match through `normalizeDoiInput` (which
calls `.replace(/[).,;:\s]+$/u, '')`) before storing in `item.value`. The
`EMBEDDED_DOI_REGEX` match captures the period; `normalizeDoiInput` strips it.
**Warning signs:** Test `Author. Title. Journal 1 (2020): 1. https://doi.org/10.1234/abcd.`

### Pitfall 3: PMID extraction too broad without label requirement

**What goes wrong:** An 8-digit number in a page range or ISBN extracted as a
PMID, sent to NCBI, and resolved to a random paper.
**Why it happens:** PMIDs are plain integers; without the `PMID:` label there
is no safe way to distinguish them from other numbers in free text.
**How to avoid:** `EMBEDDED_PMID_REGEX` requires the `PMID` label. Never
attempt bare-number PMID extraction.
**Warning signs:** A citation like "pp. 12345678–12345680" or ISBN with 8-digit
segments should not match.

### Pitfall 4: `fallbackValue` missing from `createDetectedItem`

**What goes wrong:** The concurrency mapper can't distinguish embedded-identifier
items from bare items during the catch block.
**Why it happens:** `createDetectedItem` currently tracks `{ format, value, rawValue }`.
`fallbackValue` is a new field.
**How to avoid:** Either: (a) add `fallbackValue` as an optional fourth field in
`createDetectedItem`, or (b) add it directly in `detectFormat`'s return when
`extractEmbeddedIdentifier` finds a match. Option (b) is less intrusive since
`createDetectedItem` is used for all items.

### Pitfall 5: `inputFormat` field records embedded resolution as `'doi'`

**What goes wrong:** The caller (e.g. analytics/logging) sees `inputFormat: 'doi'`
for a citation that was actually pasted as free text with an embedded DOI.
**Why it happens:** `item.format` drives `inputFormat` at parser.js:715.
**Decision:** This is ACCEPTABLE. The DOI backend resolved the record; the
saved CSL-JSON is from CrossRef, not heuristic parsing. Recording `'doi'` as
`inputFormat` accurately reflects what metadata source produced the entry.
There are no migration implications — `inputFormat` is not persisted in block
attributes.

### Pitfall 6: URL-wrapped DOIs already handled by `DOI_ONLY_REGEX`

**What goes wrong:** A bare `https://doi.org/10.1234/abcd` already matches
`DOI_ONLY_REGEX` and is routed to the DOI backend without embedded extraction.
**Why it's not a problem:** `detectFormat` checks `DOI_ONLY_REGEX` before
calling `extractEmbeddedIdentifier`. A standalone DOI URL is already handled.
The embedded regex only runs when the chunk is too long to be a bare DOI — i.e.,
when it has surrounding citation text.

### Pitfall 7: Multiple DOIs in one free-text line

**What goes wrong:** A citation with two DOIs (rare but possible in annotation
or correction notices) extracts only the first.
**Decision:** Extract only the first DOI match. This matches the principle
of least surprise and avoids splitting one citation into two records. The user
can always paste the second DOI separately.

---

## Code Examples

### Verified: How `PARSER_BACKENDS.doi` is called (parser.js:478–481)

```javascript
// Source: src/lib/parser.js:478
doi: async (value, { fetchFn } = {}) => {
    return {
        cslItems: await resolveDoiCslItems(value, fetchFn),
    };
},
```

`value` is passed directly to `resolveDoiCslItems` which calls
`normalizeDoiValueForLookup(value)` as its cache key (parser.js:199). This means
the `value` stored in the detected item should still include any `doi:` prefix
or `https://doi.org/` prefix — `normalizeDoiValueForLookup` will strip it. So
`extractEmbeddedIdentifier` should use `normalizeDoiInput` (which strips `doi:`
prefixes and trailing punctuation but preserves the `https://doi.org/` form) or
return the raw match after trailing-punctuation stripping.

### Verified: How PMID backend normalizes input (parser.js:472–476)

```javascript
// Source: src/lib/parser.js:472
pmid: async (value, { fetchFn } = {}) => {
    const pmid = normalizePmidInput(value);  // strips "PMID:\s*"
    const csl = await resolvePmidCsl(pmid, fetchFn);
    return { cslItems: [csl] };
},
```

The backend expects `value` in either `PMID:NNNN` or `pmid:NNNN` form (or bare
digits — `normalizePmidInput` strips the prefix either way). Returning
`value: \`PMID:${pmidMatch[1]}\`` from `extractEmbeddedIdentifier` is
consistent with what the existing tests mock (e.g. parser.test.js:1287:
`parsePastedInput('PMID:26673779', 'apa', { fetchFn })`).

### Verified: How test mocks CrossRef fetch (parser.test.js:548–580)

```javascript
// Source: src/lib/parser.test.js:548
const fetchFn = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
        type: 'journal-article',
        title: 'Array programming with NumPy',
        DOI: '10.1038/s41586-020-2649-2',
        author: [{ given: 'Charles R.', family: 'Harris' }],
    }),
});
const result = await parsePastedInput('10.1038/s41586-020-2649-2', 'apa-7', { fetchFn });
```

New tests for embedded-DOI resolution follow the same pattern, passing `fetchFn`
and asserting `fetchFn` was called with the CrossRef URL.

### Verified: How PMID test mocks work (parser.test.js:1276–1295)

```javascript
// Source: src/lib/parser.test.js:1276
function makeFetchFn(status = 200, body = SAMPLE_CSL) {
    return jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: jest.fn().mockResolvedValue(body),
    });
}
```

Embedded-PMID tests reuse this helper.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Cite.async` for DOI resolution (citation-js plugin) | Direct CrossRef CSL endpoint via `fetch` + `Cite.async` fallback | Phase 2 / v1.3.x | Enables Playground (cross-origin); reduces bundle coupling |
| No `parseFreeTextCitation` backend | `PARSER_BACKENDS.freetext` wired into `parsePastedInput` | Post Phase 2 | Free-text now goes through same pipeline as DOI/PMID/BibTeX |
| `inputRaw`, `parsedAt`, `parseConfidence` in persisted entries | Lean payload: only `id`, `csl`, `formattedText`, `displayOverride`, `inputFormat`, `parseWarnings` | v1.3.x | Smaller block attributes |

**Note:** Phase 7 introduces no state-of-the-art changes — it wires existing
mechanisms together. The CSL-JSON source-of-truth contract is unchanged. Static
save output, exports, JSON-LD, COinS, and the CSL-JSON `<script>` block all read
from `entry.csl`, which is written by `validateAndSanitizeCsl(normalizedCsl)` —
the same path used for bare DOI/PMID resolutions today.

**No migration or deprecated handler needed.** The `inputFormat` field is not
persisted in block attributes. There is no change to the block save schema.

---

## Open Questions

1. **Should `SUPPORTED_INPUT_MESSAGE` be updated to mention embedded identifier
   resolution?**
   - What we know: The current message reads "Paste a DOI, PMID … or supported
     citation" — which now also describes the embedded case.
   - What's unclear: Whether users will find it confusing that a full citation
     "just works" via DOI. The message is displayed on failure, not on success,
     so it may not need updating.
   - Recommendation: No change to `SUPPORTED_INPUT_MESSAGE` in this phase. The
     message already names DOI/PMID. Revisit if users report confusion.

2. **Should `inputFormat` be `'doi-embedded'` instead of `'doi'` to distinguish
   embedded resolution from bare DOI pastes?**
   - What we know: `inputFormat` is stored in the JS `entries` array returned
     by `parsePastedInput` but is NOT persisted in block attributes
     (see parser.test.js:381–406 confirming lean payload). It is used by
     `getReviewMetadataWarnings` which only checks `inputFormat === 'doi'`.
   - Recommendation: Keep `inputFormat: 'doi'` for embedded cases. The
     metadata warning logic at parser.js:321–335 already applies to DOI-resolved
     records and should apply equally to embedded-DOI-resolved records.

3. **What happens to multi-paragraph free-text pasted input where paragraph 1
   has an embedded DOI and paragraph 2 does not?**
   - What we know: `parsePastedInput` splits on blank lines first
     (parser.js:657–659), producing separate chunks. Each chunk goes through
     `splitChunkIntoDetectedItems` → `detectFormat` independently. So paragraph
     1 would extract the DOI and resolve it; paragraph 2 would fall through to
     `freetext` normally.
   - Recommendation: No special handling needed. The blank-line split already
     isolates them correctly.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (configured via `jest.config.js`, uses `@wordpress/scripts`) |
| Config file | `jest.config.js` (root) |
| Quick run command | `npm test -- src/lib/parser.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| `extractEmbeddedIdentifier` extracts DOI from free text | unit | `npm test -- src/lib/parser.test.js` (new describe block) | No — Wave 0 |
| `extractEmbeddedIdentifier` extracts PMID from free text | unit | `npm test -- src/lib/parser.test.js` | No — Wave 0 |
| `extractEmbeddedIdentifier` returns null for text with no identifier | unit | `npm test -- src/lib/parser.test.js` | No — Wave 0 |
| `extractEmbeddedIdentifier` prefers DOI over PMID when both present | unit | `npm test -- src/lib/parser.test.js` | No — Wave 0 |
| `extractEmbeddedIdentifier` avoids false positives (chapter refs, page ranges) | unit | `npm test -- src/lib/parser.test.js` | No — Wave 0 |
| `extractEmbeddedIdentifier` handles URL-wrapped DOIs and trailing punctuation | unit | `npm test -- src/lib/parser.test.js` | No — Wave 0 |
| `parsePastedInput` resolves free-text citation with embedded DOI via CrossRef | integration | `npm test -- src/lib/parser.test.js` | No — Wave 0 |
| `parsePastedInput` resolves free-text citation with embedded PMID via REST proxy | integration | `npm test -- src/lib/parser.test.js` | No — Wave 0 |
| `parsePastedInput` falls back to freetext parser on resolver failure | integration | `npm test -- src/lib/parser.test.js` | No — Wave 0 |
| `parsePastedInput` falls back to SUPPORTED_INPUT_MESSAGE on both resolver and freetext failure | integration | `npm test -- src/lib/parser.test.js` | No — Wave 0 |
| Extracted DOI deduped against `existingDoiValues` same as bare DOI | integration | `npm test -- src/lib/parser.test.js` | No — Wave 0 |
| Extracted DOI goes to `remainingInput` on failure | integration | `npm test -- src/lib/parser.test.js` | No — Wave 0 |
| No new fetch calls to arbitrary URLs (SSRF regression) | unit | inspecting fetchFn call args | No — Wave 0 |
| Existing DOI-only tests still pass (regression) | regression | `npm test -- src/lib/parser.test.js` | Yes (existing) |
| Existing PMID tests still pass (regression) | regression | `npm test -- src/lib/parser.test.js` | Yes (existing) |
| Existing freetext tests still pass (regression) | regression | `npm test -- src/lib/parser.test.js` | Yes (existing) |

### Observable Behaviors for VALIDATION.md

1. **Happy path — embedded DOI:** Pasting `Author. Title. Journal 1 (2024): 1–10. https://doi.org/10.1234/abcd` results in one entry with `inputFormat: 'doi'` and CrossRef-sourced CSL, not a heuristic-parsed entry.
2. **Happy path — embedded PMID:** Pasting `Author. Title. PMID: 12345678` results in one entry with `inputFormat: 'pmid'` and NCBI-sourced CSL.
3. **Graceful degradation — resolver 404:** Pasting a citation with `10.9999/doesnotexist` causes the freetext backend to run if the heuristic parser can match; otherwise produces `SUPPORTED_INPUT_MESSAGE` in `errors` and the original string in `remainingInput`.
4. **Dedup — embedded DOI already present:** Pasting a citation with `10.1234/already-present` when that DOI is in `existingDoiValues` produces `skippedDuplicateCount: 1` and no entry, same as bare DOI paste.
5. **False-positive guard:** "Chapter 10. Methods" does not produce a DOI resolution attempt.
6. **PMID label required:** "Call 12345678 for support." does not produce a PMID resolution attempt.
7. **Fixture docs updated:** The canonical failing case from CONTEXT.md appears in `docs/free-text-samples.md`; any previously-failing cases that now resolve are removed from `docs/free-text-unsupported-samples.md`.

### Sampling Rate

- **Per task commit:** `npm test -- src/lib/parser.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] New `describe('extractEmbeddedIdentifier')` block in `src/lib/parser.test.js` — covers extraction unit cases
- [ ] New `describe('parsePastedInput — embedded identifier resolution')` block in `src/lib/parser.test.js` — covers integration cases
- [ ] Fixture additions in `docs/free-text-samples.md`
- [ ] Fixture migrations in `docs/free-text-unsupported-samples.md` (if any currently-unsupported samples become supported)

*(No new test infrastructure needed — existing Jest setup, `citation-js-mocks.js`, and `makeFetchFn` pattern cover all cases.)*

---

## Sources

### Primary (HIGH confidence — direct source reading)

- `src/lib/parser.js` — full read; all line numbers cited are verified
- `src/lib/free-text-parser.js` — full read; `parseFreeTextCitation` signature confirmed
- `src/lib/parser.test.js` — full read; mock patterns and test structure confirmed
- `src/lib/input-support.js` — `SUPPORTED_INPUT_MESSAGE` confirmed
- `src/__test-utils__/citation-js-mocks.js` — mock factories confirmed
- `docs/free-text-samples.md` — fixture format confirmed
- `docs/free-text-unsupported-samples.md` — unsupported cases confirmed

### Secondary (HIGH confidence — project planning docs)

- `.planning/phases/07-free-text-embedded-identifier-resolution/07-CONTEXT.md` — locked decisions
- `.planning/ROADMAP.md` — Phase 7 requirements and Tier 1 acceptance goals
- `.planning/STATE.md` — project state and TDD commit gate policy

---

## Metadata

**Confidence breakdown:**

- Integration point (`detectFormat` as the hook): HIGH — based on reading all
  three candidate locations and the dedup/concurrency flow
- Regex design: HIGH — grounded in the existing `DOI_ONLY_REGEX` / `PMID_REGEX`
  patterns and the DOI registrant spec; false-positive analysis done against
  real title content patterns in the test fixtures
- Graceful degradation via `fallbackValue`: HIGH — grounded in the actual
  try/catch structure of `mapWithConcurrency` (parser.js:692–730)
- Dedup path compatibility: HIGH — dedup filter at parser.js:675 already operates
  on `item.format === 'doi'` and `item.value`, which the extraction path sets
  correctly
- No migration/save implications: HIGH — `inputFormat` is not persisted;
  `entry.csl` source of truth is unchanged

**Research date:** 2026-06-21
**Valid until:** 2026-09-21 (stable codebase; no upstream API changes expected)
