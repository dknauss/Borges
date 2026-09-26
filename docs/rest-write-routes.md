# Citation write routes

Phase 05, M2 (Tier 2 of the [design memo](../.planning/phases/05-writable-bibliography-rest/05-DESIGN-MEMO.md)). Scripts, integrations, and agents can use these routes to add, change, remove, and reorder citations in a saved post, without opening the block editor.

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
| patch | `updated` |
| delete | `removed`: the whole entry, so a client can put it back |
| reorder | `order` |

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

- **Size:** a request adds at most 50 items, and a bibliography holds at most 200 citations, the editor's limit.
- **Reordering:** only numeric styles (IEEE, Vancouver) can be reordered. Other styles sort their entries themselves, so they return `409`.
- **Export strings:** BibTeX and BibLaTeX export strings for new or changed entries are computed only in the editor, because they need citation-js. With per-entry Cite / Export on, those entries show RIS and CSL-JSON links until someone next saves the post in the editor. The editor then adds the missing strings.
- **HTML filtering:** WordPress filters saved HTML for users without `unfiltered_html`, in exactly the same way as it does for the editor.
- **intl:** the PHP `intl` extension is required. Without it, writes return `501`.

## Still to come

Later milestones are Tier 3 (block settings and reformatting), bulk routes, and write abilities. See the design memo's sequencing table.
