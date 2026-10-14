#!/usr/bin/env sh
set -eu

if [ "${TRACE:-0}" = "1" ]; then
	set -x
fi

require_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "Missing required command: $1" >&2
		exit 1
	fi
}

require_cmd docker
require_cmd curl
require_cmd python3
require_cmd node

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
ZOTERO_IMAGE=${ZOTERO_IMAGE:-zotero/translation-server:latest}
ZOTERO_CONTAINER=${ZOTERO_CONTAINER:-bibliography-zotero-ts}
ZOTERO_PORT=${ZOTERO_PORT:-1969}
FIXTURE_PORT=${FIXTURE_PORT:-8765}
WORK_DIR=$(mktemp -d)
SERVER_PID=""

cleanup() {
	if [ -n "$SERVER_PID" ]; then
		kill "$SERVER_PID" >/dev/null 2>&1 || true
	fi
	docker rm -f "$ZOTERO_CONTAINER" >/dev/null 2>&1 || true
	rm -rf "$WORK_DIR"
}
trap cleanup EXIT INT TERM

echo "[interop] creating HTML fixture with COinS + JSON-LD + CSL-JSON"
cat > "$WORK_DIR/bibliography-test.html" <<'HTML'
<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<title>Bibliography Block Interop Fixture</title>
</head>
<body>
	<h1>References</h1>
	<div role="list" aria-label="Bibliography">
		<div role="listitem">
			<cite>
				<span class="Z3988" title="ctx_ver=Z39.88-2004&rft_val_fmt=info%3Aofi%2Ffmt%3Akev%3Amtx%3Ajournal&rft.atitle=Literate%20Programming&rft.jtitle=The%20Computer%20Journal&rft.volume=27&rft.issue=2&rft.spage=97&rft.epage=111&rft.aulast=Knuth&rft.aufirst=Donald%20E.&rft.date=1984&rft_id=info%3Adoi%2F10.1093%2Fcomjnl%2F27.2.97"></span>
				Knuth, D. E. (1984). Literate programming.
			</cite>
		</div>
		<div role="listitem">
			<cite>
				<span class="Z3988" title="ctx_ver=Z39.88-2004&rft_val_fmt=info%3Aofi%2Ffmt%3Akev%3Amtx%3Ajournal&rft.atitle=Attention%20Is%20All%20You%20Need&rft.jtitle=Advances%20in%20Neural%20Information%20Processing%20Systems&rft.volume=30&rft.aulast=Vaswani&rft.aufirst=Ashish&rft.date=2017&rft_id=info%3Adoi%2F10.48550%2FarXiv.1706.03762"></span>
				Vaswani et al. (2017). Attention is all you need.
			</cite>
		</div>
	</div>
	<script type="application/ld+json">{"@context":"https://schema.org","@type":"ItemList","itemListElement":[{"@type":"ListItem","position":1,"item":{"@type":"ScholarlyArticle","name":"Literate Programming","author":[{"@type":"Person","name":"Donald E. Knuth","familyName":"Knuth","givenName":"Donald E."}],"datePublished":"1984","isPartOf":{"@type":"Periodical","name":"The Computer Journal"},"identifier":{"@type":"PropertyValue","propertyID":"DOI","value":"10.1093/comjnl/27.2.97"},"url":"https://doi.org/10.1093/comjnl/27.2.97"}}]}</script>
	<script type="application/vnd.citationstyles.csl+json">[{"id":"knuth1984","type":"article-journal","title":"Literate Programming","author":[{"family":"Knuth","given":"Donald E."}],"container-title":"The Computer Journal","issued":{"date-parts":[[1984]]},"DOI":"10.1093/comjnl/27.2.97"}]</script>
</body>
</html>
HTML

echo "[interop] starting local fixture server on :$FIXTURE_PORT"
python3 -m http.server "$FIXTURE_PORT" --bind 127.0.0.1 --directory "$WORK_DIR" >/dev/null 2>&1 &
SERVER_PID=$!

# Ensure no stale container remains.
docker rm -f "$ZOTERO_CONTAINER" >/dev/null 2>&1 || true

echo "[interop] starting Zotero Translation Server ($ZOTERO_IMAGE) on :$ZOTERO_PORT"
docker run -d --name "$ZOTERO_CONTAINER" -p "$ZOTERO_PORT":1969 "$ZOTERO_IMAGE" >/dev/null

# Wait until endpoint responds.
READY=0
ATTEMPT=0
while [ "$ATTEMPT" -lt 60 ]; do
	ATTEMPT=$((ATTEMPT + 1))
	HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$ZOTERO_PORT/import" -H 'Content-Type: text/plain' --data '' || true)
	if [ "$HTTP_CODE" != "000" ]; then
		READY=1
		break
	fi
	sleep 1
done

if [ "$READY" -ne 1 ]; then
	echo "Zotero Translation Server did not become ready in time." >&2
	docker logs "$ZOTERO_CONTAINER" | tail -n 80 >&2 || true
	exit 1
fi

echo "[interop] test 1/4: Zotero detects and imports multiple COinS items"
FIXTURE_URL="http://host.docker.internal:$FIXTURE_PORT/bibliography-test.html"
curl -sS -D "$WORK_DIR/web.head" -X POST "http://127.0.0.1:$ZOTERO_PORT/web" -H 'Content-Type: text/plain' --data "$FIXTURE_URL" > "$WORK_DIR/web.step1.json"

