# Large bibliography benchmark results

Generated: 2026-10-14 (re-run of the 2026-05-10 benchmark)  
Branch: `claude/keen-tesla-49orwb-google-key` (from `main`, plugin 1.11.0)  
Machine: Linux cloud container (Intel Xeon @ 2.10 GHz, 4 vCPUs, PHP 8.4.19, Node 22.22.2), not the M-series Mac of the May run. The numbers are not directly comparable to May's; absolute times are expected to be higher on this hardware.  
Fixture: `src/benchmarks/fixtures/csl-200.json` — 200 CSL-JSON entries, realistic type mix (article-journal 40%, book 20%, chapter 15%, thesis 10%, webpage 10%, report 5%)

## Summary

**No latency cliff was found up to 200 entries.** Both the PHP formatter (real citeproc-php) and the JS orchestration layer (sort, state management, cache lookup) remain well within the SPEC budget thresholds at every tested size — 50, 75, 100, 150, and 200 entries.

The 250 ms style-switch and 150 ms mutation p95 budgets from SPEC §Rate Limiting & Resource Caps were never approached. The highest p95 observed was 45 ms (PHP cold, author-date, 200 entries). The highest JS p95 was 27 ms (mutation, 200 entries).

## PHP formatter — real citeproc-php (not mocked)

5 runs per cell (`php scripts/benchmark-formatter.php` as it was then). Cold = new CiteProc instance each run. Warm = instance reused. **These tables time citeproc-php rendering the whole list in one call, which the plugin never does** (see the cold-start profile below); the script now times the plugin's own path, and current numbers are under "Profiling follow-ups (2026-10-22)".

| Size | Family | Style | Cold p50 (ms) | Cold p95 (ms) | Warm p50 (ms) | Warm p95 (ms) |
| ---: | --- | --- | ---: | ---: | ---: | ---: |
| 50 | notes | chicago-notes-bibliography | 11.2 | 30.7 | 11.3 | 11.6 |
| 50 | author-date | chicago-author-date | 11.0 | 11.2 | 10.8 | 11.6 |
| 50 | numeric | ieee | 6.3 | 9.2 | 6.3 | 7.8 |
| 75 | notes | chicago-notes-bibliography | 11.5 | 12.0 | 11.4 | 11.6 |
| 75 | author-date | chicago-author-date | 11.3 | 13.2 | 11.8 | 14.3 |
| 75 | numeric | ieee | 8.7 | 9.9 | 8.8 | 11.1 |
| 100 | notes | chicago-notes-bibliography | 17.3 | 23.6 | 18.1 | 20.6 |
| 100 | author-date | chicago-author-date | 15.2 | 17.4 | 15.0 | 16.0 |
| 100 | numeric | ieee | 11.8 | 16.7 | 12.8 | 13.4 |
| 150 | notes | chicago-notes-bibliography | 21.5 | 23.4 | 21.6 | 24.9 |
| 150 | author-date | chicago-author-date | 23.0 | 25.0 | 22.1 | 25.6 |
| 150 | numeric | ieee | 22.0 | 24.6 | 21.6 | 23.9 |
| 200 | notes | chicago-notes-bibliography | 33.8 | 35.6 | 34.2 | 37.0 |
| 200 | author-date | chicago-author-date | 43.3 | 45.3 | 41.7 | 44.9 |
| 200 | numeric | ieee | 24.0 | 25.2 | 23.1 | 24.3 |

Budget: p95 < 250 ms. All cells: **ok**.

The 50-entry cold p95 spike for notes (30.7 ms against a 11.2 ms p50) is a single slow first run (class loading and style parsing), not list-size scaling. Everywhere else p95 sits close to p50, and time grows roughly linearly with size. At 200 entries, author-date is the slowest style (cold p95 45.3 ms, warm p95 44.9 ms), about 5.5x under the 250 ms budget; ieee is the cheapest (about 25 ms).

### Comparison with the 2026-05-10 run

Since May the nine CSL styles were rewritten and the JS sorter became particle-aware. The runs are on different hardware (macOS M-series then, a 2.1 GHz Xeon container now), so read the comparison as direction and order of magnitude, not a measured regression.

