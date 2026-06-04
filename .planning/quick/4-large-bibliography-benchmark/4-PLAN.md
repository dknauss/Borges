# Quick Task 4: Large bibliography benchmark experiment

## Goal

Produce authoritative cold/warm latency measurements for the PHP formatter and
JS editor at bibliography sizes above the current 50-citation cap (75, 100,
150, 200 entries) across all supported style families, so the team can choose
between the three open policy options from `docs/planning/performance-stability-remediation-plan.md` REQ-C1:
1. Raise the hard cap with benchmark evidence
2. Soft cap with explicit warnings at a tested threshold
3. Keep 50 as the clean-UX target and add batched/streaming formatting for
   larger lists

This is an experiment/spike — results live on a dedicated branch and are not
merged until a cap-raise decision is made.

## Branch

`experiment/large-bibliography-benchmark`

No production code changes; no merge to `main` until a decision is taken.

## Scope

In scope:
- PHP REST formatter latency at escalating entry counts with controlled CSL-JSON fixtures
- JS editor perceived responsiveness (style-switch, add, delete) at the same sizes
- Measurements across all three style families (notes, author-date, numeric)
- Result memo documenting which option from REQ-C1 the data supports

Out of scope:
- Any editor guard or cap changes
- Batching/streaming implementation
- Production UX changes

## Tasks

1. **Generate representative CSL-JSON fixture sets** for 75, 100, 150, and 200
   entries that reflect realistic scholarly content across the supported source
   types (article, book, chapter, thesis, webpage, report).

2. **Extend the PHP benchmark harness** (or add a standalone script) to call the
   formatter REST handler directly — bypassing HTTP — with each fixture set,
   recording p50/p95 cold and warm latency per style family per entry count.
   Gate on whether a real formatter path was used (no fallback).

3. **Extend the JS benchmark suite** (`src/benchmarks/performance-benchmark.test.js`)
   with fixture sets at 75, 100, 150, and 200 entries. Record p50/p95 for:
   - Style switch (full reformat)
   - Single-entry add (merged bibliography reformat)
   - Single-entry delete (numeric skip path vs. author-date full reformat)

4. **Identify the first latency cliff** — the entry count at which p95 exceeds
   the current budgets (`SPEC.md` Rate Limiting & Resource Caps section):
   - Full style switch p95 < 250 ms
   - Single-entry add/edit/delete p95 < 150 ms

5. **Write a result memo** (`docs/planning/large-bibliography-benchmark-results.md`)
   summarising raw numbers, the identified cliff (if any), shared-hosting vs.
   local variance notes, and a recommendation for which REQ-C1 option to adopt.

## Acceptance criteria

- Fixture sets exist and cover all three style families at each target size.
- Benchmark output is deterministic: no fallback warnings, controlled test
  double for the REST path where applicable.
- p50/p95 recorded for PHP and JS at each entry count.
- Result memo names a recommended REQ-C1 option with supporting numbers.

## Verification

```bash
# JS benchmark at large sizes
TMPDIR="$PWD/.tmp" RUN_PERF_BENCHMARK=1 npm run test -- --runInBand \
  --runTestsByPath src/benchmarks/performance-benchmark.test.js

# PHP formatter direct (if standalone script added)
php scripts/benchmark-formatter.php

# Confirm no production code was modified
git diff main...HEAD -- src/ bibliography-builder.php includes/
```
