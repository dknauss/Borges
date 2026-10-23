# WP-CLI commands

Borges adds a read-only `wp borges` command group. It calls the same read model as the REST routes and abilities, so `list`, `export`, and `validate` print the same data as `GET /posts/{id}/bibliographies`, `GET …/bibliographies/{ref}?format=…`, and `GET …/{ref}/validate`. Nothing is written.

## Permissions

- **Without `--user`**, the commands check no capabilities, as core's own commands don't: anyone who can run WP-CLI on the server can already read the database, drafts included, with `wp db` or `wp eval`. This is the usual way to run them from cron or a maintenance script.
- **With `--user=<id|login|email>`**, they apply that user's capabilities exactly as the REST routes and abilities do. `list` and `export` need what the read route needs: a published post of a publicly viewable type, or `edit_post` on the post. `validate` needs `edit_post`, like the validate route. A refused command prints "Sorry, you are not allowed to …" and exits 1. Use this when a script should act only on what one person may see.

All three commands are read-only. When write commands come, they will check `edit_post` and the write-routes filter whether or not `--user` is given.

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

## Across a network

There is no network command. Loop over the sites:

```
$ wp site list --field=url | xargs -I % wp borges validate 42 --url=%
```

Checking every post on a site, and the write commands, wait for the bulk-route design (Phase 05 M4); see `.planning/ROADMAP.md`, "WP-CLI commands".

## Tests

`tests/phpunit/CliCommandTest.php` runs the command class against a recording WP-CLI stub (`tests/phpunit/stubs/wp-cli.php`, which Psalm also reads), both with no user and with users who have and lack access. The runtime matrix (`scripts/runtime-matrix/smoke.sh`) runs the real commands with WP-CLI on every PHP and WordPress version it covers.
