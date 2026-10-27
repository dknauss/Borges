# Project

## Name

Borges Bibliography Builder

## Summary

WordPress block plugin that converts DOI, PubMed/PMID, BibTeX, and progressively
enhanced scholarly citation inputs into a semantically rich, static bibliography
block backed by CSL-JSON.

## Source of truth

-   `SPEC.md`

## Current focus

-   Current public release baseline is `v1.4.1`. The GSD `v1.3` milestone label
    is **retired**: its feature work (frontend Cite/Export affordances and
    free-text embedded-identifier resolution) shipped in the 1.4.x line. Future
    work is tracked as **release-versioned GSD milestones** (see _Milestone
    convention_ below).
-   Frontend Cite/Export affordances **shipped** in 1.4.x. Remaining active phase
    work: `06-ci-optimization` (unplanned strategy sketch, backlog).
    `05-writable-bibliography-rest` is complete (its last milestone, M4,
    shipped in 1.15.0).
-   The hidden 51-entry formatter cliff is now replaced by an explicit, tested
    50-total-citation policy for 1.x
-   Maintain CSL-JSON as the canonical citation model
-   Preserve static saved output / frontend-zero-JS bibliography rendering

## Milestone convention

GSD milestones are tied to **release versions** to keep planning aligned with
what actually ships (the `v1.3` label previously drifted because 1.4.x shipped
without milestone ceremony).

-   **A GSD milestone maps to a minor release line** (`v1.5.x`, `v1.6.x`), named
    for that target version (e.g. milestone `v1.5`). Open it with
    `/gsd:new-milestone v1.5`, which writes `milestone: v1.5` into `STATE.md`
    frontmatter — the field GSD reads, so the tooling label stays correct.
-   **Patch releases are maintenance, not milestones.** Bug fixes, dependency
    bumps, and hot-fixes that ship as `v1.5.1`, `v1.5.2`, … happen within or
    after a milestone; they do not open their own GSD milestone.
-   **Completion = release prep.** When a milestone's phases are planned,
    executed, and verified, that is the trigger to cut the release and run
    `/gsd:complete-milestone <version> --archive-phases`. Don't tag a release
    while its milestone still has unverified in-scope phases.
-   **Backlog phases get assigned to a release** when prioritized, rather than
    floating. Current loose backlog: `06-ci-optimization` — assign it to a release
    milestone when picked up.
-   **Source of truth for "what shipped" is git** (`git log main`, tags,
    `package.json` version), not the planning docs — cross-check before trusting
    a `.planning/` status claim.
