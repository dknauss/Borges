# Project State

_Last reviewed: 2026-09-24._

## Current Focus

0. **`v1.5.1` (2026-08-19) is the current release baseline.** Version strings
   agree across the plugin header, `package.json`, `block.json`, and
   `readme.txt` (`Stable tag: 1.5.1`, `Tested up to: 7.1`). Treat the live
   WordPress.org plugin page as canonical for the publicly available version.
1. **`main` since 1.5.1** carries only maintenance: CI job timeouts (#80),
   clipboard error-cause preservation (#82), release-checklist compatibility and
   version-string gates (#83), and a dev-dependency security refresh (#86). The
   `[Unreleased]` changelog section is empty; nothing on `main` requires a
   release yet.
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
3. **Active phases** are still only `05-writable-bibliography-rest` (design
   memo; implementation deferred) and `06-ci-optimization` (unplanned strategy
   sketch). Neither gates a release.
4. Keep the release artifact, WordPress.org SVN output, Playground blueprints,
   and docs aligned whenever DOI/PMID/BibTeX import behavior changes.

## Current Priority Order

See "Immediate next-task priorities (2026-09-24)" in `ROADMAP.md` for the full
ordering. In short:

1. **CI, runtime, and Playground hygiene** (standing)
2. **BibLaTeX import** — done, unreleased (`[Unreleased]` in `CHANGELOG.md`)
3. **Reference-manager export corpus** — addresses the paste/import coverage gap
4. **Identifier resolvers** — PMCID and arXiv done (unreleased); ISBN next
5. **Phase 05 read-only Abilities** — re-check the memo's core-API gate first
6. **First-wave official language packs**

Suggested 1.6.0 scope: BibLaTeX import + PMCID + read-only Abilities.

## Last Activity

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
- **Coverage:** Broader browser/E2E coverage around paste/import behavior remains
  the main quality gap, especially external metadata resolution paths and real
  reference-manager exports.

## Pending Todos

Three in `.planning/todos/pending/`:

- Coordinate first-wave language packs (2026-06-14).
- Research benefits of a leaner root plugin file (2026-06-17).
- Test more reference-manager exports — Zotero, Mendeley, EndNote, etc.
  (2026-06-23).

## Roadmap Alignment

Shipped lines: 1.3.x (`v1.3.0`–`v1.3.4`), 1.4.x (`v1.4.0`–`v1.4.2`), 1.5.x
(`v1.5.0`, `v1.5.1`). Phases 04 (Cite/Export) and 07 (embedded identifiers)
are shipped and archived. Phase 05 is deferred behind its design memo; Phase 06
is an unplanned sketch. Future work is tracked against release versions, not a
GSD milestone label.