python3 - "$WORK_DIR" "$ZOTERO_PORT" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

work = Path(sys.argv[1])
port = sys.argv[2]
head = work.joinpath("web.head").read_text(encoding="utf-8")
body_text = work.joinpath("web.step1.json").read_text(encoding="utf-8")

if " 300 " not in head and not head.startswith("HTTP/1.1 300"):
    raise SystemExit(f"Expected 300 response for multi-item COinS page, got headers:\n{head}")

step1 = json.loads(body_text)
items = step1.get("items", {})
if len(items) != 2:
    raise SystemExit(f"Expected 2 selectable COinS items, got {len(items)}")

payload = {
    "session": step1["session"],
    "url": step1["url"],
    "items": items,
}

response = subprocess.check_output([
    "curl",
    "-sS",
    "-X",
    "POST",
    f"http://127.0.0.1:{port}/web",
    "-H",
    "Content-Type: application/json",
    "--data",
    json.dumps(payload),
])

translated = json.loads(response.decode("utf-8"))
if len(translated) != 2:
    raise SystemExit(f"Expected 2 imported items after selection, got {len(translated)}")

titles = {item.get("title", "") for item in translated}
required_titles = {"Literate Programming", "Attention Is All You Need"}
if not required_titles.issubset(titles):
    raise SystemExit(f"Missing expected titles. Got: {sorted(titles)}")

dois = {item.get("DOI", "") for item in translated}
if "10.1093/comjnl/27.2.97" not in dois:
    raise SystemExit(f"Expected Knuth DOI in import result. Got: {sorted(dois)}")

print("PASS: Zotero imported COinS entries from block-like HTML")
PY

echo "[interop] test 2/4: Zotero imports BibTeX exports"
cat > "$WORK_DIR/sample.bib" <<'BIB'
@article{knuth1984,
  author = {Knuth, Donald E.},
  title = {Literate Programming},
  journal = {The Computer Journal},
  year = {1984},
  volume = {27},
  number = {2},
  pages = {97--111},
  doi = {10.1093/comjnl/27.2.97}
}
BIB

curl -sS -X POST "http://127.0.0.1:$ZOTERO_PORT/import" -H 'Content-Type: text/plain' --data-binary "@$WORK_DIR/sample.bib" > "$WORK_DIR/import-bib.json"

python3 - "$WORK_DIR/import-bib.json" <<'PY'
import json
import sys
from pathlib import Path

items = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
if len(items) != 1:
    raise SystemExit(f"Expected 1 BibTeX item, got {len(items)}")
item = items[0]
if item.get('itemType') != 'journalArticle':
    raise SystemExit(f"Expected journalArticle from BibTeX, got {item.get('itemType')}")
if item.get('DOI') != '10.1093/comjnl/27.2.97':
    raise SystemExit(f"Unexpected DOI from BibTeX import: {item.get('DOI')}")
print('PASS: Zotero imported BibTeX payload')
PY

echo "[interop] test 3/4: Zotero imports RIS exports"
cat > "$WORK_DIR/sample.ris" <<'RIS'
TY  - CHAP
AU  - Alpha, Ada
A2  - Reyes, Carla
TI  - A Chapter
T2  - Collected Volume
PB  - Example Press
PY  - 2024
SP  - 117
EP  - 134
SN  - 9780226819909
ER  -
RIS

curl -sS -X POST "http://127.0.0.1:$ZOTERO_PORT/import" -H 'Content-Type: text/plain' --data-binary "@$WORK_DIR/sample.ris" > "$WORK_DIR/import-ris.json"

python3 - "$WORK_DIR/import-ris.json" <<'PY'
import json
import sys
from pathlib import Path

items = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
if len(items) != 1:
    raise SystemExit(f"Expected 1 RIS item, got {len(items)}")
item = items[0]
if item.get('itemType') not in {'bookSection', 'book'}:
    raise SystemExit(f"Unexpected itemType from RIS import: {item.get('itemType')}")
if item.get('title') != 'A Chapter':
    raise SystemExit(f"Unexpected title from RIS import: {item.get('title')}")
print('PASS: Zotero imported RIS payload')
PY

echo "[interop] test 4/4: CSL-JSON round-trips to BibTeX via citation-js"
cd "$ROOT_DIR"
node - <<'NODE'
const { Cite } = require('@citation-js/core');
require('@citation-js/plugin-bibtex');

const csl = [
	{
		id: 'knuth1984',
		type: 'article-journal',
		title: 'Literate Programming',
		author: [{ family: 'Knuth', given: 'Donald E.' }],
		'container-title': 'The Computer Journal',
		issued: { 'date-parts': [[1984]] },
		DOI: '10.1093/comjnl/27.2.97',
	},
];

const cite = new Cite(csl);
const bibtex = cite.format('bibtex');
if (!bibtex.includes('10.1093/comjnl/27.2.97')) {
	throw new Error('CSL-JSON → BibTeX conversion missing DOI');
}

console.log('PASS: citation-js consumed CSL-JSON and generated BibTeX output');
NODE

echo "[interop] all interoperability checks passed"
