---
phase: 4
slug: frontend-cite-export-affordances
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-10
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 via `wp-scripts test-unit-js` |
| **Config file** | `package.json` `"jest"` key + `jest.setup.js` |
| **Quick run command** | `npm test -- src/save.test.js src/lib/export.test.js src/deprecated.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~8 seconds (full suite ~6s currently) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- src/save.test.js src/lib/export.test.js src/deprecated.test.js`
- **After every plan wave:** Run `npm test` (full Jest suite)
- **Before `/gsd:verify-work`:** Full Jest suite green + `npm run test:e2e:playground` green
- **Max feedback latency:** ~8 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 0 | outputCiteExport attribute | unit | `npm test -- src/save.test.js` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 0 | cslToRisEntry export | unit | `npm test -- src/lib/export.test.js` | ❌ W0 | ⬜ pending |
| 4-01-03 | 01 | 0 | deprecated.js entry for current li | unit | `npm test -- src/deprecated.test.js` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 1 | details/summary per entry | unit | `npm test -- src/save.test.js` | ❌ W0 | ⬜ pending |
| 4-02-02 | 02 | 1 | opt-in attribute gates output | unit | `npm test -- src/save.test.js` | ❌ W0 | ⬜ pending |
| 4-02-03 | 02 | 1 | data URIs for RIS + CSL-JSON | unit | `npm test -- src/save.test.js` | ❌ W0 | ⬜ pending |
| 4-02-04 | 02 | 1 | data URIs for BibTeX + BibLaTeX | unit | `npm test -- src/save.test.js` | ❌ W0 | ⬜ pending |
| 4-02-05 | 02 | 1 | download attribute on all links | unit | `npm test -- src/save.test.js` | ❌ W0 | ⬜ pending |
| 4-02-06 | 02 | 1 | cite text readable without JS | unit | `npm test -- src/save.test.js` | ❌ W0 | ⬜ pending |
| 4-02-07 | 02 | 1 | XSS safety in data URIs | unit | `npm test -- src/save.test.js` | ❌ W0 | ⬜ pending |
| 4-03-01 | 03 | 1 | BibTeX/BibLaTeX pre-stored in editor | unit | `npm test -- src/hooks/use-citation-editor-state.test.js` | ✅ exists | ⬜ pending |
| 4-04-01 | 04 | 3 | CSS text-indent reset in details | manual | — | — | ⬜ pending |
| 4-04-02 | 04 | 3 | E2E disclosure + download links | e2e | `npm run test:e2e:playground` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/save.test.js` — new test cases for `<details>` structure, opt-in gating, data URI format/encoding, download attribute, cite text, XSS safety
- [ ] `src/lib/export.test.js` — new cases for `cslToRisEntry` (once exported), single-entry CSL-JSON data URI helper
- [ ] `src/deprecated.test.js` — new deprecated entry test capturing current `<li>` shape before Phase 4 changes it
- [ ] `block.json` — new `outputCiteExport` boolean attribute (required before opt-in gating tests can pass)

No new framework setup needed — existing Jest + `wp-scripts` infrastructure covers all unit and integration needs.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CSS text-indent reset inside details panel | save output correctness | CSS layout can't be verified in Jest JSDOM | Open a post with bibliography in a browser, toggle `<details>` panel, confirm text is flush-left and readable |
| NVDA screen-reader state announcement on details open | accessibility | Screen reader behavior not testable in Jest | Test with NVDA + Firefox: expand a citation's details panel and confirm state change is announced |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 8s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
