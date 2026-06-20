=== Borges Bibliography Builder ===
Contributors: dpknauss
Donate link: https://github.com/sponsors/dknauss
Tags: bibliography, citation, doi, bibtex, academic
Requires at least: 6.4
Tested up to: 7.0
Stable tag: 1.4.0
Requires PHP: 7.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Paste DOI, PubMed/PMID, BibTeX, or citations — get a formatted, auto-sorted bibliography in nine academic styles.

== Description ==

Named for Jorge Luis Borges (1899–1986), the Argentine writer and librarian known for stories about infinite libraries, imaginary books, and labyrinths of knowledge, Borges Bibliography Builder brings order to scholarly references in WordPress.

The **Borges Bibliography Builder** transforms pasted DOI(s), PubMed/PMID records, BibTeX entries, and citations into a semantically rich, auto-sorted reference list.

**One-click import.** Paste a DOI and CrossRef resolves the metadata instantly. Paste a PubMed/PMID identifier and Borges resolves it through an authenticated WordPress REST proxy to NCBI/PMC citation metadata. Paste BibTeX or formatted citations for books, articles, chapters, webpages, reviews, and theses.

**Nine citation styles.** Choose from Chicago Notes-Bibliography, Chicago Author-Date, APA 7, MLA 9, Harvard, Vancouver, IEEE, OSCOLA, and ABNT (Associação Brasileira de Normas Técnicas / NBR 6023:2018) — all with automatic sorting per style rules.

**Portable.** Static HTML output survives plugin deactivation. No shortcodes. No database tables.

**Reference-manager friendly.** Export and reuse your bibliography in common research workflows. Borges supports CSL-JSON, BibTeX, BibLaTeX, RIS, DOI links, JSON-LD, and optional COinS metadata for compatibility with tools such as Zotero, Mendeley, EndNote, JabRef, BibDesk, and other citation managers.

