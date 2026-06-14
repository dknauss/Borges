# Phase 06: CI Optimization

## Goal

Reduce CI wall-clock time and duplicated setup work while preserving the current release-confidence envelope for parser, formatter, Playground, WordPress runtime, accessibility, and package/deploy behavior.

## Baseline

As of 2026-06-14:

-   Main CI completes in roughly six minutes when runner capacity is available.
-   The slowest lane is the Playground/lifecycle job, especially browser install, Playground boot, lifecycle tests, and result upload.
-   Runtime matrix coverage is valuable but broad for every PR.
-   JS dependency install and production build happen repeatedly across CI, runtime smoke, package artifact, release, and WordPress.org deploy workflows.
-   Coverage upload is non-blocking but still consumes full JS and PHP test runs.

## Phase 06.1: Measure Before Cutting Further

1. Add a lightweight CI timing summary step or use `gh run view --json jobs` snapshots to record per-job and per-step durations for several runs.
2. Capture separate timings for cold-cache and warm-cache runs.
3. Track:
    - `npm ci`
    - `npm run build`
    - Playwright browser install
    - Playground startup
    - lifecycle E2E
    - runtime matrix smoke setup
    - Composer install
    - coverage generation/upload

Exit criteria:

-   A short timing baseline exists in this phase directory.
-   Optimization targets are ranked by observed wall-clock impact.

## Phase 06.2: Reuse Expensive Artifacts

1. Build once in the fast quality path and upload a build artifact for downstream package/Playground jobs where trust boundaries permit.
2. Reuse the packaged release zip between package artifact and lifecycle E2E on the same commit.
3. Keep release-tag and WordPress.org deploy workflows capable of independent rebuilds unless an explicit artifact-promotion policy is adopted.

Risks:

-   Artifact reuse can hide packaging drift if the wrong artifact is promoted.
-   Release/deploy should stay independently reproducible unless this is documented as a deliberate release process change.

Exit criteria:

-   CI package/lifecycle jobs no longer repeat unnecessary builds.
-   Release and deploy reproducibility remains documented.

## Phase 06.3: Cache Browser and Tooling State

1. Cache `~/.cache/ms-playwright` keyed by Playwright package version.
2. Evaluate whether `@wp-playground/cli` can be pinned and cached rather than fetched with `@latest`.
3. Confirm cached Playwright browsers still receive required OS dependencies through `npx playwright install --with-deps chromium`.

Exit criteria:

-   Browser install step becomes mostly cache-hit time.
-   Playground CLI version is pinned or there is a documented reason to keep `@latest`.

## Phase 06.4: Right-Size Slow Confidence Jobs

1. Keep PR runtime smoke to the three high-signal lanes:
    - PHP 7.4 / WordPress 6.4 minimum support
    - PHP 8.3 / latest WordPress primary path
    - PHP 8.3 / latest WordPress Multisite
2. Keep full runtime matrix on `main`, release branches/tags, and manual dispatch.
3. Move coverage to `main`, scheduled, or manual dispatch unless coverage enforcement becomes required.
4. Split Playground smoke from lifecycle if PR feedback time remains too high:
    - PR: editor/import smoke plus accessibility.
    - Main/release: lifecycle install/activate/deactivate/delete.

Exit criteria:

-   PR checks remain high-signal and fast.
-   Full confidence checks still run before release decisions.

## Phase 06.5: Maintainability Cleanup

1. Reduce duplicated workflow YAML with reusable workflows if the duplication starts hiding drift.
2. Update release readiness docs to distinguish:
    - required PR checks
    - main-branch confidence checks
    - release-tag/deploy checks
    - delayed WordPress.org directory visibility under the Protect the Shire update-delay policy
3. Add a maintenance note for the Node 20 compatibility workflow and the criteria for removing it.

Exit criteria:

-   CI policy is clear to contributors.
-   Slow checks have explicit reasons and cadence.
-   Release checklist reflects WordPress.org directory delay expectations.

## Open Questions

-   Should the package artifact job be required on PRs, or is a build plus release-script unit coverage enough until `main`?
-   Should coverage run on every `main` push or only nightly/manual?
-   Do we want `@wp-playground/cli` pinned for reproducibility, or is tracking latest part of the compatibility signal?
-   How much release/deploy artifact promotion are we comfortable with versus independent rebuilds?