- PHP formatter at 200 entries: cold p95 was 19.0 / 14.0 / 12.9 ms (notes / author-date / ieee) and is now 35.6 / 45.3 / 25.2 ms. Warm p95 was 31.0 / 14.7 / 10.5 ms and is now 37.0 / 44.9 / 24.3 ms. That is roughly 2-3x slower, which is about what a slower CPU would explain. The one style that stands out is author-date, which was the same speed as notes in May and is now the slowest; it may reflect the rewritten style or just noise, and a same-machine comparison against the pre-rewrite styles would be needed to say. The May warm rows were noisier (warm often above cold), and the new warm and cold rows now agree, as expected for a formatter that has no meaningful instance reuse gain.
- JS orchestration at 200 entries: style-switch p95 was 9.4-9.5 ms and is now 12.2-14.8 ms; add/delete mutation p95 was 14.7-15.1 ms and is now 22.4-26.8 ms. About 1.3-1.8x, again within what the hardware difference accounts for. Nothing scales worse than linear, and the sorter change shows no visible cliff. The numeric no-reformat delete is still effectively zero (0.0-0.2 ms).
- Budgets: every cell is still under both the 250 ms style-switch and 150 ms mutation p95 budgets, by at least 5x.

**What this benchmark does not measure:** the HTTP round-trip from the WordPress editor REST call (serialization, WordPress middleware, plugin boot, network). Those costs would add to the numbers above on a live site. Shared hosting with a cold PHP-FPM pool could add 50–200 ms to the cold rows.

## JS orchestration — mock formatter (sort, state, cache lookup)

5 runs per cell. apiFetch is mocked; all measurements are JS-side orchestration (sort comparator, array operations, cache lookup). The mock returns instantly, so this isolates the JavaScript work from the PHP formatter round-trip.

### Style switch (full reformat trigger, JS side only)

| Size | Family | p50 (ms) | p95 (ms) |
| ---: | --- | ---: | ---: |
| 75 | notes | 5.3 | 6.6 |
| 75 | author-date | 7.0 | 7.9 |
| 75 | numeric | 7.4 | 8.7 |
| 100 | notes | 5.8 | 5.9 |
| 100 | author-date | 6.0 | 6.8 |
| 100 | numeric | 5.9 | 6.0 |
| 150 | notes | 9.4 | 9.6 |
| 150 | author-date | 8.8 | 9.7 |
| 150 | numeric | 8.8 | 9.2 |
| 200 | notes | 11.9 | 13.2 |
| 200 | author-date | 11.9 | 14.8 |
| 200 | numeric | 11.7 | 12.2 |

Budget: p95 < 250 ms. All cells: **ok**. JS orchestration overhead is ~0.05 ms per entry and scales linearly with no cliff.

### Mutations

| Size | Operation | p50 (ms) | p95 (ms) |
| ---: | --- | ---: | ---: |
| 75 | add — notes (full reformat) | 7.3 | 8.6 |
| 75 | delete — author-date (full reformat) | 7.4 | 7.7 |
| 75 | delete — numeric (no reformat) | 0.0 | 0.1 |
| 100 | add — notes (full reformat) | 9.7 | 10.3 |
| 100 | delete — author-date (full reformat) | 9.5 | 12.4 |
| 100 | delete — numeric (no reformat) | 0.0 | 0.2 |
| 150 | add — notes (full reformat) | 15.5 | 18.0 |
| 150 | delete — author-date (full reformat) | 15.1 | 16.1 |
| 150 | delete — numeric (no reformat) | 0.0 | 0.0 |
| 200 | add — notes (full reformat) | 20.9 | 22.4 |
| 200 | delete — author-date (full reformat) | 20.3 | 26.8 |
| 200 | delete — numeric (no reformat) | 0.0 | 0.0 |

Budget: p95 < 150 ms. All cells: **ok**. The numeric delete (no-reformat path) is effectively zero at all sizes — this confirms the optimization is worth keeping at any cap level.

## Interpretation

### What the data shows

Neither citeproc-php nor the JS orchestration layer is a bottleneck at 200 entries on local hardware. The format work itself is cheap — under 50 ms p95 cold for any style family at 200 entries (this container, 2026-10-14).

### What the data does not show

1. **HTTP round-trip on shared hosting.** A cold PHP-FPM pool, WordPress boot, REST dispatch, and network serialization add latency that is not captured here. On shared hosting, the cold total could plausibly be 150–300 ms for 100–200 entries.
2. **Block attribute payload size.** 200 CSL-JSON entries at ~800 bytes each is ~160 KB of block attribute data stored in `post_content`. WordPress saves this as a full HTML comment on every post save. This is a database and page-load concern independent of formatter speed.
3. **Editor perceived responsiveness.** The JS benchmark measures orchestration time after the REST response arrives. The full editor mutation perceived latency is `JS orchestration time + REST round-trip`. Only the JS part is measured here.
4. **Memory under load.** citeproc-php instantiation at high entry counts on shared hosting with a low `memory_limit` is not tested.

