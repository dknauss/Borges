# Roadmap

## Phase tracks

The roadmap uses two distinct phase numbering schemes:

-   **Pre-launch product phases (1-7)** — historical product roadmap that
    delivered the `1.0.0` WordPress.org release on 2026-05-04. All complete.
-   **Post-launch GSD phases (`01-`, `02-`, ...)** — milestone-relative phase
    plans tracked under `.planning/phases/` while active and
    `.planning/archive/phases/` after completion. These are the executable units
    used by `/gsd:plan-phase` and `/gsd:execute-phase`.

When a historical doc says "Phase 2" without qualifier, it refers to the
post-launch GSD phase `02-performance-stability-remediation`, now archived
after completion.

### Pre-launch product phases (complete)

1. MVP stabilization and spec alignment
2. Enhanced input support
3. Multi-style foundation and Chicago default realignment
4. Core multi-style bibliography support
5. Remaining specialized style support
6. Structured editing
7. In-text citation integration

### Post-launch GSD phases

-   **Phase 01** — post-launch cleanup and documentation polish (complete)
-   **Phase 02** — performance and stability remediation (complete, committed
    in `3d5d3de` and `539b6b3`)
-   **Phase 03** — 1.3.x release prep (complete; produced the `v1.3.x` line)
-   **Phase 04** — frontend Cite/Export affordances (**shipped** in 1.4.x; merged
    via PR #37 `3995d14`, with follow-up fixes such as #47. The deterministic half
    of its former 04-04 browser checkpoint now has E2E coverage in PR #53; only the
    visual layout row remains a manual pass)
-   **Phase 05** — writable bibliography REST/Abilities design (memo complete;
    implementation deferred)
-   **Phase 06** — CI optimization (strategy sketch only, never planned into
    executable tasks; out of scope until prioritized)
