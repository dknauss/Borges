=== Borges Bibliography Builder ===
Contributors: dpknauss
Donate link: https://www.paypal.com/paypalme/DanKnauss
Tags: bibliography, citation, doi, bibtex, academic
Requires at least: 6.4
Tested up to: 7.0
Stable tag: 1.1.1
Requires PHP: 7.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Paste a DOI or BibTeX entry — get a formatted, auto-sorted bibliography in any of nine academic citation styles.

== Description ==

Named for Jorge Luis Borges (1899–1986), the Argentine writer and librarian known for stories about infinite libraries, imaginary books, and labyrinths of knowledge, Borges Bibliography Builder brings order to scholarly references in WordPress.

The **Borges Bibliography Builder** transforms pasted DOI(s), BibTeX entries, and citations into a semantically rich, auto-sorted reference list.

**One-click import.** Paste a DOI, and CrossRef resolves the metadata instantly. Paste BibTeX or formatted citations for books, articles, chapters, webpages, reviews, and theses.

**Nine citation styles.** Choose from Chicago Notes-Bibliography, Chicago Author-Date, APA 7, MLA 9, Harvard, Vancouver, IEEE, OSCOLA, and ABNT — all with automatic alphabetical sorting per style rules.

**Portable.** Static HTML output survives plugin deactivation. No shortcodes. No database tables.

**Reference-manager friendly.** Export and reuse your bibliography in common research workflows. Borges supports CSL-JSON, BibTeX, RIS, DOI links, JSON-LD, and optional COinS metadata for compatibility with tools such as Zotero, Mendeley, EndNote, JabRef, BibDesk, and other citation managers.

