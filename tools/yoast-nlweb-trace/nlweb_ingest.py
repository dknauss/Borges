"""Run NLWeb's own ingest functions on the captured stages, offline.

argv: <nlweb AskAgent/python dir> <page.html> <aggregator.ndjson> <out dir>
"""
import json, os, sys

nl, page, agg, out = sys.argv[1:5]
sys.path.insert(0, nl)
from data_loading.db_load import process_line  # noqa: E402
from data_loading.db_load_utils import prepare_documents_from_json  # noqa: E402
from scraping.extractMarkup import extract_canonical_url, extract_schema_markup  # noqa: E402

def dump(name, docs):
    rows = [{**d, 'schema_json': json.loads(d['schema_json'])} for d in docs]
    with open(os.path.join(out, name), 'w') as f:
        json.dump(rows, f, indent=1, ensure_ascii=False)
    print(name, len(rows), 'documents')

# A. Crawl: incrementalCrawlAndLoad's steps for one saved page.
url = extract_canonical_url(page)
docs, _ = prepare_documents_from_json(url, extract_schema_markup(page), 'borges-trace')
dump('4a-nlweb-crawl-docs.json', docs)

# B. Yoast's aggregator feed through db_load's JSON path (one JSON object per line).
docs = []
for line in open(agg, encoding='utf-8'):
    if not line.strip():
        continue
    u, j = process_line(line)
    if u and j:
        d, _ = prepare_documents_from_json(u, j, 'borges-trace')
        docs.extend(d)
dump('4b-nlweb-aggregator-docs.json', docs)
