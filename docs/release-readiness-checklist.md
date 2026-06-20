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
