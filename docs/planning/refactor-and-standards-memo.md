# Refactoring, architecture, and coding standards memo

| | |
|---|---|
| Drafted | 2026-10-14, against `main` at `ca8d3b3` (1.11.0 plus #147 and #148) |
| Status | Recommendation, awaiting the owner's decision |
| Owner | TBD |
| Answers | `.planning/todos/pending/2026-06-17-research-benefits-of-a-leaner-root-plugin-file.md` |

## TL;DR

- **The code isn't bloated, and runtime cost is negligible.** The plugin's PHP takes about 0.9 ms to load per request with OPcache and about 5 ms without it. Visitors get 1.4 KB of JavaScript. The editor bundle is 24 KB gzipped, and citation-js loads only when it's needed.
- **PHP has grown about 12×** since 1.0.0, but nearly all of it is deliberate: the writable-bibliography work (Phase 05) and the lookup resolvers. That PHP is mostly one big, deliberate copy of the JS save logic.
- **Finish the root-file split, for maintainability rather than speed.** Moving four groups of functions out of `bibliography-builder.php` into `includes/` leaves a short bootstrap file. Function names stay the same. Lazy-loading by request type isn't worth the risk for under 1 ms of OPcache savings.
- **The real architectural risk is the JS/PHP twin implementations.** The style table exists in four places, and the save/sort/particle logic is hand-ported. Parity fixtures keep the twins honest. The cheap win is one shared JSON file for the data tables, so only the logic stays twinned.
- **Standards: keep WordPress conventions and tighten what's already there.** Don't move to namespaces/PSR-4 or TypeScript; both cost a lot and buy little here. Do tighten Psalm one level at a time, try JSDoc type checking on the pure `src/lib/` modules, and clear up the Prettier-vs-docs mismatch.

## 1. Where things stand

### Size over releases

Measured from each release tag. "PHP" is first-party PHP excluding `vendor/`, tests, scripts, and packages. "JS" is `src/`, excluding tests.

| Release | Root file | PHP | JS | Test files | ZIP |
|---|---:|---:|---:|---:|---:|
| 1.0.0 | 815 | 817 | 5,961 | 27 | 579 KB |
| 1.2.0 | 1,025 | 1,027 | 6,872 | 39 | 585 KB |
| 1.4.0 | 1,336 | 1,338 | 8,399 | 48 | 413 KB |
| 1.5.0 | 2,070 | 2,168 | 8,868 | 50 | 464 KB |
| 1.6.0 | 2,859 | 3,299 | 9,380 | 53 | 488 KB |
| 1.7.0 | 2,077 | 8,005 | 9,956 | 66 | 541 KB |
| 1.9.0 | 2,110 | 8,503 | 10,544 | 69 | 548 KB |
| 1.10.0 | 2,177 | 9,381 | 11,096 | 71 | 569 KB |
| 1.11.0 | 2,185 | 9,537 | 11,198 | 73 | 571 KB |
| `main` today | 2,208 | 10,048 | 11,381 | 75 | — |

What the growth is:

- **PHP's jump at 1.7.0 (+4,700 lines)** is the Phase 05 work:
  - the PHP port of `save()` (`includes/save-markup.php`, 2,544 lines);
  - the review routes (`includes/review.php`);
  - the block locator;
  - the write routes.
  It was planned in the design memo, and it is why server-side writes work at all.
- **The other large PHP block is `includes/resolvers.php` (1,663 lines).** It holds six lookup providers: PMID, PMCID, arXiv, ISBN, catalog and Internet Archive. Each is a fixed-host proxy with its own field mapping.
- **JS grew about 1.9× in eighteen releases, at a steady rate.** That's features, not drift.
- **Tests kept pace:** test files nearly tripled, and combined coverage is 88%.
- **The ZIP is smaller than at 1.0.0.** 1.3.0 cut 200 KB by pruning `vendor/`, and later growth is about 175 KB over fifteen releases.

### Runtime cost

| Path | Cost | How measured |
|---|---|---|
| Visitor page, plugin PHP load | **≈ 0.9 ms with OPcache**, ≈ 5 ms without | `require` of the root file (which loads all ten `includes/` files), timed in-process, 5–6 runs, `vendor/` not loaded |
| Visitor page, JS | **1,449 bytes** (`view.js`, 655 bytes gzipped) | `build/` |
| Visitor page, PHP work | two `render_block` filters doing string checks; no I/O | `docs/current-metrics.md` |
| Editor, main bundle | 85 KB minified / **24 KB gzipped** | `build/index.js` |
| Editor, citation-js | ≈ 110 KB minified / 34 KB gzipped, **loaded on demand** (`import()` in the import and export paths) | `build/citation-*.js` |
| Formatter, 200 entries | p95 ≤ 31 ms in PHP, 9.5 ms of JS orchestration | `docs/planning/large-bibliography-benchmark-results.md` (May 2026) |

The citeproc-php engine (`vendor/`, 7.9 MB unpruned in development) loads only inside editor-time REST callbacks, through the autoloader in `bibliography_builder_ensure_formatter_available()`. Visitors never load it.

**Bloat verdict:** there are no signs of bloat in what visitors or editors pay for. Where the code is heavy is maintenance, not runtime: the save, sort and style logic exists twice, in JS and in PHP (§3). One thing is stale. The benchmark predates the nine rewritten CSL styles and the particle-aware sort, so rerun it (`npm run benchmark:perf` and the PHP harness) before the next release. The runtime matrix already times a 200-entry `/format` call over HTTP on every PR.

## 2. The leaner root file

The pending todo asked three questions. Here are the answers.

**Performance: a small gain, not worth chasing.** With OPcache, which almost every production host runs, the whole plugin costs under 1 ms per request whatever the file layout. Loading code only for the request type that needs it would save about 4 ms per request, and only on hosts without OPcache. In exchange, every hook would depend on the right file having been loaded first. That's a fragile trade for so little.

**Security: neutral.** How the code is split into files doesn't change what's exposed. Permissions are set where each route is registered, whichever file that sits in. Two things do help:
- Auditing is easier when each concern lives in its own file. You can review "everything a visitor request can reach" by reading three files.
- The redeclare-fatal risk from the old `includes/pmid.php` incident is now covered. A test can require each `includes/` file once and fail on a duplicate function.

**Maintainability: the real reason to do it.** The root file still holds seven unrelated responsibilities. Line ranges are from `main` today:

| Lines | Responsibility | Proposed home |
|---|---|---|
| 75–225 | Block discovery and the read model (`collect_blocks`, `get_bibliographies_for_post`, plain-text and CSL-JSON builds) | `includes/block-data.php` |
| 225–430 | Style definitions, JSON encoding, transient cache | `includes/formatter.php` (with the formatter) |
| 432–1,050 | CSL validation and sanitization (16 functions) | `includes/csl-sanitize.php` |
| 1,053–1,449 | Formatter: cache key, citeproc adaptation, entry extraction, `format_csl_items` | `includes/formatter.php` |
| 1,449–1,613 | Permission callbacks | stay in the root file, next to route registration (current convention) |
| 1,613–2,061 | REST read routes and route registration | `includes/read-routes.php`, with registration staying in the root file |
| 2,061–2,208 | Block init and Block Accessibility Checks integration | stay in the root file |

After the split, the root file is roughly the header, constants, `require_once` lines, hook registration and permission callbacks: about 450 lines, down from 2,208.

**Recommendation: do it, the way the resolvers move worked in 1.6.0:**
- Move the functions byte for byte, under the same names, one PR per group.
- Check after each PR that every original function is still defined exactly once.
- Function names are effectively public: tests call them, and so might other plugins. None are renamed.

## 3. Architecture

### 3.1 JS/PHP twin implementations (the main risk)

Borges keeps several pieces of logic in both languages:

- **The save logic.** `save()` and `includes/save-markup.php` must produce byte-identical markup, or the editor marks a server-written block invalid.
- **Sorting.** `src/lib/sorter.js` vs the PHP save port, including the new particle rules (`src/lib/name-particles.js` vs `bibliography_builder_split_name_particle()`).
- **The style table.** It is in four places:
  - `src/lib/formatting/style-registry.js`
  - `bibliography_builder_get_formatter_style_definitions()`
  - the style table in `includes/save-markup.php`
  - `bibliography_builder_write_default_heading()`
- **The Cite / Export labels and default headings.**

This is mostly worth what it costs. It's the only way server-side writes stay valid in the editor, and the parity fixtures (`tests/fixtures/save-parity/`, `tests/fixtures/sort-coordination/`) catch drift in CI. But every style or sort change is now a two-language change. #142 touched 22 files across both languages to fix one sorting rule.

**Recommendation: share the data, keep twinning the logic.**
- Move the style table into one `src/lib/formatting/styles.json` that both sides read. It would carry the key, CSL template, locale, family, default heading, and `demote-non-dropping-particle`. Webpack imports the JSON, PHP reads it with `json_decode` once per request, and it ships in the ZIP. The same JSON could hold the particle list and the canonical English labels.
- That removes three of the four style tables and the hand-kept particle list, plus the consistency tests that exist only to compare them.
- The remaining twinned logic stays protected by the parity fixtures. Don't try to generate PHP from JS; that adds a build step and hides problems instead of fixing them.

### 3.2 Large files

| File | Lines | Suggestion |
|---|---:|---|
| `includes/save-markup.php` | 2,544 | Split along the JS module lines it ports: sort, display segments, export panel, JSON-LD and COinS, wrapper. Mirroring the JS layout also makes JS↔PHP review easier. Medium priority; do it after §3.1, which shrinks it. |
| `includes/resolvers.php` | 1,663 | Split per provider, keeping the shared `resolve_remote_csl()` and HTTP helpers in one file. Low priority: it's well organized, just long. |
| `src/lib/parser.js` | 1,607 | Split detection (what kind of input this is) from per-format parsing. Medium priority; the parser is where most bug fixes land. |
| `src/edit.js` + `use-citation-editor-state.js` | 955 + 815 | Leave them. The state hook was already extracted, and the rest is UI wiring. Splitting further would scatter the code more than it clarifies. |

### 3.3 Settled decisions (not reopening)

- **Citation child blocks (ROADMAP Option B): still no.** It would mean a data-model migration for UI benefits the current block mostly has. With the write routes now built on the parent-block model, switching would cost even more.
- **Static `save()` with no `render_callback`: keep it.** The two small `render_block` filters show it can adapt published markup without dynamic rendering.
- **Abilities wrapping routes:** the M5 approach, where each ability calls its route's own callback, keeps a single code path. Use the same pattern for Tier 4 bulk operations.

## 4. Coding standards and methods

| Proposal | Recommendation | Why |
|---|---|---|
| PHP namespaces / PSR-4 classes / Composer autoload | **No** | The `bibliography_builder_` prefix is enforced by PHPCS and works. Switching would rename about 255 functions that tests (and possibly other plugins) call, and would mix two styles for a long time. Classes only pay off for stateful pieces, and the plugin has almost none (the citeproc wrapper is already a class). |
| Psalm stricter than level 6 | **Yes, one step at a time** | Level 6 is lenient. Move to 5, then 4, each with a baseline file for existing issues so new code can't add more. The sanitization and save-port code, where array shapes matter, would benefit most. |
| Add PHPStan alongside Psalm | No | Two analyzers doing the same job means duplicate noise. |
| PHP 7.4 compatibility check (`PHPCompatibilityWP`) | **Yes** | The plugin declares PHP 7.4, but only the runtime matrix's single 7.4 cell would catch 8.x-only syntax, and that's late and coarse. A PHPCS ruleset with `testVersion 7.4-` catches it at lint time. |
| TypeScript migration | No | It means a build change, a rewrite of 11k lines, and different idioms from the WordPress block examples it follows. |
| JSDoc type checking (`checkJs`) on `src/lib/` | **Pilot it** | The pure modules already carry JSDoc (126 `@param` tags). TypeScript is already in the dependency tree via an override, so this needs no new tooling. Add a `jsconfig.json` scoped to `src/lib/` and run `tsc --noEmit` as a non-blocking CI step first, then make it blocking once clean. |
| Prettier on docs | **Decide once** | `CHANGELOG.md` and the docs fail `prettier --check` because they use `-` list markers and don't wrap lines. Either add a `.prettierignore` for `*.md`, or format once and enforce it. The first fits how the docs are written. |
| Abilities in the runtime matrix | **Yes** | The PHPUnit mocks cover registration and wiring, but nothing runs an ability on real WordPress 6.9. Add one read call and one write dry run to `scripts/runtime-matrix/smoke.sh` for WordPress 6.9+ cells. |
| PHPUnit with mocked WordPress | Keep | The 585-line bootstrap is fast and has caught real bugs. The runtime matrix provides real-WordPress coverage. Switching to `wp-phpunit` would slow every run for little gain. |

## 5. Phased plan

Each ticket below is one PR that can be lifted to the issue tracker on its own. None changes behavior, saved markup, or public function names.

**Phase A: housekeeping (small, now)**

1. **Prettier and docs.** Add `.prettierignore` for Markdown. *Done when:* `npx prettier --check .` passes or the docs are explicitly excluded.
2. **PHPCompatibilityWP.** Add it to `phpcs.xml.dist` with `testVersion 7.4-`. *Done when:* `composer lint:php` checks PHP 7.4 compatibility and passes.
3. **Abilities smoke.** On the runtime matrix's WordPress 6.9+ cells, run `borges/get-bibliographies` and a `borges/add-citations` dry run. *Done when:* both are asserted in `smoke.sh`.
4. **Rerun the benchmarks.** Refresh `large-bibliography-benchmark-results.md` with the current styles and sort.

**Phase B: root-file split (one PR per row of the §2 table)**

5. Extract `includes/csl-sanitize.php`.
6. Extract `includes/formatter.php`, including the style definitions and cache.
7. Extract `includes/block-data.php`.
8. Extract `includes/read-routes.php`, keeping registration in the root file.
9. **A function-inventory test.** It loads the plugin and fails if any `bibliography_builder_*` function in a fixed list goes missing.

*Done when:* the root file holds only the header, constants, includes, hooks and permission callbacks, and `docs/current-metrics.md` and CLAUDE.md are updated.

**Phase C: shared style data**

10. **`styles.json`.** Create it, read it from `style-registry.js` and the PHP helpers, and delete the duplicate tables. *Done when:* no style key is written in more than one source file, and the consistency tests read the JSON.
11. **Particle list and canonical labels.** Move them into the same JSON.

**Phase D: static analysis**

*Why it comes before any PHP floor change:* Phase D gets most of the maintainability benefit of a PHP 8.x floor with nobody left behind. Psalm's stricter levels enforce the same types that PHP 8's native union types and enums would, but in CI, not on the user's server, so no site on PHP 7.4 is cut off. See `.planning/todos/pending/2026-10-14-research-php-8x-floor.md`.

12. **Psalm level 5** with a baseline.
13. **`checkJs` pilot** on `src/lib/`, non-blocking at first.
14. **Psalm level 4** with a baseline, once level 5 is clean.

**Phase E: large-file splits (as needed)**

15. Split `includes/save-markup.php` along the JS module lines (after Phase C).
16. Split `src/lib/parser.js` into detection and per-format parsers.

## Progress

| Ticket | Status |
|---|---|
| Phase A (1–4) | Done: #150, #151, #152, #153 |
| 5. `includes/csl-sanitize.php` | Done in #160, with ticket 9 (the function-inventory test) so it guards every later move |
| 6. `includes/formatter.php` | Done in #161: style definitions through `format_csl_items()`, 16 functions; root file 1,607 → 1,002 lines |
| 7. `includes/block-data.php` | Done in #162: 7 functions, from `get_stable_block_id()` through `build_csl_json()`; root file 1,002 → 847 lines |
| 8. `includes/read-routes.php` | Done in #164: the `/format` callback, its request-parameter helper, and the two post bibliography read callbacks, 4 functions; root file 847 → 703 lines. Phase B is complete |
| 10. `styles.json` | Done in #165: `includes/styles.json` (beside the PHP that reads it, so the release ZIP ships it with no packaging change) replaces the JS registry's table and the three PHP tables, and PHP's default-style literals call `bibliography_builder_default_style_key()`. One drift found and fixed: Harvard sorted with `en-US` but formatted with `en-GB`; it now uses `en-GB` for both, which sorts identically (ICU resolves both to the root collation) |
| 11. Particle list and canonical labels | Done in #167: the particle list moved to `nameParticles` in `styles.json`, replacing the JS `Set` literal and the PHP array. The Cite / Export labels stay where they are: each translated label must be a literal `__()` string in its own language for string extraction, the English text is fixed by saved markup and deprecation fixtures, and `view.js` keeps its own copy so the front end loads no `wp-i18n`. Instead, a Jest test now checks that `view.js`'s fallback labels and the editor's untranslated labels equal `CITE_EXPORT_LABELS`. Phase C is complete |
| 12 and 14. Psalm level 5, then 4 | Done in #168: level 5 was already clean and level 4's eight findings were fixed in code, so neither step needed a baseline. **Goal: level 3** (46 findings at the time, mostly `PossiblyNullArgument` from WordPress and PHP functions that can return null or false). Level 2 adds docblock-vs-cast noise from deliberate defensive casts, and level 1 is mostly `Mixed*` findings inherent to block attributes, REST params, and `json_decode()`; neither is worth chasing |
| 14b. Psalm level 3 | Done: 35 findings on top of level 4, none a behavior change. `preg_*()` and `wp_json_encode()` results that can be `null` or `false` are cast or checked before use (PHP already coerced them the same way, with 8.1+ deprecation notices); docblocks that claimed `int` or `string` for raw request values now say `mixed` where the function itself applies `absint()` or a cast; and two invariants Psalm can't see (citeproc reflection properties set on first use, link parts that always carry `href`) are suppressed in place with the reason |
| 15. Split `includes/save-markup.php` | Done: four contiguous groups moved unchanged (checked with `cmp`) into `save-sort.php` (488 lines), `save-display.php` (831), `save-json-ld-coins.php` (284), and `save-cite-export.php` (203); `save-markup.php` keeps the JS-compatible helpers, entry rendering, and the wrapper (2,466 → 658 lines) |

## Revision history

| Date | Change |
|---|---|
| 2026-10-14 | First draft, answering the leaner-root-file todo and the owner's questions on refactoring, architecture, standards, metrics and bloat. |
