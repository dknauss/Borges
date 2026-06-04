# Quick Task 2: Optimize editor-side CSL formatting

## Status

Completed/superseded by later performance planning. The 2026-04-04 quick task
delivered the initial benchmark harness, caller-owned formatting direction, and
LRU formatter cache work. The current execution plan is now
`/Users/danknauss/Developer/GitHub/wp-bibliography-block/.planning/phases/02-performance-stability-remediation/02-PLAN.md`,
with the hidden 51-entry cliff as the first P0 item.

## Goal

Reduce the highest-value performance cost identified by the 2026-04-04
Xdebug/profile review: repeated editor-side CSL formatting work during import,
edit, manual entry, and style switching.

## Tasks

1. Add measurement hooks or benchmark notes for a representative larger
   bibliography before making changes.
2. Audit current formatter call sites and identify where identical
   `(style, csl)` inputs still miss cache.
3. Tighten memoization in
   `/Users/danknauss/Developer/GitHub/wp-bibliography-block/src/lib/formatting/csl.js`
   so repeat formatting requests reuse results reliably.
4. Add a batch-aware reformat path for multi-entry operations such as style
   switching.
5. Validate formatter output, numeric-style numbering, and `displayOverride`
   behavior with targeted tests.
6. Record before/after results and note any remaining import-path work that
   should move to the follow-on deferred-formatting task.
