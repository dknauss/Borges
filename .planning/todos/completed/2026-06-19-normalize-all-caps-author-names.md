---
created: 2026-06-19T00:00:00Z
title: Normalize ALL-CAPS author names from CrossRef / PubMed
area: parsing
files:
  - src/lib/parser.js
  - src/lib/csl-sanitize.js
---

## Problem

Some CrossRef and PubMed records return author **family** (and occasionally
**given**) names in all uppercase. Examples observed during 1.4.0 verification
(2026-06-19):

- CrossRef `10.1093/mind/LIX.236.433` (Turing) → family `TURING`
- The PubMed PMID resolver returns the Watson / Crick authors uppercased

The block stores and renders CSL names verbatim, so these surface as
`TURING, A. M.` in **every** style. Confirmed it is the source *data*, not a
style `text-case` rule, by rendering the same record through styles that contain
no uppercase directive (see `docs/external-eccentricities.md`). So it is not a
CSL-style bug and is not addressed by the year-rendering fix.

## Solution

TBD. Detect an all-uppercase name token and convert to title case at the
parse/normalization boundary (e.g. in `normalizeCrossRefCsl` and the PMID
mapping, or a shared name-normalizer in `csl-sanitize.js`), so storage holds
clean CSL regardless of the rendering style.

Must NOT mangle:

- Genuine acronyms / initialisms used as names or particles.
- Name particles: `van der`, `de la`, `von`, `bin`, etc.
- Already-correct mixed-case names (only act when the token is fully uppercase
  and longer than ~1–2 chars, leaving initials like `A. M.` alone).
- Non-Latin scripts.

TDD: cases for `TURING` → `Turing`, `WATSON` → `Watson`, leave `Turing` and
`A. M.` untouched, preserve `van der Waals` particle casing, and a CrossRef-CSL
integration case. Decide whether to apply to `given` as well as `family`.

Found during 1.4.0 style verification; deferred from the year-fix PR (#47)
because it is a distinct data-normalization concern with real edge cases.

## Resolution (2026-06-19)

Pulled forward into 1.4.0 at the user's request. Implemented in
`src/lib/normalize-author-names.js` (`normalizeNameToken` /
`normalizeCslNameCase`), wired into `normalizeResolvedCsl` in `parser.js` so it
runs for every machine-resolved source but not manual entry. Family names are
title-cased aggressively; given names keep short concatenated initials (`JD`).
Particles, hyphen/apostrophe names, dotted initials, caseless scripts, and
organization `literal` names are preserved. Known limitation documented and
tested: source-all-caps internal caps (`MCCULLOCH` → `Mcculloch`) flatten.
Covered by `src/lib/normalize-author-names.test.js` (34 cases) plus a CrossRef
end-to-end case in `parser.test.js`. Shipped in PR #47.
