# Current metrics

Hand-verified size, footprint, and runtime-overhead metrics for Borges Bibliography Builder.
Each source metric carries the exact command used to re-derive it. Package-size references
identify their measurement or release-artifact source. Re-run the relevant command and update the
number **in the same commit** whenever the underlying quantity changes.

Source and LOC figures last verified: **2026-10-06** against the heading-level branch. The footprint rows are hand-measured packaging references; the distributed ZIP row records the published v1.6.0 release asset.

## Lines of code

| Metric | Value | Re-derivation command |
|---|---|---|
| Main plugin file (`bibliography-builder.php`) | **815** | `wc -l bibliography-builder.php` |
| All first-party PHP (excl. vendor, tests, scripts, playground, packages, output, node_modules, generated `build/`) | **14507** | `find . -name '*.php' -not -path './vendor/*' -not -path './node_modules/*' -not -path './tests/*' -not -path './packages/*' -not -path './scripts/*' -not -path './playground/*' -not -path './output/*' -not -path './build/*' -print0 \| xargs -0 wc -l \| tail -1` |
| JS source (`src/`, excl. `*.test.js`) | **11,705** | `find ./src -name '*.js' -not -name '*.test.js' -print0 \| xargs -0 wc -l \| tail -1` |
| Shipped frontend runtime (`build/view.js`, minified) | **3,156 bytes** | `npm run build` then `wc -c < build/view.js` |

The only PHP that executes at runtime on a visitor request path is `bibliography-builder.php`
(REST registration + block registration) and the twenty-two `includes/` files it loads:
`includes/block-data.php`, `includes/csl-sanitize.php`, `includes/formatter.php`,
`includes/read-routes.php`, and `includes/styles.php` (which reads the shared
`includes/styles.json`: the style table and name particles), which only define functions (the formatter runs only for editor-time
REST calls and writes);
`includes/google-books-key.php`, which only defines functions;
`includes/resolvers.php`, which only defines constants and functions (its remote requests run
only inside editor-time REST callbacks); `includes/review.php`, which only defines constants,
functions, and editor-only review routes registered with the others on `rest_api_init`;
`includes/save-markup.php` (with `save-sort.php`, `save-display.php`, `save-json-ld-coins.php`, and
`save-cite-export.php`, split from it along the JS modules they port) and `includes/block-locator.php`,
which only define constants and functions
(called by the opt-in write routes, plus the JSON-LD helpers below); `includes/write-routes.php`, which only defines functions and
registers its routes on `rest_api_init` when a site opts in (off by default);
`includes/frontend-labels.php`, whose `render_block` filter translates the saved Cite / Export
labels with a few string replacements per bibliography block, only on non-English sites, and
does no I/O;
`includes/email-output.php`, which defines functions, a `render_email_callback` the block
registers (run only by email renderers), and a `render_block` filter that returns at once
unless the request is a feed;
`includes/frontend-json-ld.php`, whose `render_block` filter nests JSON-LD saved before 1.11.0
in an `ItemList` (one `strpos()` per bibliography block, and a JSON decode and encode only when
the old top-level array is present), and does no I/O;
`includes/json-ld-enrichment.php`, whose `render_block` filter rewrites the JSON-LD with
page-relative identifiers and fields from the stored citations (one `strpos()` per bibliography
block, then one JSON decode and encode and one `get_permalink()` of the already-loaded post), and
whose Yoast SEO and Rank Math schema filters parse the queried post's blocks once each when those
plugins build their graph (cached for the request); none of it does I/O;
`includes/output-defaults.php`, which only defines functions and adds a `block_editor_settings_all`
filter that runs only in the editor;
`includes/abilities.php`, which only defines functions and adds two Abilities API hooks, which
run only when WordPress initializes its Abilities registry and do no I/O; and
`includes/write-abilities.php`, which only defines functions and adds one Abilities API hook that
registers nothing unless the write routes are enabled. `includes/cli.php` and
`includes/class-bibliography-builder-cli-command.php` load only under WP-CLI, never on a web request. The CSL formatting engine under `vendor/` runs
**only** for editor-time REST calls. `scripts/*.php` are dev tooling and are not packaged.

## Storage footprint (installed)

Measured from a full release build (`npm run package:release`), which copies the shipped
files and installs runtime Composer dependencies with `--no-dev`, then prunes tests/docs/images
from `vendor/`.

**Prerequisite:** `build/` is gitignored (produced by `npm run build`), and
`scripts/package-release.sh` copies it, so run **`npm run build`** first on a clean checkout —
otherwise `package:release` (and the `du -sh build` row below) fails with `cannot stat build`.

