# Markup value measurement

What does Borges' front-end markup give search engines, reference managers,
language models, and assistive technology that a plain HTML list of the same
citations does not, and what does it cost? These scripts answer the parts of
that question that can be measured, reproducibly, without a WordPress install.

Not part of the plugin package (`tools/` is in `.distignore`).

## What it compares

`render.php` builds three pages from `corpus.json` (twelve real works: journal
and magazine articles, a preprint, a conference paper, books, a chapter, and a
webpage, in APA 7). Each page is the same short article with the same
reference list, so any difference comes from the list markup alone.

| Page | Reference list |
|---|---|
| `plain.html` | The formatted citations in a core List block, with DOIs and URLs as links. A generous baseline: pasted citations usually keep URLs as plain text. |
| `borges-default.html` | The Borges block with its defaults: JSON-LD on; COinS, CSL-JSON, and Cite / Export off. |
| `borges-full.html` | The Borges block with every output layer on. |

The citations are formatted by the plugin's own citeproc formatter and saved
by its PHP port of `save()`. The render-time JSON-LD and COinS enrichment run
as they do on a live site. Every page carries the same `Article` JSON-LD an SEO plugin
prints; on the Borges pages it gains the cited works as `citation`, through the
Yoast SEO integration.

## Running it

From the repository root, with PHP 7.4+ and Node 20+:

```sh
composer install          # the formatter needs citeproc-php
npm ci --legacy-peer-deps # the root's Playwright, used for Chromium
npm run build             # the block's front-end CSS and view script
cd tools/markup-value
npm ci
npm run all               # render.php, measure.mjs, lighthouse.mjs
```

Results land in `out/` (git-ignored): `results.json`, `lighthouse.json`, the
pages, and each page as Markdown after reader mode (`*.reader.md`).
`measure.mjs` downloads the schema.org 29.3 vocabulary once into `out/`. Set
`CHROMIUM_PATH` if Playwright's browser is not installed.

## What each number means

**Structured data** (`structuredData`). What `@marbec/web-auto-extractor`
finds as JSON-LD, microdata, and RDFa, checked by Adobe's open-source
`@adobe/structured-data-validator` against the schema.org vocabulary and the
Google rich-result rules it implements. `typedNodes` and `facts` count typed
entities and property values; `externalIds` counts links to outside
identifiers (doi.org, arXiv, PubMed, PMC, ORCID); `citationEdges` counts the
page's `citation` links to the works.

**Field recovery** (`fieldRecovery`). For each corpus work and each field it
has (title, authors, year, container, DOI, ISBN, pages, publisher: 67 pairs),
the best a machine reader gets:

- **labeled**: a structured layer (JSON-LD, COinS, or the Cite / Export
  CSL-JSON) carries the correct value under a field name.
- **pattern**: only in the text, but it identifies itself (a DOI or ISBN regex
  finds it in any style).
- **unlabeled**: only in the text as prose. It is there, but a reader needs a
  citation parser or a language model to say which words are the title or the
  journal, and the answer depends on the citation style.
- **missing**: not on the page at all (APA prints no ISBN, for instance).

`perLayer` scores each layer on its own. Authors count as correct only when a
layer gives every last name once, in order. COinS spans are read the way
Zotero's OpenURL reader orders and merges `rft.au`, `rft.aulast`/`rft.aufirst`,
and `rft.aucorp` names, so an author it would list twice or out of place
counts as wrong.

**Reader mode** (`readerMode`). Mozilla Readability then Turndown, the
HTML-to-Markdown step many LLM ingestion pipelines use: what survives, and its
size. Token counts are the four-characters-per-token rule of thumb, not a
real tokenizer.

**Browser** (`browser`). axe-core violations, roles from Chromium's
accessibility tree (entries, landmarks, links announced as a bare URL), and
whether the data is in the HTML with JavaScript off, which is how most AI
crawlers fetch pages.

**Lighthouse** (`lighthouse.json`). The SEO and Accessibility category scores.
Lighthouse's SEO checks are page-level basics and do not score structured
data, so identical scores are expected; they show the block costs nothing on
the checks Lighthouse does make.

## What it cannot measure

- **Rankings or AI citations.** No public metric says whether a search engine
  or a model ranks, trusts, or cites a page more for its markup. These scripts
  measure what is machine-readable, which is a precondition, not an outcome.
- **Google rich results.** Google offers no rich result for reference lists,
  so there is nothing to pass or fail beyond vocabulary validity.
- **Zotero itself.** `measure.mjs` reads COinS with the KEV keys Zotero's COinS
  translator uses, but does not run Zotero. `scripts/test-zotero-interop.sh`
  runs the real Zotero translation server in Docker.
- **A language model's extraction.** The "unlabeled" share is where a model
  would do the work a structured layer does for free; how well a given model
  does it is not measured here.
