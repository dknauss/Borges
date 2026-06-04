#!/usr/bin/env python3
"""
Generate WP.org banner assets from the SVG master.

Workflow
--------
1. Inkscape renders the SVG master to a full-resolution reference PNG (1920x560).
2. Pillow downscales the reference PNG to the two deployed WP.org banner sizes.

The reference PNG lives in .wordpress-org/source/ as a rendered snapshot of the
SVG; it is not the source of truth -- the SVG master is.  Always re-render from
the SVG when the design changes.

Localized banners
-----------------
WordPress.org supports locale-specific banner variants named
  banner-772x250-{locale}.png / banner-1544x500-{locale}.png
where {locale} uses the WordPress locale format (e.g. es_ES, fr_FR, ja).

To add a localized banner:
1. Copy the SVG master (.wordpress-org/source/bibliography-builder-banner.svg)
   to  .wordpress-org/source/bibliography-builder-banner-{locale}.svg
2. Translate the text elements in that SVG (quote, feature bullets, etc.)
3. For RTL locales, also mirror the layout with direction="rtl" and adjust
   text-anchor / x coordinates as needed.
4. Run:  python3 scripts/generate_brand_assets.py --locale {locale}
   or:   python3 scripts/generate_brand_assets.py --all-locales

Only generate locale banners when reviewed, locale-appropriate copy exists.
Do not ship unreviewed machine-translated banner text.

Usage
-----
  python3 scripts/generate_brand_assets.py               # default (en) banners
  python3 scripts/generate_brand_assets.py --skip-render # skip Inkscape step
  python3 scripts/generate_brand_assets.py --locale es_ES
  python3 scripts/generate_brand_assets.py --all-locales
"""

import argparse
import subprocess
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install pillow")

ROOT   = Path(__file__).resolve().parent.parent
ASSETS = ROOT / ".wordpress-org"
SOURCE = ASSETS / "source"

SVG_MASTER = SOURCE / "bibliography-builder-banner.svg"
REFERENCE  = SOURCE / "bibliography-builder-banner-reference-source-1920x560.png"

# Inkscape: prefer Homebrew path, fall back to PATH
_INKSCAPE_HOMEBREW = "/opt/homebrew/bin/inkscape"
INKSCAPE = _INKSCAPE_HOMEBREW if Path(_INKSCAPE_HOMEBREW).exists() else shutil.which("inkscape")

BANNER_WIDTHS = [(1544, 500), (772, 250)]


def locale_svg(locale: str) -> Path:
    return SOURCE / f"bibliography-builder-banner-{locale}.svg"


def locale_reference(locale: str) -> Path:
    return SOURCE / f"bibliography-builder-banner-{locale}-reference-1920x560.png"


def banner_outputs(locale: str | None) -> list[tuple[Path, int, int]]:
    suffix = f"-{locale}" if locale else ""
    return [
        (ASSETS / f"banner-{w}x{h}{suffix}.png", w, h)
        for w, h in BANNER_WIDTHS
    ]


def discover_locale_svgs() -> list[str]:
    prefix = "bibliography-builder-banner-"
    suffix = ".svg"
    locales = []
    for p in SOURCE.glob(f"{prefix}*.svg"):
        name = p.stem[len(prefix):]
        if name and not name.startswith("reference"):
            locales.append(name)
    return sorted(locales)


def render_reference_png(svg: Path, ref: Path) -> None:
    if not svg.exists():
        sys.exit(f"SVG not found: {svg}")
    if not INKSCAPE:
        sys.exit("inkscape not found. Install via Homebrew: brew install inkscape")

    print(f"Rendering {svg.name} -> {ref.name} via Inkscape ...")
    result = subprocess.run(
        [
            INKSCAPE, str(svg),
            "--export-type=png",
            f"--export-filename={ref}",
            "--export-width=1920",
            "--export-height=560",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        sys.exit(f"Inkscape error:\n{result.stderr}")
    print(f"  OK  {ref.name}")


def export_banner(reference: Path, output: Path, width: int, height: int) -> None:
    """Downscale reference PNG to target dimensions.

    Scales to fill the target height, preserving aspect ratio, then crops from
    the left edge (the banner design is left-anchored).  If the scaled width is
    narrower than the target, the image is centred on the background colour.
    """
    img = Image.open(reference).convert("RGBA")
    ref_w, ref_h = img.size

    scale    = height / ref_h
    scaled_w = round(ref_w * scale)
    scaled   = img.resize((scaled_w, height), Image.Resampling.LANCZOS)

    if scaled_w >= width:
        out = scaled.crop((0, 0, width, height))
    else:
        out = Image.new("RGBA", (width, height), "#F5F3EF")
        out.alpha_composite(scaled, ((width - scaled_w) // 2, 0))

    out.save(output)
    print(f"  OK  {output.name}  ({width}x{height})")


def run_locale(locale: str | None, skip_render: bool) -> None:
    if locale is None:
        svg = SVG_MASTER
        ref = REFERENCE
    else:
        svg = locale_svg(locale)
        ref = locale_reference(locale)
        if not svg.exists():
            sys.exit(
                f"Locale SVG not found: {svg}\n"
                f"Create it from the master SVG with translated text before generating locale banners."
            )

    if skip_render:
        if not ref.exists():
            sys.exit(f"--skip-render set but reference PNG is missing:\n{ref}")
        print(f"Skipping Inkscape render; using existing {ref.name}")
    else:
        render_reference_png(svg, ref)

    tag = f"locale '{locale}'" if locale else "default (en)"
    print(f"Exporting deployed banners ({tag}) from {ref.name} ...")
    for output, w, h in banner_outputs(locale):
        export_banner(ref, output, w, h)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--skip-render",
        action="store_true",
        help="Skip Inkscape step and use existing reference PNG(s)",
    )
    locale_group = parser.add_mutually_exclusive_group()
    locale_group.add_argument(
        "--locale",
        metavar="LOCALE",
        help="Generate banners for a single locale (e.g. es_ES). Requires a matching locale SVG in source/.",
    )
    locale_group.add_argument(
        "--all-locales",
        action="store_true",
        help="Generate banners for every locale SVG found in source/, plus the default.",
    )
    args = parser.parse_args()

    ASSETS.mkdir(exist_ok=True)
    SOURCE.mkdir(exist_ok=True)

    if args.all_locales:
        locales = discover_locale_svgs()
        run_locale(None, args.skip_render)
        for loc in locales:
            run_locale(loc, args.skip_render)
    else:
        run_locale(args.locale, args.skip_render)

    print("Done.")


if __name__ == '__main__':
    main()
