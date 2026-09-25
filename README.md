# Borges Bibliography Builder for WordPress

![](.wordpress-org/banner-1544x500.png)

[![License: GPL v2+](https://img.shields.io/badge/License-GPLv2%2B-blue.svg)](https://www.gnu.org/licenses/gpl-2.0.html) [![Latest Release](https://img.shields.io/github/v/release/dknauss/Borges)](https://github.com/dknauss/Borges/releases) [![Security Policy](https://img.shields.io/badge/security-policy-4c1)](SECURITY.md) [![Docs](https://img.shields.io/badge/docs-available-0a7ea4.svg)](docs/)
[![WordPress tested](https://img.shields.io/badge/WordPress-6.4%E2%80%937.1-21759b.svg?logo=wordpress&logoColor=white)](https://github.com/dknauss/Borges/actions/workflows/runtime-matrix.yml)
[![PHP tested](https://img.shields.io/badge/PHP-7.4%E2%80%938.4-777bb4.svg?logo=php&logoColor=white)](https://github.com/dknauss/Borges/actions/workflows/runtime-matrix.yml)
[![CI](https://github.com/dknauss/Borges/actions/workflows/ci.yml/badge.svg)](https://github.com/dknauss/Borges/actions/workflows/ci.yml)
[![Runtime matrix](https://github.com/dknauss/Borges/actions/workflows/runtime-matrix.yml/badge.svg)](https://github.com/dknauss/Borges/actions/workflows/runtime-matrix.yml)
[![CodeQL](https://github.com/dknauss/Borges/actions/workflows/codeql.yml/badge.svg)](https://github.com/dknauss/Borges/actions/workflows/codeql.yml)
[![codecov](https://codecov.io/gh/dknauss/Borges/branch/main/graph/badge.svg?token=2MSXL46VTF)](https://codecov.io/gh/dknauss/Borges)
[![Playground: Release](https://img.shields.io/badge/Playground-Release-3858e9.svg?logo=wordpress&logoColor=white)](https://playground.wordpress.net/?blueprint-url=https://raw.githubusercontent.com/dknauss/Borges/main/playground/blueprint.json)
[![Playground: Main build](https://img.shields.io/badge/Playground-Main%20build-8858e9.svg?logo=wordpress&logoColor=white)](https://playground.wordpress.net/?blueprint-url=https://raw.githubusercontent.com/dknauss/Borges/main/playground/blueprint-main.json)
[![WordPress.org](https://img.shields.io/badge/WordPress.org-Install-21759b.svg?logo=wordpress&logoColor=white)](https://wordpress.org/plugins/borges-bibliography-builder/)

Borges Bibliography Builder is named after Jorge Luis Borges (1899–1986), the Argentine writer, essayist, poet, and librarian whose work imagined infinite libraries, invented books, and self-referential labyrinths.

Borges, the plugin, adds a single bibliography builder block to the WordPress editor. It transforms pasted scholarly references — DOI numbers/URLs, PubMed/PMID and PubMed Central/PMCID identifiers, arXiv IDs, ISBNs, BibTeX and BibLaTeX entries, and supported formatted citations — into a semantically rich, auto-sorted bibliography with static saved output. Export your work as CSL-JSON, BibTeX, BibLaTeX, and RIS for Zotero, Mendeley, EndNote, JabRef, BibDesk, and similar tools.

No shortcodes. No citation database tables or long-lived settings. Static HTML output survives plugin deactivation.

Just write out your citations or paste DOIs, PubMed/PMID identifiers, and BibTeX code, up to 50 at a time. Easily build a formatted, auto-sorted bibliography in any supported style.

## Try it in WordPress Playground

Install the public release from [WordPress.org](https://wordpress.org/plugins/borges-bibliography-builder/), or launch a disposable WordPress instance with the plugin preinstalled — no setup, no database, and gone when you close the tab. Two Playground demos are available:

- **[Try the released version](https://playground.wordpress.net/?blueprint-url=https://raw.githubusercontent.com/dknauss/Borges/main/playground/blueprint.json)** — installs the latest GitHub Release ZIP (the same build published to WordPress.org) through the WordPress Playground CORS proxy. Use this to try the current stable plugin.
- **[Try the current main build](https://playground.wordpress.net/?blueprint-url=https://raw.githubusercontent.com/dknauss/Borges/main/playground/blueprint-main.json)** — installs the development build of the `main` branch from the rolling `main-preview` pre-release, which CI refreshes on every push to `main`. Use this to preview unreleased changes ahead of the next release; it is not a stable build.

Both demo Blueprints explicitly request PHP `intl` support because editor-time CSL formatting runs through the plugin's local PHP formatter. The WordPress.org Preview blueprint is separate; WordPress.org installs Borges automatically there, and the blueprint only seeds demo content and auxiliary plugin setup.

## Screenshots

| Front-end output | Block inserter |
|---|---|
| ![](.wordpress-org/screenshot-1.png) | ![](.wordpress-org/screenshot-2.png) |
| The rendered bibliography on the site front end with hanging indents, italic titles, and linked DOIs — all styled by the active theme. | Discover the Bibliography block in the block inserter by searching for "Bibliography." |

| Import form | Manual entry | Structured field editor |
|---|---|---|
| ![](.wordpress-org/screenshot-3.png) | ![](.wordpress-org/screenshot-4.png) | ![](.wordpress-org/screenshot-5.png) |
| Paste DOIs, PubMed/PMID identifiers, BibTeX, or free-text citations into the import form. Hover any entry to reveal copy, edit, and delete actions. | Switch to Manual Entry to build a citation field by field: Publication Type, Author, Title, Container, Publisher, Year, Pages, DOI, and URL. These fields are populated automatically from DOIs, PubMed/PMID records, and any pasted input that can be parsed. | Correct imported or free-text citations in place with the structured field editor — fix individual fields without retyping the whole entry. |

| Numeric reorder | Settings sidebar | Exports |
|---|---|---|
| ![](.wordpress-org/screenshot-6.png) | ![](.wordpress-org/screenshot-7.png) | ![](.wordpress-org/screenshot-8.png) |
| For numbered styles such as IEEE and Vancouver, reorder entries with the up and down controls (or Alt+Arrow keys) to set citation numbering. | Choose the citation style and visible heading and toggle metadata output — JSON-LD, COinS, CSL-JSON, and the per-entry Cite / Export panel — from the block settings sidebar. | Export the whole bibliography from the sidebar: copy as plain text, or download CSL-JSON, BibTeX, BibLaTeX, or RIS. |

| Reader Cite / Export |
|---|
| ![](.wordpress-org/screenshot-9.png) |
| Readers can expand the per-entry Cite / Export panel on the published page to copy a citation or download it as RIS, CSL-JSON, BibTeX, or BibLaTeX. |

## Installation

1. Upload the plugin files to `/wp-content/plugins/borges-bibliography-builder/`, or install directly through the WordPress plugin screen.
2. Activate the plugin through the **Plugins** screen in WordPress.
3. Add the **Bibliography** block to any post or page.
4. Paste DOI(s), PubMed/PMID identifiers, BibTeX entries, or supported citations.

## Compatibility

- **WordPress** 6.4+; tested up to WordPress 7.1.
- **PHP** 7.4+.
- **Multisite** — supported and covered by CI smoke testing.

Developer-facing CI/runtime coverage details are listed in the development section below.

## Footprint & Performance

Borges is a static-output block: formatted bibliography HTML, JSON-LD, and COinS are baked into post content at save time, so **published pages add zero database queries and zero server-side formatting** — the citeproc engine and metadata lookups run only while you edit. All figures below are hand-verified; re-derivation commands live in [`docs/current-metrics.md`](docs/current-metrics.md).

| Metric | Value |
|---|---|
| First-party PHP | ~1,946 LOC main plugin file; ~6,217 LOC total with `includes/` |
| JS source (`src/`) | ~9,766 LOC |
| Frontend runtime shipped to visitors | `view.js` ~1.4 KB + `style-index.css` ~2.9 KB, enqueued only when the block is present |
| Installed footprint | ~1.9 MB (`vendor/` ~792 KB, translations 724 KB, build assets ~324 KB) |
| Distributed ZIP (latest v1.6.0 release) | ~488 KB (499,681 bytes) |
| **Added DB queries per page** | **0** — regardless of block or citation count |
| Autoloaded options / registered settings / cron / custom tables / custom post types | none |
| `render_callback` on the frontend | none (static `save()` only) |

The only per-visitor cost is the small `view.js`/`style-index.css` pair, loaded solely on pages that contain a bibliography. Deactivating the plugin leaves the rendered bibliographies intact as static HTML.

Editor-time PMID and formatting results are cached in the object cache and in short-lived, non-autoloaded `_transient_bbb_*` transients — written only while editing, never on a visitor request. (DOI imports are deduped in a browser-session cache, not stored server-side.)

## Recent Release Highlights

- **1.6.0** — Adds PubMed Central (PMCID), arXiv, and ISBN import (Open Library with a Google Books fallback), test-pinned BibLaTeX import, and three read-only WordPress Abilities on WordPress 6.9+; fixes invalid `lang` attributes from BibTeX/BibLaTeX language fields.
- **1.5.1** — Adds WordPress 7.1 compatibility and fixes clipboard fallback behavior when the browser exposes clipboard access but rejects the write.
- **1.5.0** — Security release that hardens public bibliography reads, formatter inputs, generated links, script-block output, and PubMed redirect handling; it also adds the current Block Accessibility Checks 4.0 integration.
- **1.3.4** — Refreshes the translation template plus 19 seed PO/MO locale pairs, adds CI validation for i18n artifacts, clarifies the bundled seed versus official language-pack policy, and archives historical planning notes out of active docs.
- **1.3.3** — Restores DOI imports in WordPress Playground with direct CrossRef CSL transform lookups, serializes DOI requests for CrossRef's public concurrency limit, and adds a PubMed sample to the demo starter content.
- **1.3.0** — Enforces an explicit 50-citation cap with editor warnings, guards all editor mutation flows against stale async results, removes a redundant formatter call in the manual-entry path, prunes non-runtime vendor dead weight from the release zip, and caches successful PMID responses while deduplicating concurrent DOI requests.
- **1.2.0** — Adds PubMed/PMID import through an authenticated REST proxy, BibLaTeX export, manual reordering for numeric styles, full-bibliography reformat parity, and compact matrix coverage across all nine styles.
- **ABNT / NBR 6023:2018** — Brazilian bibliography output is available as ABNT (Associação Brasileira de Normas Técnicas) with `pt-BR` defaults and the `Referências` heading.
- **1.1.x accessibility** — Adds optional Block Accessibility Checks integration and restores visible keyboard focus on editor row actions.

## Features

- **Multiple input paths** — Add bare DOIs, DOI URLs, PubMed/PMID and PubMed Central/PMCID records, arXiv IDs and links, ISBNs, BibTeX and BibLaTeX entries, and supported formatted citations.
- **Nine citation styles** — Chicago Notes-Bibliography by default, with Chicago Author-Date, APA 7, Harvard, Vancouver, IEEE, MLA 9, OSCOLA, and ABNT (Associação Brasileira de Normas Técnicas / NBR 6023:2018) selectable.
- **Structured editing** — Plain-text editing plus per-field editing for heuristic or warning-marked citations.
- **Semantic output** — `role="doc-bibliography"`, `<cite>` wrappers, `lang` attributes, and hanging-indent styling without deprecated bibliography-entry ARIA roles.
- **JSON-LD** — Schema.org structured data for search engines, AI systems, and semantic consumers (on by default).
- **COinS** — Optional OpenURL spans for browser-based citation manager detection, especially Zotero and legacy OpenURL workflows.
- **CSL-JSON output** — Optional machine-readable metadata for citation-manager, citeproc, and scholarly-service interoperability.
- **Export** — Download the current bibliography as CSL-JSON, UTF-8 BibTeX, BibLaTeX, or RIS; copy individual citations or the full bibliography as plain text.
- **Static save** — Bibliography HTML and metadata are baked into post content at save time.
- **Accessible editor UX** — Focus management, block-local Gutenberg notices, keyboard escape/cancel flows, and row action controls.
- **Block Accessibility Checks integration** — Optional. With [Block Accessibility Checks](https://wordpress.org/plugins/block-accessibility-checks/) **4.0 or later** active, the block registers four configurable authoring-time checks (empty bibliography, missing heading, raw URL link text, all metadata outputs disabled). Version 4.0 replaced that plugin's registration API, so on 3.x the integration stays dormant and no checks appear; Borges works normally either way.
- **Translation-ready interface** — strings use the `borges-bibliography-builder` text domain; WordPress.org publishes language packs as community translations are approved. (See **Language Support** below.)

## Reference Manager Compatibility

Borges is reference-manager-friendly by design. It outputs portable CSL-JSON, BibTeX, BibLaTeX, RIS, DOI links, Schema.org JSON-LD, and optional COinS metadata so your bibliographies can be imported directly into the most widely used bibliography management and academic publishing software.

| Tool or workflow | How Borges supports it |
|---|---|
| **Zotero** | Strong compatibility through DOI links, BibTeX, RIS, CSL-JSON, and optional COinS metadata. Tested with the [@zotero](https://github.com/zotero) SaaS, macOS app, and Chrome browser extension from [@digitalscholar](https://github.com/digitalscholar). |
| **Mendeley** | Compatible with Elsevier's [@Mendeley](https://github.com/Mendeley) SaaS, macOS app, and Chrome browser extension through BibTeX/RIS exports; DOI-backed entries are also browser-importer friendly. Use export/copy actions for non-DOI entries rather than relying on extension autodetection. |
| **EndNote** | Compatible through RIS and BibTeX imports. EndNote XML is deferred as a Borges export format unless user feedback and/or future testing show a practical gap that RIS and BibTeX do not cover. |
| **JabRef, BibDesk, LaTeX** | Compatible through UTF-8 BibTeX and BibLaTeX exports for BibTeX/Biber and LaTeX-family workflows. |
| **CSL / citeproc tools** | Compatible through CSL-JSON, which is the plugin's canonical structured data model. |

## Language Support

WordPress.org language packs are generated from [translate.wordpress.org](https://translate.wordpress.org/projects/wp-plugins/borges-bibliography-builder/) after the Stable translation project reaches the approval threshold for a locale. The live WordPress.org plugin page's **Languages** list is the canonical list of currently published language packs; English (US) is the source language and is not counted as a translated locale.

This repository/package currently includes seed PO/MO files for translator review and import in `fr_FR`, `de_DE`, `nl_NL`, `sv_SE`, `es_ES`, `it_IT`, `pt_PT`, `pl_PL`, `ru_RU`, `ja`, `zh_CN`, `ko_KR`, `sr_RS`, `hr`, `pt_BR`, `hi_IN`, `bn_BD`, `ta_IN`, and `te`. These files cover plugin interface strings only, not user-provided citation content. They should not be described as official WordPress.org language-pack availability until the corresponding locale is approved and listed on WordPress.org.

## Supported Input

### First-Class Inputs

- **Bare DOI** — `10.1000/xyz123`
- **DOI URL** — `https://doi.org/10.1000/xyz123`
- **PubMed/PMID** — `PMID:26673779` or `pmid:26673779`, resolved through the authenticated WordPress REST proxy
- **BibTeX** — `@article{key, title={...}, ...}`

### Supported Formatted Citation Coverage

The free-text parser currently supports a growing set of formatted citations for:

- books
- journal articles
- chapters
- webpages and social media posts
- reviews
- theses and dissertations

Support is heuristic rather than universal. Unsupported inputs fail closed with a block-local inline Gutenberg notice. Manual entry is now available as a fallback for unsupported formats.

## REST API

Borges exposes read-only bibliography data routes under `/wp-json/bibliography/v1` for published content, integrations, and export workflows.

### List bibliographies in a post

```http
GET /wp-json/bibliography/v1/posts/<post_id>/bibliographies
```

Returns every Borges Bibliography block found in the post, including nested blocks. `bibliographyId` is the block's stable ID, which stays the same when blocks before it are added or removed; it is `null` for a block saved before IDs were assigned, until that post is next edited. Each citation carries a stable `id`, unique within its block:

```json
{
  "postId": 123,
  "bibliographies": [
    {
      "bibliographyId": "3f1c2b7e-9a4d-4c1e-8f2a-5b6c7d8e9f01",
      "index": 0,
      "entryCount": 2,
      "citationStyle": "chicago-notes-bibliography",
      "headingText": "References",
      "outputJsonLd": true,
      "outputCoins": false,
      "outputCslJson": false,
      "citations": []
    }
  ]
}
```

### Get one bibliography

```http
GET /wp-json/bibliography/v1/posts/<post_id>/bibliographies/<ref>
```

`<ref>` is the block's zero-based index within the post, or its `bibliographyId`. The ID keeps pointing at the same block when others are added or removed, so prefer it where you have it. Supported formats:

- `?format=json` — normalized bibliography block data. This is the default.
- `?format=text` — one visible citation per line, stripped to plain text.
- `?format=csl-json` — CSL-JSON array with `application/vnd.citationstyles.csl+json` content type.

### Review a bibliography (editors)

Three read-only checks on one block, for users who can edit the post (`edit_post`). `<ref>` is the zero-based index or the block's `bibliographyId`, which keeps pointing at the same block when others are added or removed:

```http
GET /wp-json/bibliography/v1/posts/<post_id>/bibliographies/<ref>/validate
GET /wp-json/bibliography/v1/posts/<post_id>/bibliographies/<ref>/duplicates
GET /wp-json/bibliography/v1/posts/<post_id>/bibliographies/<ref>/preview?style=apa-7
```

- `validate` checks each entry's stored CSL-JSON. Errors (`invalid-csl`, `missing-csl`, `missing-title`, `malformed-doi`) mean the entry can't be formatted as stored or a reader couldn't find the work. Warnings (`missing-author`, `missing-issued`, `missing-container-title`, `invalid-isbn`, `empty-doi`, `missing-id`) are gaps some works legitimately have. The response carries `valid`, `errorCount`, `warningCount`, and per-entry `issues` with `severity`, `code`, `field`, and `message`.
- `duplicates` lists pairs the editor's own duplicate check would treat as one work, with a `reason`: `doi` (same DOI, ignoring case and a `doi.org` prefix), or the same normalized title with the same year (`title-year`), the same first author (`title-author`), or neither (`title`).
- `preview` formats each entry in another supported style (the `citationStyle` keys, such as `apa-7`, `mla-9`, or `ieee`) and returns it next to the current text as `current`, `preview`, and `changed`. Entries the formatter rejects get a `null` preview and an `error`. Nothing is saved. Blocks of more than 50 entries return a 400, the same limit as the formatter endpoint.

### Permissions and limitations

- Published, non-password-protected posts are publicly readable.
- Password-protected, draft, private, or otherwise non-public posts require `edit_post` permission.
- Missing posts, forbidden posts, and missing bibliography indexes return explicit REST errors.
- The public bibliography data routes are read-only. They do not add, update, delete, reorder, or persist citations.

The separate editor-only formatter endpoint accepts `POST /wp-json/bibliography/v1/format`, requires `edit_posts`, and returns formatted citation text for submitted CSL-JSON. It does not save changes.

The editor-only PubMed resolver accepts `GET /wp-json/bibliography/v1/pmid/<pmid>`, requires `edit_posts`, validates the PMID as numeric input, and returns normalized CSL-JSON from the fixed NCBI/PMC citation exporter endpoint. It is used for pasted `PMID:` input and does not persist citations by itself.

The editor-only PubMed Central resolver accepts `GET /wp-json/bibliography/v1/pmcid/<pmcid>` (with or without the `PMC` prefix), has the same `edit_posts` requirement and numeric validation, and returns CSL-JSON from NCBI's fixed PMC citation exporter endpoint. It is used for pasted `PMC…` / `PMCID:` input.

The editor-only arXiv resolver accepts `GET /wp-json/bibliography/v1/arxiv?id=<arxiv-id>` (modern or legacy IDs, optional version), requires `edit_posts`, validates the ID pattern before any outbound request, queries the fixed arXiv API, and returns a CSL-JSON preprint record. It is used for pasted `arXiv:` IDs, arxiv.org links, and arXiv DOIs.

The editor-only ISBN resolver accepts `GET /wp-json/bibliography/v1/isbn/<isbn>` (ISBN-10 or ISBN-13, no hyphens), requires `edit_posts`, verifies the checksum before any outbound request, queries Open Library's fixed ISBN edition and search endpoints with a fixed Google Books fallback, and returns a CSL-JSON book record. It is used for pasted `ISBN` labels and bare 978/979 ISBN-13s.

## WordPress Abilities

On WordPress 6.9 and later, Borges registers six read-only abilities with the core Abilities API, in a `bibliography` category. Automation tools and AI agents can discover them and run them through `/wp-json/wp-abilities/v1`. On earlier WordPress versions nothing is registered and nothing else changes.

| Ability | Input | Returns | Permission |
|---|---|---|---|
| `borges/get-bibliographies` | `post_id` | Every bibliography block in the post (same shape as the list route above) | Same as the public read routes |
| `borges/export-bibliography` | `post_id`, `index` (default `0`) or `bibliography_id`, `format` (`csl-json` or `text`) | The block as a CSL-JSON array or plain text | Same as the public read routes |
| `borges/validate-citations` | `items`: 1–50 CSL-JSON records | Per-item validity, the rejection reason, or the sanitized record | `edit_posts` |
| `borges/validate-bibliography` | `post_id`, `index` or `bibliography_id` | Per-entry errors and warnings (same as the `validate` route) | `edit_post` on the post |
| `borges/find-duplicate-citations` | `post_id`, `index` or `bibliography_id` | Likely duplicate pairs with a reason (same as the `duplicates` route) | `edit_post` on the post |
| `borges/preview-bibliography-style` | `post_id`, `index` or `bibliography_id`, `style` | Each entry in another style next to its current text (same as the `preview` route) | `edit_post` on the post |

`bibliography_id` takes precedence over `index` when both are given. All six are annotated `readonly`, non-destructive, and idempotent. None of them writes post content or any other stored data. Writable abilities remain a separate, later design decision; see the Phase 05 memo.

## External Services

This plugin connects to fixed scholarly metadata services only when you explicitly add an identifier in the block editor — no citation data is sent automatically or in the background. No account or API key is required for any of the supported DOI, PMID, PMCID, arXiv, or ISBN lookups.

### DOI metadata

DOI input connects to the [CrossRef REST API](https://api.crossref.org/) to resolve citation metadata.

- [CrossRef](https://www.crossref.org/)
- [CrossRef REST API documentation](https://api.crossref.org/swagger-ui/index.html)
- [CrossRef privacy policy](https://www.crossref.org/privacy/)
- [CrossRef terms of service](https://www.crossref.org/terms/)

### PubMed/PMID and PubMed Central/PMCID metadata

PubMed/PMID and PubMed Central/PMCID input connects through the plugin's authenticated WordPress REST proxy to the [NCBI/PMC Literature Citation Exporter](https://pmc.ncbi.nlm.nih.gov/api/ctxp/) CSL endpoints. The proxy uses a fixed upstream host and validates the identifier as numeric before making the outbound request. Only the identifier is sent.

- [NCBI APIs](https://www.ncbi.nlm.nih.gov/home/develop/api/)
- [NCBI/PMC Literature Citation Exporter](https://pmc.ncbi.nlm.nih.gov/api/ctxp/)
- [NLM Web Policies](https://www.nlm.nih.gov/web_policies.html)

### arXiv metadata

arXiv IDs, arxiv.org links, and arXiv DOIs connect through the plugin's authenticated WordPress REST proxy to the [arXiv API](https://info.arxiv.org/help/api/index.html) (`export.arxiv.org/api/query`). The proxy uses a fixed upstream host and validates the arXiv ID pattern before making the outbound request. Only the arXiv ID is sent.

- [arXiv API](https://info.arxiv.org/help/api/index.html)
- [arXiv API Terms of Use](https://info.arxiv.org/help/api/tou.html)
- [arXiv privacy policy](https://info.arxiv.org/help/policies/privacy_policy.html)

### ISBN metadata

ISBN input connects through the plugin's authenticated WordPress REST proxy to [Open Library](https://openlibrary.org), run by the Internet Archive: its ISBN edition endpoint (`openlibrary.org/isbn/<isbn>.json`) for the book record and its [search API](https://openlibrary.org/dev/docs/api/search) (`openlibrary.org/search.json`) for author names. If Open Library has no record or cannot be reached, the proxy falls back to the [Google Books API](https://developers.google.com/books) (`www.googleapis.com/books/v1/volumes`). All upstream hosts are fixed, and the ISBN checksum is verified before any outbound request. Only the ISBN is sent.

- [Open Library Books API (ISBN endpoint)](https://openlibrary.org/dev/docs/api/books)
- [Open Library Search API](https://openlibrary.org/dev/docs/api/search)
- [Internet Archive terms of use](https://archive.org/about/terms.php)
- [Google Books APIs](https://developers.google.com/books)
- [Google APIs Terms of Service](https://developers.google.com/terms)
- [Google Privacy Policy](https://policies.google.com/privacy)

## Development

Requires Node.js 18+, npm 9+, and Composer.

```bash
npm install                  # Install dependencies
composer install             # Install PHP tooling
npm run build                # Production build
npm run start                # Development mode with file watching
npm run lint:js              # ESLint
npm run lint:css             # Stylelint
npm run lint:php             # WPCS/PHPCS
npm run test                 # Unit tests
npm run test:js:coverage     # JS coverage for Codecov
npm run test:rest:local      # Local REST endpoint smoke test (Studio site)
npm run test:e2e             # Playwright smoke suite against local site
npm run test:e2e:playground  # Playground-based Playwright smoke suite
npm run test:e2e:lifecycle   # Plugin lifecycle e2e tests (activate/deactivate/delete)
npm run test:runtime:local   # Docker-based runtime smoke environment
npm run test:interop:zotero  # Zotero + citation format interoperability checks
composer test:php            # PHPUnit REST and bootstrap tests
composer test:php:coverage   # PHP coverage for Codecov
composer analyze:php         # Psalm static analysis
```

GitHub Actions currently runs:

- Node quality/build checks
- PHPUnit and PHPCS on PHP 8.3
- Psalm static analysis
- CodeQL for JavaScript and PHP
- Codecov uploads from JS + PHP coverage
- Playwright smoke and lifecycle tests against WordPress Playground

The GitHub Actions runtime matrix currently covers:

- Apache + PHP 7.4 + WordPress 6.4
- Apache + PHP 8.1 + WordPress 6.4
- Apache + PHP 8.1 + WordPress 6.7
- Apache + PHP 8.2 + latest WordPress
- Apache + PHP 8.3 + latest WordPress
- Apache + PHP 8.4 + latest WordPress
- Apache + PHP 8.3 + latest WordPress + Multisite
- Nginx + PHP 8.1 + WordPress 6.7
- Nginx + PHP 8.2 + latest WordPress
- Nginx + PHP 8.3 + latest WordPress

Each runtime smoke job uploads artifacts, including Docker logs, service status, HTTP responses, and environment summaries under `output/runtime-matrix/<matrix-name>`.

Multisite runtime smoke coverage is included in CI. SQLite is not currently part of the GitHub runtime matrix; add it when a compatibility risk justifies the extra lane.

## Project Documentation and Operational Files

- [Plugin specification](./SPEC.md)
- [Changelog](./CHANGELOG.md)
- [WordPress.org plugin listing](https://wordpress.org/plugins/borges-bibliography-builder/)
- [GitHub releases](https://github.com/dknauss/Borges/releases)
- [Release readiness checklist](./docs/release-readiness-checklist.md)
- [WordPress.org SVN deploy checklist](./docs/wporg-svn-checklist.md) — maintainer-facing notes
- [Playground blueprint](./playground/blueprint.json) — GitHub demo Blueprint (released version); keep its `features.intl` and `phpExtensionBundles` settings aligned with `.wordpress-org/blueprints/blueprint.json` for WordPress.org previews.
- [Playground main-build blueprint](./playground/blueprint-main.json) — GitHub demo Blueprint that runs the current `main` branch from the rolling `main-preview` pre-release.
- [Runtime matrix smoke script](./scripts/runtime-matrix/smoke.sh)
- [Brand assets](./.wordpress-org/)

WordPress.org branding assets live in [.wordpress-org](./.wordpress-org/), editable source files live in [.wordpress-org/source](./.wordpress-org/source/), and maintainer-facing deploy notes live in [docs/wporg-svn-checklist.md](./docs/wporg-svn-checklist.md).

### Playground Blueprint maintenance

The Playground demos and WordPress.org Preview all rely on the PHP formatter used by the editor REST endpoint. That formatter uses `citeproc-php`, which requires PHP `intl`. Keep the Blueprint files in sync:

- `playground/blueprint.json` powers the GitHub README (Release badge) and WordPress.org readme demo link; it installs the latest GitHub Release ZIP through the WordPress Playground CORS proxy so the demo exercises the packaged release artifact without direct GitHub asset CORS failures.
- `playground/blueprint-main.json` powers the GitHub README Main-build badge; it installs the `borges-bibliography-builder.zip` asset from the rolling `main-preview` pre-release through the same CORS proxy. CI's `publish-main-preview` job refreshes that pre-release on every push to `main` — after the full CI suite passes, and only when the commit is still `main`'s tip — while the `package-release` job just builds and uploads the artifact it consumes (`git:directory` is unavailable in live Playground, so a stable release asset is the reliable way to boot main HEAD).
- `.wordpress-org/blueprints/blueprint.json` deploys to WordPress.org SVN as `assets/blueprints/blueprint.json` for the plugin-directory Preview button. WordPress.org installs the plugin automatically in that preview, so this blueprint does not install Borges itself.
- All three files intentionally declare `phpExtensionBundles: ["kitchen-sink"]` and `features: { "networking": true, "intl": true }`. The bundle form follows WordPress.org Preview documentation; the `features.intl` flag is required by the live browser Playground runtime so formatter requests do not fall back with `bibliography_builder_formatter_extension_missing`.

Run `npm run test -- --runTestsByPath src/blueprint.test.js` after editing any Blueprint.

### Plugin File Structure

```text
borges-bibliography-builder/
├── bibliography-builder.php      # Plugin bootstrap
├── block.json                    # Block metadata & attributes
├── src/
│   ├── index.js                  # Block registration
│   ├── edit.js                   # Editor component
│   ├── save.js                   # Static save entrypoint
│   ├── save-markup.js            # Shared static save markup
│   ├── editor.scss               # Editor-only styles
│   ├── style.scss                # Frontend bibliography styles
│   └── lib/
│       ├── parser.js             # Input detection & parsing orchestration
│       ├── sorter.js             # Style-family bibliography sort comparator
│       ├── coins.js              # CSL-JSON → COinS builder
│       ├── jsonld.js             # CSL-JSON → Schema.org JSON-LD mapper
│       └── formatting/           # Style registry + CSL-backed formatting
├── package.json
└── readme.txt                    # WordPress.org readme
```

See [SPEC.md](SPEC.md) for the authoritative behavior specification and future plans.

## Known Limitations

- **OSCOLA grouped bibliography** — OSCOLA convention requires the bibliography to be divided into source-type groups (cases, legislation, books, articles, online sources). Borges currently renders a single alphabetized list regardless of style. This limitation is displayed as a dismissible notice in the editor when OSCOLA is selected. Grouped-bibliography support is tracked as Epic-OSCOLA in [`docs/planning/sort-conformance-plan.md`](docs/planning/sort-conformance-plan.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and PR process.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

GPL-2.0-or-later. See [LICENSE](LICENSE) for the full text.
