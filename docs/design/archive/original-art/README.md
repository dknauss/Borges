# Original Borges art (retired 2026-11-23)

The WordPress.org banner, icon, and their sources as they were before the
"Folio" rebrand ([#298](https://github.com/dknauss/Borges/pull/298)): the
handwritten "Borges" signature over a shelf of three books, with the Library of
Babel hexagons behind it and the line "The library will endure; it is the
universe...".

Nothing here ships or deploys:

- The release ZIP (`scripts/package-release.sh`) copies only runtime files, and
  `.distignore` lists `docs`.
- The WordPress.org deploy (`wp-deploy.yml`) publishes `.wordpress-org/` only.
- ESLint and Prettier skip this folder, so the old scripts stay as they were.

| File | What it was |
|---|---|
| `banner-772x250.png`, `banner-1544x500.png` | the WordPress.org banners |
| `icon.svg`, `icon-128x128.png`, `icon-256x256.png` | the WordPress.org icons: three dark books on a gold shelf |
| `bibliography-builder-icon-512x512.png` | a large copy of the icon |
| `source/bibliography-builder-banner.svg` | the Inkscape banner master, with the signature paths and the `rough-ink` filter |
| `source/bibliography-builder-icon.svg` | the icon master |
| `generate-icons.js` | an older icon generator that drew a Dashicons "book" glyph; the icons above came from the SVG master instead (was `npm run assets:icons`) |
| `generate_brand_assets.py` | rendered the banner and localized variants from the SVG master (was `npm run assets:banners`) |

Both scripts resolve their paths from `scripts/`, so they will not run from
here as they are. The new assets are built by `scripts/build_brand_assets.py`
(`npm run assets:brand`).
