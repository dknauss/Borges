# WP-CLI commands

Borges adds a `wp borges` command group. The read commands call the same read model as the REST routes and abilities, so `list`, `export`, and `validate` print the same data as `GET /posts/{id}/bibliographies`, `GET …/bibliographies/{ref}?format=…`, and `GET …/{ref}/validate`, `duplicates` reports what `deduplicate` would remove across the whole site, and none of them writes anything. `reformat` and `deduplicate` write: they switch whole posts to another citation style, or remove repeated citations from them, as `POST /bulk/reformat` and `POST /bulk/deduplicate` do.

## Permissions

- **Without `--user`**, the commands check no capabilities, as core's own commands don't: anyone who can run WP-CLI on the server can already read the database, drafts included, with `wp db` or `wp eval`. This is the usual way to run them from cron or a maintenance script.
- **With `--user=<id|login|email>`**, they apply that user's capabilities exactly as the REST routes and abilities do. `list` and `export` need what the read route needs: a published post of a publicly viewable type, or `edit_post` on the post. `validate` needs `edit_post`, like the validate route, and `duplicates` skips and counts the posts the user lacks `edit_post` on. A refused command prints "Sorry, you are not allowed to …" and exits 1. Use this when a script should act only on what one person may see.

The rule above is for the read commands. `reformat` and `deduplicate` write, so they always check: they need `--user`, the `bibliography_builder_enable_write_routes` filter, `edit_others_posts`, and `edit_post` on each post, as the bulk routes do.

On Multisite, pick a site with `--url=`.

The code is in `includes/cli.php` (helpers that return data) and `includes/class-bibliography-builder-cli-command.php` (the command class, which only prints). The main plugin file loads them only when WP-CLI is running.

## `wp borges list <post-id>`

One row per bibliography block in the post: `index`, `bibliographyId`, `citationStyle`, `entryCount`, and `headingText`. `--fields=` can add `headingLevel`, `outputJsonLd`, `outputCoins`, and `outputCslJson`. `--format=` is `table` (default), `json`, `csv`, `yaml`, or `count`.

```
$ wp borges list 42
$ wp borges list 42 --format=json
```

## `wp borges export <post-id>`

One bibliography, the first by default. `--index=<n>` picks a block by its zero-based position, and `--bibliography-id=<id>` by its stable ID (it wins when both are given). `--format=` is:

- `csl-json` (default): a CSL-JSON array, for Zotero, Mendeley, or any CSL processor
- `text`: one citation per line, as the bibliography shows them
- `json`: the whole record the REST API returns, with block settings and stored citations

```
$ wp borges export 42 > references.json
$ wp borges export 42 --bibliography-id=reading-list --format=text
```

## `wp borges validate <post-id>`

Errors and warnings for each entry, by the same rules as the review route. With no `--index` or `--bibliography-id` it checks every bibliography in the post. The `table` (default), `csv`, and `yaml` formats print one row per issue (`bibliography`, `entry`, `id`, `severity`, `code`, `field`, `message`) and a summary line; `json` prints the full reports.

It exits with status 1 when any entry has an error, so a script can stop on it. Warnings alone exit 0.

```
$ wp borges validate 42
$ wp borges validate 42 --index=1 --format=json
```

## `wp borges duplicates [<post-id>...]`

A read-only report of repeated citations. With no post IDs it checks every post with a bibliography, of any type and status but auto-drafts and the trash (one query on the posts table); with IDs, only those. It never changes a post.

One row per pair: `postId`, `scope`, `first`, `second`, and `reason`. Each side is `<block index>:<citation ID>`.

- **`scope: bibliography`** is a later copy of a work in the same block. `wp borges deduplicate` would remove `second` and keep `first`, filling any fields `first` lacks; the report runs the same split, so the two always agree.
- **`scope: post`** is a work listed in two bibliographies of one post. It is left alone: a post with one bibliography per chapter means to repeat it.

