# Free-Text Citation Samples

Known-good sample inputs for the current heuristic free-text parser.

## Supported book samples

### Book 1

```text
Amy J. Binder and Jeffrey L. Kidder, The Channels of Student Activism: How the Left and Right Are Winning (and Losing) in Campus Politics Today (University of Chicago Press, 2022), 117–18.
```

Expected:

- type: `book`
- publisher: `University of Chicago Press`
- year: `2022`

### Book 2

```text
Sarah M. Babb, Managing Development: The Political Sociology of Intervention (Princeton University Press, 2013), 44–46.
```

Expected:

- type: `book`
- publisher: `Princeton University Press`
- year: `2013`

## Supported journal article samples

### Article 1

```text
Ada Smith, "Learning Blocks," Journal of WordPress Studies 12, no. 3 (2024): 117-134. https://doi.org/10.1234/example-doi
```

Expected:

- type: `article-journal`
- volume: `12`
- issue: `3`
- DOI: `10.1234/example-doi`

### Article 2

```text
Jane Q. Scholar, "Metadata and Meaning," Digital Humanities Review 8, no. 2 (2021): 55-72.
```

Expected:

- type: `article-journal`
- volume: `8`
- issue: `2`
- no DOI present

### Article 3

```text
Ada Smith, "Learning Blocks," Journal of WordPress Studies, Spring 2024, 117–134.
```

Expected:

- type: `article-journal`
- season-style date handled as a low-confidence parse
- page: `117–134`

### Article 4

```text
Ada Smith; Jane Scholar; Chris Editor, "Learning Blocks," Journal of WordPress Studies 12, no. 3 (2024): 117-134.
```

Expected:

- type: `article-journal`
- semicolon-separated authors supported
- parse confidence: `low`

## Supported chapter and webpage samples

### Chapter 1

```text
Amy J. Binder and Jeffrey L. Kidder, “Student Politics and Institutional Change,” in The Channels of Student Activism, ed. Carla Reyes (University of Chicago Press, 2022), 117–18.
```

Expected:

- type: `chapter`
- container title: `The Channels of Student Activism`
- editor present
- parse confidence: `low`

### Webpage 1

```text
OpenAI, “Responses API,” https://platform.openai.com/docs/api-reference/responses.
```

Expected:

- type: `webpage`
- URL captured
- parse confidence: `low`

## Supported Harvard samples

Read by `parseHarvardCitation()` (`src/lib/free-text-harvard.js`), first in a
Harvard bibliography and after the other patterns elsewhere.

### Harvard article

```text
Knuth, D.E. (1984) ‘Literate programming’, The Computer Journal, 27(2), pp. 97–111.
```

Expected:

- type: `article-journal`
- container-title: `The Computer Journal`
- volume `27`, issue `2`, page `97–111`

### Harvard book

```text
Cormen, T.H. et al. (2009) Introduction to algorithms. 3rd edn. Cambridge, MA: MIT Press.
```

Expected:

- type: `book`
- edition: `3`
- publisher-place: `Cambridge, MA`; publisher: `MIT Press`

### Harvard chapter

```text
Borges, J.L. (1962) ‘The library of Babel’, in Yates, D.A. and Irby, J.E. (eds) Labyrinths. New Directions, pp. 51–58.
```

Expected:

- type: `chapter`
- container-title: `Labyrinths`; two editors

### Harvard web page

```text
WordPress.org (no date) Block editor handbook. Available at: https://developer.wordpress.org/block-editor/ (Accessed: 27 October 2026).
```

Expected:

- type: `webpage`
- author: `WordPress.org`; accessed `2026-10-27`; no issued date

## Supported IEEE samples

Read by `parseIeeeCitation()` (`src/lib/free-text-ieee.js`), first in an IEEE
bibliography and after the other patterns elsewhere. The first author must be
initials-first ("C. R. Harris"); an organization is read only before a quoted
title.

### IEEE article

```text
C. R. Harris, K. J. Millman, and R. Gommers, “Array programming with NumPy,” Nature, vol. 585, no. 7825, pp. 357–362, Sept. 2020.
```

Expected:

- type: `article-journal`
- container-title: `Nature`; volume `585`, issue `7825`, page `357–362`
- issued: `2020-09`

### IEEE chapter

```text
J. L. Borges, “The library of Babel,” in Labyrinths, D. A. Yates and J. E. Irby, Eds. New York: New Directions, 1962, pp. 51–58.
```

Expected:

- type: `chapter`
- container-title: `Labyrinths`; two editors; publisher-place `New York`

### IEEE web page

```text
D. Knauss. “The page is an interface.” Marginalia. [Online]. Available: https://m.arginalia.com/the-page-is-an-interface/
```

Expected:

- type: `webpage`
- container-title: `Marginalia`

## Supported Vancouver samples

Read by `parseVancouverCitation()` (`src/lib/free-text-vancouver.js`), first
in a Vancouver bibliography and after the other patterns elsewhere.

### Vancouver article

```text
Harris CR, Millman KJ, Gommers R. Array programming with NumPy. Nature. 2020 Sep 16;585(7825):357-62.
```

Expected:

- type: `article-journal`
- container-title: `Nature`; volume `585`, issue `7825`
- page: `357-362` (written out from `357-62`)

### Vancouver book

```text
Cormen TH, Leiserson CE, Rivest RL, Stein C. Introduction to algorithms. 3rd ed. Cambridge, MA: MIT Press; 2009.
```

Expected:

- type: `book`; edition `3`
- publisher-place: `Cambridge, MA`; publisher: `MIT Press`

### Vancouver web page

```text
Knauss D. The page is an interface [Internet]. Marginalia; 2026 Oct 25 [cited 2026 Oct 27]. Available from: https://m.arginalia.com/the-page-is-an-interface/
```

Expected:

- type: `webpage`
- issued `2026-10-25`; accessed `2026-10-27`

## Supported embedded-identifier samples

When a citation carries an inline DOI (`10.\d{4,}/…`) or a labeled PMID, the
heuristic free-text parser is bypassed entirely. The identifier is extracted and
routed to the existing CrossRef DOI resolver or NCBI PMID REST proxy. If the
resolver fails, the chain degrades gracefully: the input is retried through the
heuristic parser, and if that also fails the limited-support message is shown.
No input is silently dropped.

### Embedded DOI

```text
Author. Title. Place: Publisher, 2020. https://doi.org/10.1234/abcd
```

Expected:

- resolves via the existing CrossRef DOI resolver (not the heuristic parser)
- inputFormat: `doi`
- CSL sourced from CrossRef; deduped against existing DOIs in the block

### Embedded PMID

```text
Author. Title. Journal. 2019. PMID: 12345678
```

Expected:

- resolves via the existing PMID REST proxy
- inputFormat: `pmid`
- CSL sourced from NCBI

## Notes

- These fixtures are intentionally narrow and aligned to the parser's current heuristic support.
- Unsupported free-text citations should still fail closed with a clear message.
