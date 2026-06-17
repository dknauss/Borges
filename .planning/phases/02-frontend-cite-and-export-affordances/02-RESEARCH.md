# Phase 2: Frontend Cite and Export Affordances - Research

**Researched:** 2026-06-04
**Domain:** WordPress static block, progressive-enhancement frontend interactivity, citation export (BibTeX/RIS/CSL-JSON), Clipboard API, Blob download
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REQ-FE-01 | Visible per-entry Cite/Export UI on the public bibliography frontend | viewScript + data-attribute hydration pattern; Google Scholar-style cite affordance |
| REQ-FE-02 | BibTeX, RIS, and CSL-JSON download/copy per entry | `buildBibtexExportContent`, `buildRisExportContent`, `buildCslJsonExportContent` in `src/lib/export.js` are single-entry capable after trivial per-entry extraction; Blob+anchor download pattern |
| REQ-FE-03 | No render_callback — all output stays in static save() | viewScript hydrates HTML already saved by save.js; no PHP render required for JS-layer behavior |
| REQ-FE-04 | No-JS bibliography remains fully readable | Existing `<cite>` + `<li>` structure is complete text; cite/export controls are additive DOM elements hidden until JS runs or styled as graceful degradation |
| REQ-FE-05 | Preserves plugin-deactivation resilience | Citation data embedded in `data-csl` attributes is inert HTML; controls can be hidden by default (CSS: `display:none`) and shown by JS; deactivation removes JS but leaves readable bibliography markup intact |
| REQ-FE-06 | Mendeley/Zotero manual-import acceptance | Visible per-entry RIS and BibTeX download buttons directly serve the gap confirmed in Mendeley testing (non-DOI entries missed by auto-detection) |
</phase_requirements>

---

## Summary

This phase adds optional Scholar-like Cite/Export controls to the already-saved static bibliography frontend. The plugin uses a static `save()` function — no PHP `render_callback` — which constrains the approach: all interactive behavior must come from JavaScript that hydrates the saved HTML at runtime.

The cleanest solution for this project is a `viewScript` frontend bundle registered in `block.json`. WordPress automatically enqueues `viewScript` only when the block is present on a page (since WP 6.1), making it zero-cost for posts without bibliography blocks. The script reads per-entry CSL-JSON data from attributes embedded during save and renders Cite/Export controls progressively. The WordPress Interactivity API is available but not required; it introduces a `data-wp-interactive` namespace coupling into saved block markup that becomes dead HTML if the plugin is deactivated — contrary to the deactivation-resilience requirement. Vanilla JS with `data-csl` attributes is the preferred approach.

The existing `src/lib/export.js` already contains `buildBibtexExportContent`, `buildRisExportContent`, `buildCslJsonExportContent`, and `buildCslJsonExportContent`. These functions operate on arrays of citations and sort them by style; they need a thin wrapper to operate on a single CSL item. The existing `copyTextToClipboard` in `src/lib/clipboard.js` already handles the `navigator.clipboard` + `execCommand` fallback and is injectable for testing.

**Primary recommendation:** Add a `viewScript` file (`src/view.js`) that reads per-entry CSL-JSON from `data-csl` attributes, builds a per-entry modal/details panel with Copy and Download buttons (BibTeX, RIS, CSL-JSON), and uses the existing export utilities. Embed per-entry CSL-JSON into the save markup using a `data-csl` attribute on each `<li>`. Keep controls hidden with CSS until JS initialises them.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@citation-js/core` | 0.7.18 (already in deps) | BibTeX generation | Already bundled; `buildBibtexExportContent` uses it async |
| `@citation-js/plugin-bibtex` | 0.7.18 (already in deps) | BibTeX/BibLaTeX format | Already bundled async chunk `citation-plugin-bibtex.js` |
| WordPress `viewScript` | WP 6.1+ | Frontend-only JS enqueue | Auto-enqueued when block present; zero overhead otherwise |
| Clipboard API (`navigator.clipboard`) | Baseline (2025) | Copy text to clipboard | `copyTextToClipboard` in `clipboard.js` already wraps it with fallback |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Blob` + `URL.createObjectURL` | Baseline | File download in browser | Already used by `downloadTextExport` in `export.js` |
| `<details>`/`<summary>` HTML | HTML5 native | No-JS-accessible disclosure widget | Use as the cite panel toggle; degrades to always-open without CSS |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `viewScript` + vanilla JS | WordPress Interactivity API (`viewScriptModule`) | Interactivity API requires `data-wp-interactive` in saved markup, which becomes dead/inert HTML post-deactivation. Also requires WP 6.5+ minimum. Not worth the constraint for this use case. |
| `data-csl` attribute per `<li>` | Existing `<script type="application/vnd.citationstyles.csl+json">` block-level embed | Block-level embed requires DOM parsing to match entries back to IDs; per-entry `data-csl` on the `<li>` is simpler and directly co-located with the rendered entry. The block-level CSL-JSON script can still serve as a fallback source. |
| Inline `<a download>` links in save markup | JS-generated download buttons | Static download links would need REST endpoint variants for BibTeX/RIS (format conversion is JS-only). JS-generated controls are cleaner. |

