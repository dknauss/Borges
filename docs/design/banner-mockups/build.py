"""Build the Borges WordPress.org banner mockups as outlined SVG.

These are roadmap ideas, not live assets: see README.md beside this file and
"WordPress.org asset follow-up" in .planning/ROADMAP.md.

The layout follows Dan's Keel banner: a hairline frame, a vertical divider,
the icon centred in the left panel, then the wordmark, a short accent rule,
and one line of tagline. Fonts and colours differ per variant. Text is shaped
with HarfBuzz (so kerning applies) and written as paths, so the SVGs render
the same everywhere without the fonts installed. All coordinates are in the
1544x500 retina space.

Usage:
    pip install fonttools uharfbuzz
    python3 build.py [output-dir]   # defaults to this folder

The Google Fonts (all SIL Open Font License) are downloaded into ./fonts/ on
the first run; that folder is git-ignored.
"""
import math
import sys
import urllib.request
from pathlib import Path

import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

HERE = Path(__file__).resolve().parent
FONTS = HERE / 'fonts'
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE
OUT.mkdir(parents=True, exist_ok=True)

# Static instances served by the Google Fonts CSS API (css2) for these weights.
GSTATIC = 'https://fonts.gstatic.com/s/'
FONT_URLS = {
    'cormorant-600.ttf': 'cormorantgaramond/v21/co3umX5slCNuHLi8bLeY9MK7whWMhyjypVO7abI26QOD_iE9GnM.ttf',
    'ebgaramond-italic.ttf': 'ebgaramond/v33/SlGFmQSNjdsmc35JDF1K5GRwUjcdlttVFm-rI7e8QI96.ttf',
    'fraunces.ttf': 'fraunces/v38/6NUh8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0K7iN7hzFUPJH58njr1a03gg7S2nfgRYIctxujDg.ttf',
    'plexsans.ttf': 'ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSD6llzAA.ttf',
    'plexmono.ttf': 'ibmplexmono/v23/-F63fjptAgt5VM-kVkqdyU8n5ig.ttf',
    'spectral-500.ttf': 'spectral/v15/rnCs-xNNww_2s0amA9vKsV3G.ttf',
}


def ensure_font(name):
    """Download a font into ./fonts/ unless it is already there."""
    path = FONTS / name
    if not path.exists():
        FONTS.mkdir(exist_ok=True)
        urllib.request.urlretrieve(GSTATIC + FONT_URLS[name], path)
    return path


_cache = {}


def text_path(font, text, x, y, size, tracking=0.0, fill='#000', anchor='start'):
    """Shape text with HarfBuzz (kerning) and return an SVG <path>."""
    if font not in _cache:
        path = ensure_font(font)
        _cache[font] = (hb.Font(hb.Face(path.read_bytes())), TTFont(path))
    hfont, tt = _cache[font]
    upem = tt['head'].unitsPerEm
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hfont, buf, {'kern': True, 'liga': True})
    scale = size / upem
    track = tracking * size
    glyphs = tt.getGlyphSet()
    order = tt.getGlyphOrder()
    total = sum(p.x_advance for p in buf.glyph_positions) * scale + track * (len(text) - 1)
    if anchor == 'middle':
        x -= total / 2
    pen = SVGPathPen(glyphs)
    cx = x
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = order[info.codepoint]
        t = TransformPen(pen, (scale, 0, 0, -scale, cx + pos.x_offset * scale, y - pos.y_offset * scale))
        glyphs[name].draw(t)
        cx += pos.x_advance * scale + track
    return f'<path fill="{fill}" d="{pen.getCommands()}"/>', total


def frame(bg, line, divider_x=500):
    return (
        f'<rect width="1544" height="500" fill="{bg}"/>'
        f'<rect x="1" y="1" width="1542" height="498" fill="none" stroke="{line}" stroke-width="2"/>'
        f'<line x1="{divider_x}" y1="0" x2="{divider_x}" y2="500" stroke="{line}" stroke-width="2"/>'
    )


def svg(body, title):
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1544 500" width="1544" height="500" '
        f'role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n'
    )


