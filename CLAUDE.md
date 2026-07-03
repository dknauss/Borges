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
  - `GET /posts/{post_id}/bibliographies` — list all bibliography blocks in post
  - `GET /posts/{post_id}/bibliographies/{index}` — single bibliography; supports `?format=json|text|csl-json`
- Payload limits: 1 MB max body, 50 items max per `/format` request
- `bibliography_builder_sanitize_formatted_text()` — all HTML from citeproc is run through this before storage or output

### JS entry points (`src/`)

- `index.js` — calls `registerBlockType()` with `block.json` metadata
- `edit.js` — editor component; state managed in `src/hooks/use-citation-editor-state.js`
- `save.js` — static save; no server round-trip on frontend
- `src/lib/` — pure utility modules (parser, formatter registry, dedup, export, sorter, CSL sanitizer, JSON-LD, COinS)
- `src/components/` — React UI components
- `src/hooks/` — custom React hooks
- `src/deprecated.js` — block version migration handlers

### CSL style handling

- CSL style templates live in `packages/citation-style-language-styles/` (local Composer package)
- Locales in `packages/citation-style-language-locales/`
- `bibliography_builder_get_formatter_style_definition()` maps style keys (e.g. `chicago-notes-bibliography`) to CSL XML + locale
- Style families (`notes`, `author-date`, `numeric`) affect how sorting and display semantics work in JS

### Testing conventions

- PHPUnit uses custom mock WordPress functions — no WP installation required. See `tests/phpunit/bootstrap.php`.
- Jest mocks citation-js via `src/__test-utils__/citation-js-mocks.js`
- Combined JS + PHP Codecov target: 80%+. Badge may show "unknown" intermittently (uploads are continue-on-error).

### Playground

The Playground blueprint at `playground/blueprint.json` configures the GitHub/readme demo (released version). It installs the latest GitHub Release ZIP through the WordPress Playground CORS proxy, installs Block Accessibility Checks from WordPress.org, and requires both `"phpExtensionBundles": ["kitchen-sink"]` and `features.intl` for the CSL formatter. A second blueprint at `playground/blueprint-main.json` powers the README "Main build" badge: it installs the `main-preview` rolling pre-release ZIP that CI's `publish-main-preview` job refreshes on every push to `main` — after the full CI suite passes and only when the commit is still `main`'s tip (live Playground can't use `git:directory`, so a stable release asset is how main HEAD boots). The WordPress.org Preview blueprint at `.wordpress-org/blueprints/blueprint.json` is separate; WordPress.org installs Borges automatically there. The E2E tests (`npm run test:e2e:playground`) run against the GitHub/readme blueprint.

### Release

`npm run package:release` builds the production zip (strips dev dependencies). Pushing a `v*` tag triggers `release.yml`, which builds the ZIP, publishes the GitHub Release, and dispatches `wp-deploy.yml`. `wp-deploy.yml` also runs on published GitHub releases and can be run manually.

## CI overview

- **ci.yml** — lint, Jest, PHPUnit, Psalm, Playwright Playground E2E, coverage upload, package artifact
- **runtime-matrix.yml** — smoke tests across PHP 7.4–8.4, WP 6.4+, Apache/Nginx, MySQL via Docker
- **release.yml** — tag-triggered GitHub Release and ZIP publication
- **wp-deploy.yml** — deploys to WordPress.org SVN on published GitHub release, release dispatch, or manual run
- **codeql.yml** — security analysis
- **demo-links.yml** — scheduled/manual check that Playground demo blueprint install URLs stay reachable and never regress to the browser-broken `git:directory` resource
