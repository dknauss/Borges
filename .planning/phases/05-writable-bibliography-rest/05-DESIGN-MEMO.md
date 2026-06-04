# Writable Bibliography REST API — Design Memo

**Status:** Draft for review  
**Date:** 2026-05-10  
**Area:** Architecture  

---

## Problem

The current REST endpoints are intentionally read-only:

```
GET  /bibliography/v1/posts/{post_id}/bibliographies
GET  /bibliography/v1/posts/{post_id}/bibliographies/{index}
```

Large WordPress networks, remote editorial pipelines, and AI citation agents need to manage bibliography blocks across many posts — correcting DOIs, deduplicating, normalising styles, migrating citation formats. With read-only endpoints, the only write path is the Gutenberg block editor, which is unavailable to headless or batch contexts.

The core constraint: Borges uses a **static save** — `post_content` stores both block attributes (CSL-JSON, settings) and the rendered bibliography HTML. Any write path must update both layers atomically, or citation data and frontend output drift apart.

---

## Non-goals

- No server-rendered frontend (no `render_callback`); static save is a hard constraint.
- No shortcodes or dynamic rendering.
- No mutation capability for authenticated-but-unauthorized users.
- No writable WordPress Abilities registration until the API stabilises in WP core; feature-detection only.

---

## Guiding principles

1. **Non-destructive first.** Ship validation, preview, diff, and export routes before any mutation routes. Each tier should be independently releasable.
2. **Static-save coherence.** Every write must update both CSL-JSON attributes and the rendered HTML `save()` output in `post_content`. Partial updates are rejected.
3. **Capability-gated.** All mutations require `edit_post` on the target post at minimum; bulk or cross-post operations require `edit_others_posts`.
4. **Auditable.** Writes should use `wp_update_post()` so WordPress revisions capture the before/after.
5. **Dry-run mandatory.** Every mutation route must support a `?dry_run=true` query param that returns the diff without committing.
6. **Stable IDs.** Each bibliography block and each citation entry needs a stable, post-scoped identifier that survives reordering. This does not exist yet — it is a prerequisite.

---

## Proposed route surface

### Tier 0 — Stable IDs (prerequisite, no routes)

Before writable routes can exist, each bibliography block needs a stable `bibliographyId` attribute and each citation entry needs a stable `id` field within its CSL-JSON object. These must be assigned on block insertion and preserved across saves.

**Implementation:** add a `bibliographyId` UUID attribute to `block.json`; assign in `edit.js` on first render if absent. Add `id` to each CSL-JSON item in `use-citation-editor-state.js` on import if absent.

**Risk:** low — existing blocks get IDs lazily on next save, no migration required.

---

### Tier 1 — Non-destructive read extensions (safe to ship independently)

These extend the existing read endpoints with richer output formats and computed metadata. No post_content is written.

```
GET /bibliography/v1/posts/{post_id}/bibliographies/{index}?format=diff&style=apa
```
Returns a preview of how the bibliography would look reformatted to a different CSL style — no write.

```
GET /bibliography/v1/posts/{post_id}/bibliographies/{index}/validate
```
Returns per-entry CSL-JSON validation results (missing required fields, malformed DOIs, etc.) without touching the post.

```
GET /bibliography/v1/posts/{post_id}/bibliographies/{index}/duplicates
```
Returns pairs of entries that appear to be duplicates (same DOI, or same normalised title + author + year).

---

### Tier 2 — Entry-level mutations (post-scoped, reversible via revisions)

All routes below require `edit_post` on the target post. All support `?dry_run=true`.

```
POST /bibliography/v1/posts/{post_id}/bibliographies/{index}/citations
```
Add one or more CSL-JSON entries. Body: `{ "items": [...CSL-JSON...] }`. Returns the updated bibliography state.

```
PATCH /bibliography/v1/posts/{post_id}/bibliographies/{index}/citations/{citation_id}
```
Update fields on a single citation. Body: partial CSL-JSON object. Forbidden fields: `id`, `type`. Returns the updated entry.

```
DELETE /bibliography/v1/posts/{post_id}/bibliographies/{index}/citations/{citation_id}
```
Remove a single citation. Requires `?dry_run=false` to confirm (default is dry_run). Returns the removed entry for undo reference.

```
PUT /bibliography/v1/posts/{post_id}/bibliographies/{index}/citations/order
```
Reorder citations. Body: `{ "ids": ["uuid1", "uuid2", ...] }` — must be a complete permutation of existing IDs, no additions or deletions.

---

### Tier 3 — Block-level mutations

```
PATCH /bibliography/v1/posts/{post_id}/bibliographies/{index}
```
Update block-level settings: `headingText`, `citationStyle`, `outputJsonLd`, `outputCoins`, `outputCslJson`. Does not touch individual citations. Returns the full updated block state.

```
POST /bibliography/v1/posts/{post_id}/bibliographies/{index}/reformat
```
Reformat all citations to a new CSL style. Updates both the block attribute and the rendered HTML. Body: `{ "style": "apa-7" }`. Idempotent.

---

### Tier 4 — Cross-block bulk operations (requires `edit_others_posts`)

