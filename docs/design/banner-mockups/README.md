# WordPress.org banner mockups (ideas, not live)

Three minimalist banner ideas for a possible Borges rebrand, drawn on 2026-11-23.
None of them is in use: the live banners are still the ones in `.wordpress-org/`.
They are tracked as an idea under "WordPress.org asset follow-up" in
`.planning/ROADMAP.md`.

![The three variants at 772x250](borges-banners-compare-772.png)

## What they share

The layout borrows the restraint of Dan's Keel banner: a hairline frame, a
vertical divider, the icon centred in the left panel, then the wordmark, a short
accent rule, and one line of tagline. Nothing else. The fonts and colours are
deliberately different from Keel's (Barlow, grey and steel blue), so the two
plugins read as siblings, not twins.

## The variants

| Variant | Wordmark / tagline fonts | Colours | Icon | Tagline |
|---|---|---|---|---|
| A · Folio | Cormorant Garamond SemiBold caps, EB Garamond Italic | ink `#1F2B33`, oxblood `#8A2B37`, paper `#F6F2E9` | three book spines on a shelf | Structured bibliographies for the block editor. |
| B · Hexagon | Fraunces (144 pt optical size), IBM Plex Sans | night `#14252E`, bone `#F1EADB`, brass `#C9A24D` | a hexagonal gallery from "The Library of Babel" with one book pulled | Every citation in its place. |
| C · Index | Spectral Medium, IBM Plex Mono | ink `#1E1F21`, terracotta `#B4532A`, paper `#FBFAF7` | a small bibliography with hanging indents | Paste a DOI. Get a bibliography. |

- **A** is the smallest step from today's branding, since the spines echo the
  current icon.
- **B** is the only dark banner, so it stands out most in the directory, and it
  leans hardest into the Borges reference.
- **C** was the recommendation: its icon shows what the plugin does even at icon
  size (128px), and the tagline states the main workflow.

Mixing is possible, for example B's colours with C's icon.

## Files

- `borges-banner-{a-folio,b-hexagon,c-index}.svg`: sources, with all text as
  outlines, so they render the same without the fonts.
- `borges-banner-*-772x250.png` and `borges-banner-*-1544x500.png`: the two
  sizes WordPress.org uses, rendered in Chromium.
- `build.py`: regenerates the SVGs. It needs `pip install fonttools uharfbuzz`
  and downloads the fonts (all SIL Open Font License, from Google Fonts) into a
  git-ignored `fonts/` folder on first run.

To render PNGs from the SVGs, any SVG rasterizer works because the text is
already outlined, for example:

```bash
rsvg-convert -w 1544 -h 500 borges-banner-c-index.svg -o borges-banner-c-index-1544x500.png
rsvg-convert -w 772 -h 250 borges-banner-c-index.svg -o borges-banner-c-index-772x250.png
```

## If one is adopted

Copy the chosen pair into `.wordpress-org/` as `banner-772x250.png` and
`banner-1544x500.png`, draw a matching `icon.svg` and the 128px and 256px icon PNGs,
and update `.wordpress-org/source/`. The `wp-deploy.yml` workflow publishes
`.wordpress-org/` to the plugin's SVN assets. Nothing in `docs/` ships in the
plugin ZIP or reaches WordPress.org.
