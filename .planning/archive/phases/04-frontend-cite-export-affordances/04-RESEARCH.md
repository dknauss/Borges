# Phase 4: Frontend Cite/Export Affordances — Research

**Researched:** 2026-05-10
**Domain:** Gutenberg static-save HTML, data-URI download links, `<details>`/`<summary>` disclosure, per-entry export generation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **UI pattern:** Per-entry `<details>`/`<summary>` disclosure widget beneath each citation row.
- **JS strategy:** Progressive enhancement — no-JS baseline is fully functional. Export links are static `<a>` elements with `href` pointing to data URIs baked into `save()` HTML. No JS is loaded on the frontend for this feature.
- **Export formats (all four ship in Phase 4):** BibTeX, RIS, CSL-JSON, BibLaTeX.
- **Cite action source:** Uses already-rendered citation HTML already present in the `<li>`. The Cite panel displays the visible formatted text; copy-to-clipboard (JS enhancement) strips HTML. No extra data attribute required for the no-JS case.
- **No-JS baseline:** `<details>`/`<summary>` is fully native; export download links are static `<a href="data:...">` data URIs embedded in `save()` HTML.
- **Architecture constraints:**
  - All changes go into `save.js` / `save-markup.js` — no `render_callback`.
  - No regression in plugin-deactivation resilience: saved HTML must remain valid and readable when plugin is deactivated.
  - REST formatter endpoint is editor-only; not called on frontend for this feature.
  - Export generation reuses `src/lib/export.js` on the save path.

### Claude's Discretion
- Exact `<details>`/`<summary>` label text ("Cite", "Export", "↓ BibTeX", etc.)
- Whether data URIs are inlined per entry or generated via a small PHP-rendered attribute
- CSS styling for the disclosure panels (scope: block stylesheet, `src/style.scss`)
- Whether to add an optional copy-to-clipboard JS enhancement and how to ship it
- How BibLaTeX content is generated per-entry on the save path (mirroring editor export logic)

### Deferred Ideas (OUT OF SCOPE)
- PMCID/NBIB biomedical identifier export
- EndNote XML / CIW formats
- Writable bibliography REST routes
- Per-bibliography (block-level) bulk export panel — Phase 4 is per-entry only
</user_constraints>

---

## Summary

Phase 4 adds per-entry Cite and Export disclosure panels to the static `save()` HTML output so that front-end readers can access individual citation data without JavaScript. The baseline mechanism is native `<details>`/`<summary>` elements appended inside each `<li>`, with export download links implemented as static `<a href="data:...">` anchors baked into the saved markup.