| Component | Size | Re-derivation command |
|---|---|---|
| `vendor/` — citeproc-php engine + `seboettg/collection` + `myclabs/php-enum` + curated `citation-style-language/styles` & `/locales`, pruned | **792 KB** | `du -sh output/release/borges-bibliography-builder/vendor` (after `npm run package:release`) |
| `languages/` — seed PO/MO/JSON translations | **724 KB** | `du -sh languages` |
| `build/` — editor + frontend assets | **324 KB** | `du -sh build` |
| PHP + `block.json` + `readme.txt` + `LICENSE` + `THIRD-PARTY-NOTICES.txt` | **~230 KB** | `cat *.php includes/*.php block.json readme.txt LICENSE THIRD-PARTY-NOTICES.txt \| wc -c` |
| **Total installed** | **~1.9 MB** | `du -sh output/release/borges-bibliography-builder` (after `npm run package:release`) |
| Distributed ZIP (v1.7.0 release) | **~541 KB** (553,699 bytes) | GitHub release asset metadata for [v1.7.0](https://github.com/dknauss/Borges/releases/tag/v1.7.0) |

The source tree's `packages/` directory (60 KB) is **not** a separate shipped component: the
release script (`scripts/package-release.sh`) Composer-installs those path packages into
`vendor/citation-style-language/*` and then deletes the staged `packages/` (`rm -rf`). The
curated CSL styles are therefore counted inside the `vendor/` figure above.

Notes:
- `vendor/seboettg/citeproc-php` is **3.2 MB** unpruned (`composer install --no-dev` then
  `du -sh vendor/seboettg/citeproc-php`) and **520 KB** after the release script strips
  tests/docs. The pruning is what keeps the installed footprint under 2 MB.
- The bundled `citation-style-language/styles` is a **curated subset** (the nine styles the
  plugin ships), not the full upstream repository (~40 MB). This is a deliberate footprint
  control, not an accident of packaging.

## Runtime / query overhead

The block uses **static `save()` output with no `render_callback`** — formatted bibliography
HTML, JSON-LD, and COinS are serialized into `post_content` at edit time. The visitor request
path therefore adds **zero** database queries and **zero** citeproc/PHP formatting work.

| Overhead on the frontend (per published page) | Value | Re-derivation |
|---|---|---|
| Additional database queries | **0** | Static save; nothing on the block runs on the frontend — see audit below |
| REST calls | **0** | `POST /format`, `GET /pmid/{pmid}`, `GET /pmcid/{pmcid}`, `GET /arxiv`, `GET /isbn/{isbn}`, `GET /catalog`, and `GET /archive` fire only in the editor |
| `render_callback` invocations | **0** | Block registers no server render |
| Autoloaded options / registered settings | **0** | No `add_option`/`update_option`/`register_setting` |
| Cron events | **0** | No `wp_schedule_event` |
| Custom post types / custom tables | **0** | No `register_post_type` / `dbDelta` |
| Enqueued frontend assets (only when block present) | `view.js` 3,156 bytes + `style-index.css` 3,171 bytes, no script dependencies (`view.js` builds the Cite / Export panels from saved data, and their labels are translated server-side as the block renders, so no `wp-i18n` or `wp-hooks`) | `wc -c build/view.js build/style-index.css` |

Persistence/hook audit — no persistent settings, options, cron, CPTs, or custom tables
(expected output: **NONE**):

```
grep -rEl "add_option|update_option|register_setting|register_post_type|dbDelta|wp_schedule_event" \
  --include='*.php' . | grep -vE 'vendor|tests|node_modules'
```

**One caveat on `wp_options`.** On every store, the plugin's editor-time cache
(`bibliography_builder_cache_set()`) calls **both** `wp_cache_set()` and `set_transient()` —
they are two independent `if ( function_exists() )` guards, not an object-cache-else-transient
fallback. With a persistent object cache drop-in active, `set_transient()` also routes to the
object cache and **no** option row is written; without one, it materializes
**non-autoloaded, expiring** `_transient_bbb_*` rows in `wp_options`. Either way the write
happens **only during editor REST calls** (`/format`, `/pmid`) as short-lived caches of
upstream lookups — never on a visitor request, and never added to the autoload set. So there
are no long-lived settings and nothing on the autoload path, but "zero rows ever touch
`wp_options`" would be inaccurate on a site without an external object cache. (DOI imports are
deduped separately in a browser-session JS `Map` in `src/lib/parser-resolvers.js` and never reach this
PHP cache.)

The "average queries per page" figure is a flat **0 additional queries**, independent of the
number of bibliography blocks or citations on the page — all expensive resolution (Crossref
DOI, NCBI/PMC PMID) and CSL formatting happens at edit time and never touches a visitor.