**Installation:** No new npm packages needed. `@citation-js/core` and `@citation-js/plugin-bibtex` are already dependencies.

Add to webpack.config.js:
```js
// Add a view entry alongside the existing validation entry
view: path.resolve(__dirname, 'src/view.js'),
```

Add to block.json:
```json
"viewScript": "file:./build/view.js"
```

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── view.js                 # NEW: frontend viewScript entrypoint
├── view.test.js            # NEW: Jest tests for view.js hydration logic
├── lib/
│   ├── export.js           # EXISTING: reuse buildBibtexExportContent etc.
│   ├── export-single.js    # NEW: thin wrapper for per-entry export helpers
│   ├── export-single.test.js
│   └── clipboard.js        # EXISTING: reuse copyTextToClipboard
build/
├── view.js                 # compiled viewScript output
├── view.asset.php          # generated by wp-scripts
```

### Pattern 1: Per-Entry CSL-JSON Data Embedding (save-markup.js change)

**What:** Add `data-csl` attribute to each `<li>` in save markup, containing the entry's CSL-JSON as a JSON string.
**When to use:** Always — this is the data source for per-entry export. The attribute is inert HTML when JS is absent.

```jsx
// In renderBibliographySave, add data-csl to each <li>
<li
  key={citation.id}
  id={`ref-${citation.id}`}
  lang={citation.csl.language || undefined}
  data-csl={JSON.stringify(citation.csl).replace(/</g, '\\u003c')}
>
```

**Save constraint:** This is a save markup change. It requires a new block deprecation entry in `src/deprecated.js` for existing saved blocks, OR it can be designed as a non-breaking addition (adding a new attribute that old save output simply lacks — JS falls back to block-level CSL-JSON script).

Preferred approach: make it non-breaking. The viewScript checks for `data-csl` on each `<li>`; if absent (old save), it falls back to reading the block-level `<script type="application/vnd.citationstyles.csl+json">` tag. If neither is present, hide the Cite/Export panel gracefully.

### Pattern 2: Per-Entry Single-Citation Export Helpers

**What:** Thin wrappers over existing export functions that accept a single CSL object rather than an array of citation records.
**When to use:** Per-entry Cite/Export buttons in the frontend view.

```js
// src/lib/export-single.js
import { buildCslJsonExportContent, buildRisExportContent,
         buildBibtexExportContent, downloadTextExport,
         CSL_JSON_EXPORT_MIME_TYPE, RIS_EXPORT_MIME_TYPE, BIBTEX_EXPORT_MIME_TYPE } from './export';

export function buildSingleCslJsonContent(cslItem) {
  return JSON.stringify([cslItem], null, 2) + '\n';
}

export function buildSingleRisContent(cslItem) {
  // Wraps cslItem in citation-like object for buildRisExportContent
  return buildRisExportContent([{ id: cslItem.id, csl: cslItem }], null);
}

