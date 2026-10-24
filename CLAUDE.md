# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### JavaScript

```bash
npm run build          # Production build via wp-scripts/webpack
npm start              # Dev build with file watching
npm test               # Jest unit tests
npm run test:js:coverage
npm run lint:js
npm run lint:css
npm run format:check   # Prettier on JSON/YAML/JS; Markdown, SCSS, fixtures, and generated files are ignored (.prettierignore)
npm run typecheck:js   # tsc checkJs over src/lib/ (tsconfig.checkjs.json): JSDoc types, no emit; tests and fixtures excluded
```

Run a single Jest test file or by name:
```bash
npm test -- src/lib/parser.test.js
npm test -- --testNamePattern="specific test name"
```

### PHP

```bash
composer test:php                                          # PHPUnit
composer test:php -- tests/phpunit/RestEndpointsTest.php  # Single file
composer test:php -- --filter testMethodName              # Single test
composer lint:php
composer lint:php:fix
composer analyze:php   # Psalm static analysis
```

### E2E / Integration

```bash
npm run test:e2e             # Playwright against WordPress Playground
npm run test:e2e:lifecycle   # Plugin activation/deactivation lifecycle
npm run test:e2e:playground  # Playground smoke tests
```

## Architecture

### What it does

A Gutenberg block plugin that accepts DOI identifiers, PubMed/PMID records, BibTeX, or free-text citations and renders them as a formatted bibliography. Citations are stored as CSL-JSON in block attributes; formatting is done both client-side (display logic) and server-side (via REST for accurate CSL style rendering).

### PHP/JS boundary

| Responsibility | Owner |
|---|---|
| Input parsing (DOI, PubMed/PMID, BibTeX, free text) | JS (`src/lib/parser.js`, `free-text-parser.js`) plus PHP PMID REST proxy |
| CSL-JSON as internal exchange format | Both |
| Formatting to HTML citation strings | PHP via citeproc-php (REST call) |
| Deduplication, sorting, export | JS client-side |
| Static save output (bibliography HTML, JSON-LD, COinS) | JS `save.js` / `save-markup.js` |
| REST endpoint validation, sanitization | PHP |

**No render_callback** — all output is static `save()`. The PHP formatter REST endpoint (`POST /bibliography/v1/format`) is called only in the editor, not on the frontend.

### PHP entry points (`bibliography-builder.php`)

