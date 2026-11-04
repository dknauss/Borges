# Citation metadata through Yoast SEO and NLWeb

How much of a Borges bibliography's metadata is still there when it reaches
an AI agent through Yoast SEO's schema graph and NLWeb? The question came
from a reader of the markup-value study (`tools/markup-value/`, #203, #233).
Checking that JSON-LD is on the page is not enough. This traces it through
each stage of the retrieval pipeline, field by field.

Not part of the plugin package (`tools/` is in `.distignore`).

## What runs

A local WordPress site that `setup.sh` builds. Nothing is mocked except the
LLM that NLWeb ranks with:

| Piece | Version |
|---|---|
| WordPress | 7.1.4 (`WordPress/WordPress`), on SQLite (`sqlite-database-integration` v3.1.3), Twenty Twenty-Five |
| Borges | this checkout |
| Yoast SEO | 28.8 (the built plugin from `Yoast-dist/wordpress-seo`), schema on, schema aggregation endpoint on |
| NLWeb | `microsoft/NLWeb` at `b423f15` (2026-06-10): its WordPress plugin (`code/wordpress/nlweb`) and its Python ingest code (`AskAgent/python`) |

The fixture is a single post: one paragraph, plus a Borges block holding the
twelve works of `tools/markup-value/corpus.json` in APA 7, saved by Borges'
PHP `save()` port. Those works are journal and magazine articles, a preprint,
a conference paper, two books with ISBNs, a chapter, and a web page. Between
them they have 8 DOIs, 2 ISBNs, and 78 field values to look for.

## The stages

```
post ─► 1 page HTML ──────────────► 4a NLWeb index (crawl: every JSON-LD script, then trim)
        │                                                              
        ├► 2 Yoast's graph (the yoast-schema-graph script)             
        │                                                              
        ├► 3 Yoast schema aggregator feed ───► 4b NLWeb index (db_load's JSON path, then trim)
        │   (/schemamap.xml → /wp-json/yoast/v1/schema-aggregator/get-schema/post)
        │
        └► 5 NLWeb WordPress plugin: MCP `ask` → WP_Query → Yoast graph for the post
              → 5p ranking prompt (the LLM sees this) → 5 MCP answer (the agent gets this)
```

1. **Page HTML.** Every JSON-LD script on the page: Yoast's graph, plus
   Borges' `ItemList`, joined by `@id` as a JSON-LD consumer would join them.
2. **Yoast's graph only.** A reader that takes Yoast's script and nothing else.
3. **Yoast's schema aggregator.** This is the feed Yoast offers NLWeb. It is
   built from Yoast's graph for each post, not from the rendered page.
4. **NLWeb's index.** This is NLWeb's own code (`nlweb_ingest.py` imports
   it) applied to the page (4a, the crawler's
   `extract_schema_markup` → `prepare_documents_from_json`) and to the feed
   (4b, `db_load`'s `process_line` → `prepare_documents_from_json`). Both go
   through `trim_schema_json`, which keeps what is stored and later handed
   back. This NLWeb commit has no reader for `schemamap.xml`, so the feed is
   loaded as a JSON file, as `db_load` does for any URL or file.
5. **NLWeb's WordPress plugin.** An MCP `tools/call ask` to
   `/wp-json/nlweb/v1/mcp`, as an agent would make it. The plugin finds the
   post with `WP_Query`, asks Yoast for its graph
   (`YoastSEO()->meta->for_post()`), and keeps the main node. **5p** is the
   prompt its ranking LLM sees (trimmed, then cut at 4,000 characters).
   **5** is the `schema_object` the agent receives.

`measure.py` checks each work's title, authors (every family name, in order),
year, container, volume, issue, pages, DOI, ISBN, and publisher at every
stage. A field counts only when a schema.org property labels it. When the DOI
survives only inside a work's `@id` URL (`https://doi.org/…`), that is
reported separately: a reader that knows doi.org URLs can recover it, but no
property labels it.

## Findings (2026-11-04)

Full tables: [`results/2026-11-04/survival-main.md`](results/2026-11-04/survival-main.md),
[`survival-pr-252.md`](results/2026-11-04/survival-pr-252.md), and
[`probe-questions.md`](results/2026-11-04/probe-questions.md).

Labeled field values that survive, out of 78:

| Stage | Borges today | With #252 | Prototype: full records in `citation` | Prototype: full records as graph nodes |
|---|---|---|---|---|
| 1 Page HTML, all JSON-LD | 78 | 78 | 78 | 78 |
| 2 Yoast's graph only | 12 | 12 | 78 | 78 |
| 3 Yoast aggregator feed | 12 | 12 | 78 | 78 |
| 4a NLWeb index, crawled page | 12 | 12 | 78 | 71 |
| 4b NLWeb index, aggregator feed | 12 | 12 | 78 | 71 |
| 5 NLWeb WordPress plugin, MCP answer | **0** | 12 | 78 | 12 |
| 5p …its ranking prompt | 0 | 12 | 24 | 12 |

The 12 in the "Borges today" column are the titles. Wherever 12 appears, all
8 DOIs are also left inside `@id` URLs.

1. **Today only the citation links survive, not the records.** Borges puts
   a short reference to each work (`@type`, `@id`, `name`) on Yoast's
   Article as `citation`, and keeps each work's full description in its own
   `ItemList`, joined to it by `@id`. Everything downstream of Yoast reads
   only Yoast's graph, so an agent gets 12 titles, 12 types, and 8 DOIs that
   are recoverable from their URLs. It gets no authors, years, journals,
   volumes, pages, ISBNs, or publishers.
2. **NLWeb drops the `ItemList` outright.** Its `trim_schema_json` skips
   every `ItemList`, `ListItem`, and `WebPage` node, along with each node's
   `publisher` and `mainEntityOfPage`. So crawling the page (4a) gets no more
   than Yoast's feed (4b), even though the full records are in the HTML.
   NLWeb also indexes no body text, so the formatted reference list is gone
   too.
3. **Bug, fixed in #252: NLWeb's WordPress plugin got no citations at all.**
   Borges looked the post up from the main query, and the plugin asks Yoast
   for a graph from inside a REST request. With #252 its answers carry all 12
   references.
4. **Yoast passes through whatever reaches its graph.** Both prototypes
   (`trace-variants.php`, which runs on the test site only) deliver every
   field through Yoast's graph and its aggregator. The aggregator merges
   top-level nodes that share an `@id` across the posts on a feed page. With
   separate graph nodes, a work cited by many posts would therefore become
   one node; records embedded in `citation` are repeated in each post's
   Article.
5. **The two prototypes split on the NLWeb side:**
   - *Full records inside `citation`* reach every stage, including the
     plugin's MCP answer, which keeps only the Article. NLWeb trims only the
     top-level node, so `publisher` survives nested. The ranking LLM, though,
     sees just the first 4 of the 12 works before its 4,000-character cut.
   - *Full records as separate graph nodes* survive the Python ingest, but
     lose `publisher` (trimmed from every top-level node) and the web page
     work (`WebPage` is skipped). The plugin's MCP answer keeps only the
     Article, so it gets the references alone, as it does today.
6. **Cost.** On this page, Yoast's script grows from 7.6 KB to 28.7 KB
   (embedded) or 27.2 KB (nodes), and the whole page from 96 KB to 117 or
   116 KB. The records then appear twice, once in Yoast's graph and once in
   Borges' `ItemList`, unless the `ItemList` is changed as well.

### Questions only the lost fields can answer

`probe.py` asks whether each stage still holds the fields a question needs
("@id" means the answer is only inside a doi.org URL):

| Question | Today: 3 feed | Today: 4b index | Today: 5 MCP | #252: 5 MCP | Embedded: 5 MCP | Nodes: 4b index |
|---|---|---|---|---|---|---|
| Who wrote "Array programming with NumPy", in order? | no | no | no | no | yes | yes |
| Which cited works came out before 2000? | no | no | no | no | yes | yes |
| Which cited articles appeared in Nature, and in which volumes? | no | no | no | no | yes | yes |
| What pages does Knuth's "Literate programming" run to? | no | no | no | no | yes | yes |
| What is the ISBN of the cited "Introduction to algorithms"? | no | no | no | no | yes | yes |
| Who published "Labyrinths"? | no | no | no | no | yes | no |
| What is the DOI of the BERT paper? | @id | @id | no | @id | yes | yes |

These columns show whether the data is there. They don't show what a model
answered.

### What this does not show

- **No model answered anything.** The NLWeb plugin's LLM is `llm-stub/`,
  which records its prompt and gives every item a score of 90. Stages 5 and
  5p are exactly what a real model and agent would be given. Whether a model
  then uses the fields is a separate experiment, and it needs an API key.
- **No vector database or embeddings.** NLWeb stores `schema_json` as it is
  and returns it unchanged. The functions run here are the ones that decide
  what gets stored.
- **One post, one site, one version of each tool.** Yoast 28.8's aggregator
  and NLWeb's trim rules are recent and may change.
- **Nothing here is about ranking or AI citation.** It shows which facts an
  agent could be given. It does not show whether any search engine or
  assistant rewards them.

## Running it

From the repository root, after `composer install` and `npm run build`. It
needs PHP 8.x with `pdo_sqlite`, Python 3.10+, git, and composer:

```sh
export TRACE_STACK=/tmp/borges-trace          # any empty folder
tools/yoast-nlweb-trace/setup.sh             # clones, installs, serves :8890 and :8891
tools/yoast-nlweb-trace/run-variants.sh "$TRACE_STACK/out"   # as-is, embed, pieces
python3 tools/yoast-nlweb-trace/probe.py "$TRACE_STACK/out"/*/
```

`capture.sh OUT_DIR` captures one state of the site. `measure.py` and
`probe.py` read captures. `variant.php` sets the `borges_trace_variant`
option that `trace-variants.php` reads (`''`, `embed`, or `pieces`). For the
pre-#252 baseline, check out an older `includes/json-ld-enrichment.php` and
run `run-variants.sh OUT as-is`.

Two things to know about the setup: Yoast-dist ships without an autoloader,
so `setup.sh` makes one with `composer dump-autoload --no-scripts` (Yoast's
own post-autoload script deletes its built container), and it turns plugins
on through the `active_plugins` option because Yoast's activation fails from
the command line.

`results/2026-11-04/` holds the captures behind the tables. Each page's
JSON-LD is extracted to `1-page-json-ld.json`; the full pages are left out
for size.