export async function buildSingleBibtexContent(cslItem, { CiteCtor } = {}) {
  return buildBibtexExportContent([{ id: cslItem.id, csl: cslItem }], null, { CiteCtor });
}
```

Note: `buildRisExportContent` and `buildBibtexExportContent` accept `citationStyle` for sorting; for single-entry exports, sorting is irrelevant — pass `null` (or any valid style) since there is only one item.

### Pattern 3: viewScript Hydration

**What:** Frontend JS that finds all bibliography blocks, reads per-entry `data-csl`, and injects a Cite/Export panel as a child of each `<li>`.
**When to use:** Always loaded when block is present (WordPress auto-enqueue via `viewScript`).

```js
// src/view.js skeleton
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll(
    '.wp-block-bibliography-builder-bibliography li[data-csl]'
  ).forEach((li) => {
    let csl;
    try { csl = JSON.parse(li.dataset.csl); } catch { return; }
    const panel = buildCitePanel(csl); // creates button + popover/details
    li.appendChild(panel);
  });
});
```

### Pattern 4: Block.json viewScript Registration

**What:** Register the view script in block.json so WordPress handles enqueue automatically.
**When to use:** All static blocks needing frontend JS.

```json
{
  "viewScript": "file:./build/view.js"
}
```

WordPress generates handle `bibliography-builder/bibliography-view-script` and enqueues it only on pages containing the block. No PHP enqueue code needed.

### Pattern 5: Progressive Enhancement UI (no-JS fallback)

**What:** Hide Cite/Export controls via CSS by default; JS adds a class that makes them visible.

```css
/* In style.scss — frontend styles */
.bibliography-builder-cite-controls {
  display: none;
}

.bibliography-builder-js-ready .bibliography-builder-cite-controls {
  display: block; /* or flex */
}
```

```js
// In view.js, after injecting controls:
document.querySelectorAll('.wp-block-bibliography-builder-bibliography')
  .forEach(el => el.classList.add('bibliography-builder-js-ready'));
```

No-JS fallback: the bibliography renders normally with no extra controls cluttering the markup. The `.bibliography-builder-js-ready` class is never added and `display:none` controls stay hidden.

### Pattern 6: Cite Panel as `<details>`/`<summary>`

**What:** Use native `<details>` disclosure widget for the per-entry cite panel.
**When to use:** Accessible, no-JS-required disclosure. With JS, it can be augmented with focus management and keyboard shortcuts.

```html
<!-- Generated by view.js -->
<details class="bibliography-builder-cite-controls">
  <summary>Cite / Export</summary>
  <div class="bibliography-builder-cite-panel">
    <button data-action="copy-bibtex">Copy BibTeX</button>
    <button data-action="copy-ris">Copy RIS</button>
    <button data-action="download-bibtex">Download .bib</button>
    <button data-action="download-ris">Download .ris</button>
    <button data-action="download-csl">Download CSL-JSON</button>
  </div>
