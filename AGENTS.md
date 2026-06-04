# Bibliography Builder Block

WordPress block plugin: DOI/PubMed/BibTeX → semantically rich, auto-sorted bibliography.

## Authoritative Spec

`SPEC.md` is the source of truth for all behavior, output format, security requirements, accessibility rules, and the 9-phase roadmap. Read it before making architectural decisions.

## Build & Test

```bash
npm install
npm run build        # Production build (@wordpress/scripts)
npm run start        # Dev mode with file watching
npm run lint:js      # ESLint (WordPress config)
npm run lint:css     # Stylelint (WordPress config)
npm run test         # Jest unit tests
```

## Architecture

- **Static save** — `save.js` bakes HTML into post content. No PHP `render_callback`. Output survives plugin deactivation.
- **CSL-JSON is the source of truth** — all metadata output (JSON-LD, COinS, CSL-JSON script blocks) derives from the `csl` object in each citation.
- **`displayOverride`** — user-edited display text. When set, rendered instead of auto-formatted output. Does NOT modify the `csl` object.
- **citation-js** — handles BibTeX parsing and fallback DOI support. Browser DOI resolution primarily uses CrossRef's CSL transform endpoint directly; CSL formatting is handled by the PHP formatter. Pinned versions, not ranges.

## Key Rules from Spec

- Never use `dangerouslySetInnerHTML` for citation text. Use React text children for automatic escaping.
- `dangerouslySetInnerHTML` is only acceptable for JSON-LD and CSL-JSON `<script>` blocks, with `</` escaped as `\u003c/`.
- citation-js output format must be `text`, not `html`.
- Sanitize at point of output (save.js), not only at parse time.
- COinS values must be `encodeURIComponent()`-encoded.
- Max 50 entries per paste. Max 1MB input size.

## Test Strategy

Strict TDD. Tests live in `src/__tests__/` or alongside source as `*.test.js`. Test files per spec:

- `parser.test.js` — format detection, DOI/BibTeX parsing, edge cases, security (script tags in fields)
- `sorter.test.js` — Chicago author-date sort (author → year → title), Unicode, case insensitivity
- `coins.test.js` — COinS string generation, encoding, security (attribute injection)
- `jsonld.test.js` — type mapping, author construction, ORCID, script breakout prevention
- `save.test.js` — rendered output structure, ARIA roles, XSS prevention, JSON-LD/CSL-JSON breakout

See SPEC.md "Testing Strategy" section for the full test matrix.

## Browser and Playwright Handoff

If a task requires browser automation, Playwright testing, screenshots, page interaction, or browser-only inspection:

- Say clearly that a fresh browser-capable Codex session is required.
- Do not imply that Playwright or browser mode can be enabled from inside the current session.
- Tell the user to restart with `/Users/danknauss/bin/Codex-playwright` or `/Users/danknauss/bin/Codex-browser-handoff`.

Use this only when browser tooling is actually needed, not when it is merely convenient.
