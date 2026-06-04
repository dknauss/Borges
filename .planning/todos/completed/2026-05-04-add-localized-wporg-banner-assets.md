---
created: 2026-05-04T17:05:00Z
title: Add localized WordPress.org banner assets
area: wordpress-org-assets
files:
    - /Users/danknauss/Developer/GitHub/wp-bibliography-block/.wordpress-org/
    - /Users/danknauss/Developer/GitHub/wp-bibliography-block/scripts/generate_brand_assets.py
    - /Users/danknauss/Developer/GitHub/wp-bibliography-block/.planning/ROADMAP.md
---

## Problem

The current WordPress.org SVN assets include the standard banner files only:

-   `banner-772x250.png`
-   `banner-1544x500.png`

WordPress.org also supports localized banner variants such as `banner-772x250-rtl.png`, `banner-1544x500-rtl.png`, `banner-772x250-es.png`, `banner-1544x500-es.png`, and locale-specific names like `banner-772x250-es_ES.png`. Borges does not currently ship any localized or RTL banner variants.

## Solution

Add localized WordPress.org banner assets only when there is reviewed localized branding/copy or a clear locale need. Do not generate cosmetic variants that imply official language-pack availability ahead of translate.wordpress.org approval.

Recommended first pass:

-   create RTL banner variants if the visual composition needs mirroring or right-to-left copy
-   consider first-wave locale banners alongside official language-pack expansion candidates (`fr_FR`, `de_DE`, `es_ES`, `pt_BR`, `ja`)
-   keep localized banner generation in the brand asset script so dimensions and naming remain deterministic
-   verify assets deploy to SVN `assets/`, not into the plugin zip

## Acceptance targets

-   Localized banner files follow WordPress.org naming exactly: `banner-772x250-{locale}.png` and `banner-1544x500-{locale}.png`.
-   Standard banners remain unchanged unless intentionally refreshed.
-   Generated assets are checked under `.wordpress-org/` and are excluded from the plugin release zip.
-   README/readme language claims stay aligned with actual official WordPress.org language-pack availability.
-   SVN deploy verification confirms the localized assets are reachable under `https://plugins.svn.wordpress.org/borges-bibliography-builder/assets/`.
