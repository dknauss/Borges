---
phase: 04-frontend-cite-export-affordances
plan: 02
status: complete
---

# 04-02 Summary — Save markup: `<details>` cite/export panels

Adds the core visible feature: per-entry `<details>`/`<summary>` disclosure panels in the static `save()` output, gated on the `outputCiteExport` opt-in. Zero-JS — everything is baked into post content at save time.

## What changed

- **src/save-markup.js**
  - Imports `cslToRisEntry` from `./lib/export`.
  - Adds `includeCiteExport = false` option.
  - When enabled, each `<li>` (after the optional COinS span) gains a `<details class="bibliography-builder-cite-export">` containing:
    - a visible cite-text `<p>` (`displayOverride || formattedText`), readable without JS;
    - RIS and CSL-JSON download `<a>`s built synchronously as `data:` URIs (`encodeURIComponent`-encoded);
    - BibTeX and BibLaTeX download `<a>`s, rendered only when the per-citation `exportBibtex` / `exportBiblatex` strings exist (produced by Plan 04-03).
  - All export links carry a `download="citation-<id>.<ext>"` attribute and `rel="noopener"`.
- **src/save.js** — passes `includeCiteExport: attributes.outputCiteExport ?? false`.

## Tests (src/save.test.js — new `save cite/export disclosure panels` block)

Opt-in gating (off by default), `<details>` + `Cite / Export` summary, RIS + CSL-JSON data-URI links with correct download names, conditional BibTeX/BibLaTeX links, download-attribute count (4 when all present), visible cite text, and an XSS check (a `<script>` title appears `%3Cscript%3E`-encoded in the data URI, never raw).

## Verification

- `npm test` — 561 passed, 2 skipped, 0 failed. `deprecated.test.js` still green (deprecated[0] has no `<details>`).
- `lint:js`, `lint:css`, `lint:php`, `npm run build` — all pass.

## Next

Plan 04-03 — editor pre-computation of `exportBibtex` / `exportBiblatex` strings (so the BibTeX/BibLaTeX links above populate), then Wave 3 / Plan 04-04 (metadata output panel).
