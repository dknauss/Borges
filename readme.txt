=== Borges Bibliography Builder ===
Contributors: dpknauss
Donate link: https://github.com/sponsors/dknauss
Tags: bibliography, citations, references, academic, apa
Requires at least: 6.4
Tested up to: 7.2
Stable tag: 1.21.0
Requires PHP: 8.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Build correct bibliographies in APA, Chicago, MLA, and six more styles. Paste a DOI or citation, and Borges formats, sorts, and links it for you.

== Description ==

**Structured bibliographies and inline citations in any style.**

Borges turns a DOI, a PubMed ID, an ISBN, an export from Zotero or EndNote, or a citation you copied from somewhere else into a clean, correctly formatted bibliography in the style your field uses. Add in-text citations that link to their entries, switch styles with one click, and everything updates to match.

Borges is for writers, scholars, students, journals, libraries, and anyone publishing with sources on WordPress. There is nothing to configure and no account to create. Your bibliographies are saved as plain HTML in your posts, so they stay readable even if you switch the plugin off.

**[Try it in your browser](https://playground.wordpress.net/?blueprint-url=https://raw.githubusercontent.com/dknauss/Borges/main/playground/blueprint.json)** before you install. It opens a demo post in a disposable WordPress site.

= What you can do =

**Paste it, done.** Drop in a DOI, a PubMed ID, an arXiv ID, an ISBN, a BibTeX or RIS export from your reference manager, or a citation typed in any style. Borges looks up the details and fills in the fields. Paste up to 50 at once.

**Use the style your field requires.** Chicago (notes-bibliography and author-date), APA 7, MLA 9, Harvard, Vancouver, IEEE, OSCOLA, and ABNT, each following its current manual. Sorting, numbering, and repeated-author rules are handled for you.

**Cite as you write.** Choose Cite in any paragraph to add a short citation, such as "(Illich 1973, 12)" or a Chicago short note, that links to its entry in the bibliography. It works in running text and in margin notes, and readers need no JavaScript to follow it.

**Change styles without retyping.** Switch from APA to Chicago and the whole bibliography reformats in seconds. Update citations rewrites your in-text citations to match, keeping every page number and leaving any you reworded alone.

**Fix anything by hand.** Edit any field of any entry, or build a citation from scratch with a simple form.

**Write annotated bibliographies.** Add a note of any length under any entry, and turn on Show annotations to publish it. Notes travel with your exports.

**Let readers cite you back.** Turn on a Cite / Export button under each entry, and readers can copy the citation or download it for Zotero, EndNote, Mendeley, or BibTeX.

**Accessible by default.** Real list markup, full keyboard support (including Alt+Arrow to reorder numbered entries), visible focus, and screen-reader-friendly output. Works with the Block Accessibility Checks plugin to catch problems before you publish.

**Recognized by search engines and research tools.** Each entry carries structured data (JSON-LD, COinS, and microformats) that Google, Zotero, and citation crawlers read, so your sources are recognized as sources.

**Bring your reference manager.** Import from and export to Zotero, Mendeley, EndNote, JabRef, BibDesk, and LaTeX workflows in BibTeX, BibLaTeX, RIS, and CSL-JSON.

**Email and newsletter ready.** Bibliographies read correctly in Jetpack and WordPress.com newsletters and in feeds.

**No lock-in, no bloat.** No shortcodes, no database tables, no settings to manage, and nothing loaded on pages without a bibliography. Deactivate Borges and your bibliographies stay put.

= Why "Borges"? =

Borges is named for Jorge Luis Borges (1899–1986), the Argentine writer and librarian who imagined an infinite library of every possible book. This one is smaller, and it's sorted.

If Borges saves you time and brings a little order to your citations, you can [sponsor its development](https://github.com/sponsors/dknauss).

== Installation ==

1. In your WordPress dashboard, go to Plugins > Add New, search for "Borges Bibliography Builder", and click Install Now. You can also upload the plugin files to `/wp-content/plugins/borges-bibliography-builder/`.
2. Activate the plugin.
3. Add the Bibliography block to any post or page.
4. Paste a DOI or a formatted citation, and Borges does the rest.

== Frequently Asked Questions ==

= Which citation styles does Borges support? =

Nine: Chicago Notes-Bibliography, Chicago Author-Date, APA 7, MLA 9, Harvard, Vancouver, IEEE, OSCOLA, and ABNT (NBR 6023:2025). Each follows its manual's current edition, including its sorting, numbering, and repeated-author rules. Every style is a [Citation Style Language](https://citationstyles.org/) file written for Borges.

= Can I paste citations from Zotero, EndNote, Mendeley, or Google Scholar? =

Yes. Export BibTeX or RIS from any of them (a single record or a whole `.ris` file) and paste it in. You can also paste a formatted citation copied from Google Scholar, a library catalog, or another document. If it includes a DOI or PubMed ID, Borges looks up the full record; otherwise it reads the citation into fields for you to check.

To take a bibliography back out, download it as BibTeX, BibLaTeX, RIS, or CSL-JSON. Zotero can also pick up entries straight from the published page.

= What happens to my bibliographies if I deactivate or delete Borges? =

They stay in your posts. Bibliographies are saved as plain HTML, not in a database table the plugin owns, so they remain readable with Borges switched off. Deleting the plugin removes only its own cached lookup data and leaves your content untouched.

= Can my readers cite or download my sources? =

Yes, if you want them to. Turn on the per-entry Cite / Export panel in the block settings, and readers can copy any citation or download it as RIS, BibTeX, BibLaTeX, or CSL-JSON. It's off by default, uses a tiny script with no dependencies, and stays out of newsletters and feeds.

= Is Borges accessible? =

Yes. Bibliographies use real list markup and a labeled heading, and every editing action works from the keyboard. Screen readers hear repeated authors' names even where a style prints a dash. With Block Accessibility Checks 4.0 or later active, the block also warns you about a missing heading, citations linked only by a bare URL or DOI, and an empty bibliography.

= What can I paste in? =

Bare DOIs and DOI links, PubMed PMIDs and PubMed Central PMCIDs, arXiv IDs and links, ISBNs, OCLC numbers, LCCNs, Open Library edition IDs, Internet Archive items, BibTeX and BibLaTeX, RIS, CSL-JSON, and formatted citations for books, articles, chapters, webpages, reviews, and theses. You can paste up to 50 entries at once, and each bibliography holds up to 200.

= Can I edit the bibliography heading and the entries? =

Yes. Set the heading text and level in the block settings, and center it or align it to the start from the block toolbar. Edit any entry field by field, or reorder entries by hand in numbered styles such as IEEE and Vancouver.

= Does the ABNT style implement NBR 6023:2025? =

Yes. The ABNT option targets Associação Brasileira de Normas Técnicas bibliography formatting under NBR 6023:2025, uses the `pt-BR` locale, and defaults new ABNT bibliographies to the heading `Referências`. Always verify institutional or journal-specific ABNT variants before submission.

= ISBN lookups sometimes fail with a Google Books error. What can I do? =

Borges looks ISBNs up in Open Library first and falls back to Google Books, whose free anonymous quota sometimes runs out. Create a Google Books API key and add it to `wp-config.php`:

`define( 'BIBLIOGRAPHY_BUILDER_GOOGLE_BOOKS_API_KEY', 'your-key' );`

Developers can supply it with the `bibliography_builder_google_books_api_key` filter instead.

= Does Borges work on WordPress Multisite? =

Yes, including network activation. If you run into trouble on a particular network setup, please report it.

= What PHP and WordPress versions are supported? =

PHP 8.1 or later and WordPress 6.4 or later. Borges is tested up to WordPress 7.2.

= Can developers read or change bibliographies over the REST API or WP-CLI? =

Yes. Borges offers read-only REST endpoints for every bibliography in a post (as JSON, plain text, or CSL-JSON), WordPress Abilities, and `wp borges` commands. Write routes that add, change, and restyle citations are available when a developer turns them on with the `bibliography_builder_enable_write_routes` filter. See the [REST API section of the README](https://github.com/dknauss/Borges#rest-api) for details.

= Which translations are available? =

The Languages list on this page shows the published language packs. Borges's interface is translation-ready, and new languages appear as community translations are approved on translate.wordpress.org. See [Language Support](https://github.com/dknauss/Borges#language-support) in the README for the seed translation files included with the plugin.

== Screenshots ==

1. A finished bibliography on the published page: hanging indents, italic titles, and linked DOIs, styled by your theme.
2. Find the Bibliography block by searching for "Bibliography" in the block inserter.
3. Paste DOIs, PubMed IDs, BibTeX, RIS, or plain citations, and Borges fills in the details. Hover any entry to copy, edit, or delete it.
4. No identifier? Build a citation field by field with Manual Entry.
5. Fix any field of an imported citation in place, without retyping the whole entry.
6. Set the numbering for IEEE and Vancouver by moving entries up and down, with the mouse or Alt+Arrow keys.
7. Pick the citation style, the heading, and what readers and search engines get, all from the block sidebar.
8. Take your bibliography with you: copy it as text, or download CSL-JSON, BibTeX, BibLaTeX, or RIS.
9. Readers can open Cite / Export under any entry to copy the citation or download it for their reference manager.

== Lightweight by design ==

Borges formats your bibliography in the editor and saves it as plain HTML in your post, so published pages do almost no extra work.

* **No added database queries** on published pages, however many citations a page holds.
* **About 4 KB of front-end assets** (a small script and stylesheet), loaded only on pages with a bibliography.
* **Nothing left behind.** No settings, custom tables, post types, or scheduled tasks. Lookups made while editing are cached briefly and cleared on delete.

Details, including installed size, are in the [Footprint & Performance section of the README](https://github.com/dknauss/Borges#footprint--performance).

== Known Limitations ==

**OSCOLA tables** — An OSCOLA bibliography that cites cases, legislation, or treaties lists them in a table of cases, a table of legislation, and a table of treaties before the secondary sources, as OSCOLA 5 asks. The tables are not divided by jurisdiction, statutes have no sub-entries for the sections cited, and "R v" cases file under R, which is OSCOLA's rule for works other than criminal-law works.

== Development ==

Full developer documentation, source code, issue tracker, and contribution guidelines are on GitHub:

[https://github.com/dknauss/Borges](https://github.com/dknauss/Borges)

Bug reports, feature requests, and pull requests are welcome. See CONTRIBUTING.md in the repository for development setup, coding standards, and the PR process.

== External Services ==

This plugin connects to fixed scholarly metadata services only when you explicitly add an identifier in the block editor — no citation data is sent automatically or in the background. No account or API key is required for any of the supported DOI, PMID, PMCID, arXiv, ISBN, library catalog, or Internet Archive lookups.

**DOI metadata**

DOI input connects to the **Crossref REST API** (https://api.crossref.org/) to resolve citation metadata.

* Crossref service: https://www.crossref.org/
* Crossref REST API documentation: https://api.crossref.org/swagger-ui/index.html
* Crossref privacy policy: https://www.crossref.org/privacy/
* Crossref terms of service: https://www.crossref.org/terms/

**PubMed/PMID and PubMed Central/PMCID metadata**

PubMed/PMID and PubMed Central/PMCID input connects through the plugin's authenticated WordPress REST proxy to the **NCBI/PMC Literature Citation Exporter** CSL endpoints. The proxy uses a fixed upstream host and validates the identifier as numeric before making the outbound request. Only the identifier is sent.

* NCBI APIs: https://www.ncbi.nlm.nih.gov/home/develop/api/
* NCBI/PMC Literature Citation Exporter: https://pmc.ncbi.nlm.nih.gov/api/ctxp/
* NLM Web Policies: https://www.nlm.nih.gov/web_policies.html

**arXiv metadata**

arXiv IDs, arxiv.org links, and arXiv DOIs connect through the plugin's authenticated WordPress REST proxy to the **arXiv API** (https://export.arxiv.org/api/query). The proxy uses a fixed upstream host and validates the arXiv ID pattern before making the outbound request. Only the arXiv ID is sent.

* arXiv API: https://info.arxiv.org/help/api/index.html
* arXiv API Terms of Use: https://info.arxiv.org/help/api/tou.html
* arXiv privacy policy: https://info.arxiv.org/help/policies/privacy_policy.html

**ISBN metadata**

ISBN input connects through the plugin's authenticated WordPress REST proxy to **Open Library** (https://openlibrary.org), run by the Internet Archive: its ISBN edition endpoint (https://openlibrary.org/isbn/) for the book record and its search API (https://openlibrary.org/search.json) for author names. If Open Library has no record or cannot be reached, the proxy falls back to the **Google Books API** (https://www.googleapis.com/books/v1/volumes). All upstream hosts are fixed, and the ISBN checksum is verified before any outbound request. Only the ISBN is sent, plus the site's own Google Books API key if one is defined in `wp-config.php` (the `BIBLIOGRAPHY_BUILDER_GOOGLE_BOOKS_API_KEY` constant). The key goes only to Google Books and is never sent to the browser.

* Open Library Books API (ISBN endpoint): https://openlibrary.org/dev/docs/api/books
* Open Library Search API: https://openlibrary.org/dev/docs/api/search
* Internet Archive terms of use: https://archive.org/about/terms.php
* Google Books APIs: https://developers.google.com/books
* Google APIs Terms of Service: https://developers.google.com/terms
* Google Privacy Policy: https://policies.google.com/privacy

**Library catalog numbers and Internet Archive items**

OCLC numbers, LCCNs, and Open Library edition IDs connect through the plugin's authenticated WordPress REST proxy to **Open Library's Books API** (https://openlibrary.org/api/books). Internet Archive item links, `ia:` identifiers, and Internet Archive ARKs connect to the **Internet Archive** item metadata API (https://archive.org/metadata/); an ARK is first matched to its item through the Internet Archive's advanced search (https://archive.org/advancedsearch.php). When the item lists its Open Library edition, ISBN, or LCCN, that identifier is then looked up through Open Library (with the Google Books fallback for an ISBN). All upstream hosts are fixed, and each identifier is validated before any outbound request. Only the identifier is sent.

* Open Library Books API: https://openlibrary.org/dev/docs/api/books
* Internet Archive developer documentation: https://archive.org/developers/
* Internet Archive terms of use: https://archive.org/about/terms.php

== Changelog ==

= 1.22.0 =
* **Changed:** Borges now requires PHP 8.1 or later. PHP 7.4 and 8.0 no longer get security fixes. Sites on an older PHP version stay on 1.21.0, because WordPress doesn’t offer an update that needs a newer PHP than the server runs.

= 1.21.0 =
* **Fixed:** bibliographies sent by email, such as WordPress.com and Jetpack newsletters, which build emails from the saved post, no longer show bullets and an indent. Saved lists now carry the no-bullet style inline; numbered lists keep their numbers, and nothing changes on the web. Existing posts stay valid and pick up the change when next saved in the editor.
* **Changed:** heading alignment moved from the sidebar to an "Align heading" menu in the block toolbar. The setting and saved markup are unchanged.

= 1.20.0 =
* **Added:** a "Repeated authors" setting. MLA 9 and OSCOLA blocks can write repeated names out instead of using their marks, Chicago blocks can use the 17th edition's 3-em dash ("———."), and ABNT blocks NBR 6023:2002's underscore line ("______."). Screen readers hear the names, and copied text and exports keep them.
* **Added:** Harvard, IEEE, and Vancouver citations can be pasted as text with no DOI or other identifier, and are read into their fields: journal articles, books, chapters, conference papers, preprints, encyclopedia entries, and web pages (and theses in IEEE). Check the fields before publishing, as the note under each such entry asks.
* **Changed:** the bibliography heading is centered again, as APA, MLA, Chicago, Turabian, and ABNT ask, with a new "Heading Alignment" setting to put it at the start of the line. A theme can still set its own alignment.
* **Changed:** clearer wording in the "Citations in this post" panel ("in-text citations", "edited by hand").
* **Fixed:** PubMed and PubMed Central records print cleanly: bare initials get their periods, an issue sent as "Pt 8" prints as "8", and an NLM journal subtitle ("Brain : a journal of neurology") is dropped when the record's short title says so.
* **Fixed:** pasted citations the editor can't read are turned away instead of read wrongly, numbered entries ("[1] …") lose their numbers, and citations read by the parser's less certain patterns ask you to check their fields.
* **Fixed:** `POST /bibliography/v1/format` answers `400` when a request sends no `cslItems` list, instead of an empty bibliography, and accepts `items` as an alias.

= 1.19.1 =
* **Fixed:** OSCOLA tables of legislation and treaties print titles in roman, as OSCOLA 5 asks, not italics.
* **Fixed:** OSCOLA statutory instruments keep their SI number ("Air Navigation Order 2016, SI 2016/765").
* **Fixed:** JSON-LD author names keep their particles ("Ludwig van Beethoven"). Published posts are corrected without being re-saved.
* **Fixed:** after **Update citations**, the "Citation style changed" notice is dismissed.

= 1.19.0 =
* **Added:** in-text and margin citations. A **Cite** control in the toolbar links a short citation in any paragraph, heading, list item, or quote (including a theme's margin-note or gloss style) to an entry in a bibliography on the same post, with an optional page, chapter, or section. The short form follows the bibliography's style: a Chicago short note, "(Author Year, page)", or "[2]". Citations are plain links to their entries, so they work with no script on the page.
* **Added:** **Update citations**. After a style change, a notice and the bibliography's new "Citations in this post" panel rewrite every citation the editor wrote in the new style and numbering, keeping its page, as one step you can undo. Citations you reworded are left alone unless you choose otherwise.
* **Added:** annotated bibliographies. Each entry can carry your own note on the work, stored in CSL `annote`, and a new "Show annotations" setting prints the notes under their entries. They import from BibTeX and BibLaTeX and export to CSL-JSON, BibTeX, BibLaTeX, and RIS.
* **Added:** microformats. Each entry is marked up as an `h-cite`, with authors, date, DOI, URL, container, and publisher, so IndieWeb tools read the bibliography as citations. Nothing visible changes.
* **Added:** journal abbreviations in the RIS export (`J2`), and sentence case in Harvard.
* **Changed:** with Yoast SEO, the page's schema.org `citation` now carries each cited work's full record, so Yoast's schema aggregator and NLWeb receive authors, identifiers, journals, and pages, not just titles. The `bibliography_builder_yoast_citation_records` filter restores the short references.
* **Changed:** the bibliography heading is start-aligned by default.
* **Fixed:** cited works were missing from Yoast SEO graphs built outside the page request, such as NLWeb's answers over MCP.

= 1.18.0 =
* **Added:** sentence case in APA 7, Vancouver, and IEEE. Titles imported in title case print in sentence case, as the manuals ask; the stored title never changes, so switching styles brings the capitals back. Languages, nationalities, countries, provinces, states, months, and days keep their capitals, and the `bibliography_builder_sentence_case_proper_nouns` filter adds your own. Other names can come out lowercase ("Darwin and wallace"), so each entry has a "Keep title capitalization as entered" checkbox. Existing blocks change only when their entries are next formatted.
* **Added:** journal abbreviations in IEEE and Vancouver, from the record's abbreviated title when it has one, with a new "Journal abbreviation" field in the entry editor.
* **Added:** OSCOLA repeated authors. One author's works come oldest first, and after the first the name becomes a double em dash, as OSCOLA 5 asks.
* **Changed:** new bibliographies start with an h2 heading, so they appear in the page's heading outline. Existing blocks keep their level; the `bibliography_builder_new_block_heading_level` filter sets another.
* **Changed:** the heading takes its size and weight from the theme's headings, and stays centred.
* **Changed:** citation links no longer carry `nofollow` or `noreferrer`, which told search engines not to trust the works you cite. They carry `rel="noopener"`, on saved posts too. The new `bibliography_builder_citation_link_rel` filter can restore `nofollow`.
* **Changed:** the bibliography is named by its visible heading (`aria-labelledby`) rather than a copy of it, on saved posts too.
* **Fixed:** the default heading keeps its look in newsletters and feeds, and two undated works by one author sort by title in author-date styles.

= 1.17.0 =
* **Added:** OSCOLA tables of primary sources. An OSCOLA bibliography with cases, legislation, or treaties lists them as OSCOLA 5 asks: a table of cases, then legislation, then treaties, then the bibliography of secondary sources. Existing blocks stay valid and take the new shape the next time they are edited.
* **Added:** on sites without Yoast SEO or Rank Math, the page's own `WebPage` structured data now links the cited works as schema.org `citation`. The new `bibliography_builder_page_citation_node` filter can change or drop it.
* **Changed:** Google's Rich Results Test no longer reports bibliographies as invalid items: each JSON-LD entry carries `item` without `url`. Encyclopedia and dictionary entries name their reference work.
* **Changed:** COinS names each entry's type, so Zotero's browser connector imports a chapter as a book section, a conference paper with its proceedings, and a book with its edition.
* **Fixed:** VoiceOver in Safari reads the bibliography as a list again ("list, 12 items", "7 of 12"). Saved posts need no change.
* **Fixed:** arXiv numbers print once in APA 7 and IEEE, not as "arXiv:arXiv:1706.03762".

= 1.16.0 =
* **Added:** RIS import. Paste a whole `.ris` export or single records from Zotero, Mendeley, EndNote, or another reference manager, alone or mixed with DOIs and formatted citations, and each record imports as a citation.
* **Added:** `wp borges duplicates`, a read-only report of repeated citations within each bibliography and across the bibliographies of one post. Bulk deduplicate now copies any field the kept copy lacks (a DOI, pages, a volume) from the copies it removes.
* **Changed:** richer structured data as pages render: magazine, newspaper, and web citations name their container in JSON-LD, conference papers are part of their proceedings, and COinS lists every author and the PubMed ID, so Zotero's browser connector imports the whole author list. Saved posts are unchanged. The new `bibliography_builder_enrich_coins` filter turns the COinS change off.
* **Fixed:** titles stored with straight apostrophes or quotation marks are now italicized.
* **Fixed:** BC dates. Years before 1000 now print in every style ("334 BCE", "731"; ABNT "334 AEC"), and string BC years in pasted CSL-JSON are kept.
* **Fixed:** sorting. In Chicago notes-bibliography and OSCOLA a single author sorts before co-authored works that begin with the same name, and ABNT files titles without Portuguese leading articles (O, A, Os, As, Um, Uma, Uns, Umas).
* **Fixed:** reference-manager imports: Mendeley's `city` field becomes the place of publication, BibTeX thesis and report types get readable genres, EndNote and Mendeley entries without cite keys import, comments in JabRef files are ignored, and pasted XML exports get a clear notice instead of becoming a citation.

= 1.15.0 =
* **Added:** bulk reformat across posts. With the write routes turned on, `POST /bibliography/v1/bulk/reformat` switches every bibliography in up to 25 posts to one citation style and saves each post once. It needs `edit_others_posts` plus `edit_post` on each post, previews unless `dry_run=false`, and returns the posts it did not reach as `remaining`. The `borges/bulk-reformat` ability and `wp borges reformat <post-id>... --style=<key> --user=<user>` do the same.
* **Added:** bulk deduplicate across posts. `POST /bibliography/v1/bulk/deduplicate`, the `borges/bulk-deduplicate` ability, and `wp borges deduplicate` remove repeated citations within each bibliography, keeping the first copy. A work listed in two bibliographies of one post is reported and left in place.
* **Added:** a rate limit for bulk edits: 250 posts per user per 15 minutes, dry runs included, and one saving bulk request at a time per site. Responses carry `RateLimit-*` headers; a request over the limit gets `429` with `Retry-After`. Filters let hosts change the numbers. WP-CLI commands spend no budget.
* **Fixed:** editing a citation can no longer turn it into a copy of another citation in the same bibliography. The block's field editor refuses the edit with a notice, and the REST update route and `borges/update-citation` ability return `409`. Repeats across two bibliographies on a page are still allowed.

= 1.14.0 =
* **Added:** WP-CLI commands. `wp borges list <post-id>` lists a post's bibliographies, `wp borges export <post-id>` prints one as CSL-JSON, plain text, or JSON, and `wp borges validate <post-id>` reports errors and warnings for every entry and exits 1 when there are errors. They change nothing. Without `--user` they read any post, as WordPress's own commands do; with `--user` they apply that user's permissions, the same as the REST API.
* **Fixed:** works by the same authors in the same year are told apart in APA, Chicago author-date, Harvard, and ABNT: "Jones, T. (2020a)." and "(2020b).", lettered in the order the bibliography lists them. Saved posts stay valid; a bibliography takes its letters the next time it is formatted (when a citation is added, edited, or removed, or the style changes). The REST write routes and abilities keep the letters current too.

= 1.13.0 =
* **Added:** richer structured data for search engines and AI crawlers. As a page renders, each cited work in the bibliography's JSON-LD gains an `@id`, its DOI, PMID, PMCID, arXiv, and ISBN identifiers with `sameAs` links, journal issue and volume, pages, editors and translators, and a closer schema.org type, and each entry links to its place on the page. Published posts get this without being edited. The `bibliography_builder_enrich_json_ld` filter turns it off.
* **Added:** with Yoast SEO or Rank Math, the page's Article lists the cited works under schema.org `citation`. The `bibliography_builder_link_page_citations` filter turns it off.
* **Added:** the `bibliography_builder_output_defaults` filter sets which outputs (JSON-LD, COinS, CSL-JSON, Cite / Export) a newly inserted bibliography starts with. Existing blocks keep their settings, and Borges still stores no settings.

= 1.12.0 =
* **Added:** write abilities for AI agents and automation on WordPress 6.9+ (add, update, delete, and reorder citations; change a bibliography's settings or style). They exist only when a site turns on the write routes with the `bibliography_builder_enable_write_routes` filter, and follow the same rules: `edit_post` on the post and a preview unless asked to save.
* **Fixed:** bibliographies in newsletters and feeds. Posts sent by email (Jetpack and WordPress.com newsletters, MailPoet, WooCommerce, Newspack) or read in a feed reader no longer show every reference in italics or a broken Cite / Export panel. Posts saved earlier are cleaned up as they are sent, and switch to the new markup the next time they are saved.
* **Fixed:** names with particles ("van Duijnhoven", "de la Cruz") sort where each style puts them: under the surname proper in Chicago and Vancouver, under the particle in APA, MLA, Harvard, and the others.
* **Fixed:** no period after a quoted title that ends in "?" or "!" in Chicago and MLA.
* **Changed:** reformatting after an edit is much faster in long bibliographies: only the changed entries are formatted, about 5 ms instead of 65–105 ms for 200 entries.
* **Changed:** internal restructuring and stricter static analysis, with no change to saved markup or output.

= 1.11.0 =
* **Fixed:** link cards no longer credit a cited source as the post's author. The JSON-LD listed cited works as top-level objects, and Mastodon takes the first top-level `WebPage` on a page to be the page itself, so a post citing a museum's collection page was shared "by Albertina". Cited works are now nested in one schema.org `ItemList`. Published posts are corrected as they are rendered, without being edited.
* **Fixed:** bibliographies over 50 citations. The server formatter now takes up to 200 entries per request, matching the editor, instead of falling back to plain titles with a "Formatter unavailable" notice.

= 1.10.0 =
* **Added:** library catalog numbers. Paste an OCLC number, an LCCN, or an Open Library edition ID (or their WorldCat, lccn.loc.gov, or Open Library links) and the book is looked up through Open Library. When Open Library has no record, Borges says so and suggests the ISBN.
* **Added:** Internet Archive items. Paste an archive.org item link, `ia:<identifier>`, or an Internet Archive ARK. Borges cites the edition the item names (its Open Library edition, ISBN, or LCCN) and keeps the archive.org page as the link, or tidies the scan's own record when it names none.
* **Added:** an optional Google Books API key for the ISBN fallback, set with the `BIBLIOGRAPHY_BUILDER_GOOGLE_BOOKS_API_KEY` constant or a filter, so lookups no longer depend on Google's shared anonymous quota. Borges still stores no settings.
* **Changed:** "Edit fields" now works on every citation, not only ones typed as free text. Only the fields you change are saved; untouched DOIs, URLs, authors, and dates stay exactly as imported.
* **Fixed:** a journal name that is part of its own DOI, such as eLife, is no longer italicized inside the DOI link, which split the link. Bibliographies saved with the broken link stay valid and are fixed the next time they are saved.
* **Fixed:** "Place: Publisher" in pasted citations (`London: Boyars, 1976`) is split into place and publisher.
* **Fixed:** Chinese, Japanese, and Korean author names, and names with a gloss in parentheses, are kept whole in book lookups; a leading Dr., Prof., Mr., Mrs., Ms., Mx., or Rev. is dropped.

= Earlier versions =
For 1.9.1 and earlier, see the full [changelog on GitHub](https://github.com/dknauss/Borges/blob/main/CHANGELOG.md).

== Upgrade Notice ==

= 1.22.0 =
Requires PHP 8.1 or later. Sites running PHP 7.4 or 8.0 stay on 1.21.0: WordPress won’t offer this update until the server runs PHP 8.1 or newer. Existing blocks stay valid. No configuration changes required.

= 1.21.0 =
Bibliographies in emails built from the saved post (WordPress.com and Jetpack newsletters) no longer show bullets. Existing blocks stay valid and pick up the change when next saved. No configuration changes required.

= 1.20.0 =
Repeated authors setting; Harvard, IEEE, and Vancouver citations paste as text; the heading is centered again, with a Heading Alignment setting; cleaner PubMed records. Existing blocks stay valid. No configuration changes required.

= 1.19.1 =
OSCOLA fixes (roman titles in tables of legislation and treaties, SI numbers) and name particles in JSON-LD author names. Existing blocks stay valid. No configuration changes required.

= 1.19.0 =
In-text and margin citations with Update citations after a style change; annotated bibliographies; microformats for each entry; full citation records in Yoast SEO's graph. Existing blocks stay valid. No configuration changes required.

= 1.18.0 =
Sentence case in APA, Vancouver, and IEEE (check personal names, and tick "Keep title capitalization as entered" where needed); journal abbreviations; OSCOLA repeated authors; citation links without nofollow; new blocks start with an h2. Existing blocks stay valid. No configuration changes required.

= 1.17.0 =
OSCOLA tables of cases, legislation, and treaties; structured data that passes Google's Rich Results Test and links cited works on every site; VoiceOver reads the bibliography as a list again in Safari. No configuration changes required.

= 1.16.0 =
RIS import, BC dates and years before 1000, fuller JSON-LD and COinS for published posts, sorting fixes for Chicago notes, OSCOLA, and ABNT, and several reference-manager import fixes. No configuration changes required.

= 1.15.0 =
Opt-in bulk reformat and bulk deduplicate across posts (REST, abilities, and WP-CLI) with a per-user rate limit, and editing a citation can no longer create a duplicate. No configuration changes required.

= 1.14.0 =
Same-author, same-year works get 2020a and 2020b in APA, Chicago author-date, Harvard, and ABNT, and new read-only WP-CLI commands list, export, and validate bibliographies. No configuration changes required.

= 1.13.0 =
Richer JSON-LD for each cited work, a schema.org `citation` link from the post with Yoast SEO or Rank Math, and a filter for site-wide output defaults. Published posts are enriched as they render. No configuration changes required.

= 1.12.0 =
Bibliographies read correctly in newsletters and feeds, names with particles sort per style, and reformatting after an edit is much faster. Adds opt-in write abilities for WordPress 6.9+. No configuration changes required.

= 1.11.0 =
Stops link previews (Mastodon's, for one) from crediting a cited source as the post's author, and lets bibliographies over 50 citations format again. No configuration changes required.

= 1.10.0 =
Adds OCLC, LCCN, Open Library, and Internet Archive lookups and "Edit fields" for every citation. These lookups contact Open Library and the Internet Archive only when you paste those identifiers. No configuration changes required.

= 1.9.1 =
Imports pasted CSL-JSON and stops italicizing quoted titles such as Chicago web pages. No configuration changes; no new external services.

= 1.9.0 =
Adds a Heading Level setting so the bibliography's heading can be a real heading (h2–h6). Existing bibliographies are unchanged. No configuration changes; no new external services.

= 1.8.2 =
The edit form now drops HTML typed or pasted into citation fields. No configuration changes; no new external services.

= 1.8.1 =
Fixes HTML tags such as `<i>` showing as literal text in a bibliography. No configuration changes; no new external services.

= 1.8.0 =
Moves Chicago, Harvard, OSCOLA, and ABNT to their current editions, adds MLA's three hyphens for repeated authors, and adds an Article number field for journal articles. No configuration changes; no new external services.

= 1.7.0 =
Rewrites all nine citation styles in full, fixes organization authors, blocks that showed as invalid in another editor language, and seven wrong strings in the bundled translations. Adds opt-in REST routes for developers; they are off unless enabled. No new external services.

= 1.6.0 =
Adds PubMed Central, arXiv, ISBN, and BibLaTeX import, plus read-only WordPress Abilities on WordPress 6.9+. Lookups contact arXiv, Open Library, or Google Books only when you paste those identifiers. No configuration changes.

= 1.5.1 =
Adds WordPress 7.1 support and fixes a case where "Copy citation" reported failure although copying was still possible. No security content; no configuration changes.

= 1.5.0 =
Security release; updating is recommended. Fixes an unauthenticated denial-of-service weakness in the public bibliography REST route, present in 1.4.2 and earlier, where oversized stored citation text cost seconds of CPU per read. Also includes hardening; requires Block Accessibility Checks 4.0.

= 1.4.2 =
Improves free-text citation imports by resolving embedded DOI and PMID identifiers before falling back to heuristic parsing.

= 1.2.0 =
Adds BibLaTeX and PubMed/PMID interoperability, numeric citation reordering, stronger sort parity, and explicit ABNT/NBR 6023:2018 docs.

= 1.1.1 =
Fixes Block Accessibility Checks integration and editor focus visibility.

= 1.0.2 =
Fixes WordPress Playground demo formatting when the browser runtime does not load PHP Intl from the extension bundle alone.

= 1.0.1 =
Fixes WordPress.org Playground preview and editor formatter fallback behavior.

= 1.0.0 =
Initial public release of Borges Bibliography Builder.
