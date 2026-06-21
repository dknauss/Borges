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
    work is tracked against release versions rather than a GSD milestone.
-   Frontend Cite/Export affordances **shipped** in 1.4.x. Remaining active phase
    work: `05-writable-bibliography-rest` (deferred design memo) and
    `06-ci-optimization` (unplanned strategy sketch) — both backlog.
-   The hidden 51-entry formatter cliff is now replaced by an explicit, tested
    50-total-citation policy for 1.x
-   Maintain CSL-JSON as the canonical citation model
-   Preserve static saved output / frontend-zero-JS bibliography rendering
