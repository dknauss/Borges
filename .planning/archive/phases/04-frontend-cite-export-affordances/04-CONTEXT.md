# Phase 4: Frontend Cite/Export Affordances — Context

**Gathered:** 2026-05-10
**Status:** Ready for planning
**Source:** Inline discuss-phase

<domain>
## Phase Boundary

Add per-entry Cite and Export controls to the public (saved) bibliography output so readers can copy or download individual citations without requiring JS or plugin activation on the frontend. The static-save, zero-JS contract is preserved as the baseline.

</domain>

<decisions>
## Implementation Decisions

### UI Pattern
- Per-entry disclosure widget using native `<details>`/`<summary>` elements beneath each citation row.
- Closest to Google Scholar's Cite pattern; no custom JS required for open/close.
- The `<details>` element is appended inside or immediately after the `<li>` for each citation in `save()`.

### JavaScript Strategy
- **Progressive enhancement**: no-JS baseline is fully functional.
- Export links are static `<a>` elements with `href` pointing to data URIs (or equivalent static content) baked into `save()` HTML.
- JS layer may enhance UX (e.g., copy-to-clipboard for the Cite action) but is never required for the readable bibliography or for downloading exports.
- No JS is loaded on the frontend for this feature — any JS enhancement uses the block's existing inline script budget or a minimal defer-loaded snippet.

### Export Formats
All four formats ship in Phase 4:
- BibTeX
- RIS
- CSL-JSON
- BibLaTeX (already in editor exports; add to frontend too)

### Cite Action — Source
- Uses the already-rendered citation HTML already present in the `<li>`.
- The Cite panel displays the visible formatted text; copy-to-clipboard (JS enhancement) strips HTML tags from the inner text.
- No extra data attribute needed for the no-JS case — plain text is readable in the panel.
- A `data-citation-text` attribute may be added for clean JS copy (optional implementation detail).

### No-JS Baseline
- `<details>`/`<summary>` disclosure is fully native — works in all modern browsers without JS.
- Export download links are static `<a href="data:...">` data URIs embedded in `save()` HTML, or equivalent static file-download links.
- The readable bibliography itself is completely unaffected when the `<details>` elements are collapsed.

### Architecture Constraints
- All changes go into `save.js` / `save-markup.js` (static save output); no `render_callback`.
- No regression in plugin-deactivation resilience: when the plugin is deactivated, the saved HTML must remain valid and readable.
- No JS is required on the frontend for the export/cite feature itself.
- The REST formatter endpoint is editor-only; it is not called on the frontend for this feature.

### Claude's Discretion
- Exact `<details>`/`<summary>` label text ("Cite", "Export", "↓ BibTeX", etc.)
- Whether data URIs are inlined per entry or generated via a small PHP-rendered attribute
- CSS styling for the disclosure panels (scope: block stylesheet)
- Whether to add an optional copy-to-clipboard JS enhancement and how to ship it
- How BibLaTeX content is generated per-entry on the save path (mirroring editor export logic)

</decisions>

<specifics>
## Specific References

- Editor export logic lives in `src/lib/export.js` — BibTeX, RIS, CSL-JSON, BibLaTeX generation functions are already implemented and tested; reuse them on the save path.
- `save.js` / `save-markup.js` own the static HTML output — this is where `<details>` panels get added.
- `src/edit.js` exports panel (already ships in editor) is the reference UX for format labels.
- Google Scholar's per-entry "Cite" disclosure is the design reference for the panel layout.

</specifics>

<deferred>
## Deferred

- PMCID/NBIB biomedical identifier export — demand-gated, not Phase 4.
- EndNote XML / CIW formats — out of scope unless RIS/BibTeX prove insufficient.
- Writable bibliography REST routes — separate design memo required before implementation.
- Per-bibliography (block-level) bulk export panel — Phase 4 is per-entry only.

</deferred>

---

*Phase: 04-frontend-cite-export-affordances*
*Context gathered: 2026-05-10 via inline discuss-phase*
