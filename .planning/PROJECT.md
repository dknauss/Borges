# Project

## Name

Borges Bibliography Builder

## Summary

WordPress block plugin that converts DOI, BibTeX, and progressively enhanced
scholarly citation inputs into a semantically rich, static bibliography block
backed by CSL-JSON.

## Source of truth

-   `/Users/danknauss/Developer/GitHub/wp-bibliography-block/SPEC.md`

## Current focus

-   Phase 2 performance/stability remediation is implemented and in final
    stabilization/review before commit
-   The hidden 51-entry formatter cliff is now replaced by an explicit, tested
    50-total-citation policy for 1.x
-   Maintain CSL-JSON as the canonical citation model
-   Preserve static saved output / frontend-zero-JS bibliography rendering
