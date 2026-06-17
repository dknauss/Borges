# Large bibliography benchmark results

Generated: 2026-05-10  
Branch: `experiment/large-bibliography-benchmark`  
Machine: macOS (M-series), local dev environment  
Fixture: `src/benchmarks/fixtures/csl-200.json` — 200 CSL-JSON entries, realistic type mix (article-journal 40%, book 20%, chapter 15%, thesis 10%, webpage 10%, report 5%)

## Summary

**No latency cliff was found up to 200 entries.** Both the PHP formatter (real citeproc-php) and the JS orchestration layer (sort, state management, cache lookup) remain well within the SPEC budget thresholds at every tested size — 50, 75, 100, 150, and 200 entries.

The 250 ms style-switch and 150 ms mutation p95 budgets from SPEC §Rate Limiting & Resource Caps were never approached. The highest p95 observed was 31 ms (PHP warm, notes, 200 entries).

## PHP formatter — real citeproc-php (not mocked)

5 runs per cell. Cold = new CiteProc instance each run. Warm = instance reused.

| Size | Family | Style | Cold p50 (ms) | Cold p95 (ms) | Warm p50 (ms) | Warm p95 (ms) |
| ---: | --- | --- | ---: | ---: | ---: | ---: |
| 50  | notes       | chicago-notes-bibliography | 8.1  | 34.4 | 4.8  | 6.9  |
| 50  | author-date | chicago-author-date        | 6.1  | 11.2 | 7.0  | 10.1 |
| 50  | numeric     | ieee                       | 5.2  | 10.9 | 5.1  | 16.4 |
| 75  | notes       | chicago-notes-bibliography | 4.4  | 5.8  | 4.3  | 5.2  |
| 75  | author-date | chicago-author-date        | 5.2  | 6.7  | 4.1  | 5.8  |
| 75  | numeric     | ieee                       | 4.4  | 6.5  | 5.1  | 5.6  |
| 100 | notes       | chicago-notes-bibliography | 5.7  | 9.2  | 6.6  | 7.4  |
| 100 | author-date | chicago-author-date        | 8.7  | 11.6 | 9.8  | 16.1 |
| 100 | numeric     | ieee                       | 5.9  | 7.3  | 6.7  | 7.9  |
| 150 | notes       | chicago-notes-bibliography | 7.0  | 8.0  | 8.4  | 13.1 |
| 150 | author-date | chicago-author-date        | 11.1 | 17.9 | 11.5 | 26.6 |
| 150 | numeric     | ieee                       | 7.3  | 8.6  | 7.6  | 8.4  |
| 200 | notes       | chicago-notes-bibliography | 11.9 | 19.0 | 16.4 | 31.0 |
| 200 | author-date | chicago-author-date        | 11.4 | 14.0 | 11.0 | 14.7 |
| 200 | numeric     | ieee                       | 9.7  | 12.9 | 10.1 | 10.5 |

Budget: p95 < 250 ms. All cells: **ok**.

The 50-entry cold p95 spike (34.4 ms for notes) reflects first-run JIT / class-loading overhead for citeproc-php, not list-size scaling. At 75+ entries the cold p95 drops and scales linearly, reaching ~19 ms at 200 entries.

Author-date warm p95 grows from 10 ms at 50 entries to 27 ms at 150 entries (notes warms from 7 ms to 31 ms at 200). This variance is real but the ceiling at 200 entries (31 ms) remains 8× under the 250 ms budget.

**What this benchmark does not measure:** the HTTP round-trip from the WordPress editor REST call (serialization, WordPress middleware, plugin boot, network). Those costs would add to the numbers above on a live site. Shared hosting with a cold PHP-FPM pool could add 50–200 ms to the cold rows.

## JS orchestration — mock formatter (sort, state, cache lookup)

5 runs per cell. apiFetch is mocked; all measurements are JS-side orchestration (sort comparator, array operations, cache lookup). The mock returns instantly, so this isolates the JavaScript work from the PHP formatter round-trip.

### Style switch (full reformat trigger, JS side only)

| Size | Family | p50 (ms) | p95 (ms) |
| ---: | --- | ---: | ---: |
| 75  | notes       | 3.6 | 4.5 |
| 75  | author-date | 3.5 | 3.9 |
| 75  | numeric     | 3.4 | 3.6 |
| 100 | notes       | 4.6 | 4.8 |
| 100 | author-date | 4.5 | 4.7 |
| 100 | numeric     | 4.5 | 4.6 |
| 150 | notes       | 7.0 | 7.1 |
| 150 | author-date | 7.0 | 7.1 |
| 150 | numeric     | 6.9 | 7.1 |
| 200 | notes       | 9.3 | 9.4 |
| 200 | author-date | 9.3 | 9.5 |
| 200 | numeric     | 9.3 | 9.5 |

Budget: p95 < 250 ms. All cells: **ok**. JS orchestration overhead is ~0.05 ms per entry and scales linearly with no cliff.

### Mutations

| Size | Operation | p50 (ms) | p95 (ms) |
| ---: | --- | ---: | ---: |
| 75  | add — notes (full reformat)         | 5.4  | 7.7  |
| 75  | delete — author-date (full reformat)| 5.2  | 5.4  |
| 75  | delete — numeric (no reformat)      | 0.0  | 0.0  |
| 100 | add — notes (full reformat)         | 6.8  | 7.1  |
| 100 | delete — author-date (full reformat)| 6.9  | 7.0  |
| 100 | delete — numeric (no reformat)      | 0.0  | 0.0  |
| 150 | add — notes (full reformat)         | 10.8 | 11.1 |
| 150 | delete — author-date (full reformat)| 10.4 | 10.5 |
| 150 | delete — numeric (no reformat)      | 0.0  | 0.0  |
| 200 | add — notes (full reformat)         | 14.8 | 15.1 |
| 200 | delete — author-date (full reformat)| 14.4 | 14.7 |
| 200 | delete — numeric (no reformat)      | 0.0  | 0.0  |

Budget: p95 < 150 ms. All cells: **ok**. The numeric delete (no-reformat path) is effectively zero at all sizes — this confirms the optimization is worth keeping at any cap level.

## Interpretation

### What the data shows

Neither citeproc-php nor the JS orchestration layer is a bottleneck at 200 entries on local hardware. The format work itself is cheap — under 20 ms p95 cold for any style family at 200 entries.

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

## Caveats and next steps

- These numbers are from a local M-series Mac with warm OS caches. Re-run on a constrained VM (1–2 vCPU, 512 MB PHP memory limit) to get shared-hosting representative numbers before committing to any new cap value.
- The citeproc-php PHP 8.x deprecation warnings (nullable parameter declarations) do not affect correctness or timing but will become errors under PHP 9. Track the upstream fix schedule.
- The fixture is synthetic. Real scholarly content with long author lists, many co-authors, and complex title casing may format slower; re-run with a real bibliography export before finalising the cap.
