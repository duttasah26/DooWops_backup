"""Bake the left-sidebar pill headers into small GIFs, like rm94.neocities.org.

Their crunchy look comes from being low-res, limited-colour GIFs shown with
`image-rendering: pixelated`: the letter edges keep only a few blended shades,
the rounded end is stair-stepped (GIF transparency is on/off), and any
zoom/high-DPI scaling turns pixels into crisp blocks instead of blurring.

Run from frontend/:  python tools/make_pills.py
Writes public/sidebar/<name>.gif. Change PILLS below to add or rename pills.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "public/fonts/BarlowCondensed-BoldItalic.ttf"  # "Retro Display"
OUT = ROOT / "public/sidebar"

W, H = 230, 40          # same size the CSS pills had (230px column, 28px text + 6px padding)
FONT_SIZE = 28
PAD_RIGHT = 16
COLOURS = 24            # palette size: fewer = crunchier letter edges
SS = 4                  # supersampling for the pill shape and dots

# light splat dots on the empty left side: (x %, y %, opacity, radius px),
# positioned in a 96px-wide box starting 8px in, 3px above and below the pill
DOT_BOX = (8, -3, 96, H + 6)

PILLS = {
    "play": ("play!", "#b5d333", "#0d0d0d", [
        (6, 50, .6, 4), (15, 20, .5, 2), (22, 75, .5, 2.5), (33, 40, .45, 1.5), (42, 85, .45, 3),
        (53, 15, .4, 1.5), (62, 60, .35, 2), (74, 30, .3, 1), (85, 72, .3, 1.5)]),
    "about": ("about.dw", "#2ebed6", "#ffffff", [
        (10, 25, .55, 3), (14, 62, .5, 1.5), (20, 35, .5, 2), (26, 80, .4, 1), (48, 20, .5, 3.5),
        (55, 55, .45, 1.5), (60, 30, .4, 1), (70, 78, .35, 2.5), (90, 40, .3, 1)]),
    "noise": ("the.noise", "#2a61d1", "#ffffff", [
        (8, 40, .55, 3), (14, 78, .45, 1.5), (23, 22, .5, 2), (31, 62, .5, 2.5), (40, 34, .4, 1),
        (47, 82, .4, 2), (57, 48, .4, 1.5), (68, 20, .3, 1), (78, 66, .3, 2), (90, 38, .25, 1)]),
    "updatelog": ("update.log", "#009b36", "#ffffff", [
        (4, 30, .5, 1.5), (11, 75, .5, 2), (19, 45, .45, 1), (30, 20, .45, 1.5), (38, 60, .5, 4),
        (50, 85, .4, 1), (58, 35, .4, 2), (72, 65, .35, 1.5), (88, 25, .3, 2)]),
}


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def make(label, bg, fg, dots):
    # pill shape + dots, drawn big and shrunk so the curve and dots are smooth
    big = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    r = H * SS // 2
    d.rounded_rectangle((-r, 0, W * SS - 1, H * SS - 1), radius=r, fill=hex_rgb(bg) + (255,))
    shape = big.split()[3]
    dots_layer = Image.new("RGBA", big.size, (0, 0, 0, 0))
    dd = ImageDraw.Draw(dots_layer)
    bx, by, bw, bh = DOT_BOX
    for xp, yp, op, rad in dots:
        cx, cy = (bx + bw * xp / 100) * SS, (by + bh * yp / 100) * SS
        rr = rad * SS
        dd.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=(255, 255, 255, int(255 * op)))
    big = Image.alpha_composite(big, dots_layer)
    big.putalpha(shape)  # keep the dots inside the pill
    img = big.resize((W, H), Image.LANCZOS)

    # the label at 1x, right-aligned and vertically centred
    font = ImageFont.truetype(str(FONT), FONT_SIZE)
    ImageDraw.Draw(img).text((W - PAD_RIGHT, H / 2), label, font=font, fill=hex_rgb(fg) + (255,), anchor="rm")

    # GIF: limited palette, on/off transparency outside the pill
    alpha = img.split()[3]
    flat = Image.new("RGB", img.size, hex_rgb(bg))
    flat.paste(img, mask=alpha)
    pal = flat.quantize(colors=COLOURS - 1, dither=Image.Dither.NONE)
    p = pal.load()
    a = alpha.load()
    for y in range(H):
        for x in range(W):
            if a[x, y] < 128:
                p[x, y] = COLOURS - 1
    palette = pal.getpalette()[: (COLOURS - 1) * 3] + [255, 0, 255]
    pal.putpalette(palette)
    return pal


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (label, bg, fg, dots) in PILLS.items():
        make(label, bg, fg, dots).save(OUT / f"{name}.gif", transparency=COLOURS - 1)
        print("wrote", (OUT / f"{name}.gif").relative_to(ROOT))