</details>
```

`<details>` is baseline HTML5, keyboard accessible, and works without CSS or JS. With JS disabled, all buttons are still present (though non-functional without the download logic); the `display:none` approach above keeps the whole `<details>` hidden so no broken UI appears.

### Anti-Patterns to Avoid

- **Embedding BibTeX/RIS in save markup:** Generated text is large, must be re-saved on every citation change, and makes block diffing noisy. Generate on demand in the browser.
- **Using WordPress Interactivity API (`data-wp-interactive`):** Requires `@wordpress/interactivity` as a script module dependency (WP 6.5+) and embeds Interactivity API directives into saved block HTML. Deactivating the plugin leaves namespace declarations and directive attributes in post content as dead markup. Not compatible with the deactivation-resilience requirement.
- **Adding REST endpoints for BibTeX/RIS download:** Requires authentication plumbing, adds a network round-trip per click, and is unnecessary when client-side generation from embedded CSL-JSON is available. The existing `?format=csl-json` REST endpoint is sufficient for programmatic access; the frontend export path should be fully client-side.
- **Block-level "Download all" only (no per-entry):** Mendeley testing showed the gap is specifically for non-DOI entries; Google Scholar's UX is per-entry. Per-entry exports are the correct target.
- **Relying on the optional `outputCslJson` block-level script tag:** This is user-opt-in (off by default). Per-entry `data-csl` attributes should always be present in new saves regardless of that setting.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| BibTeX generation from CSL-JSON | Custom CSL→BibTeX serializer | `buildBibtexExportContent` + `@citation-js/plugin-bibtex` | Handles author name formatting, Unicode escaping, field mapping — already tested |
| RIS generation | Custom RIS writer | `buildRisExportContent` (already in `export.js`) | `cslToRisEntry` covers all common types, page ranges, ISBNs |
| File download trigger | Custom XHR/fetch download | `downloadTextExport` (already in `export.js`) | Covers Blob + anchor pattern, URL cleanup, injected dependencies for test |
| Clipboard copy | `navigator.clipboard.writeText` wrapper | `copyTextToClipboard` (already in `clipboard.js`) | Already has `execCommand` fallback, dependency injection for tests |
| MIME type constants | Hard-coded strings | Named exports from `export.js` | Already defined: `BIBTEX_EXPORT_MIME_TYPE`, `RIS_EXPORT_MIME_TYPE`, etc. |

**Key insight:** Nearly all the low-level plumbing for export and clipboard already exists in tested utility modules. The view script is primarily wiring: read CSL from DOM, invoke existing builders, trigger existing download/copy utilities.

---

## Common Pitfalls

### Pitfall 1: Save Markup Invalidation (block deprecation)

**What goes wrong:** Adding `data-csl` to `<li>` elements changes the saved block markup. WordPress block validation will flag existing saved posts as having invalid blocks unless a deprecation handler is added.
**Why it happens:** Block validation compares save output from the registered `save()` function against what was actually saved in post content. A schema change without a deprecation entry causes a block invalidation warning.
**How to avoid:** Either (a) treat `data-csl` as absent in old saves and fall back gracefully in `view.js` (no deprecation needed — the attribute is optional), OR (b) add a deprecation handler if the data attribute must be guaranteed present. Option (a) is simpler: `view.js` falls back to parsing the block-level `<script type="application/vnd.citationstyles.csl+json">` tag if `outputCslJson` was enabled, or skips per-entry export for that block.
**Warning signs:** "This block has been modified externally" editor notice after shipping the change.

### Pitfall 2: CSL-JSON Data Attribute Security (XSS)

**What goes wrong:** JSON-stringified CSL data embedded in HTML attributes can contain `<` or `>` characters that break attribute parsing or allow script injection.
**Why it happens:** CSL title fields may contain HTML entities or angle brackets.
**How to avoid:** Escape `<` as `<` before embedding — the same escaping already used in `buildJsonLdString` and `buildCslJsonString` in `src/lib/jsonld.js`. Use `JSON.stringify(cslItem).replace(/</g, '\\u003c')` in save markup.
**Warning signs:** Broken save output for entries with `<` in title or other fields.

### Pitfall 3: BibTeX Async Loading in Frontend Bundle

**What goes wrong:** `buildBibtexExportContent` uses dynamic `import('@citation-js/core')` and `import('@citation-js/plugin-bibtex')`. These async chunks (`citation-core.js`, `citation-plugin-bibtex.js`) must be reachable at their expected chunk URLs in the `view.js` bundle.
**Why it happens:** webpack's async chunk mechanism resolves chunk URLs relative to the `publicPath`. The `@wordpress/scripts` default sets `publicPath` to `auto`, which resolves from the script's own URL. As long as `view.js` is in `build/` with the chunks, this works correctly.
**How to avoid:** Do not move `view.js` to a subdirectory inside `build/`. Verify that the chunk files are included in `package:release`.
**Warning signs:** Console errors like "Loading chunk N failed" when clicking BibTeX download.

### Pitfall 4: Clipboard API Requires HTTPS / Secure Context

**What goes wrong:** `navigator.clipboard.writeText` is undefined on HTTP (non-localhost) pages.
**Why it happens:** The Async Clipboard API is restricted to secure contexts (HTTPS or localhost) per spec.
**How to avoid:** The existing `copyTextToClipboard` in `clipboard.js` already falls back to `document.execCommand('copy')` when `navigator.clipboard` is unavailable. Always use that utility, never call `navigator.clipboard.writeText` directly.
**Warning signs:** Copy buttons silently fail on HTTP test sites.

### Pitfall 5: iOS Safari Download Quirks

**What goes wrong:** Blob+anchor programmatic download (`link.click()`) may not work consistently on iOS Safari.
**Why it happens:** iOS Safari historically treats user activation differently; programmatic clicks on `<a download>` during async operations can be silently ignored.
**How to avoid:** Keep downloads synchronous where possible (RIS and CSL-JSON are sync; BibTeX is async). For async BibTeX, the user gesture must be captured before the async operation completes — resolve the BibTeX content eagerly or use `ClipboardItem` with a promise. Consider offering "Copy to clipboard" as a primary action (more reliable cross-platform) with "Download" as secondary.
**Warning signs:** Download works on desktop but does nothing on iPhone/iPad.

### Pitfall 6: Plugin Deactivation Leaves data-csl Attributes

**What goes wrong:** After deactivation, `data-csl` attribute containing JSON remains in `<li>` elements in post content. This is harmless but slightly bloats saved HTML.
**Why it happens:** All save markup is baked into post content.
**How to avoid:** This is acceptable; the attribute is inert. Document it. The bibliography text itself remains fully readable — this is the resilience property the plugin requires. The attribute does not trigger any behavior without `view.js`.
**Warning signs:** None functional; cosmetic only.

---

## Code Examples

### Embedding CSL per Entry in Save Markup

```jsx
// src/save-markup.js — inside the <li> JSX
<li
  key={citation.id}
  id={`ref-${citation.id}`}
  lang={citation.csl.language || undefined}
  data-csl={JSON.stringify(citation.csl).replace(/</g, '\\u003c')}
