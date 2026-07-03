# Borges Bibliography Builder for WordPress

![](.wordpress-org/banner-1544x500.png)

[![License: GPL v2+](https://img.shields.io/badge/License-GPLv2%2B-blue.svg)](https://www.gnu.org/licenses/gpl-2.0.html) [![Latest Release](https://img.shields.io/github/v/release/dknauss/Borges)](https://github.com/dknauss/Borges/releases) [![Security Policy](https://img.shields.io/badge/security-policy-4c1)](SECURITY.md) [![Docs](https://img.shields.io/badge/docs-available-0a7ea4.svg)](docs/)
[![WordPress tested](https://img.shields.io/badge/WordPress-6.4%E2%80%937.0-21759b.svg?logo=wordpress&logoColor=white)](https://github.com/dknauss/Borges/actions/workflows/runtime-matrix.yml)
[![PHP tested](https://img.shields.io/badge/PHP-7.4%E2%80%938.4-777bb4.svg?logo=php&logoColor=white)](https://github.com/dknauss/Borges/actions/workflows/runtime-matrix.yml)
[![CI](https://github.com/dknauss/Borges/actions/workflows/ci.yml/badge.svg)](https://github.com/dknauss/Borges/actions/workflows/ci.yml)
[![Runtime matrix](https://github.com/dknauss/Borges/actions/workflows/runtime-matrix.yml/badge.svg)](https://github.com/dknauss/Borges/actions/workflows/runtime-matrix.yml)
[![CodeQL](https://github.com/dknauss/Borges/actions/workflows/codeql.yml/badge.svg)](https://github.com/dknauss/Borges/actions/workflows/codeql.yml)
[![codecov](https://codecov.io/gh/dknauss/Borges/branch/main/graph/badge.svg?token=2MSXL46VTF)](https://codecov.io/gh/dknauss/Borges)
[![Playground: Release](https://img.shields.io/badge/Playground-Release-3858e9.svg?logo=wordpress&logoColor=white)](https://playground.wordpress.net/?blueprint-url=https://raw.githubusercontent.com/dknauss/Borges/main/playground/blueprint.json)
[![Playground: Main build](https://img.shields.io/badge/Playground-Main%20build-8858e9.svg?logo=wordpress&logoColor=white)](https://playground.wordpress.net/?blueprint-url=https://raw.githubusercontent.com/dknauss/Borges/main/playground/blueprint-main.json)
[![WordPress.org](https://img.shields.io/badge/WordPress.org-Install-21759b.svg?logo=wordpress&logoColor=white)](https://wordpress.org/plugins/borges-bibliography-builder/)

Borges Bibliography Builder is named after Jorge Luis Borges (1899–1986), the Argentine writer, essayist, poet, and librarian whose work imagined infinite libraries, invented books, and self-referential labyrinths.

Borges, the plugin, adds a single bibliography builder block to the WordPress editor. It transforms pasted scholarly references — DOI numbers/URLs, PubMed/PMID identifiers, BibTeX entries, and supported formatted citations — into a semantically rich, auto-sorted bibliography with static saved output. Export your work as CSL-JSON, BibTeX, BibLaTeX, and RIS for Zotero, Mendeley, EndNote, JabRef, BibDesk, and similar tools.

No shortcodes. No database storage. Static HTML output survives plugin deactivation.

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
| Paste DOIs, PubMed/PMID identifiers, BibTeX, RIS, CSL-JSON, or free-text citations into the import form. Hover any entry to reveal copy, edit, and delete actions. | Switch to Manual Entry to build a citation field by field: Publication Type, Author, Title, Container, Publisher, Year, Pages, DOI, and URL. These fields are populated automatically from DOIs, PubMed/PMID records, and any pasted input that can be parsed. | Correct imported or free-text citations in place with the structured field editor — fix individual fields without retyping the whole entry. |

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

- **WordPress** 6.4+; tested up to WordPress 7.0.
- **PHP** 7.4+.
- **Multisite** — supported and covered by CI smoke testing.

Developer-facing CI/runtime coverage details are listed in the development section below.

## Recent Release Highlights

- **1.3.4** — Refreshes the translation template plus 19 seed PO/MO locale pairs, adds CI validation for i18n artifacts, clarifies the bundled seed versus official language-pack policy, and archives historical planning notes out of active docs.
- **1.3.3** — Restores DOI imports in WordPress Playground with direct CrossRef CSL transform lookups, serializes DOI requests for CrossRef's public concurrency limit, and adds a PubMed sample to the demo starter content.
- **1.3.0** — Enforces an explicit 50-citation cap with editor warnings, guards all editor mutation flows against stale async results, removes a redundant formatter call in the manual-entry path, prunes non-runtime vendor dead weight from the release zip, and caches successful PMID responses while deduplicating concurrent DOI requests.
- **1.2.0** — Adds PubMed/PMID import through an authenticated REST proxy, BibLaTeX export, manual reordering for numeric styles, full-bibliography reformat parity, and compact matrix coverage across all nine styles.
- **ABNT / NBR 6023:2018** — Brazilian bibliography output is available as ABNT (Associação Brasileira de Normas Técnicas) with `pt-BR` defaults and the `Referências` heading.
- **1.1.x accessibility** — Adds optional Block Accessibility Checks integration and restores visible keyboard focus on editor row actions.

## Features

- **Multiple input paths** — Add bare DOIs, DOI URLs, PubMed/PMID records, BibTeX entries, and supported formatted citations.
- **Nine citation styles** — Chicago Notes-Bibliography by default, with Chicago Author-Date, APA 7, Harvard, Vancouver, IEEE, MLA 9, OSCOLA, and ABNT (Associação Brasileira de Normas Técnicas / NBR 6023:2018) selectable.
- **Structured editing** — Plain-text editing plus per-field editing for heuristic or warning-marked citations.
- **Semantic output** — `role="doc-bibliography"`, `<cite>` wrappers, `lang` attributes, and hanging-indent styling without deprecated bibliography-entry ARIA roles.
- **JSON-LD** — Schema.org structured data for search engines, AI systems, and semantic consumers (on by default).
- **COinS** — Optional OpenURL spans for browser-based citation manager detection, especially Zotero and legacy OpenURL workflows.
- **CSL-JSON output** — Optional machine-readable metadata for citation-manager, citeproc, and scholarly-service interoperability.
- **Export** — Download the current bibliography as CSL-JSON, UTF-8 BibTeX, BibLaTeX, or RIS; copy individual citations or the full bibliography as plain text.
- **Static save** — Bibliography HTML and metadata are baked into post content at save time.
- **Accessible editor UX** — Focus management, block-local Gutenberg notices, keyboard escape/cancel flows, and row action controls.
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

Returns every Borges Bibliography block found in the post, including nested blocks:

```json
{
  "postId": 123,
  "bibliographies": [
    {
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
GET /wp-json/bibliography/v1/posts/<post_id>/bibliographies/<index>
```

`<index>` is zero-based within the post. Supported formats:

- `?format=json` — normalized bibliography block data. This is the default.
- `?format=text` — one visible citation per line, stripped to plain text.
- `?format=csl-json` — CSL-JSON array with `application/vnd.citationstyles.csl+json` content type.

### Permissions and limitations

- Published, non-password-protected posts are publicly readable.
- Password-protected, draft, private, or otherwise non-public posts require `edit_post` permission.
- Missing posts, forbidden posts, and missing bibliography indexes return explicit REST errors.
- The public bibliography data routes are read-only. They do not add, update, delete, reorder, or persist citations.

The separate editor-only formatter endpoint accepts `POST /wp-json/bibliography/v1/format`, requires `edit_posts`, and returns formatted citation text for submitted CSL-JSON. It does not save changes.

The editor-only PubMed resolver accepts `GET /wp-json/bibliography/v1/pmid/<pmid>`, requires `edit_posts`, validates the PMID as numeric input, and returns normalized CSL-JSON from the fixed NCBI/PMC citation exporter endpoint. It is used for pasted `PMID:` input and does not persist citations by itself.

## External Services

This plugin connects to fixed scholarly metadata services only when you explicitly add an identifier in the block editor — no citation data is sent automatically or in the background. No account or API key is required for the supported DOI or PMID lookups.

### DOI metadata

DOI input connects to the [CrossRef REST API](https://api.crossref.org/) to resolve citation metadata.

- [CrossRef](https://www.crossref.org/)
- [CrossRef REST API documentation](https://api.crossref.org/swagger-ui/index.html)
- [CrossRef privacy policy](https://www.crossref.org/privacy/)
- [CrossRef terms of service](https://www.crossref.org/terms/)

### PubMed/PMID metadata

PubMed/PMID input connects through the plugin's authenticated WordPress REST proxy to the [NCBI/PMC Literature Citation Exporter](https://pmc.ncbi.nlm.nih.gov/api/ctxp/) CSL endpoint. The proxy uses a fixed upstream host and validates the PMID before making the outbound request.

- [NCBI APIs](https://www.ncbi.nlm.nih.gov/home/develop/api/)
- [NCBI/PMC Literature Citation Exporter](https://pmc.ncbi.nlm.nih.gov/api/ctxp/)
- [NLM Web Policies](https://www.nlm.nih.gov/web_policies.html)

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
