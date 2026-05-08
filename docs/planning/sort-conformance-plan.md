# Sort Conformance & Style-Family Correctness Plan

This document specifies the work to bring Borges' bibliography sort behavior into conformance with citation-style conventions across the three style families (`notes`, `author-date`, `numeric`), establishes a multi-layer test infrastructure for ongoing conformance, and tracks related accessibility improvements surfaced during the same review.

It is structured as a sequence of self-contained requirement tickets (REQ-*) grouped into five sprints plus a deferred epic and a backlog. Each ticket can be lifted directly into the issue tracker.

## Status

- **Drafted:** 2026-05-07
- **Revised:** 2026-05-07 — incorporated Codex review feedback (see revision history at bottom)
- **State:** Ready for sprint planning
- **Owner:** TBD
- **Stakeholders:** Plugin maintainers, accessibility reviewer
- **Canonical path:** `docs/planning/sort-conformance-plan.md`

---

## TL;DR

Borges' current `sortCitations` is binary (`notes` family vs. everything else) and silently mis-sorts numeric-family styles (IEEE, Vancouver), which by their own conventions must preserve order of first citation in text rather than alphabetize. APA's "single-author works precede multi-author works by the same first author" rule is also missing. Same-author / same-year suffix coordination between the JS sorter and citeproc-php is undefined, and the current per-item formatter cache is bibliography-context-insensitive (which makes suffix coordination impossible until the cache is reworked). OSCOLA-style grouped bibliographies are not supported and will be tracked as a separate epic.

This plan refactors `sortCitations` into a three-family dispatch, adds the missing correctness rules, introduces an up/down reorder UI for numeric styles, makes the formatter cache bibliography-context-aware (including reformat orchestration across all mutation paths in the editor), layers in three tiers of conformance tests (snapshot, cross-runner, PHP↔JS coordination including mutation parity), and folds in two accessibility improvements (link aria-labels on saved output with WCAG 2.5.3 label-in-name compliance, and style-aware default heading text) surfaced from user feedback and review. Total estimated effort across five sprints: ~7 weeks.

---

## Sprint plan summary

| Sprint | Theme | Tickets | Effort |
| --- | --- | --- | --- |
| 1 | Foundation & quick wins | T1a, S6, A1, A2, DOC1 | ~1 week |
| 2 | Correctness fixes | S1, S2, S3 | ~1.5 weeks |
| 3 | Conformance hardening + cache rework | T1b, F1, T1c | ~2.5–3 weeks (T1c bumped to M-L for mutation parity) |
| 4 | Suffix handling | S4 | ~1 week |
| 5 | Polish | (per stakeholder decision; see open questions) | ~2–3 days |
| Deferred | OSCOLA grouping | Epic-OSCOLA (S5) | ~2–3 weeks |

Sprint 2 sequencing was revised per Codex feedback: **S1 → S2 → S3** (was S1 → S3 → S2). The numeric mis-sort is the bigger user-visible bug, so S2 ships before the APA refinement.

Sprint dependencies are linear: each sprint depends on the previous. T1a in Sprint 1 is a hard prerequisite for S1 in Sprint 2 because it provides the regression net under the dispatch refactor. REQ-F1 (formatter cache rework) was added to Sprint 3 as a hard prerequisite for both T1c and S4.

---

## REQ-T1a — Snapshot baseline (regression net)

**Sprint:** 1
**Priority:** P0 (gating prerequisite for S1)
**Effort:** S (1 day)
**Risk:** Negligible
**Dependencies:** None
**Blocks:** REQ-S1

### Goal

Lock in the current sort behavior of `sortCitations` as a snapshot fixture so that the family-dispatch refactor in REQ-S1 cannot silently change ordering without an explicit, reviewed diff.

### Behavior

A new test file runs a curated fixture set through `sortCitations` for every registered citation style and records the output via Jest's `toMatchSnapshot()`. Snapshots are committed. Any subsequent PR that changes sort behavior must update snapshots, making the change visible in code review.

### Implementation notes

- New file: `src/lib/sorter.snapshot.test.js`
- Build a fixture set of ~30 citations covering:
  - Single-author, multi-author (2 authors, 3+ authors), corporate (literal) author
  - Editor-only entries (no author)
  - Title-only entries (no author, no editor)
  - Same author, multiple years
  - Same author, same year, different titles
  - Missing date (`csl.issued` undefined)
  - Accented surnames (García, Ångström)
  - Particle surnames (de Beauvoir, van der Berg)
  - Titles with leading articles (The, An, A)
  - Mixed-case titles
- For each style key in `STYLE_DEFINITIONS`, run `sortCitations(fixtures, styleKey)` and snapshot the result (just the `id` array is sufficient).
- Fixture data lives in a separate exported module so REQ-T1b can reuse it.

### Acceptance criteria

- [ ] Snapshot file generated and committed for all 9 currently-registered styles
- [ ] `npm test -- src/lib/sorter.snapshot.test.js` passes on `main` before any other refactor begins
- [ ] CI runs the snapshot suite on every PR
- [ ] Documented in `docs/planning/sort-conformance-plan.md` as the baseline reference

### Files affected

- `src/lib/sorter.snapshot.test.js` (new)
- `src/lib/__fixtures__/sort-fixtures.js` (new) — exported fixture set for reuse

### Test plan

The test itself is the deliverable. No additional manual QA required beyond reviewing the initial snapshot for sanity.

### Baseline reference

The committed baseline snapshot for this requirement is `src/lib/__snapshots__/sorter.snapshot.test.js.snap`, generated from the reusable fixture set in `src/lib/__fixtures__/sort-fixtures.js`. The existing CI unit-test step (`npm test -- --runInBand --silent`) runs this snapshot suite on every pull request.

### Definition of done

Snapshots committed; CI green; review confirmation that snapshot diffs are visible and meaningful in subsequent PRs.

---

## REQ-S6 — Stable secondary sort keys

**Sprint:** 1
**Priority:** P1
**Effort:** XS (a few hours)
**Risk:** Negligible
**Dependencies:** None
**Blocks:** None

### Goal

Make `sortCitations` deterministic across repeated invocations and across save/reload cycles by introducing a stable final tiebreaker.

### Behavior

When all primary, secondary, and tertiary comparators return zero, fall back to the citations' original index in the input array. This guarantees that two identical-looking citations (e.g., the same entry pasted twice, or two minimally-distinguished entries) maintain a predictable order that matches insertion sequence.

### Implementation notes

In `src/lib/sorter.js`:

```js
export function sortCitations(citations, styleKey) {
    const style = getStyleDefinition(styleKey);
    const titleBeforeYear = style.family === 'notes';

    return citations
        .map((citation, originalIndex) => ({ citation, originalIndex }))
        .sort((a, b) => {
            const cmp = compareByFamily(a.citation, b.citation, titleBeforeYear);
            if (cmp !== 0) return cmp;
            return a.originalIndex - b.originalIndex;
        })
        .map(({ citation }) => citation);
}
```

(Implementation pseudocode; structure will be revised under REQ-S1 dispatch refactor.)

### Acceptance criteria

- [ ] Test: Two citations with identical author/year/title produce stable order across 10 repeated `sortCitations` calls
- [ ] Test: Sort order is preserved across `JSON.stringify` / `JSON.parse` round-trip simulating attribute serialization
- [ ] Existing snapshot tests (REQ-T1a) still pass

### Files affected

- `src/lib/sorter.js`
- `src/lib/sorter.test.js`

### Definition of done

All sort calls produce deterministic ordering; tests demonstrate stability under reload simulation.

---

## REQ-A1 — Citation link accessibility (Part 1: aria-labels on saved output)

**Sprint:** 1
**Priority:** P1
**Effort:** S (1–2 days)
**Risk:** Low
**Dependencies:** None
**Blocks:** None

### Goal

URLs inside formatted citation text in **saved/static output** should carry enough accessible context that screen-reader users can identify the publication without having to parse a raw URL string alone.

### Scope correction (per Codex review)

The original draft assumed the editor's `CitationEntryBody` could thread `aria-label`s onto inline anchors. Verification of `src/components/citation-entry-body.js` (lines 73–100) shows that the citation text is rendered inside a `<button type="button">` for entry activation. Putting `<a>` elements inside a `<button>` is invalid HTML and would break the activation interaction.

Therefore A1 Part 1 targets the **saved/static output path only**:

- `src/save-markup.js` is the primary touchpoint
- The editor preview is unchanged (citation text remains inside the activation `<button>`; no anchors generated there)
- A future, separate UI refactor would be needed to make the editor preview produce semantic anchors, and that's tracked as REQ-B4 (see Backlog)

### Background

`src/lib/formatting/index.js` exports `splitTextIntoLinkParts`, which converts URL substrings within formatted citation text into linkable segments. The current segment shape is `{ text: href, href, link: true }` — visible text equals the URL. When rendered as anchors in the saved (frontend) HTML, screen readers announce the URL character-by-character.

### Behavior

In the static save output (`src/save-markup.js`), anchors generated from URL detection in formatted citation text receive an `aria-label` attribute that includes both a descriptive publication label and the visible URL text.

The descriptive portion of the label is, in priority order:

