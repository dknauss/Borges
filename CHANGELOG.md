# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add a second WordPress Playground demo that boots the current `main` branch build, alongside the existing released-version demo. CI publishes the freshly built plugin to a rolling `main-preview` pre-release so live Playground has a stable, CORS-reachable URL for main HEAD; the README exposes both as separate Playground badges.
- Add a scheduled Demo Link Monitor (`demo-links.yml` / `npm run test:demo-links`) that verifies each Playground blueprint's install URL stays reachable and guards against reintroducing the hosted-browser-broken `git:directory` resource.

## [1.4.2] - 2026-06-21

### Added

- Resolve DOI and labeled PMID identifiers embedded in free-text citation pastes through the existing CrossRef and PubMed resolver paths.
- Add free-text sample documentation for supported embedded DOI/PMID citation inputs.

### Changed

- Fall back from embedded-identifier resolution to the heuristic free-text parser before showing unsupported-input guidance.
- Make Codecov patch coverage informational while keeping the project coverage gate.

### Fixed

- Stabilize numeric citation reorder E2E coverage against editor readiness races.
- Clarify that RIS is supported for export, not import.

## [1.4.1] - 2026-06-20

### Added

- Clean up after the plugin on uninstall: deleting the plugin now removes its cached data — the `bbb_` formatter and PubMed/PMID transients in the options table (swept across all sites on multisite) and the object-cache groups when the backend supports group flushing. Bibliography blocks stored in your posts are user content and are left untouched.

## [1.3.4] - 2026-06-14

### Changed

- Review and update repository docs for the current DOI resolver path, PubMed/PMID support, Playground blueprint install behavior, runtime matrix coverage, and maintenance planning state.
- Bump development dependency lockfile coverage for `shell-quote` and `webpack-dev-server`; document/dismiss remaining transitive development-only Dependabot alerts where no safe compatible patch is currently available.
- Refresh the POT plus 19 seed PO/MO locale pairs from current source strings, clarify translation coverage docs, and archive historical planning docs out of active planning paths.

### Internal

- Add an i18n artifact validation command and CI gate so POT, PO, MO, and public language-pack wording stay aligned.

## [1.3.3] - 2026-05-11

### Fixed

- Restore DOI imports in browser-based WordPress Playground by resolving DOI metadata through CrossRef's CORS-friendly CSL transform endpoint instead of relying on `doi.org` content negotiation redirects.
- Keep DOI lookups serialized so pasted DOI batches respect CrossRef's public concurrency limit.

### Changed

- Add a PubMed/PMID sample (`PMID:26673779`) to the Playground starter content alongside DOI and BibTeX examples.

## [1.3.2] - 2026-05-10

### Added

- Block Accessibility Checks (BAC) optional compatibility layer: soft-detects the Block Accessibility Checks plugin and registers four editor checks (empty bibliography, missing heading, raw URL link text, all metadata outputs disabled). Borges continues to work normally when BAC is absent.
- Stable `bibliographyId` block attribute and per-citation `id` field — groundwork for the writable bibliography REST API (M0).

### Changed

- Harden E2E plugin-row locator in Playwright specs to exclude WordPress update notice rows, fixing Playwright strict-mode violations in CI.
- Regenerate POT with 81 msgid entries (up from 41); new strings include PHP formatter/PMID error messages, BAC check strings, BibLaTeX export labels, and citation reorder controls.
- Extend `generate_brand_assets.py` with `--locale` and `--all-locales` flags for generating localised WordPress.org banner variants.

### Docs

- Add `docs/i18n-process.md`: POT regeneration, MO compilation, JS JSON artifact guide, bundled-vs-official pack policy.
- Add `docs/a11y-audit-records/1.3.1.md`: Tier 1 and Tier 2 accessibility audit record; all automated checks green.
- Add `.planning/phases/05-writable-bibliography-rest/05-DESIGN-MEMO.md`: five-tier writable REST API design with ETag concurrency, capability matrix, and companion-plugin recommendation.

## [1.3.1] - 2026-05-10

### Added

- Bibliographies between 100 and 199 citations now show a dismissible editor notice warning that formatting may be slower on shared hosting.

### Changed

- Per-bibliography hard cap raised from 50 to 200 citations. The 50-entry per-paste limit is unchanged.

## [1.3.0] - 2026-05-09

### Added

- Explicit 50-citation total cap per bibliography block with inline editor warnings, replacing the silent 51-entry formatter cliff.
- Guard all async editor mutation flows (paste/import, manual add, delete, style switch, structured edit) against stale results from superseded in-flight format requests.
- Cache successful PMID proxy responses and deduplicate pending DOI resolution requests to reduce avoidable network traffic.

### Changed

- Removed redundant formatter call in the manual-entry add path; the merged bibliography is now formatted once instead of twice.
- Pruned non-runtime vendor documentation and images from the release zip and excluded `composer.lock`, reducing release package weight.

