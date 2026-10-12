#!/usr/bin/env python3
"""Generate PWA icons from the favicon artwork.

Run once when the artwork changes; the PNGs are committed, not regenerated
at build time. Requires Python Pillow (already installed locally).
"""

from pathlib import Path
from PIL import Image, ImageDraw

BG = "#1f3a34"
FG = "#e8efe9"

ROOT = Path(__file__).resolve().parent.parent
OUT_ICONS = ROOT / "public" / "icons"


def draw_f_glyph(draw: ImageDraw.ImageDraw, scale: float, stroke: int) -> None:
    """Draw the light 'F' stroke used in favicon.svg."""
    x0 = int(9 * scale)
    y0 = int(10 * scale)
    y1 = int(22 * scale)
    y_mid = int(16 * scale)
    x_top = int(20 * scale)
    x_mid = int(17 * scale)
    radius = stroke // 2

    def cap(cx: int, cy: int) -> None:
        draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=FG)

    # Vertical bar: (9,10) -> (9,22)
    draw.line([(x0, y0), (x0, y1)], fill=FG, width=stroke)
    cap(x0, y0)
    cap(x0, y1)

    # Top horizontal: (9,10) -> (20,10)
    draw.line([(x0, y0), (x_top, y0)], fill=FG, width=stroke)
    cap(x_top, y0)

    # Middle horizontal: (9,16) -> (17,16)
    draw.line([(x0, y_mid), (x_mid, y_mid)], fill=FG, width=stroke)
    cap(x_mid, y_mid)


def render(size: int, radius: int, *, maskable: bool = False) -> Image.Image:
    """Render the icon at the target size, supersampling for smooth edges."""
    scale = 4
    canvas = size * scale
    img = Image.new("RGB", (canvas, canvas), BG)
    draw = ImageDraw.Draw(img)

    if maskable:
        # Full-bleed background; the glyph is centered within the safe zone.
        draw.rectangle([0, 0, canvas - 1, canvas - 1], fill=BG)
    else:
        draw.rounded_rectangle([0, 0, canvas - 1, canvas - 1], radius=radius * scale, fill=BG)

    draw_f_glyph(draw, scale, stroke=3 * scale)

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT_ICONS.mkdir(parents=True, exist_ok=True)

    # Favicon artwork uses rx="7" on a 32x32 viewBox.
    radius_ratio = 7 / 32

    render(192, int(192 * radius_ratio)).save(OUT_ICONS / "icon-192.png")
    render(512, int(512 * radius_ratio)).save(OUT_ICONS / "icon-512.png")
    render(512, 0, maskable=True).save(OUT_ICONS / "icon-maskable-512.png")
    render(180, int(180 * radius_ratio)).save(ROOT / "public" / "apple-touch-icon.png")

    print("Generated PWA icons.")


if __name__ == "__main__":
    main()
