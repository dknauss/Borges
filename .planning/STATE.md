# Project State

_Last reviewed: 2026-06-17._

## Current Focus

1. `v1.3.3` is the current public release baseline. It restored DOI imports in
   browser-based WordPress Playground by using CrossRef's CSL transform endpoint
   directly, serialized DOI requests, and added a PubMed sample to the demo
   starter content.
2. `main` is currently 11 commits ahead of `v1.3.3` with post-release
   test, documentation, planning, hygiene, and dev-dependency work:
   - `4fee7d2` Add Playground DOI import smoke test
   - `1654cee` Ignore local Claude worktrees
   - `65275c8` Expand Playground citation import coverage
   - `7176f41` Refresh documentation for current release state
   - `d372501` chore(deps): bump qs in the npm_and_yarn group across 1 directory
   - `8893b32` test(sort): add REQ-S4 coordination fixture cases and fix lint
   - `fbe09da` chore(deps-dev): bump shell-quote
   - `4519dd4` Refresh planning state after dependency update
   - `8002bed` chore(deps-dev): bump webpack-dev-server
   - `adb8998` Document dependency alert resolution
   - `b44a899` Add direct access guard to PMID helpers
3. Keep the release artifact, WordPress.org SVN output, Playground blueprints,
   and docs aligned whenever DOI/PMID/BibTeX import behavior changes.
4. Phase 04 (frontend Cite/Export affordances) is **implementation
   code-complete** on branch `phase-04/cite-export-affordances` (PR #37),
   covering plans 04-01 through 04-04. All automated gates pass (570 Jest
   tests, lint, build); the only outstanding item is the plan 04-04 human
   browser-verify checkpoint (visual confirmation in the editor + frontend),
   which must be completed in a browser-capable session before merge.

## Current Priority Order

1. **Release and Playground reliability**
   - Keep DOI, PMID, BibTeX, and mixed demo imports working in the GitHub
     Playground blueprint and the WordPress.org Preview blueprint.
   - The GitHub/readme blueprint installs the latest GitHub Release ZIP through
     the WordPress Playground CORS proxy; the WordPress.org Preview blueprint
     relies on WordPress.org to install Borges automatically.
2. **CI and runtime compatibility hygiene**
   - Current runtime matrix covers PHP 7.4-8.4, WordPress 6.4/6.7/latest,
     Apache/Nginx, MySQL, and one Multisite lane.
   - SQLite is not currently in the GitHub runtime matrix; add it only when a
     compatibility risk justifies the extra lane.
3. **Interoperability backlog**
   - Frontend Cite/Export affordances are the next planned user-facing feature.
   - BibLaTeX export and PMID input/proxy are shipped; remaining identifier
     expansion should use the resolver-layer model from `SPEC.md`.
4. **Translation and language-pack expansion**
   - The live WordPress.org plugin page is the canonical source for official
     generated language packs.
   - Bundled PO/MO files are seed/import material for translator review, not
     public language-pack availability claims. The 2026-06-14 i18n refresh
     brought all 19 seed PO/MO locale pairs up to the current 93-string POT.

## Last Activity

- `v1.3.3` was cut and distributed after the DOI Playground fix.
- Playwright coverage now covers a single DOI paste, two DOI paste, and mixed
  DOI + PMID + BibTeX demo starter content.
- Local Claude worktrees were removed and ignored.
- Documentation was reviewed for current release, Playground, DOI resolver,
  PubMed/PMID, runtime matrix, and planning-state accuracy.
- Dependabot PR #33 was merged, bumping `shell-quote` from 1.8.3 to 1.8.4 and
  clearing the critical `shell-quote` alert.
- `webpack-dev-server` was bumped beyond the patched 5.2.4 threshold; the
  remaining `uuid` and `showdown` alerts were dismissed in GitHub as tolerable
  transitive development-dependency risk with comments.
- The POT, 19 seed PO files, and 19 seed MO files were refreshed from current
  source strings; active docs now point to the live WordPress.org Languages
  list for official language-pack availability.
- Historical Phase 1-3 planning docs and the implemented performance
  remediation plan were archived out of the active planning paths.

## Active Concerns

- **Main vs. release:** `main` is ahead of `v1.3.3` by E2E, hygiene, docs,
  sorting-test, and dev-dependency lockfile work. Do not retag or redeploy
  unless there is a real release reason.
- **Public pages:** Treat the live WordPress.org plugin page as canonical for
  version and language-pack availability. Avoid hard-coding official locale
  claims in planning docs.
- **Dependabot alerts:** No open Dependabot alerts remain. Re-evaluate dismissed
  `uuid` and `showdown` alerts if upstream WordPress packages publish patched
  compatible ranges or Showdown publishes a patched release.
- **Coverage:** The main remaining quality gap is broader browser/E2E coverage
  around paste/import behavior, especially external metadata resolution paths.

## Pending Todos

- 1 pending todo in `.planning/todos/pending`:
  - Add frontend Cite and Export affordances.

## Roadmap Alignment

Post-launch Phase 2 performance/stability remediation is complete and shipped.
Phase 3 release prep produced the 1.3.x release line; `v1.3.3` is the current
release baseline. Phase 4, frontend Cite/Export affordances, is the next planned
feature phase.