### Internal

- Refactored editor side-effects into focused hooks: `useCitationImportActions`, `useManualCitationActions`, and `useBibliographyExportActions`.
- Extracted PHP PMID resolver, cache, and permission logic into `includes/pmid.php`.

## [1.2.0] - 2026-05-08

### Added

- BibLaTeX export is available from the editor exports panel for LaTeX/Biber workflows with full Unicode support.
- PMID input resolution imports PubMed records through the authenticated WordPress REST proxy to the NCBI/PMC Literature Citation Exporter API.
- Numeric citation styles now support manual reordering, including visible move controls and keyboard Alt+Arrow movement.
- New bibliography blocks get style-aware default headings.

### Changed

- Citation mutations now reformat the full bibliography so cached display text, sort order, and metadata stay aligned after edits, deletes, style changes, and structured updates.
- Sorting now uses explicit style-family dispatch, author-date solo-first ordering, contributor-chain tie-breaks, and numeric no-op ordering where appropriate.
- OSCOLA users now see an editor notice explaining the current single-list limitation for grouped bibliographies.
- Readmes and release notes now highlight the 1.2.0 interoperability features, recent 1.1.x accessibility fixes, and ABNT (Associação Brasileira de Normas Técnicas) support targeting NBR 6023:2018.

### Fixed

- PMID resolution now uses an authenticated WordPress REST proxy so PubMed imports work in browsers despite NCBI's missing CORS headers.
- Saved citation URL links and block toolbar controls now expose clearer accessible names.
- Playwright accessibility and Playground smoke tests are more deterministic on GitHub Actions by selecting the block explicitly and serializing tests that share one Playground server.

### Internal

- Added JS/PHP sort-coordination fixtures, citeproc cross-runner conformance checks, targeted Codecov warning coverage, and locale/lock parity audit tests.
- Added compact matrix tests for all nine style save semantics, all nine formatter outputs, export ordering for author-date versus numeric styles, and PMID REST proxy regression coverage before tagging 1.2.0.

## [1.1.1] - 2026-05-07

### Fixed

- Block Accessibility Checks (BAC) integration shipped in 1.1.0 was registered against an outdated Block Accessibility Checks API and did not load reliably. The plugin now registers against the current BAC API, hardens the soft opt-in, and loads validation checks reliably so the `empty_bibliography` error and `heading_missing` warning checks fire as documented when the BAC plugin is active.
- Editor focus-ring regression in `editor.scss` is corrected so keyboard focus on entry actions remains visible.
- Playground demo blueprint installs the plugin from the latest release zip rather than a path that could become stale.

### Internal

- Test infrastructure improvements for BAC and a11y Playwright suites: deterministic setup, robust selectors, fixed strict-mode violations, and extended Tier 2/3 audit coverage. No functional change.
- Added internal sort-conformance development plan to `docs/planning/sort-conformance-plan.md` for upcoming sort-correctness work.

## [1.1.0] - 2026-05-04

### Added

- Block Accessibility Checks (BAC) integration as a soft dependency. When Troy Chaplin's Block Accessibility Checks plugin is active, the bibliography block registers two authoring-time checks: `empty_bibliography` (error — no citations added) and `heading_missing` (warning — no heading set, so screen reader users navigating by landmark heading cannot find the section). No functional change when BAC is not installed.

## [1.0.2] - 2026-05-04

### Fixed

- Explicitly enable Playground `features.intl` in both the GitHub demo blueprint and the WordPress.org Preview blueprint while retaining `phpExtensionBundles: ["kitchen-sink"]`, because the live browser Playground runtime requires the feature flag for `citeproc-php` formatter requests to load PHP `intl` reliably.
- Switch the GitHub demo blueprint to install Borges through the WordPress.org plugin resource instead of a GitHub Release asset URL, avoiding browser CORS failures in live Playground.

### Changed

- Clarify translation documentation so bundled seed PO/MO files are not confused with official WordPress.org language packs.

### Tests

- Add regression coverage that requires both Blueprint files to request `intl` through both supported Playground configuration forms.

## [1.0.1] - 2026-05-04

### Fixed

- Use the WordPress `apiFetch` helper for editor formatter REST requests so authenticated editor sessions include the expected REST nonce handling.
- Add the WordPress.org Playground preview blueprint at `assets/blueprints/blueprint.json` with the `kitchen-sink` PHP extension bundle so the PHP formatter can load `intl` in previews.

## [1.0.0] - 2026-04-07

### Added

