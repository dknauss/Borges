# Supported Input and Style Matrix

This document describes the current real support boundary for the block.

It separates:

-   **first-class structured inputs**
-   **supported formatted citation patterns**
-   **heuristic / review-needed patterns**
-   **unsupported inputs**
-   **selectable bibliography styles**

## Input support tiers

### 1. First-class inputs

These are the most reliable import paths and should be treated as primary supported input.

| Input                                    | Status    | Notes                                                                    |
| ---------------------------------------- | --------- | ------------------------------------------------------------------------ |
| Bare DOI                                 | Supported | Example: `10.1000/xyz123`                                                |
| DOI URL                                  | Supported | Example: `https://doi.org/10.1000/xyz123`                                |
| Partial DOI URL                          | Supported | Example: `doi.org/10.1000/xyz123`                                        |
| `doi:` form                              | Supported | Common malformed-but-encountered variants are normalized where practical |
| BibTeX                                   | Supported | Standard BibTeX entry types                                              |
| Multiple DOI / BibTeX entries in one add | Supported | Up to 50 entries per add                                                 |

### 2. Supported formatted citation categories

These are raw formatted citation categories with active parser support.

| Category                  | Status    | Notes                                                                                |
| ------------------------- | --------- | ------------------------------------------------------------------------------------ |
| Books                     | Supported | Includes many Chicago and APA-like book patterns                                     |
| Journal articles          | Supported | Includes DOI/no-DOI variants and several APA-like forms                              |
| Chapters                  | Supported | Includes common sentence-style chapter citations                                     |
| Webpages                  | Supported | Includes organization-authored pages and common access/modified/effective date forms |
| Social/web platform posts | Supported | Supported where they fit the webpage/social parser patterns                          |
| Reviews                   | Supported | Includes review-book style patterns                                                  |
| Theses / dissertations    | Supported | Includes common Chicago dissertation patterns                                        |

### 3. Heuristic / review-needed support

These are accepted, but the parser may need user review or field cleanup afterward.

| Pattern type                             | Status        | Why                                                            |
| ---------------------------------------- | ------------- | -------------------------------------------------------------- |
| Some APA-like raw citations              | Heuristic     | Accepted via pattern matching rather than a full APA parser    |
| Some free-text webpage/social citations  | Heuristic     | Wide real-world variation means parser confidence may be lower |
| Review-record DOI metadata               | Review needed | Upstream DOI metadata can be incomplete or suspicious          |
| Corporate / institutional author strings | Mixed         | Often supported, but may still need field review in edge cases |

### 4. Unsupported or intentionally limited input

These should fail closed with a notice rather than being treated as supported input.

| Input                                        | Status                         | Notes                                                             |
| -------------------------------------------- | ------------------------------ | ----------------------------------------------------------------- |
| LaTeX documents                              | Unsupported                    | Example: `\\documentclass ... \\printbibliography`                |
| BibLaTeX citation commands                   | Unsupported                    | Example: `\\autocite{einstein}`                                   |
| Arbitrary random prose                       | Unsupported                    | Not all text that looks citation-adjacent is parseable            |
| Broad multimedia / audiovisual raw citations | Limited / mostly unsupported   | Some may parse incidentally, but not yet a declared support class |
| Broad multilingual BibTeX dialects           | Unsupported as a general claim | Only a small tested alias allowlist exists                        |

## Non-English BibTeX normalization policy

The plugin treats **standard BibTeX entry types** as the baseline.

It also includes a **small, explicit alias map** for a few non-English entry-type names encountered in testing:

-   `@artikel` → `@article`
-   `@buch` → `@book`
-   `@inbuch` → `@inbook`
-   `@insammlung` → `@incollection`

### Product stance

-   keep **standard BibTeX** as the official baseline
-   keep the current alias map as a **documented convenience layer**
-   expand aliases only through a deliberate, tested allowlist

This avoids overpromising broad multilingual BibTeX support.

## Selectable bibliography styles

These are style outputs, not raw-input parsing promises.

### Enabled now

| Style                      | Status  | Notes                  |
| -------------------------- | ------- | ---------------------- |
| Chicago Notes-Bibliography | Enabled | Default style          |
| Chicago Author-Date        | Enabled | Alternate Chicago mode |
| APA 7                      | Enabled | Core author-date style |
| MLA 9                      | Enabled | Core author-title style |
| Harvard                    | Enabled | Core author-date style |
| Vancouver                  | Enabled | Core numeric style     |
| IEEE                       | Enabled | Core numeric style     |
| OSCOLA                     | Enabled | Specialized legal style |
| ABNT                       | Enabled | Associação Brasileira de Normas Técnicas / NBR 6023:2018 |

### Planned later

| Style  | Status        |
| ------ | ------------- |

## Important distinction: input style vs output style

A style being selectable for bibliography output does **not** mean the block fully supports arbitrary raw citations written in that style.

Current example:

-   **APA 7 output** is selectable now.
-   **APA-style raw citation parsing** is only partial and pattern-based.

So the safest product wording is:

-   bibliography **styles** may be selectable
-   raw citation **input support** is narrower and category-based

## Metadata output layers

Current defaults:

| Layer    | Default |
| -------- | ------- |
| JSON-LD  | On      |
| COinS    | Off     |
| CSL-JSON | Off     |

Meaning:

-   JSON-LD is the default semantic/discovery layer
-   COinS is optional for citation-manager workflows
-   CSL-JSON is optional for scholarly interoperability workflows

Practical reasons to enable the optional layers:

-   Enable **COinS** if you want Zotero or similar browser-based citation tools to detect and save citations directly from the published page.
-   Enable **CSL-JSON** if you want other scholarly tools, scripts, or services to reuse the bibliography's structured citation data directly.

## Exports

Currently available:

-   **CSL-JSON export** from the editor for downloading the current bibliography as structured citation data
-   **BibTeX export** from the editor for reference-manager and scholarly-writing workflows
-   **RIS export** from the editor for citation-manager interoperability workflows

## Notes

-   Long-term relief for unsupported raw citation formats is planned via **manual citation entry**.
-   Notes-style bibliographies do not necessarily show pinpoint page references for books; those are often note-level rather than bibliography-level data.
-   Heuristic parsing support should be treated as practical and evolving, not as a guarantee of comprehensive style parsing.
