# Dependency Audit Policy

This plugin ships a small production dependency surface and a larger development/test toolchain. Treat them differently during remediation.

## Blocking release gate

A release is blocked by vulnerabilities in production dependencies:

-   `npm audit --omit=dev --omit=optional`
-   `composer audit --no-dev`

Production audit failures must be remediated, overridden through a documented package manager override, or explicitly accepted in the release notes with a reason the vulnerable code is unreachable in the packaged plugin.

## Scheduled monitoring

The weekly **Dependency audit** workflow runs:

-   a blocking production audit job for npm production dependencies and Composer dependencies
-   a non-blocking development audit job for npm dev tooling

Dev-tool vulnerabilities should be triaged promptly, but they are not automatically release blockers unless they affect CI integrity, build output, local secret exposure, or packaged release contents.

## Remediation order

1. Prefer direct dependency updates that keep the build and tests green.
2. Use package manager overrides only when the direct dependency cannot be updated safely.
3. Remove unused dependencies before adding compensating controls.
4. Re-run the production audit, test suite, build, and release package check before tagging.

## Current dev-tool audit status

As of 2026-06-20, `npm audit fix --omit=optional` was applied and the production audit remained clean. A full dev-tool audit still reports non-runtime vulnerabilities through WordPress/build/test tooling chains, primarily:

-   `@wordpress/scripts` and its Jest/Babel/webpack-dev-server/markdownlint transitive dependencies
-   `@wordpress/blocks` / `@wordpress/components` transitive `showdown` and `uuid` advisories
-   Playwright/Lighthouse/Sentry/OpenTelemetry dev tooling dependencies

The remaining npm-recommended fixes require breaking upgrades such as `@wordpress/scripts@32.x` and `@wordpress/components@35.x`, or have no direct fix available through the current WordPress package chain. These are tracked as dev-tool findings, not packaged runtime findings, until a dependency-maintenance branch can validate the breaking upgrade path across lint, Jest, build, and browser smoke tests.