**Try it first.** Launch a disposable demo in [WordPress Playground](https://playground.wordpress.net/?blueprint-url=https://raw.githubusercontent.com/dknauss/borges-bibliography-builder/main/playground/blueprint.json) before installing it on your site.

**Translation-ready.** Plugin interface strings use the `borges-bibliography-builder` text domain, and official WordPress.org language packs are generated as community translations are approved on translate.wordpress.org.

== Installation ==

1. Upload the plugin files to `/wp-content/plugins/borges-bibliography-builder/`, or install directly through the WordPress plugin screen.
2. Activate the plugin through the 'Plugins' screen in WordPress.
3. Add the "Bibliography" block to any post or page.
4. Paste DOI(s), BibTeX entries, or supported citations for books, articles, chapters, and webpages.

== Frequently Asked Questions ==

= Which translations are available? =

The WordPress.org plugin page's Languages list is the canonical list of currently published language packs. English (US) is the source language and is not counted as a translated locale; other locales appear after their Stable plugin translations are approved on translate.wordpress.org and a language pack is generated.

The package includes seed PO/MO files for translator review and import in French (`fr_FR`), German (`de_DE`), Dutch (`nl_NL`), Swedish (`sv_SE`), Spanish (`es_ES`), Italian (`it_IT`), Portuguese (`pt_PT`), Polish (`pl_PL`), Russian (`ru_RU`), Japanese (`ja`), Simplified Chinese (`zh_CN`), Korean (`ko_KR`), Serbian (`sr_RS`), Croatian (`hr`), Brazilian Portuguese (`pt_BR`), Hindi (`hi_IN`), Bengali (`bn_BD`), Tamil (`ta_IN`), and Telugu (`te`). These files cover plugin interface strings only and should not be read as official WordPress.org language-pack availability.

= What citation input formats does the Borges Bibliography Builder support? =

Bare DOIs, DOI URLs, BibTeX entries, and supported formatted citations for books, articles, chapters, webpages, reviews, and theses/dissertations. You can paste multiple entries at once, up to 50 entries per add.

= What happens if I deactivate the Borges Bibliography Builder? =

Your bibliographies remain fully readable. The block uses static HTML output, so all formatted citations stay in your post content.

= Does the Borges Bibliography Builder work with Zotero, Mendeley, EndNote, and other citation managers? =

Yes. Borges is built around portable bibliography formats rather than lock-in. Zotero can use DOI links, BibTeX, RIS, CSL-JSON, and optional COinS metadata. Mendeley and EndNote are best supported through BibTeX/RIS exports, with DOI-backed entries also friendly to browser importers. CSL-JSON is available for citeproc and scholarly data workflows.

= Why would I enable CSL-JSON? =

Enable CSL-JSON if you want your bibliography data to be reusable by scholarly tools, scripts, or services without scraping the visible citation text.

= Can I export the bibliography data? =

Yes. The editor currently includes Download CSL-JSON, Download BibTeX, Download RIS, per-entry Copy citation, and Copy bibliography actions for exporting or reusing bibliography data.

= Can I access bibliography data via API? =

Yes. The plugin exposes read-only REST endpoints at `/wp-json/bibliography/v1/posts/<post_id>/bibliographies` and `/wp-json/bibliography/v1/posts/<post_id>/bibliographies/<index>`. Published posts are readable publicly; non-public posts require permission to edit the post. The single-bibliography route also supports `format=json`, `format=text`, and `format=csl-json`.

= Does the Borges Bibliography Builder work on WordPress Multisite? =

Yes. CI includes a Multisite runtime smoke lane with network activation. If you encounter issues on a specific network configuration, please report them.

= What PHP and WordPress versions are supported? =

PHP 7.4+ and WordPress 6.4+. Borges Bibliography Builder is tested up to WordPress 7.0.

== Screenshots ==

1. Front-end bibliography output with hanging indents, italic titles, and linked DOIs, styled by the active theme.
2. Editor view showing a formatted bibliography; hover any entry to reveal copy, edit, and delete actions.
3. Discover the Bibliography block in the block inserter by searching for "Bibliography."
4. Paste DOIs, BibTeX entries, or supported citation text into the import form; the sidebar controls citation style, visible heading, and metadata output (JSON-LD, COinS, CSL-JSON).
5. Switch to Manual Entry to build a citation field by field — Publication Type, Author, Title, Container, Publisher, Year, Pages, DOI, and URL.

== Known Limitations ==

**OSCOLA grouped bibliography** — OSCOLA convention requires the bibliography to be divided into source-type groups (cases, legislation, books, articles, online sources). Borges currently renders a single alphabetized list regardless of style. A dismissible notice in the editor explains this when OSCOLA is selected. Grouped-bibliography support is planned for a future release.

== Development ==

Full developer documentation, source code, issue tracker, and contribution guidelines are on GitHub:

[https://github.com/dknauss/borges-bibliography-builder](https://github.com/dknauss/borges-bibliography-builder)

Bug reports, feature requests, and pull requests are welcome. See CONTRIBUTING.md in the repository for development setup, coding standards, and the PR process.

== External Services ==

This plugin connects to the **CrossRef REST API** (https://api.crossref.org/) when you paste a DOI to resolve citation metadata. No account or API key is required. Requests are made only when you explicitly add a DOI in the block editor — no data is sent automatically or in the background.

* CrossRef service: https://www.crossref.org/
* CrossRef REST API documentation: https://api.crossref.org/swagger-ui/index.html
* CrossRef privacy policy: https://www.crossref.org/privacy/
* CrossRef terms of service: https://www.crossref.org/terms/

== Changelog ==

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
* Format bibliographies in Chicago Notes-Bibliography, Chicago Author-Date, APA 7, MLA 9, Harvard, Vancouver, IEEE, OSCOLA, and ABNT.
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

= 1.0.2 =
Fixes WordPress Playground demo formatting when the browser runtime does not load PHP Intl from the extension bundle alone.

= 1.0.1 =
Fixes WordPress.org Playground preview and editor formatter fallback behavior.

= 1.0.0 =
Initial public release of Borges Bibliography Builder.