1. The citation's `csl.title` if present
2. The citation's `csl.container-title` if `csl.title` is absent
3. A localized fallback: `__('Link to publication', 'borges-bibliography-builder')`

The accessible name must also include the exact visible URL text to avoid a label-in-name mismatch for speech-input and voice-control users. Recommended label shape: `{descriptive label} — {visible URL}`.

Visible URL text is preserved (sighted users still see the URL, which matches the academic citation convention for transparency). This is purely an additive a11y improvement on the frontend HTML. If manual a11y testing finds that the URL still dominates announcements in target screen readers, escalate to REQ-B6 (configurable link display mode) or REQ-B4 (editor/link UX refactor) rather than replacing the visible URL with an accessible name that omits the visible label.

### Implementation notes

- Update `splitTextIntoLinkParts(text, options = {})` in `src/lib/formatting/index.js` to accept an optional `linkLabel` parameter
- Returned link segments include a `label` field when `linkLabel` is provided
- In `src/save-markup.js`, thread the citation's `csl.title` (or container-title fallback) down as `linkLabel`
- In `src/save-markup.js`, compose the final anchor `aria-label` from the descriptive label plus the exact visible URL (`${label} — ${href}`), rather than using the descriptive label alone
- The editor preview path (via `CitationEntryBody`) is **not** modified in this ticket — its `<button>`-based activation stays as-is
- Stored block attributes are unchanged; no `deprecated.js` migration is required
- Confirm that `aria-label` containing the title and visible URL doesn't introduce localization or HTML-escaping issues; titles may contain quotation marks and unicode

### Acceptance criteria

- [ ] Unit test: `splitTextIntoLinkParts('See https://example.org/foo', { linkLabel: 'Some Title' })` returns a link segment with `label: 'Some Title'`
- [ ] Unit test: omitting `linkLabel` falls back to no label (existing behavior preserved); the consumer in `save-markup.js` provides the `'Link to publication'` fallback at the render layer
- [ ] Save output test: `save-markup.js` emits an `<a>` element with `aria-label` containing the citation title and the visible URL text
- [ ] Save output test: when title is absent, `aria-label` falls back to container-title, then to the localized "Link to publication"
- [ ] Save output test: voice-control label-in-name requirement is preserved — the accessible name includes the exact visible URL text
- [ ] Editor preview behavior is **unchanged** — verified by existing `citation-entry-body.test.js` continuing to pass without modification
- [ ] Manual screen reader verification on the saved frontend output: NVDA on Windows + VoiceOver on macOS announce the publication context along with the URL, and speech-input targetability remains acceptable — captured in `docs/a11y-audit-records/`

### Files affected

- `src/lib/formatting/index.js`
- `src/lib/formatting/index.test.js`
- `src/save-markup.js`
- `src/save.test.js` (the actual test home for save output; `save-markup.test.js` does not exist)
- `docs/a11y-audit-records/2026-05-link-aria-labels.md` (new)
- `docs/qa-matrix-checklist.md` (Accessibility section addition)

### Test plan

In addition to unit and save-output tests, add a manual screen-reader pass to the QA matrix checklist (`docs/qa-matrix-checklist.md`) under a new "Accessibility" section. The pass is performed against a published post on the frontend, not the editor preview.

### Definition of done

Citation URL anchors carry contextual `aria-label`s in saved frontend output without omitting the visible URL from the accessible name; all tests pass; manual screen-reader test recorded; editor preview behavior unchanged.

---

## REQ-A2 — Style-aware default visible heading

**Sprint:** 1
**Priority:** P1
**Effort:** XS–S (half-day to 1 day)
**Risk:** Low
**Dependencies:** REQ-T1a (so existing snapshot diffs are visible)
**Blocks:** None

### Goal

Newly inserted Bibliography blocks should start with a useful visible heading matching the selected citation style, reducing accessibility (heading hierarchy) warnings by default and improving the out-of-box editor experience. Existing saved blocks with empty headings remain empty (no behavior change for stored content).

### Behavior

- A freshly inserted Bibliography block has `headingText` set to the registry's `headingPlaceholder` for the active style at insertion time. For the default Chicago Notes-Bibliography style, that's `"Bibliography"`. For MLA, `"Works Cited"`. For APA, Chicago Author-Date, Harvard, IEEE, and Vancouver, `"References"`. For ABNT, the localized default is `"Referências"`.
- `block.json` keeps `headingText.default` as `""` to preserve the current behavior for already-saved posts; the default heading is supplied via a registered block variation, not the schema default.
- On style change in the inspector:
  - If the current `headingText` matches the **previous** style's default, update it to the new style's default
  - If the current `headingText` is custom (user-edited) or blank (user-cleared), preserve it
- Save output behavior is unchanged — `save.js` continues to emit a heading only when `headingText` is non-empty.

### Implementation notes

- Add `getDefaultHeadingText(styleKey)` to `src/lib/formatting/style-registry.js`. Initial implementation can simply return `getStyleDefinition(styleKey).headingPlaceholder` since those values already encode style-appropriate defaults.
- In `src/index.js`, register a default block variation:

  ```js
  registerBlockType(metadata.name, {
      edit: Edit,
      deprecated,
      save,
      variations: [
          {
              name: 'default',
              isDefault: true,
              attributes: {
                  citationStyle: DEFAULT_CITATION_STYLE,
                  headingText: getDefaultHeadingText(DEFAULT_CITATION_STYLE),
              },
          },
      ],
  });
  ```

- Extend `handleCitationStyleChange` in `src/hooks/use-citation-editor-state.js` to:
  1. Capture the previous style's default heading
  2. Compute the next style's default heading
  3. Only overwrite `headingText` when the current value equals the previous default (preserves both custom-edited and explicitly-blanked values)

- Do **not** add automatic heading inference inside `save()` — output remains heading-text driven.

### Acceptance criteria

- [ ] Freshly inserted block (default Chicago Notes-Bibliography) has `headingText` set to `"Bibliography"`
- [ ] Switching from default Chicago Notes-Bibliography to MLA, with the heading still untouched, updates the heading to `"Works Cited"`
- [ ] User clearing the heading then switching style preserves the blank heading
- [ ] User typing a custom heading then switching style preserves the custom text
- [ ] Existing saved blocks with blank `headingText` do not gain new frontend output (verified via `parse-store-render.integration.test.js`)
- [ ] Block Accessibility Checker (BAC) heading-warning does not fire for a newly inserted default block once citations exist (manual verification step in QA matrix)
- [ ] No `deprecated.js` migration is required (verified by running existing deprecated-handler tests)

### Files affected

- `src/lib/formatting/style-registry.js`
- `src/lib/formatting/style-registry.test.js`
- `src/index.js`
- `src/hooks/use-citation-editor-state.js`
- `src/hooks/use-citation-editor-state.test.js`
- `docs/qa-matrix-checklist.md` (BAC verification row)

### Test plan

- Unit test for `getDefaultHeadingText` covering all registered styles
- Hook test for `handleCitationStyleChange` covering: untouched-default → switch, custom-text → switch, blank → switch
- Integration test verifying a freshly inserted block from the inserter has the expected default heading
- Manual QA: insert block, observe heading; switch style, observe heading update; type custom heading, switch style, observe preservation

### Definition of done

New blocks ship with style-appropriate headings; style switches respect user customization; no impact on stored content; BAC warnings reduced by default.

---

## REQ-DOC1 — OSCOLA grouped-bibliography known-limitation note

**Sprint:** 1
**Priority:** P1
**Effort:** XS (half-day)
**Risk:** Negligible
**Dependencies:** None
**Blocks:** None

### Goal

Make the current OSCOLA limitation (single flat alphabetized list, no source-type grouping) explicit and discoverable in the README, the style registry, and the editor inspector, so users selecting OSCOLA know the limitation up front and Epic-OSCOLA has a clear hook point for future removal.

### Behavior

Three coordinated additions:

1. **README sections.** Add a "Known limitations" section to both `README.md` and `readme.txt` (or extend existing sections) noting that OSCOLA bibliographies are rendered as a single alphabetized list and that source-type grouping is tracked as a future epic. The WordPress.org `readme.txt` copy matters because most plugin-directory users will see that surface first.
2. **Inline code comment.** In `src/lib/formatting/style-registry.js`, at the OSCOLA entry, add a `// TODO(Epic-OSCOLA):` comment referencing the planning doc and the limitation.
3. **Editor inspector notice.** In `src/edit.js`, when `citationStyle === 'oscola'`, render a dismissible (per-session) `Notice` in the inspector under the style select, reading: `__('OSCOLA convention groups bibliographies by source type (cases, legislation, books, articles, online). Borges currently renders a single alphabetized list. See Epic-OSCOLA for tracking.', 'borges-bibliography-builder')`.

### Implementation notes

