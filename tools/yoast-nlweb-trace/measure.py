"""Field-by-field survival of the corpus through each captured stage.

argv: <corpus.json> <page URL> <run dir> [<run dir> ...]
Writes <run dir>/survival.json and prints a summary table.

For each stage it gathers every JSON-LD node it can reach, merges the nodes
that share an `@id` (as a JSON-LD consumer would), finds each corpus work by
its `@id` (its DOI URL, else the page's `#ref-<id>` anchor), and checks each
field the corpus gives it:

- labeled:  the value is under a schema.org property (author names in
            order, `datePublished`, `isPartOf` names, `volumeNumber`, an
            `identifier`/`isbn`/`sameAs`, `publisher`).
- id-only:  only the DOI, and only inside the `@id` URL (a reader that
            knows doi.org URLs can recover it; nothing labels it).
- missing.

The ranking-prompt row is the MCP answer's node as NLWeb's WordPress plugin
hands it to the ranking LLM: trimmed, then cut at 4,000 characters. A work
counts there only if its whole description falls before the cut (the next
work's `@id`, or the end of the JSON, is inside the prompt).
"""
import html as htmlmod
import json
import os
import re
import sys

FIELDS = ['title', 'authors', 'year', 'container', 'volume', 'issue', 'pages', 'doi', 'isbn', 'publisher']


def expected(item):
    exp = {'title': item['title']}
    names = [a.get('family') or a.get('literal') for a in item.get('author', [])]
    if names:
        exp['authors'] = names
    parts = item.get('issued', {}).get('date-parts', [[None]])[0]
    if parts and parts[0]:
        exp['year'] = str(parts[0])
    for csl, key in (('container-title', 'container'), ('volume', 'volume'), ('issue', 'issue'),
                     ('page', 'pages'), ('DOI', 'doi'), ('ISBN', 'isbn'), ('publisher', 'publisher')):
        if item.get(csl):
            exp[key] = str(item[csl])
    return exp


