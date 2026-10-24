# Bibliography write routes

Phase 05, M2 to M4 (Tiers 2 to 4 of the [design memo](../.planning/phases/05-writable-bibliography-rest/05-DESIGN-MEMO.md)). Scripts, integrations, and agents can use these routes to change a saved post's bibliographies without opening the block editor. They add, change, remove, and reorder citations, change a block's settings, and switch its citation style.

## Enabling

The routes are **off by default**. Most sites never need to write bibliographies over REST, so a site has to opt in. Use a small companion plugin, or an mu-plugin such as `wp-content/mu-plugins/borges-write-api.php`:

```php
<?php
/**
 * Plugin Name: Borges write API
 */
add_filter( 'bibliography_builder_enable_write_routes', '__return_true' );
```

While the filter returns false, the routes are not registered and the read routes send no `ETag`.

## Trying it

To try the routes without a real site, use the development Playground: `https://playground.wordpress.net/?blueprint-url=https://raw.githubusercontent.com/dknauss/Borges/main/playground/blueprint-write-api.json`.

It runs the main build with the routes enabled. Open the demo post in the editor and use the browser console:

```js
await borgesWrite.list()
await borgesWrite.add( 'demo-try-it', [ { type: 'book', title: 'Ficciones', author: [ { family: 'Borges', given: 'Jorge Luis' } ], issued: { 'date-parts': [ [ 1944 ] ] } } ] )
await borgesWrite.add( 'demo-try-it', [ … ], { commit: true } )
await borgesWrite.update( 'demo-apa-7', 'demo-apa-7-1', { title: 'New title' }, { commit: true } )
await borgesWrite.remove( 'demo-chicago-notes', 'demo-chicago-notes-4', { commit: true } )
await borgesWrite.reorder( 'demo-ieee', [ 'demo-ieee-3', 'demo-ieee-1', 'demo-ieee-2' ], { commit: true } )
await borgesWrite.settings( 'demo-apa-7', { headingText: 'Sources', outputCoins: true }, { commit: true } )
await borgesWrite.reformat( 'demo-apa-7', 'mla-9', { commit: true } )
```

Every call makes a dry run first. With `{ commit: true }`, it then writes, sending the dry run's ETag as `If-Match`, and reloads the editor, which would otherwise hold the old post and overwrite the write on save. The helper lives in `playground/dev/`.

The runtime matrix also exercises the routes over real HTTP on every PHP and WordPress version it covers (`scripts/runtime-matrix/smoke.sh`).

## Routes

All routes live under `/wp-json/bibliography/v1/posts/<post_id>/bibliographies/<ref>`. `<ref>` is the block's zero-based index, or its stable `bibliographyId`, as in the read routes.

| Method | Path | Body | Change |
| --- | --- | --- | --- |
| `POST` | `…/citations` | `{ "items": [ …CSL-JSON… ] }` (1–50) | Add citations |
| `PATCH` | `…/citations/<citation_id>` | Partial CSL-JSON object | Change fields on one citation |
| `DELETE` | `…/citations/<citation_id>` | none | Remove one citation |
| `PUT` | `…/citations/order` | `{ "ids": [ … ] }` | Reorder a numeric-style bibliography |
| `PATCH` | `…` (the bibliography itself) | Any of the block settings below | Change block settings |
| `POST` | `…/reformat` | `{ "style": "<key>" }` | Switch the citation style and reformat every entry |

Every route requires `edit_post` on the post.

### Dry run by default

Every request is a **dry run** unless you pass `dry_run=false`. A dry run:

- builds the change exactly as a write would, including formatting, rebuilding the markup, and splicing it into the post;
- returns the result;
- saves nothing.

Preview with a dry run first, then send the same request again with `dry_run=false`.

### If-Match

A real write needs an `If-Match` header carrying the post's current ETag. Dry runs return it, and so do the read routes while the write routes are enabled.

- **No header:** `428 Precondition Required`.
- **ETag no longer current:** `412 Precondition Failed`, because someone changed the post since your read. The error carries the current ETag. Read the post again, then retry.
- **Success:** the response carries the new ETag, so writes can be chained.