>
```

### Per-Entry RIS Export (synchronous, no async dependencies)

```js
// src/lib/export-single.js
import { buildRisExportContent } from './export';

/**
 * Build RIS content for a single CSL item.
 * @param {Object} cslItem - Single CSL-JSON object.
 * @returns {string} RIS-formatted string.
 */
export function buildSingleRisContent(cslItem) {
  // Wrap in citation record shape expected by buildRisExportContent
  return buildRisExportContent(
    [{ id: cslItem.id || 'citation', csl: cslItem }],
    'chicago-notes-bibliography' // style unused for single-entry (no sort effect)
  );
}
```

### Per-Entry BibTeX Export (async, lazy-loads citation-js)

```js
// src/lib/export-single.js (continued)
import { buildBibtexExportContent } from './export';

export async function buildSingleBibtexContent(cslItem, { CiteCtor } = {}) {
  return buildBibtexExportContent(
    [{ id: cslItem.id || 'citation', csl: cslItem }],
    'chicago-notes-bibliography',
    { CiteCtor }
  );
}
```

### viewScript Hydration Skeleton

```js
// src/view.js
import { copyTextToClipboard } from './lib/clipboard';
import { downloadTextExport, RIS_EXPORT_MIME_TYPE, BIBTEX_EXPORT_MIME_TYPE,
         CSL_JSON_EXPORT_MIME_TYPE } from './lib/export';
import { buildSingleRisContent, buildSingleBibtexContent } from './lib/export-single';

function buildCitePanel(cslItem) {
  const details = document.createElement('details');
  details.className = 'bibliography-builder-cite-controls';
  const summary = document.createElement('summary');
  summary.textContent = 'Cite / Export'; // TODO: i18n via data attribute
  details.appendChild(summary);

  const panel = document.createElement('div');
  panel.className = 'bibliography-builder-cite-panel';

  // Copy RIS button
  const copyRis = document.createElement('button');
  copyRis.type = 'button';
  copyRis.textContent = 'Copy RIS';
  copyRis.addEventListener('click', async () => {
    const content = buildSingleRisContent(cslItem);
    await copyTextToClipboard(content);
  });
  panel.appendChild(copyRis);

  // Download RIS button
  const dlRis = document.createElement('button');
  dlRis.type = 'button';
  dlRis.textContent = 'Download .ris';
  dlRis.addEventListener('click', () => {
    downloadTextExport({
      content: buildSingleRisContent(cslItem),
      filename: `citation.ris`,
      mimeType: RIS_EXPORT_MIME_TYPE,
    });
  });
  panel.appendChild(dlRis);

  // BibTeX download (async)
  const dlBib = document.createElement('button');
  dlBib.type = 'button';
  dlBib.textContent = 'Download .bib';
  dlBib.addEventListener('click', async () => {
    const content = await buildSingleBibtexContent(cslItem);
    downloadTextExport({ content, filename: 'citation.bib', mimeType: BIBTEX_EXPORT_MIME_TYPE });
  });
  panel.appendChild(dlBib);

  details.appendChild(panel);
  return details;
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll(
    '.wp-block-bibliography-builder-bibliography li[data-csl]'
  ).forEach((li) => {
    let cslItem;
    try { cslItem = JSON.parse(li.dataset.csl); } catch { return; }
    if (!cslItem || typeof cslItem !== 'object') return;
    li.appendChild(buildCitePanel(cslItem));
  });

  // Mark blocks as JS-ready to reveal controls via CSS
  document.querySelectorAll('.wp-block-bibliography-builder-bibliography')
    .forEach((el) => el.classList.add('bibliography-builder-js-ready'));
});
```

### block.json Addition

```json
{
  "viewScript": "file:./build/view.js"
}
```

### webpack.config.js Entry Addition

```js
entry: async () => {
  const base = typeof defaultEntry === 'function' ? await defaultEntry() : defaultEntry;
  return {
    ...base,
    validation: path.resolve(__dirname, 'src/validation.js'),
    view: path.resolve(__dirname, 'src/view.js'),  // ADD
  };
},
```

### Frontend CSS Addition (style.scss)

```scss
// Progressive enhancement: hide cite controls until JS runs
.bibliography-builder-cite-controls {
  display: none;
}

