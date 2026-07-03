# Bibliography Builder — Plugin Specification

## Overview

A standalone WordPress block plugin that transforms pasted scholarly citations (DOIs, PubMed/PMID records, BibTeX entries, and supported formatted citations) into a semantically rich, auto-sorted bibliography list. No shortcodes. Static HTML output that survives plugin deactivation.

**Plugin slug:** `borges-bibliography-builder`
**Block namespace:** `bibliography-builder/bibliography`
**License:** GPL-2.0-or-later

---

## Guiding Principles

1. **No shortcodes, ever.** Content rendered as clean, portable HTML at save time. If the plugin is deactivated, the bibliography remains readable in the post. This follows the philosophy established by Academic Blogger's Toolkit (dsifford/academic-bloggers-toolkit, now archived): shortcode-dependent citation plugins create unacceptable fragility for scholarly content.

2. **Structured data as the source of truth.** Each citation is stored as CSL-JSON internally. Formatted display text is derived from this structured data. The CSL-JSON powers all machine-readable output layers (JSON-LD, COinS, etc.).

3. **Semantic output with sensible defaults.** The rendered HTML includes semantic bibliography markup plus machine-readable metadata layers. JSON-LD is enabled by default; COinS and CSL-JSON are optional output layers for users who need them.

4. **Static save.** The block uses React's static `save()` function, not a PHP `render_callback`. Output is baked into post content at save time. This maximizes portability and performance but requires block deprecation migrations when the output format changes.

---

## Landscape & Prior Art

### Existing WordPress Citation Plugins

| Plugin                      | Approach                               | Status               | Key Limitation                        |
| --------------------------- | -------------------------------------- | -------------------- | ------------------------------------- |
| Academic Blogger's Toolkit  | Block editor, no shortcodes, CSL-based | **Archived** (~2019) | Abandoned; outdated block editor APIs |
| Academic References (WBCom) | Commercial, Gutenberg-ready            | Active (premium)     | Uses shortcodes; proprietary          |
| CiteKit                     | Shortcodes, multiple styles            | Active (free)        | Shortcode-dependent                   |
| d12 MLA Citations           | Shortcodes, MLA only                   | Stale                | Single style, shortcode-dependent     |
| KnowledgeBlog Citations     | Shortcodes                             | Stale                | Shortcode-dependent                   |

**Gap:** There is no actively maintained, block-native, shortcode-free bibliography block that stores CSL-JSON and renders full semantic output. This plugin fills that gap.

### Key External Dependencies

| Dependency          | Role                                                                     | Cost / API Key                                                                                                  |
| ------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `citation-js` (npm) | BibTeX parsing and fallback DOI support | Free, no API key. Pinned package versions keep parser behavior stable. |
| CrossRef API        | Primary DOI metadata provider through the CORS-friendly CSL transform endpoint; `citation-js` remains available as a fallback where direct browser fetch is unavailable | Free, public, no key required |
| `citeproc-php` (Composer) | Local CSL-JSON → plain-text bibliography formatting using plugin-owned GPL-compatible styles/locales | Runs locally in WordPress; no external service |
| AnyStyle (Ruby gem) | ML-based free-text citation parsing                                      | Free to self-host; no public API. **Not needed for MVP.**                                                       |

---

## Scope (1.0)

**"Paste a DOI, PubMed/PMID record, BibTeX entry, or supported formatted citation and render it as a semantically rich bibliography in any of nine academic citation styles."**

### Supported Input Formats

1. **DOI** — one or more per paste, one per line. Detected by `10.\d{4,}/` pattern. Resolved to CSL-JSON through CrossRef's CORS-friendly CSL transform endpoint, with sequential browser fetches and a `citation-js` fallback when direct fetch is unavailable.
2. **PubMed/PMID** — one or more `PMID:<number>` entries per paste. Resolved through the authenticated WordPress REST proxy to a fixed NCBI/PMC CSL endpoint; PMID input is validated as numeric before any outbound request.
3. **BibTeX** — one or more entries per paste. Detected by `@type{` boundaries. Parsed to CSL-JSON via `citation-js` (client-side).
4. **Mixed** — a paste containing DOIs, PubMed/PMID entries, and BibTeX entries, separated by blank lines.
5. **Free-text formatted citations** — heuristic parser for books, journal articles, chapters, webpages/social posts, reviews, and theses/dissertations. Support is best-effort; unsupported inputs fail closed with a block-local notice.
6. **Manual entry** — structured form with Publication Type, Author(s), Title, Container, Publisher, Year, Pages, DOI, and URL fields.

### Citation Styles (1.0)

Default: **Chicago Manual of Style — Notes-Bibliography**. Nine styles are selectable:

-   Chicago Notes-Bibliography
-   Chicago Author-Date
-   APA 7
-   Harvard
-   Vancouver
-   IEEE
-   MLA 9
-   OSCOLA
-   ABNT (Associação Brasileira de Normas Técnicas / NBR 6023:2018)

Changing styles reformats all auto-generated citations and preserves manual display overrides. Future phases may extend this to custom CSL file uploads.

---

## Block Attributes

```json
{
	"citationStyle": {
		"type": "string",
		"default": "chicago-notes-bibliography"
	},
	"headingText": {
		"type": "string",
		"default": ""
	},
	"outputJsonLd": {
		"type": "boolean",
		"default": true
	},
	"outputCoins": {
		"type": "boolean",
		"default": false
	},
	"outputCslJson": {
		"type": "boolean",
		"default": false
	},
	"citations": {
		"type": "array",
		"default": [],
		"items": {
			"type": "object"
		}
	}
}
```

### Citation Object Schema

Each item in the `citations` array:

```json
{
	"id": "uuid-v4",
	"csl": {
		// Full CSL-JSON object as returned by DOI, PubMed/PMID, BibTeX, free-text, or manual-entry resolvers
		// See https://citeproc-js.readthedocs.io/en/latest/csl-json/markup.html
	},
	"displayOverride": null,
	"formattedText": "Auto-formatted citation text cache",
	"inputFormat": "doi",
	"parseWarnings": []
}
```