def walk(obj):
    if isinstance(obj, dict):
        yield obj
        for v in obj.values():
            yield from walk(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from walk(v)


def merge(a, b):
    out = dict(a)
    for k, v in b.items():
        if k not in out:
            out[k] = v
        elif isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = merge(out[k], v)
        elif out[k] != v and k not in ('@id', '@type'):
            out[k] = (out[k] if isinstance(out[k], list) else [out[k]]) + (v if isinstance(v, list) else [v])
    return out


def index(roots):
    nodes = {}
    for node in walk(roots):
        if isinstance(node.get('@id'), str) and len(node) > 1:
            nodes[node['@id']] = merge(nodes.get(node['@id'], {}), node)
    return nodes


def strings(obj, keys=None):
    """Every string under obj, optionally only under the given property names."""
    out = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == '@id':
                continue
            if keys is None or k in keys:
                out += strings(v)
            else:
                out += strings(v, keys)
    elif isinstance(obj, list):
        for v in obj:
            out += strings(v, keys)
    elif isinstance(obj, (str, int, float)):
        if keys is None:
            out.append(str(obj))
    return out


def as_list(v):
    return v if isinstance(v, list) else ([] if v is None else [v])


def check(node, exp, field, work_id):
    want = exp[field]
    norm = lambda s: re.sub(r'\s+', ' ', s).strip().lower()
    if field == 'title':
        return any(norm(want) == norm(s) for s in strings(node.get('name')))
    if field == 'authors':
        got = []
        for a in as_list(node.get('author')):
            if isinstance(a, dict):
                got.append(a.get('familyName') or a.get('name') or '')
            elif isinstance(a, str):
                got.append(a)
        return len(got) == len(want) and all(w.lower() in g.lower() for w, g in zip(want, got))
    if field == 'year':
        return any(s.startswith(want) for s in strings(node.get('datePublished')))
    if field == 'container':
        return any(norm(want) == norm(s) for s in strings(node.get('isPartOf'), {'name'}))
    if field == 'volume':
        return want in strings(node.get('isPartOf'), {'volumeNumber'})
    if field == 'issue':
        return want in strings(node.get('isPartOf'), {'issueNumber'})
    if field == 'pages':
        return want in strings(node, {'pagination'}) or want.split('-')[0] in strings(node, {'pageStart'})
    if field == 'doi':
        labeled = strings(node, {'identifier', 'sameAs', 'url'})
        if any(want.lower() in s.lower() for s in labeled):
            return True
        return 'id-only' if want.lower() in work_id.lower() else False
    if field == 'isbn':
        return any(want in re.sub(r'[^0-9X]', '', s) for s in strings(node, {'isbn', 'identifier'}))
    if field == 'publisher':
        return any(norm(want) == norm(s) for s in strings(node.get('publisher'), {'name'}) + strings(as_list(node.get('publisher'))))
    return False


def prompt_reach(prompt, stage5):
    """The `@id`s whose whole description is inside the (cut) ranking prompt."""
    m = re.search(r'schema\.org format is "(.*)"\.', prompt, re.S)
    text = m.group(1) if m else prompt
    cut = text.endswith('...}')
    reached = set()
    for root in stage5:
        for i, ref in enumerate(as_list((root or {}).get('citation'))):
            wid = ref.get('@id', '') if isinstance(ref, dict) else ''
            esc = json.dumps(wid)[1:-1].replace('/', '\\/')
            pos = text.find(esc)
            if pos < 0:
                continue
            rest = as_list(root['citation'])[i + 1:]
            nxt = json.dumps(rest[0].get('@id', ''))[1:-1].replace('/', '\\/') if rest and isinstance(rest[0], dict) else None
            if (nxt and text.find(nxt, pos) > 0) or (not nxt and not cut):
                reached.add(wid)
    return reached


def stage_roots(run):
    page_file = os.path.join(run, '1-page.html')
    if os.path.exists(page_file):
        page = open(page_file, encoding='utf-8').read()
        scripts = re.findall(r'<script type="application/ld\+json"([^>]*)>(.*?)</script>', page, re.S)
        page_roots = [json.loads(s) for _, s in scripts]
        yoast_roots = [json.loads(s) for a, s in scripts if 'yoast-schema-graph' in a]
    else:
        # Committed runs keep only the page's JSON-LD blocks, in page order
        # (results/README note). Yoast prints its graph as the one block with
        # an @graph; Borges's ItemList and WebPage blocks have none.
        page_roots = json.load(open(os.path.join(run, '1-page-json-ld.json'), encoding='utf-8'))
        yoast_roots = [r for r in page_roots if isinstance(r, dict) and '@graph' in r]
    stages = {
        '1 page HTML (all JSON-LD)': page_roots,
        '2 Yoast graph only': yoast_roots,
        '3 Yoast aggregator feed': [json.loads(l) for l in open(os.path.join(run, '3-yoast-aggregator.ndjson')) if l.strip()],
        '4a NLWeb index, crawled page': [d['schema_json'] for d in json.load(open(os.path.join(run, '4a-nlweb-crawl-docs.json')))],
        '4b NLWeb index, aggregator feed': [d['schema_json'] for d in json.load(open(os.path.join(run, '4b-nlweb-aggregator-docs.json')))],
    }
    mcp = json.load(open(os.path.join(run, '5-nlweb-wp-mcp.json')))
    results = json.loads(mcp['result']['content'][0]['text']).get('results', [])
    stages['5 NLWeb WP plugin, MCP answer'] = [r.get('grounding', {}).get('schema_object') for r in results]
    prompts = []
    for line in open(os.path.join(run, '5-nlweb-wp-ranking-prompts.jsonl')):
        if line.strip():
            prompts.append(json.loads(line)['messages'][0]['content'])
    return stages, '\n'.join(prompts)


def main():
    corpus = json.load(open(sys.argv[1]))
    page_url = sys.argv[2]
    rows = []
    for run in sys.argv[3:]:
        stages, prompt = stage_roots(run)
        report = {}
        for name, roots in stages.items():
            nodes = index(roots)
            report[name] = {}
            for item in corpus['items']:
                exp = expected(item)
                wid = 'https://doi.org/' + item['DOI'] if item.get('DOI') else page_url + '#ref-' + item['id']
                node = nodes.get(wid, {})
                report[name][item['id']] = {f: (check(node, exp, f, wid if node else '') if f in exp else None) for f in FIELDS}
                report[name][item['id']]['_present'] = bool(node)
        stage5 = stages['5 NLWeb WP plugin, MCP answer']
        reached = prompt_reach(prompt, stage5)
        mcp = report['5 NLWeb WP plugin, MCP answer']
        report['5p NLWeb WP plugin, ranking prompt (4,000-char cut)'] = {}
        for item in corpus['items']:
            wid = 'https://doi.org/' + item['DOI'] if item.get('DOI') else page_url + '#ref-' + item['id']
            row = dict(mcp[item['id']])
            if wid not in reached:
                row = {f: (False if v is not None else None) for f, v in row.items()}
                row['_present'] = False
            report['5p NLWeb WP plugin, ranking prompt (4,000-char cut)'][item['id']] = row
        json.dump(report, open(os.path.join(run, 'survival.json'), 'w'), indent=1)
        rows.append((os.path.basename(run.rstrip('/')), report))

    for run, report in rows:
        print(f'\n## {run}\n')
        print('| Stage | Works reached | ' + ' | '.join(FIELDS) + ' | Labeled pairs |')
        print('|---' * (len(FIELDS) + 3) + '|')
        for stage, works in report.items():
            n_reached = sum(1 for w in works.values() if w.get('_present'))
            cells, total, ok = [], 0, 0
            for f in FIELDS:
                vals = [w[f] for w in works.values() if w[f] is not None]
                good = sum(1 for v in vals if v is True)
                idonly = sum(1 for v in vals if v == 'id-only')
                total += len(vals)
                ok += good
                cells.append(f'{good}/{len(vals)}' + (f' (+{idonly} in @id)' if idonly else ''))
            print(f'| {stage} | {n_reached}/12 | ' + ' | '.join(cells) + f' | {ok}/{total} |')


if __name__ == '__main__':
    main()
