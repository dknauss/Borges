# Contributed exports

Exports from the maintainers' own reference-manager libraries. They add what
the public samples lack: everyday records, exported with default settings, by
the manager versions people use.

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
