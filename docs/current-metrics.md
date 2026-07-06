# Current metrics

Hand-verified size, footprint, and runtime-overhead metrics for Borges Bibliography Builder.
Each number carries the exact command used to re-derive it, so the figures can be re-checked
on demand rather than trusted on faith. Re-run the relevant command and update the number **in
the same commit** whenever the underlying quantity changes.

Last verified: **2026-07-05** against `main` (commit `49f623b`).

## Lines of code

| Metric | Value | Re-derivation command |
|---|---|---|
| Main plugin file (`bibliography-builder.php`) | **1,881** | `wc -l bibliography-builder.php` |
| All first-party PHP (excl. vendor, tests, scripts, packages, output, node_modules, generated `build/`) | **1,979** | `find . -name '*.php' -not -path './vendor/*' -not -path './node_modules/*' -not -path './tests/*' -not -path './packages/*' -not -path './scripts/*' -not -path './output/*' -not -path './build/*' -print0 \| xargs -0 wc -l \| tail -1` |
| JS source (`src/`, excl. `*.test.js`) | **8,851** | `find ./src -name '*.js' -not -name '*.test.js' -print0 \| xargs -0 wc -l \| tail -1` |
| Shipped frontend runtime (`build/view.js`, minified) | **1,449 bytes** | `npm run build` then `wc -c < build/view.js` |

The only PHP that executes at runtime on a visitor request path is `bibliography-builder.php`
(REST registration + block registration); the CSL formatting engine under `vendor/` runs
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
| `vendor/` — citeproc-php engine + `seboettg/collection` + `myclabs/php-enum` + curated `citation-style-language/styles` & `/locales`, pruned | **~1.0 MB** | `du -sh output/release/borges-bibliography-builder/vendor` (after `npm run package:release`) |
| `languages/` — seed PO/MO/JSON translations | **724 KB** | `du -sh languages` |
| `build/` — editor + frontend assets | **328 KB** | `du -sh build` |
| PHP + `block.json` + `readme.txt` + `LICENSE` + `THIRD-PARTY-NOTICES.txt` | **~100 KB** | — |
| **Total installed** | **~2.1 MB** | `du -sh output/release/borges-bibliography-builder` (after `npm run package:release`) |
| Distributed ZIP (compressed) | **~0.9–1 MB** | `du -h output/release/borges-bibliography-builder.zip` |

The source tree's `packages/` directory (60 KB) is **not** a separate shipped component: the
release script (`scripts/package-release.sh`) Composer-installs those path packages into
`vendor/citation-style-language/*` and then deletes the staged `packages/` (`rm -rf`). The
curated CSL styles are therefore counted inside the `vendor/` figure above.

Notes:
- `vendor/seboettg/citeproc-php` is **3.2 MB** unpruned and **~536 KB** after the release
  script strips tests/docs. The pruning is what keeps the installed footprint near 2 MB.
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
| REST calls | **0** | `POST /format` and `GET /pmid/{pmid}` fire only in the editor |
| `render_callback` invocations | **0** | Block registers no server render |
| Autoloaded options / registered settings | **0** | No `add_option`/`update_option`/`register_setting` |
| Cron events | **0** | No `wp_schedule_event` |
| Custom post types / custom tables | **0** | No `register_post_type` / `dbDelta` |
| Enqueued frontend assets (only when block present) | `view.js` ~1.4 KB + `style-index.css` ~2.9 KB | `wc -c build/view.js build/style-index.css` |

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
deduped separately in a browser-session JS `Map` in `src/lib/parser.js` and never reach this
PHP cache.)

The "average queries per page" figure is a flat **0 additional queries**, independent of the
number of bibliography blocks or citations on the page — all expensive resolution (Crossref
DOI, NCBI/PMC PMID) and CSL formatting happens at edit time and never touches a visitor.
