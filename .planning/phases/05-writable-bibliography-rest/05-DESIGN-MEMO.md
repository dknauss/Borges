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

**Status (2026-09-25): done (unreleased).** `bibliographyId` and editor-side assignment shipped in 1.4.0 (#37). M0 closed the rest in `src/lib/stable-ids.js` and `src/hooks/use-stable-ids.js`:
- **Uniqueness within a post.** A duplicated or pasted block (the later one in document order) takes a new `bibliographyId` *and* new citation IDs, since citation IDs are the `ref-<id>` element IDs in saved markup and must be unique on the page.
- **Citation IDs.** Citations keep `id` as a top-level entry field, not inside the CSL-JSON object as sketched above; that is where every import path already put it. Missing, blank, whitespace-bearing, or repeated IDs are replaced on mount; any other existing ID is kept so `#ref-…` links survive.
- **No undo step.** Assignments are marked non-persistent via `__unstableMarkNextChangeAsNotPersistent` where available.
- **Read exposure.** The REST read routes and `borges/get-bibliographies` report `bibliographyId` (null until a post is next edited, or when the stored value is not `[A-Za-z0-9][A-Za-z0-9_-]{0,63}`).
- **Open question 1 answered:** lazy assignment on next edit, no migration script.
- **Known limit:** pasting a copy *above* the original leaves both IDs equal until the post is reopened, when the later block yields. The check runs at mount, and the original is already mounted.

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

**Status (2026-09-25): done (unreleased).** Shipped in `includes/review.php` with these changes from the sketch:
- **Addressing.** Each route takes `{ref}`: the index, or the block's `bibliographyId` (all-digit refs are indexes; the editor only generates UUIDs). This answers open question 3; a follow-up extended it to the existing single-bibliography route and the `borges/export-bibliography` ability, where index requests behave as before.
- **Abilities.** The follow-up also added `borges/validate-bibliography`, `borges/find-duplicate-citations`, and `borges/preview-bibliography-style`, sharing the routes' code and `edit_post` check.
- **Diff is a sub-route.** `?format=diff` became `GET …/{ref}/preview?style=<key>`, because it needs `edit_post` and runs citeproc, while the existing single route is publicly readable for published posts and never formats. The style must be one of the supported `citationStyle` keys (`apa-7`, not `apa`). Blocks over the formatter's 50-item cap return 400 (open question 2 still applies to writes).
- **Validate** reports `error`/`warning` issues per entry: the formatter's own CSL validator (`invalid-csl`), `missing-csl`, `missing-title`, `malformed-doi`, and warnings for `missing-author`, `missing-issued`, `missing-container-title` (journal, magazine, newspaper, chapter, conference paper), `invalid-isbn` (no checksum-valid ISBN), and `missing-id`.
- **Duplicates** mirrors the editor's `citationsMatch()` in `src/lib/deduplicate.js` rather than the stricter title + author + year: same DOI, or same title with the same year, the same first author, or neither. Each pair carries its `reason`.
- **Capability:** `edit_post` on the post for all three, as the matrix below says.

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

### Spike results (2026-09-25)

**Question:** can PHP regenerate the block's saved HTML exactly enough that the editor, which re-validates `post_content` against the JS `save()` on every open, accepts it?

**Answer: yes, for the current `save()`, with one prerequisite (below).** `includes/save-markup.php` ports `renderBibliographySave()` and everything it calls: style-family sorting, italic display segments, URL linking, JSON-LD, COinS, the Cite / Export panel (RIS and CSL-JSON data URIs, BibTeX/BibLaTeX links), and the block-supports wrapper (anchor, custom class, preset and custom font size, margin/padding). It is not called by anything yet.

**How parity is enforced.** `tests/fixtures/save-parity/cases.json` holds block attributes. PHPUnit (`SaveMarkupParityTest`) renders each case in PHP and compares it with a committed `<case>.html`. Jest (`src/save-parity.test.js`) asserts the same committed file is **byte-identical** to the JS `save()` output, with the real `@wordpress/block-editor` supports hooks loaded, and that the full block validates in the real block registry against the current `save()` alone (no deprecations). A change to either side fails CI until both agree. Eight cases pass byte-for-byte, including adversarial ones: `'0'` strings (truthy in JS, falsy in PHP), whole-number floats, `null` page ranges, empty identifier arrays, astral characters, U+2028, NBSP-delimited and unparseable URLs, balanced parentheses in URLs, CJK export filenames, camel-case font-size slugs, and a 24-name multi-script collation mix.

**What the spike surfaced:**

1. **Translated strings in saved markup (prerequisite for M2) — resolved.** `save()` baked `__()` strings into post content: "Cite / Export", "Copy citation", "Copied", the link-type labels, and the "Link to publication" fallback link label. The editor gets those from the JS translation JSON of the *current user's* locale; PHP's `__()` reads the plugin's `.mo` files for the *request's* locale. So (a) once language packs shipped, a post saved by an editor in one locale opened as invalid for an editor in another if Cite / Export was on or a citation had no title; and (b) a server write would disagree with the editor wherever JS and PHP translations differ. The seed translations already differed: all 19 compiled "Copy citation" (and six other citation-action strings) as "Add citations", a stale fuzzy msgmerge carry-over that `wp i18n make-mo` includes. **Fix:** saved markup is now locale-independent. `save()` and the PHP port write the panel labels in fixed English (`src/lib/cite-export-labels.js`), drop `data-copied-label`, and omit the `aria-label` on links whose citation has no title or container title, so the accessible name is the visible URL. `view.js` translates the canonical English labels at runtime. Core wires script translations for the `viewScript` because it now depends on `wp-i18n`. For older markup, `view.js` also translates a legacy "Link to publication — " prefix and leaves already-localized labels alone. A new deprecation re-renders old markup with the labels it *sourced from that markup*, using `source: 'text'`/`'attribute'` attributes and the entry links' `aria-label`s, instead of the current editor's translations. Legacy posts therefore validate in every locale, not only the one they were saved in. `src/locale-independence.test.js` saves under one pseudo-locale and parses under another. The bad translations are cleared and the `.mo` files rebuilt. The PHP port now calls no `__()`.
2. **`download` is a boolean attribute to `@wordpress/element`.** The serializer writes `download` bare and drops the filename; the port mirrors that, and `view.js` already restores filenames from `data-cite-export-filename`.
3. **Wrapper attribute order depends on hook order.** With a custom class, `class` precedes `style`; without one, the generated and font-size classes are merged after the style hook, so `style` comes first. The validator ignores attribute order; the byte-level harness does not, so the port matches it.
4. **ICU collation agrees across versions.** PHP's `Collator` (ICU 74) and Node's `localeCompare` (ICU 78) produce the same order for Latin, accented, Nordic, German, Cyrillic, Greek, CJK, punctuation, and digit-led names at base strength. The port requires `intl` (`Collator`, `Normalizer`); write routes must refuse (not guess) without it.
5. **Attribute decoding.** `parse_blocks()` decodes attributes to associative arrays, which turns `{}` into `[]` and `{"0": …}` into a list, and those re-serialize differently in the CSL-JSON script and export links. The write path must decode the block's attribute JSON with `bibliography_builder_decode_save_attributes()`, which keeps such objects as `stdClass`. Host validation approximates the WHATWG URL parser (bracketed hosts use PHP's IPv6 validator); both are covered by fixtures.

