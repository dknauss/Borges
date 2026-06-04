# Performance benchmark harness

Date: 2026-04-04

This harness gives the plugin a repeatable way to measure the performance work identified by the Xdebug/profile review. It is intentionally lightweight: fixed import fixtures, a consistent manual workflow, and a place to record before/after timings.

## Automated harness

Run the local harness with:

```bash
npm run benchmark:perf
```

It writes fresh reports to:

- `output/benchmarks/latest.json`
- `output/benchmarks/latest.md`

The automated harness clears the formatting cache between runs so the reported timings reflect cold-formatting costs more consistently.

## Fixtures

Use these fixed import fixtures:

- `src/benchmarks/fixtures/import-freetext-10.txt`
- `src/benchmarks/fixtures/import-freetext-25.txt`
- `src/benchmarks/fixtures/import-freetext-50.txt`

Each file contains unique supported free-text book citations separated by blank lines, so the parser can process them deterministically without DOI/network variance.

## Measure import latency

1. Start from a fresh post with a new bibliography block.
2. Keep the default citation style unless the benchmark explicitly targets another style.
3. Paste one fixture into **Paste / Import**.
4. Measure from clicking **Add** until:
   - the success/info notice appears, and
   - the newly added entries are visible and interactive.
5. Record the timing for 10, 25, and 50 entries.

## Measure style-switch latency

1. Import the 50-entry fixture first.
2. Switch styles across at least these transitions:
   - Chicago Notes-Bibliography → IEEE
   - IEEE → Vancouver
   - Vancouver → MLA 9
3. Measure from changing the style selector until:
   - the success notice appears, and
   - the list visibly finishes reformatting.

## Measure manual-entry latency

1. Switch to **Manual Entry**.
2. Add a representative citation with:
   - Publication Type
   - Author(s)
   - Title
   - Year
3. Measure from clicking **Add citation** until the new entry receives focus.

## Record template

Use this table for before/after comparisons:

| Scenario | Before | After | Notes |
|---|---:|---:|---|
| Import 10 |  |  |  |
| Import 25 |  |  |  |
| Import 50 |  |  |  |
| Style switch: Chicago → IEEE |  |  |  |
| Style switch: IEEE → Vancouver |  |  |  |
| Style switch: Vancouver → MLA 9 |  |  |  |
| Manual entry add |  |  |  |

## Notes

- Keep browser and Studio conditions as consistent as possible between runs.
- Prefer the same local site and sample post when comparing before/after changes.
- If Xdebug trace/profile mode is enabled, do not rely on it for precise timing numbers in Studio; use it for qualitative hotspot inspection only.
