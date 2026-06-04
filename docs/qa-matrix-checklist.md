# QA Matrix Checklist

Use this checklist for live QA in the local Studio site.

## Editor UX

| Area         | Scenario                          | Expected result                                                         | Status |
| ------------ | --------------------------------- | ----------------------------------------------------------------------- | ------ |
| Inserter     | Insert Bibliography block         | Block appears and inserts normally                                      | ☐      |
| Add form     | Initial block state               | Add form is open by default                                             | ☐      |
| Add form     | Toggle button                     | Toggle is visible on the right and opens/closes the form                | ☐      |
| Row actions  | Hover a citation row              | Item action icons appear and align correctly                            | ☐      |
| Row actions  | Focus a citation row via keyboard | Item action icons appear on focus                                       | ☐      |
| Field editor | Open structured field editing     | Inputs stretch full width                                               | ☐      |
| Field editor | Press Escape in field editor      | Field editor closes and focus returns to entry                          | ☐      |
| Field editor | Save                              | Primary Save button works and closes form                               | ☐      |
| Field editor | Cancel                            | Secondary Cancel button works and closes form                           | ☐      |
| Notices      | Success feedback after add        | Local snackbar or inline success feedback appears in the add-form area and auto-dismisses | ☐      |
| Notices      | Warning/error notice              | Inline notice appears in the add-form area and stays until dismissed or replaced | ☐      |
| Notices      | Dismiss control                   | `×` appears in upper-right and clears the notice                        | ☐      |
| Style switch | Change style                      | Notice appears and citations reformat                                   | ☐      |

## Supported input: success states

| Input type                | Sample                                                                                  | Expected result                  | Status |
| ------------------------- | --------------------------------------------------------------------------------------- | -------------------------------- | ------ |
| DOI bare                  | `10.1177/00018392251368878`                                                             | Citation added                   | ☐      |
| DOI full URL              | `https://doi.org/10.1177/00018392251368878`                                             | Citation added                   | ☐      |
| DOI partial URL           | `doi.org/10.1177/00018392251368878`                                                     | Citation added                   | ☐      |
| Two DOI batch             | `10.1145/3368089.3409742` and `10.1038/s41586-020-2649-2`                               | Two citations added              | ☐      |
| PubMed/PMID               | `PMID:26673779`                                                                         | Citation added                   | ☐      |
| Mixed demo batch          | DOI + PubMed/PMID + BibTeX from demo starter content                                    | All expected citations added     | ☐      |
| BibTeX article            | `@article{...}`                                                                         | Citation added                   | ☐      |
| BibTeX German alias       | `@artikel{...}`                                                                         | Citation added                   | ☐      |
| BibTeX German alias       | `@buch{...}`                                                                            | Citation added                   | ☐      |
| Raw book citation         | `Binder, Amy J., and Jeffrey L. Kidder... University of Chicago Press, 2022.`           | Citation added                   | ☐      |
| Raw journal citation      | `Ada Smith, "Learning Blocks," Journal of WordPress Studies 12, no. 3 (2024): 117-134.` | Citation added                   | ☐      |
| Raw chapter citation      | `Doyle, Kathleen. “The Queen Mary Psalter.” In The Book by Design...`                   | Citation added                   | ☐      |
| Raw webpage citation      | `Google. “Privacy Policy.” Privacy & Terms...`                                          | Citation added                   | ☐      |
| Raw review citation       | `Jacobs, Alexandra. “The Muchness of Madonna.” Review of ...`                           | Citation added                   | ☐      |
| Raw dissertation citation | `Blajer de la Garza, Yuna. “A House Is Not a Home...”`                                  | Citation added                   | ☐      |
| Raw APA-like article      | `Einstein, A. (1905). the true about tree (Vol. 322, pp. 891–921).`                     | Citation added (heuristic parse) | ☐      |

## Unsupported / failure states

| Input type        | Sample                                           | Expected result                                 | Status |
| ----------------- | ------------------------------------------------ | ----------------------------------------------- | ------ |
| Empty input       | blank textarea                                   | No action / no parse                            | ☐      |
| Random text       | `hello world`                                    | Supported-input guidance notice                 | ☐      |
| LaTeX doc         | `\documentclass{article} ... \printbibliography` | LaTeX-specific notice                           | ☐      |
| BibLaTeX cite cmd | `\autocite{einstein}`                            | LaTeX-specific notice                           | ☐      |
| Oversized input   | >1 MB                                            | Size warning notice                             | ☐      |
| >50 entries       | >50 entries                                      | Warning that only first 50 items were processed | ☐      |

## Duplicate handling

| Scenario                               | Expected result                                  | Status |
| -------------------------------------- | ------------------------------------------------ | ------ |
| Paste same DOI twice in one batch      | One added, duplicates skipped notice             | ☐      |
| Paste DOI already present in block     | No new citations added; duplicate skipped notice | ☐      |
| Paste duplicate BibTeX already present | No new citations added; duplicate skipped notice | ☐      |

## Review / warning states

| Scenario                                | Expected result                                    | Status |
| --------------------------------------- | -------------------------------------------------- | ------ |
| DOI review record / suspicious metadata | Warning notice + per-entry warning text            | ☐      |
| Low-confidence free-text parse          | Citation added, structured field editing available | ☐      |
| Partial parse batch                     | Notice indicates some items could not be parsed    | ☐      |

## Style switching

| Scenario                                         | Expected result                     | Status |
| ------------------------------------------------ | ----------------------------------- | ------ |
| Chicago Notes-Bibliography → Chicago Author-Date | Citation text changes appropriately | ☐      |
| Chicago Notes-Bibliography → APA 7               | Citation text changes appropriately | ☐      |
| Style switch with `displayOverride` present      | Override preserved                  | ☐      |
| Reset after style switch                         | Restores current style output       | ☐      |

## Save / reload / frontend

| Scenario           | Expected result                                      | Status |
| ------------------ | ---------------------------------------------------- | ------ |
| Save draft/post    | No block validation error                            | ☐      |
| Reload editor      | Block content preserved                              | ☐      |
| Frontend render    | Bibliography list renders correctly                  | ☐      |
| Frontend metadata  | JSON-LD and CSL-JSON script blocks present           | ☐      |
| Frontend metadata  | COinS span present                                   | ☐      |
| Frontend semantics | `doc-bibliography` section role present; no deprecated `doc-biblioentry` roles in newly saved entries | ☐      |
| Frontend layout    | Long URLs wrap without overflow                      | ☐      |

## Notes

-   For Chicago Notes-Bibliography, pinpoint page numbers are generally expected in notes, not in bibliography entries for books.
-   JSON-LD is on by default; COinS and CSL-JSON are opt-in output layers.
-   If duplicate-add attempts or unsupported-input examples fail silently, treat that as a regression and capture the exact pasted text.
