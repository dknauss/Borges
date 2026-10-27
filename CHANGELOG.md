# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **RIS import.** Paste a reference manager's RIS export, a whole `.ris` file or single records, and each record imports as a citation. Records can sit in one paste with DOIs and formatted citations, and Zotero's CRLF line endings are fine. Borges reads RIS with `@citation-js/plugin-ris` (MIT, editor only), which follows the RIS specification as Zotero does; it also keeps a web page's `Y2` access date, which the plugin drops. Tested against Zotero 10 and Mendeley Reference Manager RIS exports in the reference-manager corpus, the sample library they were made from (checked against Zotero's own CSL JSON of it), and a round trip through Borges's RIS export.
- **`wp borges duplicates`.** A read-only report of repeated citations across the whole site, or in the posts you name: one row per later copy of a work in the same bibliography (what `wp borges deduplicate` would remove) and per work listed in two bibliographies of one post (which deduplicate leaves alone). It changes nothing, and follows the read commands' rules: no `--user` checks no capabilities, and `--user` skips posts that user cannot edit. See `docs/wp-cli.md`.

### Changed

- **Bulk deduplicate keeps every field.** Before it drops a later copy of a work, it copies any field the kept copy lacks, such as a DOI, pages, or a volume, into it, and formats that entry again. A field the kept copy has is never overwritten. Each removed entry lists what it gave in `mergedFields`, and `wp borges deduplicate` gains a `merged` column.
- Development dependencies refreshed to clear the `zod` (GHSA-mrhx-c7xc-m3w5), `qs`, `serialize-javascript`, `katex`, and `smol-toml` advisories. `@wordpress/scripts` moves from 31 to 37, which retires the interim `zod` override, and `tools/markup-value` moves to Lighthouse 13.5.0. None of them ship in the plugin.
- Build tooling: `@wordpress/scripts` 37 lints with ESLint 10, so the repo gains a flat `eslint.config.js` that keeps Jest's rules and globals for tests (the default now assumes Vitest), and `npm test` runs Jest through `wp-scripts test-unit-jest`. Catch bindings that were never read are dropped, JSDoc `Function` and `*` types are spelled out, and the visually hidden styles use `clip-path: inset(50%)` in place of the deprecated `clip`.
- Code style: JavaScript and JSON now follow the WordPress JavaScript coding standards' spacing inside parentheses and brackets (`foo( bar[ 0 ] )`). The repo formats with `wp-prettier`, the fork `@wordpress/scripts` uses, in place of upstream Prettier 2.8. The reformat changes only spaces and line breaks.

### Fixed

