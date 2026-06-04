---
created: 2026-05-04T10:30:00Z
title: Investigate writable bibliography REST API and Abilities integration
area: architecture
files:
  - /Users/danknauss/Developer/GitHub/wp-bibliography-block/bibliography-builder.php
  - /Users/danknauss/Developer/GitHub/wp-bibliography-block/src/save-markup.js
  - /Users/danknauss/Developer/GitHub/wp-bibliography-block/src/lib/parser.js
  - /Users/danknauss/Developer/GitHub/wp-bibliography-block/src/lib/export.js
  - /Users/danknauss/Developer/GitHub/wp-bibliography-block/SPEC.md
  - /Users/danknauss/Developer/GitHub/wp-bibliography-block/.planning/ROADMAP.md
---

## Problem

Large WordPress networks, remote editorial systems, and AI citation-management agents may need to inspect and manage Borges bibliography blocks across many posts or sites. Current REST endpoints are intentionally read-only, which is safe for public/programmatic access but does not support remote citation correction, DOI normalization, duplicate cleanup, style migration, or AI-assisted bibliography maintenance.

Writable support is non-trivial because Borges saves static block output in `post_content`. A write path must update both the block attributes and the saved static bibliography markup, or the canonical citation data and rendered frontend output can drift apart.

## Solution

Plan a future architecture investigation for a writable REST API and optional WordPress Abilities API integration. Start with low-risk, non-destructive operations such as validation, preview, diff, export, and reformatting. Only then consider write operations that add, update, remove, or reorder citations.

The design should include stable bibliography and citation IDs, strict schema validation, capability checks, revisions/audit metadata, optimistic locking, dry-run diffs, static-output regeneration, and feature-detected Abilities registration for AI/automation clients on WordPress versions that support it.

## Acceptance targets

- document whether writable APIs should live in the main plugin or an enterprise/automation companion module
- define stable route/ability names and JSON schemas before implementation
- preserve the static-save/deactivation-resilience requirement for every write
- require `edit_post` or a purpose-specific capability for all mutations
- include dry-run/preview first; make destructive writes explicit and auditable
- feature-detect Abilities API support so WordPress 6.4+ compatibility remains intact
