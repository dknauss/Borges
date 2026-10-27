# Contributed exports

Exports from the maintainers' own reference-manager libraries. They add what
the public samples lack: everyday records, exported with default settings, by
the manager versions people use.

## The sample library

`borges-sample.ris` holds 12 published works chosen to cover the common
types and the hard cases: journal articles (one in German, one with a
"van der" name), books (one in French with "de"), a chapter, a conference
paper, a master's thesis, a report, an edited reference work, and a web page
with an access date. Import it into a new, empty library in each manager and
export that library, so every manager's files describe the same records and
can be compared field by field. It is not itself an export, so it is not in
`manifest.json`.

Current files:

| File | Manager | How it was made |
|---|---|---|
| `zotero-bibtex.bib`, `zotero-biblatex.bib`, `zotero-csl.json`, `zotero.ris` | Zotero 10.0.6, macOS | A throwaway profile; the sample imported through the connector endpoint (`POST /connector/import`), then exported through the local API (`/api/users/0/items/top?format=bibtex`, `biblatex`, `csljson`, `ris`), which runs the built-in export translators with default options |

Still wanted: Mendeley Reference Manager (BibTeX and RIS) and EndNote (its
BibTeX Export output style and RIS).

## Adding a file

Before committing a file:

- Export with the manager's defaults, and note the manager, version, and
  export format in `manifest.json` (`manager`, `exporter`).
- Remove anything private: notes, annotations, `file` attachment paths,
  `mendeley-groups`, and personal keywords or tags.
- Keep the records themselves: published works only, so their metadata can be
  checked against the originals.
- Set `source` to "Contributed by <name>, <date>" and `license` to
  "GPL-2.0-or-later" (the project's license).

Name files `<manager>-<format>.<ext>`, for example `zotero-bibtex.bib`,
`mendeley-reference-manager.bib`, or `endnote-bibtex.txt`.
