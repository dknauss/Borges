#!/usr/bin/env python3
"""Build the Borges brand assets (the "Folio" design, adopted 2026-11-23).

Writes, from code, every file of the WordPress.org asset set:

  .wordpress-org/banner-772x250.png, banner-1544x500.png
  .wordpress-org/icon.svg, icon-128x128.png, icon-256x256.png
  .wordpress-org/source/borges-banner.svg      (banner master, text outlined)
  .wordpress-org/source/borges-icon.svg        (same as icon.svg)
  .wordpress-org/source/borges-icon-512x512.png
  .wordpress-org/source/favicon/favicon.svg, favicon.ico (16, 32, 48),
      favicon-32x32.png, apple-touch-icon.png (180x180)

The design: a hairline frame and divider (after the Keel banner), three book
spines on a shelf in ink and oxblood on warm paper, BORGES in Cormorant
Garamond SemiBold letterspaced to the width of the EB Garamond Italic tagline.
Text is shaped with HarfBuzz and written as outlines, so the SVGs need no
fonts. The fonts (SIL Open Font License, from Google Fonts) are downloaded
into output/brand-fonts/ on the first run; output/ is git-ignored.

Usage:
    pip install fonttools uharfbuzz playwright
    python3 scripts/build_brand_assets.py           # SVGs and PNGs
    python3 scripts/build_brand_assets.py --svg-only

PNGs are rendered in Chromium through Playwright for Python. If its bundled
browser is not installed, set CHROMIUM_PATH to a Chromium or Chrome binary.
favicon.ico is assembled with ImageMagick (`convert`).

The art this replaced is kept in docs/design/archive/original-art/; the
design exploration behind it is in docs/design/banner-mockups/.
"""
import os
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / '.wordpress-org'
SOURCE = ASSETS / 'source'
FAVICON = SOURCE / 'favicon'
FONTS = ROOT / 'output' / 'brand-fonts'

TAGLINE = 'Structured bibliographies and inline citations in any style.'

# Palette.
PAPER = '#F6F2E9'
INK = '#1F2B33'
OXBLOOD = '#8A2B37'
HAIRLINE = '#D8CFBD'
MUTED = '#55524A'

# Static instances served by the Google Fonts CSS API (css2) for these styles.
GSTATIC = 'https://fonts.gstatic.com/s/'
FONT_URLS = {
    'cormorant-600.ttf': 'cormorantgaramond/v21/co3umX5slCNuHLi8bLeY9MK7whWMhyjypVO7abI26QOD_iE9GnM.ttf',
    'ebgaramond-italic.ttf': 'ebgaramond/v33/SlGFmQSNjdsmc35JDF1K5GRwUjcdlttVFm-rI7e8QI96.ttf',
}

_fonts = {}


def font(name):
    """Return (HarfBuzz font, TTFont) for a font, downloading it if needed."""
    if name not in _fonts:
        path = FONTS / name
        if not path.exists():
            FONTS.mkdir(parents=True, exist_ok=True)
            urllib.request.urlretrieve(GSTATIC + FONT_URLS[name], path)
        _fonts[name] = (hb.Font(hb.Face(path.read_bytes())), TTFont(path))
    return _fonts[name]


def text_path(font_name, text, x, y, size, tracking=0.0, fill='#000'):
    """Shape `text` (with kerning) and return (SVG <path>, advance width).

    `tracking` is extra space between letters, in ems.
    """
    hfont, tt = font(font_name)
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hfont, buf, {'kern': True, 'liga': True})
    scale = size / tt['head'].unitsPerEm
    track = tracking * size
    glyphs = tt.getGlyphSet()
    order = tt.getGlyphOrder()
    pen = SVGPathPen(glyphs)
    cx = x
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        transform = (scale, 0, 0, -scale, cx + pos.x_offset * scale, y - pos.y_offset * scale)
        glyphs[order[info.codepoint]].draw(TransformPen(pen, transform))
        cx += pos.x_advance * scale + track
    width = cx - x - track
    return f'<path fill="{fill}" d="{pen.getCommands()}"/>', width


def svg(width, height, body, title):
    """Wrap `body` in an accessible SVG document."""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}" role="img" aria-label="{title}">'
        f'<title>{title}</title>{body}</svg>\n'
    )


def spines():
    """Three book spines on a shelf, drawn in the banner's 1544x500 space.

    Their bounds are x 140-360, y 128-374; icon() scales the same group.
    """
    b = f'<line x1="140" y1="372" x2="360" y2="372" stroke="{INK}" stroke-width="4"/>'
    b += f'<rect x="168" y="150" width="44" height="220" fill="{INK}"/>'
    b += f'<rect x="222" y="128" width="50" height="242" fill="{OXBLOOD}"/>'
    b += f'<rect x="282" y="166" width="40" height="204" fill="{INK}" transform="rotate(9 322 370)"/>'
    # Two thin bands on the upright spines, like gilt tooling.
    for x, w, top in ((168, 44, 150), (222, 50, 128)):
        for offset in (26, 36):
            b += f'<rect x="{x}" y="{top + offset}" width="{w}" height="3" fill="{PAPER}" opacity=".7"/>'
    return b


