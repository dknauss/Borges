---
created: 2026-05-04T14:45:00Z
title: Prepare official WordPress.org language-pack expansion
area: i18n
files:
  - /Users/danknauss/Developer/GitHub/wp-bibliography-block/languages/
  - /Users/danknauss/Developer/GitHub/wp-bibliography-block/bibliography-builder.php
  - /Users/danknauss/Developer/GitHub/wp-bibliography-block/block.json
  - /Users/danknauss/Developer/GitHub/wp-bibliography-block/README.md
  - /Users/danknauss/Developer/GitHub/wp-bibliography-block/readme.txt
  - /Users/danknauss/Developer/GitHub/wp-bibliography-block/.planning/ROADMAP.md
---

## Problem

The plugin is translation-ready and includes seed PO/MO files for 19 locales, but WordPress.org currently publishes only one official generated language pack (`ru_RU`). WordPress.org counts English (US) as the source language, not a translated locale, and official language packs depend on approved/current translations on translate.wordpress.org. Advertising the bundled seed files as public language availability would overstate the live WordPress.org status.

The local translation files also need a maintenance pass: the current POT has fewer strings than the live Stable translation project, and block-editor translations require JSON artifacts when translations are shipped locally rather than through WordPress.org language packs.

## Solution

Create a dedicated i18n/language-pack follow-up phase before advertising additional languages. Regenerate the POT from current PHP, JS, and block metadata; rebuild MO files; generate or verify JS JSON translation files if bundled translations remain in the release package; and decide whether bundled PO/MO files should stay as seed/import material or be reduced once official language packs exist.

For official WordPress.org availability, coordinate with translate.wordpress.org locale teams/PTEs or the appropriate CLPTE workflow. Do not submit unreviewed machine translations. Prefer a small first wave of reviewed official language packs over attempting all 19 seeded locales at once.

## Acceptance targets

- POT regenerated from the current source tree and checked into `languages/`.
- Local seed PO/MO files either refreshed or intentionally trimmed according to the documented bundled-vs-official policy.
- JS translation JSON artifact expectations are documented and tested if local translations remain bundled.
- GitHub README and WordPress.org `readme.txt` continue to describe live official language-pack availability via the WordPress.org Languages list, not by bundled seed-file count.
- First-wave official language-pack candidates are selected and tracked; recommended initial candidates are `fr_FR`, `de_DE`, `es_ES`, `pt_BR`, and `ja`.
- Translation approval path is documented: locale-team/PTE review or CLPTE for professionally reviewed translations.