| Field             | Type             | Description                                                                                                                                                                                                                                                              |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`              | string (UUID v4) | Unique identifier for this citation entry                                                                                                                                                                                                                                |
| `csl`             | object           | Canonical CSL-JSON data. Source of truth for all metadata output.                                                                                                                                                                                                        |
| `displayOverride` | string or null   | If the user has manually edited the formatted display text, the edited version is stored here. When non-null, this text is rendered instead of the auto-formatted output. The `csl` object remains unchanged and continues to power JSON-LD, COinS, and CSL-JSON output. |
| `formattedText`   | string           | Persisted cache of the current auto-formatted bibliography text for the selected style. Derived from CSL data and safe to recompute.                                                                                                                                     |
| `inputFormat`     | enum             | `"doi"`, `"pmid"`, `"bibtex"`, `"freetext"`, or `"manual"`                                                                                                                                                                                                                |
| `parseWarnings`   | array            | Warning codes attached to imported records that need extra user review.                                                                                                                                                                                                  |

---

## Editor UX

Modeled on the core **Quote** and **List** blocks.

### Empty State

When the block is first inserted, the add-citation form is open by default and the textarea uses the placeholder text:

> Add DOI(s), PubMed/PMID records, BibTeX entries, and citations in supported styles for books, articles, chapters, and webpages. Separate multiple formatted citations with a blank line.

### Paste & Parse Flow

1. User pastes content into the input zone.
2. `parser.js` detects format(s) per entry:
    - Split on blank lines
    - Identify DOIs by regex: `/(?:https?:\/\/(?:dx\.)?doi\.org\/)?10\.\d{4,}\/[^\s]+/g`
    - Identify PubMed/PMID records by `PMID:<number>` / `pmid:<number>`
    - Identify BibTeX by `@` + type prefix: `/@\w+\{/`
    - Each detected entry is parsed independently
3. CrossRef resolves DOIs through the direct CSL transform endpoint; the authenticated WordPress REST proxy resolves PubMed/PMID records through the fixed NCBI/PMC CSL endpoint; `citation-js` parses BibTeX and remains a DOI fallback when direct browser fetch is unavailable.
4. Parsed CSL-JSON objects are assigned UUIDs, wrapped in citation objects, and appended to the `citations` array.
5. The array is re-sorted per the selected style family rules (see Sorting).
6. Validation feedback appears inside the block, attached to the add form, using Gutenberg notice primitives managed through the `core/notices` store:
    - Pure success messages may render as a block-local Gutenberg `Snackbar`.
    - Mixed-result, warning, and error feedback renders as an inline `Notice`.
    - Inline warning / error notices persist until dismissed or replaced.
    - Duplicate-only batches, LaTeX/BibLaTeX input, oversized input, and unsupported input all surface notice feedback instead of failing silently.
    - Notice state is managed through the `core/notices` data store in a block-specific context rather than a plugin-local state-only system.

### Rendered List (Editor View)

Below the add form, the sorted bibliography is rendered as a live preview. Each entry:

-   Displays the formatted citation text (from the selected CSL-backed bibliography style, or `displayOverride` if set).
-   Clicking the row opens editing: heuristic/warning-marked entries prefer structured field editing; other entries open plain-text editing.
-   On hover or focus, shows compact inline action controls:
    -   **Edit fields** — edits parsed CSL-backed fields and re-renders from structured data.
    -   **Edit** — edits only the visible display text and stores `displayOverride`.
    -   **Reset edits** — clears `displayOverride` and restores the current auto-formatted output.
    -   **Delete** — removes the entry immediately and shifts focus to the next logical target.
-   Entries are not manually reorderable. Sort order is automatic and deterministic.

### Persistent Paste Zone

The add-citation form appears above the rendered list when expanded, allowing the user to add more entries incrementally. Adding new entries triggers a re-sort of the full list.

### Block Toolbar

Three buttons in the block toolbar control the add-citation form:

-   **Paste / Import** — switches to the paste/import textarea. Auto-expands if collapsed.
-   **Manual Entry** — switches to the structured manual entry form. Auto-expands if collapsed.
-   **Expand/Collapse** (chevron) — toggles the add-citation form visibility. Only appears when citations exist.

### Inspector Panel

-   **Citation Style** — selectable. The default is **Chicago Notes-Bibliography**.
-   **Visible Heading** — optional text shown above the bibliography on the front end only when at least one citation exists.
-   **Metadata output controls** — JSON-LD on by default, with optional COinS and CSL-JSON toggles.
-   **Entry count** — e.g., "Settings (12 sources)"
-   **Exports** — Copy bibliography, Download CSL-JSON, Download BibTeX, Download RIS.

---

## Sorting

### Bibliography sort order

Entries are sorted by style family rules. The current baseline:

#### Chicago Notes-Bibliography

1. **First author last name** — alphabetical (case-insensitive). For institutional/corporate authors, use the full name.
2. **Title** — alphabetical (case-insensitive), ignoring leading articles ("A", "An", "The").
3. **Publication year** — ascending (oldest first). Entries with no date sort last.

#### Chicago Author-Date / APA / other author-date styles

1. **First author last name** — alphabetical (case-insensitive). For institutional/corporate authors, use the full name.
2. **Publication year** — ascending (oldest first). Entries with no date sort last.
3. **Title** — alphabetical (case-insensitive), ignoring leading articles ("A", "An", "The").

The sort is applied:

-   After every paste/parse operation
-   After a deletion
-   The `citations` array itself is stored in sorted order (the array index reflects the display order)

### Implementation

`citeproc-php` can output formatted citations for a given style. However, since we store and manage the array ourselves, we implement sorting independently in `sorter.js` using CSL-JSON field access:

```
Primary:   csl.author[0].family || csl.author[0].literal
Secondary: csl.issued["date-parts"][0][0]  (year)
Tertiary:  csl.title
```

---

## Frontend Render (Static Save)

The `save()` function produces the following HTML structure. All content is baked into the post at save time.

### 1. Semantic HTML with DPUB-ARIA

```html
<section
	class="wp-block-bibliography-builder-bibliography"
	role="doc-bibliography"
	aria-label="Bibliography"
>
	<ul>
		<li
			id="ref-{id}"
			lang="{csl.language, if present}"
		>
			<cite>{formatted citation text or displayOverride}</cite>
			<span
				class="Z3988"
				aria-hidden="true"
				title="ctx_ver=Z39.88-2004&rft_val_fmt=...&rft.aulast=...&rft.date=...&rft.atitle=..."
			></span>
		</li>
		<!-- additional entries, in sort order -->
	</ul>

	<script type="application/ld+json">
		[
			{
				"@context": "https://schema.org",
				"@type": "ScholarlyArticle",
				"name": "...",
				"author": [
					{
						"@type": "Person",
						"familyName": "...",
						"givenName": "...",
						"name": "..."
					}
				],
				"datePublished": "...",
				"isPartOf": {
					"@type": "Periodical",
					"name": "...",
					"issn": "..."
				},
				"identifier": {
					"@type": "PropertyValue",
					"propertyID": "DOI",
					"value": "..."
				},
				"url": "https://doi.org/..."
			}
		]
	</script>

	<!-- optional COinS spans and CSL-JSON script block, depending on block settings -->
</section>
```

### 2. Semantic HTML Details

-   **`<section role="doc-bibliography" aria-label="Bibliography">`** — DPUB-ARIA landmark with explicit label for screen reader landmark navigation. The `aria-label` ensures discoverability even when no visible heading is present.
-   **`<ul>`** — unordered list for notes-based and author-date bibliography styles such as Chicago Notes-Bibliography, Chicago Author-Date, and APA.
-   **`<ol>`** — ordered list for numbered styles such as Vancouver and IEEE.
-   **`<li id="ref-{uuid}" lang="...">`** — each entry has a stable ID for potential future deep-linking. The `lang` attribute is set from CSL-JSON `language` when present, enabling correct screen reader pronunciation of foreign-language titles and author names. Newly saved output intentionally omits the older `doc-biblioentry` role; deprecated block versions retain it only so existing saved posts continue to validate.
-   **`<cite>`** — wraps the formatted citation text. Semantically correct: `<cite>` represents a reference to a creative work.
-   **`<span class="Z3988" aria-hidden="true">`** — optional COinS span, hidden from both visual display (CSS) and assistive technology (ARIA) since it contains only machine-readable metadata.

### 3. JSON-LD (Schema.org)

A single `<script type="application/ld+json">` block containing an array of typed objects. CSL-JSON types map to schema.org as follows:

| CSL-JSON `type`    | Schema.org `@type`                             |
| ------------------ | ---------------------------------------------- |
| `article-journal`  | `ScholarlyArticle`                             |
| `book`             | `Book`                                         |
| `chapter`          | `Chapter`                                      |
| `thesis`           | `Thesis`                                       |
| `report`           | `Report`                                       |
| `paper-conference` | `ScholarlyArticle` (with `isPartOf` → `Event`) |
| `webpage`          | `WebPage`                                      |
| (other/unknown)    | `CreativeWork`                                 |

**Author markup:** Each author is typed as `Person` with `familyName`, `givenName`, and `name`. If an ORCID is present in the CSL-JSON (sometimes provided by CrossRef), include `"sameAs": "https://orcid.org/..."` for author disambiguation.

**Publication context:** Journal articles include `isPartOf` typed as `Periodical` with `name` and `issn`. Books include `publisher` typed as `Organization`. Conference papers include `isPartOf` typed as `Event`.

**Identifiers:** DOIs are expressed as `PropertyValue` objects with `propertyID: "DOI"`. ISBNs use `isbn` directly. URLs are included as `url`.

### 4. CSL-JSON (optional)

A `<script type="application/vnd.citationstyles.csl+json">` block containing the raw CSL-JSON array when that output layer is enabled. This enables machine interoperability with academic tools that consume CSL-JSON directly.

### 5. COinS (Context Objects in Spans, optional)

When enabled, each `<li>` contains a `<span class="Z3988">` with an OpenURL-encoded `title` attribute. This is the mechanism by which browser-based citation managers (Zotero, Mendeley, Papers) detect and offer to import references from web pages.

The COinS `title` attribute encodes:

-   `ctx_ver=Z39.88-2004`
-   `rft_val_fmt` (format identifier for the type)
-   `rft.aulast`, `rft.aufirst` (author)
-   `rft.atitle` (article title) or `rft.btitle` (book title)
-   `rft.jtitle` (journal title)
-   `rft.date` (publication date)
-   `rft.volume`, `rft.issue`, `rft.spage`, `rft.epage`
-   `rft_id` (DOI URL)

---

## Frontend Styles

Chicago-style bibliographies use a **hanging indent** format:

```css
.wp-block-bibliography-builder-bibliography ul {
	list-style: none;
	padding-left: 0;
}

.wp-block-bibliography-builder-bibliography li {
	padding-left: 2em;
	text-indent: -2em;
	margin-bottom: 0.75em;
}

/* Hide COinS spans visually */
.wp-block-bibliography-builder-bibliography .Z3988 {
	display: none;
}
```

The plugin provides minimal, opinionated base styles. Theme authors can override via the block's class name.

---

## File Structure

```
bibliography/
├── bibliography-builder.php    # Plugin bootstrap + REST API endpoints
├── block.json                    # Block metadata & attributes
├── src/
│   ├── index.js                  # Block registration
│   ├── edit.js                   # Editor component
│   ├── save.js                   # Static save entrypoint
│   ├── save-markup.js            # Shared static save markup
│   ├── deprecated.js             # Block deprecation migrations
│   ├── editor.scss               # Editor-only styles
│   ├── style.scss                # Frontend bibliography styles
│   ├── components/
│   │   ├── citation-entry-body.js    # Per-citation row UI
│   │   ├── editor-canvas-notices.js  # Block-local notice display
│   │   └── structured-citation-editor.js  # Per-field structured editor
│   ├── hooks/
│   │   ├── use-block-notices.js      # Notice state management
│   │   ├── use-citation-editor-state.js  # Edit/structured-edit state
│   │   └── use-entry-focus.js        # Focus management after operations
│   └── lib/
│       ├── parser.js             # Input detection & parsing orchestration
│       ├── sorter.js             # Style-family bibliography sort comparator
│       ├── coins.js              # CSL-JSON → COinS builder
│       ├── jsonld.js             # CSL-JSON → Schema.org JSON-LD mapper
│       ├── deduplicate.js        # Duplicate citation detection
│       ├── manual-entry.js       # Manual entry fields & validation
│       ├── export.js             # CSL-JSON, BibTeX, RIS export
│       ├── clipboard.js          # Copy-to-clipboard utility
│       ├── wp-icons.js           # Wrapped Gutenberg icon imports
│       └── formatting/           # Style registry + CSL-backed formatting
├── package.json
└── readme.txt                    # WordPress.org readme
```

### No server-side rendering required

With static save and no Highwire meta tags in MVP, the PHP side is minimal:

-   `bibliography-builder.php` — standard plugin header, calls `register_block_type()` pointing at `block.json`, enqueues editor and frontend assets.
-   No custom database tables.
-   Read-only REST API endpoints at `/wp-json/bibliography/v1/posts/<post_id>/bibliographies` and `/wp-json/bibliography/v1/posts/<post_id>/bibliographies/<index>` for programmatic bibliography access, including JSON, plain-text, and CSL-JSON response formats.
-   No `render_callback`.
-   No `wp_head` hooks.

---

## Build & Development

### Prerequisites

-   Node.js 18+
-   npm 9+
-   Composer (for PHP tooling)
-   `@wordpress/scripts` (dev dependency)

### Commands

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
npm run test:e2e             # Playwright smoke suite
npm run test:e2e:playground  # Playground-based Playwright smoke suite
npm run test:e2e:lifecycle   # Plugin lifecycle e2e tests
npm run test:a11y            # Playwright keyboard + axe-core accessibility gate
npm run test:runtime:local   # Docker-based runtime smoke
composer test:php            # PHPUnit REST and bootstrap tests
composer test:php:coverage   # PHP coverage for Codecov
composer analyze:php         # Psalm static analysis
```

### Key dependency: `citation-js`

`citation-js` is a modular library. For MVP, the required plugins:

```json
{
	"dependencies": {
		"@citation-js/core": "0.7.18",
		"@citation-js/plugin-doi": "0.7.18",
		"@citation-js/plugin-bibtex": "0.7.18"
	}
}
```

These handle:

-   `plugin-doi`: DOI string → CSL-JSON fallback support when direct CrossRef fetch is unavailable
-   `plugin-bibtex`: BibTeX string → CSL-JSON

Formatted bibliography strings are generated locally through `citeproc-php` using plugin-owned GPL-compatible CSL style and locale fixtures. Do not bundle the official CSL style or locale repositories in the WordPress.org release package.

---

## Error Handling

### Parse Failures

-   **Unresolvable DOI** (CrossRef returns 404): skip the entry, include it in the failure count, surface the raw input in the error message so the user can correct and retry.
-   **Malformed BibTeX**: `citation-js` throws on invalid syntax. Catch, skip, and report.
-   **Network failure** (DOI resolution requires fetch): surface a "Could not connect to CrossRef. Check your internet connection." notice. Allow retry.

### Edit Safeguards

-   **Plain-text editing** — the user can edit display text arbitrarily via `displayOverride`. Malformed edits affect only the visible text; the CSL-JSON and all machine-readable output remain intact.
-   **Structured field editing** — heuristic (free-text) and warning-marked entries open a per-field editor. Saves write back to CSL-JSON and re-render the formatted text.
-   **Reset to auto-format** — clears `displayOverride` and restores the current auto-formatted output from CSL-JSON.
-   **Duplicate detection** — new citations are checked against existing entries by DOI, title, or author+year. Duplicates are skipped with a notice.

---

## Security

This plugin accepts untrusted input from two sources — user-pasted text and CrossRef API responses — and renders output into post content as HTML. Every data path from input to rendered output is a potential injection vector and must be sanitized.

### Threat Model

| Threat                              | Vector                                                                             | Impact                                                       | Mitigation                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| Stored XSS via pasted input         | Malicious BibTeX entry with `<script>` in title/author fields                      | Script execution for all visitors to the post                | Sanitize all CSL-JSON string values before rendering                 |
| Stored XSS via display override     | User (or compromised editor account) types HTML/JS into the editable citation text | Script execution for all visitors                            | Escape all `displayOverride` text at render time                     |
| Stored XSS via CrossRef API         | Compromised or malicious DOI metadata containing HTML/JS                           | Script execution for all visitors                            | Treat API responses as untrusted; sanitize identically to user input |
| JSON-LD breakout                    | CSL-JSON field containing `</script>`                                              | Breaks out of JSON-LD script block, enables script injection | JSON-encode values and escape `</` sequences                         |
| COinS attribute injection           | CSL-JSON field containing `"` or other attribute-breaking characters               | HTML attribute injection                                     | URL-encode all values in COinS `title` attribute                     |
| Block validation bypass             | Crafted attributes that pass editor validation but render malicious output         | Depends on payload                                           | Sanitize at render time (save.js), not only at parse time            |
| Prototype pollution via citation-js | Malicious BibTeX crafted to exploit JS object parsing                              | Arbitrary code execution in editor context                   | Pin citation-js version; validate parsed output shape                |
| Denial of service via paste         | Extremely large paste (thousands of DOIs) triggering mass API requests             | Browser tab crash, CrossRef rate limiting                    | Cap max entries per paste; queue/throttle DOI lookups                |

### Sanitization Strategy

**Principle: sanitize at the point of output, not only at the point of input.** Data may be re-processed, re-sorted, or transformed between parse and render. Sanitizing at render time in `save.js` is the last line of defense and must never be skipped.

#### HTML Output (cite elements)

All text rendered inside `<cite>` elements must be escaped for HTML context. This applies to both auto-formatted output from `citation-js` and `displayOverride` strings.

Escape at minimum:

-   `&` → `&amp;`
-   `<` → `&lt;`
-   `>` → `&gt;`
-   `"` → `&quot;`
-   `'` → `&#x27;`

Use the `@wordpress/escape-html` package (`escapeHTML()`) or React's default JSX escaping (which handles this automatically when values are passed as text children, not via `dangerouslySetInnerHTML`).

**Critical rule: never use `dangerouslySetInnerHTML` for citation text.** Formatter output must be stored and rendered as plain text. If a formatter returns HTML-formatted output (e.g., italicized titles), parse or strip it server-side and save only inert text; visible emphasis is applied later through React elements derived from CSL-JSON field inspection.

#### JSON-LD Script Block

The JSON-LD `<script>` block must not be breakable by field values. Two layers of defense:

1. **`JSON.stringify()`** — inherently escapes quotes and special characters within string values.
2. **Escape `</` sequences** — `JSON.stringify` does not escape `</`, which can close a `<script>` tag mid-string. Post-process the JSON string to replace `</` with `<\/`:

```javascript
const jsonLd = JSON.stringify(schemaData).replace(/</g, '\\u003c');
```

This is a standard defense for inline JSON in script blocks (recommended by OWASP).

#### CSL-JSON Script Block

Same treatment as JSON-LD — `JSON.stringify()` with `</` escaping.

#### COinS Attribute

The COinS `title` attribute value is a URL-encoded query string. All CSL-JSON field values inserted into the OpenURL string must be encoded with `encodeURIComponent()`. The entire assembled string is then placed in an HTML attribute, so the attribute value itself must also be HTML-escaped (React handles this automatically for attribute values in JSX).

#### BibTeX Input

BibTeX entries can contain LaTeX commands (e.g., `\textbf{}`, `\emph{}`). `citation-js`'s BibTeX parser handles LaTeX-to-Unicode conversion. However:

-   Verify that `citation-js` does not pass through raw LaTeX commands as-is when it cannot interpret them.
-   Treat any unrecognized LaTeX command output as plain text (escape it, don't attempt to render it as markup).

#### CSL-JSON Shape Validation

After parsing (from any source — DOI, BibTeX, or future raw text), validate the resulting CSL-JSON object shape before storing it in block attributes:

-   `type` must be a known CSL type string.
-   `title` must be a string (not an object or array).
-   `author` must be an array of objects with string `family`/`given`/`literal` fields.
-   `issued` must conform to CSL date structure.
-   Reject or sanitize any fields that don't match expected types.

This prevents prototype pollution and unexpected object shapes from propagating into the rendering pipeline.

### Rate Limiting & Resource Caps

-   **Max entries per paste:** cap at a reasonable limit (e.g., 50 entries). Reject or truncate pastes exceeding this with a user-facing message.
-   **DOI resolution throttling:** queue DOI lookups and process them sequentially or in small batches (e.g., 3 concurrent requests). This prevents browser tab exhaustion and respects CrossRef's rate limits.
-   **Total citations per block:** consider a soft cap (e.g., 500 entries) with a warning. Extremely large bibliographies could cause slow editor performance due to re-rendering and re-sorting.

### WordPress-Specific Considerations

-   **Block attributes are stored in post content as an HTML comment.** The `citations` array (including all CSL-JSON) is serialized into the `<!-- wp:bibliography-builder/bibliography {...} -->` comment. This means the full data payload is in the database and in the HTML source. Ensure no sensitive data leaks into this structure beyond what's intended for public output.
-   **User capability check:** only users with `edit_posts` capability can insert or modify blocks. The block editor enforces this natively, and the current read-only REST endpoint independently verifies access: published posts are readable publicly, while non-public posts require `current_user_can( "edit_post", $post_id )`.
-   **Nonce verification:** not needed for the current read-only GET REST endpoint. Required if future phases add mutating AJAX/REST actions or other server-side processing.

### Dependency Security

-   **Pin `citation-js` to a specific minor version** in `package.json` (not `^` range) to prevent unexpected behavior from upstream updates.
-   **Audit dependencies** on each release: `npm audit` should be part of the release checklist.
-   **Monitor `citation-js` for security advisories.** The library processes structured input (BibTeX, RIS) and makes network requests (CrossRef), making it a meaningful part of the attack surface.

---

## Accessibility

Scholarly content serves users across a wide range of abilities and assistive technologies. Because this plugin generates both editor UI and static frontend output, accessibility must be addressed in both contexts.

### Frontend Output (Static Save)

#### Semantic Landmarks

-   **`<section role="doc-bibliography">`** — DPUB-ARIA landmark. Screen readers with landmark navigation (NVDA: `d`, VoiceOver: rotor) can jump directly to the bibliography. Include an `aria-label="Bibliography"` on the section for clarity, since the block may not always have a visible heading.
-   **`<li id="ref-{uuid}">`** — gives each entry a durable target for future in-page linking from inline citations. Current saved output relies on native list semantics instead of the older `doc-biblioentry` role; deprecated block versions preserve that role only for existing saved markup.
-   **`<cite>`** — semantically marks the reference to a creative work. Screen readers that support semantic HTML will convey this appropriately.

#### Language Attributes

Citations frequently reference works in languages other than the page's primary language. If the CSL-JSON includes a `language` field (e.g., `"fr"`, `"de"`, `"ja"`), set the `lang` attribute on the corresponding `<li>` element:

```html
<li id="ref-abc123" lang="fr">
	<cite
		>Derrida, Jacques. 1967. <i>De la grammatologie</i>. Paris: Éditions de
		Minuit.</cite
	>
	<span class="Z3988" title="..."></span>
</li>
```

This tells screen readers to switch pronunciation engines for that entry, which matters for author names, titles, and publication venues. Without it, a French title read with English phonetics is unintelligible.

When `displayOverride` is set, the `lang` attribute should still reflect the CSL-JSON `language` field, since the override is typically a corrected version of the same citation in the same language.

#### Reading Order & Hidden Content

-   The `<script>` blocks (JSON-LD, CSL-JSON) are naturally ignored by screen readers.
-   COinS `<span class="Z3988">` elements are hidden with both `display: none` in CSS and `aria-hidden="true"` in the markup, ensuring no screen reader announces these metadata-only spans.

#### Forced Colors / High Contrast Mode

The bibliography's hanging indent and typography must remain readable in Windows High Contrast Mode and other forced-color environments:

-   Do not rely on `background-color` or `box-shadow` alone to convey structure.
-   The hanging indent (`text-indent: -2em; padding-left: 2em`) is purely geometric and survives forced colors.
-   If future phases add visual indicators (e.g., colored badges for citation type), include a text or icon fallback that is visible in forced-color mode. Use `@media (forced-colors: active)` to test and adjust.

### Editor UI

#### Paste Zone

-   The paste zone is a standard `<textarea>` with an associated label (screen-reader-only is acceptable as long as it remains present).
-   Placeholder text ("Add DOI(s), PubMed/PMID records, BibTeX entries, and citations in supported styles for books, articles, chapters, and webpages. Separate multiple formatted citations with a blank line.") must be supplemented by a label — placeholder text alone is not accessible, as it disappears on focus and is not announced by all screen readers.

#### Async State Communication (DOI Resolution)

DOI resolution requires a network fetch to CrossRef, which may take several seconds. This async state must be communicated to screen reader users:

1. **Loading state.** When a paste triggers DOI resolution, set `aria-busy="true"` on the bibliography list region. Optionally show a visual spinner or "Resolving DOIs…" text.
2. **Completion announcement.** Use an `aria-live="polite"` region to announce the result when parsing completes. Current notice wording is short and action-oriented, for example:
    - `Added 3 citations.`
    - `No new citations added. Skipped 1 duplicate.`
    - `This looks like LaTeX, not a bibliography entry. Paste a DOI, PMID, BibTeX entry, or supported citation instead.`
3. **Dismiss/clear behavior.** Inline notices need an explicit dismiss button, pure-success snackbars should auto-dismiss, and typing or mode-switching in the add UI should clear the current notice.
4. **Notice locality.** The implementation intentionally keeps feedback block-local instead of sending all messages through the global editor snackbar region. Pure success states may use a local Gutenberg snackbar, while richer parse/import validation stays inline next to the add form. This preserves nearby context for mixed-result feedback and still aligns success handling more closely with Gutenberg norms.

#### Focus Management

Focus is managed deliberately after state-changing actions so keyboard and screen reader users do not get lost. The current implementation already applies the following focus recovery rules:

| Action                        | Focus moves to…                                                                |
| ----------------------------- | ------------------------------------------------------------------------------ |
| Successful paste & parse      | The first newly added entry in the sorted list                                 |
| Partial parse (some failures) | The validation notice / error message                                          |
| Delete an entry               | The next sibling entry in the list, or the paste zone if the list is now empty |
| Edit an entry (activate)      | The editable text field for that entry                                         |
| Edit an entry (confirm/blur)  | The entry's `<li>` container (or its edit button)                              |
| Cancel edit (Escape)          | The entry's `<li>` container (or its edit button)                              |

Implementation note: entry containers are programmatically focusable specifically for managed focus recovery, notice focus is intentional so screen readers announce parse results immediately, and deleting the final entry returns focus to the add-citations textarea.

#### Per-Entry Toolbar (Edit / Delete)

The hover toolbar for each citation entry must be fully keyboard-accessible:

-   Each entry container should be programmatically focusable for managed focus recovery after add/delete/edit actions.
-   Row action controls are real `<button>` elements (not divs with click handlers).
-   Buttons have descriptive `aria-label` attributes with entry-specific context, while visible labels/tooltips stay short.
-   The toolbar must be reachable via keyboard (not only visible on mouse hover). Use `:focus-within` on the entry container to show the toolbar when any child is focused.
-   In forced-color mode, toolbar buttons must have visible borders or outlines — do not rely solely on background color to make them visible.

#### Edit Mode

When the user activates Edit on a citation:

-   Plain-text edit uses a controlled text field; structured edit uses a labeled stacked form.
-   The editable region should have `role="textbox"` or native form semantics plus an accessible label such as `"Editing citation: Smith 2024"`.
-   Screen readers should hear a state-change notice such as `Editing citation. Press Escape to cancel.` or `Editing fields. Review and save to reformat.`
-   **Escape** cancels the edit and restores the previous state.
-   Save/confirm should restore focus to the edited entry.

#### Delete Confirmation

Current behavior uses immediate deletion without a custom Undo UI. For screen reader users, announce the deletion via `aria-live="polite"` and move focus to the next sibling entry or back to the add form if the list is empty.

#### Block Toolbar & Inspector

-   The citation style control is an interactive inspector `<select>` and must stay properly labeled for assistive technology. Style changes should announce the new style and any reformatting result.
-   The entry count ("12 citations") should be live-updated via `aria-live="polite"` when entries are added or removed.

### Testing Requirements

Accessibility testing is not optional and should be part of every release:

-   **Automated:** Use `@wordpress/scripts` lint rules plus `npm run test:a11y`, which drives WordPress Playground through `tests/e2e/a11y.spec.js`, verifies keyboard reachability/focus behavior, and runs `@axe-core/playwright` against the editor bibliography block and saved frontend bibliography output for WCAG 2.0/2.1 A/AA plus WCAG 2.2 AA tags.
-   **Browser-assisted audits:** Use axe DevTools, WAVE, or equivalent Chrome/Firefox tooling as a manual review layer before releases. These tools complement the automated gate; they do not replace keyboard-only and screen-reader testing.
-   **Keyboard-only navigation:** Manually verify the full workflow (add block → paste → review list → edit entry → delete entry → re-paste) using only Tab, Enter, Space, Escape, and arrow keys. No action should be unreachable.
-   **Focus-management regression coverage:** Keep automated coverage for the current managed focus flows:
    -   first-new-entry focus after a successful parse
    -   notice focus after partial parse, duplicate-only, or unsupported-input feedback
    -   next-entry focus after delete and add-form focus when deleting the last remaining entry
    -   focus restoration after plain-text edit save/cancel and structured field edit save/cancel
-   **Screen reader testing:** Test with at least NVDA (Windows) and VoiceOver (macOS). Verify:
    -   Bibliography landmark is discoverable.
    -   Paste zone label is announced.
    -   Loading/completion states are announced.
    -   Focus moves correctly after paste, edit, and delete.
    -   Per-entry toolbar buttons are announced with descriptive labels.
    -   Edit mode entry/exit is announced.
    -   Language switching occurs on entries with `lang` attributes.
-   **Forced colors:** Test in Windows High Contrast Mode. Verify all interactive elements (buttons, focus rings, editable regions) remain visible and distinguishable.
-   **Zoom / text scaling:** Verify the bibliography layout (hanging indent) remains readable at 200% browser zoom and with user-configured large text sizes. The hanging indent values should use `em` units (not `px`) to scale with text.

---

## Testing Strategy

Testing framework: `@wordpress/scripts` includes Jest for unit/integration tests. Use `@wordpress/e2e-test-utils` with Playwright for end-to-end tests in a real WordPress environment. Security and accessibility tests are integrated into the relevant layers, not siloed.

### Unit Tests

#### `parser.js`

-   DOI detection: matches `10.1234/abc`, `https://doi.org/10.1234/abc`, `http://dx.doi.org/10.1234/abc`
-   DOI detection: rejects strings that look similar but are not DOIs (e.g., `10.abc/def`, partial matches inside URLs)
-   BibTeX detection: identifies `@article{`, `@book{`, `@inproceedings{` boundaries
-   BibTeX detection: handles entries with nested braces in field values
-   Mixed input: correctly splits a paste containing 2 DOIs and 1 BibTeX entry into 3 separate items
-   Empty/whitespace-only input: returns empty array, no errors
-   Input exceeding max entry cap (50): returns first 50 entries and a truncation warning
-   **Security:** BibTeX entry with `<script>` tag in title field — verify tag is present in raw parsed output (sanitization happens at render, not parse)
-   **Security:** BibTeX entry with LaTeX commands — verify `citation-js` converts or strips them, does not pass raw LaTeX through

#### `sorter.js`

-   Basic sort: three entries with different author last names → alphabetical order
-   Same author, different years: secondary sort by year ascending
-   Same author and year, different titles: tertiary sort by title alphabetical
-   No author field (institutional/anonymous): falls back to `literal` or title
-   No date field: entry sorts last
-   Non-Latin author names: verify consistent Unicode-aware comparison (e.g., `Ñ` sorts correctly)
-   Accented characters: `García` sorts with `G`, not after `Z`
-   Case insensitivity: `de Beauvoir` and `De Beauvoir` are equivalent
-   Single entry: returns array unchanged
-   Empty array: returns empty array

#### `coins.js`

-   Article-journal: generates correct `rft_val_fmt`, `rft.aulast`, `rft.aufirst`, `rft.atitle`, `rft.jtitle`, `rft.date`, `rft.volume`, `rft.issue`, `rft.spage`, `rft.epage`, `rft_id`
-   Book: generates correct `rft.btitle`, `rft.pub`, `rft.place`, `rft.isbn`
-   Missing fields: omits parameters rather than including empty values
-   **Security:** field value containing `&`, `=`, `"` characters — verify proper `encodeURIComponent()` encoding
-   **Security:** field value containing HTML entities — verify they don't decode into markup in the attribute

#### `jsonld.js`

-   Type mapping: every CSL-JSON `type` in the mapping table produces the correct schema.org `@type`
-   Unknown type: falls back to `CreativeWork`
-   Author construction: single author → `Person` with `familyName`, `givenName`, `name`
-   Multiple authors: array of `Person` objects
-   Corporate/institutional author: uses `literal` field as `name`, `@type` remains `Person` (or consider `Organization`)
-   ORCID present: includes `sameAs` with full URL
-   ORCID absent: no `sameAs` field (not null, not empty string — absent)
-   Journal article context: `isPartOf` → `Periodical` with `name` and `issn`
-   Book context: `publisher` → `Organization`
-   DOI identifier: `PropertyValue` with `propertyID: "DOI"`
-   **Security:** title containing `</script>` — verify the JSON output escapes this to `<\/script>` or `\u003c/script>`
-   **Security:** field containing Unicode null bytes or control characters — verify they are stripped or escaped
-   Output validation: resulting JSON-LD parses as valid JSON and validates against schema.org expectations

#### `save.js` (render output)

-   **Security — HTML escaping:** citation text containing `<img src=x onerror=alert(1)>` renders as escaped text, not as an element
-   **Security — displayOverride escaping:** override text containing `<script>alert('xss')</script>` renders as escaped text
-   **Security — JSON-LD breakout:** citation with title `</script><script>alert(1)</script>` does not break out of the JSON-LD script block
-   **Security — CSL-JSON breakout:** same test for the CSL-JSON script block
-   **Security — COinS attribute:** citation with title containing `" onclick="alert(1)` does not inject attributes
-   `aria-label="Bibliography"` present on section element
-   `aria-hidden="true"` present on all COinS spans
-   `lang` attribute present on entries where CSL-JSON includes `language` field
-   `lang` attribute absent when CSL-JSON has no `language` field
-   `role="doc-bibliography"` on section, and no deprecated `role="doc-biblioentry"` on newly saved `<li>` elements
-   Each `<li>` has unique `id="ref-{uuid}"` attribute
-   JSON-LD is valid JSON and parseable
-   CSL-JSON array matches the `citations` attribute data

### Integration Tests

These tests run in a simulated block editor environment using `@wordpress/blocks` and `@wordpress/block-editor` test utilities.

#### Parse → Store → Render Cycle

-   Paste single DOI → verify `citations` array has 1 entry with correct CSL-JSON → verify rendered output contains formatted text and default JSON-LD output
-   Paste single BibTeX entry → same verification
-   Paste 5 DOIs (one per line) → verify 5 entries, correctly sorted
-   Paste 3 BibTeX entries → verify 3 entries, correctly sorted
-   Paste mixed input (2 DOIs + 1 BibTeX) → verify 3 entries, correctly sorted
-   Paste input with 1 valid DOI + 1 invalid DOI → verify 1 entry stored, 1 error reported
-   Paste input with 0 parseable content → verify 0 entries, error message displayed

#### Edit Flow

-   Edit an entry's display text → verify `displayOverride` is set, `csl` object unchanged
-   Edit an entry then cancel (Escape) → verify `displayOverride` remains null
-   Edit an entry that already has `displayOverride` → verify override is updated
-   Verify edited text appears in rendered HTML, while enabled machine-readable outputs still reflect original `csl` data

#### Delete Flow

-   Delete an entry from a 3-entry list → verify 2 entries remain, correctly sorted
-   Delete all entries → verify empty state with paste zone prompt
-   Delete an entry → verify the remaining entries stay sorted and focus moves predictably

#### Sort Stability

-   Add entries in non-alphabetical order → verify rendered order is alphabetical
-   Delete middle entry → verify remaining entries stay in correct order
-   Add a new entry to an existing list → verify it inserts at the correct sorted position

#### Block Validation

-   Save and reload a block with 3 entries → verify no block validation error
-   Save a block, modify the `citations` attribute outside the editor (simulate data corruption) → verify block enters recovery mode gracefully
-   **Security:** save a block with `displayOverride` containing HTML → reload → verify the HTML is escaped in the rendered output, not executed

### End-to-End Tests

Run in a real WordPress installation using Playwright via `@wordpress/e2e-test-utils-playwright`. These tests validate the full user workflow including network requests.

-   **Happy path:** create new post → add bibliography block → paste a real DOI → wait for resolution → verify entry appears → save post → view post on frontend → verify semantic HTML structure is present in page source
-   **Multi-entry:** paste 3 DOIs at once → verify all 3 resolve and render in sorted order
-   **Edit:** add entry → click a row or use action controls to edit → change text → confirm → save → verify displayOverride text appears on frontend
-   **Delete:** add 3 entries → delete one → save → verify 2 entries on frontend
-   **Error recovery:** paste an invalid DOI → verify error message appears → paste a valid DOI → verify it resolves normally
-   **Network failure simulation:** mock CrossRef to return 500 → paste DOI → verify user sees connection error message → unmock → paste again → verify success
-   **Persistence:** add entries → save → close editor → reopen → verify all entries present and correctly sorted
-   **Block removal:** add entries → save → deactivate plugin → view post → verify the bibliography HTML is still present and readable (static save portability test)

### Security Tests (Dedicated Suite)

A focused test suite for injection and sanitization. These can be unit tests but are grouped here for clarity.

#### XSS Prevention

| Test case                 | Input                                                           | Expected                                |
| ------------------------- | --------------------------------------------------------------- | --------------------------------------- |
| Script in BibTeX title    | `@article{test, title={<script>alert(1)</script>}}`             | `<script>` rendered as escaped text     |
| Script in displayOverride | User types `<img src=x onerror=alert(1)>`                       | Tag rendered as escaped text            |
| Event handler in title    | `@article{test, title={<div onmouseover=alert(1)>hover</div>}}` | Tag rendered as escaped text            |
| SVG injection             | `@article{test, title={<svg onload=alert(1)>}}`                 | Tag rendered as escaped text            |
| Mixed content             | `@article{test, title={Normal title<script>bad</script>}}`      | Full string visible, `<script>` escaped |

#### JSON-LD Injection

| Test case           | Input                                       | Expected                                             |
| ------------------- | ------------------------------------------- | ---------------------------------------------------- |
| Script tag breakout | Title: `</script><script>alert(1)</script>` | `</` escaped as `\u003c/` in JSON output             |
| Quote breakout      | Title: `"}, "malicious": "payload"`         | Quotes escaped by `JSON.stringify`, structure intact |
| Unicode null byte   | Title: `Test\x00Title`                      | Null byte stripped or escaped                        |

#### COinS Injection

| Test case          | Input                        | Expected                                                |
| ------------------ | ---------------------------- | ------------------------------------------------------- |
| Attribute breakout | Title: `" onclick="alert(1)` | Quotes encoded in URL component, no attribute injection |
| Ampersand in value | Author: `Smith & Jones`      | `&` encoded as `%26` in URL, `&amp;` in HTML attribute  |

#### Input Caps

| Test case             | Input                         | Expected                                                                              |
| --------------------- | ----------------------------- | ------------------------------------------------------------------------------------- |
| 100 DOIs in one paste | Paste with 100 DOI lines      | First 50 processed, message: "Maximum 50 entries per paste. 50 entries were skipped." |
| 10MB BibTeX paste     | Extremely large BibTeX string | Rejected before parsing with size warning                                             |

### Manual Testing Checklist

Manual tests that cannot be fully automated and should be performed before each release.

-   [ ] Paste 5+ real DOIs from different disciplines (sciences, humanities, law) and verify metadata accuracy
-   [ ] Paste a real-world BibTeX export from Zotero/Mendeley and verify all entries parse correctly
-   [ ] Install Zotero Connector browser extension and verify COinS detection on the frontend (Zotero should offer to save all bibliography entries)
-   [ ] Validate JSON-LD output with [Google Rich Results Test](https://search.google.com/test/rich-results)
-   [ ] Validate JSON-LD output with [Schema.org Validator](https://validator.schema.org/)
-   [ ] Full accessibility testing per the Accessibility section (keyboard navigation, NVDA, VoiceOver, forced colors, 200% zoom)
-   [ ] Test in all major browsers: Chrome, Firefox, Safari, Edge
-   [ ] Test block recovery: corrupt a block's attributes via the Code Editor, switch back to Visual, verify graceful recovery
-   [ ] Test plugin deactivation: create a post with bibliography, deactivate plugin, verify HTML remains intact and readable
-   [ ] Performance spot-check: add 50+ entries to a single block and verify the editor remains responsive (no perceptible lag on sort/re-render)

---

## Roadmap & Future Features Backlog

### Shipped in 1.0

The following features originally planned for later phases shipped in 1.0:

-   **Free-text citation parsing** (originally Phase 2) — heuristic parser for books, articles, chapters, webpages, reviews, and theses.
-   **Manual entry** (originally Phase 2) — structured form with Publication Type, per-field editing, and validation.
-   **Nine citation styles** (originally Phase 3) — style selector, automatic `<ul>`/`<ol>` switching, reformatting on style change.
-   **Structured field editing** (originally Phase 4) — per-field editor for heuristic/warning-marked entries, reset to auto-format.
-   **Duplicate detection** (originally Phase 8) — DOI, title, and within-batch deduplication.
-   **Export** (originally Phase 7) — CSL-JSON, BibTeX, RIS downloads; per-entry copy citation; copy full bibliography.
-   **REST API** (originally Phase 7) — read-only endpoints with JSON, text, and CSL-JSON format support.

### Future: Enhanced Input

PMID support shipped in 1.2. Future identifier support should use a resolver layer, not format-specific parser hacks. Each resolver must validate identifiers before outbound requests, use fixed upstream hosts or vetted provider adapters, avoid SSRF-prone arbitrary URL fetches, normalize results to CSL-JSON, and keep CSL-JSON as the source of truth for save output, exports, JSON-LD, COinS, and CSL-JSON script blocks.

| Identifier | Status | Evaluation |
| --- | --- | --- |
| **ISBN-10 / ISBN-13** | Planned support | High-value next book/monograph importer. Accept `ISBN:` prefixes plus bare, hyphenated, or spaced ISBNs; validate ISBN-10/ISBN-13 checksums before lookup; evaluate metadata providers and terms before choosing a resolver. |
| **PMCID** | Planned support | Strong biomedical follow-up to PMID. Resolve through the same authenticated WordPress REST proxy pattern; prefer NCBI-derived CSL/PMID/DOI metadata when available. |
| **arXiv ID** | Planned support | High-value scholarly preprint importer. Accept modern and legacy arXiv identifiers; resolve through arXiv metadata APIs; map to CSL article/report-ish records while preserving DOI/journal data when present. |
| **ISSN** | Evaluate | Identifies a serial, not a specific cited work. Useful for journal/periodical enrichment and validation, but should not create a standalone bibliography entry unless paired with article-level metadata. |
| **URL** | Evaluate | Useful but risky and unreliable. Consider after fixed-host identifiers; require strict timeout, content-type, size, redirect, and allowlist/denylist controls; prefer standards-based metadata (`citation_*`, Open Graph, JSON-LD, COinS) over arbitrary scraping. |
| **OCLC / WorldCat** | Evaluate | Useful for library/book workflows and edition disambiguation. Needs API/access/licensing review and careful mapping from edition/work records to CSL `book`. |
| **ORCID** | Evaluate as enrichment only | Identifies people, not publications. Useful for author enrichment and disambiguation in manual/resolved records, but not a standalone citation import path. |
| **ISRC** | Evaluate niche media support | Identifies sound recordings. Could map to CSL `song`/audio records if a reliable resolver is available; lower priority than scholarly text identifiers. |
| **ISWC** | Evaluate niche media support | Identifies musical works/compositions. Potentially useful for music scholarship; resolver availability and CSL mapping need investigation. |
| **ISAN** | Evaluate niche media support | Identifies audiovisual works. Could support film/media bibliographies; requires resolver and CSL `motion_picture`/broadcast mapping review. |
| **EIDR** | Evaluate niche media support | Identifies movies/TV and related audiovisual assets. Similar to ISAN; useful for media studies if resolver access and metadata quality are acceptable. |

-   **RIS file import.** Accept `.ris` file uploads and parse to CSL-JSON. Enables bulk import from reference managers.
-   **Custom CSL file upload.** Allow users to upload a `.csl` file for any of the 10,000+ styles in the CSL repository.

### Future: In-Text Citation Integration

-   **Companion inline citation block or format.** A small inline element (e.g., `(Smith 2024)`) that references an entry in the bibliography block by ID. Clicking it in the editor scrolls to/highlights the bibliography entry.
-   **Anchor links.** Frontend `<a href="#ref-{id}">` links from inline citations to bibliography entries, and back-links from entries to their in-text occurrences.
-   **Automatic inline citation formatting.** The inline element auto-formats based on the bibliography block's style (e.g., `(Smith 2024)` for Chicago author-date, `[1]` for IEEE).

### Future: Google Scholar / Highwire Companion Plugin

A **separate plugin** that registers a scholarly article post type and injects Highwire Press meta tags for Google Scholar discoverability. See the Technical Notes section for why this is a separate concern from the bibliography block.

### Future: Site-Wide Citation Library

A central store (custom post type or taxonomy) for citations used across multiple posts. The bibliography block could reference entries from the library rather than storing them inline.

### Future: AI-Assisted Features

-   **Citation verification.** Cross-check pasted citations against known databases.
-   **Style detection.** Identify which citation style was used in pasted text.
-   **Suggested citations.** Given the post's content, suggest relevant citations from the user's library or from public databases.

### Future: Editor Bundle Optimization

The editor JS bundle is 759KB minified (248KB zip). The frontend loads zero JS. Bundle analysis (webpack `--json` stats) identified these optimization opportunities, roughly ordered by savings:

-   **Drop `buffer` polyfill.** The Node.js `Buffer` polyfill (`buffer/index.js`, ~49KB) is pulled in by citation-js internals. If citation-js can be patched or forked to use `Uint8Array`, this polyfill can be eliminated.
-   **Drop `fetch-ponyfill`.** The fetch polyfill (~22KB) is unnecessary in all modern browsers. citation-js could use native `fetch` directly.
-   **Cherry-pick `@wordpress/icons`.** The full barrel import (`@wordpress/icons/build-module/library/index.mjs`, ~28KB) is included even though only ~10 icons are used. Switching to direct imports from `@wordpress/icons/build-module/library/<icon>.js` would tree-shake the rest.

None of these are blocking for 1.0. The frontend is zero-JS and the editor bundle is comparable to other Gutenberg blocks that include rich processing (e.g., the core Table block with sorting). Revisit if users report slow editor load times.

### Runtime Testing Coverage

Multisite coverage is no longer a future gap. CI includes runtime smoke coverage for:

-   representative Apache and Nginx environments across supported PHP and WordPress versions
-   an Apache/PHP/latest-WordPress Multisite lane with network activation

SQLite is not currently part of the GitHub runtime matrix. Future runtime work should focus on keeping existing lanes stable and adding SQLite or other cases only when a compatibility risk justifies them.

---

## Technical Notes & Decisions Log

### Why `citation-js` plus `citeproc-php` over bundled citeproc-js?

`citation-js` remains the best fit for BibTeX parsing and fallback DOI support in the editor. Primary browser DOI resolution uses CrossRef's CSL transform endpoint directly because that path works in WordPress Playground without `doi.org` content-negotiation redirects. Formatting is handled by `citeproc-php` on a local WordPress REST endpoint so the editor bundle does not include citeproc-js and the WordPress.org package can avoid non-GPL-compatible CSL/citeproc-js licensing concerns. The block still saves static plain-text output in post content; PHP formatting is an editor-time service, not a frontend render callback.

Because formatter requests depend on `citeproc-php`, any WordPress Playground demo that exercises editor formatting must load PHP `intl`. There are three Blueprints: `playground/blueprint.json` (README "Release" badge — latest GitHub Release ZIP via the CORS proxy), `playground/blueprint-main.json` (README "Main build" badge — the rolling `main-preview` pre-release ZIP that CI's `publish-main-preview` job refreshes on every push to `main`, after the full CI suite passes and only when the commit is still `main`'s tip), and `.wordpress-org/blueprints/blueprint.json` (WordPress.org Preview button). Keep all three configured with both `phpExtensionBundles: ["kitchen-sink"]` and `features: { "networking": true, "intl": true }`. The bundle form matches WordPress.org Preview guidance, while the explicit `features.intl` flag is required by the live browser Playground runtime to avoid `bibliography_builder_formatter_extension_missing` fallback notices. Live browser Playground cannot use `git:directory` (WordPress/wordpress-playground#3875), which is why the main build ships as a rolling release asset.

### Why the editor uses wrapped `@wordpress/icons` imports

The editor UI now uses standard Gutenberg icons, but it does so through a small local wrapper module instead of importing from the `@wordpress/icons` barrel directly.

In this project, direct barrel imports from `@wordpress/icons` previously triggered webpack resolution failures around the package's ESM modules and `react/jsx-runtime`, which in turn could break block registration in the editor. The current implementation avoids that failure mode by:

1. Importing only the specific icon modules needed from `@wordpress/icons/build-module/library/*.mjs`
2. Wrapping those icon elements in local React components in `src/lib/wp-icons.js`
3. Adding a webpack `resolve.alias` for `react/jsx-runtime` and `react/jsx-dev-runtime`

This gives the block standard Gutenberg iconography without relying on a fragile `wp.icons` runtime externalization path.

If a future dependency upgrade makes direct `@wordpress/icons` imports reliable again, the wrapper module can be simplified or removed. Until then, `src/lib/wp-icons.js` is the supported integration point for editor icons.

### Why static save over dynamic rendering?

-   **Portability.** The HTML survives plugin deactivation. This is non-negotiable for scholarly content.
-   **Performance.** No PHP execution on every page load. The HTML is served directly from the database.
-   **Caching.** Works perfectly with page caching, CDNs, and static site generators.
-   **Tradeoff.** Changing the output format requires a block deprecation and migration. This is acceptable because the output format should change rarely and deliberately.

### Why `displayOverride` instead of editing CSL-JSON directly?

-   Editing CSL-JSON fields requires a structured form UI and validation logic.
-   Arbitrary text editing remains immediately intuitive for quick visible corrections.
-   Keeping CSL-JSON canonical ensures machine-readable output remains well-formed even if the user adjusts visible text.
-   The structured field editor now exists for heuristic/warning-marked entries, and manual entry is also available as a general fallback creation path.

### Why no Highwire meta tags in this plugin?

Google Scholar inclusion requires the **site** to primarily host scholarly content, with each article on a separate URL and a visible abstract. Highwire tags describe the page itself as a scholarly work — they don't describe works cited on the page. A blog post with a bibliography block is not a journal article. Injecting Highwire tags on arbitrary posts would be semantically incorrect and would not achieve Google Scholar inclusion. This concern belongs in a separate companion plugin that establishes the right post type and site structure. See Roadmap Phase 6.

### CrossRef Request Policy

CrossRef's public API is free and keyless. Browser-based DOI resolution uses CrossRef's CSL transform endpoint directly because it works in WordPress Playground without `doi.org` content-negotiation redirects. Browser fetches cannot set a custom `User-Agent`, and the plugin does not currently collect a contact email for a `mailto` parameter, so request policy focuses on fixed-host lookup, input validation, sequential DOI resolution, and deduplication. If a future server-side DOI proxy or settings page is added, revisit polite-pool contact configuration there.

---

## References

-   [CSL-JSON Schema](https://citeproc-js.readthedocs.io/en/latest/csl-json/markup.html)
-   [Citation Style Language — Styles Repository](https://github.com/citation-style-language/styles)
-   [citation-js Documentation](https://citation.js.org/)
-   [Schema.org — ScholarlyArticle](https://schema.org/ScholarlyArticle)
-   [DPUB-ARIA Roles](https://www.w3.org/TR/dpub-aria-1.0/)
-   [COinS / OpenURL Specification](https://www.niso.org/publications/z3988-2004-r2010)
-   [Google Scholar Inclusion Guidelines](https://scholar.google.com/intl/en/scholar/inclusion.html)
-   [Academic Blogger's Toolkit (archived)](https://github.com/dsifford/academic-bloggers-toolkit)