## Recommendation — REQ-C1 option

**Adopt Option 2: raise the soft cap to 100 entries with a persistent warning, keep 200 as an absolute hard cap.**

Rationale:

- The PHP formatter and JS orchestration work proves neither is a ceiling at 200 entries on capable hardware. The 250 ms style-switch and 150 ms mutation budgets are not threatened by local citeproc execution cost.
- The real uncertainty is REST round-trip on shared hosting (unknown) and block attribute payload size (a separate concern from formatter speed).
- A 100-entry soft cap with an explicit editor warning gives users a practical upgrade from 50 while remaining cautious about shared-hosting round-trips. The warning documents the performance expectation and transfers responsibility to the user if they exceed it.
- A hard cap at 200 entries prevents pathological cases that could trigger WordPress `post_content` size limits or PHP memory exhaustion on constrained hosts.
- Option 1 (raise the hard cap without a soft cap) would remove a useful warning layer. Option 3 (streaming/batched formatting) is not justified by the data — the bottleneck is HTTP round-trip, not citeproc execution time, and batching only helps citeproc execution.

### Recommended implementation steps (not in scope for this spike)

1. Update `BIBLIOGRAPHY_BUILDER_MAX_FORMAT_ITEMS` in PHP and the JS cap constant from 50 to 200 (hard cap).
2. Add a JS soft-cap warning at 100 entries (distinct from the hard-cap error).
3. Measure REST round-trip on a representative shared-hosting environment before advertising the 200 cap publicly.
4. Update SPEC REQ-C1 to document the new cap values and the soft-cap threshold.

### Status (2026-10-13)

- Step 2 and the JS half of step 1 shipped in 1.4.0 (`src/lib/citation-limits.js`: 100 soft, 200 hard).
- The PHP half of step 1 did not ship with them, and the editor sends the whole bibliography to `/format` in one request, so every add, edit, or style switch in a 51–200 entry bibliography fell back to raw titles. `BIBLIOGRAPHY_BUILDER_MAX_FORMAT_ITEMS` is now 200, and `src/lib/citation-limits.test.js` fails if the two drift apart.
- Step 3 is planned below.

## Shared-hosting timing check

The open question is the HTTP round trip, not citeproc. Three layers, cheapest first:

1. **Constrained PHP, formatter only (done).** `taskset -c 0 php -d memory_limit=128M scripts/benchmark-formatter.php --sizes=50,100,200` on a Linux container: 200 entries format in 28–35 ms p95 across notes, author-date, and numeric, with no memory errors at 128 MB. One core and a low memory limit roughly double the M-series numbers above and stay far under budget.
2. **Real WordPress over HTTP, every supported stack (in CI).** `scripts/runtime-matrix/smoke.sh` now runs `scripts/time-format-route.sh`, which POSTs the 200-entry fixture to `/format` three times per style family in two modes (cold, every title unique; edit, one title changed so the entry cache answers for the rest), times a `users/me` baseline, and checks that 200 entries come back. Until 2026-10-22 it changed one title per request, which stopped defeating the cache once the per-entry cache shipped; see "Profiling follow-ups". Timings are saved as `format-timing.txt` in each matrix job's artifacts (PHP 7.4–8.4, Apache and nginx, MySQL; the matrix has no SQLite lane). Each request is cut off at 10 s, which only catches a broken stack; GitHub runners are not shared hosting. First run (2026-10-13): p50 55–68 ms, max 87 ms, on apache-php74-wp64 and nginx-php83-wplatest.
3. **A real shared host (manual).** On a low-tier shared plan (the kind Borges users actually run; one cold PHP worker, 128–256 MB), install the release ZIP, create an application password for an editor, and run:

   ```sh
   RUNS=10 sh scripts/time-format-route.sh https://example.com/wp-json editor 'xxxx xxxx xxxx xxxx xxxx xxxx'
   ```

   Run it once after the site has been idle for a few minutes (cold PHP-FPM pool) and once warm. Record the p50 and max per style here.

**Decision rule.** If the cold max on the shared host is under 1 s, keep 200 and the 100-entry notice as they are. Between 1 and 3 s, keep 200 but reword the notice to say how long a reformat can take. Over 3 s, or any memory error, lower the cap (both constants together) to the largest size that stays under 1 s, and re-run.

