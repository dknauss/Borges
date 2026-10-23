# Project State

_Last reviewed: 2026-10-23._

## Current Focus

0. **`v1.13.0` (2026-10-23) is the current release baseline.** Version strings
   agree across the plugin header, `package.json`, `block.json`, and
   `readme.txt` (`Stable tag: 1.13.0`, `Tested up to: 7.1`). Treat the live
   WordPress.org plugin page as canonical for the publicly available version.
1. **1.13.0** enriches the rendered JSON-LD, has the post's Article cite the
   works with Yoast SEO or Rank Math, and adds the output-defaults filter
   (#170). **1.12.0** fixes newsletters and feeds, sorts particle names per
   style, adds the per-entry formatter cache and the write abilities, and
   completes the refactor memo (#156–#178). **1.11.0** nests cited works in
   one JSON-LD `ItemList` and takes 200-entry formatter requests.
   **1.10.0** imports OCLC/LCCN/Open Library and Internet Archive identifiers,
   opens Edit fields on every citation, and adds an optional Google Books API
   key (#128–#134). **1.9.1** imports pasted CSL-JSON and fixes quoted titles and the JSON-LD
   DOI url (#123). **1.9.0** adds a Heading Level setting for the visible heading (#121).
   **1.8.2** stores every structured-edit text field as plain text (#118).
   **1.8.1 fixed** literal HTML tags in stored citation text (#116; `<i>`/`<em>`
   render as italics, other tags are dropped) and opens GitHub Releases with the
   CHANGELOG section (#115). **1.8.0 shipped** current editions of Chicago (18th), Cite Them Right 13,
   OSCOLA 5, and ABNT NBR 6023:2025, MLA 9 repeated-author hyphens (#111), the
   Article number field (#112), a formatter cache keyed on style contents, the
   nginx runtime fix (#109), and an editor-readiness helper for the E2E specs.
   1.7.0 shipped the full GPL CSL styles and locales (#103), Phase 05
   M0–M3 (stable IDs, review routes and abilities, opt-in citation and block
   write routes: #104, #106), the save-markup language fix, reference-manager
   `.bib` fixes, the demo page (#102), and the runtime matrix on the release
   package with formatter-parity and write-route checks (#105).
2. **Releases since the GSD `v1.3` milestone was retired (2026-06-21):**
   - 1.4.2 (2026-06-21) — shipped Phase 07 embedded-identifier resolution (#52)
     and the cite/export E2E spec (#53).
   - 1.5.0 (2026-08-04) — security hardening (formatter string caps, bounded
     read-side stripping, publicly-viewable post type check, http/https link
     allowlist, U+2028/2029 escaping, `wp_safe_remote_get` for PMID), BAC 4.0
     integration, main-build Playground demo, metrics doc + `verify:metrics`
     gate, deprecation-chain regression tests.
   - 1.5.1 (2026-08-19) — WordPress 7.1 compatibility; clipboard fallback on a
     rejected `writeText`.
   - 1.6.0 (2026-09-24) — PMCID/arXiv/ISBN resolvers, BibLaTeX import,
     read-only Abilities, i18n catch-up.
   - 1.7.0 (2026-09-26) — full CSL styles, Phase 05 M0–M3, save-markup
     language fix, `.bib` import fixes, release-package runtime matrix.
   - 1.8.0 (2026-10-05) — current Chicago/Harvard/OSCOLA/ABNT editions, MLA
     repeated authors, Article number field, style-keyed formatter cache.
   - 1.8.1 (2026-10-06) — inline `<i>`/`<em>` rendered, other tags stripped.
   - 1.8.2 (2026-10-06) — structured-edit text fields saved as plain text.
   - 1.9.0 (2026-10-06) — Heading Level setting for the visible heading.
   - 1.9.1 (2026-10-07) — CSL-JSON paste, quoted-title italics, JSON-LD DOI url.
   - 1.10.0 (2026-10-09) — catalog and Internet Archive import, Edit fields everywhere, Google Books key.
   - 1.11.0 (2026-10-14) — cited works nested in one JSON-LD `ItemList`; 200-entry formatter requests.
   - 1.12.0 (2026-10-22) — newsletters and feeds, particle sorting per style, per-entry formatter cache, write abilities, refactor memo Phases A–E.
   - 1.13.0 (2026-10-23) — render-time JSON-LD enrichment, Article `citation` link, output-defaults filter.
3. **Active phases** are still only `05-writable-bibliography-rest` (M0–M3
   shipped in 1.7.0, M5 write abilities in 1.12.0; M4 bulk routes remain) and
   `06-ci-optimization` (unplanned strategy sketch). Neither gates a release.
4. Keep the release artifact, WordPress.org SVN output, Playground blueprints,
   and docs aligned whenever import behavior changes for any supported input
   (DOI, PMID, PMCID, arXiv, ISBN, BibTeX/BibLaTeX, free text).

## Current Priority Order

See "Immediate next-task priorities (2026-10-23)" in `ROADMAP.md` for the full
ordering. In short:

1. **CI, runtime, and Playground hygiene** (standing)
2. **Sort-conformance backlog**: test items closed and year suffixes added 2026-10-23; ABNT leading articles await a product decision
3. **WP-CLI read commands**: `list`, `export`, `validate` built 2026-10-23 (`docs/wp-cli.md`); `duplicates`, `preview`, and write commands still to consider
4. **Reference-manager export corpus**: needs real exports from the owner
5. **Phase 05 M4 bulk routes**: needs a rate-limiting design first
6. **First-wave official language packs**

## Last Activity

- 2026-10-23: Released 1.13.0 (#170).
- 2026-10-22: Released 1.12.0 (#156–#178); refactor memo Phases A–E complete.
- 2026-10-14: Released 1.11.0.
- 2026-10-09: Released 1.10.0 (#128–#134).
- 2026-10-07: Released 1.9.1 (#123).
- 2026-10-06: Released 1.9.0 (#121).
- 2026-10-06: Released 1.8.2 (#118).
- 2026-10-06: Released 1.8.1 (#114, #115, #116).
- 2026-10-05: Released 1.8.0 (#108, #109, #111, #112).
- 2026-09-26: Released 1.7.0 (#102–#106 and the fixes listed in the
  CHANGELOG).
- 2026-09-25: Phase 05 M1 review routes (`validate`, `duplicates`,
  `preview`) in `includes/review.php`.
- 2026-09-25: Demo-post samples for PMCID, arXiv, and ISBN (#89); planning
  docs moved to the post-1.6.0 priority list.
- 2026-09-24: Released 1.6.0 (#84, #87, #88).
- 2026-09-24: Reconciled STATE/ROADMAP to the 1.5.1 baseline; updated the open
  documentation-drift PR (#84) against `main`.
- 2026-08-19 → 2026-09: 1.5.1 release (#81), then #80, #82, #83, #86 on `main`.
- 2026-08-04: 1.5.0 release (#77).
- 2026-06-21: 1.4.2 release; Phase 07 (#52) and cite/export E2E (#53) merged;
  STATE/ROADMAP synced to 1.4.x (#54).

## Active Concerns

- **Planning vs. git reality:** `.planning/` has drifted from actual releases
  before (it described 1.4.1 as current through the whole 1.5.x line). Verify
  any merge/release claim against `git log main`, tags, and `CHANGELOG.md`, and
  refresh this file when a release ships.
- **Public pages:** Treat the live WordPress.org plugin page as canonical for
  version and language-pack availability. Avoid hard-coding official locale
  claims in planning docs.
- **Dependabot:** #86 closed the open alerts that had an available fix. GitHub
  may still report alerts with no patched version; re-triage on the scheduled
  Dependency audit rather than tracking counts here.
- **Coverage:** Real reference-manager exports remain the main paste/import
  quality gap, now including BibLaTeX field mapping. Each external resolver
  (DOI, PMID, PMCID, arXiv, ISBN) has a live Playground check, but those are
  single-record happy paths against upstream services that can change.

## Pending Todos

Three in `.planning/todos/pending/`:

- Coordinate first-wave language packs (2026-06-14).
- Test more reference-manager exports — Zotero, Mendeley, EndNote, etc.
  (2026-06-23).
- Research raising the PHP floor from 7.4 to 8.x (2026-10-14).

The leaner-root-file todo (2026-06-17) is completed: the refactor memo's
Phase B split shipped in 1.12.0.

## Roadmap Alignment

Shipped lines: 1.3.x (`v1.3.0`–`v1.3.4`), 1.4.x (`v1.4.0`–`v1.4.2`), 1.5.x
(`v1.5.0`, `v1.5.1`), 1.6.x (`v1.6.0`). Phases 04 (Cite/Export) and 07
(embedded identifiers) are shipped and archived. Phase 05 shipped its read-only
Abilities cut in 1.6.0, and M0 (stable IDs) and M1 (review routes) since; its
writable milestones (M2–M4) remain behind the design memo. Phase 06 is an unplanned sketch. Future
work is tracked against release versions, not a GSD milestone label.
