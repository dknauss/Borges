# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Review routes for editors (Phase 05, Tier 1), all read-only and requiring `edit_post`: `GET …/bibliographies/<ref>/validate` reports per-entry CSL-JSON problems (invalid or missing data, missing title, malformed DOI, and warnings for missing author, date, or container title, or an ISBN with no valid checksum); `…/duplicates` lists likely duplicate pairs using the editor's own duplicate rules; `…/preview?style=<key>` shows each entry reformatted in another citation style next to its current text, without saving. `<ref>` is the block index or its stable `bibliographyId`. The routes live in `includes/review.php`.
- Three matching read-only abilities on WordPress 6.9+, with the same `edit_post` requirement: `borges/validate-bibliography`, `borges/find-duplicate-citations`, and `borges/preview-bibliography-style`. Each takes `post_id` and either `index` or `bibliography_id`.
- Stable IDs (Phase 05, Tier 0). The read-only REST collection and single-bibliography routes, and the `borges/get-bibliographies` ability, now report each block's `bibliographyId`, a UUID that stays put when blocks before it are added or removed, as the future write routes will need. It is `null` for a block saved before IDs were assigned (or with an unusable value) until the post is next edited. Every citation already carried an `id`; the editor now guarantees one, unique within its block.

### Fixed

- A bibliography block no longer opens as invalid ("Attempt Block Recovery") when an editor using a different language from the one who saved it opens the post. `save()` used to write the Cite / Export labels ("Cite / Export", "Copy citation", "Copied", "RIS", "CSL-JSON", "BibTeX", "BibLaTeX") and the "Link to publication" link label into post content in the saving editor's language. The editor checks saved markup against `save()` in the *current* editor's language, so the two did not match. Saved markup is now the same in every language: the panel labels are stored in English and translated for visitors by the frontend view script, and a link whose citation has no title or container title carries no `aria-label`, so screen readers announce its visible URL. Existing posts still validate in any language, because the new deprecation reads the labels back from the saved markup. The exception is blocks saved in the oldest markup shapes (before the biblioentry role was removed) that contain a linked URL in a citation with no title or container title: those still validate only in the language they were saved in, as before. They switch to the new markup the next time they are saved. The PHP port of `save()` (`includes/save-markup.php`) matches.
- In all 19 bundled translations, seven strings were compiled as "Add citations" even though they mean something else: "Copy citation", "Copy citation: %s", "Copied citation.", "Edit citation: %s", "Delete citation: %s", "Added 1 citation.", and "Added 1 citation. %s". These were stale fuzzy matches, and `wp i18n make-mo` compiles fuzzy entries. The translations are cleared so these strings fall back to English, and the `.mo` files are rebuilt.
- Pasting a whole reference-manager `.bib` export no longer loses or misreads records:
  - A field containing a blank line, such as a multi-paragraph abstract in a Zotero export, no longer splits its entry in two. Previously the whole record was lost and two errors were shown.
  - `@comment` and `@preamble` blocks, and `%` comment lines outside entries (JabRef's `% Encoding:` header and `jabref-meta` footer), are ignored instead of each producing an error notice.
  - `@string` macros now resolve, so a JabRef entry with `journal = nature` keeps its journal.
- EndNote's BibTeX export writes its reference-type name into `type` (`type = {Journal Article}`), which became CSL `genre` and could print as "Journal Article" or "Book Section" in styles that show genre. Those names are now dropped. Genuine genres such as "Master's thesis" are kept.
- Duplicating or copy-pasting a bibliography block copied its `bibliographyId` and every citation `id`, so two blocks in one post shared an ID and the page carried duplicate `ref-…` element IDs (invalid HTML, and in-page links jumped to the wrong list). The later copy now takes a new block ID and new citation IDs when it is added; the original keeps its own. Citations saved without a usable ID, or with one repeated within the block, get a new one when the post is next edited. These automatic assignments add no undo step.
- Pasting a CSL-JSON (or other JSON) document produced a nonsense webpage citation titled "id". It is now rejected with the standard unsupported-input notice. CSL-JSON remains an export format; the README no longer lists it as pasteable.

### Added

- A reference-manager export corpus (`src/lib/__fixtures__/reference-manager-exports/`) with unmocked tests for Zotero BibTeX and BibLaTeX, Mendeley, EndNote, and JabRef exports and a Zotero CSL-JSON paste. The fixtures are hand-authored models of each manager's export style, to be replaced with real exports as they become available.

### Changed

- Internal: a PHP port of the block's `save()` markup (`includes/save-markup.php`), the groundwork for server-side bibliography writes (Phase 05 M2). It is not called yet. A parity harness (`tests/fixtures/save-parity/`, `SaveMarkupParityTest`, `src/save-parity.test.js`) checks it byte-for-byte against the JS `save()` and the real block validator.
- The single-bibliography route (`GET …/bibliographies/<ref>`) and the `borges/export-bibliography` ability now also accept a block's `bibliographyId` in place of its index. Index requests behave as before; the export ability's output gains `bibliographyId`. Numeric requests are unchanged, including the route's `index` parameter; reads by ID go through a separate route with an `id` parameter.
- An all-digit `bibliographyId` is no longer treated as a stable ID (it would read as an index in `<ref>`): REST output reports `null` for it and the editor replaces it. Review follow-ups: the duplicate check now matches the editor's rules for year types, a year of 0, and a family name of "0"; the ISBN check accepts space-separated lists; the DOI check accepts `doi:` and `www.doi.org` prefixes and dotted registrant codes, and reports an empty DOI as the `empty-doi` warning rather than an error; a blank `literal` or `raw` date now counts as `missing-issued`; and the abilities always look up `bibliography_id` as an ID, never as an index.
- Internal: the PMID, PMCID, arXiv, and ISBN resolvers (route callbacks, provider constants, and NCBI cache helpers) moved from `bibliography-builder.php` into `includes/resolvers.php`, cutting the main plugin file from 2,859 to 1,931 lines. Every function and constant moved verbatim under the same name; route registration and permission callbacks stay in the main file. No behavior change.
- The Playground demo post (release, main-build, and WordPress.org Preview blueprints) now includes PMCID (`PMC3531190`), arXiv (`arXiv:1706.03762`), and ISBN (`ISBN 978-0-14-032872-1`) samples alongside the DOI, PMID, and BibTeX examples, so the identifier types added in 1.6.0 can be tried without looking up an ID.

## [1.6.0] - 2026-09-24

### Added

- BibLaTeX import. BibLaTeX entries (`date`, `journaltitle`, `location`, `urldate`, `@online`, `@report`, `@collection`, and similar) paste through the same path as BibTeX; citation-js already mapped these fields, and a new unmocked test suite (`src/lib/biblatex-import.test.js`) now pins that behavior so a citation-js upgrade cannot silently regress it.
- arXiv preprints pasted as BibTeX or BibLaTeX keep a link: an `eprint` with `eprinttype = {arxiv}` (or BibTeX's `archiveprefix = {arXiv}`) becomes an `https://arxiv.org/abs/…` URL when the entry has no URL of its own. Previously the eprint was dropped. The identifier must match the modern or legacy arXiv ID pattern before a URL is built.
- PubMed Central (PMCID) import. Paste `PMC3531190` or `PMCID: PMC3531190`, alone or one per line alongside DOIs and PMIDs, and Borges resolves it through a new editor-only `GET /bibliography/v1/pmcid/<pmcid>` route that proxies NCBI's fixed PMC citation exporter. Free-text citations that end in a `PMC…` identifier are resolved the same way when they carry no DOI or labeled PMID. The route has the same `edit_posts` requirement, digits-only validation, `wp_safe_remote_get` redirect checks, and success/not-found/failure caching as the PMID route; both now share one NCBI resolver, and PMID behavior, error codes, and cache keys are unchanged.
- arXiv import. Paste `arXiv:1706.03762`, an arxiv.org `/abs/` or `/pdf/` link, or an arXiv DOI (`10.48550/arXiv.1706.03762`), in modern or legacy (`hep-th/9901001`) form, and Borges resolves it through a new editor-only `GET /bibliography/v1/arxiv?id=…` route. The route queries the fixed arXiv API and maps its Atom response to a CSL preprint (type `article`, publisher `arXiv`, number `arXiv:<id>`, the arXiv DOI, and the abstract URL), splitting author display names with particles and generational suffixes kept intact. arXiv DOIs previously went to CrossRef, which does not hold them, and failed. arXiv lookups run one at a time to respect arXiv's request-rate guidance, and an arxiv.org link in free text is recognized only on the real host, not inside a longer hostname such as `evilarxiv.org`. The PMID/PMCID resolver scaffolding now takes a decoder callback so all three share one fetch, cache, and error path.
- Read-only WordPress Abilities (WordPress 6.9+). Borges registers `borges/get-bibliographies`, `borges/export-bibliography` (CSL-JSON or plain text), and `borges/validate-citations` (up to 50 CSL-JSON records, each checked by the formatter's own validator) in a `bibliography` category, discoverable and runnable through `/wp-json/wp-abilities/v1`. They reuse the existing REST routes' data and permission helpers, so no ability exposes more than the matching route; all three are annotated read-only, non-destructive, and idempotent. On earlier WordPress versions nothing is registered.
- ISBN import. Paste `ISBN 978-0-14-032872-1`, `ISBN-10: 0-14-032872-6`, or a bare 978/979 ISBN-13, and Borges resolves the book through a new editor-only `GET /bibliography/v1/isbn/<isbn>` route backed by Open Library (its ISBN edition endpoint for the book record and its search endpoint for author names), falling back to the Google Books API when Open Library has no record or cannot be reached (no account or key for either). A Google Books result is used only if its identifiers contain the requested ISBN, so a near-match search result is never cited. ISBN lookups run one at a time on their own queue, separate from arXiv's, so a large paste does not burst requests at either book service. Checksums are verified in the editor and again on the server before any request, ISBN-10s are converted to ISBN-13 so both forms share one cache entry, and a bare ISBN-10 is never treated as an ISBN because too many ordinary 10-digit numbers pass its checksum. The record maps to a CSL `book` with title and subtitle, authors, publisher, place, year, page count, and ISBN. Free-text citations carrying a labeled ISBN resolve the same way when they have no DOI, PMID, PMCID, or arXiv ID, and fall back to the heuristic parser if the lookup fails.

### Changed

- The paste-box placeholder, the supported-input notice, the LaTeX-detected error, and the block description now list PMCID, arXiv IDs, and ISBNs alongside DOIs, PMIDs, and BibTeX. These are changed source strings: none of the 19 bundled seed locales had translated them, but any official WordPress.org language pack that did will need the new wording re-translated.
- Regenerated the translation template and merged all 19 seed PO/MO files. Beyond the new PMCID strings, the committed POT had fallen behind: it was missing six strings that shipped in 1.5.0 (the CSL field-length error, four Block Accessibility Checks 4.0 messages, and the current plugin description) and still listed 14 strings that no longer exist in the source. No existing translation was lost; every locale keeps the same number of translated strings.
- The External Services sections of `readme.txt` and `README.md`, which WordPress.org requires, now disclose the arXiv API, Open Library's ISBN and search endpoints, and the Google Books API, and note that PMCID lookups use the same NCBI exporter as PMID. They previously listed only Crossref and PubMed.

### Fixed

- BibTeX `language` and BibLaTeX `langid` values were saved verbatim into the bibliography entry's HTML `lang` attribute, so an entry pasted with `langid = {ngerman}` rendered as `lang="ngerman"`, which is not a valid BCP 47 tag and gives assistive technology a language it cannot use. Babel/polyglossia names now map to BCP 47 (`ngerman` → `de`, `british` → `en-GB`); values that are already BCP 47 pass through; anything unmappable is dropped, since an absent `lang` is correct and a wrong one is not. Already-saved entries are unchanged.

## [1.5.1] - 2026-08-19

### Added
- WordPress 7.1 compatibility declaration. Verified against 7.1-RC4: the block
  registers and renders in the always-iframed editor, and CSL formatting was
  exercised through `POST bibliography/v1/format` across five styles with
  `vendor/` present.

### Fixed
- `copyTextToClipboard` reached its `execCommand` fallback only when
  `navigator.clipboard.writeText` was absent, not when it was present and
  rejected. Both "Copy citation" and "Copy bibliography" reported failure in
  that case while an untried option remained.

### Security
- No security content in this release. Dependabot #78 bumped the indirect
  build-tooling packages `brace-expansion` and `ip-address`; neither is a
  runtime dependency and `package-lock.json` is dist-ignored, so nothing from
  it reaches an installed site.

## [1.5.0] - 2026-08-04

### Added

- Add a second WordPress Playground demo that boots the current `main` branch build, alongside the existing released-version demo. CI publishes the freshly built plugin to a rolling `main-preview` pre-release so live Playground has a stable, CORS-reachable URL for main HEAD; the README exposes both as separate Playground badges.
- Add a scheduled Demo Link Monitor (`demo-links.yml` / `npm run test:demo-links`) that verifies each Playground blueprint's install URL stays reachable and guards against reintroducing the hosted-browser-broken `git:directory` resource.
- Add `docs/current-metrics.md`: hand-verified lines-of-code, installed-footprint, and runtime-overhead figures, each paired with the exact command used to re-derive it so the numbers can be re-checked rather than trusted on faith.
- Add a `composer verify:metrics` check (`.github/scripts/verify-metrics.sh`), run in CI, that re-derives the lines-of-code figures in `docs/current-metrics.md` and re-runs the persistence/hook audit, failing when either drifts from the doc. Footprint figures measured with `du` and built-asset byte sizes stay hand-verified, since both vary with the filesystem and toolchain rather than with the repository.
- Add a deprecation regression test that parses committed markup fixtures — one per shipped `save()` shape — through Gutenberg's own block registry and validator, asserting each still validates against the current `save` plus the `deprecated` chain. Breaking a deprecation is how a static-save block turns existing posts into "Attempt Block Recovery", and no unit test of `save()` in isolation can catch it. The fixtures are frozen on disk rather than generated at test time, so editing a deprecation cannot silently rewrite its own expectation.

### Security

- Cap the length of every string in a CSL item sent to the formatter endpoint. Each is run through a looped `wp_strip_all_tags()`, and core's script/style-stripping regex degrades to catastrophic backtracking past roughly 600 KB — measured at ~12.9 seconds of pinned CPU for a 950 KB value of unclosed script tokens. The existing request limit bounds the whole body, so a single value could carry the entire megabyte into that regex, letting any user able to reach the editor hold a CPU core per request. Strings are now rejected above 64 KB, checked once over the whole item before any stripping. The check is deliberately not per call site: stripping is reached from the flat string fields, author name parts, date literal/raw values, and both branches of the string-or-array handler, so a limit on one of them would have left the same cost reachable under a different key.
- Bound the same stripping on the read side, which was the more serious half. `GET /posts/{id}/bibliographies/{index}?format=text` and the formatted-text sanitizer both stripped stored citation text with no limit, so an oversized string saved into a published post made every later read pay ~12 seconds of CPU — on a route that requires no authentication, repeatable at no cost to the caller, and reachable by writing the block markup directly rather than through the formatter. Stored text is now truncated to the same 64 KB bound before stripping; it is not rejected, because refusing to render a bibliography that already exists would break the post rather than protect it.
- Require a post type to be publicly viewable, not merely a published post, before serving its bibliography data without authentication. `publish` status alone was enough, so bibliography blocks stored in a post type registered non-public were readable by anyone — content core's own REST controllers would refuse to expose. Anyone able to edit the post still reaches it.
- Enforce an explicit `http`/`https` allowlist on links generated from citation text. Nothing else prevented a `javascript:` or `data:text/html` href: React does not sanitize href schemes, and the output is baked into `post_content` as static HTML, so the only barrier was the URL-detection pattern happening to require a literal `http(s)://` prefix. Broadening that pattern later — to catch bare `www.`, `doi:`, or protocol-relative `//` — would have silently created a scheme-injection sink. A non-http(s) URL now renders as plain text instead of a link.
- Escape U+2028 and U+2029 in the JSON-LD and CSL-JSON script blocks. Both are legal inside a JSON string, so this is not a cross-site scripting issue — `ld+json` is never executed — but they are line terminators to a JavaScript parser, and a consumer that evaluates the block rather than parsing it would see a broken literal.
- Resolve PubMed/PMID records through `wp_safe_remote_get()` rather than `wp_remote_get()`. The request follows up to three redirects and only the safe variant validates each hop against the site's own network. The PMID is already constrained to digits and the endpoint host is a fixed constant, so the redirect chain was the one part of the request an upstream change could have pointed somewhere unintended.

### Fixed

- The end-to-end test covering the Block Accessibility Checks integration never actually ran. The accessibility Playground environment installed no plugins, so BAC was absent, the test skipped itself, and the suite still reported green — meaning the BAC integration had no end-to-end coverage at all. The environment now installs BAC, and the assertions read the `block-accessibility-checks` data store instead of BAC's markup: v4 replaced the v3 indicator classes the test looked for, and a class-name assertion silently passes once the class no longer exists. Verified in both directions — the test now fails if the editor-side filter is registered under its pre-4.0 name, the exact silent regression BAC's upgrade notes warn about. The test also no longer skips itself in CI: a skip reads as a pass on a green run, which is how it sat dormant in the first place, so an absent BAC now fails the run with a message pointing at the blueprint. It still skips gracefully for local runs without the plugin installed.
- The accessibility suite's publish helper set the post title and published in the same tick. BAC holds an error-level `post_title_required` editor check and locks post saving while the title is empty, so the save raced that lock and was rejected. The helper now waits for the lock to lift and verifies the post actually reached `publish`, instead of returning an auto-draft permalink that 404s later in the test.

### Changed

- Update the Block Accessibility Checks (BAC) integration for BAC 4.0. Checks now register through the top-level `ba11yc_register_block_check()` function with a `namespace` key and explicit `level` / `configurable` severity in place of the v3 registry object and `type` key, and the editor-side validator listens on BAC's renamed `ba11yc.validateBlock` filter. All four checks — `empty_bibliography`, `heading_missing`, `raw_url_link_text`, and `all_metadata_disabled` — are now admin-configurable from BAC's unified settings screen.
- **The BAC integration now requires Block Accessibility Checks 4.0 or later.** On BAC 3.x the v4 registration function is absent, so the integration stays dormant and no bibliography checks appear. Borges itself is unaffected and works normally whether BAC is outdated or not installed at all.

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
