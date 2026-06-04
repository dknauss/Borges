# Project State

_Last reviewed: 2026-05-11._

## Current Focus

1. `v1.3.3` is the current public release baseline. It restored DOI imports in
   browser-based WordPress Playground by using CrossRef's CSL transform endpoint
   directly, serialized DOI requests, and added a PubMed sample to the demo
   starter content.
2. `main` is currently three commits ahead of `v1.3.3` with post-release
   Playground E2E coverage and local hygiene only:
   - `4fee7d2` Add Playground DOI import smoke test
   - `1654cee` Ignore local Claude worktrees
   - `65275c8` Expand Playground citation import coverage
3. Keep the release artifact, WordPress.org SVN output, Playground blueprints,
   and docs aligned whenever DOI/PMID/BibTeX import behavior changes.
4. Next feature track remains frontend Cite/Export affordances, unless a
   release or Playground regression takes priority.

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
     public language-pack availability claims.

## Last Activity

- `v1.3.3` was cut and distributed after the DOI Playground fix.
- Playwright coverage now covers a single DOI paste, two DOI paste, and mixed
  DOI + PMID + BibTeX demo starter content.
- Local Claude worktrees were removed and ignored.
- Documentation was reviewed for current release, Playground, DOI resolver,
  PubMed/PMID, runtime matrix, and planning-state accuracy.

## Active Concerns

- **Main vs. release:** `main` is ahead of `v1.3.3` by E2E/hygiene/doc work.
  Do not retag or redeploy unless there is a real release reason.
- **Public pages:** Treat the live WordPress.org plugin page as canonical for
  version and language-pack availability. Avoid hard-coding official locale
  claims in planning docs.
- **Dependabot alerts:** Existing transitive dev-dependency alerts are not
  bundled in the WordPress.org release ZIP or static plugin output. Re-evaluate
  if upstream WordPress packages publish patched ranges.
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