# ---------------------------------------------------------------- A: Folio
def folio():
    paper, ink, oxblood, line, muted = '#F6F2E9', '#1F2B33', '#8A2B37', '#D8CFBD', '#55524A'
    b = frame(paper, line)
    # Three spines on a hairline shelf; the middle one leans, one is oxblood.
    b += f'<line x1="140" y1="372" x2="360" y2="372" stroke="{ink}" stroke-width="4"/>'
    b += f'<rect x="168" y="150" width="44" height="220" fill="{ink}"/>'
    b += f'<rect x="222" y="128" width="50" height="242" fill="{oxblood}"/>'
    b += f'<rect x="282" y="166" width="40" height="204" fill="{ink}" transform="rotate(9 322 370)"/>'
    # Spine bands: two thin rules per book, like gilt tooling.
    for x, w, top in ((168, 44, 150), (222, 50, 128)):
        b += f'<rect x="{x}" y="{top + 26}" width="{w}" height="3" fill="{paper}" opacity=".7"/>'
        b += f'<rect x="{x}" y="{top + 36}" width="{w}" height="3" fill="{paper}" opacity=".7"/>'
    word, _ = text_path('cormorant-600.ttf', 'BORGES', 588, 252, 152, tracking=0.16, fill=ink)
    b += word
    b += f'<rect x="592" y="290" width="112" height="6" fill="{oxblood}"/>'
    tag, _ = text_path('ebgaramond-italic.ttf', 'Structured bibliographies for the block editor.', 592, 362, 42, fill=muted)
    b += tag
    return svg(b, 'Borges Bibliography Builder')


# ---------------------------------------------------------------- B: Hexagon
def hexagon():
    night, bone, brass, line, muted = '#14252E', '#F1EADB', '#C9A24D', '#2C4552', '#A9B7BD'
    b = frame(night, line)
    # A flat-topped hexagon gallery (The Library of Babel) with four shelves.
    cx, cy, r = 250, 250, 150
    pts = ' '.join(f'{cx + r * math.cos(math.radians(a)):.1f},{cy + r * math.sin(math.radians(a)):.1f}' for a in range(0, 360, 60))
    b += f'<polygon points="{pts}" fill="none" stroke="{brass}" stroke-width="8" stroke-linejoin="round"/>'
    # Shelves: widths follow the hexagon's sides so they sit inside it.
    for i, yy in enumerate((175, 225, 275, 325)):
        half = r - abs(yy - cy) / math.tan(math.radians(60)) - 34
        b += f'<line x1="{cx - half:.1f}" y1="{yy}" x2="{cx + half:.1f}" y2="{yy}" stroke="{bone}" stroke-width="5" stroke-linecap="round" opacity="{1 if i == 1 else .55}"/>'
    # One volume pulled from the second shelf.
    b += f'<rect x="{cx + 18}" y="190" width="16" height="35" fill="{brass}"/>'
    word, _ = text_path('fraunces.ttf', 'Borges', 586, 254, 176, tracking=0.0, fill=bone)
    b += word
    b += f'<rect x="592" y="292" width="112" height="6" fill="{brass}"/>'
    tag, _ = text_path('plexsans.ttf', 'Every citation in its place.', 592, 362, 40, fill=muted)
    b += tag
    return svg(b, 'Borges Bibliography Builder')


# ---------------------------------------------------------------- C: Index
def index():
    paper, ink, terra, line, muted = '#FBFAF7', '#1E1F21', '#B4532A', '#DCDAD4', '#5A5B5E'
    b = frame(paper, line)
    # A bibliography in miniature: three hanging-indent entries.
    x0, indent, y = 150, 34, 136
    for n, (first, rest) in enumerate(((200, (166, 118)), (200, (140,)), (200, (166, 92)))):
        colour = terra if n == 0 else ink
        b += f'<rect x="{x0}" y="{y}" width="{first}" height="14" rx="2" fill="{colour}"/>'
        y += 26
        for w in rest:
            b += f'<rect x="{x0 + indent}" y="{y}" width="{w}" height="14" rx="2" fill="{ink}" opacity=".35"/>'
            y += 26
        y += 18
    word, _ = text_path('spectral-500.ttf', 'Borges', 586, 252, 162, tracking=0.02, fill=ink)
    b += word
    b += f'<rect x="592" y="290" width="112" height="6" fill="{terra}"/>'
    tag, _ = text_path('plexmono.ttf', 'Paste a DOI. Get a bibliography.', 592, 360, 34, fill=muted)
    b += tag
    return svg(b, 'Borges Bibliography Builder')


for name, fn in (('a-folio', folio), ('b-hexagon', hexagon), ('c-index', index)):
    (OUT / f'borges-banner-{name}.svg').write_text(fn())
    print('wrote', name)