`reason` is `doi`, `title-year`, `title-author`, or `title`, by the editor's duplicate rules. A work cited in two different posts is not a duplicate and is not reported. `--format=` is `table` (default, with a summary line of the counts and the posts checked and skipped), `json`, `csv`, `yaml`, or `count`; the machine formats print rows only. It exits 0 whatever it finds.

```
$ wp borges duplicates
$ wp borges duplicates 42 43 --format=csv > duplicates.csv
$ wp borges duplicates --user=editor
```

## `wp borges reformat <post-id>... --style=<key>`

Switches every bibliography in the given posts to one citation style, through the same per-post code as `POST /bulk/reformat` (see `docs/rest-write-routes.md`, "Bulk reformat"). Each post is saved once, as one revision.

- **Previews unless `--commit` is passed.** The summary says how many posts would change.
- **`--batch-size=<n>`** (default 25): posts per batch. The object cache's in-memory data is freed between batches, so memory stays flat on large runs.
- **`--sleep=<seconds>`** (default 0): a pause between batches, to go easy on a busy server.
- **`--format=`** is `table` (default), `csv`, or `yaml` for one row per post (`postId`, `status`, `bibliographies`, `message`) and a summary line, or `json` for the full results.

A commit reads each post's ETag just before reformatting it, so a post someone edits during the run is saved from their latest content. Posts already in the style are `unchanged`; posts that are missing, not editable by the user, or have no bibliography are `skipped`; a post that cannot be reformatted or saved is `failed`, and the run goes on. The command exits with status 1 when any post failed.

It spends no rate-limit budget and takes no lock. Someone with a shell is the site's operator, and the budget exists to stop runaway HTTP loops; `--batch-size` and `--sleep` are the CLI's own brakes.

To find the posts, search their content for the block name:

```
$ wp borges reformat 42 43 --style=mla-9 --user=editor
$ wp borges reformat $(wp post list --post_type=post,page --s=wp:bibliography-builder --format=ids) \
    --style=apa-7 --user=editor --commit --sleep=1
```

## `wp borges deduplicate <post-id>...`

Removes repeated citations from every bibliography in the given posts, through the same per-post code as `POST /bulk/deduplicate` (see `docs/rest-write-routes.md`, "Bulk deduplicate"). Each bibliography keeps the first copy of a work, by the editor's duplicate rules, fills any fields it lacks from the later copies, and drops them. A work repeated across two bibliographies in one post is counted in the `crossBlock` column and left in place.

It takes the same `--commit`, `--batch-size`, `--sleep`, and `--format` options as `reformat`, with the same checks, statuses, exit code, and exemption from the rate-limit budget. The table has one row per post: `postId`, `status`, `removed` (citations removed, or that would be), `merged` (fields copied into the kept copies), `crossBlock` (pairs across bibliographies), and `message`. `--format=json` prints the full results, including every removed citation, which is a handy record to keep before a `--commit`.

```
$ wp borges deduplicate 42 43 --user=editor
$ wp borges deduplicate $(wp post list --post_type=post,page --s=wp:bibliography-builder --format=ids) \
    --user=editor --format=json > duplicates.json
$ wp borges deduplicate 42 43 --user=editor --commit
```

## Across a network

There is no network command. Loop over the sites:

```
$ wp site list --field=url | xargs -I % wp borges validate 42 --url=%
```

The per-citation write commands (add, update, delete) are not built yet; see `.planning/ROADMAP.md`, "WP-CLI commands".

## Tests

`tests/phpunit/CliCommandTest.php` runs the command class against a recording WP-CLI stub (`tests/phpunit/stubs/wp-cli.php`, which Psalm also reads), both with no user and with users who have and lack access. `tests/phpunit/CliReformatCommandTest.php` covers `reformat`, and `tests/phpunit/BulkDeduplicateTest.php` covers `deduplicate` and `duplicates` with the route. The runtime matrix (`scripts/runtime-matrix/smoke.sh`) runs the real commands with WP-CLI on every PHP and WordPress version it covers.