The core constraint is that the saved HTML must remain fully readable after plugin deactivation — the `<details>` panels collapse by default and the citation text remains visible even if CSS fails to load. All export content generation runs at `save()` time in JavaScript (during the editor's block serialization pass), reusing the existing pure functions from `src/lib/export.js`.

The critical architectural discovery: BibTeX and BibLaTeX export builders (`buildBibtexExportContent`, `buildBiblatexExportContent`) are **async** because they dynamically import `@citation-js/core`. They cannot be called synchronously inside the JSX `save()` function. RIS (`buildRisExportContent`) and CSL-JSON (`buildCslJsonExportContent`) are synchronous and can be called directly. The planner must account for this async split — the async formats require either: (a) new synchronous single-entry wrappers that accept pre-resolved `Cite` instances, or (b) pre-computed export strings attached as a block attribute before save, or (c) a new approach for the save path.

**Primary recommendation:** Expose new synchronous, single-CSL-entry variants of the export functions (e.g., `buildBibtexEntryContent(csl, Cite)`, `buildBiblatexEntryContent(csl, Cite)`) that take a pre-loaded `Cite` constructor, then call them during `save()` via a resolved constructor cached once per block. Alternatively, a simpler approach is to store pre-computed export strings as block attributes alongside the CSL-JSON — computed once by the editor and written to `post_content` — which avoids async entirely in the save path.

---

## Standard Stack

### Core (already present in project)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@citation-js/core` | 0.7.18 | `Cite` class for BibTeX/BibLaTeX format() calls | Already a `dependency` in package.json |
| `@citation-js/plugin-bibtex` | 0.7.18 | `bibtex` and `biblatex` format strings | Already a `dependency` |
| `src/lib/export.js` | — | All export content builders, MIME types, filenames | Synchronous: RIS, CSL-JSON. Async: BibTeX, BibLaTeX |
| React JSX in `save-markup.js` | — | Static save output via Gutenberg block serialization | Pattern already established |
| `src/style.scss` | — | Frontend stylesheet (also loaded in editor) | Where disclosure panel CSS goes |

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `renderToStaticMarkup` | Testing save output in Jest | Already used in `save.test.js` |
| `block.json` attributes | Opt-in block features | If export strings are stored as attributes |
| `src/deprecated.js` | Block version migration | MUST add a new deprecated entry if `save()` output shape changes |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Data URI `<a>` links baked into save | Server-side rendered download endpoint | Locked out: no render_callback; requires plugin active |
| Data URI `<a>` links | Blob URL + JS | Blob URLs require JS; violates no-JS baseline |
| Per-entry data URIs | Block-level bulk download only | Out of scope (CONTEXT.md deferred) |

---

## Architecture Patterns

### Current `<li>` structure in save-markup.js

Each citation renders as:

```jsx
<li id={`ref-${citation.id}`} lang={...}>
  <EntryTag className="bibliography-builder-entry-text">
    {/* formatted text, italics, URL links */}
  </EntryTag>
  {outputCoins ? <span className="Z3988" ... /> : null}
</li>
```

Phase 4 appends a `<details>` element inside or immediately after the `<EntryTag>`, still inside the same `<li>`:

```jsx
<li id={`ref-${citation.id}`} lang={...}>
  <EntryTag className="bibliography-builder-entry-text">
    {/* citation text */}
  </EntryTag>
  {outputCoins ? <span className="Z3988" ... /> : null}
  <details className="bibliography-builder-cite-export">
    <summary>Cite / Export</summary>
    <div className="bibliography-builder-cite-panel">
      {/* Cite section: visible citation text (readable without JS) */}
      <p className="bibliography-builder-cite-text">{citationText}</p>
      {/* Export links */}
      <ul className="bibliography-builder-export-links">
        <li><a href={risDataUri} download="citation.ris">RIS</a></li>
        <li><a href={cslJsonDataUri} download="citation.csl.json">CSL-JSON</a></li>
        <li><a href={bibtexDataUri} download="citation.bib">BibTeX</a></li>
        <li><a href={biblatexDataUri} download="citation.biblatex.bib">BibLaTeX</a></li>
      </ul>
    </div>
  </details>
</li>
```

### Pattern 1: Synchronous data URI generation for RIS and CSL-JSON

RIS and CSL-JSON builders are synchronous — they can be called inline during `save()`:

```js
// Source: src/lib/export.js (cslToRisEntry is unexported; buildRisExportContent wraps an array)
// For single-entry use, the planner needs to expose or inline the per-entry logic.

// CSL-JSON for a single citation:
function buildSingleCslJsonDataUri(csl) {
  const content = JSON.stringify(csl, null, 2) + '\n';
  const encoded = encodeURIComponent(content);
  return `data:application/vnd.citationstyles.csl+json;charset=utf-8,${encoded}`;
}

// RIS for a single citation:
function buildSingleRisDataUri(csl) {
  // Reuse cslToRisEntry logic (currently unexported — needs export)
  const content = cslToRisEntry(csl);
  const encoded = encodeURIComponent(content);
  return `data:application/x-research-info-systems;charset=utf-8,${encoded}`;
}
```

### Pattern 2: Handling async BibTeX and BibLaTeX in save()

The Gutenberg `save()` function is synchronous. Dynamic imports are not allowed. Two viable approaches:

**Approach A — Pre-compute and store as block attribute (recommended)**

The editor computes BibTeX and BibLaTeX content for each citation when the editor state changes (on format), stores pre-computed export strings in the citation object, and `save()` reads them from attributes. This is the cleanest pattern for the static-save contract.

```js
// In the citation object stored in block attributes:
{
  id: 'abc',
  csl: { ... },
  formattedText: '...',
  // New fields (opt-in, computed by editor):
  exportBibtex: '@article{abc, ...}',
  exportBiblatex: '@article{abc, ...}',
}
```

**Approach B — Synchronous single-entry wrappers with pre-initialized Cite**

Add new synchronous export functions that accept a pre-initialized `Cite` instance (loaded once per block render). This would require loading citation-js before calling `save()` — not compatible with Gutenberg's synchronous save contract.

**Conclusion:** Approach A (store pre-computed BibTeX/BibLaTeX as citation attributes) is the correct pattern. The editor already computes `formattedText` and stores it; this follows the same model. The save path reads attributes, never calls async functions.

### Pattern 3: Data URI encoding for `<a href>` links

Plain-text content (RIS, CSL-JSON, BibTeX) must be `encodeURIComponent`-encoded in data URIs for cross-browser compatibility:

```js
// Correct — percent-encoded (no base64 overhead, readable, all browsers)
const dataUri = `data:text/x-bibtex;charset=utf-8,${encodeURIComponent(content)}`;
// <a href={dataUri} download="citation.bib">BibTeX</a>
```

Base64 is not required and adds 33% size overhead. Percent-encoding is the standard for text payloads.

**Size concern:** A single citation's BibTeX is typically 200–600 bytes. Per-entry data URIs for 50 citations across 4 formats would add roughly 40–120 KB to the saved HTML — acceptable but worth monitoring. The 50-entry cap (Phase 2 policy) bounds the worst case.

### Pattern 4: `<details>` CSS reset for hanging-indent compatibility

The current `li` uses `padding-left: 2em; text-indent: -2em` for hanging indent. The `<details>` element appended inside the `<li>` must reset those values:

```scss
.wp-block-bibliography-builder-bibliography .bibliography-builder-list > li > details {
  text-indent: 0;
  padding-left: 0;
  margin-top: 0.4em;
}

.wp-block-bibliography-builder-bibliography details.bibliography-builder-cite-export {
  // Reset inherited hanging-indent from li
  padding-left: 0;
  text-indent: 0;
}

.wp-block-bibliography-builder-bibliography details.bibliography-builder-cite-export summary {
  cursor: pointer;
  font-size: 0.875em;
  // Do not inherit citation font styling
  font-style: normal;
}
```

For numeric styles (`ieee`, `vancouver`), `li` uses `counter-increment` and `::before` marker — the `<details>` element inside these will not be affected by the counter itself, but the `text-indent` reset is still needed.

### Anti-Patterns to Avoid

- **Calling async export builders inside `save()`** — Gutenberg save is synchronous; async calls silently fail or produce empty output.
- **`dangerouslySetInnerHTML` for data URIs** — React already escapes attribute values; use JSX `href={dataUri}` directly, not innerHTML.
- **Storing export content in a new top-level block attribute (not per-citation)** — the citation array already owns per-citation data; adding a parallel top-level array creates sync bugs. Keep export strings inside the citation object.
- **Forgetting `deprecated.js`** — if the shape of a saved `<li>` changes (new child elements added), a new deprecated entry is needed so WordPress can migrate old save output without triggering block invalidation.
- **Omitting `download` attribute** — without `download`, browsers navigate to the data URI rather than downloading the file.
- **Using `blob:` URLs in save** — these are ephemeral and not valid in static save output.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RIS generation | Custom RIS serializer | `cslToRisEntry` in `export.js` (needs export) | Already handles all field types, page ranges, author formats, type mapping |
| CSL-JSON serialization | Custom JSON builder | `buildCslJsonExportContent` or inline `JSON.stringify(citation.csl)` | CSL-JSON is just the existing `.csl` property |
| BibTeX generation | Custom .bib serializer | `buildBibtexExportContent` + pre-storage pattern | Handles TeX ligature normalization, cite keys, all field types |
| BibLaTeX generation | Custom biblatex serializer | `buildBiblatexExportContent` + pre-storage pattern | Uses `@citation-js/plugin-bibtex` `biblatex` format, includes `date` vs `year` semantics |
| Data URI encoding | Custom base64 encoder | `encodeURIComponent(content)` | Native, no overhead, correct for text content |

**Key insight:** Every export format is already implemented and tested. The work is routing the output into `save()` attributes, not rebuilding the formatters.

---

## Common Pitfalls

### Pitfall 1: Async export builders in a synchronous save()
**What goes wrong:** Calling `buildBibtexExportContent` or `buildBiblatexExportContent` inside `save()` fails because they return Promises; the save function receives a Promise object, not a string, and the data URI becomes `data:...,Promise%20%7B%7D`.
**Why it happens:** Both builders dynamically import `@citation-js/core` and `@citation-js/plugin-bibtex` to avoid loading them on page render.
**How to avoid:** Pre-compute BibTeX and BibLaTeX content in the editor (where async is fine) and store as citation attributes. `save()` reads pre-stored strings only.
**Warning signs:** Data URI contains `%5BObject` or `Promise` in the rendered markup.

### Pitfall 2: Block invalidation from changed save() output
**What goes wrong:** Adding `<details>` elements to the `<li>` produces save output that does not match existing stored post content — WordPress shows "This block contains unexpected or invalid content" for all existing bibliography blocks.
**Why it happens:** Gutenberg compares stored markup against freshly serialized markup; any structural difference triggers invalidation.
**How to avoid:** Add the current save output as a new deprecated version in `src/deprecated.js` before changing `save()`. The deprecated entry's `save` function reproduces the current `<li>` shape exactly (without `<details>`).
**Warning signs:** Existing test fixtures in `src/deprecated.test.js` fail after changing `save-markup.js`.

### Pitfall 3: Hanging-indent CSS inheritance inside `<details>`
**What goes wrong:** The `<details>` element inherits `text-indent: -2em` and `padding-left: 2em` from the `<li>` rule, causing the disclosure panel to render with a large negative indent that breaks layout.
**Why it happens:** `text-indent` is an inherited CSS property; it flows from `li` into all child elements including `details` and its contents.
**How to avoid:** Add explicit CSS reset rules for `.bibliography-builder-cite-export` in `src/style.scss` with `text-indent: 0; padding-left: 0`.
**Warning signs:** In browser preview, the summary label appears shifted far left or the export panel content is indented incorrectly.

### Pitfall 4: `cslToRisEntry` is currently unexported
**What goes wrong:** The per-entry RIS builder (`cslToRisEntry`) is a private function in `export.js`. There is no single-citation RIS export function exposed for use in `save()`.
**Why it happens:** The existing API takes full citation arrays, not single CSL objects.
**How to avoid:** Export `cslToRisEntry` from `export.js`, or add a new exported `buildSingleRisContent(csl)` wrapper. Both require updating `export.test.js`.
**Warning signs:** Attempting to generate per-entry RIS content requires duplicating the function.

### Pitfall 5: Data URI size in HTML with many citations
**What goes wrong:** 50 citations × 4 formats × ~400 bytes each = ~80 KB of data URI content added to saved post HTML, doubling or tripling the HTML payload.
**Why it happens:** Data URIs are inline — they inflate the document and are not cached separately.
**How to avoid:** The 50-citation cap (Phase 2 policy) already bounds the worst case. Monitor actual output size in tests. If size becomes a concern, consider making the Cite/Export feature opt-in via a block attribute (like `outputCoins` and `outputCslJson`).
**Warning signs:** Benchmark or snapshot tests show unexpectedly large HTML payloads.

### Pitfall 6: `<summary>` accessible name requirements
**What goes wrong:** A `<summary>` with only an icon or empty text fails WCAG 1.3.1 and 4.1.2 (the element has no accessible name).
**Why it happens:** Screen readers announce the `<summary>` as a button; it needs discernible text.
**How to avoid:** Always include visible text in the `<summary>` label. If using an icon alongside text, use `aria-hidden` on the icon.
**Warning signs:** axe or similar tooling flags "summary element does not have a discernible name".

---

## Code Examples

### Single-entry CSL-JSON data URI (synchronous, safe for save())

```js
// Can be called inline in save() — no async required
function buildCslJsonEntryDataUri(csl) {
  const content = JSON.stringify(csl, null, 2) + '\n';
  return (
    'data:application/vnd.citationstyles.csl+json;charset=utf-8,' +
    encodeURIComponent(content)
  );
}
```

### Single-entry RIS data URI (after exporting cslToRisEntry)

```js
// Requires exporting cslToRisEntry from export.js first
import { cslToRisEntry } from './lib/export';

function buildRisEntryDataUri(csl) {
  const content = cslToRisEntry(csl);
  return (
    'data:application/x-research-info-systems;charset=utf-8,' +
    encodeURIComponent(content)
  );
}
```

### JSX structure for the disclosure panel in save-markup.js

```jsx
// Inside the renderedCitations.map() loop, after the existing EntryTag:
<details className="bibliography-builder-cite-export">
  <summary className="bibliography-builder-cite-export-toggle">
    {__('Cite / Export', 'borges-bibliography-builder')}
  </summary>
  <div className="bibliography-builder-cite-export-panel">
    <p className="bibliography-builder-cite-text">
      {getDisplayText(citation)}
    </p>
    <ul className="bibliography-builder-export-links">
      <li>
        <a
          href={buildRisEntryDataUri(citation.csl)}
          download={`citation-${citation.id}.ris`}
          rel="noopener"
        >
          {__('RIS', 'borges-bibliography-builder')}
        </a>
      </li>
      <li>
        <a
          href={buildCslJsonEntryDataUri(citation.csl)}
          download={`citation-${citation.id}.csl.json`}
          rel="noopener"
        >
          {__('CSL-JSON', 'borges-bibliography-builder')}
        </a>
      </li>
      {citation.exportBibtex ? (
        <li>
          <a
            href={`data:text/x-bibtex;charset=utf-8,${encodeURIComponent(citation.exportBibtex)}`}
            download={`citation-${citation.id}.bib`}
            rel="noopener"
          >
            {__('BibTeX', 'borges-bibliography-builder')}
          </a>
        </li>
      ) : null}
      {citation.exportBiblatex ? (
        <li>
          <a
            href={`data:text/x-bibtex;charset=utf-8,${encodeURIComponent(citation.exportBiblatex)}`}
            download={`citation-${citation.id}.biblatex.bib`}
            rel="noopener"
          >
            {__('BibLaTeX', 'borges-bibliography-builder')}
          </a>
        </li>
      ) : null}
    </ul>
  </div>
</details>
```

### Deprecated entry for block migration (deprecated.js)

When `save()` changes shape, the previous shape must be captured:

```js
// Add BEFORE the current save() definition change — reproduces the pre-Phase-4 li shape
{
  attributes: deprecatedAttributes,
  save: ({ attributes }) =>
    renderBibliographySave(attributes, {
      sortEntries: true,
      headingTag: 'p',
      entryTag: 'cite',
      linkVisibleUrls: true,
      includeCiteExport: false, // new option, defaults false
    }),
},
```

### CSS reset for hanging-indent compatibility

```scss
// In src/style.scss — prevents text-indent inheritance inside the disclosure panel
.wp-block-bibliography-builder-bibliography details.bibliography-builder-cite-export {
  text-indent: 0;
  padding-left: 0;
  margin-top: 0.4em;
  font-size: 0.875em;
}

.wp-block-bibliography-builder-bibliography details.bibliography-builder-cite-export summary {
  cursor: pointer;
  font-style: normal;
  font-weight: normal;
  display: inline-block;
  color: currentColor;
}

.wp-block-bibliography-builder-bibliography details.bibliography-builder-cite-export .bibliography-builder-cite-text {
  font-style: normal;
  white-space: pre-wrap;
  margin: 0.4em 0;
}

.wp-block-bibliography-builder-bibliography details.bibliography-builder-cite-export .bibliography-builder-export-links {
  list-style: none;
  padding: 0;
  margin: 0.4em 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em;
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact for Phase 4 |
|--------------|------------------|-------------------|
| Custom JS accordion for disclosure | Native `<details>`/`<summary>` | No JS needed; supported in all modern browsers since 2020 |
| Blob URL downloads | Data URI `<a download>` | Blob URLs require JS; data URIs work statically |
| Per-bibliography bulk export only | Per-entry disclosure + download | More useful for readers citing individual works |
| BibTeX via base64 data URI | BibTeX via `encodeURIComponent` data URI | Simpler, no 33% size overhead, human-readable in source |

**`<details>`/`<summary>` browser support:** Baseline across all modern browsers since January 2020. Chrome, Firefox, Safari, Edge all support it. Screen reader support is good for standard usage though NVDA has minor state-change announcement gaps.

---

## Open Questions

1. **Should Cite/Export be an opt-in block attribute?**
   - What we know: `outputCoins` and `outputCslJson` are opt-in via block attributes; `outputJsonLd` is on by default. The feature adds data URI content to saved HTML, increasing payload size.
   - What's unclear: Whether the target audience (scholarly readers) expects it on by default, or whether site owners should activate it per block.
   - Recommendation: Make it opt-in with a new `outputCiteExport` boolean attribute (default `false`), following the `outputCoins`/`outputCslJson` pattern. Keeps the default save output unchanged for existing blocks and avoids payload inflation for sites that don't need the feature.

2. **Where does the editor compute BibTeX/BibLaTeX per-citation strings?**
   - What we know: The editor already calls async formatters and stores `formattedText` per citation. BibTeX/BibLaTeX per-entry generation requires `@citation-js/core`, which is already bundled.
   - What's unclear: The exact hook or action where export strings should be computed and merged into citation attributes (after format, before save, or lazily on demand).
   - Recommendation: Compute BibTeX/BibLaTeX strings in the same hook that computes `formattedText` — likely in `use-citation-editor-state.js` or the formatting action — so citation objects are complete before `save()` is called.

3. **Should `cslToRisEntry` be exported from `export.js`, or should a new wrapper be added?**
   - What we know: `cslToRisEntry` is the correct per-entry RIS serializer; it is currently private.
   - What's unclear: Whether exporting it directly is the cleanest API or whether a `buildSingleRisContent(csl)` public function is preferable.
   - Recommendation: Export `cslToRisEntry` directly (or rename to `buildSingleRisContent` for consistency with the other builders). Update `export.test.js` to cover the exported function.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (via `wp-scripts test-unit-js`) |
| Config | `package.json` `"jest"` key + `jest.setup.js` |
| Quick run command | `npm test -- src/save.test.js` |
| Full suite command | `npm test` |
| Coverage command | `npm run test:js:coverage` |
| E2E command | `npm run test:e2e:playground` |

### Phase Requirements to Test Map

| Requirement | Behavior | Test Type | Automated Command | File Exists? |
|-------------|----------|-----------|-------------------|-------------|
| `<details>`/`<summary>` rendered per entry | Each `<li>` contains a `.bibliography-builder-cite-export` details element | unit (save) | `npm test -- src/save.test.js` | Needs new cases in save.test.js |
| No `<details>` when opt-in attribute is false | Feature gated by `outputCiteExport` attribute | unit (save) | `npm test -- src/save.test.js` | Needs new cases |
| RIS data URI correct for a single citation | `href` starts with `data:application/x-research-info-systems` | unit (export) | `npm test -- src/lib/export.test.js` | Needs new cases |
| CSL-JSON data URI correct for a single citation | `href` starts with `data:application/vnd.citationstyles.csl+json` | unit (export) | `npm test -- src/lib/export.test.js` | Needs new cases |
| BibTeX data URI from pre-stored attribute | `href` encodes the pre-stored `exportBibtex` string | unit (save) | `npm test -- src/save.test.js` | Needs new cases |
| BibLaTeX data URI from pre-stored attribute | `href` encodes the pre-stored `exportBiblatex` string | unit (save) | `npm test -- src/save.test.js` | Needs new cases |
| `download` attribute present on all export links | Each `<a>` has a `download` attribute with correct filename | unit (save) | `npm test -- src/save.test.js` | Needs new cases |
| Cite text readable without JS | `<p class="bibliography-builder-cite-text">` contains citation text | unit (save) | `npm test -- src/save.test.js` | Needs new cases |
| No block invalidation for existing saves | Existing deprecated save output unaffected | unit (deprecated) | `npm test -- src/deprecated.test.js` | Needs new deprecated entry |
| HTML safety: XSS in citation text not in data URI | `encodeURIComponent` prevents injection | unit (export/save) | `npm test -- src/save.test.js` | Needs XSS-specific cases |
| CSS: text-indent reset inside details | Snapshot or DOM structural check | unit (save snapshot) | `npm test -- src/save.test.js` | Needs cases |
| E2E: disclosure opens and export link renders | `<details open>` shows export links in Playground | e2e | `npm run test:e2e:playground` | Needs new E2E spec |

### Sampling Rate
- **Per task commit:** `npm test -- src/save.test.js src/lib/export.test.js src/deprecated.test.js`
- **Per wave merge:** `npm test` (full Jest suite)
- **Phase gate:** Full Jest suite green + `npm run test:e2e:playground` green before `/gsd:verify-work`

### Wave 0 Gaps (test infrastructure needed before implementation)

- [ ] New test cases in `src/save.test.js` — covers `<details>` structure per citation, opt-in attribute gating, BibTeX/BibLaTeX from pre-stored attributes, data URI format and download attribute
- [ ] New test cases in `src/lib/export.test.js` — covers `cslToRisEntry` (once exported), single-entry CSL-JSON data URI helper
- [ ] New deprecated entry in `src/deprecated.js` + corresponding test case in `src/deprecated.test.js` — captures the current `<li>` shape before Phase 4 changes it
- [ ] New block attribute `outputCiteExport` in `block.json` — required before testing the opt-in behavior

No new test framework setup needed — existing Jest + `wp-scripts` infrastructure covers all unit and integration needs.

---

## Sources

### Primary (HIGH confidence)
- `src/lib/export.js` (project source, inspected directly) — all export builders, MIME types, sync/async split, `cslToRisEntry` as unexported private function
- `src/save-markup.js` (project source, inspected directly) — current `<li>` structure, `dangerouslySetInnerHTML` pattern, `useBlockProps.save()`
- `src/save.test.js` (project source, inspected directly) — test patterns for `renderToStaticMarkup`, XSS tests, style coverage
- `src/deprecated.js` (project source, inspected directly) — deprecation pattern and shape of all prior save versions
- `block.json` (project source, inspected directly) — current attributes, `apiVersion: 3`, no `outputCiteExport` yet
- `src/style.scss` (project source, inspected directly) — hanging-indent CSS; `text-indent: -2em` on `li` that will affect nested `<details>`
- `package.json` (project source, inspected directly) — `@citation-js/core` 0.7.18, `@citation-js/plugin-bibtex` 0.7.18 as runtime deps; Jest config

### Secondary (MEDIUM confidence)
- [MDN: `<details>` element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/details) — full browser support confirmed
- [MDN: `<summary>` element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/summary) — accessible name requirement
- [Can I use: details & summary](https://caniuse.com/details) — baseline since 2020 confirmed
- [MDN: data URLs](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/data) — `encodeURIComponent` encoding for text payloads
- [a11ysupport.io: summary element](https://a11ysupport.io/tech/html/summary_element) — screen reader behavior, NVDA state-change gap
- [Scott O'Hara: details and summary, 2022](https://www.scottohara.me/blog/2022/09/12/details-summary.html) — current accessibility assessment

### Tertiary (LOW confidence — confirm before implementing)
- DebugBear: data URI payload size recommendation — informal guidance to monitor HTML size; no formal limit confirmed for text payloads under 1 MB

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already present in project; no new dependencies needed
- Architecture (sync/async split): HIGH — confirmed by direct source inspection of `export.js`
- Architecture (deprecated.js requirement): HIGH — confirmed by Gutenberg block invalidation behavior, documented in project's own `deprecated.js`
- Architecture (CSS hanging-indent): HIGH — confirmed by reading `style.scss` directly
- `<details>` browser support: HIGH — Can I use confirms baseline since 2020
- `<details>` accessibility: MEDIUM — good general support; NVDA state-change announcements are a known gap but do not block the feature
- Data URI size concern at 50 citations: MEDIUM — practical guidance, no hard browser limit for text payloads under ~2 MB

**Research date:** 2026-05-10
**Valid until:** 2026-08-10 (stable domain; `<details>` and data URI specs do not change rapidly)