- `bibliography_builder_block_init()` — registers block type from `block.json` on `init`
- REST routes registered on `rest_api_init` at namespace `/bibliography/v1`:
  - `POST /format` — formats CSL items via citeproc-php; requires `edit_posts`
  - `GET /pmid/{pmid}` — resolves PubMed/PMID records through a fixed NCBI/PMC CSL endpoint; requires `edit_posts`
  - `GET /pmcid/{pmcid}` — resolves PubMed Central/PMCID records through NCBI's fixed PMC CSL endpoint via the same shared resolver; requires `edit_posts`
  - `GET /arxiv?id={id}` — resolves arXiv IDs through the fixed arXiv API, mapping Atom to a CSL preprint in PHP; requires `edit_posts`
  - `GET /isbn/{isbn}` — resolves checksum-valid ISBNs through Open Library's fixed ISBN edition endpoint (author names from its search endpoint), falling back to Google Books, mapping to a CSL book in PHP; requires `edit_posts`
  - `GET /catalog?id={OCLC:|LCCN:|OLID:key}` — resolves OCLC numbers, LCCNs, and Open Library edition IDs through Open Library's fixed Books API (`jscmd=data`), mapping to a CSL book in PHP; requires `edit_posts`
  - `GET /archive?id={identifier|ark:/13960/…}` — resolves Internet Archive items (an ARK through IA's advanced search first) from the fixed `archive.org/metadata/` host, preferring the item's Open Library edition, ISBN, then LCCN, else mapping the scan metadata; URL is always the archive.org item page; requires `edit_posts`. Both routes are registered last so earlier route indices (pinned by tests) stay stable.
  - `GET /posts/{post_id}/bibliographies` — list all bibliography blocks in post
  - `GET /posts/{post_id}/bibliographies/{index}` — single bibliography; supports `?format=json|text|csl-json`
- Write routes (Phase 05 M2 and M3, `includes/write-routes.php`): POST/PATCH/DELETE/PUT under `/posts/{post_id}/bibliographies/{ref}/citations`, plus PATCH `/posts/{post_id}/bibliographies/{ref}` (block settings) and POST `…/{ref}/reformat` (style switch, mirroring the editor's `handleCitationStyleChange`). They are **off unless** the `bibliography_builder_enable_write_routes` filter returns true. They need `edit_post`, are dry runs unless `dry_run=false`, and need `If-Match` (the post's ETag, a hash of its content). A write rebuilds markup with the `save()` port and splices only that block via `includes/block-locator.php`. See `docs/rest-write-routes.md`.
- Write abilities (Phase 05 M5, `includes/write-abilities.php`): `borges/add-citations`, `update-citation`, `delete-citation`, `reorder-citations`, `update-bibliography-settings`, `reformat-bibliography`. Registered only when the write-routes filter is on; each builds the matching route's request and calls that route's callback, so `edit_post`, dry run, and `etag` (sent as `If-Match`) behave identically.
- Bulk routes (Phase 05 M4, `includes/bulk-routes.php`): `POST /bulk/reformat` restyles every bibliography in up to 25 posts, through `bibliography_builder_bulk_reformat_post()`, which reuses the reformat route's `bibliography_builder_write_reformat_attrs()` and splices every block before one `wp_update_post()`. Registered by `bibliography_builder_register_write_routes()`, so it follows the same filter; needs `edit_others_posts` plus `edit_post` per post. Synchronous batches, not jobs: posts it does not reach come back as `remaining` (no options or cron, so `verify-metrics.sh` stays green). The `borges/bulk-reformat` ability wraps it. Rate limiting is `includes/rate-limit.php`: a per-user budget in posts (250 per 15 minutes, dry runs included, reserved up front and refunded), clipping rather than refusing, `429` with `Retry-After` and `RateLimit-*` headers, and a site-wide lock on saving requests; counters use the object cache when persistent, else `bbb_` transients. Filters: `bibliography_builder_bulk_rate_limit`, `…_bulk_rate_limit_key`, `…_bulk_max_posts_per_request`, `…_bulk_time_budget`.
- Email and feeds (`includes/email-output.php`): the block registers a `render_email_callback` (read by the email renderer WooCommerce, MailPoet, Jetpack newsletters, and Newspack share), and a `render_block` filter applies the same output to feeds. Both drop the Cite / Export panel or its `data-cite-*` data, scripts, and COinS, and set entries upright, for current and legacy markup. Current `save()` already reads correctly without CSS or JS: entries are `<span>`s and `view.js` builds the Cite / Export panel from each `<li>`'s `data-cite-*` attributes.
- Render-time JSON-LD enrichment (`includes/json-ld-enrichment.php`): a `render_block` filter (priority 11, after `frontend-json-ld.php` nests pre-1.11.0 arrays) rewrites the saved `ItemList` with page-relative `@id`s and `url`s, plus identifiers, `sameAs`, the periodical chain, pages, and other CSL fields `save()` leaves out. Entries are matched to citations by the `<li id="ref-…">` order. With Yoast SEO or Rank Math it also adds the cited works to the page's Article as schema.org `citation`. `save()` and its PHP port are unchanged, so no deprecation is involved. Filters: `bibliography_builder_enrich_json_ld`, `bibliography_builder_link_page_citations`, `bibliography_builder_json_ld_page_url`.
- Site-wide output defaults (`includes/output-defaults.php`, `src/lib/output-defaults.js`): the `bibliography_builder_output_defaults` filter reaches the editor as the `bibliographyBuilderOutputDefaults` block editor setting, and `useOutputDefaults()` writes it into newly inserted blocks as explicit attributes. Never change the `block.json` defaults for this: omitted attributes take the default, so it would invalidate saved blocks.
- The PMID, PMCID, arXiv, ISBN, catalog, and Internet Archive route callbacks, their provider constants (fixed upstream URLs, timeout, cache TTLs), and the NCBI cache helpers live in `includes/resolvers.php`, loaded by `require_once` from the main file. Route registration and the `edit_posts` permission callbacks stay in `bibliography-builder.php`.
- `includes/google-books-key.php` reads an optional Google Books API key from the `BIBLIOGRAPHY_BUILDER_GOOGLE_BOOKS_API_KEY` constant, then the `bibliography_builder_google_books_api_key` filter. It is added only to the ISBN resolver's Google Books fallback request. There is deliberately no option or settings screen: `verify-metrics.sh` enforces that the plugin persists no settings.
- WP-CLI commands (`includes/cli.php`, `includes/class-bibliography-builder-cli-command.php`, loaded only when `WP_CLI` is defined): the read-only `wp borges list`, `export`, and `validate` call the same read model and validation report as the REST routes and abilities. `wp borges reformat` writes through `bibliography_builder_bulk_reformat_post()`; it always needs `--user`, the write-routes filter, `edit_others_posts`, and `edit_post` per post, and skips the rate limit (batches via `--batch-size`/`--sleep`). With no current user (no `--user`) they check no capabilities, like core's commands; with `--user` they apply the REST/abilities checks (`bibliography_builder_can_read_post()` for list and export, `bibliography_builder_can_review_post()` for validate). `validate` exits 1 on any error. Tests use the recording stub `tests/phpunit/stubs/wp-cli.php`, which Psalm also loads, and `scripts/runtime-matrix/smoke.sh` runs the real commands. See `docs/wp-cli.md`.
- Read-only Abilities API integration (WordPress 6.9+) lives in `includes/abilities.php`: `borges/get-bibliographies`, `borges/export-bibliography`, `borges/validate-citations` in a `bibliography` category. They reuse the REST read/permission helpers; on older WordPress the `wp_abilities_api_*` hooks never fire.
- Payload limits: 1 MB max body, 200 items max per `/format` request (the editor's per-bibliography cap, `MAX_CITATIONS_PER_BIBLIOGRAPHY`; the editor formats a whole bibliography in one request, and `src/lib/citation-limits.test.js` keeps the two equal)
- Block discovery and the read model (`bibliography_builder_collect_blocks()`, `…_get_bibliographies_for_post()`, plain-text and CSL-JSON builders, `…_get_stable_block_id()`) live in `includes/block-data.php`. The read route callbacks (`/format`, the post bibliography list and single reads) and `bibliography_builder_get_request_params()` live in `includes/read-routes.php`; their registration and permission callbacks stay in the root file.
- The formatter (`bibliography_builder_format_csl_items()`, style definitions, citeproc-php adaptation, cache key and transient cache helpers) lives in `includes/formatter.php`. It caches each whole response, and also keeps one per-style map of formatted entries (entry hash → text, the 500 most recently used), so a request renders only entries no earlier request formatted in that style; this is safe because every entry renders on its own (year suffixes are the one cross-entry result: `bibliography_builder_assign_year_suffixes()` sets each item's `year-suffix` before hashing, for the styles flagged `yearSuffix` in `styles.json`), and CSL-JSON validation and sanitization (`bibliography_builder_validate_and_sanitize_csl_item()` and its helpers) in `includes/csl-sanitize.php`, both moved unchanged from the root file in Phase B of `docs/planning/refactor-and-standards-memo.md`. `tests/phpunit/FunctionInventoryTest.php` fails if any function listed in `tests/fixtures/function-inventory.txt` goes missing or is defined twice; keep function names when moving code.
- The PHP port of `save()` is `includes/save-markup.php` (the wrapper, entry rendering, and JS-compatible string/JSON/escaping helpers) plus four files split from it along the JS modules they port: `save-sort.php` (`sorter.js`, `name-particles.js`, CSL field helpers), `save-display.php` (display segments, names, repeated authors, links), `save-json-ld-coins.php` (`jsonld.js`, `coins.js`), and `save-cite-export.php` (`export.js`). The save-parity fixtures pin all of it to the JS output.
- `bibliography_builder_sanitize_formatted_text()` — all HTML from citeproc is run through this before storage or output

### JS entry points (`src/`)

- `index.js` — calls `registerBlockType()` with `block.json` metadata
- `edit.js` — editor component; state managed in `src/hooks/use-citation-editor-state.js`
- `save.js` — static save; no server round-trip on frontend
- `src/lib/` — pure utility modules (parser, formatter registry, dedup, export, sorter, CSL sanitizer, JSON-LD, COinS)
- `src/lib/parser.js` — `parsePastedInput()`, the per-format backends, and the parse error messages; it imports `parser-identifiers.js` (identifier patterns and normalizers), `parser-resolvers.js` (NCBI, CrossRef, arXiv lookups, the DOI cache and serial queues), `parser-normalize.js` (cleanup of resolved records), `parser-segment.js` (format detection and splitting pasted input), and `parser-csl-json.js` (pasted CSL-JSON documents), and re-exports their public names, so import from `parser.js` (tests mock it by that path)
- `src/components/` — React UI components
- `src/hooks/` — custom React hooks
- `src/deprecated.js` — block version migration handlers

### CSL style handling

- CSL style templates live in `packages/citation-style-language-styles/` (local Composer package)
- Locales in `packages/citation-style-language-locales/`
- `includes/styles.json` is the one style table: per style key, the label, CSL template, locale, family, list type, `demoteNonDroppingParticle`, inline citation mode, `yearSuffix` (whether the formatter letters same-author, same-year works), and default heading, plus the default style key and the lowercase name particles (`nameParticles`). `src/lib/formatting/style-registry.js` (`STYLE_DEFINITIONS`) and `src/lib/name-particles.js` (`NAME_PARTICLES`) import it, and PHP reads it through `includes/styles.php` (`bibliography_builder_get_style_data()`, `…_default_style_key()`). The formatter's `bibliography_builder_get_formatter_style_definition()`, the save port's `…_get_save_style_definition()`, the write routes' `…_write_default_heading()`, and `…_name_particles()` all derive from it; add or change a style there only. `tests/phpunit/StyleDataTest.php` checks it against `block.json` and the bundled CSL styles and locales
- Style families (`notes`, `author-date`, `numeric`) affect how sorting and display semantics work in JS

### Testing conventions

- PHPUnit uses custom mock WordPress functions — no WP installation required. See `tests/phpunit/bootstrap.php`.
- Jest mocks citation-js via `src/__test-utils__/citation-js-mocks.js`
- Combined JS + PHP Codecov target: 80%+. Badge may show "unknown" intermittently (uploads are continue-on-error).

### Playground

The Playground blueprint at `playground/blueprint.json` configures the GitHub/readme demo (released version). It installs the latest GitHub Release ZIP through the WordPress Playground CORS proxy, installs Block Accessibility Checks from WordPress.org, and requires both `"phpExtensionBundles": ["kitchen-sink"]` and `features.intl` for the CSL formatter. A second blueprint at `playground/blueprint-main.json` powers the README "Main build" badge: it installs the `main-preview` rolling pre-release ZIP that CI's `publish-main-preview` job refreshes on every push to `main` — after the full CI suite passes and only when the commit is still `main`'s tip (live Playground can't use `git:directory`, so a stable release asset is how main HEAD boots). The WordPress.org Preview blueprint at `.wordpress-org/blueprints/blueprint.json` is separate; WordPress.org installs Borges automatically there. A development-only `playground/blueprint-write-api.json` does the same for the main build, with the write routes enabled and a `borgesWrite` console helper (`playground/dev/`). All of them open post 1 as a demo page that is generated, not hand-edited: edit `playground/demo-content.json` / `demo-content.php`, then run `npm run playground:build` (`src/playground-demo.test.js` fails on stale blueprints). The E2E tests (`npm run test:e2e:playground`) run against the GitHub/readme blueprint.

### Release

`npm run package:release` builds the production zip (strips dev dependencies). `release.yml` runs when a push to `main` changes `bibliography-builder.php` (so merging a version bump releases it), when a `v*` tag is pushed, or by hand. It reads the version from the plugin header, fails unless `readme.txt`, `package.json` and `block.json` agree, and does nothing if that version's release exists. Otherwise it builds the ZIP, creates the tag, publishes the GitHub Release (its body is the tag's `CHANGELOG.md` section, extracted by `scripts/extract-changelog-section.js`, followed by GitHub's generated PR list; the job fails if that section is missing), and dispatches `wp-deploy.yml`. `wp-deploy.yml` also runs on published GitHub releases and can be run manually.

## CI overview

- **ci.yml** — lint, `checkJs` type check of `src/lib/`, Jest, PHPUnit, Psalm (level 2), Playwright Playground E2E, coverage upload, package artifact
- **runtime-matrix.yml** — smoke tests across PHP 7.4–8.4, WP 6.4+, Apache/Nginx, MySQL via Docker. They run against the packaged release ZIP contents (`WP_BIBLIO_PLUGIN_DIR`), not the checkout. Beyond activation and the read routes, `scripts/runtime-matrix/smoke.sh` checks formatter parity with `tests/fixtures/csl-styles/` goldens on each PHP version, times a 200-entry `/format` request over HTTP with `scripts/time-format-route.sh` (cold, every entry rendered, and edit, one entry changed, beside a `users/me` baseline for WordPress itself; also usable by hand against any site), exercises the write routes over HTTP with an application password, and runs the Abilities API on WordPress 6.9+.
- **release.yml** — GitHub Release and ZIP publication on a version bump merged to `main`, a `v*` tag, or by hand
- **wp-deploy.yml** — deploys to WordPress.org SVN on published GitHub release, release dispatch, or manual run
- **codeql.yml** — security analysis
- **demo-links.yml** — scheduled/manual check that Playground demo blueprint install URLs stay reachable and never regress to the browser-broken `git:directory` resource
