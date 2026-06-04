---
created: 2026-05-04T18:15:00Z
title: Full accessibility audit — Borges Bibliography Builder
area: accessibility
files:
    - /Users/danknauss/Developer/GitHub/wp-bibliography-block/tests/e2e/a11y.spec.js
    - /Users/danknauss/Developer/GitHub/wp-bibliography-block/src/edit.js
    - /Users/danknauss/Developer/GitHub/wp-bibliography-block/src/save.js
    - /Users/danknauss/Developer/GitHub/wp-bibliography-block/src/components/
---

## Goal

Establish a comprehensive, repeatable accessibility audit baseline for
the Borges Bibliography Builder block covering automated, scripted, and
manual checks. Results inform remediation priorities and serve as the
acceptance gate for future a11y-affecting changes.

Standard: WCAG 2.1 AA throughout. Notes on 2.2 criteria where relevant.

---

## Tier 1 — Automated (CI, no browser needed)

These run on every PR via `npm run test:a11y` → `tests/e2e/a11y.spec.js`.

| # | Check | Tool | Status |
|---|---|---|---|
| 1 | WCAG 2.1 AA axe scan — editor block (scoped to block element) | axe-core/playwright | ✅ in CI |
| 2 | WCAG 2.1 AA axe scan — published frontend output | axe-core/playwright | ✅ in CI |

---

## Tier 2 — Scripted browser (Playwright, runs in `a11y.spec.js`)

Requires a WordPress Playground session. These are codified as
`test.step()` assertions inside the existing serial spec.

| # | Check | How to test |
|---|---|---|
| 3 | **Keyboard-only authoring flow** | Tab/Enter/Escape through full add → view → delete cycle; assert no mouse required |
| 4 | **Focus management after add** | After clicking Add (via keyboard), focus moves to the new citation entry, not back to textarea |
| 5 | **Modal / popover focus trap and restore** | Open citation form, close with Escape; focus returns to the toggle button |
| 6 | **Visible focus indicators** | All interactive controls have a visible focus ring at both 1280px and 320px viewports (Playwright screenshot comparison or CSS check) |
| 7 | **Forced-colors (Windows High Contrast)** | `page.emulateMedia({ forcedColors: 'active' })`; axe scan passes; key icons/borders not invisible |
| 8 | **400% zoom / reflow** | Set viewport to 320px width (equivalent to 400% zoom at 1280px base); no horizontal scrollbar; no content clipped |
| 9 | **BAC checks fire on empty block** | With BAC plugin active in Playground, empty bibliography block shows error indicator in editor |
| 10 | **BAC checks pass on complete block** | Block with ≥1 citation and non-empty headingText shows no BAC error |

### Implementation notes

- Items 3–5 extend the existing `keyboard behavior and axe scans pass`
  test step in `tests/e2e/a11y.spec.js`.
- Items 7–8 add new `test()` blocks using `page.emulateMedia()` and
  `page.setViewportSize()`.
- Items 9–10 require BAC to be installed in the Playground blueprint,
  which was added in 1.1.0.

---

## Tier 3 — Manual (human tester required)

These cannot be automated and must be performed by a person using
assistive technology. Schedule before each major release.

### Setup

- Use latest stable macOS + Safari for VoiceOver.
- Use Windows 11 + Firefox + NVDA for screen reader cross-check.
- Use a local WordPress install (not Playground) for reliable AT support.

| # | Check | Steps | Pass criteria |
|---|---|---|---|
| 11 | **VoiceOver — published bibliography** | Navigate published post with VO; use Headings rotor to jump to bibliography section | Section heading announced; each entry read as list item with author/title; DOI/URL links have descriptive text |
| 12 | **VoiceOver — frontend list structure** | Use VO List rotor on published page | List item count announced; entries not announced as generic `div` |
| 13 | **VoiceOver — editor block insertion** | Insert block via VO Commands; navigate toolbar buttons | Block announced on insertion; toolbar buttons have meaningful labels; mode toggle state (aria-pressed) announced |
| 14 | **VoiceOver — citation add flow** | With VO: focus textarea, type BibTeX, activate Add button | Textarea label announced; success/error notice announced (not silent); new entry announced in list |
| 15 | **NVDA — published bibliography** | Same as #11 but NVDA + Firefox | Same pass criteria; verify Forms Mode does not suppress list navigation |
| 16 | **NVDA — editor experience** | Same as #13–14 but NVDA | Block toolbar accessible in NVDA Application/Forms mode; notices announced |
| 17 | **Keyboard — full citation lifecycle** | Without AT: keyboard-only add, reorder (if supported), delete; no mouse | Every action completable; no focus trap; no lost focus |
| 18 | **Zoom 200% — editor** | Set browser zoom to 200% in WP admin; insert block and add citation | No overflow; toolbar wraps gracefully; text readable |
| 19 | **Zoom 400% — editor** | Set browser zoom to 400% | No horizontal scroll; all controls still reachable |
| 20 | **Forced colors — editor** | Enable Windows High Contrast or `prefers-contrast: forced` via DevTools | Entry dividers visible; icons visible; focus ring visible |
| 21 | **Forced colors — frontend** | Same media condition on published post | Citation text readable; links distinguishable |
| 22 | **Motion — respect prefers-reduced-motion** | Enable reduced motion OS preference | No animations or transitions active in block UI |

### Manual test record template

```
Tester:
Date:
WP version:
Browser + version:
AT + version:

| # | Result | Notes |
|---|---|---|
| 11 | PASS/FAIL/PARTIAL | |
...
```

---

## Remediation priority matrix

| Severity | Criteria | Examples |
|---|---|---|
| P0 — blocker | WCAG 2.1 AA failure (axe critical/serious) | Missing label, keyboard trap |
| P1 — high | AT announces incorrect or no information | List not announced, button label missing |
| P2 — medium | Usable but degraded AT experience | Focus lands on wrong element |
| P3 — low | Enhancement / 2.2 / best practice | Motion not suppressed |

---

## Completion criteria

- [x] All Tier 1 checks passing in CI (already green)
- [x] All Tier 2 checks passing in CI (items 3–10 coded and green — confirmed 2026-05-10)
- [ ] Tier 3 manual test record completed and signed off for a release
- [ ] Any P0 or P1 findings remediated before that release ships

## Review notes (2026-05-10)

All Tier 1 and Tier 2 items (1–10) are fully implemented in
`tests/e2e/a11y.spec.js`. No spec changes were required. Automated review
found zero P0/P1 axe violations. Audit record written to
`docs/a11y-audit-records/1.3.1.md`. Tier 3 (manual AT session) remains
outstanding and must be completed before a major release.
