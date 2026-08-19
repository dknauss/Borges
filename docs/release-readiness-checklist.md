# Release Readiness Checklist

Pre-release checklist for the Bibliography Builder block.

## Build and test

-   [ ] `npm run lint:js`
-   [ ] `npm run lint:css`
-   [ ] `npm run lint:i18n`
-   [ ] `npm audit --omit=dev --omit=optional`
-   [ ] `composer audit --no-dev`
-   [ ] `npm test -- --runInBand`
-   [ ] `composer test:php` reviewed for new failures or new dependency
        deprecations
-   [ ] `composer outdated seboettg/citeproc-php --direct` checked; if a newer
        formatter dependency is available, decide whether to update before
        release
-   [ ] `npm run build`
-   [ ] `npm run package:release` creates a clean zip without Composer or package-manager metadata
-   [ ] No unexpected test regressions

## Manual editor QA

-   [ ] Block appears in inserter
-   [ ] DOI parsing works
-   [ ] BibTeX parsing works
-   [ ] Supported free-text parsing works across books, articles, chapters,
        webpages, reviews, and theses/dissertations
-   [ ] Unsupported input fails closed with a clear notice
-   [ ] Edit confirm/cancel behavior is correct
-   [ ] Delete flow is correct and focus recovery works without a custom Undo UI
-   [ ] Save/reload does not create invalid block warnings

## Frontend/output QA

-   [ ] Bibliography markup renders correctly
-   [ ] Citation text is readable and only intended segments are italicized
-   [ ] Long URLs wrap without breaking the container
-   [ ] COinS spans remain hidden visually
-   [ ] JSON-LD script is present
-   [ ] CSL-JSON script is present
-   [ ] No obvious escaped/unsafe HTML issues

## Accessibility

-   [ ] Focus movement after add/delete/edit is correct
-   [ ] Status/notice messaging is announced
-   [ ] Notices are dismissible and success/info notices auto-dismiss
-   [ ] Paste control remains labeled

## Data integrity

-   [ ] CSL-JSON remains canonical
-   [ ] `displayOverride` does not mutate CSL data
-   [ ] Style metadata still resolves correctly
-   [ ] COinS output is still generated for supported entries

## WordPress compatibility

The `Tested up to` value is a claim made to users on wordpress.org. Re-verify it
here rather than trusting that it was checked when it was first written — the
version may have moved on, and the earlier check may have been partial.

-   [ ] `Tested up to` names the WordPress version actually exercised below, not
        the newest one released
-   [ ] Verified against a full install, with `vendor/` present. A hand-trimmed
        plugin copy leaves the formatter unavailable, and the render still looks
        plausible because the fallback text is plain — a bare title, no authors
        or date
-   [ ] No "Formatter unavailable; added fallback citation text." warning notice
        appeared during that check — its absence is the cheapest reliable signal
        that citeproc actually ran (same check as `docs/wporg-svn-checklist.md`)
-   [ ] Block registers and renders in the editor, in the WordPress version under test
-   [ ] CSL formatting exercised across several visibly different styles (e.g.
        `chicago-notes-bibliography`, `apa-7`, `ieee`) and the output actually
        DIFFERS between them. Divergence proves citeproc ran, since the fallback
        text is style-independent. Identical output does not prove the reverse on
        its own — an unknown style key silently renders Chicago for everything,
        and a style whose template fails to resolve looks the same — but it is
        the signal to investigate
-   [ ] All four surfaces agree on the version: `readme.txt` header, the
        `readme.txt` FAQ answer, the plugin header, and the README badge and
        requirements line

## Version strings

`scripts/package-release.sh` copies an explicit allowlist into the zip, so some
of these ship and some do not: the plugin header, `block.json`, and everything in
`readme.txt` go to wordpress.org, while `package.json` and `CHANGELOG.md` stay
repo-internal. That asymmetry is exactly why the ones that DO ship are easy to
miss — nothing in CI checks any of them.

-   [ ] `bibliography-builder.php` plugin header
-   [ ] `block.json`
-   [ ] `readme.txt` `Stable tag`
-   [ ] `package.json` and `package-lock.json` — not shipped, but keep in sync
-   [ ] `CHANGELOG.md` has a section for this version
-   [ ] `readme.txt` has both a Changelog entry and an Upgrade Notice

## Docs and fixtures

-   [ ] `docs/manual-test-checklist.md` reviewed
-   [ ] `docs/free-text-samples.md` reviewed
-   [ ] `docs/free-text-unsupported-samples.md` reviewed
-   [ ] `docs/supported-input-style-matrix.md` reviewed
-   [ ] Studio sample pages still available (`post=12`, `post=14`, `post=15`)

## Ship decision

-   [ ] No open P0 issues
-   [ ] No open P1 issues
-   [ ] Remaining P2/P3 issues are accepted
-   [ ] Ready to tag/release

## Publish and verify

Merging the release PR does not release anything. `wp-deploy.yml` runs on
`release: published` (or manual dispatch), so wordpress.org keeps serving the
previous tag — and keeps showing its `Tested up to` — until a release exists.

-   [ ] Tag created and GitHub release published
-   [ ] `wp-deploy` run completed
-   [ ] wordpress.org listing shows the new version and `Tested up to`
