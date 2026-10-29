# Style reference checks

Two dev-only checks of the CSL style goldens (`tests/fixtures/csl-styles/`)
against tools Borges does not control. Neither rewrites a golden: they report,
and a person reads each difference against the style manual. The plan they
belong to is `docs/planning/style-verification-plan.md`.

Not part of the plugin package (`tools/` is in `.distignore`).

## `compare.mjs`: citeproc-js

Renders `items.json` with citeproc-js (the engine in Zotero and Mendeley, and
the root package's `citeproc` devDependency) twice per style:

| Column | Style | A difference means |
|---|---|---|
| official | The CSL project's style for the same manual, at a pinned commit | A style-rule question: Borges, the official style, or both may be wrong, or they follow different editions |
| engine | Borges's own CSL file | citeproc-php and citeproc-js read the file differently, or a formatter adaptation in `includes/formatter.php` is at work |

```sh
npm ci --legacy-peer-deps                      # once, for citeproc
node tools/style-reference/compare.mjs         # every style
node tools/style-reference/compare.mjs --style=apa-7
node tools/style-reference/compare.mjs --json  # raw results on stdout
```

It writes `out/report.md` (a word diff of every entry that is not an exact
match, `[-Borges-] {+citeproc-js+}`) and `out/results.json`. "Typography"
marks entries that differ only in letter case, quote or dash forms, URL angle
brackets, or a final full stop.

The official styles and locales are downloaded into `out/` (git-ignored) on
first use, from the commits pinned in `STYLES_COMMIT` and `LOCALES_COMMIT`.
They are CC BY-SA 3.0, so they never enter the repository or the plugin (see
`docs/csl-styles.md`). To move to newer styles, change the two SHAs, delete
`out/`, and rerun.

Expected "engine" differences, both formatter adaptations documented in
`docs/csl-styles.md`:

- hyphenated given names: citeproc-php's output is fixed to `J.-W.`;
  citeproc-js gives `J.`;
- Vancouver page ranges: citeproc-php joins a `page-range-format` range with a
  hyphen, which Vancouver wants; citeproc-js uses an en dash.

## `anystyle.mjs`: round trip through a reference parser

Parses each style's golden text back into fields with
[AnyStyle](https://anystyle.io), a machine-learning reference parser, and
counts, per style and field, how many of the item's fields come back. It asks
whether a reader (a person, a reference manager, a crawler) can get the data
back out of the formatted entry. AnyStyle has its own blind spots (it was not
trained on OSCOLA, and reads ABNT's `v. 27` poorly), so compare runs over time
rather than chasing a perfect score.

```sh
gem install anystyle-cli                       # Ruby 2.7+
node tools/style-reference/anystyle.mjs        # summary table
node tools/style-reference/anystyle.mjs --misses
```

Set `ANYSTYLE` to the CLI's path when it is not on `PATH`.

## Results

`results/` keeps dated snapshots of both reports, with the triage of each
difference in the plan. The first run is `results/2026-10-29.md`.
