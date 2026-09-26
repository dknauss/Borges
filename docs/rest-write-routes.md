# Bibliography write routes

Phase 05, M2 and M3 (Tiers 2 and 3 of the [design memo](../.planning/phases/05-writable-bibliography-rest/05-DESIGN-MEMO.md)). Scripts, integrations, and agents can use these routes to change a saved post's bibliographies without opening the block editor. They add, change, remove, and reorder citations, change a block's settings, and switch its citation style.

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
| patch | `updated` |
| delete | `removed`: the whole entry, so a client can put it back |
| reorder | `order` |
| settings | `updated` (the setting names sent) |
| reformat | `citationStyle` (`{ from, to }`); `reformatted` (every citation ID); `headingText` (`{ from, to }`, only when the heading changed) |

### Block settings

`PATCH …/bibliographies/<ref>` takes a JSON object with any of:

| Setting | Type | Default | Sidebar control |
| --- | --- | --- | --- |
| `headingText` | string, one line | `""` | Visible Heading |
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

- **Size:** a request adds at most 50 items, and a bibliography holds at most 200 citations, the editor's limit. A reformat formats up to 200 entries, 50 at a time.
- **Reordering:** only numeric styles (IEEE, Vancouver) can be reordered. Other styles sort their entries themselves, so they return `409`.
- **Export strings:** BibTeX and BibLaTeX export strings for new or changed entries are computed only in the editor, because they need citation-js. With per-entry Cite / Export on, those entries show RIS and CSL-JSON links until someone next saves the post in the editor. The editor then adds the missing strings. The same applies to every entry that has no strings yet when `outputCiteExport` is turned on over REST.
- **HTML filtering:** WordPress filters saved HTML for users without `unfiltered_html`, in exactly the same way as it does for the editor.
- **intl:** the PHP `intl` extension is required. Without it, writes return `501`.

## Still to come

Later milestones are bulk routes across posts (Tier 4) and write abilities (Tier 5). See the design memo's sequencing table.
