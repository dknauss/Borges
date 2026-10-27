# Reference-manager export corpus

Whole-file exports pasted into the Bibliography block, run through the real
(unmocked) citation-js parser. The corpus has two halves:

- **Hand-authored files** in this directory, exercised by
  `src/lib/reference-manager-exports.test.js` with targeted assertions.
- **Real exports** in `public/` and `contributed/`, written by the exporting
  application itself and exercised by `src/lib/reference-manager-corpus.test.js`
  from `manifest.json`.

## Hand-authored files

**Every file in this directory (not its subdirectories) is hand-authored.** Each one models the documented or
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
| `zotero-csl.json` | Zotero CSL-JSON export | A JSON array; each item imports as a citation |

The records are real publications (NumPy in *Nature*, Kuhn, Geertz, Vaswani
et al., Gödel, Shannon), so their metadata can be checked against the
published works.

RIS has no hand-authored fixture: the RIS files in `contributed/` are real
exports, and `src/lib/ris-import.test.js` checks the RIS import itself.

## Real exports

| Directory | Contents | License |
|---|---|---|
| `public/better-bibtex/` | Output of Zotero's Better BibTeX, Better BibLaTeX, and Better CSL JSON exporters, from Better BibTeX's regression tests (`test/fixtures/export/`, pinned to a commit in `manifest.json`). The records are often minimal test items, but the syntax is what the exporter writes. Also `endnote-keyless.bibtex.bib`, a user's EndNote BibTeX export from the import tests (`test/fixtures/import/`). | MIT, `public/better-bibtex/LICENSE` |
| `public/jabref/` | `complex.bib`, a JabRef database file from JabRef's test resources, with `@Preamble`, `@String`, prose comments between entries, and the `jabref-meta` footer; and `endnote-20-report.xml`, an EndNote 20 XML export from its EndNote XML importer tests. | MIT, `public/jabref/LICENSE` |
| `contributed/` | Exports from the maintainers' own reference managers: Zotero 10.0.6 exporting `borges-sample.ris` as BibTeX, BibLaTeX, CSL JSON, and RIS. See `contributed/README.md`. | Contributed to this project under its license |

Files are renamed to short, space-free names; `manifest.json` records each
original path. Only take files whose license is GPL-compatible (MIT, BSD,
CC0, public domain). These fixtures are not shipped in the plugin ZIP
(`src/` is in `.distignore`).

### `manifest.json`

Each entry in `files` has:

| Field | Meaning |
|---|---|
| `path` | Path relative to this directory |
| `manager`, `exporter` | The application and the export format it used, with a version where known |
| `source` | Where the file came from: a pinned URL, or "Contributed by …" |
| `license`, `licenseFile` | The license, and the notice file kept beside it |
| `quirks` | What the file exercises |
| `expect` | `entries`, `errors`, and `truncated` from `parsePastedInput()`, and the `inputFormat` every entry reports |
| `knownGaps` | Optional. Where Borges falls short on this file today, so `expect` pins the current behavior on purpose |

The test fails when a file on disk is missing from the manifest or the other
way round. It also snapshots the CSL-JSON each file yields, in
`src/lib/__snapshots__/reference-manager-corpus.test.js.snap`.

### Adding a file

1. Put the export in `public/<source>/` (with its license) or `contributed/`.
2. Add a `manifest.json` entry, with `expect` set to what Borges should do.
3. Run `npm test -- src/lib/reference-manager-corpus.test.js`. If the counts
   are right, record the snapshot with `-u` and read it: every field in it is
   what a pasted export would store.
4. A real export that disagrees with a hand-authored fixture is the more
   trustworthy of the two; fix the fixture or the parser, not the export.

### EndNote samples

EndNote is paid, so it has no contributed exports yet (an EndNote trial or a
demo copy is on the backlog). The public samples above are what qualified.
Looked at and not used:

- JabRef's other EndNote XML test files: three were written by Bookends, not
  EndNote, and the rest hold copies of one EndNote 15 record (line-wrapped by
  an editor, not as EndNote writes it) and of the EndNote 20 record kept here.
- JabRef's `.enw` (EndNote tagged) files: a few lines each, hand-made for
  pattern tests, and Borges reads no tagged format.
- Zotero's translator test cases (EndNote XML, RIS, Refer/BibIX): AGPL, which
  the corpus does not take.