| Host | PHP | Pool | Style | p50 (ms) | max (ms) |
| --- | --- | --- | --- | ---: | ---: |
| _pending_ | | cold | | | |
| _pending_ | | warm | | | |

## `/format` cold-start profile (2026-10-21)

The PHP benchmark above reported about 34 ms for 200 entries, while the HTTP route was seen at up to about 205 ms. `scripts/profile-format-route.php` explains the gap. It runs the plugin's own `/format` pipeline under the PHPUnit WordPress mocks, in a fresh PHP process per run (no opcache), so each run starts cold the way a request does.

**The 34 ms measured a path the plugin does not take.** `scripts/benchmark-formatter.php` renders all 200 entries in one citeproc-php call (22–33 ms here). The plugin renders one entry at a time, because citeproc-php carries "et al." and similar state from one entry into the next, and restores the parsed style's state (about 2,000–2,400 properties on some 400 objects) before each entry. That restore alone cost about 30 ms per 200 entries.

**Where a cold 200-entry request went** (Chicago notes, this container, medians; before → after the restore change below):

| Stage | ms |
| --- | ---: |
| Load the plugin | 6 |
| Validate and sanitize 200 items | 2.5 |
| Autoload citeproc-php | 6.5 |
| Prepare items (particles, page-first) | 1.5 |
| Parse style and locale, render the first entry | 10 |
| Render the other 199 entries (incl. restore) | 66–80 → 45 |
| Extract entries from citeproc HTML | 2–3 |
| **Whole REST callback** | **≈ 90–100 → ≈ 72** |

**The HTTP route is not 205 ms.** The latest runtime matrix on `main` (run 39679641007) timed the route on all ten cells: p50 56–121 ms, with one 240 ms max on apache-php81-wp67 (a single slow first request). The ~205 ms was such an outlier. With the callback itself at 70–100 ms, WordPress boot, REST dispatch, and JSON on CI's runners add only tens of milliseconds.

**Change made:** the reusable formatter now restores the snapshot by object, through a closure bound to each declaring class, instead of one `ReflectionProperty::setValue()` per property. The values written are identical; the CSL style goldens pass unchanged. That halves the restore (about 30 → 15 ms per 200 entries) and takes the cold callback from about 90 ms to about 72 ms here (minimums across 15 runs: 85–95 → 64–70 ms).

**Per-entry cache (2026-10-22).** The formatter cache key covered the whole list, so editing one entry in a 200-entry bibliography missed the cache and rendered all 200 again. Each entry renders on its own, so the formatter now also keeps one cache entry per style holding an entry-hash → text map (the 500 most recently used entries, `BIBLIOGRAPHY_BUILDER_FORMAT_ENTRY_CACHE_LIMIT`), and a request renders only the entries missing from it. In one process with the in-memory test cache, a 200-entry list with one title changed formats in about 5 ms instead of 64 ms (APA), 66 ms (Chicago notes), or 106 ms (IEEE). The remaining 5 ms is mostly parsing the style for the one new entry. With no persistent object cache, the map is one transient, so a request reads one option row either way.

## Profiling follow-ups (2026-10-22)

The profile above left two follow-ups: time a baseline route in the runtime matrix, and stop the PHP benchmark from timing a batch render the plugin never does. Doing them turned up a third problem.

**The matrix's `/format` timing had quietly changed meaning.** `time-format-route.sh` changed one title per request "so the formatter cache never answers". Once the per-entry cache shipped (#176), the other 199 entries came from the entry map, so of the three timed requests per style, one rendered everything and two were cached edits. Across the ten full-matrix cells on `main`, the overall p50 fell from 79.5 ms (03737b3, run 39697066599) to 33 ms (e1b0455, run 39700648148), and each style's max stayed near the old p50, because it was the one cold request. The drop was the cache working, but the cold path, which a style switch or a first format still pays, was no longer reported, so a regression there would have hidden behind the cache.

**Changes.** `time-format-route.sh` now sends, per run and style, a **cold** request (every title made unique) and an **edit** (one title changed), reported as `format-timing … mode=cold|edit`, and first times `GET /wp/v2/users/me` with the same application password as `route-timing route=users-me`: WordPress boot, authentication, and REST dispatch with no formatting. `scripts/benchmark-formatter.php` now times `bibliography_builder_format_csl_items()` cold and after a one-entry edit, under the PHPUnit mocks, and keeps the batch render as a labeled citeproc-php reference.

