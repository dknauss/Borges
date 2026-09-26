# Legacy localized markup

Frozen markup saved by a real earlier `save()`, with its labels translated
into the saving editor's locale. It is kept independent of the current code:
it guards the deprecation that re-renders old markup with the labels it reads
back from that markup (`src/deprecated.js`).

- `fr-cite-export.html` was generated from `main` at `4911b2d` (before saved
  labels were made locale-independent) with French translations of "Cite /
  Export", "Copy citation", "Copied", and "Link to publication" active. It has
  one titled and one untitled citation, so it also carries the translated
  fallback `aria-label`.

Never regenerate these from the current code. Add a new file for a new case.