.bibliography-builder-js-ready .bibliography-builder-cite-controls {
  display: block;
}

// Cite panel layout
.bibliography-builder-cite-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em;
  padding: 0.5em 0;
}

.bibliography-builder-cite-panel button {
  font-size: 0.875em;
  cursor: pointer;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual `wp_enqueue_script` for frontend | `viewScript` in `block.json` (auto-enqueue) | WP 5.9 / 6.1 | Zero PHP enqueue code needed |
| Requiring render.php for interactive blocks | `data-wp-interactive` in `save.js` works for Interactivity API | WP 6.5 | Static blocks can use Interactivity API — but see deactivation caveat |
| `document.execCommand('copy')` clipboard | `navigator.clipboard.writeText` (Baseline 2025) | 2025 | Modern browsers use async clipboard; fallback still needed for HTTP pages |
| `Blob` + `createObjectURL` download | Same — no new API | — | Widely supported; `download` attribute on `<a>` is the pattern |

**Deprecated/outdated:**
- `document.execCommand('copy')`: Still works as fallback but deprecated in favor of Async Clipboard API. Already wrapped in `clipboard.js`.
- `viewModule` in block.json: Renamed to `viewScriptModule` in WP 6.5. `viewModule` is deprecated but backward-compatible.

---

## Open Questions

1. **i18n for frontend button labels**
   - What we know: `viewScript` files are vanilla JS bundles — they do not have access to `__()` from `@wordpress/i18n` by default unless that package is declared as a script dependency.
   - What's unclear: Whether the view bundle should depend on `wp-i18n` (adds ~3KB to every frontend page with the block), or whether button labels should be injected via `data-i18n` attributes on the block wrapper during save.
   - Recommendation: Use a `data-i18n-cite-label` attribute on the block wrapper during save (populated from `__()` in save.js, which has access to i18n). The view script reads it. This avoids adding `wp-i18n` as a frontend dependency.

2. **Backward compatibility: old saved blocks without data-csl**
   - What we know: The `data-csl` attribute will be added to new saves. Old saves lack it.
   - What's unclear: How many existing posts have saved bibliography blocks, and whether block-level `outputCslJson` was enabled for them.
   - Recommendation: Graceful degradation is sufficient. For `<li>` elements without `data-csl`, skip cite controls. Document this in the block's changelog as "Cite/Export controls appear on bibliography blocks saved after version 1.2."

3. **Block-level "Download all" vs per-entry only**
   - What we know: Phase requirement specifies per-entry. A "Download all" action at the block level (BibTeX/RIS for all entries) would reuse block-level CSL-JSON already embedded.
   - What's unclear: Whether to include block-level export as a secondary affordance in this phase.
   - Recommendation: Per-entry only in Phase 2 (matches Scholar model and the stated requirements). Block-level downloads can be added later without changing architecture.

4. **Accessible focus management for cite panel**
   - What we know: `<details>`/`<summary>` is keyboard-accessible natively. Buttons within the panel are focusable.
   - What's unclear: Whether Escape-key dismissal and focus-return-to-trigger are expected UX in this phase.
   - Recommendation: Ship `<details>` native behavior in Phase 2. Keyboard enhancement (Escape, focus trap) is a follow-on polish task.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (via `@wordpress/scripts`) |
| Config file | none — wp-scripts provides Jest config |
| Quick run command | `npm test -- src/lib/export-single.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-FE-01 | Cite panel DOM element created per entry | unit (JSDOM) | `npm test -- src/view.test.js` | ❌ Wave 0 |
| REQ-FE-02 | Per-entry RIS content correct | unit | `npm test -- src/lib/export-single.test.js` | ❌ Wave 0 |
| REQ-FE-02 | Per-entry BibTeX content correct | unit | `npm test -- src/lib/export-single.test.js` | ❌ Wave 0 |
| REQ-FE-02 | Per-entry CSL-JSON content correct | unit | `npm test -- src/lib/export-single.test.js` | ❌ Wave 0 |
| REQ-FE-03 | Save markup includes data-csl attribute | unit | `npm test -- src/save.test.js` | ✅ (extend existing) |
| REQ-FE-04 | No cite controls visible without JS (CSS class absent) | unit (JSDOM) | `npm test -- src/view.test.js` | ❌ Wave 0 |
| REQ-FE-05 | data-csl attribute is inert without view.js | manual (deactivation smoke test) | manual | — |
| REQ-FE-06 | RIS output parses correctly for non-DOI entries | unit | `npm test -- src/lib/export-single.test.js` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- src/lib/export-single.test.js && npm test -- src/save.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full Jest suite green before marking phase complete

### Wave 0 Gaps
- [ ] `src/lib/export-single.js` — per-entry export helpers (REQ-FE-02)
- [ ] `src/lib/export-single.test.js` — unit tests for per-entry helpers (REQ-FE-02, REQ-FE-06)
- [ ] `src/view.js` — frontend viewScript entrypoint (REQ-FE-01, REQ-FE-04)
- [ ] `src/view.test.js` — JSDOM tests for cite panel hydration (REQ-FE-01, REQ-FE-04)
- [ ] `webpack.config.js` — add `view` entry
- [ ] `block.json` — add `"viewScript": "file:./build/view.js"`
- [ ] `src/save-markup.js` — add `data-csl` attribute to `<li>` elements
- [ ] `src/style.scss` — progressive enhancement CSS for cite controls

---

## Sources

### Primary (HIGH confidence)
- WordPress Block Editor Handbook — block.json metadata: `viewScript`, `viewScriptModule` field definitions (verified via WebFetch)
- WordPress Core dev note: Block metadata viewScriptModule field in 6.5 — https://make.wordpress.org/core/2024/03/04/block-metadata-viewscriptmodule-field-in-6-5/
- WordPress 7.0 Interactivity API changes — https://make.wordpress.org/core/2026/02/23/changes-to-the-interactivity-api-in-wordpress-7-0/
- `src/lib/export.js` (project source) — confirms all export builder functions, dependency injection pattern, async BibTeX
- `src/lib/clipboard.js` (project source) — confirms existing clipboard abstraction with fallback
- `src/save-markup.js` (project source) — confirms save structure, `<li id="ref-${citation.id}">` DOM shape
- `bibliography-builder.php` (project source) — confirms no PHP enqueue for viewScript needed; REST endpoints support `json`, `text`, `csl-json` formats only

### Secondary (MEDIUM confidence)
- Rudrastyh Interactivity API tutorial (verified against official docs): confirms `data-wp-interactive` in `save.js` works without `render.php` for static blocks — https://rudrastyh.com/gutenberg/interactivity-api.html
- 10up Gutenberg best practices — including frontend JavaScript with a block: confirms `viewScript` auto-enqueue for static blocks — https://gutenberg.10up.com/guides/including-frontend-javascript-with-a-block/
- Can I Use: `navigator.clipboard.writeText` — Baseline March 2025

### Tertiary (LOW confidence)
- iOS Safari download quirks (Blob + programmatic click): verified in principle by Apple Developer Forums threads; exact behavior varies by iOS version

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against project source files and official WP docs
- Architecture: HIGH — viewScript pattern well-documented; export utility reuse verified in source
- Pitfalls: HIGH for save/XSS/deactivation (project-specific analysis); MEDIUM for iOS Safari download quirks

**Research date:** 2026-06-04
**Valid until:** 2026-09-04 (WordPress APIs stable; re-verify if WP 7.1 ships significant Interactivity API changes)
