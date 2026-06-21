# Project State

_Last reviewed: 2026-06-21._

## Current Focus

1. `v1.4.1` is the current release baseline. `main` tip is `a1ad7a2`
   ("chore(release): prepare 1.4.1 (#51)"); tags run through `v1.4.0` and
   `v1.4.1`. The 1.4.x line shipped frontend Cite/Export affordances, CrossRef
   non-standard type mapping for book DOIs (`#45`), and uninstall data cleanup
   (`#49`). Treat the live WordPress.org plugin page as canonical for the
   publicly available version.
2. **Phase 04 (frontend Cite/Export affordances) is SHIPPED — not pending.** It
   merged via PR #37 (`3995d14`) and released in 1.4.0, with follow-up fixes in
   1.4.x (e.g. `de81e52` / #47: year rendering, ALL-CAPS name/title
   normalization, cite/export copy button). There is no outstanding pre-merge
   gate. The deterministic half of its former 04-04 browser checkpoint now has
   Playwright E2E coverage (PR #53, branch `test/e2e-cite-export`); only the
   visual layout row remains a manual/screenshot pass.
3. **Phase 07 (free-text embedded-identifier resolution, Tier 1) is complete.**
   The parser extracts an embedded DOI/PMID from a full free-text citation and
   routes it to the existing CrossRef/NCBI resolvers, degrading to the heuristic
   freetext parse and then the limited-support message on failure. In PR #52
   (branch `phase-07/free-text-embedded-identifier-resolution`), targeting
   `main`; not yet merged. Verifier passed 13/13; no new SSRF surface; dedup
   path reused unchanged.
4. Keep the release artifact, WordPress.org SVN output, Playground blueprints,
   and docs aligned whenever DOI/PMID/BibTeX import behavior changes.

## Current Priority Order

1. **Release and Playground reliability**
   - Keep DOI, PMID, BibTeX, and mixed demo imports working in the GitHub
     Playground blueprint and the WordPress.org Preview blueprint.
   - The GitHub/readme blueprint installs the latest GitHub Release ZIP through
     the WordPress Playground CORS proxy; the WordPress.org Preview blueprint
     relies on WordPress.org to install Borges automatically.
2. **CI and runtime compatibility hygiene**
   - Runtime matrix covers PHP 7.4-8.4, WordPress 6.4/6.7/latest, Apache/Nginx,
     MySQL, and one Multisite lane. SQLite is not in the matrix; add only when a
     compatibility risk justifies it.
   - Phase 06 (CI optimization) exists only as a strategy sketch
     (`.planning/phases/06-ci-optimization/06-PLAN.md`, sub-phases 06.1-06.5);
     it has never been planned into executable tasks and is out of scope until
     prioritized.
3. **Interoperability backlog**
   - Frontend Cite/Export affordances are **shipped** (1.4.x).
   - Embedded-identifier Tier 1 is **done** (PR #52). Further identifier
     expansion should use the resolver-layer model from `SPEC.md`; Tier 2
     (generic monograph fallback) and Tier 3 (CRF/ML parsing) remain out of
     scope.
   - Phase 05 (writable bibliography REST/Abilities) remains a design memo;
     implementation deferred.
4. **Translation and language-pack expansion**
   - The live WordPress.org plugin page is canonical for official generated
     language packs. Bundled PO/MO files are seed/import material for translator
     review, not public availability claims. The 2026-06-14 i18n refresh brought
     all 19 seed PO/MO locale pairs up to the current 93-string POT.

## Last Activity

- 2026-06-21: Phase 07 (embedded-identifier resolution) executed and completed
  across plans 07-01..07-03; opened PR #52.
- 2026-06-21: Added a cite/export frontend E2E regression spec
  (`tests/e2e/cite-export.spec.js`) wired into `test:e2e:playground`; opened
  PR #53.
- 2026-06-21: Corrected stale planning state. STATE/ROADMAP had described
  Phase 04 as code-complete and pending a pre-merge browser-verify, but it had
  in fact merged (#37) and shipped in 1.4.x. A v1.3 milestone audit, scope
  narrowing, and 04-04 browser-verify handoff built on that stale premise were
  retired (branch `docs/milestone-v1.3-audit` deleted).
- Earlier 1.4.x work on `main`: prepare 1.4.0 (#43) and 1.4.1 (#51), lockfile
  sync (#44), DOI monograph-type mapping (#45), QA/code-review remediation,
  readme revision (#50), uninstall cleanup (#49).

## Active Concerns

- **Planning vs. git reality:** `.planning/` — and the GSD milestone label, which
  still reads `v1.3` — drifts from the actual releases. The project is on the
  1.4.x line. Verify any merge/release claim against `git log main` and tags, not
  the planning docs. ROADMAP.md still narrates the stale v1.3/Phase-04-pending
  framing and should be reconciled when the milestone is formally rolled.
- **Public pages:** Treat the live WordPress.org plugin page as canonical for
  version and language-pack availability. Avoid hard-coding official locale
  claims in planning docs.
- **Dependabot alerts:** GitHub's push banner reports 4 alerts (3 moderate,
  1 low) on the default branch as of 2026-06-21 — re-triage when prioritized.
- **Coverage:** Broader browser/E2E coverage around paste/import behavior remains
  the main quality gap, especially external metadata resolution paths.
  Cite/export now has a regression spec (PR #53).

## Pending Todos

Two resolved todos were pruned 2026-06-21: "Add frontend Cite and Export
affordances" (shipped in 1.4.x) and "Resolve DOIs embedded in free-text
citations" (Phase 07, complete in PR #52). Two remain in
`.planning/todos/pending/`:

- Coordinate first-wave language packs (2026-06-14).
- Research benefits of a leaner root plugin file (2026-06-17).

## Roadmap Alignment

The 1.3.x release line shipped (`v1.3.0`-`v1.3.4`); 1.4.x is current (`v1.4.0`,
`v1.4.1`). Phase 04 (Cite/Export affordances) shipped in 1.4.x. Phase 07
(embedded-identifier resolution, Tier 1) is complete and in PR #52. Phase 05
(writable bibliography REST/Abilities) is deferred (design memo). Phase 06
(CI optimization) is an unplanned strategy sketch. The GSD milestone label
(`v1.3`) is stale relative to the actual 1.4.x line and should be reconciled when
the milestone is formally rolled.
