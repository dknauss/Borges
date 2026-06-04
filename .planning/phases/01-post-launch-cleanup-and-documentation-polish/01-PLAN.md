# Phase 1 Plan: Post-launch cleanup and documentation polish

## Objective

Bring project docs, planning state, compatibility wording, release tooling, and small maintainability items into alignment now that Borges Bibliography Builder `1.0.0` is live on WordPress.org.

## Scope

This is an easy, low-risk cleanup phase. Prefer documentation, planning, and small refactors. Do not start larger interoperability features such as frontend Cite/Export controls, BibLaTeX, or PMID work in this phase.

## Tasks

1. **Post-launch planning and project-name cleanup**
   - Update `.planning/STATE.md`, `.planning/ROADMAP.md`, and `.planning/PROJECT.md` from pre-publication/review language to live/publication language.
   - Rename planning-facing project title from “Bibliography Builder Block” to “Borges Bibliography Builder.”
   - Keep the old review-response todo converted into launch monitoring / hotfix readiness.

2. **Readme cross-link, demo, and REST API docs polish**
   - Add a prominent WordPress.org install/listing link to `README.md`.
   - Keep `readme.txt` linked back to the GitHub repository and full development README.
   - Add a WordPress Playground demo link to `readme.txt`, using concise wording and validating that the blueprint installs the intended current public package.
   - Expand the GitHub `README.md` REST API section with response shapes, supported formats, permission behavior, password-protected post behavior, explicit read-only limitations, and the separate editor-only formatter endpoint.
   - Keep WordPress.org `readme.txt` concise: mention the read-only REST endpoints without developer-level response/schema detail.
   - Keep GitHub Release, WordPress.org listing, and Playground links mutually consistent.

3. **Screenshot order alignment**
   - Use the same screenshot story in both `README.md` and `readme.txt`.
   - Show front-end bibliography output first, then editor-with-citations second.
   - Rename/regenerate `.wordpress-org/screenshot-*.png` or update captions as needed so WordPress.org ordering and readme ordering match.
   - Keep later screenshots/captions consistent between GitHub and WordPress.org.

4. **SPEC stale testing-gap cleanup**
   - Remove or revise stale SPEC language saying Multisite runtime coverage is a future gap.
   - Reflect current coverage: runtime smoke coverage includes a Multisite lane; SQLite is not currently in the GitHub runtime matrix.
   - Keep the manual testing checklist focused on release-gate manual checks rather than completed CI backlog items.

5. **Compatibility statement harmonization**
   - Set WordPress compatibility wording to WordPress 6.4+ and tested up to WordPress 7.0, based on current 7.0 RC2 validation.
   - Keep `readme.txt` concise and user-facing; avoid detailed CI matrix language on the WordPress.org listing.
   - Keep detailed runtime matrix information in GitHub contributor/development docs only, where it helps maintainers understand coverage.

6. **Deploy workflow ergonomics**
   - Add `workflow_dispatch` to `.github/workflows/wp-deploy.yml` so WordPress.org deploys can be manually rerun for patch releases or listing/asset corrections.
   - Document safe rerun expectations: build/package/stage assets first, deploy curated package directory only, never commit source-only assets or development files to SVN.

7. **Small code hygiene sweep**
   - Consolidate duplicated `getPrimaryIdentifierValue` into a shared utility with targeted tests.
   - Upgrade the formatting cache from FIFO eviction to simple LRU semantics.
   - Rename or document the two `getYear` helpers so their different missing-date sentinel semantics are clear at call sites.

## Acceptance Criteria

- Public docs no longer describe the project as awaiting review or deploy.
- `README.md` and `readme.txt` have reciprocal public/developer links and consistent screenshot order.
- WordPress.org readme includes a concise Playground demo link if validation confirms the blueprint uses the intended package.
- GitHub README documents the read-only REST API in enough detail for developers, while WordPress.org readme stays concise.
- Compatibility copy consistently says tested up to WordPress 7.0 and avoids unnecessary CI-matrix detail in user-facing WordPress.org copy.
- SPEC testing-gap language matches current Multisite coverage and does not claim a SQLite lane exists.
- Manual WordPress.org deploy trigger exists and still deploys only the packaged release directory plus sanitized assets.
- Targeted unit tests cover any shared utility/cache behavior refactor.

## Verification Gates

Run the smallest practical gates after each slice, then the broader docs/build checks before merge:

```bash
git diff --check
npm run lint:js
npm run test
npm run build
npm run package:release
```

If code hygiene touches PHP or release workflow behavior, also run:

```bash
composer test:php
composer analyze:php
gh workflow view wp-deploy.yml
```