- Use the existing `Notice` component (already imported as part of REQ-A1's accessibility wave, or imported fresh)
- The inspector notice uses `isDismissible={true}` and tracks dismissal via per-block transient state (not persisted attribute) so users see it once per editor session per block
- README sections should also link to `docs/planning/sort-conformance-plan.md` for context where the target format allows links

### Acceptance criteria

- [ ] `README.md` has a "Known limitations" section that explicitly mentions the OSCOLA grouping gap and links to this plan
- [ ] `readme.txt` has equivalent WordPress.org-facing wording that explicitly mentions the OSCOLA grouping gap
- [ ] `src/lib/formatting/style-registry.js` has an inline `// TODO(Epic-OSCOLA):` comment at the OSCOLA entry
- [ ] Selecting OSCOLA in the inspector surfaces the limitation notice; dismissing it within the session does not re-show it for that block
- [ ] No save-output behavior change
- [ ] Snapshot tests unaffected
- [ ] When Epic-OSCOLA ships, this note is removed in the same PR (cross-reference recorded in Epic-OSCOLA's scope)

### Files affected

- `README.md`
- `readme.txt`
- `src/lib/formatting/style-registry.js`
- `src/edit.js`
- `src/edit.test.js`

### Definition of done

Limitation visible in README, code, and editor; users selecting OSCOLA see the notice; Epic-OSCOLA has a clean removal hook.

---

## REQ-S1 — Three-family sort dispatch refactor

**Sprint:** 2
**Priority:** P0
**Effort:** S (1–2 days)
**Risk:** Low (well-bounded, snapshot-protected)
**Dependencies:** REQ-T1a
**Blocks:** REQ-S2, REQ-S3, REQ-S4, REQ-T1b

### Goal

Refactor `sortCitations` from a binary `notes` / non-notes flag into a proper three-way dispatch on `style.family`. Establishes the architecture that REQ-S2, S3, and S4 build on.

### Behavior

After this ticket, sort behavior per family is:

| Family | Behavior |
| --- | --- |
| `notes` | author → title → year (current behavior, preserved) |
| `author-date` | author → year → title (current behavior, preserved; refined in S3) |
| `numeric` | No comparator-based sort. Returns input order with stable tiebreak. |

Public API of `sortCitations(citations, styleKey)` is unchanged.

### Implementation notes

Restructure as a comparator-factory:

```js
function getComparatorFor(family) {
    switch (family) {
        case 'notes': return compareNotes;
        case 'author-date': return compareAuthorDate;
        case 'numeric': return null;
        default: return compareAuthorDate; // safe default
    }
}

export function sortCitations(citations, styleKey) {
    const style = getStyleDefinition(styleKey);
    const comparator = getComparatorFor(style.family);
    if (comparator === null) {
        return [...citations]; // numeric: preserve order, return shallow copy
    }
    // ...stable-tiebreak wrapper from REQ-S6...
}
```

The `useEffect` in `src/edit.js` (lines 209–222) that re-sorts on attribute change must skip work for numeric family — otherwise REQ-S2's user-initiated reorders get clobbered. Add a guard:

```js
useEffect(() => {
    const family = getStyleDefinition(citationStyle).family;
    if (family === 'numeric') return; // user controls order
    // ...existing sort-and-set logic...
}, [...existing deps...]);
```

### Acceptance criteria

- [ ] All REQ-T1a snapshots pass (no behavior change for notes / author-date)
- [ ] New test: IEEE-styled citation list of 5 entries passes through `sortCitations` unchanged
- [ ] New test: Vancouver list of 5 entries passes through unchanged
- [ ] New test: Switching style from numeric → author-date triggers sort on next attribute write
- [ ] New test: Switching style from author-date → numeric does not re-sort entries already in place
- [ ] No changes to public API of `sortCitations`

### Files affected

- `src/lib/sorter.js`
- `src/lib/sorter.test.js`
- `src/edit.js`
- `src/edit.test.js`

### Definition of done

Three-family dispatch in place; numeric-family sort is a no-op; existing snapshot tests pass; new tests cover all three families' behavior.

---

## REQ-S3 — APA single-author-first rule

**Sprint:** 2
**Priority:** P1
**Effort:** S (1 day)
**Risk:** Low
**Dependencies:** REQ-S1
**Blocks:** None

### Goal

Within `author-date` family, correct the sort so single-author works precede multi-author works that share the same first author.

### Behavior

Per APA 7 §9.46 and Chicago Author-Date §15.18: when two works share the same first author, the work authored solely by that author comes before any work co-authored with others. Among multi-author works sharing the same first author, sort by second author's surname (or third, etc., if second is also tied).

After the author chain is resolved, continue with year, then title, as in the existing author-date logic.

### Concrete example

| First author | Coauthors | Year | Expected position |
| --- | --- | --- | --- |
| Smith, A. | (solo) | 2020 | 1 |
| Smith, A. | Adams, B. | 2018 | 2 |
| Smith, A. | Adams, B. | 2022 | 3 |
| Smith, A. | Brown, C. | 2019 | 4 |
| Smith, A. | Brown, C., Davis, D. | 2017 | 5 |
| Tanaka, K. | (solo) | 2020 | 6 |

Note that 2018 (multi-author, Adams) precedes 2020 (solo) is wrong — solo Smith outranks any multi-author Smith regardless of year. After the solo Smith comes Smith+Adams 2018 then Smith+Adams 2022 (year), then Smith+Brown variants (sorted by their respective second-author chains).

### Implementation notes

**Contributor key correction (per Codex review):** family-only comparison is insufficient. "Smith, Alice" and "Smith, Bob" must not be treated as the same author for solo-first / chain-compare purposes. Build a normalized contributor key from `family + given + literal`, all lowercased and trimmed, before applying solo-first and chain-compare logic.

In `src/lib/sorter.js`:

```js
function normalizeContributorKey(contributor) {
    const family = (contributor.family || '').trim().toLowerCase();
    const given = (contributor.given || '').trim().toLowerCase();
    const literal = (contributor.literal || '').trim().toLowerCase();
    // Family + given for personal names; literal for corporate authors.
    return family ? `${family}|${given}` : literal;
}

function getAuthorChain(csl) {
    const contributors = (csl.author?.length ? csl.author : csl.editor) || [];
    return contributors.map(normalizeContributorKey);
}

function compareAuthorChain(a, b) {
    // First-author compare on full normalized key (family + given), not just family
    const firstCmp = (a[0] || '').localeCompare(b[0] || '', undefined, { sensitivity: 'base' });
    if (firstCmp !== 0) return firstCmp;

    // Solo-first rule: when first authors match by full key, shorter chain wins
    if (a.length !== b.length) {
        if (a.length === 1) return -1;
        if (b.length === 1) return 1;
    }

    // Compare remaining chain (each entry is a full normalized key)
    for (let i = 1; i < Math.min(a.length, b.length); i++) {
        const cmp = a[i].localeCompare(b[i], undefined, { sensitivity: 'base' });
        if (cmp !== 0) return cmp;
    }
    return a.length - b.length;
}
```

**Note on display vs. sort:** the visible bibliography label (e.g., "Smith, A.") uses only the family name with an initial; the sort uses the full normalized key. This means "Smith, Alice 2020" and "Smith, Bob 2020" sort as distinct authors but display similarly — a known and intentional consequence. In real bibliographies they'd typically display "Smith, A. (2020a)" and "Smith, B. (2020)" which disambiguates visually.

This rule applies to `author-date` family only. The `notes` family preserves the existing first-author-only logic.

### Acceptance criteria

- [ ] Test: Smith solo / Smith+Adams / Smith+Brown / Smith+Brown+Davis sort in expected order under author-date
- [ ] Test: Same first author + same coauthor + different years → year breaks the tie correctly
- [ ] Test: Same first author + same year + different coauthors → coauthor surname breaks tie
- [ ] **Test: Two single-author works with the same family name but different given names ("Smith, Alice" vs "Smith, Bob") sort by given name, not collapse together**
- [ ] Test: Corporate author (literal) does not collide with personal author of the same surname (verified via the `literal`-vs-`family` branch in `normalizeContributorKey`)
- [ ] Test: Notes-family sort behavior unchanged (existing fixtures pass)
- [ ] Snapshot diff is reviewed and approved as intentional

### Files affected

- `src/lib/sorter.js`
- `src/lib/sorter.test.js`
- `src/lib/sorter.snapshot.test.js` (snapshot diff expected)

### Definition of done

APA-correct sort under author-date family; tests cover single/multi-author tiebreaks; snapshot diff documented.

---

## REQ-S2 — Numeric-family ordering UX (up/down controls)

**Sprint:** 2
**Priority:** P0 (fixes user-visible IEEE/Vancouver bug)
**Effort:** M (3–5 days)
**Risk:** Low (additive UI; behavior gated by family)
**Dependencies:** REQ-S1
**Blocks:** None

### Goal

Give users explicit, accessible control over numeric-family entry order, since auto-sort is wrong for IEEE, Vancouver, and other numeric styles.

### Behavior

When the active citation style has `family === 'numeric'`:

1. Each citation entry displays up and down arrow controls (in addition to existing entry actions)
2. The up arrow is disabled on the first entry; the down arrow is disabled on the last entry
3. Clicking up swaps the entry with its predecessor; down swaps with its successor
4. After a swap, focus stays on the moved entry
5. Screen readers announce the new position via the existing `announce()` mechanism — for example: "Moved 'Smith 2020' to position 3 of 7"
6. Keyboard shortcut: with focus on an entry, `Alt+ArrowUp` and `Alt+ArrowDown` perform the same swaps
7. Inspector help text under the Citation Style select control reads (when numeric is active): "IEEE/Vancouver: arrange entries to match the order they're first cited in your text."

When the active citation style has `family !== 'numeric'`, the up/down controls are not rendered and keyboard shortcuts are inactive.

### Implementation notes

- New component: `src/components/citation-reorder-controls.js` — renders the two arrow buttons; props: `{ canMoveUp, canMoveDown, onMoveUp, onMoveDown, label }`
- Extend `CitationEntryBody` to conditionally render `CitationReorderControls` based on the family of the active style
- New hook: `src/hooks/use-citation-reorder.js` — exposes `moveCitationUp(id)` and `moveCitationDown(id)` that mutate the citations array and call `setAttributes`
- Add keyboard handler to the citation list item in `src/components/citation-entry-body.js`: detect `Alt+ArrowUp`/`Alt+ArrowDown`, call the appropriate move function, prevent default
- Re-use the existing `announce()` mechanism from `useBlockNotices` for screen-reader feedback
- Aria labels: arrows must have descriptive labels — `__('Move citation up', 'borges-bibliography-builder')` and `__('Move citation down', 'borges-bibliography-builder')`. Consider richer labels using the citation's display text when available — `Move 'Smith 2020' up`

### Stretch — DEFERRED to backlog (per Codex review)

The original draft included a "Renumber from current order" inspector button described as triggering "a re-format pass that emits the reference numbers in the formatted text." Verification of `bibliography-builder.php` shows that `bibliography_builder_normalize_formatted_text()` deliberately strips numeric prefixes (`[1]` and `1.`) from formatted text for numeric-family styles, with the visual numbering supplied by `<ol>` semantics on the frontend. There is no number in the formatted text to renumber.

Two options were considered for re-spec:

1. **Rename to "Confirm current order"** — pure UX affordance with snackbar confirmation only. Adds nothing functional but signals to users that their chosen order is intentional.
2. **Defer entirely** — the up/down controls already let users assert order; the explicit confirm button has no behavior beyond a snackbar.

Decision: **defer entirely.** Tracked as REQ-B5 in the backlog. Revisit only if user research surfaces a need for an explicit "lock" action — and at that point, design language ("Confirm" or "Lock order") and behavior need re-specification.

### Acceptance criteria

- [ ] IEEE list: up/down arrows render on each entry; first entry's up is disabled; last entry's down is disabled
- [ ] Author-date list: arrows do not render; keyboard shortcuts inactive
- [ ] Click up/down: entries swap; attribute write occurs; focus stays on the moved entry
- [ ] Keyboard `Alt+ArrowUp`/`Alt+ArrowDown` performs the same swaps
- [ ] Screen reader announces position changes (manual a11y verification)
- [ ] After reorder, save and reload editor: order persists
- [ ] Numeric insertion order is not changed or clobbered; `sortCitations` may still be called, but it must behave as a no-op for numeric-family styles

### Files affected

- `src/components/citation-reorder-controls.js` (new)
- `src/hooks/use-citation-reorder.js` (new)
- `src/components/citation-entry-body.js`
- `src/edit.js`
- `src/edit.test.js`
- `src/components/citation-entry-body.test.js`
- `src/hooks/use-citation-reorder.test.js` (new)
- `tests/playwright/numeric-reorder.spec.js` (new)

### Test plan

- Jest unit tests for the reorder hook and controls component
- Jest editor test verifying conditional rendering by family
- Playwright E2E: insert 3 citations in IEEE mode, reorder via buttons, save, reload, verify order
- Manual screen reader QA: NVDA + VoiceOver verify position announcements
- QA matrix checklist update: add "Numeric reorder" section

### Definition of done

User can reorder numeric-family citations via mouse and keyboard; reorder persists; accessibility verified; tests cover all behavior gates.

---

## REQ-T1b — Cross-runner conformance tests

**Sprint:** 3
**Priority:** P1
**Effort:** M (1 week)
**Risk:** M (citeproc-js initialization complexity)
**Dependencies:** REQ-S1, REQ-S2, REQ-S3
**Blocks:** REQ-S4

### Goal

Verify that Borges' sort order matches what citeproc-js (the de-facto reference implementation of CSL in JavaScript) produces for the same inputs and styles.

### Behavior

A new test suite runs each fixture through both Borges' `sortCitations` and citeproc-js's bibliography pipeline, then asserts that the resulting order is identical. This catches sort divergences without requiring manual curation of "correct" orderings — citeproc-js serves as the reference oracle.

### Implementation notes

- Add `citeproc` (citeproc-js) as a dev dependency: `npm install --save-dev citeproc`
- New file: `src/lib/sorter.conformance.test.js`
- For each registered style:
  1. Load the corresponding CSL XML from `packages/citation-style-language-styles/`
  2. Initialize citeproc-js with the style and `en-US` locale (or per-style locale)
  3. Feed it the fixture set from REQ-T1a
  4. Capture citeproc's bibliography output order
  5. Run Borges' `sortCitations` on the same fixtures
  6. Assert the two orderings match
- Numeric-family styles are excluded from this test (citeproc-js may impose its own order; Borges intentionally doesn't sort)
- Test failures should surface a readable diff of the two orderings, not just a length mismatch

### Known complications

- citeproc-js requires synchronous file system access for style/locale loading in Node; the test setup needs to provide a `retrieveLocale` and `retrieveItem` callback against the bundled CSL packages
- Some styles may have non-trivial bibliography sort directives in their CSL XML that interact with our flat sort. For styles where citeproc applies grouping (e.g., OSCOLA), the test must opt out or compare per-section
- citeproc-js version pinning matters: future upgrades may shift behavior

### Acceptance criteria

- [ ] Conformance test suite runs against all `notes` and `author-date` family styles
- [ ] Numeric styles are explicitly skipped with a documented reason
- [ ] OSCOLA is skipped (will be re-enabled in Epic-OSCOLA when grouping lands)
- [ ] All currently-supported styles pass (or the discrepancies are documented as known issues with REQ-* tickets)
- [ ] Failing tests produce readable diffs

### Files affected

- `package.json` (dev dependency)
- `src/lib/sorter.conformance.test.js` (new)
- `src/lib/__test-utils__/citeproc-runner.js` (new) — reusable runner with file-system fixtures

### Definition of done

Cross-runner agreement verified for all non-grouping, non-numeric styles; CI runs the suite on every PR; any discovered divergences are tracked.

---

## REQ-F1 — Bibliography-context-aware formatter cache

**Sprint:** 3
**Priority:** P0 (gating prerequisite for T1c and S4)
**Effort:** M (3–5 days)
**Risk:** M (touches a hot path; needs careful cache invalidation)
**Dependencies:** REQ-S1
**Blocks:** REQ-T1c, REQ-S4

### Goal

Rework the citation formatter cache in `src/lib/formatting/csl.js` so that bibliography-context-dependent formatting (most importantly: same-author/same-year suffix assignment under `author-date` and `notes` families) cannot return stale per-item results when other items in the bibliography would change the suffix or numbering citeproc-php would emit.

### Background (per Codex review)

The current cache shape:

```js
// src/lib/formatting/csl.js (current)
function getCachedFormat(cacheKey) { /* ... */ }
function setCachedFormat(cacheKey, formatted) { /* ... */ }
// cacheKey = getFormatCacheKey(csl, styleKey)
```

Cache keys are `(individual CSL item, styleKey)`. Suffix assignment (`a`/`b`/`c`) is bibliography-context-dependent: citeproc-php inspects the whole list of items to decide whether any disambiguation suffixes are needed. With per-item caching, this happens:

1. User adds Smith 2020 "Alpha" — cached without suffix
2. User adds Smith 2020 "Beta" — citeproc would emit `Smith 2020a` and `Smith 2020b`
3. The "Alpha" entry hits cache and returns its old suffix-less formatted text
4. The "Beta" entry, being uncached, gets formatted in the context of one item only — also no suffix
5. The bibliography displays neither suffix; the disambiguation that academic styles require is lost

Numeric-family numbering is similar in principle but moot in practice because `bibliography_builder_normalize_formatted_text()` strips numeric prefixes from formatted text (the `<ol>` provides the visible number). However, any future feature that depends on numeric formatting being context-sensitive would hit the same problem.

### Behavior

After REQ-F1, the cache is keyed by **the entire ordered bibliography**, not per item. Two viable strategies:

**Strategy A — bibliography-batch cache (recommended).**
- Cache key: stable key for `(ordered list of CSL items, styleKey, locale)`
- Cache value: the array of formatted strings for that bibliography
- Cache invalidates whenever any item changes, is added, removed, or reordered

**Strategy B — opt-out for context-sensitive formats.**
- Detect that a sort is happening on a family where suffixes can apply (i.e., not `numeric` since prefixes are stripped)
- For those families, bypass the cache entirely and always do a fresh PHP formatter call
- For numeric, retain per-item cache (it's safe under current behavior)

Recommendation: implement Strategy A, since it handles all current and future context-sensitive cases without family-specific branching. Strategy B is documented as a fallback if the bibliography-level cache turns out to have unacceptable cache-miss rates in practice (the common case — adding one entry to a stable bibliography — would invalidate the whole cache, which is the trade-off).

### Implementation notes

- Replace `FORMAT_CACHE` (per-item LRU `Map`) with `BIBLIOGRAPHY_CACHE`, keyed by a stable serialization of the ordered-items + style + locale tuple
- Cache-key function: stable JSON serialization of the items with canonical key order is sufficient. Do **not** depend on `crypto.subtle.digest` in the editor: WordPress admin often runs on local HTTP during development, `crypto.subtle` can be secure-context-dependent, and the cache key does not need cryptographic strength. If the serialized key becomes too large in practice, use a small synchronous deterministic JS hash over the stable string.
- Maintain the same LRU eviction behavior as the existing cache (move-to-front on access; size cap)
- Existing public API of `formatBibliographyEntries` is unchanged — callers see the same input/output shape
- The `getFormatCacheKey(csl, styleKey)` function is removed (or kept private but no longer used externally)
- All call sites of `formatBibliographyEntries` audited to confirm they pass the **full** current bibliography, not a single item, when format context matters; for the `formatSingleEntry` path, document that single-entry calls do not benefit from disambiguation and should be used only when the caller is intentionally formatting in isolation
- **`formatSingleEntry` audit deliverable:** before changing the cache, run an explicit `git grep formatSingleEntry` (and any equivalent single-item helpers) to catalog every call site. For each, classify as either (a) safe — caller never affects the visible bibliography output, e.g., transient previews, or (b) unsafe — caller writes back into stored citations and must be migrated to the batch path. The audit findings live in the F1 PR description so reviewers can verify nothing was missed.
- Mutation-path orchestration is part of this ticket, not a follow-up: add/import, manual add, structured edit, delete, and style-change flows must reformat the full current bibliography for context-sensitive families and update all affected `formattedText` values before writing `citations` back to block attributes. Otherwise the cache can be correct while callers still leave stale suffixes after adds/deletes/edits.
- **`deferFormatting: true` interaction:** the existing `parsePastedInput(input, style, { deferFormatting: true })` flow in `handleParse` (`src/edit.js` ~lines 239–305) currently formats only the *newly-parsed unique entries* via `formatBibliographyEntries(uniqueEntries.map(c => c.csl), citationStyle)`. Under F1, that single call must be replaced with a full-bibliography reformat over `[...citationsRef.current, ...uniqueEntries]` so the new entries see the existing context and any existing entries whose suffixes change pick up the new values. The `deferFormatting` flag itself can stay (it's a parser concern, not a formatter concern), but the post-parse formatting step changes shape: it now reformats the merged list and re-distributes `formattedText` across both pre-existing and newly-added citations before the `setAttributes({ citations: updated })` write.
- For numeric-family styles, preserve the S1/S2 invariant: reformatting must not reorder user-controlled citation order, and numeric prefixes remain stripped from formatted text while `<ol>` supplies visible numbering.
- Add a new test file `src/lib/formatting/csl.context-cache.test.js` covering:
  - Adding a Smith 2020 entry to a bibliography that already contains another Smith 2020 invalidates the prior cache
  - Reordering entries invalidates cache
  - Style or locale change invalidates cache
  - Identical bibliographies produce cache hits (including key-order-insensitive equality of CSL objects)
- `src/lib/formatting/csl.runtime.test.js` (existing LRU eviction tests) updated to reflect the new cache key shape

### Acceptance criteria

- [ ] `BIBLIOGRAPHY_CACHE` (or equivalent) replaces `FORMAT_CACHE`; cache key includes the full ordered item list
- [ ] Existing tests in `src/lib/formatting/csl.test.js` pass after key-shape adaptation
- [ ] LRU eviction tests in `src/lib/formatting/csl.runtime.test.js` pass after key-shape adaptation
- [ ] New test: adding Smith 2020 "Beta" to a bibliography containing Smith 2020 "Alpha" produces both formatted strings reflecting whatever suffix assignment citeproc-php emits (test uses real or mocked PHP formatter — see Test plan)
- [ ] New test: reordering entries invalidates cache and produces fresh formatted output
- [ ] New test: changing style or locale invalidates cache
- [ ] New test: add/manual/edit/delete/style-change mutation paths pass the full current bibliography into formatting and update all affected `formattedText` values for suffix-sensitive styles
- [ ] New test: deleting one item from a same-author/same-year group reformats the remaining entries so obsolete suffixes are removed or adjusted
- [ ] No regression in editor performance for typical bibliography sizes (≤50 entries) — measured via `src/benchmarks/performance-benchmark.test.js` extension
- [ ] **Cache-miss benchmark target:** adding one entry to a 50-entry bibliography in a context-sensitive style (e.g., Chicago Author-Date) completes the resulting full re-format and attribute write within 500 ms on the benchmark hardware baseline. Bibliography-batch caching invalidates the whole cache on every mutation, so cache-miss latency — not cache-hit latency — is the realistic editor-experience bound. If the budget is exceeded, escalate to Strategy B (numeric-only retains per-item cache) or document the regression for stakeholder review before merging.
- [ ] `formatSingleEntry` audit findings recorded in the F1 PR description: every call site classified as safe (transient/isolated) or migrated to the batch path

### Files affected

- `src/lib/formatting/csl.js`
- `src/lib/formatting/csl.test.js`
- `src/lib/formatting/csl.runtime.test.js`
- `src/lib/formatting/csl.context-cache.test.js` (new)
- `src/edit.js`
- `src/hooks/use-citation-editor-state.js`
- `src/hooks/use-citation-editor-state.test.js`
- `src/benchmarks/performance-benchmark.test.js` (cache-invalidation benchmark addition)

### Test plan

- Unit tests use a mocked PHP formatter that returns suffixes when given multiple matching items
- Editor/hook tests cover full-bibliography reformat orchestration on add/import, manual add, structured edit, delete, and style change
- A subset of the conformance fixtures from REQ-T1b are reused here to verify cache behavior under realistic loads
- Performance benchmark: format a 50-entry bibliography 100 times; cache-hit case should remain at sub-100ms

### Definition of done

Cache is bibliography-context-aware; suffix-sensitive cases produce correct results; no performance regression; T1c and S4 can proceed without cache-induced false negatives.

### Related — T1c scope implication

With F1 driving full-bibliography reformats on every mutation, REQ-T1c's coordination tests should not stop at static-input parity. Suffix correctness depends on every mutation step (add, edit, delete, reorder, style change) producing a JS-formatted bibliography whose suffixes match what citeproc-php would emit if asked to format the post-mutation list from scratch. T1c's spec currently exercises fixture-in / formatted-out comparison only.

Two ways to handle this without bloating T1c:

1. **Extend T1c** to include mutation sequences (e.g., "start with N entries, add M more, verify post-mutation suffixes match PHP"). Modest fixture work; keeps the conformance story in one ticket.
2. **Split into T1c (static parity) + T1d (mutation parity)** as a follow-up. Cleaner ticket boundaries; mutation parity could ship alongside or after S4.

Recommendation: extend T1c. The fixtures from F1's mutation tests can be reused as T1c mutation cases without authoring new ones, and keeping coordination work in one ticket reduces the risk that mutation parity slips between tickets. T1c's effort estimate may need to bump from M (1 week) to M-L (1.5 weeks) if extended.

---

## REQ-T1c — PHP↔JS coordination tests

**Sprint:** 3
**Priority:** P1
**Effort:** M-L (~1.5 weeks; was M/1 week — bumped to cover mutation parity per F1 cross-reference)
**Risk:** M (cross-language test infrastructure)
**Dependencies:** REQ-T1b, REQ-F1
**Blocks:** REQ-S4

### Goal

Verify that the sort order produced by Borges' JS sorter agrees with the suffix order assigned by citeproc-php when formatting the same bibliography. This is required before REQ-S4 (Option D) can be safely shipped.

### Behavior

A test setup runs the same fixture set through:

1. Borges' JS `sortCitations` → produces an ordered list
2. The PHP `/format` REST endpoint (or citeproc-php directly) → produces formatted strings with `a`/`b`/`c` suffixes embedded

The test asserts that the JS sort order matches the order in which citeproc-php assigned suffixes (i.e., the entry that JS places first among Smith-2020s should be the one PHP labels `2020a`).

### Mutation parity (per F1 cross-reference)

Beyond static fixture parity, T1c also covers mutation parity: for every mutation flow F1 orchestrates (add, manual add, structured edit, delete, reorder, style change), the post-mutation JS-formatted bibliography must produce suffixes consistent with what citeproc-php would emit if asked to format the post-mutation list from scratch. This catches the failure mode where the cache and the formatter agree on static input but disagree after a sequence of edits — exactly the scenario F1 is built to prevent.

Implementation: reuse F1's mutation-test fixtures in T1c rather than authoring parallel ones. Each mutation fixture becomes `before-state` + `mutation` + `after-state-expected-suffixes`, and T1c runs both languages through the same mutation sequences.

This expansion bumps T1c's effort estimate from M (1 week) to M-L (~1.5 weeks). If schedule pressure forces a split, mutation parity can move to a follow-up REQ-T1d shipping alongside or after S4, but the recommended path is to keep coordination work in one ticket.

### Implementation notes

- Shared fixture: `tests/fixtures/sort-coordination/cases.json` — JSON file with citation arrays and expected suffix mappings
- Shared mutation fixture: `tests/fixtures/sort-coordination/mutations.json` — reuses F1's mutation cases; each entry has `before`, `mutation`, and `expected_after_suffixes`
- PHP test: extends existing PHPUnit suite. New file `tests/phpunit/SortCoordinationTest.php` reads the JSON fixtures, runs them through the formatter, captures suffix assignments per item.
- JS test: new file `src/lib/sorter.coordination.test.js` reads the same JSON, runs `sortCitations`, captures sort order, looks up expected suffix from the fixture's expected mapping, and asserts that fixture-mapped suffixes match the JS sort order.
- Mutation tests: a small harness in both PHP and JS that applies each mutation step and re-checks suffix parity at every step
- A small Node CLI script (`scripts/verify-sort-coordination.js`) runs both languages' tests and produces a unified report
- Add to CI: both PHP and JS coordination tests run on every PR

### Acceptance criteria

- [ ] Static fixture JSON file with at least 10 cases (single-suffix, multi-suffix, three-way ties, edge cases like identical metadata)
- [ ] Mutation fixture JSON file with at least 5 sequences (add into matching group, delete from matching group, reorder, style change, edit changing a metadata field that affects suffix assignment)
- [ ] PHPUnit test reads static fixtures and produces suffix-assignment output
- [ ] PHPUnit test reads mutation fixtures and verifies suffix output at every step
- [ ] Jest test reads same static fixtures and verifies JS sort order is consistent with the fixture's expected suffix mapping
- [ ] Jest test reads same mutation fixtures and verifies JS-formatted suffixes after each mutation step match PHP
- [ ] CI runs all halves; failure in any fails the build
- [ ] At least one deliberately-misconfigured test case validates that the harness catches divergence (sanity check)

### Files affected

- `tests/fixtures/sort-coordination/cases.json` (new)
- `tests/phpunit/SortCoordinationTest.php` (new)
- `src/lib/sorter.coordination.test.js` (new)
- `scripts/verify-sort-coordination.js` (new)
- `composer.json`, `package.json` (script entries)
- `.github/workflows/ci.yml` (coordination job)

### Definition of done

JS and PHP agreement on sort/suffix assignment is automatically verified; CI gates merges on this agreement.

---

## REQ-S4 — Same-author/same-year suffix-aware sort (Option D)

**Sprint:** 4
**Priority:** P1
**Effort:** M (1 week)
**Risk:** M (locale/normalization parity)
**Dependencies:** REQ-T1c, REQ-F1
**Blocks:** None

### Goal

Resolve same-author / same-year entries so they sort consistently with the `a`/`b`/`c` suffixes citeproc-php emits, without introducing duplicate suffix-assignment logic in JS or new REST round-trips.

### Approach

**Option D (selected): canonicalized parallel sort.** Sort by `(author, year, title)` with title as the natural alphabetical tiebreaker — which is the same field citeproc-php uses to assign suffixes. Suffixes become a pure display artifact applied AFTER sort, with no feedback into JS ordering. Correctness depends on JS and citeproc-php agreeing on title canonicalization.

(See Appendix B for the full options analysis recap.)

### Behavior

After REQ-S4:

- Two Smith 2020 entries with titles "Beta" and "Alpha" sort with "Alpha" first
- When citeproc-php formats the same input, it assigns suffix `a` to "Alpha" and `b` to "Beta"
- The JS sort order and the PHP-assigned suffix order agree by construction
- No new REST calls; no new attribute fields; no new logic in `sortCitations` beyond what S1+S3 establish
- The sort already produces the correct order; the suffix is informational only

### Implementation notes

The JS sorter doesn't need substantive changes for Option D — REQ-S1 + REQ-S3 already produce the correct ordering. What this ticket delivers is the **parity audit and locking work** that ensures the assumption holds:

- Audit `getTitleSort` in `src/lib/sorter.js` against citeproc-php's title-canonicalization behavior
- Confirm leading-article stripping uses the same article list per locale (English: "a", "an", "the"; check citeproc's locale XMLs for other languages)
- Confirm Unicode normalization form (NFC) is applied identically on both sides
- Lock locale: ensure each style's `locale` field in the registry is threaded into both the JS sort and the PHP formatter request
- Add explicit test fixtures covering the parity edge cases: titles with diacritics, mixed case, leading articles in non-English locales, numbers in titles, punctuation
- The REQ-T1c coordination test directly verifies the resulting agreement — that's the safety net

### Acceptance criteria

- [ ] Audit document recorded in `docs/planning/sort-conformance-plan.md` Appendix C: which canonicalization rules are aligned, which are explicitly deferred
- [ ] Test fixture: two Smith 2020 entries titled "Alpha" and "Beta" — JS sort places "Alpha" first
- [ ] Test fixture: when PHP formatter is invoked on the same input, suffixes assigned are `a` to "Alpha", `b` to "Beta"
- [ ] REQ-T1c coordination test passes for all fixtures including diacritic / mixed-case / non-English-locale edge cases
- [ ] Negative test: deliberately desynced locale settings (e.g., `en-US` on JS, `pt-BR` on PHP) produce a clear test failure — validates the harness catches drift
- [ ] Documentation note: if the parity assumption ever fails in production, the escalation path is to Option C (PHP returns sortKey metadata)

### Files affected

- `src/lib/sorter.js` (audit only; minimal changes expected)
- `src/lib/__test-utils__/locale-parity.js` (new)
- `tests/fixtures/sort-coordination/cases.json` (extend)
- `bibliography-builder.php` (locale threading verification)
- `docs/planning/sort-conformance-plan.md` (Appendix C)

### Definition of done

Parity audit completed and documented; coordination tests pass for all fixtures; suffix and sort agreement verified; escalation path to Option C documented.

---

## Sprint 5 — Polish (per stakeholder decision)

Sprint 5 is intentionally light. The original draft scoped two items here:

1. **REQ-A1-Part 2** (configurable link display mode) — moved to **REQ-B6** in the backlog per Codex review, since A1 Part 1 alone closes the user-feedback issue and Part 2 represents feature-richness whose demand hasn't been validated.
2. **REQ-S2-Stretch** ("Renumber from current order") — moved to **REQ-B5** in the backlog per Codex review, since the current implementation premise (re-formatting to refresh prefixes in formatted text) doesn't match how numbering actually works in Borges (visible numbering comes from `<ol>`; PHP strips numeric prefixes from formatted text).

If Sprint 5 capacity is available after Sprints 1–4 ship, candidate work:

- **Pull from backlog** based on user feedback after Sprints 1–4 are in production
- **Extend conformance test suite** with more CSL test-suite fixtures (REQ-B7 — see Backlog)
- **Begin Epic-OSCOLA scoping** — fixture authoring and section-mapping prototyping (does not commit to delivery)

The decision on whether to staff Sprint 5 at all should be made after Sprint 4 ships, based on observed user response to the Sprint 1–4 work.

### Files affected

- `src/edit.js`

### Definition of done

Affordance available for IEEE/Vancouver users; QA matrix updated.

---

## Epic-OSCOLA (REQ-S5 deferred) — Grouped bibliography support

**Status:** Deferred — own epic, scoped but not scheduled
**Effort estimate:** L (2–3 weeks)
**Dependencies:** All sprints 1–4 complete

### Background

OSCOLA (Oxford Standard for Citation of Legal Authorities) bibliographies are conventionally grouped by source type, with alphabetical ordering within each group:

1. Cases
2. Legislation
3. Books
4. Journal articles
5. Online sources

Borges currently flattens OSCOLA into a single alphabetical list. This is documented as a known limitation in both readmes and inline in `style-registry.js` until the epic is picked up.

### Scope sketch (for sizing only)

- New module `src/lib/formatting/bibliography-sections.js` with `getBibliographySection(csl)` mapping CSL `type` → OSCOLA section
- Section ordering registry: `OSCOLA_SECTION_ORDER = ['case', 'legislation', 'book', 'article', 'online']`
- New schema flag in `STYLE_DEFINITIONS`: `groupedBibliography: true | false`
- Editor display in `edit.js`: group entries by section, render section headings between groups
- `save.js` and `save-markup.js`: emit grouped HTML structure (`<h3>Cases</h3>`, `<ul>...</ul>`, `<h3>Legislation</h3>`, etc.) — likely a `<section>` wrapper per group
- Sort behavior: alphabetical within group, in `notes` family ordering
- Export format implications:
  - BibTeX/RIS: grouping isn't a property of these formats; flatten on export
  - CSL-JSON export: optional group metadata could be embedded
  - Plain-text export: emit section headings as plain text
- Block deprecation: existing OSCOLA-styled posts will need a migration path
- Tests: extend conformance suite to handle grouped output
- Documentation update: remove "known limitation" notice

### Currently-documented limitation (to be removed when epic ships)

Until this epic is implemented, both readmes and the inspector should note: **"OSCOLA bibliographies in Borges are rendered as a single alphabetized list. The OSCOLA convention of grouping by source type (cases, legislation, books, articles, online sources) is not yet supported. See Epic-OSCOLA for tracking."**

This limitation note is delivered by **REQ-DOC1** (Sprint 1) with explicit acceptance criteria covering `README.md`, `readme.txt`, inline `style-registry.js` comment, and inspector notice.

---

## Backlog

### REQ-B1 — Inline citation marker detection for numeric renumbering

**Description:** Allow users in numeric-family styles to paste their post content (or have Borges scan `the_content` of the current post) and automatically order the bibliography to match the order of `[1]`, `[2]`, etc. markers in the prose.

**Why deferred:** Requires Borges to be aware of post content beyond its own block — a substantial architectural shift. Currently Borges is content-agnostic; it only knows about citations within its own attributes. Solving this well requires either (a) a companion inline-citation block that emits structured references the bibliography can resolve, or (b) heuristic regex-scanning of the post content, which is fragile.

**Trigger to revisit:** If users actively report this gap during numeric-style usage, prioritize. Otherwise hold.

**Effort estimate when picked up:** L

### REQ-B2 — Translator/director sort fallbacks

**Description:** For translated works ("Translated by X") and films/media ("Directed by Y"), some styles include the translator/director in sort priority when no author is specified. Currently the sorter falls through to title.

**Why deferred:** Edge case; affects a small fraction of citations in humanities and film studies.

**Effort estimate:** S

### REQ-B3 — Suffix-aware citation keys for export formats

**Description:** BibTeX export currently emits citation keys like `Smith2020`; with same-author / same-year work in scope, exports should produce `Smith2020a`, `Smith2020b` to maintain reference integrity.

**Why deferred:** Pairs with REQ-S4. Could be picked up immediately after S4 if export-format users surface the need.

**Effort estimate:** S

### REQ-B4 — Editor preview anchor refactor

**Description:** Currently `CitationEntryBody` wraps citation text in a `<button>` for entry activation, which precludes inline `<a>` anchors in the preview. To bring editor preview accessibility on par with the saved frontend output (REQ-A1), the activation interaction would need to be redesigned — for example, moving activation to a separate icon button, or treating the citation text as a clickable region without `<button>` wrapping.

**Why deferred:** Non-trivial UX refactor that affects keyboard navigation, focus management, the existing `handleEntryActivate` flow, and the test surface for `citation-entry-body.test.js`. A1 Part 1 (saved-output aria-labels) closes the user feedback for the public-facing case; the editor preview issue is a developer-side and reviewer-side concern.

**Trigger to revisit:** When the editor preview screen-reader experience is reported as a friction point by users, or when a broader editor-UX refactor is on the roadmap.

**Effort estimate:** M

### REQ-B5 — "Confirm current order" affordance for numeric-family styles

**Description:** A purely UX affordance for IEEE/Vancouver users to explicitly confirm their current bibliography order via a snackbar acknowledgment. Originally specified as REQ-S2-Stretch with a "Renumber from current order" label that didn't match implementation reality (PHP strips numeric prefixes; visual numbering comes from `<ol>`).

**Why deferred:** The up/down controls in REQ-S2 already let users assert order. An explicit confirmation button has no behavior beyond a snackbar, and the original premise of "renumbering" doesn't apply. Re-spec needed if this is picked up — design language ("Confirm" or "Lock order") and whether the affordance is necessary at all should be validated by user research first.

**Trigger to revisit:** User feedback indicating that the up/down controls don't feel "complete" or that users want a clear "I'm done arranging" signal.

**Effort estimate:** XS

### REQ-B6 — Configurable link display mode

**Description:** Block attribute `linkDisplayMode: 'url' | 'title' | 'icon'` letting users choose whether the link in a citation entry shows the URL, the publication title, or just an icon. Originally drafted as REQ-A1-Part 2.

**Why deferred:** REQ-A1 Part 1 (aria-label on URL anchors) closes the immediate user-feedback issue. Part 2 represents feature-richness whose demand has not been validated. The configurability also expands the test surface significantly (three modes × editor + frontend × all citation types). Defer until users actively request title-as-link or icon-only modes.

**Trigger to revisit:** Multiple user requests, or accessibility-audit findings indicating that aria-label alone is insufficient for some screen-reader configurations.

**Effort estimate:** S–M

### REQ-B7 — CSL official test-suite fixtures

**Description:** Pull a curated subset of the [`citation-style-language/test-suite`](https://github.com/citation-style-language/test-suite) repository's bibliography-sort fixtures into Borges' test runner. Strong conformance signal, requires fixture format adapter work.

**Why deferred:** REQ-T1b (cross-runner comparison against citeproc-js) gives most of the value with less infrastructure work. Pull the official test suite if cross-runner comparison surfaces gaps that the official suite would catch but citeproc-js doesn't, or if conformance reporting becomes a marketing/positioning need.

**Effort estimate:** M

---

## Conformance testing strategy (consolidated)

Five-layer testing approach across Sprints 1, 3, and 4:

| Layer | Tool | Scope | When | Ticket |
| --- | --- | --- | --- | --- |
| Snapshot baseline | Jest `toMatchSnapshot` | All registered styles, hand-crafted fixture | Sprint 1 | REQ-T1a |
| Cross-runner comparison | citeproc-js | Sort order parity, all non-grouping styles | Sprint 3 | REQ-T1b |
| PHP↔JS coordination | PHPUnit + Jest, shared JSON fixtures | Static suffix agreement + mutation parity | Sprint 3 | REQ-T1c |
| E2E on Playground | Playwright | Insert / sort / reorder / save / reload flows | Per feature | (per ticket) |
| Manual a11y | NVDA + VoiceOver | Screen reader behavior | Per feature | (per ticket) |

### Future enhancement: CSL official test suite

The CSL project maintains the [`citation-style-language/test-suite`](https://github.com/citation-style-language/test-suite) repository with thousands of CSL-conformance fixtures. Pulling a curated subset (just the bibliography-sort tests for our supported styles) into our test runner would give us strong conformance signal but requires fixture format adapter work. Tracked as **REQ-B7** in the backlog.

---

## File-by-file impact summary

For sprint planning visibility, here are the source files affected across all in-scope tickets:

| File | Tickets touching | Notes |
| --- | --- | --- |
| `src/lib/sorter.js` | T1a (read), S1, S3, S4, S6 | Core refactor target |
| `src/lib/sorter.test.js` | S1, S3, S6 | Test additions |
| `src/lib/sorter.snapshot.test.js` | T1a (new) | Snapshot regression |
| `src/lib/sorter.conformance.test.js` | T1b (new) | citeproc-js cross-check |
| `src/lib/sorter.coordination.test.js` | T1c (new) | JS↔PHP suffix verification |
| `src/lib/formatting/index.js` | A1 | Link segment options (saved-output thread) |
| `src/lib/formatting/style-registry.js` | S1 (read), A2, DOC1 | Family lookups, default heading helper, OSCOLA TODO |
| `src/lib/formatting/style-registry.test.js` | A2 | Default heading helper tests |
| `src/lib/formatting/csl.js` | F1 | Cache rework |
| `src/lib/formatting/csl.test.js` | F1 | Cache tests adapted |
| `src/lib/formatting/csl.runtime.test.js` | F1 | LRU eviction adapted |
| `src/lib/formatting/csl.context-cache.test.js` | F1 (new) | Bibliography-context cache tests |
| `src/edit.js` | S1, S2, DOC1 | Family-gated UI, OSCOLA notice |
| `src/edit.test.js` | S1, S2, DOC1 | Editor tests |
| `src/index.js` | A2 | Block variation registration |
| `src/hooks/use-citation-editor-state.js` | A2 | Style-change heading logic |
| `src/hooks/use-citation-editor-state.test.js` | A2 | Hook tests |
| `src/components/citation-entry-body.js` | S2 | Reorder controls (link rendering NOT touched in A1 — see scope correction) |
| `src/components/citation-reorder-controls.js` | S2 (new) | Up/down buttons |
| `src/hooks/use-citation-reorder.js` | S2 (new) | Reorder mutations |
| `src/hooks/use-citation-reorder.test.js` | S2 (new) | Hook tests |
| `src/save-markup.js` | A1 | Static save output (link aria-labels) |
| `src/save.test.js` | A1 | Save output tests (note: `save-markup.test.js` does not exist) |
| `bibliography-builder.php` | T1c, S4, F1 | Locale threading audit, normalize behavior reference |
| `tests/phpunit/SortCoordinationTest.php` | T1c (new) | PHP half of coordination |
| `tests/fixtures/sort-coordination/cases.json` | T1c, S4 (new) | Shared static and mutation fixtures |
| `tests/playwright/numeric-reorder.spec.js` | S2 (new) | E2E reorder test |
| `scripts/verify-sort-coordination.js` | T1c (new) | Cross-language harness |
| `README.md` | DOC1 | Known limitations section |
| `readme.txt` | DOC1 | WordPress.org-facing known limitations wording |
| `docs/qa-matrix-checklist.md` | A1, A2, S2 | Manual QA expansion |
| `docs/a11y-audit-records/2026-05-link-aria-labels.md` | A1 (new) | Screen reader record |
| `src/benchmarks/performance-benchmark.test.js` | F1 | Cache-invalidation benchmark addition |

---

## Appendix A — Current sorter audit findings

Read of `src/lib/sorter.js` performed 2026-05-07. Summary of findings that motivate this plan:

**Strengths preserved by the plan:**
- Locale-aware author comparison (`localeCompare` with `sensitivity: 'base'`)
- Editor-as-fallback when author is missing
- Corporate authors via CSL `literal` field
- Leading-article stripping for title sorts
- `Infinity` sentinel for missing dates (undated entries sort last)
- Title fallback when neither author nor editor present

**Gaps addressed by this plan:**

1. Numeric family silently mis-sorted as author-date — addressed by REQ-S1 + REQ-S2
2. APA single-author-first rule absent — addressed by REQ-S3
3. Same-author / same-year suffix coordination undefined — addressed by REQ-S4
4. No deterministic tiebreak when all comparators tie — addressed by REQ-S6
5. OSCOLA grouping not supported — deferred to Epic-OSCOLA, documented as known limitation in Sprint 1

**Gaps explicitly out of scope:**

- Translator/director sort fallbacks → REQ-B2 backlog
- 3+ author tiebreak rules per Chicago Author-Date variants → not currently triggered by registered styles; not in plan
- Suffix handling on `Jr.`, `Sr.`, `III` → most styles say suffix doesn't affect sort; current implicit behavior is correct

---

## Appendix B — REQ-S4 options analysis (recap)

Four options were considered for resolving the same-author / same-year suffix coordination problem.

### Option A — Pure JS pre-sort then suffix

JS owns suffix assignment in addition to sort.

- Pros: self-contained; offline-friendly; immediate display
- Cons: duplicates citeproc-php's logic; risk of silent disagreement with PHP formatter
- **Not selected** due to maintenance surface duplication

### Option B — Pure PHP, citeproc owns it

Every sort operation triggers a `/format` REST call.

- Pros: single source of truth; rigorous CSL spec compliance
- Cons: REST round-trip on every mutation; undoes the existing `deferFormatting: true` architecture; offline editing degrades
- **Not selected** due to architectural regression

### Option C — Hybrid, PHP returns sortKey metadata

Extend `/format` response to include a `sortKey` per item.

- Pros: clean authority split (PHP assigns, JS orders); no duplicate logic
- Cons: REST contract change; suffixes go stale on offline mutations; `sortKey` stability across citeproc-php versions not guaranteed
- **Held as escalation path** if Option D's parity assumption breaks in production

### Option D — Don't sort by suffix at all (selected)

Sort by `(author, year, title)`. Title tiebreaker matches what citeproc-php uses for suffix assignment. Suffixes become a pure display artifact.

- Pros: simplest architecture; no new REST contract; offline-safe; minimal new code
- Cons: correctness depends on JS↔PHP canonicalization parity (locale, Unicode normalization, leading-article rules)
- **Selected** because the parity assumption is directly testable via REQ-T1c, and the escalation path (Option C) is well-defined if it ever fails

### Option D safeguards

REQ-S4 does not just rely on the assumption — it includes:

1. Explicit canonicalization audit comparing JS and citeproc-php behavior
2. Locale threading lockdown (each style's `locale` field flows to both runners)
3. Edge-case fixture coverage (diacritics, mixed case, non-English locales, punctuation)
4. Negative test (deliberately desynced locale fails) to validate the harness
5. Documented escalation path to Option C

---

## Appendix C — Locale and canonicalization parity audit

Status: **completed for Sprint 4 Option D scope**, with explicit deferred items documented below.

### Confirmed aligned

1. **Primary sort key shape**
   - JS uses `author/editor -> year -> title` for `author-date` family and `author/editor -> title -> year` for `notes`.
   - PHP (citeproc-php) formatting order used in coordination fixtures is consistent with the same tie-break structure for the covered fixtures.

2. **Locale threading**
   - JS sorter now threads `style.locale` into all `localeCompare()` calls via `sortCitations()` comparator construction.
   - PHP formatter threads locale via `new \Seboettg\CiteProc\CiteProc( $style_xml, $style['locale'], ... )`.
   - Coordination fixtures exercise `en-US` and `pt-BR` styles (e.g., ABNT).

3. **Harness drift detection**
   - JS coordination suite includes an intentional desync check that uses a mismatched style and asserts a loud mismatch error.
   - PHPUnit coordination suite includes a matching sanity check that proves fixture expectations fail under style drift.

### Explicitly deferred (known non-goals for this ticket)

1. **Per-locale article stripping parity**
   - JS `stripArticles()` currently strips only English leading articles (`a`, `an`, `the`).
   - Locale-specific article lists (for example Portuguese variants) are deferred; this is tracked as future parity hardening if production data shows drift.

2. **Unicode normalization form guarantees (NFC/NFD)**
   - No explicit normalization step is applied in JS sorter before comparisons.
   - citeproc-php normalization internals are treated as opaque for now.
   - Current fixtures cover mixed case and diacritics where practical; full normalization guarantees remain deferred.

3. **Title canonicalization for particles and punctuation-heavy edge cases**
   - Cross-runner conformance currently excludes a small set of known divergent fixtures (particle surnames and one leading-article tie case) documented in `src/lib/sorter.conformance.test.js`.
   - These remain tracked for post-S4 conformance refinement.

### Escalation path (if parity fails in production)

If coordination drift appears in real-world data despite this audit and fixture coverage, escalate to **Option C**: have PHP emit canonical `sortKey` metadata that JS consumes directly instead of inferring canonicalization locally.

---

## Open questions for stakeholders — ANSWERED in revision

The four questions originally deferred during planning have been resolved per Codex review feedback. Recorded here for audit trail; no further action required unless the resolutions are revisited.

1. **Sprint 2 ordering — S2 vs. S3 first within Sprint 2?**
   **Resolved:** S1 → S2 → S3. Numeric mis-sort is the bigger user-visible bug. Sprint plan summary updated.

2. **Stretch scope — A1-Part 2 in Sprint 5 or pushed to backlog?**
   **Resolved:** Pushed to backlog as REQ-B6. A1 Part 1 alone closes the user-feedback issue; Part 2 demand has not been validated.

3. **Renumber-from-current-order button (S2-Stretch) — keep in Sprint 5 or fold into Sprint 2?**
   **Resolved:** Pushed to backlog as REQ-B5 with required re-spec note. Original premise (re-formatting to refresh prefixes) doesn't match implementation reality (PHP strips numeric prefixes; `<ol>` provides visible numbering).

4. **Epic-OSCOLA scheduling — block this plan's release on it, or ship sprints 1–5 first?**
   **Resolved:** Ship Sprints 1–4 first (Sprint 5 is now optional per stakeholder decision); Epic-OSCOLA is independent and remains deferred. Limitation note delivered by REQ-DOC1 in Sprint 1.

### Net-new open questions surfaced by Codex review

5. **REQ-F1 cache strategy — Strategy A (bibliography-batch cache) or Strategy B (opt-out for context-sensitive families)?**
   **Recommendation:** Strategy A. Confirm before Sprint 3 starts.

6. **REQ-A1 editor preview parity — accept the editor/save asymmetry, or schedule REQ-B4 against the next editor-UX refactor?**
   **Recommendation:** Accept asymmetry for now; schedule REQ-B4 only when an editor-UX refactor is otherwise on the roadmap.

7. **Sprint 5 staffing — assign capacity proactively, or leave it as buffer for backlog pulls based on user feedback?**
   **Recommendation:** Leave as buffer; decision after Sprint 4 ships.

---

## Revision history

| Date | Change | Author |
| --- | --- | --- |
| 2026-05-07 | Initial draft | Plan synthesis |
| 2026-05-07 | Codex review feedback incorporated: added REQ-F1 (formatter cache rework), REQ-A2 (style-aware default heading), REQ-DOC1 (OSCOLA limitation note); corrected REQ-A1 scope (saved-output only; editor anchors out of scope as `<button>` wrapping prevents inline `<a>`); fixed REQ-S3 contributor key (family + given + literal, not family alone); deferred REQ-A1-Part 2 → REQ-B6 and REQ-S2-Stretch → REQ-B5; resequenced Sprint 2 to S1 → S2 → S3; added REQ-B4 (editor anchor refactor) and REQ-B7 (CSL official test-suite fixtures); fixed file path drift (`docs/sort-conformance-plan.md` → `docs/planning/sort-conformance-plan.md`; `src/save-markup.test.js` → `src/save.test.js`); marked all original open questions resolved | Plan revision |
| 2026-05-07 | Addressed second-pass review findings: clarified A1 label-in-name handling, corrected ABNT default heading text, added `readme.txt` to DOC1, reworded numeric-order criterion, removed `crypto.subtle` cache-key dependency, and expanded F1 to include full-bibliography reformat orchestration across mutation paths | Plan revision |
| 2026-05-07 | Tightened F1 and T1c per second-order review: added `formatSingleEntry` audit deliverable, documented `deferFormatting: true` interaction with `parsePastedInput` in `handleParse`, added cache-miss benchmark target (≤500 ms for 50-entry add in context-sensitive style), and extended T1c to cover mutation parity with shared mutation fixtures (T1c effort bumped from M to M-L) | Plan revision |
| 2026-05-07 | Consistency cleanup: updated Epic-OSCOLA and conformance-summary wording to match DOC1's two-readme scope and T1c's static-plus-mutation parity scope | Plan revision |
