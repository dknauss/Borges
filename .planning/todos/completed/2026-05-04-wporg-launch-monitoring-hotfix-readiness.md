---
created: 2026-05-04T10:15:00Z
completed: 2026-05-10T00:00:00Z
title: Maintain WordPress.org launch monitoring and hotfix readiness
status: completed
area: release
phase: 01-post-launch-cleanup-and-documentation-polish
files:
  - readme.txt
  - bibliography-builder.php
  - block.json
  - CHANGELOG.md
  - .github/workflows/wp-deploy.yml
  - scripts/package-release.sh
---

## Problem

Borges Bibliography Builder is now live on WordPress.org. The project still needs a lightweight launch-monitoring and hotfix posture so public listing metadata, GitHub release assets, the WordPress.org SVN package, and any reviewer/user follow-up remain aligned.

## Solution

Keep release artifacts reproducible, monitor the WordPress.org listing/support surface after launch, and make the deploy workflow easy to rerun safely for patch releases or asset/readme-only updates.

## Acceptance targets

- ready-to-rebuild `borges-bibliography-builder.zip` artifact
- WordPress.org plugin page, `readme.txt`, GitHub README, and GitHub release metadata stay consistent
- reviewer or early-user requests can be addressed and redeployed in one patch cycle
- deploy workflow can be rerun manually without republishing a GitHub Release when appropriate

## Completion notes (2026-05-10)

Audit completed against all acceptance targets. The following misalignments were found and fixed:

- `bibliography-builder.php` had `Version: 1.2.0` — updated to `1.3.1`.
- `block.json` had `"version": "1.2.0"` — updated to `1.3.1`.
- `CHANGELOG.md` was missing the `[1.3.0]` entry entirely (jumped from 1.3.1 to 1.2.0) — added the 1.3.0 entry reconstructed from `readme.txt` changelog prose.

Items verified as already correct:

- `readme.txt`: `Stable tag: 1.3.1`, `Tested up to: 7.0`, description, and changelog entries for 1.3.1 and 1.3.0 are present and accurate.
- `README.md`: WordPress/PHP version badges, feature list, and recent release highlights are consistent with readme.txt.
- `package.json`: version `1.3.1` — correct.
- `.github/workflows/wp-deploy.yml`: includes `workflow_dispatch` trigger, so the deploy can be run manually without publishing a new GitHub Release. The workflow produces `output/release/borges-bibliography-builder/` as the `BUILD_DIR` for SVN deploy, which matches the `borges-bibliography-builder.zip` artifact path from `scripts/package-release.sh`.
- `scripts/package-release.sh`: strips dev Composer dependencies (`--no-dev`), removes `composer.lock` before zipping, prunes vendor test dirs/docs/images, and produces `output/release/borges-bibliography-builder.zip`.

## Remaining manual steps

- Verify the live WordPress.org plugin listing shows `Stable tag: 1.3.1` (browser access required).
- Confirm the WordPress.org support forum for the plugin has no open reviewer or early-user issues requiring a hotfix response.
- If a hotfix is needed: bump versions, update readme.txt and CHANGELOG.md, tag a release or use `workflow_dispatch` on `wp-deploy.yml` to redeploy without a new GitHub Release.