**Splicing decision.** Re-serializing the whole post with `serialize_blocks( parse_blocks() )` is semantically lossless but can rewrite other blocks' comment JSON byte-for-byte (escaping), producing noisy revisions. Tier 2 should instead locate the target block's byte range with the block-delimiter grammar `WP_Block_Parser` uses (document order, matching `bibliography_builder_collect_blocks()` indexing), replace only that range with `serialize_block()` of the updated block, and verify by re-parsing that exactly one block changed before calling `wp_update_post()`.

**Next (M2 proper):** add the block-range locator with tests against real `parse_blocks()` in the runtime matrix; then the Tier 2 routes behind a companion-plugin flag, dry-run by default, with `If-Match`.

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
| M1 | Validate + diff read extensions (Tier 1) — **done (unreleased)** | M0 complete |
| M2 | Prototype Tier 2 add/update/delete (companion plugin) — static-save spike **done**; locale-independent save markup is the next prerequisite | M1 + static-save spike |
| M3 | Reformat, reorder, ETag (Tier 2 complete) | M2 validated |
| M4 | Bulk routes (Tier 4) | M3 + rate-limiting design |
| M5 | Abilities registration (Tier 5) | WP Abilities API stable |

**2026-09-24 update:** the Abilities API is in core as of WordPress 6.9, so M5's blocker is gone for the read side. The read-only cut shipped ahead of the other milestones, in 1.6.0: `borges/get-bibliographies`, `borges/export-bibliography`, and `borges/validate-citations` in `includes/abilities.php`, using core's `wp_register_ability()` on `wp_abilities_api_init` with `readonly` annotations. The memo's `bibliography/read` naming was replaced by core's required `namespace/action` form under the `borges/` namespace. Writable abilities stay behind M0–M3.