def banner():
    """The 1544x500 banner; the 772x250 PNG is the same SVG at half size."""
    b = f'<rect width="1544" height="500" fill="{PAPER}"/>'
    b += f'<rect x="1" y="1" width="1542" height="498" fill="none" stroke="{HAIRLINE}" stroke-width="2"/>'
    b += f'<line x1="500" y1="0" x2="500" y2="500" stroke="{HAIRLINE}" stroke-width="2"/>'
    b += spines()
    # BORGES is letterspaced to exactly the tagline's width, so the wordmark
    # and the tagline read as one justified block.
    tag, tag_width = text_path('ebgaramond-italic.ttf', TAGLINE, 592, 362, 38, fill=MUTED)
    _, plain_width = text_path('cormorant-600.ttf', 'BORGES', 0, 0, 148)
    tracking = (tag_width - plain_width) / 5 / 148
    word, _ = text_path('cormorant-600.ttf', 'BORGES', 590, 252, 148, tracking=tracking, fill=INK)
    b += word
    b += f'<rect x="592" y="290" width="112" height="6" fill="{OXBLOOD}"/>'
    b += tag
    return svg(1544, 500, b, 'Borges Bibliography Builder')


def icon():
    """The square icon: the banner's spines, centred on paper with a hairline."""
    b = f'<rect width="256" height="256" fill="{PAPER}"/>'
    b += f'<rect x="1" y="1" width="254" height="254" fill="none" stroke="{HAIRLINE}" stroke-width="2"/>'
    # Spines span 220x246 at (140, 128); scale 0.7 and centre them.
    k = 0.7
    tx, ty = 128 - 250 * k, 128 - 251 * k
    b += f'<g transform="translate({tx:.1f} {ty:.1f}) scale({k})">{spines()}</g>'
    return svg(256, 256, b, 'Borges')


def favicon():
    """A 32x32 favicon: the spines simplified to read at 16px."""
    b = f'<rect width="32" height="32" rx="5" fill="{PAPER}"/>'
    b += f'<rect x="7" y="7" width="5" height="18" fill="{INK}"/>'
    b += f'<rect x="13" y="5" width="6" height="20" fill="{OXBLOOD}"/>'
    b += f'<rect x="20" y="8.5" width="4.5" height="16.5" fill="{INK}" transform="rotate(9 24.5 25)"/>'
    b += f'<rect x="4.5" y="25" width="23" height="2" fill="{INK}"/>'
    return svg(32, 32, b, 'Borges')


def write_svgs():
    """Write every SVG and return {name: markup} for rendering."""
    SOURCE.mkdir(parents=True, exist_ok=True)
    FAVICON.mkdir(parents=True, exist_ok=True)
    out = {'banner': banner(), 'icon': icon(), 'favicon': favicon()}
    (SOURCE / 'borges-banner.svg').write_text(out['banner'])
    (SOURCE / 'borges-icon.svg').write_text(out['icon'])
    (ASSETS / 'icon.svg').write_text(out['icon'])
    (FAVICON / 'favicon.svg').write_text(out['favicon'])
    return out


def launch(playwright):
    """Launch Chromium, falling back to CHROMIUM_PATH."""
    path = os.environ.get('CHROMIUM_PATH')
    if path:
        return playwright.chromium.launch(executable_path=path)
    return playwright.chromium.launch()


def render_pngs(svgs):
    """Render each PNG at its exact pixel size, then assemble favicon.ico."""
    from playwright.sync_api import sync_playwright

    tmp = ROOT / 'output' / 'brand-png'
    tmp.mkdir(parents=True, exist_ok=True)
    jobs = [
        ('banner', 1544, 500, ASSETS / 'banner-1544x500.png'),
        ('banner', 772, 250, ASSETS / 'banner-772x250.png'),
        ('icon', 256, 256, ASSETS / 'icon-256x256.png'),
        ('icon', 128, 128, ASSETS / 'icon-128x128.png'),
        ('icon', 512, 512, SOURCE / 'borges-icon-512x512.png'),
        ('icon', 180, 180, FAVICON / 'apple-touch-icon.png'),
        ('favicon', 32, 32, FAVICON / 'favicon-32x32.png'),
        ('favicon', 16, 16, tmp / 'favicon-16.png'),
        ('favicon', 48, 48, tmp / 'favicon-48.png'),
    ]
    with sync_playwright() as p:
        browser = launch(p)
        for name, w, h, dest in jobs:
            page = browser.new_page(viewport={'width': w, 'height': h})
            page.set_content(
                '<style>html,body{margin:0}svg{display:block;'
                f'width:{w}px;height:{h}px}}</style>{svgs[name]}'
            )
            page.screenshot(path=str(dest))
            page.close()
            print('wrote', dest.relative_to(ROOT))
        browser.close()

    convert = shutil.which('convert') or shutil.which('magick')
    if not convert:
        print('ImageMagick not found: favicon.ico not rebuilt', file=sys.stderr)
        return
    subprocess.run(
        [convert, str(tmp / 'favicon-16.png'), str(FAVICON / 'favicon-32x32.png'),
         str(tmp / 'favicon-48.png'), str(FAVICON / 'favicon.ico')],
        check=True,
    )
    print('wrote', (FAVICON / 'favicon.ico').relative_to(ROOT))


if __name__ == '__main__':
    svgs = write_svgs()
    print('wrote SVGs in .wordpress-org/ and .wordpress-org/source/')
    if '--svg-only' not in sys.argv:
        render_pngs(svgs)
