# Reference-manager export corpus

Whole-file exports pasted into the Bibliography block, exercised by
`src/lib/reference-manager-exports.test.js` through the real (unmocked)
citation-js parser.

## Provenance

**Every file here is hand-authored.** Each one models the documented or
commonly seen export style of one manager: field order, casing, escaping,
and file-level extras. None was exported from the application itself.
Replace a file with a real, anonymized export when one is available, then
update the expectations in the test. A real export that disagrees with a
fixture here is the more trustworthy of the two.

| File | Models | Quirks it carries |
|---|---|---|
| `zotero-bibtex.bib` | Zotero built-in BibTeX export | Tab indentation, `{Protected}` capitals, bare `month = sep`, UTF-8, `file`/`keywords`/`note` fields, and an `abstract` with a paragraph break (blank line) |
| `zotero-biblatex.bib` | Zotero built-in BibLaTeX export | `journaltitle`, `date`, `langid`, `location`, `rights`, `eventtitle`, `@thesis` with `type`, `@online` with `urldate` |
| `mendeley.bib` | Mendeley Desktop BibTeX export | Unindented alphabetical fields, `{{Double-braced}}` titles, LaTeX accent escapes (`{\"{o}}`), `mendeley-groups`, `pmid`, `archivePrefix`/`eprint`/`arxivId`, no blank line between entries |
| `endnote.bib` | EndNote BibTeX export style | `RN<n>` keys, uppercase `ISSN`/`DOI`/`ISBN`, single-hyphen page ranges, raw UTF-8, and `type = {Journal Article}` holding EndNote's reference-type name |
| `jabref.bib` | JabRef database file | `% Encoding: UTF-8` header, `@String` macro used unbraced (`journal = nature`), capitalized entry types, `owner`/`timestamp`/`groups`, `@Comment{jabref-meta: …}` footer blocks |
| `zotero-csl.json` | Zotero CSL-JSON export | A JSON array; Borges does not import JSON and must reject it cleanly |

The records are real publications (NumPy in *Nature*, Kuhn, Geertz, Vaswani
et al., Gödel, Shannon), so their metadata can be checked against the
published works.

RIS import is out of scope (RIS is an export format only), so there is no
RIS fixture.