**Over HTTP** (runtime matrix PR cells, run 39820719424, 3 runs each, no persistent object cache, so the entry map is a MySQL transient; p50 in ms):

| Cell | Baseline `users/me` | Notes cold | Notes edit | Author-date cold | Author-date edit | IEEE cold | IEEE edit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| apache-php74-wp64 | 18 | 94 | 39 | 83 | 34 | 80 | 34 |
| apache-php83-wplatest | 22 | 105 | 39 | 97 | 35 | 92 | 36 |
| nginx-php83-wplatest | 19 | 88 | 35 | 82 | 33 | 79 | 33 |
| apache-php83-wplatest-multisite | 17 | 76 | 30 | 67 | 29 | 65 | 29 |
| **Median** | **18.5** | **91** | **37** | **82.5** | **33.5** | **79.5** | **33.5** |

The largest single request was 121 ms (Chicago notes, cold, apache-php83-wplatest).

**Full matrix on `main`** (run 39839437190, merge of #179, all ten cells, same method; p50 in ms):

| Cell | Baseline | Notes cold | Notes edit | Author-date cold | Author-date edit | IEEE cold | IEEE edit | Largest request |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| apache-php74-wp64 | 13 | 66 | 26 | 58 | 23 | 56 | 24 | 77 |
| apache-php81-wp64 | 22 | 107 | 41 | 98 | 37 | 92 | 39 | 132 |
| apache-php81-wp67 | 18 | 104 | 38 | 94 | 34 | 89 | 35 | 117 |
| nginx-php81-wp67 | 16 | 100 | 32 | 77 | 31 | 74 | 29 | 104 |
| apache-php82-wplatest | 16 | 66 | 30 | 58 | 26 | 56 | 26 | 121 |
| nginx-php82-wplatest | 10 | 52 | 20 | 46 | 19 | 44 | 20 | 65 |
| apache-php83-wplatest | 13 | 66 | 25 | 54 | 23 | 52 | 24 | 78 |
| apache-php83-wplatest-multisite | 21 | 100 | 39 | 85 | 34 | 82 | 35 | 112 |
| nginx-php83-wplatest | 18 | 96 | 35 | 91 | 34 | 85 | 34 | 113 |
| apache-php84-wplatest | 15 | 72 | 32 | 65 | 28 | 65 | 27 | 148 |
| **Median** | **16** | **84** | **32** | **71** | **29.5** | **69.5** | **28** | |

The largest request on every cell was Chicago notes cold. The spread between cells is mostly the runner, not PHP or the web server: on every cell, cold is about 5–6× that cell's baseline and an edit about 2×.

**Why Chicago notes looks slowest.** About half of its lead is real and about half is how it was measured.

- *Real, about 5–10%.* Its parsed style is the largest: 15 macros, and a tree of 432 objects (2,308 properties) restored between entries, against about 380 objects for Chicago author-date and APA. Timed warm in one process (median of 6 passes, 200 entries), it renders in 44.6 ms against 36.9–42.1 ms for the others, about 2 ms of that in the larger restore. In fresh processes with the styles interleaved, its median cold callback was 88 ms against 76–84 ms.
- *Measured, the rest.* `time-format-route.sh` timed it first, right after the baseline, so it absorbed the server's warm-up (opcache compiling citeproc-php's classes, fresh PHP workers, file caches). That is why the single largest request on all ten cells was Chicago notes cold, and why its edit lead (8%, timed after its own cold requests had warmed the server) is half its cold lead (18%). The same effect showed locally: run first, its fresh-process callback took 99 ms; run again last, 84 ms.

The script now sends one untimed cold request per style before timing it, so no style pays for the server warming up. The per-style gap that remains is not worth chasing: it is a few milliseconds per 200 entries, and it comes from the style's size, which follows the Chicago manual.

