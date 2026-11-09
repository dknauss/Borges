# Storybook

Storybook shows the block's editor components on their own, in the states
that are slow to reach in a real editor: a journal article and a book in the
structured editor, an error or a snackbar, the first and last entries' reorder
buttons, or each style's repeated-author choices.

```bash
npm run storybook         # dev server at http://localhost:6006
npm run storybook:build   # static build in storybook-static/
npm run test:storybook    # build, then check every story
```

## What the check does

`npm run test:storybook` builds Storybook, then `scripts/storybook-a11y.mjs`
opens every story in Chromium and fails when a story throws or logs a console
error, a request fails, a story renders nothing (unless it is meant to, like
`NoNotice`), or axe reports a violation inside the story. CI runs it in the
Playwright `a11y` job. In the Storybook UI, the Accessibility panel shows the
same axe results for the story on screen.

## How it is set up

- Storybook uses Vite, not the webpack build from `wp-scripts`. `.storybook/main.mjs`
  treats `.js` files as JSX with the automatic runtime, as wp-scripts' Babel does.
- Stories import the real `@wordpress/*` packages from `node_modules`; in
  WordPress the block uses the `wp.*` globals instead.
- `.storybook/preview.jsx` loads the `@wordpress/components` CSS and
  `src/editor.scss`, and wraps every story in
  `.wp-block-bibliography-builder-bibliography`, because the editor styles are
  scoped to the block's wrapper.
- Stories use `fn()` from `storybook/test` for callbacks, so the Actions panel
  logs each call.

## Which components have stories

| Component | Stories |
|---|---|
| `StructuredCitationEditor` | Journal article, book, manual entry with the type selector |
| `CitationReorderControls` | Middle, first, last, and only entry; no label |
| `EditorCanvasNotices` | None, success, warning, error, snackbar |
| `HeadingAlignControl` | Centred, start, unknown value |
| `RepeatedAuthorMarkControl` | Chicago, MLA, OSCOLA, ABNT, APA (renders nothing) |

`CitationEntryBody` reads no store either, but takes about 25 handlers from the
editor state hook; it is the next candidate. `CitationUpdatePanel` reads the
block editor store, so its stories would need a mocked registry
(`RegistryProvider` from `@wordpress/data`).

## Adding a story

Put `component-name.stories.js` beside the component. Give each story `args`
for the props, use `fn()` for callbacks, and keep sample citations accurate:
they are read as examples. Run `npm run test:storybook` before pushing.