```
POST /bibliography/v1/bulk/deduplicate
```
Body: `{ "post_ids": [...] }`. For each post, identify and optionally merge citation duplicates across bibliography blocks. Dry-run by default.

```
POST /bibliography/v1/bulk/reformat
```
Body: `{ "post_ids": [...], "style": "chicago-notes-bibliography" }`. Batch reformat. Rate-limited; returns a job ID for polling.

---

### Tier 5 — WordPress Abilities integration (feature-detected)

Register Abilities only when `WP_Abilities` class or `register_ability()` function exists (introduced as an experiment in WP 6.8+, not yet stable). Abilities surfaced:

- `bibliography/read` — read bibliographies and citations
- `bibliography/write-citations` — add/update/delete citations (maps to `edit_post`)
- `bibliography/reformat` — reformat style (maps to `edit_post`)
- `bibliography/bulk-edit` — cross-post bulk operations (maps to `edit_others_posts`)

---

## Static-save coherence — implementation plan

Every mutation that changes citation data or block settings must regenerate the rendered bibliography HTML before writing `post_content`. The PHP formatter (`bibliography_builder_format_items()`) already exists and is used by `POST /format`. The write path will:

1. Deserialise the target block from `post_content` using `parse_blocks()`
2. Apply the mutation to the block's `attrs` array
3. Call the formatter to regenerate `innerHTML`
4. Serialise the updated block back using `serialize_block()`
5. Splice the serialised block back into `post_content`
6. Write via `wp_update_post()` so revisions are created
7. Return `200` with the updated block state; return `409` if the post has been concurrently modified (ETag / `If-Match` header support)

This splice approach is fragile for posts with many blocks. A safer alternative is to store the block index and use `str_replace` on the serialised block boundary. The correct approach needs a spike before Tier 2 ships.

---

## Concurrency and ETag

`wp_update_post()` does not provide optimistic locking. The write endpoints will:

- Return an `ETag` header on every read response, computed from `post_modified_gmt`
- Require an `If-Match` header on all mutation requests
- Return `412 Precondition Failed` if the post has been modified since the ETag was issued

This is best-effort — it prevents obvious lost-update races but does not handle simultaneous writes to different blocks in the same post.

---

## Capability matrix

| Operation | Required capability |
|---|---|
| Read bibliographies | `read` (public posts) / `edit_post` (draft/private) |
| Validate, diff, duplicate-check | `edit_post` |
| Add / update / delete citations | `edit_post` on target post |
| Reorder citations | `edit_post` on target post |
| Reformat style | `edit_post` on target post |
| Bulk deduplicate / reformat | `edit_others_posts` |
| Register Abilities | Server-side only, no user capability |

---

## Companion module vs. core plugin

The writable REST surface is optional infrastructure that most authors will never use. Shipping it in the main plugin inflates the plugin's attack surface and review complexity. The recommendation is:

**Ship Tiers 0–1 in the main plugin** (stable IDs and non-destructive read extensions are low-risk and useful to all users).

**Ship Tiers 2–5 as an opt-in companion plugin** (`borges-bibliography-rest-write` or similar), distributed separately and required to declare a dependency on the main plugin. This keeps the core plugin's REST surface minimal and makes the write API opt-in for network administrators.

This decision should be revisited once Tier 2 is prototyped and the static-save coherence spike produces concrete complexity estimates.

---

## Open questions

1. **Stable ID migration strategy.** Existing posts have no `bibliographyId` or citation `id`. When does the lazy-assignment happen — on next editor save only, or via a migration script? A migration script touching all posts is risky; lazy assignment is safe but means IDs don't exist until the author next opens the post.
2. **Formatter cost at write time.** The `/format` endpoint caps at 50 items and 1 MB. Bulk reformat of a 200-item bibliography via the REST API will need a different execution path (chunked, async, or WP-Cron-based). This needs a spike.
3. **Block index vs. bibliography ID.** The current read routes use `{index}` (0-based position in `parse_blocks()` output). This is fragile — inserting a block before the target shifts all indices. Once `bibliographyId` exists, the write routes should use it as the block identifier and the index routes should remain for backwards compatibility only.
4. **JSON schema.** The CSL-JSON subset Borges stores is not identical to full CSL-JSON (it omits some fields, adds `inputRaw` in older saves). The write API needs a documented, validated subset schema before accepting external input.
5. **Abilities API stability.** `WP_Abilities` is experimental as of WP 6.8. Wrapping it in a feature-detect is necessary; the Abilities tier should not block Tiers 2–3.

---

## Recommended sequencing

| Milestone | Scope | Blocker |
|---|---|---|
| M0 | Stable IDs (no routes) | None — implement in next feature sprint |
| M1 | Validate + diff read extensions (Tier 1) | M0 complete |
| M2 | Prototype Tier 2 add/update/delete (companion plugin) | M1 + static-save spike |
| M3 | Reformat, reorder, ETag (Tier 2 complete) | M2 validated |
| M4 | Bulk routes (Tier 4) | M3 + rate-limiting design |
| M5 | Abilities registration (Tier 5) | WP Abilities API stable |
