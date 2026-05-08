# Planning Documents

Forward-looking engineering plans, sprint roadmaps, and area-specific specifications that supplement the authoritative `SPEC.md` at the repo root.

## What goes here

- Multi-sprint roadmaps for major areas of work (e.g., sort conformance, accessibility hardening, performance refactors)
- Area-specific specifications that elaborate on `SPEC.md` without replacing it
- Ticket-style requirement breakdowns ready for the issue tracker
- Options analyses and architectural decision records related to in-flight planning

## What does NOT go here

- The authoritative plugin specification → `SPEC.md` at repo root
- QA checklists and matrices → flat `docs/` (e.g., `qa-matrix-checklist.md`)
- Manual test artifacts and samples → flat `docs/` (e.g., `free-text-samples.md`)
- Audit records → `docs/a11y-audit-records/` and similar category folders
- Release operational checklists → flat `docs/` (e.g., `release-readiness-checklist.md`, `wporg-svn-checklist.md`)

## Current plans

| Document | Status | Owner |
| --- | --- | --- |
| [performance-stability-remediation-plan.md](./performance-stability-remediation-plan.md) | Drafted 2026-05-08; ready for sprint planning | TBD |
| [sort-conformance-plan.md](./sort-conformance-plan.md) | Drafted 2026-05-07; revised 2026-05-07 with Codex review feedback; ready for sprint planning | TBD |

## Conventions

Each planning document should include:

1. A status header (drafted date, current state, owner, stakeholders)
2. A TL;DR summary
3. Sprint or phase breakdown when work spans multiple iterations
4. Self-contained ticket-style requirements that can be lifted to the issue tracker
5. A revision history table at the bottom

When a plan is fully delivered, archive it by moving to `docs/planning/archive/` rather than deleting, so the historical context remains accessible.