The ETag is a hash of the post's content. Any change invalidates it, including a change to a different block.

### Responses

A successful response has this shape:

```json
{
  "postId": 42,
  "dryRun": false,
  "changes": { "added": ["…id…"], "skipped": [] },
  "bibliography": { "index": 0, "bibliographyId": "…", "citations": [ … ], "entryCount": 3, "…": "…" },
  "etag": "\"…\""
}
```

The `changes` object depends on the route:

| Route | `changes` |
| --- | --- |
| add | `added` (new citation IDs); `skipped` (`{ item, duplicateOf }` for items that duplicate an existing citation or an earlier item, by the editor's duplicate rules) |
| patch | `updated`. An edit that would make the citation a duplicate of another in the same bibliography is refused with `409` (`bibliography_builder_duplicate_citation`), with `duplicateOf` and `reason` in `data` |
| delete | `removed`: the whole entry, so a client can put it back |
| reorder | `order` |
| settings | `updated` (the setting names sent) |
| reformat | `citationStyle` (`{ from, to }`); `reformatted` (every citation ID); `headingText` (`{ from, to }`, only when the heading changed) |

### Block settings

`PATCH …/bibliographies/<ref>` takes a JSON object with any of:

| Setting | Type | Default | Sidebar control |
| --- | --- | --- | --- |
| `headingText` | string, one line | `""` | Visible Heading |
| `headingLevel` | integer: `0` (a paragraph) or `2` to `6` | `0` | Heading Level |
| `outputJsonLd` | boolean | `true` | Output JSON-LD |
| `outputCoins` | boolean | `false` | Output COinS |
| `outputCslJson` | boolean | `false` | Output CSL-JSON |
| `outputCiteExport` | boolean | `false` | Per-entry Cite / Export |

Citations are not touched. An unknown setting or a wrong type gets `400`. A setting sent with its default value is left out of the block comment, as the editor leaves it out. `citationStyle` is refused with `400` (`bibliography_builder_style_needs_reformat`), because changing the style means reformatting every entry. Use `…/reformat` for that.

### Reformatting

`POST …/bibliographies/<ref>/reformat` with `{ "style": "apa-7" }` does what choosing a style in the block sidebar does:

- formats every entry in the new style;
- keeps manual display text and the BibTeX and BibLaTeX export strings, which a style change does not invalidate;
- stores the entries in the new style's display order (numeric styles keep the current order);
- if the heading is still the old style's default ("Bibliography" for Chicago, for example), changes it to the new style's default ("References" for APA). Any other heading is kept.

`style` must be one of the supported keys: `chicago-notes-bibliography`, `chicago-author-date`, `apa-7`, `mla-9`, `harvard`, `ieee`, `vancouver`, `oscola`, or `abnt`. Sending the current style reformats in place, so the request is idempotent.

The stored CSL-JSON is not changed. If any entry has CSL-JSON the formatter cannot use (or none, as with some very old pasted entries), nothing is written: the response is `409` (`bibliography_builder_unformattable_entries`) and lists each such entry's `index`, `id`, and reason in `data.entries`. Fix those entries with `PATCH …/citations/<citation_id>` or remove them, then reformat.

## What a write does

1. Reads `post_content` and locates the bibliography block by its byte range (`includes/block-locator.php`), using the same block grammar as `WP_Block_Parser`. Malformed block delimiters are refused with `409`.
2. Applies the change to the block's attributes, like this:
   - new and changed CSL-JSON is sanitized with the same rules as `/format`;
   - it is formatted in the block's style;
   - new citations get UUIDs;
   - the list is stored in display order, the way the editor stores it.

   A patch works like the editor's field editor. It clears the entry's manual display text and its stale BibTeX and BibLaTeX export strings. `id` and `type` cannot be patched, and a field set to `null` is removed.
3. Rebuilds the block's saved markup with the PHP port of `save()` (`includes/save-markup.php`). The port matches the editor's output byte for byte, so the block opens as valid.
4. Replaces only that block's bytes. It then locates the blocks again to prove that every other byte of the post is unchanged.
5. Saves with `wp_update_post()`, so the change is an ordinary revision and can be restored like any other.

## Limits and caveats

- **Size:** a request adds at most 50 items, and a bibliography holds at most 200 citations, the editor's limit. A reformat formats up to 200 entries in one formatter call.
- **No duplicates within a bibliography:** every write keeps a bibliography free of two copies of one work, by the editor's duplicate rules (`bibliography_builder_find_duplicate_citation()`): add skips them, and patch refuses an edit that would make one. The same work in two bibliographies of one post is fine.
- **Reordering:** only numeric styles (IEEE, Vancouver) can be reordered. Other styles sort their entries themselves, so they return `409`.
- **Export strings:** BibTeX and BibLaTeX export strings for new or changed entries are computed only in the editor, because they need citation-js. With per-entry Cite / Export on, those entries show RIS and CSL-JSON links until someone next saves the post in the editor. The editor then adds the missing strings. The same applies to every entry that has no strings yet when `outputCiteExport` is turned on over REST.
- **HTML filtering:** WordPress filters saved HTML for users without `unfiltered_html`, in exactly the same way as it does for the editor.
- **intl:** the PHP `intl` extension is required. Without it, writes return `501`.

## Bulk reformat

`POST /wp-json/bibliography/v1/bulk/reformat` switches every bibliography in a batch of posts to one citation style (Phase 05 M4, Tier 4). The write-routes filter turns it on with the others. It needs `edit_others_posts`, and `edit_post` on each post.

```
POST /wp-json/bibliography/v1/bulk/reformat?dry_run=false
{ "style": "mla-9", "posts": [ { "id": 12, "etag": "\"…\"" }, { "id": 13, "etag": "\"…\"" } ] }
```

Each post is reformatted exactly as `…/reformat` would reformat each of its bibliographies, then saved once, so it gains one revision. A dry run (the default) returns each post's ETag; send those back to save.

### Batches, not jobs

A request names at most 25 posts and does as many as it can, then returns the rest as `remaining`. Send `remaining` as the next request's `posts`. There are no job IDs to poll: a job queue would need stored job records and a cron runner, and Borges stores neither.

A request stops starting new posts when it reaches:

- the end of the list;
- the caller's remaining budget (see below);
- its time budget, 15 seconds by default (always at least one post, and never more than half of PHP's `max_execution_time`).

Each post commits on its own, with its own ETag check, so a failure on one post never undoes another. Retrying a whole batch is safe: posts already in the style come back `unchanged` and are not saved again, whatever ETag was sent.

### Response

The response is `200` whatever happened to each post:

```json
{
  "dryRun": false,
  "style": "mla-9",
  "results": [
    { "postId": 12, "status": "changed", "etag": "\"…\"", "bibliographies": [ { "index": 0, "bibliographyId": "…", "changes": { "citationStyle": { "from": "apa-7", "to": "mla-9" }, "reformatted": [ "…" ] } } ] },
    { "postId": 13, "status": "failed", "etag": "\"…\"", "bibliographies": [ … ], "error": { "code": "bibliography_builder_precondition_failed", "message": "…", "status": 412 } }
  ],
  "remaining": [ { "id": 14, "etag": "\"…\"" } ],
  "rateLimit": { "limit": 250, "remaining": 223, "reset": 611 }
}
```

| `status` | Meaning |
| --- | --- |
| `preview` | Dry run: the post would change. |
| `changed` | Saved. `etag` is the new one. |
| `unchanged` | Already in that style; nothing to save. |
| `skipped` | Not found, not editable by you, or no bibliography. Has `error`. |
| `failed` | An entry could not be formatted (`409`, with `index` and `entries`), the ETag was missing (`428`) or stale (`412`, with the current `etag`), or the save failed. Has `error`. Nothing was saved for that post. |

A malformed request (an unknown style, no posts or more than 25, a post ID that is not a positive integer, or a post listed twice) gets `400` before any work is done.

### Rate limit

Bulk requests spend a budget **counted in posts, not requests**: by default 250 posts per 15 minutes per user. A request for 25 posts costs 25, and dry runs cost the same as writes, because a dry run does all the formatting a write does. Every response carries the IETF draft headers:

- `RateLimit-Limit`: the budget.
- `RateLimit-Remaining`: posts left in this window.
- `RateLimit-Reset`: seconds until the window resets.

A request that asks for more posts than are left is **clipped**: the server does what fits and returns the rest in `remaining`. Only a caller with nothing left gets `429` (`bibliography_builder_rate_limited`), with `Retry-After` set to the reset time, which is also in `data.reset` for clients that don't read headers. Posts a request did not reach are given back to the budget.

Only **one saving bulk request runs at a time** on a site. A second gets `429` (`bibliography_builder_bulk_busy`) with `Retry-After: 5`, and its budget is given back. Dry runs don't wait for this lock. A lock left by a request that died frees itself after the time budget plus 30 seconds.

The counters and the lock live in the object cache when the site has a persistent one (Redis, Memcached), where `wp_cache_add()` and `wp_cache_incr()` make them atomic. Otherwise they are transients: one row per active user, expiring with the window. Without a persistent cache, two dry runs sent in parallel by one user can overshoot the budget by up to a batch; saves are serialized by the lock. Windows are aligned to their length (every 15 minutes on the quarter hour), so a burst that straddles a reset can spend up to two budgets in a short time. Nothing here adds an option, a cron event, or a table, and uninstall removes the counters with the plugin's other cached data.

### Filters for hosts

| Filter | Default | Arguments | Use |
| --- | --- | --- | --- |
| `bibliography_builder_bulk_rate_limit` | `array( 'posts' => 250, 'window' => 900 )` | user ID | Raise or lower the budget, or return `false` to turn it off for a user (the lock still applies). |
| `bibliography_builder_bulk_rate_limit_key` | `user:<id>` | user ID, request | Whose budget a request spends. Return `site` for one budget shared by everyone. |
| `bibliography_builder_bulk_max_posts_per_request` | `25` | none | Batch cap, clamped to 1–100. |
| `bibliography_builder_bulk_time_budget` | `15` (seconds) | none | When a request stops starting new posts, clamped to 0–300. |

```php
// A trusted integration user gets no budget; everyone else gets 100 posts an hour.
add_filter(
	'bibliography_builder_bulk_rate_limit',
	static function ( $limit, $user_id ) {
		if ( 12 === $user_id ) {
			return false;
		}

		return array( 'posts' => 100, 'window' => HOUR_IN_SECONDS );
	},
	10,
	2
);
```

The code is in `includes/bulk-routes.php` and `includes/rate-limit.php`.

The runtime matrix (`scripts/runtime-matrix/smoke.sh`) runs the route over real HTTP on every stack it covers, under a three-post budget its test-only mu-plugin (`scripts/runtime-matrix/bulk-rate-limit.php`) sets: a two-post dry run, a commit clipped to the one post left with the other in `remaining`, a `429` with `Retry-After`, and `wp borges reformat` saving the post the route could not, since WP-CLI spends no budget.

## Bulk deduplicate

`POST /wp-json/bibliography/v1/bulk/deduplicate` removes repeated citations from every bibliography in a batch of posts. It is the second Tier 4 route, on the same scaffolding as bulk reformat: the write-routes filter, `edit_others_posts` plus `edit_post` on each post, a dry run unless `dry_run=false`, a per-post ETag, batches of up to 25 posts with `remaining`, and the time budget. It spends **the same budget** as bulk reformat (a post costs 1 on either route) and waits for the same site-wide lock.

```
POST /wp-json/bibliography/v1/bulk/deduplicate?dry_run=false
{ "posts": [ { "id": 12, "etag": "\"…\"" }, { "id": 13, "etag": "\"…\"" } ] }
```

### What counts as a duplicate, and which copy stays

Two citations are duplicates by the editor's own rules (`citationsMatch()` in `src/lib/deduplicate.js`, the same check the `…/duplicates` review route and the add route use): the same DOI (ignoring case and a `doi.org` prefix), or the same title (ignoring case and punctuation) with the same year, the same first author, or neither.

Each bibliography is read in its stored order, and **the first copy of a work stays**, with its formatted text, any manual display text, and its export strings. Later copies are removed, as if the editor had refused to add them. Nothing is merged into the copy that stays: if a later copy has a DOI the first lacks, the dry run shows it, and you can add it with `PATCH …/citations/<id>` before saving.

Removing a copy refreshes the year suffixes of its same-author, same-year group, as `DELETE …/citations/<id>` does, so "2020a" goes back to "2020" when its twin is removed.

### Only within each bibliography

A work listed in two bibliographies of one post is **not** removed: a post with one bibliography per chapter or section means to list it in each. It is reported instead, in the post's `crossBlockDuplicates`, for a person to decide. The route never moves or removes citations between posts; "across posts" means it covers many posts in one request.

### Response

The same envelope as bulk reformat, without `style`. Each post's `bibliographies` list only the blocks that change, and each removed copy says what it duplicated:

```json
{
  "dryRun": true,
  "results": [
    {
      "postId": 12,
      "status": "preview",
      "etag": "\"…\"",
      "bibliographies": [
        {
          "index": 0,
          "bibliographyId": "…",
          "changes": {
            "removed": [
              { "index": 2, "id": "knuth-doi", "duplicateOf": "knuth", "reason": "doi", "citation": { "id": "knuth-doi", "csl": { … }, "formattedText": "…" } }
            ]
          }
        }
      ],
      "crossBlockDuplicates": [
        { "reason": "title-year", "first": { "index": 0, "bibliographyId": "chapter-1", "citationId": "hoare" }, "second": { "index": 1, "bibliographyId": "chapter-2", "citationId": "hoare-2" } }
      ]
    },
    { "postId": 13, "status": "unchanged", "etag": "\"…\"", "bibliographies": [], "crossBlockDuplicates": [] }
  ],
  "remaining": [],
  "rateLimit": { "limit": 250, "remaining": 248, "reset": 611 }
}
```

`reason` is `doi`, `title-year`, `title-author`, or `title`, as in the review route. `index` in a removed entry is its position before the change. A post with nothing to remove is `unchanged` and is not saved, so retrying a batch is safe. `crossBlockDuplicates` is left out of `skipped` and `failed` posts. The other statuses mean what they mean for bulk reformat. Each saved post gains one revision, which still holds the removed citations.

## Abilities

On WordPress 6.9 and later, the same writes are also available as abilities through the Abilities API (`includes/write-abilities.php`). They are registered only when the write routes are enabled, in the `bibliography` category next to the read-only abilities:

| Ability | Route it wraps | Input beyond the common fields |
|---|---|---|
| `borges/add-citations` | `POST …/citations` | `items` |
| `borges/update-citation` | `PATCH …/citations/<citation_id>` | `citation_id`, `fields` |
| `borges/delete-citation` | `DELETE …/citations/<citation_id>` | `citation_id` |
| `borges/reorder-citations` | `PUT …/citations/order` | `ids` |
| `borges/update-bibliography-settings` | `PATCH …/bibliographies/<ref>` | `settings` |
| `borges/reformat-bibliography` | `POST …/reformat` | `style` |

`borges/bulk-reformat` wraps `POST /bulk/reformat`. Its input is `style`, `posts` (each `{ id, etag }`), and `dry_run`, and its permission is `edit_others_posts`. It calls the route's callback, so it spends the same budget and waits for the same lock; a refused call returns the route's `429` as an error, with `reset` in its data. `borges/bulk-deduplicate` wraps `POST /bulk/deduplicate` the same way, with `posts` and `dry_run` as its input, and is annotated as destructive.

Every ability takes `post_id` and either `index` or `bibliography_id` to name the block, plus `dry_run` (default `true`) and `etag`. Each one builds the request its route would get and calls the route's own callback, so the rules are the same: `edit_post` on the post, a preview unless `dry_run` is `false`, and to save, `etag` set to the ETag from a read or dry run. Without `etag` a save is refused with status `428`, and with a stale one `412`. The output is the route's response body, `etag` included. Only `borges/delete-citation` is annotated as destructive.

## Still to come

A site-wide duplicates report (the same work cited in many posts, for harmonizing its metadata) would need to read every post, so it belongs in WP-CLI rather than a REST batch. See the design memo's sequencing table.