- **Titles with straight apostrophes are italicized.** A book title or journal name stored with a straight apostrophe or straight double quotes, such as "Ted Nelson's Computer Paradigm", now saves in italics. citeproc prints those marks curly (’ “ ”), so the stored title was not found in the formatted entry and stayed roman; titles are now matched with quotation marks folded, in `save()` and its PHP port alike. A saved bibliography stays valid and takes the italics the next time it is edited ([#192](https://github.com/dknauss/Borges/issues/192)).
- **BC years in CSL-JSON.** A pasted CSL-JSON date whose BC year is a string, as Better CSL JSON writes it (`"date-parts": [["-334"]]`), now imports as the integer -334, on the editor and REST sides alike. Before, the year was dropped: a year-only date was refused, and a full date kept only its month and day. Found in Better BibTeX's own export tests (the reference-manager corpus).
- **Years before 1000 in every style.** The formatter's library (citeproc-php) printed nothing for any year below 1000, so "Aristotle. *Politics*. 334 BCE." and Bede's 731 lost their dates. Such a date is now printed as its year alone, "334 BCE" (ABNT: "334 AEC"), "731", or "100–44 BCE" and "4 BCE–30 CE" for a range; month and day are left out. Saved bibliographies keep their stored text and pick this up the next time they are formatted.
- **ABNT sorts titles without Portuguese leading articles.** A reference that opens with its title now files under the first word after O, A, Os, As, Um, Uma, Uns, or Umas, so "O Guarani" sorts under G, as ABNT's alphabetical-order standard NBR 6033 (§3.4, "Artigos iniciais") asks; English A, An, and The were already skipped, in every style. Same-author works with the same year are lettered in that order. Other styles are unchanged. A saved ABNT bibliography stays valid and takes the new order the next time it is edited.

- **Comments in JabRef files.** Pasting a whole `.bib` file that holds `@string`, `@comment`, or `@preamble` blocks no longer reports the plain-text comments between its entries as citations Borges couldn't read, or leaves them in the paste box. BibTeX ignores text outside entries, and JabRef keeps such comments in the files it saves. Pastes without those blocks still read text between entries as citations.
- **Thesis and report types from BibTeX.** A BibTeX `@mastersthesis`, `@phdthesis`, or `@techreport`, or a BibLaTeX `type` holding a standard type key such as `mathesis` or `patentde`, now imports with a readable genre ("Master's thesis", "PhD thesis", "technical report", "German patent"). Before, the bare key was stored, so a style that prints the genre showed "[mathesis]". Found in Zotero's own BibTeX export.
- **EndNote BibTeX without cite keys.** EndNote's BibTeX export can write entries with no key (`@article{` straight into the fields), and Mendeley writes `@misc{,` for an item without one. Borges couldn't read either; it now imports them, and export builds a key from the author and year.
- **Pasted XML exports.** Pasting an EndNote XML or Word bibliography XML file saved the markup as a free-text citation. Borges now says it can't read XML exports and suggests BibTeX or CSL JSON.
- **Place of publication from Mendeley BibTeX.** Mendeley Reference Manager writes the place into a nonstandard `city` field, which was dropped, so its books, chapters, and reports imported with no place. Borges now reads `city` when the entry has no `address` or `location`. Only field names count, never text inside a value, so a title such as "Why city = culture matters" imports unchanged, and a value that mentions `address =` does not block the place.

### Testing

- **Real reference-manager exports.** `src/lib/reference-manager-corpus.test.js` runs real exporter output through the parser: 13 files from Better BibTeX's own tests (Better BibTeX, Better BibLaTeX, and Better CSL JSON) and a JabRef database file, both MIT-licensed. `manifest.json` records each file's source, license, and expected entry and error counts, and the suite snapshots the CSL-JSON every file yields. Maintainers' own exports go in `contributed/`, which now holds Zotero 10's BibTeX, BibLaTeX, CSL JSON, and RIS exports of a 12-work sample library (`contributed/borges-sample.ris`), and Mendeley Reference Manager 2.150's BibTeX and RIS exports of the 9 works its RIS import kept; see the corpus README. Public EndNote samples: a user's EndNote BibTeX export from Better BibTeX's import tests, and an EndNote 20 XML export from JabRef's tests.

## [1.15.0] - 2026-10-25

### Added

- **Bulk reformat across posts.** With the write routes turned on, `POST /bibliography/v1/bulk/reformat` switches every bibliography in up to 25 posts to one citation style, reformatting each as the block sidebar's style picker does and saving each post once. It needs `edit_others_posts` and `edit_post` on each post, previews unless `dry_run=false`, and checks each post's ETag before saving it. A request returns the posts it did not reach as `remaining`, so a client sends those next; there are no background jobs, and Borges still stores no settings or cron events. The `borges/bulk-reformat` ability wraps the route.
- **Rate limit for bulk edits.** Each user may reformat 250 posts per 15 minutes in bulk, dry runs included, and only one saving bulk request runs at a time on a site. Responses carry `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers, and a request over the limit gets `429` with `Retry-After`. Hosts can change the numbers, share one budget across a site, or exempt a user with the `bibliography_builder_bulk_rate_limit`, `…_bulk_rate_limit_key`, `…_bulk_max_posts_per_request`, and `…_bulk_time_budget` filters. See `docs/rest-write-routes.md`.
- **Bulk deduplicate across posts.** `POST /bibliography/v1/bulk/deduplicate` removes repeated citations from every bibliography in up to 25 posts, keeping the first copy of each work by the editor's duplicate rules (the same DOI, or the same title with the same year or first author) and refreshing year suffixes the removal touches. A work listed in two bibliographies of one post is reported in `crossBlockDuplicates` and left in place. It has the same checks, dry run, ETags, batches, and rate-limit budget as bulk reformat. The `borges/bulk-deduplicate` ability and `wp borges deduplicate <post-id>... --user=<user>` do the same.
- **`wp borges reformat`.** `wp borges reformat <post-id>... --style=<key> --user=<user>` does the same from WP-CLI, in batches (`--batch-size`, `--sleep`), previewing unless `--commit` is passed. It always checks the user's capabilities and the write-routes filter, spends no rate-limit budget, and exits 1 when any post fails. See `docs/wp-cli.md`.

### Fixed

- **Editing a citation can no longer create a duplicate.** Pasting, importing, manual entry, and the REST add route already skipped a work the bibliography held, but editing an existing citation's fields could turn it into a copy of another. The block's field editor now refuses such an edit with a notice and keeps the form open, and `PATCH …/citations/<id>` (and the `borges/update-citation` ability) returns `409` naming the matching citation. Repeats across two bibliographies on the same page are still allowed.

## [1.14.0] - 2026-10-23

### Added

- **WP-CLI commands.** `wp borges list <post-id>` lists a post's bibliographies, `wp borges export <post-id>` prints one as CSL-JSON, plain text, or JSON, and `wp borges validate <post-id>` reports errors and warnings for every entry and exits 1 when there are errors. They read the same data as the REST routes and abilities and change nothing. Run with no `--user`, they read any post, as core's commands do; run with `--user=`, they apply that user's capabilities exactly as the REST routes do (`validate` needs `edit_post`). Use `--url=` to pick a site on Multisite. See `docs/wp-cli.md`.

### Fixed

- **Year suffixes for works by the same authors in the same year.** APA, Chicago author-date, Harvard, and ABNT tell such works apart with a letter after the year, and Borges printed "Jones, T. (2020)." for each of them. They now read "Jones, T. (2020a)." and "Jones, T. (2020b).", lettered in the order the bibliography lists them (by title, skipping a leading A, An, or The). The letter is part of the formatted entry, so saved posts stay valid: a bibliography takes its letters the next time it is formatted, when a citation is added, edited, or removed or the style is changed. The REST write routes and abilities keep the letters current too: adding, editing, or removing a citation reformats the other works in its same-author, same-year group and leaves every other entry's saved text alone. Undated works ("n.d.-a") are not lettered yet.

## [1.13.0] - 2026-10-23

### Added

- **Richer JSON-LD for search engines and AI crawlers.** As a bibliography renders, its schema.org `ItemList` gains an `@id`, its heading as `name`, and `numberOfItems`, and each entry a `url` pointing at its visible `#ref-…` anchor. Each cited work gains an `@id` (its DOI URL, else its entry on the page); an `identifier` and `sameAs` links for every DOI, PMID, PMCID, arXiv ID, and ISBN it carries; the issue, volume, and periodical chain for journal articles; pages; editors and translators; edition and page count for books; language; publisher place; and a closer schema.org type for blog posts, newspaper and magazine articles, preprints, datasets, software, films, and other CSL types that used to read as plain `CreativeWork`. Published posts get all of this without being edited, and the stored content is unchanged. The `bibliography_builder_enrich_json_ld` filter turns it off.
- **The post now says it cites the works.** With Yoast SEO or Rank Math, the page's Article (or, without one, its WebPage) lists each cited work under schema.org `citation`, by the same `@id` the bibliography uses. The `bibliography_builder_link_page_citations` filter turns it off.
- **Site-wide output defaults.** The `bibliography_builder_output_defaults` filter sets which outputs (JSON-LD, COinS, CSL-JSON, Cite / Export) a newly inserted bibliography starts with. Existing blocks keep their settings, authors can still change each block, and Borges still stores no settings.

## [1.12.0] - 2026-10-22

### Changed

- **Faster formatting after an edit.** Adding, editing, or removing one citation in a long bibliography reformatted every entry on the server, since the formatter cached whole bibliographies. It now also remembers each formatted entry per style, so it formats only the entries that changed: about 5 ms instead of 65–105 ms for a 200-entry list.
- **Internals, for contributors.** No change to saved markup or output. The main plugin file is split into `includes/` modules (1,607 → about 800 lines), as are `includes/save-markup.php` and `src/lib/parser.js`; JS and PHP read one style table, `includes/styles.json`; Psalm runs at level 2 and `src/lib/` is type-checked with `checkJs` in CI; PHPCS checks PHP 7.4 compatibility; the runtime matrix runs the Abilities API. See `docs/planning/refactor-and-standards-memo.md`.

### Added

- **Write abilities** (Phase 05, M5), on WordPress 6.9+ and only when the write routes are enabled with the `bibliography_builder_enable_write_routes` filter: `borges/add-citations`, `borges/update-citation`, `borges/delete-citation`, `borges/reorder-citations`, `borges/update-bibliography-settings`, and `borges/reformat-bibliography`. Each calls the matching write route's own code, with the same rules: `edit_post` on the post, a preview unless `dry_run` is false, and an `etag` from a read or dry run to save. See `docs/rest-write-routes.md`.

### Fixed

- **Bibliographies in newsletters and feeds.** A post sent by email (Jetpack and WordPress.com newsletters, MailPoet, WooCommerce, Newspack) or read in a feed reader showed every reference in italics, so titles lost their own italics, and with Cite / Export on, each entry was followed by a run-on "Cite / Export", a "Copy citation" button that did nothing, and download links that email clients block. Email and feeds show post content without the block's stylesheet and script, and the saved markup depended on both. Now:
  - each reference is saved in a plain `<span>`, not a `<cite>`, which browsers italicize by default;
  - the Cite / Export panel is no longer saved in the post. Each entry carries its data in `data-cite-*` attributes and the block's view script builds the same panel on the page, so email and feeds get just the bibliography, and post content is smaller (the panel's percent-encoded download links are gone);
  - the block registers a `render_email_callback` for the email renderer those newsletter tools share, and RSS and Atom feeds get the same treatment, so posts saved before this release also arrive clean: the saved panel, scripts, and COinS are dropped and entries are set upright.

  Visitors without JavaScript now get the bibliography without the Cite / Export panel. Posts saved earlier keep validating in the editor and switch to the new markup the next time they are saved.
- **Names with particles sort where each style puts them.** A surname that opens with a lowercase particle, such as "van Duijnhoven", "de la Cruz", "von Neumann", or "d'Alembert", was sorted under the particle in every style. Chicago (both styles) and Vancouver sort by the surname proper, so Chicago lists "Duijnhoven, Elza van" under D, and the formatter now renders it that way. APA, MLA, Harvard, and the other styles keep the particle in front and still sort under V. A capitalized form ("Van Buren") is part of the surname and always sorts under V. Names are stored as entered, so exports and Edit fields are unchanged. Bibliographies saved earlier stay valid in the editor and take the new order the next time they are saved. ([#142](https://github.com/dknauss/Borges/issues/142))
- **No period after a title that ends in "?" or "!".** Chicago (both styles) and MLA rendered a quoted title such as "What Are Reduced Penetrance and Variable Expressivity?" as `“…Expressivity?.”`, with a period inside the closing quote. The title now closes with its own mark: `“…Expressivity?”`. A comma after such a title is kept, as Chicago allows. Bibliographies saved earlier keep the old text until they are reformatted or saved again.

## [1.11.0] - 2026-10-14

### Fixed

- **Link cards credited a cited source as the post's author.** The JSON-LD listed the cited works as top-level objects, so a reader that takes the first top-level `WebPage` on a page to be the page itself saw a cited web page as the post. Mastodon does this for link cards: a post citing a museum's collection page was shared "by Albertina". The cited works are now nested in one schema.org `ItemList` and none is a top-level object. Posts saved earlier keep validating in the editor, and their JSON-LD is nested as the page is rendered, so published posts are corrected without being edited; the stored content changes the next time the post is saved. Mastodon caches link cards by URL, so a card already posted keeps its old byline.
- **Bibliographies over 50 citations.** The editor allows 200 citations per bibliography and formats them all in one request, but the server formatter still refused more than 50, so adding, editing, or restyling in a larger bibliography fell back to plain titles with a "Formatter unavailable" notice. The formatter now takes up to 200 entries per request, matching the editor. The 100-citation slowness notice and the 50-entry paste limit are unchanged.

## [1.10.0] - 2026-10-09

### Added

- **Library catalog numbers.** Paste an OCLC number (`OCLC 4134656`, `(OCoLC)ocm04134656`, `urn:oclc:record:…`, or a WorldCat link), an LCCN (`LCCN 76-28766` or an lccn.loc.gov link; malformed LCCNs are refused rather than guessed), or an Open Library edition ID or link (`OL4288142M`) and the book is looked up through Open Library. Numbers need their label or link: a bare number could be a PMID. Open Library does not hold every OCLC number, so when it has no record Borges says so and suggests the ISBN. An Open Library work ID (`OL…W`) covers every edition, so Borges asks for the edition ID or ISBN instead.
- **Internet Archive items.** Paste an archive.org item link, `ia:<identifier>`, or an Internet Archive ARK (`ark:/13960/…`). Borges reads the item's record and, when it names its Open Library edition, ISBN, or LCCN, cites that edition, keeping the archive.org page as the link. Otherwise it cites the scan's own record, tidied: library punctuation in the title, life dates in author names (`Illich, Ivan, 1926-2002` becomes Ivan Illich), and `Harmondsworth ; New York : Penguin` split into place and publisher, with placeholders such as `[S.l.] : [s.n.]` and trailing years dropped. Only the first of those catalog IDs is tried, and the many OCLC numbers an item lists for other editions are ignored. Item records and catalog responses are capped at 1 MB.
- **Optional Google Books API key.** ISBN lookups fall back to Google Books when Open Library has no record, and without a key they share Google's anonymous daily quota, which runs out. Define your own key as `BIBLIOGRAPHY_BUILDER_GOOGLE_BOOKS_API_KEY` in `wp-config.php`, or supply it with the `bibliography_builder_google_books_api_key` filter. The key is sent only to Google Books and never to the browser. Borges still stores no settings.

### Fixed

- **Journal names inside DOI links.** A citation's journal name was italicized at its last occurrence in the text, and for a journal whose name is part of its own DOIs, such as eLife (`10.7554/eLife.83254`), that occurrence was inside the DOI link: the italics split the URL and the link pointed to `https://doi.org/10.7554/`. Titles are now never matched inside a URL. Bibliographies saved with the broken link stay valid and are fixed the next time they are saved.
- **Author names from book lookups.** A Chinese, Japanese, or Korean name, or one with a gloss in parentheses, is kept whole instead of being cut at the last space ("孙武 (Sun Tzu)" no longer becomes family name "Tzu)"), and a leading Dr., Prof., Mr., Mrs., Ms., Mx., or Rev. is dropped. This applies to ISBN, library catalog, and arXiv lookups. "Sir" stays, as Chicago keeps it ("Scott, Sir Walter").
- **"Place: Publisher" in pasted citations.** `London: Boyars, 1976` is now split into the place (London) and the publisher (Boyars). It used to be stored whole, as the place when a link followed and as the publisher otherwise. Text whose colon doesn't split that way (`[s.l.]: 2 vols`) still stays the place.

### Changed

- **Edit fields for every citation.** The per-field form (authors, title, container, publisher, year, pages, DOI, URL) used to open only for free-text pastes and entries with a parse warning; DOI, PubMed, ISBN, catalog, Internet Archive, BibTeX, and CSL-JSON imports, and even manual entries, could only have their displayed line overwritten, which left exports, JSON-LD, and COinS with the old data. Now every entry has **Edit fields**, and clicking an entry opens it. **Edit citation** still overrides the displayed line, and **Reset edits** now appears whenever a line has been overridden. Saving the form writes only the fields you changed: everything else, including fields the form does not show (volume, issue, edition, place, ISBN, editors), stays exactly as imported, so an untouched DOI or a URL ending in a parenthesis is not rewritten, and a full publication date survives an edit to the title. Editing one author keeps the others as they were (an organization stays an organization, "Jr." stays). Correcting the year keeps the month and day; "n.d." clears the date, and a year that is not a number is refused with a message instead of silently dropping the date. Saving the form without changes keeps a hand-edited display line; saving an edit replaces it and says so.
- **The paste box names every format it reads.** Its placeholder and the instructions under the citation form (also the "couldn't read this" warning) now list CSL-JSON, library catalog numbers, and Internet Archive links alongside DOI, PMID, PMCID, arXiv ID, ISBN, and BibTeX; the LaTeX warning lists CSL-JSON too.

## [1.9.1] - 2026-10-07

### Added

- **CSL-JSON paste.** Pasting a CSL-JSON array, or a single CSL-JSON item, now imports each item as a citation, as the readme and plugin description already said it would. That covers a reference manager's "CSL JSON" export and Borges's own CSL-JSON download. Each item is checked and cleaned like every other import; an item that is not a valid citation is skipped, named by its position, and left in the paste box to correct, and items already in the bibliography by DOI are skipped. JSON that is not CSL-JSON at all now gets its own message instead of the generic help text.

### Fixed

- **A quoted title is no longer also italicized.** Chicago puts a web page's title in quotation marks with the period inside them (`“Usage Statistics for Drupal Core.”`), and the saved bibliography italicized it as well. A title the formatted text quotes is now left upright even when punctuation sits inside the closing quote; an unquoted title is italicized as before.
- **The JSON-LD `url` for a DOI keeps its slash** (`https://doi.org/10.14722/ndss.2019.23386`), matching the visible link, instead of encoding it as `%2F`.

Bibliographies saved with the old output stay valid and pick up both fixes the next time they are saved.

## [1.9.0] - 2026-10-06

### Added

- **Heading Level setting for the block's visible heading.** The heading can now be a real heading element, `<h2>` to `<h6>`, so it appears in the page's heading outline and screen reader users can reach the bibliography by heading navigation. Until now it was always a paragraph, which led sites to add a separate Heading block above the bibliography and left the bibliography section labelled "Bibliography" rather than with its visible heading. The default is still a paragraph, so existing bibliographies are unchanged and stay valid. The level changes the element, not the look: the heading keeps the block's own size, weight, spacing, and centering at every level, though a theme's heading font family, color, or line height may apply to it. The new `headingLevel` attribute (`0` for a paragraph, or `2`–`6`) is reported by the read routes and can be set through the write routes' settings `PATCH`.

## [1.8.2] - 2026-10-06

### Fixed

- The structured edit form now stores its text fields as plain text, as imports and manual entry already do. Markup typed or pasted into Title, Authors, Container title, Publisher, or Pages is dropped on save instead of being stored in the citation, and a field that loaded with tags is cleaned when the entry is saved.

## [1.8.1] - 2026-10-06

### Fixed

- **HTML tags no longer show as text in a bibliography.** A citation whose stored text or title carried HTML, such as `<i>Governing the Commons</i>` (entered through the code editor, pasted block markup, the write routes, or a CrossRef title with an italic taxon name), printed the tags literally. Now `<i>` and `<em>` render as italics and every other tag is dropped, in the saved bibliography, the editor list, copied text, and plain-text export. A title with tags is matched for italics without them. Blocks saved with the old output stay valid and pick up the fix the next time they are saved.

### Changed

- GitHub Releases now open with the version's CHANGELOG section, ahead of the generated list of pull requests. The release workflow stops before publishing if `CHANGELOG.md` has no entry for the tag.
- Development dependencies refreshed to clear security advisories (axios, proxy-addr, qs, basic-ftp, brace-expansion, OpenTelemetry, and others). None of them ship in the plugin; the production audit was already clean.

## [1.8.0] - 2026-10-05

### Added

- **MLA 9 repeated authors.** In an MLA works-cited list, an entry by exactly the same author or authors as the entry before it now starts with three hyphens (`---. Title`), as the MLA Handbook asks. The names stay in the markup for screen readers, and the editor list, copied text, and exports keep them in full. Only exact matches are shortened; see `docs/csl-styles.md`. Existing MLA bibliographies stay valid and pick up the hyphens the next time they are saved from the editor.
- **Article number field.** The edit form and manual entry show an Article number field for journal articles. It sets CSL `number`, which Cite Them Right 13 prints as `article 108125` instead of a page. A DOI import fills it from CrossRef's article number.

### Changed

- Four styles move to their manuals' current editions:
  - **Chicago 18th ed. (2024)**, notes-bibliography and author-date: up to six authors are listed, and seven or more become the first three and "et al." (was eleven or more, cut to seven); books give the publisher without a place; a journal article with both a volume and an issue omits the month.
  - **Cite Them Right 13th ed. (2025)** (Harvard): books give the publisher without a place, and a journal that numbers its articles instead of paging them gives `article 108125`. DOI imports now carry CrossRef's article number into CSL's `number`, where every style can read it.
  - **OSCOLA 5th ed. (2026)**: a DOI is preferred to a URL and needs no access date.
  - **ABNT NBR 6023:2025**: a DOI needs no "Disponível em" or "Acesso em".

  These four editions write a repeated author out in full, as Borges already did for them: Chicago 18 dropped the 3-em dash, and ABNT dropped the underscore line in 2018. `docs/csl-styles.md` lists each style's edition. Already-saved bibliographies keep their text until an entry is added or edited, or the style is changed.

- The formatter cache key now includes a hash of the bundled style's contents, so text cached from an older style edition is never served after an upgrade.

- The runtime matrix's nginx cells pass again. The smoke test sent the write routes' `PATCH`, `PUT`, and `DELETE` requests to `/?rest_route=…`, which nginx answers with its own `405` for those methods, so the request never reached WordPress. It now uses `/index.php?rest_route=…`, the form WordPress itself builds for plain permalinks. Sites were not affected. Pull requests now also run an nginx cell, so a server-specific failure shows up before merge.

## [1.7.0] - 2026-09-26

### Added

- Citation write routes (Phase 05, M2), **off by default**. A site opts in with the `bibliography_builder_enable_write_routes` filter. Under `/wp-json/bibliography/v1/posts/<id>/bibliographies/<ref>/citations`:
  - `POST` adds CSL-JSON items, skipping duplicates;
  - `PATCH …/<citation_id>` changes fields;
  - `DELETE …/<citation_id>` removes one citation and returns it;
  - `PUT …/order` reorders a numeric-style list.

  Each route needs `edit_post` and is a dry run unless `dry_run=false`. A write needs `If-Match` with the post's ETag, which dry runs and the read routes return; it gets `428` without one and `412` when the ETag is stale. A write rebuilds the block's markup with the PHP port of `save()`, replaces only that block's bytes in the post, and saves a normal revision. See `docs/rest-write-routes.md`.

- Block-level write routes (Phase 05, M3), behind the same filter and with the same dry-run, `edit_post`, and `If-Match` rules, under `/wp-json/bibliography/v1/posts/<id>/bibliographies/<ref>`:
  - `PATCH` changes block settings: the visible heading and the JSON-LD, COinS, CSL-JSON, and Cite / Export toggles;
  - `POST …/reformat` switches the citation style the way the editor does. It reformats every entry, keeps manual display text and export strings, re-sorts for the new style, and swaps a heading still set to the old style's default.

- Review routes for editors (Phase 05, Tier 1), all read-only and requiring `edit_post`: `GET …/bibliographies/<ref>/validate` reports per-entry CSL-JSON problems (invalid or missing data, missing title, malformed DOI, and warnings for missing author, date, or container title, or an ISBN with no valid checksum); `…/duplicates` lists likely duplicate pairs using the editor's own duplicate rules; `…/preview?style=<key>` shows each entry reformatted in another citation style next to its current text, without saving. `<ref>` is the block index or its stable `bibliographyId`. The routes live in `includes/review.php`.
- Three matching read-only abilities on WordPress 6.9+, with the same `edit_post` requirement: `borges/validate-bibliography`, `borges/find-duplicate-citations`, and `borges/preview-bibliography-style`. Each takes `post_id` and either `index` or `bibliography_id`.
- Stable IDs (Phase 05, Tier 0). The read-only REST collection and single-bibliography routes, and the `borges/get-bibliographies` ability, now report each block's `bibliographyId`, a UUID that stays put when blocks before it are added or removed, as the future write routes will need. It is `null` for a block saved before IDs were assigned (or with an unusable value) until the post is next edited. Every citation already carried an `id`; the editor now guarantees one, unique within its block.

- The Playground demos (release, main build, and WordPress.org Preview) open on a demo page with copy-ready samples of every accepted input format, an empty Bibliography block to paste them into, brief notes on the key features, and three example bibliographies (Chicago notes-bibliography with Cite / Export, APA 7, IEEE). The Welcome Guide no longer covers the page. The page is defined once in `playground/demo-content.json` and `playground/demo-content.php`, and `npm run playground:build` writes it into every Blueprint.

### Changed

- The runtime matrix now tests the packaged release, including its production `vendor/`, instead of the source checkout, which had no `vendor/`, so the formatter could not run there. Every cell, from PHP 7.4 to 8.4, also:
  - checks all nine styles against the reviewed golden output;
  - exercises the opt-in write routes over real HTTP with an application password: dry run, `428`, `412`, a real write, a settings change and a reformat, and a check that the rewritten block still validates.

  A development-only Playground blueprint (`playground/blueprint-write-api.json`) enables the write routes and adds a `borgesWrite` helper to the editor's browser console.
- The nine citation styles and their locales are rewritten in full from each style manual:
  - Chicago notes-bibliography and author-date (17th ed.);
  - APA 7;
  - MLA 9;
  - Harvard (Cite Them Right);
  - IEEE;
  - Vancouver (*Citing Medicine*);
  - OSCOLA;
  - ABNT NBR 6023.

  The earlier files were about 2 KB stand-ins. They initialized every given name and dropped volume, issue, pages, editors, translators, editions, and access dates. Every manual's author-list rules now apply: "and" or "&", "et al." thresholds, and APA's 21+ ellipsis. So do its journal, chapter, webpage, thesis, report, conference-paper, and preprint forms.

  The en-US, en-GB, and pt-BR locales now carry month names, quotation marks, and role terms. pt-BR was an English copy, so ABNT printed "and" and "accessed"; it is now written in Portuguese. Harvard now uses British conventions.

  The styles are still written for Borges and licensed GPL-2.0-or-later, not copied from the CC BY-SA CSL repository. `docs/csl-styles.md` lists each source and the few deliberate deviations.

  Existing bibliographies keep their saved text until an entry is added or edited or the style is changed.
- Formatting is about 3.5 times faster than in the first full-style builds (about 25 ms instead of 90 ms for 50 entries). Each entry is still formatted on its own, so that no entry affects the next, but the style and locale are now parsed once per request rather than once per entry (`includes/class-bibliography-builder-reusable-citeproc.php`). A new test formats the style corpus in reverse order and requires every entry to match its golden output.

### Fixed

- Organization authors (CSL `literal` names, such as "Open Research Alliance") no longer vanish from formatted entries.
- An entry after one shortened to "et al." no longer loses the "and" before its last author. Each entry is now formatted on its own.
- A bibliography block no longer opens as invalid ("Attempt Block Recovery") when an editor using a different language from the one who saved it opens the post. `save()` used to write the Cite / Export labels ("Cite / Export", "Copy citation", "Copied", "RIS", "CSL-JSON", "BibTeX", "BibLaTeX") and the "Link to publication" link label into post content in the saving editor's language. The editor checks saved markup against `save()` in the *current* editor's language, so the two did not match. Saved markup is now the same in every language: the panel labels are stored in English and translated for visitors on the server as the block renders (`includes/frontend-labels.php`, a `render_block` filter), so they are translated without JavaScript and the view script loads no `wp-i18n`, and a link whose citation has no title or container title carries no `aria-label`, so screen readers announce its visible URL. Existing posts still validate in any language, because the new deprecation reads the labels back from the saved markup. The exception is blocks saved in the oldest markup shapes (before the biblioentry role was removed) that contain a linked URL in a citation with no title or container title: those still validate only in the language they were saved in, as before. They switch to the new markup the next time they are saved. The PHP port of `save()` (`includes/save-markup.php`) matches.
- In all 19 bundled translations, seven strings were compiled as "Add citations" even though they mean something else: "Copy citation", "Copy citation: %s", "Copied citation.", "Edit citation: %s", "Delete citation: %s", "Added 1 citation.", and "Added 1 citation. %s". These were stale fuzzy matches, and `wp i18n make-mo` compiles fuzzy entries. The translations are cleared so these strings fall back to English, and the `.mo` files are rebuilt.
- Pasting a whole reference-manager `.bib` export no longer loses or misreads records:
  - A field containing a blank line, such as a multi-paragraph abstract in a Zotero export, no longer splits its entry in two. Previously the whole record was lost and two errors were shown.
  - `@comment` and `@preamble` blocks, and `%` comment lines outside entries (JabRef's `% Encoding:` header and `jabref-meta` footer), are ignored instead of each producing an error notice.
  - `@string` macros now resolve, so a JabRef entry with `journal = nature` keeps its journal.
- EndNote's BibTeX export writes its reference-type name into `type` (`type = {Journal Article}`), which became CSL `genre` and could print as "Journal Article" or "Book Section" in styles that show genre. Those names are now dropped. Genuine genres such as "Master's thesis" are kept.
- Duplicating or copy-pasting a bibliography block copied its `bibliographyId` and every citation `id`, so two blocks in one post shared an ID and the page carried duplicate `ref-…` element IDs (invalid HTML, and in-page links jumped to the wrong list). The later copy now takes a new block ID and new citation IDs when it is added; the original keeps its own. Citations saved without a usable ID, or with one repeated within the block, get a new one when the post is next edited. These automatic assignments add no undo step.
- Pasting a CSL-JSON (or other JSON) document produced a nonsense webpage citation titled "id". It is now rejected with the standard unsupported-input notice. CSL-JSON remains an export format; the README no longer lists it as pasteable.

### Added

- A reference-manager export corpus (`src/lib/__fixtures__/reference-manager-exports/`) with unmocked tests for Zotero BibTeX and BibLaTeX, Mendeley, EndNote, and JabRef exports and a Zotero CSL-JSON paste. The fixtures are hand-authored models of each manager's export style, to be replaced with real exports as they become available.

### Changed

- Internal: a PHP port of the block's `save()` markup (`includes/save-markup.php`), the groundwork for server-side bibliography writes (Phase 05 M2). It is not called yet. A parity harness (`tests/fixtures/save-parity/`, `SaveMarkupParityTest`, `src/save-parity.test.js`) checks it byte-for-byte against the JS `save()` and the real block validator.
- The single-bibliography route (`GET …/bibliographies/<ref>`) and the `borges/export-bibliography` ability now also accept a block's `bibliographyId` in place of its index. Index requests behave as before; the export ability's output gains `bibliographyId`. Numeric requests are unchanged, including the route's `index` parameter; reads by ID go through a separate route with an `id` parameter.
- An all-digit `bibliographyId` is no longer treated as a stable ID (it would read as an index in `<ref>`): REST output reports `null` for it and the editor replaces it. Review follow-ups: the duplicate check now matches the editor's rules for year types, a year of 0, and a family name of "0"; the ISBN check accepts space-separated lists; the DOI check accepts `doi:` and `www.doi.org` prefixes and dotted registrant codes, and reports an empty DOI as the `empty-doi` warning rather than an error; a blank `literal` or `raw` date now counts as `missing-issued`; and the abilities always look up `bibliography_id` as an ID, never as an index.
- Internal: the PMID, PMCID, arXiv, and ISBN resolvers (route callbacks, provider constants, and NCBI cache helpers) moved from `bibliography-builder.php` into `includes/resolvers.php`, cutting the main plugin file from 2,859 to 1,931 lines. Every function and constant moved verbatim under the same name; route registration and permission callbacks stay in the main file. No behavior change.
- The Playground demo post (release, main-build, and WordPress.org Preview blueprints) now includes PMCID (`PMC3531190`), arXiv (`arXiv:1706.03762`), and ISBN (`ISBN 978-0-14-032872-1`) samples alongside the DOI, PMID, and BibTeX examples, so the identifier types added in 1.6.0 can be tried without looking up an ID.

## [1.6.0] - 2026-09-24

### Added

- BibLaTeX import. BibLaTeX entries (`date`, `journaltitle`, `location`, `urldate`, `@online`, `@report`, `@collection`, and similar) paste through the same path as BibTeX; citation-js already mapped these fields, and a new unmocked test suite (`src/lib/biblatex-import.test.js`) now pins that behavior so a citation-js upgrade cannot silently regress it.
- arXiv preprints pasted as BibTeX or BibLaTeX keep a link: an `eprint` with `eprinttype = {arxiv}` (or BibTeX's `archiveprefix = {arXiv}`) becomes an `https://arxiv.org/abs/…` URL when the entry has no URL of its own. Previously the eprint was dropped. The identifier must match the modern or legacy arXiv ID pattern before a URL is built.
- PubMed Central (PMCID) import. Paste `PMC3531190` or `PMCID: PMC3531190`, alone or one per line alongside DOIs and PMIDs, and Borges resolves it through a new editor-only `GET /bibliography/v1/pmcid/<pmcid>` route that proxies NCBI's fixed PMC citation exporter. Free-text citations that end in a `PMC…` identifier are resolved the same way when they carry no DOI or labeled PMID. The route has the same `edit_posts` requirement, digits-only validation, `wp_safe_remote_get` redirect checks, and success/not-found/failure caching as the PMID route; both now share one NCBI resolver, and PMID behavior, error codes, and cache keys are unchanged.
- arXiv import. Paste `arXiv:1706.03762`, an arxiv.org `/abs/` or `/pdf/` link, or an arXiv DOI (`10.48550/arXiv.1706.03762`), in modern or legacy (`hep-th/9901001`) form, and Borges resolves it through a new editor-only `GET /bibliography/v1/arxiv?id=…` route. The route queries the fixed arXiv API and maps its Atom response to a CSL preprint (type `article`, publisher `arXiv`, number `arXiv:<id>`, the arXiv DOI, and the abstract URL), splitting author display names with particles and generational suffixes kept intact. arXiv DOIs previously went to CrossRef, which does not hold them, and failed. arXiv lookups run one at a time to respect arXiv's request-rate guidance, and an arxiv.org link in free text is recognized only on the real host, not inside a longer hostname such as `evilarxiv.org`. The PMID/PMCID resolver scaffolding now takes a decoder callback so all three share one fetch, cache, and error path.
- Read-only WordPress Abilities (WordPress 6.9+). Borges registers `borges/get-bibliographies`, `borges/export-bibliography` (CSL-JSON or plain text), and `borges/validate-citations` (up to 50 CSL-JSON records, each checked by the formatter's own validator) in a `bibliography` category, discoverable and runnable through `/wp-json/wp-abilities/v1`. They reuse the existing REST routes' data and permission helpers, so no ability exposes more than the matching route; all three are annotated read-only, non-destructive, and idempotent. On earlier WordPress versions nothing is registered.
- ISBN import. Paste `ISBN 978-0-14-032872-1`, `ISBN-10: 0-14-032872-6`, or a bare 978/979 ISBN-13, and Borges resolves the book through a new editor-only `GET /bibliography/v1/isbn/<isbn>` route backed by Open Library (its ISBN edition endpoint for the book record and its search endpoint for author names), falling back to the Google Books API when Open Library has no record or cannot be reached (no account or key for either). A Google Books result is used only if its identifiers contain the requested ISBN, so a near-match search result is never cited. ISBN lookups run one at a time on their own queue, separate from arXiv's, so a large paste does not burst requests at either book service. Checksums are verified in the editor and again on the server before any request, ISBN-10s are converted to ISBN-13 so both forms share one cache entry, and a bare ISBN-10 is never treated as an ISBN because too many ordinary 10-digit numbers pass its checksum. The record maps to a CSL `book` with title and subtitle, authors, publisher, place, year, page count, and ISBN. Free-text citations carrying a labeled ISBN resolve the same way when they have no DOI, PMID, PMCID, or arXiv ID, and fall back to the heuristic parser if the lookup fails.

### Changed

- The paste-box placeholder, the supported-input notice, the LaTeX-detected error, and the block description now list PMCID, arXiv IDs, and ISBNs alongside DOIs, PMIDs, and BibTeX. These are changed source strings: none of the 19 bundled seed locales had translated them, but any official WordPress.org language pack that did will need the new wording re-translated.
- Regenerated the translation template and merged all 19 seed PO/MO files. Beyond the new PMCID strings, the committed POT had fallen behind: it was missing six strings that shipped in 1.5.0 (the CSL field-length error, four Block Accessibility Checks 4.0 messages, and the current plugin description) and still listed 14 strings that no longer exist in the source. No existing translation was lost; every locale keeps the same number of translated strings.
- The External Services sections of `readme.txt` and `README.md`, which WordPress.org requires, now disclose the arXiv API, Open Library's ISBN and search endpoints, and the Google Books API, and note that PMCID lookups use the same NCBI exporter as PMID. They previously listed only Crossref and PubMed.

### Fixed

- BibTeX `language` and BibLaTeX `langid` values were saved verbatim into the bibliography entry's HTML `lang` attribute, so an entry pasted with `langid = {ngerman}` rendered as `lang="ngerman"`, which is not a valid BCP 47 tag and gives assistive technology a language it cannot use. Babel/polyglossia names now map to BCP 47 (`ngerman` → `de`, `british` → `en-GB`); values that are already BCP 47 pass through; anything unmappable is dropped, since an absent `lang` is correct and a wrong one is not. Already-saved entries are unchanged.

## [1.5.1] - 2026-08-19

### Added
- WordPress 7.1 compatibility declaration. Verified against 7.1-RC4: the block
  registers and renders in the always-iframed editor, and CSL formatting was
  exercised through `POST bibliography/v1/format` across five styles with
  `vendor/` present.

### Fixed
- `copyTextToClipboard` reached its `execCommand` fallback only when
  `navigator.clipboard.writeText` was absent, not when it was present and
  rejected. Both "Copy citation" and "Copy bibliography" reported failure in
  that case while an untried option remained.

### Security
- No security content in this release. Dependabot #78 bumped the indirect
  build-tooling packages `brace-expansion` and `ip-address`; neither is a
  runtime dependency and `package-lock.json` is dist-ignored, so nothing from
  it reaches an installed site.

## [1.5.0] - 2026-08-04

### Added

- Add a second WordPress Playground demo that boots the current `main` branch build, alongside the existing released-version demo. CI publishes the freshly built plugin to a rolling `main-preview` pre-release so live Playground has a stable, CORS-reachable URL for main HEAD; the README exposes both as separate Playground badges.
- Add a scheduled Demo Link Monitor (`demo-links.yml` / `npm run test:demo-links`) that verifies each Playground blueprint's install URL stays reachable and guards against reintroducing the hosted-browser-broken `git:directory` resource.
- Add `docs/current-metrics.md`: hand-verified lines-of-code, installed-footprint, and runtime-overhead figures, each paired with the exact command used to re-derive it so the numbers can be re-checked rather than trusted on faith.
- Add a `composer verify:metrics` check (`.github/scripts/verify-metrics.sh`), run in CI, that re-derives the lines-of-code figures in `docs/current-metrics.md` and re-runs the persistence/hook audit, failing when either drifts from the doc. Footprint figures measured with `du` and built-asset byte sizes stay hand-verified, since both vary with the filesystem and toolchain rather than with the repository.
- Add a deprecation regression test that parses committed markup fixtures — one per shipped `save()` shape — through Gutenberg's own block registry and validator, asserting each still validates against the current `save` plus the `deprecated` chain. Breaking a deprecation is how a static-save block turns existing posts into "Attempt Block Recovery", and no unit test of `save()` in isolation can catch it. The fixtures are frozen on disk rather than generated at test time, so editing a deprecation cannot silently rewrite its own expectation.

### Security

- Cap the length of every string in a CSL item sent to the formatter endpoint. Each is run through a looped `wp_strip_all_tags()`, and core's script/style-stripping regex degrades to catastrophic backtracking past roughly 600 KB — measured at ~12.9 seconds of pinned CPU for a 950 KB value of unclosed script tokens. The existing request limit bounds the whole body, so a single value could carry the entire megabyte into that regex, letting any user able to reach the editor hold a CPU core per request. Strings are now rejected above 64 KB, checked once over the whole item before any stripping. The check is deliberately not per call site: stripping is reached from the flat string fields, author name parts, date literal/raw values, and both branches of the string-or-array handler, so a limit on one of them would have left the same cost reachable under a different key.
- Bound the same stripping on the read side, which was the more serious half. `GET /posts/{id}/bibliographies/{index}?format=text` and the formatted-text sanitizer both stripped stored citation text with no limit, so an oversized string saved into a published post made every later read pay ~12 seconds of CPU — on a route that requires no authentication, repeatable at no cost to the caller, and reachable by writing the block markup directly rather than through the formatter. Stored text is now truncated to the same 64 KB bound before stripping; it is not rejected, because refusing to render a bibliography that already exists would break the post rather than protect it.
- Require a post type to be publicly viewable, not merely a published post, before serving its bibliography data without authentication. `publish` status alone was enough, so bibliography blocks stored in a post type registered non-public were readable by anyone — content core's own REST controllers would refuse to expose. Anyone able to edit the post still reaches it.
- Enforce an explicit `http`/`https` allowlist on links generated from citation text. Nothing else prevented a `javascript:` or `data:text/html` href: React does not sanitize href schemes, and the output is baked into `post_content` as static HTML, so the only barrier was the URL-detection pattern happening to require a literal `http(s)://` prefix. Broadening that pattern later — to catch bare `www.`, `doi:`, or protocol-relative `//` — would have silently created a scheme-injection sink. A non-http(s) URL now renders as plain text instead of a link.
- Escape U+2028 and U+2029 in the JSON-LD and CSL-JSON script blocks. Both are legal inside a JSON string, so this is not a cross-site scripting issue — `ld+json` is never executed — but they are line terminators to a JavaScript parser, and a consumer that evaluates the block rather than parsing it would see a broken literal.
- Resolve PubMed/PMID records through `wp_safe_remote_get()` rather than `wp_remote_get()`. The request follows up to three redirects and only the safe variant validates each hop against the site's own network. The PMID is already constrained to digits and the endpoint host is a fixed constant, so the redirect chain was the one part of the request an upstream change could have pointed somewhere unintended.

### Fixed

- The end-to-end test covering the Block Accessibility Checks integration never actually ran. The accessibility Playground environment installed no plugins, so BAC was absent, the test skipped itself, and the suite still reported green — meaning the BAC integration had no end-to-end coverage at all. The environment now installs BAC, and the assertions read the `block-accessibility-checks` data store instead of BAC's markup: v4 replaced the v3 indicator classes the test looked for, and a class-name assertion silently passes once the class no longer exists. Verified in both directions — the test now fails if the editor-side filter is registered under its pre-4.0 name, the exact silent regression BAC's upgrade notes warn about. The test also no longer skips itself in CI: a skip reads as a pass on a green run, which is how it sat dormant in the first place, so an absent BAC now fails the run with a message pointing at the blueprint. It still skips gracefully for local runs without the plugin installed.
- The accessibility suite's publish helper set the post title and published in the same tick. BAC holds an error-level `post_title_required` editor check and locks post saving while the title is empty, so the save raced that lock and was rejected. The helper now waits for the lock to lift and verifies the post actually reached `publish`, instead of returning an auto-draft permalink that 404s later in the test.

### Changed

- Update the Block Accessibility Checks (BAC) integration for BAC 4.0. Checks now register through the top-level `ba11yc_register_block_check()` function with a `namespace` key and explicit `level` / `configurable` severity in place of the v3 registry object and `type` key, and the editor-side validator listens on BAC's renamed `ba11yc.validateBlock` filter. All four checks — `empty_bibliography`, `heading_missing`, `raw_url_link_text`, and `all_metadata_disabled` — are now admin-configurable from BAC's unified settings screen.
- **The BAC integration now requires Block Accessibility Checks 4.0 or later.** On BAC 3.x the v4 registration function is absent, so the integration stays dormant and no bibliography checks appear. Borges itself is unaffected and works normally whether BAC is outdated or not installed at all.

## [1.4.2] - 2026-06-21

### Added

- Resolve DOI and labeled PMID identifiers embedded in free-text citation pastes through the existing CrossRef and PubMed resolver paths.
- Add free-text sample documentation for supported embedded DOI/PMID citation inputs.

### Changed

- Fall back from embedded-identifier resolution to the heuristic free-text parser before showing unsupported-input guidance.
- Make Codecov patch coverage informational while keeping the project coverage gate.

### Fixed

- Stabilize numeric citation reorder E2E coverage against editor readiness races.
- Clarify that RIS is supported for export, not import.

## [1.4.1] - 2026-06-20

### Added

- Clean up after the plugin on uninstall: deleting the plugin now removes its cached data — the `bbb_` formatter and PubMed/PMID transients in the options table (swept across all sites on multisite) and the object-cache groups when the backend supports group flushing. Bibliography blocks stored in your posts are user content and are left untouched.

## [1.3.4] - 2026-06-14

### Changed

- Review and update repository docs for the current DOI resolver path, PubMed/PMID support, Playground blueprint install behavior, runtime matrix coverage, and maintenance planning state.
- Bump development dependency lockfile coverage for `shell-quote` and `webpack-dev-server`; document/dismiss remaining transitive development-only Dependabot alerts where no safe compatible patch is currently available.
- Refresh the POT plus 19 seed PO/MO locale pairs from current source strings, clarify translation coverage docs, and archive historical planning docs out of active planning paths.

### Internal

- Add an i18n artifact validation command and CI gate so POT, PO, MO, and public language-pack wording stay aligned.

## [1.3.3] - 2026-05-11

### Fixed

- Restore DOI imports in browser-based WordPress Playground by resolving DOI metadata through CrossRef's CORS-friendly CSL transform endpoint instead of relying on `doi.org` content negotiation redirects.
- Keep DOI lookups serialized so pasted DOI batches respect CrossRef's public concurrency limit.

### Changed

- Add a PubMed/PMID sample (`PMID:26673779`) to the Playground starter content alongside DOI and BibTeX examples.

## [1.3.2] - 2026-05-10

### Added

- Block Accessibility Checks (BAC) optional compatibility layer: soft-detects the Block Accessibility Checks plugin and registers four editor checks (empty bibliography, missing heading, raw URL link text, all metadata outputs disabled). Borges continues to work normally when BAC is absent.
- Stable `bibliographyId` block attribute and per-citation `id` field — groundwork for the writable bibliography REST API (M0).

### Changed

- Harden E2E plugin-row locator in Playwright specs to exclude WordPress update notice rows, fixing Playwright strict-mode violations in CI.
- Regenerate POT with 81 msgid entries (up from 41); new strings include PHP formatter/PMID error messages, BAC check strings, BibLaTeX export labels, and citation reorder controls.
- Extend `generate_brand_assets.py` with `--locale` and `--all-locales` flags for generating localised WordPress.org banner variants.

### Docs

- Add `docs/i18n-process.md`: POT regeneration, MO compilation, JS JSON artifact guide, bundled-vs-official pack policy.
- Add `docs/a11y-audit-records/1.3.1.md`: Tier 1 and Tier 2 accessibility audit record; all automated checks green.
- Add `.planning/phases/05-writable-bibliography-rest/05-DESIGN-MEMO.md`: five-tier writable REST API design with ETag concurrency, capability matrix, and companion-plugin recommendation.

## [1.3.1] - 2026-05-10

### Added

- Bibliographies between 100 and 199 citations now show a dismissible editor notice warning that formatting may be slower on shared hosting.

### Changed

- Per-bibliography hard cap raised from 50 to 200 citations. The 50-entry per-paste limit is unchanged.

## [1.3.0] - 2026-05-09

### Added

- Explicit 50-citation total cap per bibliography block with inline editor warnings, replacing the silent 51-entry formatter cliff.
- Guard all async editor mutation flows (paste/import, manual add, delete, style switch, structured edit) against stale results from superseded in-flight format requests.
- Cache successful PMID proxy responses and deduplicate pending DOI resolution requests to reduce avoidable network traffic.

### Changed

- Removed redundant formatter call in the manual-entry add path; the merged bibliography is now formatted once instead of twice.
- Pruned non-runtime vendor documentation and images from the release zip and excluded `composer.lock`, reducing release package weight.

### Internal

- Refactored editor side-effects into focused hooks: `useCitationImportActions`, `useManualCitationActions`, and `useBibliographyExportActions`.
- Extracted PHP PMID resolver, cache, and permission logic into `includes/pmid.php`.

## [1.2.0] - 2026-05-08

### Added

- BibLaTeX export is available from the editor exports panel for LaTeX/Biber workflows with full Unicode support.
- PMID input resolution imports PubMed records through the authenticated WordPress REST proxy to the NCBI/PMC Literature Citation Exporter API.
- Numeric citation styles now support manual reordering, including visible move controls and keyboard Alt+Arrow movement.
- New bibliography blocks get style-aware default headings.

### Changed

- Citation mutations now reformat the full bibliography so cached display text, sort order, and metadata stay aligned after edits, deletes, style changes, and structured updates.
- Sorting now uses explicit style-family dispatch, author-date solo-first ordering, contributor-chain tie-breaks, and numeric no-op ordering where appropriate.
- OSCOLA users now see an editor notice explaining the current single-list limitation for grouped bibliographies.
- Readmes and release notes now highlight the 1.2.0 interoperability features, recent 1.1.x accessibility fixes, and ABNT (Associação Brasileira de Normas Técnicas) support targeting NBR 6023:2018.

### Fixed

- PMID resolution now uses an authenticated WordPress REST proxy so PubMed imports work in browsers despite NCBI's missing CORS headers.
- Saved citation URL links and block toolbar controls now expose clearer accessible names.
- Playwright accessibility and Playground smoke tests are more deterministic on GitHub Actions by selecting the block explicitly and serializing tests that share one Playground server.

### Internal

- Added JS/PHP sort-coordination fixtures, citeproc cross-runner conformance checks, targeted Codecov warning coverage, and locale/lock parity audit tests.
- Added compact matrix tests for all nine style save semantics, all nine formatter outputs, export ordering for author-date versus numeric styles, and PMID REST proxy regression coverage before tagging 1.2.0.

## [1.1.1] - 2026-05-07

### Fixed

- Block Accessibility Checks (BAC) integration shipped in 1.1.0 was registered against an outdated Block Accessibility Checks API and did not load reliably. The plugin now registers against the current BAC API, hardens the soft opt-in, and loads validation checks reliably so the `empty_bibliography` error and `heading_missing` warning checks fire as documented when the BAC plugin is active.
- Editor focus-ring regression in `editor.scss` is corrected so keyboard focus on entry actions remains visible.
- Playground demo blueprint installs the plugin from the latest release zip rather than a path that could become stale.

### Internal

- Test infrastructure improvements for BAC and a11y Playwright suites: deterministic setup, robust selectors, fixed strict-mode violations, and extended Tier 2/3 audit coverage. No functional change.
- Added internal sort-conformance development plan to `docs/planning/sort-conformance-plan.md` for upcoming sort-correctness work.

## [1.1.0] - 2026-05-04

### Added

- Block Accessibility Checks (BAC) integration as a soft dependency. When Troy Chaplin's Block Accessibility Checks plugin is active, the bibliography block registers two authoring-time checks: `empty_bibliography` (error — no citations added) and `heading_missing` (warning — no heading set, so screen reader users navigating by landmark heading cannot find the section). No functional change when BAC is not installed.

## [1.0.2] - 2026-05-04

### Fixed

- Explicitly enable Playground `features.intl` in both the GitHub demo blueprint and the WordPress.org Preview blueprint while retaining `phpExtensionBundles: ["kitchen-sink"]`, because the live browser Playground runtime requires the feature flag for `citeproc-php` formatter requests to load PHP `intl` reliably.
- Switch the GitHub demo blueprint to install Borges through the WordPress.org plugin resource instead of a GitHub Release asset URL, avoiding browser CORS failures in live Playground.

### Changed

- Clarify translation documentation so bundled seed PO/MO files are not confused with official WordPress.org language packs.

### Tests

- Add regression coverage that requires both Blueprint files to request `intl` through both supported Playground configuration forms.

## [1.0.1] - 2026-05-04

### Fixed

- Use the WordPress `apiFetch` helper for editor formatter REST requests so authenticated editor sessions include the expected REST nonce handling.
- Add the WordPress.org Playground preview blueprint at `assets/blueprints/blueprint.json` with the `kitchen-sink` PHP extension bundle so the PHP formatter can load `intl` in previews.

## [1.0.0] - 2026-04-07

### Added

- DOI and BibTeX input parsing via citation-js.
- Supported formatted citation input for books, articles, chapters, webpages, reviews, and theses.
- Manual entry with structured fields and per-type validation.
- Nine citation styles: Chicago Notes-Bibliography (default), Chicago Author-Date, APA 7, MLA 9, Harvard, Vancouver, IEEE, OSCOLA, and ABNT (Associação Brasileira de Normas Técnicas) targeting NBR 6023:2018.
- Automatic alphabetical sorting per style rules.
- Duplicate detection across paste and manual entry.
- Static save with semantic HTML (`role="doc-bibliography"`, `<cite>` wrappers, `lang` attributes, and no deprecated bibliography-entry ARIA role in newly saved output).
- Schema.org JSON-LD structured data output (on by default).
- Optional CSL-JSON machine-readable output.
- Optional COinS metadata for citation manager detection.
- Reference-manager friendly metadata and exports for Zotero, Mendeley, EndNote, JabRef, BibDesk, LaTeX, and CSL/citeproc workflows.
- Export: Download CSL-JSON, UTF-8 BibTeX, RIS; copy per-entry or full bibliography.
- Read-only REST API for programmatic bibliography access.
- Editor UI with paste zone, manual entry, per-entry edit/delete, and keyboard accessibility.
- Block-local Gutenberg notices with focus management.
- Structured per-field editing for heuristic or warning-marked citations.
- Lazy-loaded CSL style templates.
- XSS prevention: HTML escaping for citation text, `</` escaping in script blocks, HTML tag stripping from CrossRef metadata.
- Input caps: 50 entries per paste, 1 MB max input size.
- GitHub Actions CI: lint, test, build, PHPUnit, Psalm, CodeQL, Codecov, Playwright Playground smoke tests, runtime matrix.
- Multisite runtime smoke coverage with network activation on an Apache/PHP/latest-WordPress lane.
- Release workflow with tag-triggered GitHub Release and zip artifact, plus WordPress.org release packaging with third-party notices.
- WordPress Playground blueprint for instant evaluation.
- Lifecycle end-to-end tests for activate, deactivate, and delete flows.
- Lifecycle CI coverage.
- Refined WordPress.org branding assets, including updated banner and icon artwork.
- Bundled interface locale files for French, German, Dutch, Swedish, Spanish, Italian, Portuguese, Polish, Russian, Japanese, Simplified Chinese, Korean, Serbian, Croatian, Brazilian Portuguese, Hindi, Bengali, Tamil, and Telugu.
- 25 additional regression tests covering REST defaults, structured-edit cancellation races, focus helper behavior, manuscript/review italics branches, BibTeX aliases, thesis COinS output, and corrected JSON-LD mappings.
- New dedicated hook test files for `use-citation-editor-state` and `use-entry-focus`.
- PHP utility-function tests for REST/export helper behavior, formatter normalization, block collection, and JSON encoding.

### Changed

- Improved reset icon from minus to counterclockwise arrow for clarity.
- BibTeX exports preserve Unicode quotation marks instead of TeX quote ligatures for cleaner Zotero, Mendeley, and BibTeX-family imports.
- `aria-label` on bibliography section now matches custom heading text when set.
- Added an accessible name to citation entry buttons.
- Added `role="region"` and `aria-label` to the editor notice container.
- Added `prefers-reduced-motion` override for action button transitions.
- Added `focus-visible` outline to bibliography list entries.
- Removed the redundant `aria-label` from the inline edit input.
- Aligned WordPress.org-facing package identifiers around the approved `borges-bibliography-builder` slug while preserving the existing block namespace and saved CSS classes for content/theme compatibility.
- Normalized GitHub, Playground, Plugin URI, security-reporting, and language-header URLs around `dknauss/borges-bibliography-builder`.
- Standardized the first public release package on `borges-bibliography-builder.zip` with no transition zip.
- Removed dead exports and branches in the parser and style registry, including the unused `SUPPORTED_INPUT_MESSAGE` re-export and experimental style-picker path.
- Psalm failures now block CI instead of running with `continue-on-error`.
- Playwright smoke tests now use configurable frontend and REST paths through `SMOKE_FRONTEND_PATH` and `SMOKE_REST_PATH`.

### Security

- Overrode the vulnerable transitive development dependency `basic-ftp` to the patched release.

### Fixed

- REST responses now treat `outputJsonLd` as enabled when the attribute is absent from stored block attributes, matching the block default for older or migrated blocks.
- Structured edit cancellation now guards both before and after bibliography formatting resolves, preventing stale formatted data from being committed after a late cancel.
- The PHPUnit `wp_strip_all_tags()` stub now matches WordPress behavior and no longer collapses whitespace, exposing plain-text rendering bugs more accurately.
- `jsonld.js` now maps chapter citations with a container title to `isPartOf: { @type: "Book" }`, and maps `review-book` to `Review`.
- `coins.js` now emits dissertation-specific COinS metadata for thesis citations instead of falling back to the journal format.
- ABNT/NBR 6023:2018 formatter normalization now collapses duplicate page markers such as `p. p.` and `p. pp.`.
