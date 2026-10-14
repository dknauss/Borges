---
created: 2026-10-14T23:20:00Z
title: Research raising the PHP floor from 7.4 to 8.x
area: compatibility
files:
  - bibliography-builder.php
  - readme.txt
  - phpcs.xml.dist
  - .github/workflows/runtime-matrix.yml
  - docs/planning/refactor-and-standards-memo.md
---

## Problem

The plugin declares `Requires PHP: 7.4`. PHP 7.4 has been end-of-life since
November 2022, 8.0 since November 2023, and 8.1 since December 2025. The
question is whether a PHP 8.x floor would pay for the sites it leaves behind.
Sites below a raised floor stop getting Borges updates, including security
fixes.

## First findings (2026-10-14, against `main` after #151)

- **Performance: no gain.** How fast PHP runs depends on the host's PHP
  version, not on the plugin's declared minimum. A site already on 8.x runs
  Borges exactly as fast either way. Raising the floor only excludes 7.x
  sites. The JIT does not help WordPress-style request handling, and citeproc
  formatting runs only in the editor.
- **Leaner code: a few lines.**
  - PHPCompatibilityWP (`testVersion 7.4-`, #151) finds zero violations, so
    7.4 has never forced a workaround.
  - One helper exists only because of 7.4: `bibliography_builder_is_list_array()`
    would become `array_is_list()` (8.1).
  - `str_contains()` and similar are already polyfilled by WordPress.
  - The arXiv resolver's DOCTYPE guard mentions 7.4 hosts but is sound on any
    version; keep it.
  - The code has no `switch` statements for `match` to replace, and its data
    is arrays, not objects, so `?->` would not help.
- **Maintainability: modest, mostly types.**
  - Union types (8.0), enums and `readonly` (8.1) would turn about 100
    `mixed` / `array|…` docblocks into types PHP enforces. Style keys could
    become an enum.
  - Most of that safety is available now through Psalm tightening (memo
    Phase D) without a floor change.
  - Two PHP 7.4 runtime-matrix cells would go.
  - Dev tooling already needs 8.3 (PHPUnit 12). citeproc-php needs only 7.3.
- **Audience.**
  - WordPress core dropped 7.2 and 7.3 in January 2026; 7.4 is its minimum and
    8.3 its recommendation.
  - About 62% of WordPress.org-reporting sites run PHP 8.2 or older (late
    September 2026).
  - No current figure for 7.4 alone was found; get it from the WordPress.org
    stats page before deciding.

## Research still to do

1. Get the current PHP 7.4, 8.0 and 8.1 shares from WordPress.org stats (and
   W3Techs as a cross-check), and follow the trend over two or three quarters.
2. Track WordPress core's own PHP-minimum plans (make.wordpress.org/core).
3. Check what comparable block plugins in the directory require, using the
   Veloria directory data.
4. List the type declarations, enums and `readonly` uses that an 8.1 floor
   would enable, and estimate the change size; weigh it against Psalm
   tightening alone.
5. Decide how to warn sites first: a release note, and possibly an admin
   notice on PHP < 8.1 one release ahead (without adding stored settings; the
   persistence audit forbids options).

## Recommendation so far

**Phase D gets most of the maintainability benefit of a PHP 8.x floor with nobody left behind.** Psalm tightening (memo Phase D) gives most of the type safety
an 8.x floor would, without excluding any site, so do Phase D first and judge
the floor on what is left.

Keep 7.4 for now. Revisit when WordPress core moves its minimum to 8.x or 7.4
drops below about 5% of installs. When raising, go straight to **8.1**: it is
the first version whose features (`array_is_list`, enums, `readonly`) buy
anything here.
