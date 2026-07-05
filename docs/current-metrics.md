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
| All first-party PHP (excl. vendor, tests, scripts, packages, output, node_modules) | **1,982** | `find . -name '*.php' -not -path './vendor/*' -not -path './node_modules/*' -not -path './tests/*' -not -path './packages/*' -not -path './scripts/*' -not -path './output/*' -print0 \| xargs -0 wc -l \| tail -1` |
| JS source (`src/`, excl. `*.test.js`) | **8,851** | `find ./src -name '*.js' -not -name '*.test.js' -print0 \| xargs -0 wc -l \| tail -1` |
| Shipped frontend runtime (`build/view.js`, minified) | **1,449 bytes** | `wc -c < build/view.js` |

The only PHP that executes at runtime on a visitor request path is `bibliography-builder.php`
(REST registration + block registration); the CSL formatting engine under `vendor/` runs
**only** for editor-time REST calls. `scripts/*.php` are dev tooling and are not packaged.

## Storage footprint (installed)

Measured from a full release build (`npm run package:release`), which copies the shipped
files and installs runtime Composer dependencies with `--no-dev`, then prunes tests/docs/images
from `vendor/`.

| Component | Size | Re-derivation command |
|---|---|---|
| `vendor/` — citeproc-php engine + `seboettg/collection` + `myclabs/php-enum`, pruned | **~1.0 MB** | `du -sh output/release/borges-bibliography-builder/vendor` (after `npm run package:release`) |
| `languages/` — seed PO/MO/JSON translations | **724 KB** | `du -sh languages` |
| `build/` — editor + frontend assets | **328 KB** | `du -sh build` |
| `packages/` — curated CSL styles + locales | **60 KB** | `du -sh packages` |
| PHP + `block.json` + `readme.txt` + `LICENSE` + `THIRD-PARTY-NOTICES.txt` | **~100 KB** | — |
| **Total installed** | **~2.2 MB** | `du -sh output/release/borges-bibliography-builder` (after `npm run package:release`) |
| Distributed ZIP (compressed) | **~0.9–1 MB** | `du -h output/release/borges-bibliography-builder.zip` |

Notes:
- `vendor/seboettg/citeproc-php` is **3.2 MB** unpruned and **~536 KB** after the release
  script strips tests/docs. The pruning is what keeps the installed footprint near 2 MB.
- `packages/` bundles a **curated subset** of CSL styles (the nine the plugin ships), not the
  full upstream `citation-style-language/styles` repository (~40 MB). This is a deliberate
  footprint control, not an accident of packaging.

## Runtime / query overhead

The block uses **static `save()` output with no `render_callback`** — formatted bibliography
HTML, JSON-LD, and COinS are serialized into `post_content` at edit time. The visitor request
path therefore adds **zero** database queries and **zero** citeproc/PHP formatting work.

| Overhead on the frontend (per published page) | Value | Re-derivation |
|---|---|---|
| Additional database queries | **0** | Static save; no persistent storage — see audit below |
| REST calls | **0** | `POST /format` and `GET /pmid/{pmid}` fire only in the editor |
| `render_callback` invocations | **0** | Block registers no server render |
| Autoloaded options / rows in `wp_options` | **0** | No `add_option`/`update_option`/`register_setting` |
| Cron events | **0** | No `wp_schedule_event` |
| Custom post types / custom tables | **0** | No `register_post_type` / `dbDelta` |
| Enqueued frontend assets (only when block present) | `view.js` ~1.4 KB + `style-index.css` ~2.9 KB | `wc -c build/view.js build/style-index.css` |

Persistence/hook audit (expected output: **NONE**):

```
grep -rEl "add_option|update_option|register_setting|register_post_type|dbDelta|wp_schedule_event" \
  --include='*.php' . | grep -vE 'vendor|tests|node_modules'
```

The "average queries per page" figure is a flat **0 additional queries**, independent of the
number of bibliography blocks or citations on the page — all expensive resolution (Crossref
DOI, NCBI/PMC PMID) and CSL formatting happens at edit time and never touches a visitor.
