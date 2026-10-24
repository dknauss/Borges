# WP-CLI commands

Borges adds a `wp borges` command group. The read commands call the same read model as the REST routes and abilities, so `list`, `export`, and `validate` print the same data as `GET /posts/{id}/bibliographies`, `GET …/bibliographies/{ref}?format=…`, and `GET …/{ref}/validate`, and write nothing. `reformat` writes: it switches whole posts to another citation style, as `POST /bulk/reformat` does.

## Permissions

- **Without `--user`**, the commands check no capabilities, as core's own commands don't: anyone who can run WP-CLI on the server can already read the database, drafts included, with `wp db` or `wp eval`. This is the usual way to run them from cron or a maintenance script.
- **With `--user=<id|login|email>`**, they apply that user's capabilities exactly as the REST routes and abilities do. `list` and `export` need what the read route needs: a published post of a publicly viewable type, or `edit_post` on the post. `validate` needs `edit_post`, like the validate route. A refused command prints "Sorry, you are not allowed to …" and exits 1. Use this when a script should act only on what one person may see.

The rule above is for the read commands. `reformat` writes, so it always checks: it needs `--user`, the `bibliography_builder_enable_write_routes` filter, `edit_others_posts`, and `edit_post` on each post, as the bulk route does.

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

## Across a network

There is no network command. Loop over the sites:

```
$ wp site list --field=url | xargs -I % wp borges validate 42 --url=%
```

The per-citation write commands (add, update, delete) are not built yet; see `.planning/ROADMAP.md`, "WP-CLI commands".

## Tests

`tests/phpunit/CliCommandTest.php` runs the command class against a recording WP-CLI stub (`tests/phpunit/stubs/wp-cli.php`, which Psalm also reads), both with no user and with users who have and lack access. `tests/phpunit/CliReformatCommandTest.php` covers `reformat`. The runtime matrix (`scripts/runtime-matrix/smoke.sh`) runs the real commands with WP-CLI on every PHP and WordPress version it covers.
