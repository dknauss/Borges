---
phase: 04-frontend-cite-export-affordances
plan: 04
status: code-complete-pending-human-verify
---

# 04-04 Summary — Editor toggle + frontend CSS

Makes the cite/export feature discoverable to authors and visually correct on the frontend.

## What changed

- **src/edit.js**
  - Destructures `outputCiteExport = false` from attributes.
  - Adds a "Cite / Export affordances" `ToggleControl` to the existing **Metadata output** inspector panel (after CSL-JSON), wired to `setAttributes({ outputCiteExport })`.
- **src/style.scss** — flat BEM rules (matching the file's existing style) for `details.bibliography-builder-cite-export`:
  - `text-indent: 0; padding-left: 0` — the critical reset so the panel isn't dragged left by the `text-indent: -2em` hanging-indent rule.
  - `<summary>`: non-italic, normal weight, `cursor: pointer`, inline-block.
  - cite text: non-italic, `white-space: pre-wrap`.
  - export links: inline flex row (not bulleted/indented).

## Verification

- `npm run lint:css`, `lint:js`, `lint:php`, `npm run build`, `npm test` — all pass (570 passed, 2 skipped).

## Human-verify checkpoint — PENDING (blocking gate)

Plan 04-04 ends with a **blocking** browser checkpoint that cannot run in this (non-browser) session. It requires a browser-capable session (e.g. WordPress Playground from the PR, or the local Playwright handoff) to confirm:
1. The "Cite / Export affordances" toggle appears in the block inspector.
2. Toggling it on renders the `<details>` panels on the frontend.
3. Panel text is flush-left (hanging indent reset works), summary is readable, export links render as an inline row.
4. RIS/CSL-JSON (and BibTeX/BibLaTeX once present) links work; toggling off removes the panels; content remains readable with the plugin deactivated.

Phase 04 is **code-complete** with all automated gates green; this visual confirmation is the only outstanding item.
