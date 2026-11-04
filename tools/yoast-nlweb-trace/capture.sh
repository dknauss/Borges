#!/usr/bin/env bash
# Capture every stage for the fixture post into OUT_DIR (see README.md).
# Usage: capture.sh OUT_DIR   (with the site from setup.sh running)
set -euo pipefail
out="$1"
here="$(cd "$(dirname "$0")" && pwd)"
stack="${TRACE_STACK:?set TRACE_STACK to the folder setup.sh built}"
site="http://localhost:8890"
page="$site/what-a-bibliography-tells-machines/"
mkdir -p "$out"

# 1-2. The page as a crawler fetches it; measure.py splits out Yoast's graph.
curl -sf "$page" -o "$out/1-page.html"

# 3. Yoast's schema aggregator feed (what /schemamap.xml points NLWeb at).
curl -sf "$site/schemamap.xml" -o "$out/3-schemamap.xml"
curl -sf "$site/wp-json/yoast/v1/schema-aggregator/get-schema/post" -o "$out/3-yoast-aggregator.ndjson"

# 4. NLWeb's own ingest code on the page (crawl) and on the feed.
NLWEB_CONFIG_DIR="$stack/nlweb/config" "$stack/venv/bin/python" -I "$here/nlweb_ingest.py" \
	"$stack/nlweb/AskAgent/python" "$out/1-page.html" "$out/3-yoast-aggregator.ndjson" "$out" | grep -v '^Warning' || true

# 5. NLWeb's WordPress plugin over MCP, as an agent calls it. The LLM it
#    ranks with is the stub in llm-stub/, which records the prompt it saw.
: > "$here/llm-stub/prompts.jsonl"
curl -sf -X POST -H 'Content-Type: application/json' "$site/wp-json/nlweb/v1/mcp" \
	-d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ask","arguments":{"query":"NumPy"}}}' \
	-o "$out/5-nlweb-wp-mcp.json"
cp "$here/llm-stub/prompts.jsonl" "$out/5-nlweb-wp-ranking-prompts.jsonl"
echo "captured $out"