-   **Phase 07** — free-text embedded-identifier resolution, Tier 1 (**complete**;
    verifier passed 13/13, in PR #52, not yet merged)

**Note:** the current public release baseline is `v1.4.1` (tags through `v1.4.0`,
`v1.4.1`). The GSD milestone label still reads `v1.3` and is stale relative to the
1.4.x line; reconcile it when the milestone is formally rolled.

## Phase detail

### 3. Multi-style foundation and Chicago default realignment

-   Confirm the intended default style as **Chicago Notes-Bibliography**
-   Keep **Chicago Author-Date** as a supported alternate Chicago mode
-   Update spec, README, tests, fixtures, and UI copy to stop assuming
    Author-Date as the baseline
-   Make style family behavior first-class in the style registry:
    -   `notes`
    -   `author-date`
    -   `numeric`
-   Verify bibliography sort behavior by style family
-   Verify formatter wiring for bundled Chicago templates

### 4. Core multi-style bibliography support

Ship and validate the most important broadly used bibliography styles:

-   Chicago Notes-Bibliography
-   Chicago Author-Date
-   APA 7
-   MLA 9
-   Harvard
-   Vancouver
-   IEEE

Acceptance goals:

-   selectable styles in the editor
-   style-specific bibliography formatting
-   style-specific list semantics (`ul` vs `ol`)
-   style-specific sorting where needed
-   style switching that preserves `displayOverride`
-   save output remains static and valid across style changes
-   keep save/output behavior valid across the full core style set
-   add remaining spec-strength tests, especially around:
    -   corporate-author sorting edge cases
    -   lang omission/save behavior in more combinations
    -   review-record DOI fixtures
-   document the current supported input/style matrix so expectations are clear
    while multi-style support expands

### 5. Remaining specialized style support

Add styles that are important but more specialized or region/domain specific:

-   OSCOLA
-   ABNT

Acceptance goals:

-   style-specific bibliography parity for common source types
-   tests and fixtures for legal and regional edge cases
-   no regression in existing core-style behavior

## Style-track priorities

### Default / primary style

1. Chicago Notes-Bibliography

### Core supported styles

2. Chicago Author-Date
3. APA 7
4. MLA 9
5. Harvard
6. Vancouver
7. IEEE

### Specialized / follow-on styles

8. OSCOLA
9. ABNT

## Product direction notes

-   The plugin should be treated as a **multi-style scholarly bibliography
    platform**, not a Chicago-only formatter.
-   Style behavior includes more than visible citation text:
    -   bibliography formatting
    -   sort rules
    -   list semantics
    -   future inline citation mode
    -   validation expectations
-   The default-style migration should proceed only after the docs/spec/test
    baseline clearly reflects the intended Chicago Notes-Bibliography default.

## Export backlog

Future export work should prioritize practical download/use cases over
additional invisible metadata layers:

Manual Zotero/Mendeley testing confirms this direction. Zotero documents broad
translator/import support, including RDF, CSL-JSON, BibTeX, BibLaTeX, RIS, MODS,
and COinS-derived web metadata. Mendeley documents a narrower web-importer
priority order: DOI and publisher/header metadata first, with COinS treated as a
legacy last-resort path. On the Studio sample page, Mendeley imports the
DOI-bearing journal article but misses the non-DOI thesis even though COinS,
JSON-LD, and CSL-JSON are present in the static bibliography output. Prefer
visible export affordances and direct files over adding more hidden body-level
metadata. Consider page-head Highwire/`citation_*` metadata only for future
single-work pages where page-level metadata is semantically correct; it is not a
clean fit for multi-entry bibliography blocks.

Completed:

1. **CSL-JSON export**
2. **BibTeX export**
3. **RIS export**
4. **BibLaTeX export** — ships as "Download BibLaTeX" in the inspector Exports
   panel; uses `@citation-js/plugin-bibtex` `biblatex` format; outputs `date`,
   `journaltitle`, and full Unicode natively; filename is
   `bibliography.biblatex.bib` to distinguish from the BibTeX download.

Planned:

5. **Frontend Cite / Export affordances** — add optional Scholar-like controls
   on the public bibliography output so readers can open/copy/download citation
   data as BibTeX, RIS, and CSL-JSON. Preserve static save output and keep the
   no-JS bibliography readable; use progressive enhancement or REST export
   variants only where they do not undermine plugin-deactivation resilience.
6. **BibLaTeX import** — `@citation-js/plugin-bibtex` already parses BibLaTeX;
   wire into the parser/paste flow for completeness.

Deferred / demand-gated:

-   **EndNote XML** — consider export only if EndNote/Mendeley testing shows
    RIS/BibTeX are insufficient; treat as medium/low priority because EndNote
    describes the XML format as proprietary and primarily for EndNote-to-EndNote
    transfer.
-   **NBIB / MEDLINE** — consider import after PMID support if biomedical users
    request batch PubMed workflows; defer export unless there is clear demand.
-   **CIW / Web of Science tagged** — defer until bibliometrics/Web of Science
    users request it; Web of Science already offers RIS/BibTeX paths that the
    plugin supports.
-   **ENL** — keep unsupported; it is an EndNote library/database format rather
    than a clean web bibliography interchange format.

These exports complement the existing metadata-output toggles by giving users
tangible bibliography data files they can download and reuse directly.

## Identifier input and metadata-resolution backlog

Future identifier support should be implemented as a resolver layer, not as
format-specific parser hacks. Each resolver must validate the identifier before
making outbound requests, use fixed upstream hosts or vetted provider adapters,
avoid SSRF-prone arbitrary URL fetches, normalize results to CSL-JSON, and keep
CSL-JSON as the source of truth for save output, exports, JSON-LD, COinS, and
CSL-JSON script blocks.

| Identifier            | Status                       | Evaluation                                                                                                                                                                                                                                                         |
| --------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **ISBN-10 / ISBN-13** | Planned support              | High-value next book/monograph importer. Accept `ISBN:` prefixes plus bare, hyphenated, or spaced ISBNs; validate ISBN-10/ISBN-13 checksums before lookup; evaluate metadata providers and terms before choosing a resolver.                                       |
| **PMCID**             | Planned support              | Strong biomedical follow-up to PMID. Resolve through the same authenticated WordPress REST proxy pattern; prefer NCBI-derived CSL/PMID/DOI metadata when available.                                                                                                |
| **arXiv ID**          | Planned support              | High-value scholarly preprint importer. Accept modern and legacy arXiv identifiers; resolve through arXiv metadata APIs; map to CSL article/report-ish records while preserving DOI/journal data when present.                                                     |
| **ISSN**              | Evaluate                     | Identifies a serial, not a specific cited work. Useful for journal/periodical enrichment and validation, but should not create a standalone bibliography entry unless paired with article-level metadata.                                                          |
| **URL**               | Evaluate                     | Useful but risky and unreliable. Consider after fixed-host identifiers; require strict timeout, content-type, size, redirect, and allowlist/denylist controls; prefer standards-based metadata (`citation_*`, Open Graph, JSON-LD, COinS) over arbitrary scraping. |
| **OCLC / WorldCat**   | Evaluate                     | Useful for library/book workflows and edition disambiguation. Needs API/access/licensing review and careful mapping from edition/work records to CSL `book`.                                                                                                       |
| **ORCID**             | Evaluate as enrichment only  | Identifies people, not publications. Useful for author enrichment and disambiguation in manual/resolved records, but not a standalone citation import path.                                                                                                        |
| **ISRC**              | Evaluate niche media support | Identifies sound recordings. Could map to CSL `song`/audio records if a reliable resolver is available; lower priority than scholarly text identifiers.                                                                                                            |
| **ISWC**              | Evaluate niche media support | Identifies musical works/compositions. Potentially useful for music scholarship; resolver availability and CSL mapping need investigation.                                                                                                                         |
| **ISAN**              | Evaluate niche media support | Identifies audiovisual works. Could support film/media bibliographies; requires resolver and CSL `motion_picture`/broadcast mapping review.                                                                                                                        |
| **EIDR**              | Evaluate niche media support | Identifies movies/TV and related audiovisual assets. Similar to ISAN; useful for media studies if resolver access and metadata quality are acceptable.                                                                                                             |

## Performance hardening track

Grounded in the 2026-04-04 Xdebug/profile review:

Completed on 2026-04-04 / 2026-04-05:

-   batched duplicate editor-side CSL formatting requests behind a shared
    formatter path
-   deferred eager formatting during paste/import so parsing can finish before
    formatting work begins
-   added a repeatable local benchmark harness (`npm run benchmark:perf`) with
    cold-cache import/style-switch/manual-entry timings

Ongoing performance watchpoints:

1. keep `build/index.asset.php` lean
2. rerun the benchmark harness after major formatter or parser changes
3. use caller-owned / opt-in formatting responsibility as the default model for
   any new parser-adjacent work

### Citation-citeproc investigation and load-strategy reduction

The next performance-planning task is explicitly an investigation phase, not an
immediate rewrite. It should:

-   build a module inventory for `citation-citeproc.js`
-   document every runtime path that triggers it
-   identify which paths could defer citeproc later
-   identify which non-final interactions might avoid citeproc entirely
-   decide whether load-strategy tuning is sufficient before considering deeper
    formatter architecture changes

The expected outcome is a recommendation memo, not a premature library swap.

Investigation outcome on 2026-04-05:

-   `citation-citeproc.js` is effectively the upstream `citeproc_commonjs.js`
    payload
-   caller-owned / opt-in formatting responsibility has now landed in
    `parsePastedInput()` as the default behavior
-   deeper formatter architecture changes are not justified yet

### Performance/stability remediation update — 2026-05-11

Historical planning is archived in
`docs/planning/archive/performance-stability-remediation-plan.md`
and executed through
`.planning/archive/phases/02-performance-stability-remediation/02-PLAN.md`.

Implementation status: committed (`3d5d3de` "stabilize bibliography formatter
workflows", `539b6b3` "address stabilization review notes") and shipped in the
1.3.x release line. The current public release baseline is now `v1.4.1`.

Completed Phase 2 outcomes:

-   The hidden 51-entry formatter cliff is replaced by an explicit 50-total-
    citation policy for 1.x, with editor guards and spec/test coverage.
-   Formatter fallback output no longer poisons successful-format caches.
-   Manual add formats the merged bibliography once in the common path.
-   Paste/import, manual add, delete, style switch, and structured edit share
    latest-operation protection.
-   Benchmarks now detect fallback, report cold/warm and p50/p95 timings, and
    report build footprint.
-   Release packaging prunes non-runtime vendor dead weight and includes the new
    `includes/` runtime module.
-   PMID success/not-found responses and avoidable duplicate DOI work are
    cached/reduced without widening arbitrary-fetch behavior.
-   Formatter caching remains conservative: persistent object cache only on the
    server, bounded hash/byte-budget cache keys in the editor.
-   Maintainability splits landed for paste/import, manual-entry,
    clipboard/export, PMID resolver/caching, and free-text author parsing.

Current fix priority:

1. Keep release, WordPress.org SVN, and Playground demo behavior aligned after
   any DOI/PMID/BibTeX import change.
2. Keep optional deeper splits as follow-up only if review finds a concrete
   blocker.
3. Resume new development: frontend Cite/Export controls,
   writable REST/Abilities design, and language-pack expansion.

## WordPress.org asset follow-up

Completed:

-   added WordPress.org banner assets from the approved banner image in
    `.wordpress-org/`

Completed:

-   added WordPress.org plugin-directory screenshots in `.wordpress-org/`

Low-priority polish:

-   align screenshot order in `README.md` and `readme.txt` so both readmes show
    the front-end bibliography output first and the editor-with-citations
    screenshot second
-   keep later screenshot captions/order consistent between GitHub and
    WordPress.org whenever screenshots are refreshed
-   add localized WordPress.org banner variants (`banner-772x250-{locale}.png`
    and `banner-1544x500-{locale}.png`, including RTL where useful) after
    localized branding/copy and official language-pack availability justify them

## Compatibility and runtime coverage backlog

Completed:

-   expanded the GitHub Actions runtime matrix across additional
    Apache/Nginx/PHP/WordPress combinations
-   added an Apache/PHP 8.3/latest-WordPress Multisite runtime smoke lane with
    network activation and artifact capture

Planned next:

-   keep runtime lanes stable and add new coverage only when compatibility risk
    justifies it
-   consider a SQLite lane if a concrete compatibility risk appears

## WordPress.org launch status

Completed release and launch work:

1. **Codecov badge** — badge resolves and CI upload is wired.
2. **Playground** — the published Playground link installs the plugin from the
   latest GitHub Release artifact.
3. **Plugin-directory assets** — banner, icon, and screenshots are present in
   `.wordpress-org/`.
4. **Release asset** — `borges-bibliography-builder.zip` is the canonical
   first-release asset for the `v1.0.0` GitHub Release.
5. **Public WordPress.org deployment** — `1.0.0` is live at
   `https://wordpress.org/plugins/borges-bibliography-builder/`.

Submitted 2026-04-11. Approved and deployed 2026-05-04.

Current operational note (2026-05-04):

-   `main` CI was restored to green after the branding/changelog cleanup.
-   GitHub repository branding is `dknauss/Borges`; WordPress.org release
    packaging remains normalized around `borges-bibliography-builder.zip`.
-   The first public WordPress.org release does not need a transition zip.
-   Post-launch cleanup should keep GitHub README, WordPress.org `readme.txt`,
    SPEC, release assets, and SVN output aligned.

## Immediate next-task priorities (2026-05-11)

1. **Keep CI/runtime compatibility hygiene green**
    - monitor release-package output, WordPress.org artifact alignment, PHP
      deprecations in citeproc-php, and runtime smoke lanes
2. **Keep Playground import coverage representative**
    - maintain DOI, DOI batch, PubMed/PMID, and mixed DOI + PMID + BibTeX
      coverage when demo starter content changes
3. **Resume interoperability enhancements**
    - frontend Cite/Export affordances are the next feature track
    - writable REST/Abilities needs a design memo before implementation
4. **Defer low-priority expansion work until the next focused pass**
    - language-pack expansion, optional accessibility tooling integration, and
      localized banner variants remain backlog items

## Code quality backlog

Identified in the 2026-04-08 post-release review.

Completed in the 2026-05-04 post-launch cleanup:

-   consolidated `getPrimaryIdentifierValue` into `src/lib/csl-utils.js` with
    shared tests
-   upgraded the formatting cache from FIFO eviction to simple LRU semantics
-   renamed/documented the export and sorter year helpers so their missing-date
    semantics are clear at call sites

Remaining non-blocking maintainability items:

-   continue module-scope i18n and prop-drilling cleanup where it buys
    testability or clarity
-   review corporate-author sorting behavior for records that include both
    `family` and `literal`, and add fixture coverage if needed

## Backlog / architecture investigations

### Translation and language-pack backlog

Current status as of 2026-06-14:

-   English (US) is the plugin source language and is not counted by
    WordPress.org as a translated locale.
-   The live WordPress.org plugin page is the canonical public source for
    official generated language packs. At the 2026-06-14 audit it reported one
    translated locale and showed English (US) plus Russian in the Languages
    list.
-   The repository/package includes seed PO/MO files for translator review and
    import in `fr_FR`, `de_DE`, `nl_NL`, `sv_SE`, `es_ES`, `it_IT`, `pt_PT`,
    `pl_PL`, `ru_RU`, `ja`, `zh_CN`, `ko_KR`, `sr_RS`, `hr`, `pt_BR`, `hi_IN`,
    `bn_BD`, `ta_IN`, and `te`. These are not the same as official WordPress.org
    language-pack availability.
-   The 2026-06-14 i18n refresh regenerated the POT from current PHP, JS, and
    block metadata, then merged all 19 seed PO files and rebuilt all 19 MO files.
    The current POT has 93 non-empty source strings. Seed translations remain
    partial/import material with fuzzy or untranslated entries pending review.
-   Official language packs are generated from translate.wordpress.org only
    after the Stable plugin translations are approved/current for a locale. The
    first pack for a plugin/theme locale requires the Stable sub-project to
    reach the WordPress.org approval threshold.

Planned language-pack work:

1. **Keep i18n artifacts current with source strings** — regenerate the POT and
   merge/rebuild seed PO/MO files whenever PHP, JS, or block metadata strings
   change; generate/verify JS JSON translation files only if bundled
   translations are intentionally shipped for a locale. `npm run lint:i18n`
   guards the checked-in POT/PO/MO set and stale availability wording in CI.
2. **Maintain bundled-vs-official translation policy** — prefer WordPress.org
   language packs as the public availability signal; keep bundled PO/MO files
   only as seed/import material unless there is a strong support reason to ship
   reviewed local translations.
3. **Prioritize official language-pack expansion** — pick a small first wave
   rather than trying to complete all 19 seed locales at once.
4. **Coordinate approval path** — work through locale teams/PTEs, or request the
   appropriate PTE/CLPTE workflow for professionally reviewed translations. Do
   not submit unreviewed machine translations.
5. **Document availability accurately** — keep GitHub and WordPress.org readmes
   pointing to the live WordPress.org Languages list and translate.wordpress.org
   project status.

Recommended first-wave official locale candidates, balancing existing seed
files, WordPress usage, and likely academic/research audiences:

-   `fr_FR`
-   `de_DE`
-   `es_ES`
-   `pt_BR`
-   `ja`

Additional backlog candidates after the first wave:

-   `it_IT`
-   `nl_NL`
-   `pl_PL`
-   `zh_CN`
-   `ko_KR`
-   `sv_SE`
-   `ar`
-   `tr_TR`
-   `id_ID`
-   `he_IL`
-   `vi`
-   `uk`
-   `ro_RO`
-   `cs_CZ`

### Writable bibliography API and Abilities integration

Explore a future enterprise/automation track for authenticated remote
bibliography management across posts, sites, or Multisite networks.

Potential value:

-   remote citation cleanup and DOI normalization across a large publication
    network
-   editorial tooling that can add, update, remove, reorder, or reformat
    bibliography entries without opening each post manually
-   AI-assisted citation management through discoverable, schema-described
    WordPress Abilities
-   network-scale auditing of duplicate, incomplete, or malformed citation data

Architecture constraints:

-   Borges bibliography data is stored in static block markup inside
    `post_content`; a write path must update both block attributes and saved
    static output
-   index-based bibliography targeting is too fragile for mutation; writable
    routes need stable `bibliographyId` and citation IDs
-   every mutation must parse blocks, validate CSL-JSON, regenerate
    formatted/static output, serialize blocks, and save via WordPress
    revision-aware APIs
-   use optimistic locking, such as expected post modified date, content hash,
    or revision ID, to avoid overwriting concurrent editor changes
-   require `edit_post` or a dedicated capability for all mutations; do not
    expose public write routes
-   preserve plugin-deactivation resilience: the frontend bibliography remains
    readable after every remote write

Phased approach:

1. **Read/validate/preview first** — validate citation payloads, preview
   formatting, return diffs, and export data without writing.
2. **Controlled writes later** — add authenticated
   add/update/remove/reorder/reformat endpoints only after static-output
   regeneration and revision behavior are proven.
3. **Abilities integration** — feature-detect the WordPress Abilities API and
   register AI/automation-facing abilities only when available, preserving
   WordPress 6.4+ compatibility.

Candidate REST routes:

-   `POST /bibliography/v1/posts/{post_id}/bibliographies/{bibliography_id}/preview`
-   `PATCH /bibliography/v1/posts/{post_id}/bibliographies/{bibliography_id}`
-   `POST /bibliography/v1/posts/{post_id}/bibliographies/{bibliography_id}/citations`
-   `PATCH /bibliography/v1/posts/{post_id}/bibliographies/{bibliography_id}/citations/{citation_id}`
-   `DELETE /bibliography/v1/posts/{post_id}/bibliographies/{bibliography_id}/citations/{citation_id}`

Candidate Abilities:

-   `borges/get-bibliographies`
-   `borges/export-bibliography`
-   `borges/validate-citations`
-   `borges/preview-bibliography-update`
-   `borges/apply-bibliography-update`
-   `borges/add-citation`
-   `borges/update-citation`
-   `borges/remove-citation`
-   `borges/reformat-bibliography`

Status:

-   backlog architecture investigation
-   do not include in the current post-launch cleanup phase
-   prefer a design memo before implementation because this changes Borges from
    read-mostly output tooling into remote content management infrastructure

### Option B: citation child blocks

Explore a future architecture where each citation becomes a child block instead
of an item in a parent `citations` array.

Potential benefits:

-   more Gutenberg-native item selection and toolbars
-   block-editor history/undo may align better with citation-level delete/edit
    actions
-   clearer List View representation for individual citations

Known costs and risks:

-   major data-model refactor
-   parent/child coordination for sorting, deduplication, and style switching
-   save/migration complexity for JSON-LD, COinS, CSL-JSON, and static
    bibliography output
-   likely requires a dedicated migration phase rather than an incremental UI
    tweak

Status:

-   backlog only
-   do not start before current single-block UX, sorting, and multi-style
    behavior are stable

### Input workflow progress

Completed in manual-entry v1:

-   added an alternate **Manual entry** mode alongside the default paste/import
    flow
-   kept paste/import as the default path; manual entry remains a secondary
    input path
-   shipped v1 with the current 8 structured fields plus a required Publication
    Type selector
-   used this curated v1 type list: book, journal article, chapter, edited
    collection, thesis / dissertation, webpage
-   required only title + type in v1; all other fields remain optional
-   created canonical CSL directly from the manual form, then formatted, sorted,
    and style-switched through the existing citation pipeline

Follow-on hardening:

-   add broader save-path/output coverage for manual citations where helpful
-   evaluate bundle-size impact from manual-entry formatting imports and
    optimize if needed

### Editor and formatting maintainability follow-ups

Track the following as non-blocking cleanup / maintainability work:

-   evaluate whether module-scope `__()` calls should be moved behind functions
    for better test portability and i18n initialization safety
-   reduce prop drilling into `CitationEntryBody`, likely by grouping
    callbacks/state or introducing a narrower editing/actions interface
-   review corporate-author sorting behavior for records that include both
    `family` and `literal`, and add fixture coverage if needed
-   evaluate a later semantic enhancement to wrap visible bibliography authors
    individually in HTML; JSON-LD and CSL-JSON already preserve separate author
    objects, while COinS currently flattens to first-author fields only
-   keep the current native Gutenberg notification split: block-local inline
    notices for contextual validation and mixed-result feedback, with
    block-local snackbars reserved for pure success states
-   low-priority follow-up: periodically verify accessibility of the
    citation-row interaction model (click-to-edit, row action reveal, focus
    recovery) as Gutenberg/editor behavior evolves
-   low-priority follow-up: add a soft compatibility layer for Troy Chaplin's
    Block Accessibility Checks framework so bibliography-specific authoring
    guidance can appear in the editor when that plugin is present, without
    making it a hard dependency
-   low-priority follow-up: reconsider global snackbars for pure success-only
    cases if future UX testing shows they improve clarity without weakening
    block-local validation feedback

### Metadata output progress

Completed:

-   kept **JSON-LD** enabled by default
-   made **COinS** opt-in
-   made **CSL-JSON** opt-in
-   exposed metadata layers as explicit user-selectable output controls

### Completed hardening work (2026-04-03 / 2026-04-04)

-   enabled Harvard, Vancouver, IEEE, and MLA 9 as selectable core styles
-   shipped per-entry Copy citation actions in the editor
-   shipped a Copy bibliography action in the editor
-   shipped read-only bibliography REST endpoints for programmatic access
-   added formatter coverage for Harvard, Vancouver, IEEE, and MLA 9
-   shipped OSCOLA as the first remaining specialized legal style
-   shipped ABNT as the current specialized regional style
-   added save-path coverage for manually entered citations and metadata-layer
    toggles
-   optimized manual-entry formatting import so the main editor entrypoint stays
    small

-   synced `SPEC.md`, `README.md`, QA checklists, and planning docs with the
    current implementation
-   reduced persisted citation payload for new entries by dropping `inputRaw`,
    `parsedAt`, and `parseConfidence`
-   improved batch DOI performance with bounded-concurrency parsing while
    preserving stable result ordering
-   tightened CSL field validation for additional scalar and structured fields
-   improved JSON-LD typing for literal-only corporate/institutional authors so
    they can emit `Organization`

### Phase 1: Post-launch cleanup and documentation polish

-   **Goal:** Bring docs, planning state, compatibility wording, release tooling,
    and small maintainability items into alignment now that `1.0.0` is live on
    WordPress.org.
-   **Requirements:** post-launch status cleanup; reciprocal
    GitHub/WordPress.org links; Playground demo link evaluation; detailed GitHub
    REST API docs; screenshot order alignment; SPEC testing-gap cleanup;
    WordPress 7.0 compatibility wording; manual deploy trigger; small
    helper/cache refactors.
-   **Depends on:** WordPress.org `1.0.0` publication.
-   **Plans:** 1 plan.

Plans:

-   [x] `.planning/archive/phases/01-post-launch-cleanup-and-documentation-polish/01-PLAN.md`
    — post-launch cleanup and documentation polish

### Phase 2: Performance and stability remediation

-   **Goal:** Remove the hidden 51-entry formatter cliff and harden
    editor/formatter behavior before broader feature work.
-   **Requirements:** total bibliography size policy; fallback cache correctness;
    manual-entry single-format path; latest-operation guards across async editor
    flows; authoritative benchmarks; release-package pruning; PMID/DOI network
    hardening; cautious formatter/cache improvements.
-   **Depends on:** post-launch cleanup baseline and current 2026-05-09
    performance/stability review.
-   **Plans:** 1 plan.

Plans:

-   [x] `.planning/archive/phases/02-performance-stability-remediation/02-PLAN.md`
    — performance and stability remediation (committed in `3d5d3de`, `539b6b3`)

### Phase 3: 1.3.x release prep

-   **Goal:** Ship the Phase 2 stabilization work and follow-up DOI Playground
    fixes as versioned releases so WordPress.org users receive the explicit
    50-citation total cap, async stale-result guards, manual-entry
    single-format path, smaller release zip, PMID/DOI network hardening, and
    reliable DOI imports in browser-based WordPress Playground.
-   **Requirements:** maintain package/header/readme version alignment, write
    changelog entries for each 1.3.x release, package the release ZIP, publish
    the GitHub Release, and deploy the WordPress.org SVN release.
-   **Depends on:** Phase 2 committed to `main`.
-   **Plans:** 1 plan.

Plans:

-   [x] `.planning/archive/phases/03-1-3-0-release-prep/03-01-PLAN.md` —
    1.3.x release prep; current public baseline is now `v1.4.1`

### Phase 4: Frontend Cite/Export affordances

-   **Goal:** Add optional Scholar-style citation and export controls to the
    public bibliography output so readers can copy or download individual
    citations as BibTeX, RIS, and CSL-JSON without requiring plugin activation
    on the frontend. Preserve the static-save, zero-JS architecture as the
    baseline; enhancements are progressive.
-   **Requirements:** per-entry Cite and Export affordances visible on the
    saved bibliography; at minimum BibTeX, RIS, and CSL-JSON download targets;
    no JS required for the readable bibliography itself; no regression in
    plugin-deactivation resilience or static-save contract.
-   **Depends on:** Phase 3 released.
-   **Plans:** 4 plans (all complete).
-   **Status:** **shipped** in 1.4.x (merged via PR #37 `3995d14`, plus follow-up
    fixes such as #47). Deterministic frontend behavior now covered by the E2E
    spec in PR #53; the visual layout row remains a manual pass.

Plans:

-   [x] 04-01-PLAN.md — foundation: outputCiteExport attribute, cslToRisEntry export, deprecated entry
-   [x] 04-02-PLAN.md — save markup: <details> disclosure panels with RIS/CSL-JSON/BibTeX/BibLaTeX data URI links
-   [x] 04-03-PLAN.md — editor pre-computation of BibTeX and BibLaTeX per-citation export strings
-   [x] 04-04-PLAN.md — CSS reset for hanging-indent, editor inspector toggle, human verification
