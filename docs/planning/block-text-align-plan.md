# Heading Alignment as a Core Block Setting

Plan for letting an author align one bibliography's heading from the block toolbar, using WordPress's own text-align control, instead of a custom attribute or custom CSS.

## Status

- **Drafted:** 2026-11-09
- **State:** proposal; no code written. Follows #251, which made the heading start-aligned by default.

## Problem

The heading is start-aligned by default since #251, but an author who wants a centered or right-aligned "Sources" heading (to match a centered post layout, say) has no setting for it and must add custom CSS. Core blocks such as Heading and Paragraph offer a text-align toolbar control through block supports; the bibliography block does not.

## Goal and non-goals

- **Goal:** a text-align control in the block toolbar that aligns the visible heading (the `h2` to `h6` or `p` from `headingText`/`headingLevel`).
- **Non-goal:** aligning the citation list. Centered or right-aligned citations read badly, and hanging indents depend on start alignment. The control is for the heading only, and the plan says so in the toolbar label.
- **Non-goal:** a Borges-specific attribute. Reuse core's `style.typography.textAlign` so themes, global styles and block transforms understand it.

## Design

1. **block.json.** Add `typography.textAlign: true` to `supports`. Add `__experimentalSkipSerialization: [ "textAlign" ]` under `typography` so core does not put the `has-text-align-*` class on the outer `section`; Borges applies it to the heading itself. *Open question:* the exact support key and the first WordPress version that honours it. The plugin requires 6.4; on older versions the key is ignored and no control appears, which is acceptable, but the minimum needs checking before the PR.
2. **Saved markup (PHP and JS parity).** In `includes/save-markup.php` and the matching JS save, read `attributes.style.typography.textAlign`. When it is `left`, `center` or `right`, add `has-text-align-{value}` to the heading's class list, after `bibliography-builder-heading`. When unset, emit exactly today's markup. Accept only those three values; anything else is ignored.
3. **Backward compatibility.** Because an unset attribute produces byte-identical markup, existing posts validate unchanged and no deprecation entry is needed. Add a fixture that proves it (saved block from 1.18.0 round-trips with no change).
4. **Styles.** In `src/style.scss` add `.bibliography-builder-heading.has-text-align-{left,center,right}` rules. Do not rely on the theme to ship core's classes. The default stays `text-align: start`.
5. **Editor.** In `edit.js` add `BlockControls` with `AlignmentControl` for the heading and apply the same class to the editor heading. Use the `typography.textAlign` attribute path so undo and block copy/paste work.
6. **Email output.** `includes/email-output.php` inlines the heading style. Map the attribute to inline `text-align` (`left`, `center`, `right`) there, since email clients ignore classes.
7. **RTL.** Core stores physical values. Keep the default as `start` so RTL sites are unaffected, and note that an explicit `left` stays left in RTL, as in core blocks.

## Tests

- PHP: save-markup cases for each value, an invalid value, and unset; email-output case for each value.
- JS: save output matches PHP for the same attributes (the parity corpus in `tools/markup-value/corpus.json`), plus a 1.18.0 fixture that must validate unchanged.
- E2E: set center in the toolbar, save, reload, front end shows the heading centered and the list unchanged.
- Visual check in one block theme and one classic theme.

## Docs and release

- `CHANGELOG.md` Unreleased > Added; a line in `readme.txt` block settings; `SPEC.md` heading section.
- Ships as a minor release. No data migration.

## Risks

- **PHP/JS save drift.** The usual risk in this block. The parity corpus is the guard.
- **Support-key churn.** The typography text-align support has moved between experimental and stable names across WordPress versions. The check in design step 1 decides whether to depend on it or on a small custom attribute that stores the same value.
- **Scope creep.** Requests to align citations or group labels. Out of scope here; track separately if raised.

## Decision needed

Confirm heading-only alignment (this plan) versus whole-block alignment, which would be simpler to build but would align the citation list too.
