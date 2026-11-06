"""Questions only the fields lost on the way can answer, checked per stage.

argv: <run dir> [<run dir> ...]  (each with survival.json from measure.py)

A question is answerable at a stage when every field it needs survived
there with its label. "@id" means only the DOI's URL is left: a reader that
knows doi.org URLs can recover it. This checks what the data holds, not what
a model says: the NLWeb ranking LLM in these runs was a stub.
"""
import json
import os
import sys

QUESTIONS = [
    ('Who wrote "Array programming with NumPy", in author order?', [('harris2020', 'authors')]),
    ('Which of the cited works came out before 2000?', [(w, 'year') for w in (
        'harris2020', 'lecun2015', 'wilkinson2016', 'knuth1984', 'bernerslee2001', 'maldacena1998',
        'vaswani2017', 'devlin2019', 'cormen2009', 'borges1962', 'borges1962babel')]),
    ('Which cited articles appeared in Nature, and in which volumes?', [
        (w, f) for w in ('harris2020', 'lecun2015') for f in ('container', 'volume')]),
    ('What pages does Knuth\'s "Literate programming" run to?', [('knuth1984', 'pages')]),
    ('What is the ISBN of the cited edition of "Introduction to algorithms"?', [('cormen2009', 'isbn')]),
    ('Who published "Labyrinths"?', [('borges1962', 'publisher')]),
    ('What is the DOI of the BERT paper?', [('devlin2019', 'doi')]),
]


def verdict(stage, needs):
    vals = [stage[w][f] for w, f in needs]
    if all(v is True for v in vals):
        return 'yes'
    if all(v in (True, 'id-only') for v in vals):
        return '@id'
    return 'no'


for run in sys.argv[1:]:
    report = json.load(open(os.path.join(run, 'survival.json')))
    stages = list(report)
    print(f'\n### {os.path.basename(run.rstrip("/"))}\n')
    print('| Question | ' + ' | '.join(s.split(' ', 1)[0] for s in stages) + ' |')
    print('|---' * (len(stages) + 1) + '|')
    for q, needs in QUESTIONS:
        print(f'| {q} | ' + ' | '.join(verdict(report[s], needs) for s in stages) + ' |')