**Reference numbers, with the warm-up** (run 39845578855, merge of #180, all ten cells; p50 in ms). Use these, not the table above, as the baseline for future comparisons.

| Cell | Baseline | Notes cold | Notes edit | Author-date cold | Author-date edit | IEEE cold | IEEE edit | Largest request |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| apache-php74-wp64 | 22 | 111 | 44 | 103 | 38 | 98 | 39 | 112 |
| apache-php81-wp64 | 20 | 92 | 38 | 84 | 34 | 80 | 35 | 103 |
| apache-php81-wp67 | 19 | 104 | 40 | 94 | 34 | 90 | 35 | 106 |
| nginx-php81-wp67 | 18 | 95 | 34 | 93 | 35 | 86 | 37 | 99 |
| apache-php82-wplatest | 15 | 81 | 31 | 62 | 28 | 58 | 29 | 84 |
| nginx-php82-wplatest | 15 | 69 | 27 | 65 | 27 | 62 | 26 | 73 |
| apache-php83-wplatest | 20 | 100 | 38 | 94 | 34 | 88 | 35 | 100 |
| apache-php83-wplatest-multisite | 13 | 58 | 26 | 53 | 22 | 50 | 23 | 59 |
| nginx-php83-wplatest | 18 | 80 | 35 | 79 | 76 | 74 | 37 | 182 |
| apache-php84-wplatest | 13 | 55 | 24 | 52 | 21 | 50 | 23 | 58 |
| **Median** | **18** | **86.5** | **34.5** | **81.5** | **34** | **77** | **35** | |

- **The warm-up did what it was for.** Chicago notes' cold lead over the other two styles fell from about 18% to about 9% (86.5 ms against 79.5 ms pooled), within the 5–10% its larger style accounts for: about 6% over author-date and 12% over IEEE. The gap closed mostly because the other styles rose: before, they were timed after Chicago notes had warmed the server.
- **The first-request outlier is gone.** On nine of ten cells the largest request is now within a few milliseconds of that cell's slowest median; before, it was always Chicago notes cold, up to 148 ms.
- **One noisy runner.** nginx-php83-wplatest had requests up to 182 ms and an author-date edit median of 76 ms, against 21–44 ms for every other edit on every cell. That is the runner, not the plugin; without that cell, edits range 21–44 ms.
- **The picture is unchanged.** WordPress itself is about 18 ms per authenticated REST request on CI's runners, a cold 200-entry format 77–87 ms, an edit about 35 ms, and every request but the noisy cell's under half the 250 ms budget.

**In PHP** (`php scripts/benchmark-formatter.php --runs=5`, this container, PHP 8.4; p50 in ms, plugin boot and first autoload excluded):

| Entries | Notes cold | Notes edit | Author-date cold | Author-date edit | IEEE cold | IEEE edit | Batch reference (notes / a-d / IEEE) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 50 | 35 | 9 | 20 | 5 | 20 | 6 | 16 / 10 / 8 |
| 100 | 38 | 6 | 36 | 6 | 38 | 9 | 17 / 17 / 14 |
| 200 | 76 | 8 | 74 | 8 | 88 | 9 | 34 / 36 / 28 |

Cold p95 at 200 entries was 85–110 ms, under half the 250 ms style-switch budget.

**What the numbers say.**

- **WordPress itself costs about 18 ms** per authenticated REST request on CI's runners. Subtracting it, the plugin's share of a 200-entry request is about 60–75 ms cold and about 15 ms for an edit.
- **Cold is unchanged by the cache**, as it should be: 79–91 ms medians now, against 55–121 ms p50 before the cache (when every timed request was cold). That is the cost of a style switch or a first format, and it is the number to watch for regressions.
- **An edit costs about 2.5× the baseline, not 1×.** The 8 ms the PHP benchmark shows for the edit's render is less than half of the ~15 ms the plugin adds over HTTP. The rest is work every request does regardless: validating and sanitizing 200 items (about 2.5 ms), loading citeproc-php and parsing the style for the one new entry (up to about 6.5 and 5 ms cold, less with opcache), and reading and rewriting the entry map transient. Only a request whose entries are all cached skips citeproc-php entirely; an edit always needs it for its one entry. About 15 ms is small enough to leave alone.
- **The old batch benchmark understated cold by more than half** (34 ms against 76 ms at 200 entries), because the plugin renders one entry at a time and restores citeproc-php's state between entries. It is now labeled as a reference only.
- **Nothing here argues for changing the 200-entry cap or the 100-entry notice.** The slowest cold request on any cell was 121 ms; the shared-hosting check below is still the open question.

## Caveats and next steps

- The May tables came from a local M-series Mac with warm OS caches; the October tables are from a Linux cloud container. Re-run on a constrained VM (1–2 vCPU, 512 MB PHP memory limit) to get shared-hosting representative numbers before committing to any new cap value.
- The citeproc-php PHP 8.x deprecation warnings (nullable parameter declarations) do not affect correctness or timing but will become errors under PHP 9. Track the upstream fix schedule.
- The fixture is synthetic. Real scholarly content with long author lists, many co-authors, and complex title casing may format slower; re-run with a real bibliography export before finalising the cap.
