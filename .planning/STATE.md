# Project State

_Last reviewed: 2026-09-25._

## Current Focus

0. **`v1.6.0` (2026-09-24) is the current release baseline.** Version strings
   agree across the plugin header, `package.json`, `block.json`, and
   `readme.txt` (`Stable tag: 1.6.0`, `Tested up to: 7.1`). Treat the live
   WordPress.org plugin page as canonical for the publicly available version.
1. **1.6.0 shipped** PMCID, arXiv, and ISBN import, pinned BibLaTeX import,
   read-only Abilities, and the i18n catch-up (#87), after the README/metrics
   drift fix (#84). `[Unreleased]` carries one change since: PMCID, arXiv,
   and ISBN samples in the Playground demo post (#89). The release and
   main-build demos pick it up without a release; the WordPress.org Preview
   blueprint ships with the next deploy.
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
3. **Active phases** are still only `05-writable-bibliography-rest` (read-only
   Abilities shipped in 1.6.0; writable milestones deferred) and
   `06-ci-optimization` (unplanned strategy sketch). Neither gates a release.
4. Keep the release artifact, WordPress.org SVN output, Playground blueprints,
   and docs aligned whenever import behavior changes for any supported input
   (DOI, PMID, PMCID, arXiv, ISBN, BibTeX/BibLaTeX, free text).

## Current Priority Order

See "Immediate next-task priorities (2026-09-25)" in `ROADMAP.md` for the full
ordering. In short:

1. **CI, runtime, and Playground hygiene** (standing)
2. **Reference-manager export corpus**: addresses the paste/import coverage gap
3. ~~**Extract the resolvers**~~: done, unreleased (`includes/resolvers.php`)
4. ~~**Phase 05 M0: stable entry IDs**~~ and ~~**M1 review routes**~~: done,
   unreleased; M2 (Tier 2 writes) waits on the static-save coherence spike
5. **First-wave official language packs**

## Last Activity

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
- Research benefits of a leaner root plugin file (2026-06-17).
- Test more reference-manager exports — Zotero, Mendeley, EndNote, etc.
  (2026-06-23).

## Roadmap Alignment

Shipped lines: 1.3.x (`v1.3.0`–`v1.3.4`), 1.4.x (`v1.4.0`–`v1.4.2`), 1.5.x
(`v1.5.0`, `v1.5.1`), 1.6.x (`v1.6.0`). Phases 04 (Cite/Export) and 07
(embedded identifiers) are shipped and archived. Phase 05 shipped its read-only
Abilities cut in 1.6.0, and M0 (stable IDs) and M1 (review routes) since; its
writable milestones (M2–M4) remain behind the design memo. Phase 06 is an unplanned sketch. Future
work is tracked against release versions, not a GSD milestone label.
