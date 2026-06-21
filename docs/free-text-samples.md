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