**Try it first.** Launch a disposable demo in [WordPress Playground](https://playground.wordpress.net/?blueprint-url=https://raw.githubusercontent.com/dknauss/Borges/main/playground/blueprint.json) before installing it on your site.

**Translation-ready.** Plugin interface strings use the `borges-bibliography-builder` text domain, and official WordPress.org language packs are generated as community translations are approved on translate.wordpress.org.

**Support development.** If Borges saves you time, you can [sponsor Dan Knauss on GitHub](https://github.com/sponsors/dknauss) to support ongoing maintenance.

== Installation ==

1. Upload the plugin files to `/wp-content/plugins/borges-bibliography-builder/`, or install directly through the WordPress plugin screen.
2. Activate the plugin through the 'Plugins' screen in WordPress.
3. Add the "Bibliography" block to any post or page.
4. Paste DOI(s), PubMed/PMID identifiers, BibTeX entries, or supported citations for books, articles, chapters, and webpages.

== Frequently Asked Questions ==

= Which translations are available? =

The WordPress.org plugin page's Languages list is the canonical list of currently published language packs. English (US) is the source language and is not counted as a translated locale; other locales appear after their Stable plugin translations are approved on translate.wordpress.org and a language pack is generated.

The package includes seed PO/MO files for translator review and import in French (`fr_FR`), German (`de_DE`), Dutch (`nl_NL`), Swedish (`sv_SE`), Spanish (`es_ES`), Italian (`it_IT`), Portuguese (`pt_PT`), Polish (`pl_PL`), Russian (`ru_RU`), Japanese (`ja`), Simplified Chinese (`zh_CN`), Korean (`ko_KR`), Serbian (`sr_RS`), Croatian (`hr`), Brazilian Portuguese (`pt_BR`), Hindi (`hi_IN`), Bengali (`bn_BD`), Tamil (`ta_IN`), and Telugu (`te`). These files cover plugin interface strings only and should not be read as official WordPress.org language-pack availability.

= What citation input formats does the Borges Bibliography Builder support? =

Bare DOIs, DOI URLs, PubMed/PMID identifiers, BibTeX entries, and supported formatted citations for books, articles, chapters, webpages, reviews, and theses/dissertations. You can paste multiple entries at once, up to 50 entries per add.

= Does the ABNT style implement NBR 6023:2018? =

Yes. The ABNT option targets Associação Brasileira de Normas Técnicas bibliography formatting under NBR 6023:2018, uses the `pt-BR` locale, and defaults new ABNT bibliographies to the heading `Referências`. Always verify institutional or journal-specific ABNT variants before submission.

= What happens if I deactivate the Borges Bibliography Builder? =

Your bibliographies remain fully readable. The block uses static HTML output, so all formatted citations stay in your post content.

= Does the Borges Bibliography Builder work with Zotero, Mendeley, EndNote, and other citation managers? =

Yes. Borges is built around portable bibliography formats rather than lock-in. Zotero can use DOI links, BibTeX, RIS, CSL-JSON, and optional COinS metadata. Mendeley and EndNote are best supported through BibTeX/RIS exports, with DOI-backed entries also friendly to browser importers. JabRef, BibDesk, and LaTeX/Biber workflows can use UTF-8 BibTeX or BibLaTeX. CSL-JSON is available for citeproc and scholarly data workflows.

= Why would I enable CSL-JSON? =

Enable CSL-JSON if you want your bibliography data to be reusable by scholarly tools, scripts, or services without scraping the visible citation text.

= Can I export the bibliography data? =

Yes. The editor currently includes Download CSL-JSON, Download BibTeX, Download BibLaTeX, Download RIS, per-entry Copy citation, and Copy bibliography actions for exporting or reusing bibliography data.

= Can I access bibliography data via API? =

Yes. The plugin exposes read-only REST endpoints at `/wp-json/bibliography/v1/posts/<post_id>/bibliographies` and `/wp-json/bibliography/v1/posts/<post_id>/bibliographies/<index>`. Published posts are readable publicly; non-public posts require permission to edit the post. The single-bibliography route also supports `format=json`, `format=text`, and `format=csl-json`. Editor-only authenticated endpoints handle CSL formatting and PubMed/PMID resolution; they do not persist citations by themselves.

= Does the Borges Bibliography Builder work on WordPress Multisite? =

Yes. CI includes a Multisite runtime smoke lane with network activation. If you encounter issues on a specific network configuration, please report them.

= What PHP and WordPress versions are supported? =

PHP 7.4+ and WordPress 6.4+. Borges Bibliography Builder is tested up to WordPress 7.0.

== Screenshots ==

1. Front-end bibliography output with hanging indents, italic titles, and linked DOIs, styled by the active theme.
2. Editor view showing a formatted bibliography; hover any entry to reveal copy, edit, and delete actions.
3. Discover the Bibliography block in the block inserter by searching for "Bibliography."
4. Paste DOIs, PubMed/PMID identifiers, BibTeX entries, or supported citation text into the import form; the sidebar controls citation style, visible heading, and metadata output (JSON-LD, COinS, CSL-JSON).
5. Switch to Manual Entry to build a citation field by field — Publication Type, Author, Title, Container, Publisher, Year, Pages, DOI, and URL.

== Known Limitations ==

**OSCOLA grouped bibliography** — OSCOLA convention requires the bibliography to be divided into source-type groups (cases, legislation, books, articles, online sources). Borges currently renders a single alphabetized list regardless of style. A dismissible notice in the editor explains this when OSCOLA is selected. Grouped-bibliography support is planned for a future release.

== Development ==

Full developer documentation, source code, issue tracker, and contribution guidelines are on GitHub:

[https://github.com/dknauss/Borges](https://github.com/dknauss/Borges)

Bug reports, feature requests, and pull requests are welcome. See CONTRIBUTING.md in the repository for development setup, coding standards, and the PR process.

== External Services ==

This plugin connects to fixed scholarly metadata services only when you explicitly add an identifier in the block editor — no citation data is sent automatically or in the background. No account or API key is required for the supported DOI or PMID lookups.

**DOI metadata**

DOI input connects to the **CrossRef REST API** (https://api.crossref.org/) to resolve citation metadata.

* CrossRef service: https://www.crossref.org/
* CrossRef REST API documentation: https://api.crossref.org/swagger-ui/index.html
* CrossRef privacy policy: https://www.crossref.org/privacy/
* CrossRef terms of service: https://www.crossref.org/terms/

**PubMed/PMID metadata**

PubMed/PMID input connects through the plugin's authenticated WordPress REST proxy to the **NCBI/PMC Literature Citation Exporter** CSL endpoint. The proxy uses a fixed upstream host and validates the PMID before making the outbound request.

* NCBI APIs: https://www.ncbi.nlm.nih.gov/home/develop/api/
* NCBI/PMC Literature Citation Exporter: https://pmc.ncbi.nlm.nih.gov/api/ctxp/
* NLM Web Policies: https://www.nlm.nih.gov/web_policies.html

== Changelog ==

= 1.4.0 =
* Add optional per-entry Cite / Export affordances to the public bibliography: a static, no-JS `<details>` disclosure panel under each entry with the citation text and one-click downloads for RIS, CSL-JSON, BibTeX, and BibLaTeX. Enable it per block with the new "Per-entry Cite / Export" toggle in the Metadata output panel; off by default.
* Pre-compute BibTeX and BibLaTeX export data in the editor so the frontend downloads work without activating the plugin, and derive readable download filenames from each citation (for example, watson1953.ris).
* Only pre-compute export data when the feature is enabled, so bibliographies that do not use Cite / Export incur no extra editor work.
* Use a secure-context-safe helper for generating citation and bibliography IDs.
* Remove a dead, never-loaded duplicate of the PMID resolver (includes/pmid.php) to eliminate a function-redeclare risk.
* Fix DOI imports for works CrossRef labels with a non-standard type such as "monograph" (common for university-press books), which previously failed to import; unrecognized types now map to a sensible CSL type or fall back gracefully instead of aborting the import.
* Fix the default Chicago Notes-Bibliography style (and OSCOLA and MLA) dropping the publication year on every entry; those styles used an issued-date form the formatter does not render. All bundled styles now show the year, guarded by a regression test.
* Title-case author names and titles that CrossRef or PubMed return in ALL CAPS (e.g. "TURING" / "I.—COMPUTING MACHINERY AND INTELLIGENCE") so they no longer render shouting; already-cased text, initials, organizations, and non-Latin scripts are left untouched.

= 1.3.4 =
* Refresh the translation template and 19 seed PO/MO locale pairs from current source strings.
* Add i18n artifact validation to CI so POT, PO, MO, and public language-pack wording stay aligned.
* Clarify that bundled seed language files are translator/import material and WordPress.org Languages remains canonical for official packs.
* Update docs for the current maintenance state and archive historical planning notes out of active paths.

= 1.3.3 =
* Restore DOI imports in browser-based WordPress Playground by resolving DOI metadata through CrossRef's CORS-friendly CSL transform endpoint.
* Serialize DOI lookups to respect CrossRef's public concurrency limit when multiple DOIs are pasted together.
* Add a PubMed/PMID sample to the Playground starter content alongside DOI and BibTeX examples.

= 1.3.2 =
* Add optional Block Accessibility Checks compatibility: soft-detects the BAC plugin and registers four editor checks (empty bibliography, missing heading, raw URL link text, all metadata disabled). Borges works normally when BAC is absent.
* Harden Playwright E2E plugin-row locator to exclude WordPress update notice rows, fixing CI strict-mode violations.
* Regenerate translation template (POT) with 81 strings, up from 41; covers PHP error messages, BAC check strings, BibLaTeX export labels, and citation reorder controls.
* Extend banner generation script with locale and RTL support flags.

= 1.3.1 =
* Raise per-bibliography hard cap from 50 to 200 citations. Bibliographies between 100 and 199 citations now show a dismissible editor notice warning about potential formatting slowness on shared hosting. The per-paste limit (50 entries) is unchanged.

= 1.3.0 =
* Enforce an explicit 50-citation total cap per bibliography block with inline editor warnings, replacing the silent 51-entry formatter cliff.
* Guard all async editor mutation flows (paste/import, manual add, delete, style switch, structured edit) against stale results from superseded in-flight format requests.
* Remove redundant formatter call in the manual-entry add path; the merged bibliography is now formatted once instead of twice.
* Prune non-runtime vendor documentation and images from the release zip and exclude composer.lock, reducing release package weight.
* Cache successful PMID proxy responses and deduplicate pending DOI resolution requests to reduce avoidable network traffic.
* Refactor editor side-effects into focused hooks: useCitationImportActions, useManualCitationActions, and useBibliographyExportActions.
* Extract PHP PMID resolver, cache, and permission logic into includes/pmid.php.

= 1.2.0 =
* Add BibLaTeX export from the editor exports panel.
* Highlight 1.2.0 interoperability features, recent 1.1.x accessibility fixes, and ABNT (Associação Brasileira de Normas Técnicas / NBR 6023:2018) support in the readmes and changelogs.
* Add PMID input resolution through an authenticated WordPress REST proxy to the NCBI/PMC Literature Citation Exporter API.
* Add manual reordering controls for numeric citation styles, including keyboard Alt+Arrow movement.
* Reformat the full bibliography after citation mutations so cached display text, sort order, and metadata stay aligned.
* Improve sort parity with style-family dispatch, author-date tie-breakers, and JS/PHP coordination fixtures.
* Improve accessibility names for saved citation URL links and block toolbar controls.
* Harden Playwright accessibility and Playground smoke tests for shared WordPress Playground servers.
* Add compact matrix coverage for all nine styles, formatter output, export ordering, and PMID REST proxy regression before tagging 1.2.0.

= 1.1.1 =
* Fix Block Accessibility Checks (BAC) integration shipped in 1.1.0: register against the current BAC API, harden the soft opt-in, and load validation checks reliably so the `empty_bibliography` error and `heading_missing` warning fire as documented when the BAC plugin is active.
* Fix editor focus-ring regression so keyboard focus on entry actions remains visible.
* Fix Playground demo blueprint to install from the latest release zip rather than a stale path.

= 1.1.0 =
* Add optional Block Accessibility Checks (BAC) integration: when Troy Chaplin's Block Accessibility Checks plugin is active, the bibliography block registers two authoring-time checks — an error if no citations have been added, and a warning if no heading is set so screen reader users navigating by heading can find the section.
* No functional change when BAC is not installed.

= 1.0.2 =
* Fix browser-based WordPress Playground demos by explicitly enabling the Playground Intl feature in addition to the kitchen-sink PHP extension bundle.
* Keep the GitHub demo blueprint and WordPress.org Preview blueprint aligned for Intl-enabled citation formatting, with regression coverage.
* Clarify translation wording so the readme distinguishes bundled seed PO/MO files from official WordPress.org language packs.

= 1.0.1 =
* Fix Playground/editor bibliography formatting by using the WordPress REST API fetch helper for formatter requests.
* Add the WordPress.org Preview blueprint at the documented assets path with the required PHP extension bundle for citation formatting.

= 1.0.0 =
* Initial public release as Borges Bibliography Builder.
* Add references from DOIs, DOI URLs, BibTeX entries, supported formatted citations, or manual entry.
* Format bibliographies in Chicago Notes-Bibliography, Chicago Author-Date, APA 7, MLA 9, Harvard, Vancouver, IEEE, OSCOLA, and ABNT (Associação Brasileira de Normas Técnicas / NBR 6023:2018).
* Automatically sort entries per style rules and skip duplicate manual or pasted entries.
* Save static HTML output so bibliographies remain readable after plugin deactivation.
* Output Schema.org JSON-LD by default, with optional COinS and CSL-JSON metadata layers.
* Export CSL-JSON, UTF-8 BibTeX, and RIS; copy individual citations or the full bibliography as plain text.
* Preserve Unicode quotation marks in BibTeX exports for Zotero, Mendeley, and other citation-manager imports.
* Provide reference-manager friendly metadata and exports for Zotero, Mendeley, EndNote, JabRef, BibDesk, LaTeX, and CSL/citeproc workflows.
* Improve accessibility with keyboard navigation, visible focus, block-local notices, semantic bibliography markup, and no deprecated bibliography-entry ARIA role in newly saved output.
* Provide read-only REST API endpoints for programmatic bibliography access.
* Bundle seed interface locale files for translator review/import while using WordPress.org language packs as the canonical availability signal.
* Harden the WordPress.org release package with third-party notices and Plugin Check cleanup.
* Standardize GitHub, Playground, and release-download links on the approved `borges-bibliography-builder` slug and zip name.
* Add CI/runtime coverage for Multisite network activation and expanded PHP utility behavior.
* Confirm compatibility wording through WordPress 7.0 testing.

== Upgrade Notice ==

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
