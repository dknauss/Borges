# External API & Library Eccentricities

Gotchas in the third-party services and libraries Borges depends on, with the
evidence and the workaround. Documented so they aren't rediagnosed from scratch.

## citeproc-php: localized `form="text"` dates need locale date blocks we don't ship

**Symptom:** bibliography entries silently dropped the publication year.

**This is NOT a citeproc-php bug** — it behaves exactly as the CSL spec
requires. `<date variable="issued" form="text"/>` (no `<date-part>` children) is
a *localized* date: the renderer pulls the parts to emit from the **active
locale's `<date form="text">` block**
(`Date::prepareDatePartsChildren` → `getDatePartsFromLocales` in
`seboettg/citeproc-php`). This plugin ships a **deliberately minimal locale**
(`packages/citation-style-language-locales/locales-en-US.xml`, ~19 lines) that
defines a few terms and **no `<date>` format blocks at all** — a standard CSL
`locales-en-US.xml` is ~300 lines and does define them. With no locale date
definition and no explicit children, citeproc-php's fallback iterates an empty
date-part list and returns an empty string. Correct per spec; the mismatch was
ours (a locale-dependent style construct against a stripped locale).

**This is also NOT an `intl` problem.** `intl` was the first suspect (the
formatter needs it, and the Playground blueprint requires `features.intl`).
Ruled out by direct repro: on a host **with** `intl` loaded, `form="text"`
still rendered no year, while `<date-part name="year"/>` rendered `1963` for the
same CSL. `intl` is necessary for the formatter in general, but it is not the
cause of the dropped year.

**Rule / fix:** for bundled styles, use a *non-localized* date — explicit
`<date-part name="year"/>`, which renders independently of the locale and yields
exactly the year-only output a bibliography wants:

```xml
<date variable="issued"><date-part name="year"/></date>
```

(The spec-pure alternative — shipping the full standard locales — is far heavier
and would drag in month/day formatting we don't want, so the non-localized
date-part is the better choice here, not merely a workaround.)

Guarded by `tests/phpunit/StyleYearRenderingTest.php` (static check + render
check across every bundled style). Three styles had regressed to the localized
form and dropped the year: `chicago-notes-bibliography`, `oscola`,
`modern-language-association`.

## Build: the formatter renders from `vendor/`, not `packages/`

The PHP formatter (`bibliography_builder_format_csl_items`) loads style XML from
`vendor/citation-style-language/styles/`, **not** from the
`packages/citation-style-language-styles/` source. The `packages/` dir is a
Composer *path* package with `"symlink": false`, so `composer install`
**copies** it into `vendor/`. Consequences that have bitten us:

- Editing a style under `packages/` has **no effect** until `composer install`
  re-copies it to `vendor/` (or you copy it by hand). A stale `vendor/` will keep
  rendering the old style even though the source looks fixed.
- A test that globs only `packages/` gives false confidence — it passes while the
  rendered `vendor/` copy is still broken. `StyleYearRenderingTest` therefore
  globs **both** directories.
- The release zip is safe: `scripts/package-release.sh` runs `composer install`
  into a clean staging dir, so it always copies the current `packages/` source.
- The formatter also caches rendered HTML in a `bbb_*` transient (1 h TTL) keyed
  by items + style *key* — **not** by style file content. After changing a style
  file, clear those transients (or wait out the TTL) or you'll see stale output.

## CrossRef / PubMed: author names AND titles returned in ALL CAPS

Some CrossRef and PubMed records return **author names** and/or the **work
title** in all uppercase. The casing originates in the *publisher-deposited
metadata*, which CrossRef stores and serves **verbatim** (CrossRef does not
normalize member-deposited title/name case — this is why title case varies
wildly between publishers). The block likewise renders CSL verbatim, so these
surface as shouting. Confirmed examples:

- `10.1093/mind/LIX.236.433` (Turing, *Mind*, Oxford University Press) — CrossRef
  returns both the author `TURING` **and** the title
  `I.—COMPUTING MACHINERY AND INTELLIGENCE` in all caps.
- The Watson/Crick authors from the PubMed resolver come back uppercased.
- By contrast `10.1007/BF02478259` (McCulloch & Pitts, Springer) comes back
  correctly cased and needs no normalization — it is per-record/per-publisher,
  not universal.

