---
created: 2026-05-04T15:35:00Z
title: Add optional Block Accessibility Checks compatibility
area: accessibility
files:
    - /Users/danknauss/Developer/GitHub/wp-bibliography-block/bibliography-builder.php
    - /Users/danknauss/Developer/GitHub/wp-bibliography-block/src/index.js
    - /Users/danknauss/Developer/GitHub/wp-bibliography-block/tests/e2e/a11y.spec.js
    - /Users/danknauss/Developer/GitHub/wp-bibliography-block/.planning/ROADMAP.md
---

## Problem

Troy Chaplin's Block Accessibility Checks plugin/framework can surface block-specific accessibility guidance directly in the editor. Borges already has automated Playwright/axe and keyboard checks, but those checks run outside the authoring session. A soft integration would help authors catch bibliography-specific issues while editing, and it could become a reusable pattern for Dan's block plugins.

## Solution

Add an optional compatibility layer with Block Accessibility Checks without making it a hard runtime dependency. Feature-detect the framework before registering checks. Keep the integration advisory and author-facing: do not block saving, do not duplicate core WordPress accessibility notices, and do not weaken the static-save architecture.

Candidate Borges checks:

-   Warn when a bibliography block has citations but no visible heading or accessible label/context.
-   Warn when the block is empty and published output would be omitted.
-   Warn when citation entries contain links whose visible text is only a raw URL/DOI and a more descriptive citation label is available.
-   Warn when metadata outputs are all disabled on pages intended for citation-manager interoperability, while making clear that this is interoperability guidance rather than a WCAG error.
-   Keep deprecated ARIA-role detection in axe/Playwright; do not reintroduce `doc-biblioentry` or other deprecated roles.

## Acceptance targets

-   Soft dependency only: Borges works normally when Block Accessibility Checks is absent.
-   Register checks through the current framework API after confirming the latest docs and plugin version.
-   Unit or E2E coverage proves the compatibility layer is inert without the framework and registers expected checks when present.
-   Document that this is an editor-authoring assist, complementary to `npm run test:a11y`, axe DevTools, WAVE/manual checks, keyboard testing, and screen-reader testing.
-   Extract a reusable pattern for other Dan Knauss block plugins if the integration proves useful.