- DOI and BibTeX input parsing via citation-js.
- Supported formatted citation input for books, articles, chapters, webpages, reviews, and theses.
- Manual entry with structured fields and per-type validation.
- Nine citation styles: Chicago Notes-Bibliography (default), Chicago Author-Date, APA 7, MLA 9, Harvard, Vancouver, IEEE, OSCOLA, and ABNT (Associação Brasileira de Normas Técnicas) targeting NBR 6023:2018.
- Automatic alphabetical sorting per style rules.
- Duplicate detection across paste and manual entry.
- Static save with semantic HTML (`role="doc-bibliography"`, `<cite>` wrappers, `lang` attributes, and no deprecated bibliography-entry ARIA role in newly saved output).
- Schema.org JSON-LD structured data output (on by default).
- Optional CSL-JSON machine-readable output.
- Optional COinS metadata for citation manager detection.
- Reference-manager friendly metadata and exports for Zotero, Mendeley, EndNote, JabRef, BibDesk, LaTeX, and CSL/citeproc workflows.
- Export: Download CSL-JSON, UTF-8 BibTeX, RIS; copy per-entry or full bibliography.
- Read-only REST API for programmatic bibliography access.
- Editor UI with paste zone, manual entry, per-entry edit/delete, and keyboard accessibility.
- Block-local Gutenberg notices with focus management.
- Structured per-field editing for heuristic or warning-marked citations.
- Lazy-loaded CSL style templates.
- XSS prevention: HTML escaping for citation text, `</` escaping in script blocks, HTML tag stripping from CrossRef metadata.
- Input caps: 50 entries per paste, 1 MB max input size.
- GitHub Actions CI: lint, test, build, PHPUnit, Psalm, CodeQL, Codecov, Playwright Playground smoke tests, runtime matrix.
- Multisite runtime smoke coverage with network activation on an Apache/PHP/latest-WordPress lane.
- Release workflow with tag-triggered GitHub Release and zip artifact, plus WordPress.org release packaging with third-party notices.
- WordPress Playground blueprint for instant evaluation.
- Lifecycle end-to-end tests for activate, deactivate, and delete flows.
- Lifecycle CI coverage.
- Refined WordPress.org branding assets, including updated banner and icon artwork.
- Bundled interface locale files for French, German, Dutch, Swedish, Spanish, Italian, Portuguese, Polish, Russian, Japanese, Simplified Chinese, Korean, Serbian, Croatian, Brazilian Portuguese, Hindi, Bengali, Tamil, and Telugu.
- 25 additional regression tests covering REST defaults, structured-edit cancellation races, focus helper behavior, manuscript/review italics branches, BibTeX aliases, thesis COinS output, and corrected JSON-LD mappings.
- New dedicated hook test files for `use-citation-editor-state` and `use-entry-focus`.
- PHP utility-function tests for REST/export helper behavior, formatter normalization, block collection, and JSON encoding.

### Changed

- Improved reset icon from minus to counterclockwise arrow for clarity.
- BibTeX exports preserve Unicode quotation marks instead of TeX quote ligatures for cleaner Zotero, Mendeley, and BibTeX-family imports.
- `aria-label` on bibliography section now matches custom heading text when set.
- Added an accessible name to citation entry buttons.
- Added `role="region"` and `aria-label` to the editor notice container.
- Added `prefers-reduced-motion` override for action button transitions.
- Added `focus-visible` outline to bibliography list entries.
- Removed the redundant `aria-label` from the inline edit input.
- Aligned WordPress.org-facing package identifiers around the approved `borges-bibliography-builder` slug while preserving the existing block namespace and saved CSS classes for content/theme compatibility.
- Normalized GitHub, Playground, Plugin URI, security-reporting, and language-header URLs around `dknauss/borges-bibliography-builder`.
- Standardized the first public release package on `borges-bibliography-builder.zip` with no transition zip.
- Removed dead exports and branches in the parser and style registry, including the unused `SUPPORTED_INPUT_MESSAGE` re-export and experimental style-picker path.
- Psalm failures now block CI instead of running with `continue-on-error`.
- Playwright smoke tests now use configurable frontend and REST paths through `SMOKE_FRONTEND_PATH` and `SMOKE_REST_PATH`.

### Security

- Overrode the vulnerable transitive development dependency `basic-ftp` to the patched release.

### Fixed

- REST responses now treat `outputJsonLd` as enabled when the attribute is absent from stored block attributes, matching the block default for older or migrated blocks.
- Structured edit cancellation now guards both before and after bibliography formatting resolves, preventing stale formatted data from being committed after a late cancel.
- The PHPUnit `wp_strip_all_tags()` stub now matches WordPress behavior and no longer collapses whitespace, exposing plain-text rendering bugs more accurately.
- `jsonld.js` now maps chapter citations with a container title to `isPartOf: { @type: "Book" }`, and maps `review-book` to `Review`.
- `coins.js` now emits dissertation-specific COinS metadata for thesis citations instead of falling back to the journal format.
- ABNT/NBR 6023:2018 formatter normalization now collapses duplicate page markers such as `p. p.` and `p. pp.`.