It is *data*, not a style-`text-case` setting — confirmed by rendering the same
record through styles with no uppercase rule. **No upstream bug to file:** see
"Upstream status" below.

**Normalized as of 1.4.0**, at the `normalizeResolvedCsl` choke point (runs for
every machine-resolved source — DOI/PMID/BibTeX/free text — but not manual
entry, where the user controls casing):

- **Names** — `src/lib/normalize-author-names.js` title-cases fully-uppercase
  `family`/`given` on `author`/`editor`/`reviewed-author`. Leaves already-cased
  names, dotted/short initials (`A. M.`, `JD`), caseless scripts (CJK), and
  organization `literal` names (acronyms like `IEEE`) untouched.
- **Titles** — `src/lib/normalize-title-case.js` title-cases fully-uppercase
  `title`/`container-title` with minor-word handling (`the`, `of`, `and`…
  lowercased except first/last word and after a sentence break). Leaves
  already-cased titles (the common case, incl. sentence-case article titles)
  untouched.

**Known limitations** (both only reached when the *source* is already all-caps,
so the blast radius is the minority of records that arrive shouting):

- Internal caps cannot be recovered without a dictionary: a name like
  `MCCULLOCH` flattens to `Mcculloch`; `MACDONALD` to `Macdonald`.
- Acronyms inside an all-caps **title** cannot be told apart from ordinary words
  and flatten to title case: `THE ROLE OF DNA` → `The Role of Dna`.
- All-caps titles become **title** case, which can look slightly different from a
  neighbouring entry whose publisher deposited a **sentence**-case title. Both
  are readable; title case was chosen because it never produces an obviously
  wrong lowercase proper noun (as sentence case would, e.g. `america`).

Each limitation is locked in by an explicit test so the behaviour is intentional,
not a surprise.

**Upstream status — nothing actionable to file.** The all-caps originates in the
*publisher's deposited metadata* (e.g. Oxford University Press for the Mind
record), not in CrossRef, the PubMed resolver, citeproc-php, or this plugin.
CrossRef intentionally serves member deposits verbatim and does not normalize
case, so a bug report there would be declined by design; the only true "fix at
source" is the publisher re-depositing corrected metadata, which is not
practical to pursue per record. Client-side normalization (what we do here) is
the standard remedy and is what other citation tools do. So: **do not report
upstream** — this is expected third-party data variance, now handled locally and
documented.

## CrossRef: non-standard CSL `type` values

**Symptom:** some DOIs (e.g. university-press books like
`10.7208/chicago/9780226458144.001.0001`) failed to import entirely.

**Cause:** CrossRef's CSL-JSON transform emits `type` values that are **not**
valid CSL types — e.g. `monograph` for a book, `edited-book`,
`reference-entry`, `report-component`, `posted-content`. The block's
`validateAndSanitizeCsl` rejects unknown types and aborts the whole import.

**Workaround:** `normalizeCrossRefCsl` (`src/lib/parser.js`) maps the common
CrossRef types to valid CSL types (`monograph`/`edited-book`/`reference-book`
→ `book`, etc.) and falls any remaining unknown type back to the generic
`document`, so an unusual type label can never make a valid DOI unimportable.
The metadata (year, volume, etc.) is otherwise intact in CrossRef's response.

## CrossRef: DOIs with multiple slashes

The lookup URL is built with `encodeURIComponent(doi)` (`src/lib/parser.js`),
which percent-encodes the DOI's slashes (`/` → `%2F`). CrossRef's
`/works/{doi}/transform/...` endpoint **accepts** the encoded form, including
for multi-slash DOIs like `10.7208/chicago/9780226458144.001.0001` (verified:
HTTP 200 for both encoded and raw). No special handling needed — recorded here
because it looks suspect but is fine.

## WordPress: symlinked-plugin `viewScript` "alias" notice (dev only)

When the plugin is loaded into a site via a **symlink pointing outside**
`wp-content/plugins` (a common local-dev setup), WordPress can't compute a
script `src` URL for `viewScript`, registers the handle as a src-less alias,
and logs: *"Cannot supply a strategy `defer` … because it is an alias (it lacks
a `src` value)."* This is an artifact of the symlinked dev install — it does
**not** occur for a normally-installed (copied) plugin or on WordPress.org.
