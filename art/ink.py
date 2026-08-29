#!/usr/bin/env python3
"""
ink.py

Turns the painted creatures into ink drawings of themselves.

Each plate in assets/beasts/ is reduced to a line: gradient edges, thickened a
little so they survive at marginal sizes, plus the deepest shadows so the figure
still reads as a figure. The result is written as an alpha-only plate to
assets/ink/, which the page uses as a CSS mask. Colour then comes from the page
itself, so a creature is drawn in exactly the ink the text is set in and shifts
with the theme.

    python3 art/ink.py           # everything
    python3 art/ink.py owl fish  # only these
"""

import os, sys, glob
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'beasts')
OUT = os.path.join(ROOT, 'assets', 'ink')

EXPORT = 460          # longest edge of the exported drawing
BLUR = 3.4            # craquelure is fine detail; blur past it before differentiating
EDGE_CUT = 0.19       # only strong gradients become a stroke
# Shadow fill was flooding any creature painted on a dark ground with a grey
# disc, so the drawing is strokes only and the strokes are made heavier instead.
DARK_GAIN = 0.0
DARK_KNEE = 0.20
THICKEN = 2
DESPECKLE = 26        # drop ink islands smaller than this, in pixels
EROSION = 9           # pulls the drawing in off the cutout boundary
FEATHER = 7.0
VIGNETTE = 0.30       # outer fraction over which the drawing dissolves

# Only creatures that survive being reduced to a line. A crowded scene turns
# into noise no matter how it is thresholded.
# Curated by eye. These are the ones that stay legible once reduced to a line;
# a crowded scene becomes noise no matter how it is thresholded.
KEEP = {
    'owl', 'goldfinch', 'porcupine', 'iceSkater', 'skater',
    'winged', 'flower', 'key', 'butterfly', 'rabbit',
}


def luminance(rgb):
    a = np.asarray(rgb, dtype=np.float32) / 255.0
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def ink_plate(path):
    im = Image.open(path).convert('RGBA')
    alpha = np.asarray(im.getchannel('A'), dtype=np.float32) / 255.0

    # Blur before differentiating, or every craquelure line becomes a stroke.
    soft = im.convert('RGB').filter(ImageFilter.GaussianBlur(BLUR))
    g = luminance(soft)

    gx = ndimage.sobel(g, axis=1)
    gy = ndimage.sobel(g, axis=0)
    mag = np.hypot(gx, gy)

    # Normalise against the bright end rather than the max, so one hot pixel
    # does not flatten the whole drawing.
    hi = np.percentile(mag[alpha > 0.5], 97) if (alpha > 0.5).any() else mag.max()
    mag = np.clip(mag / max(hi, 1e-6), 0, 1)

    # A stroke or no stroke. Continuous tone is what turned these into mud.
    strokes = (mag > EDGE_CUT).astype(np.float32)

    # A little shadow fill so a figure is not a wireframe of itself.
    darks = (g < DARK_KNEE).astype(np.float32) * DARK_GAIN

    ink = np.clip(strokes + darks, 0, 1)

    # Craquelure survives as isolated specks. Drop anything too small to be a mark.
    if DESPECKLE:
        lab, n = ndimage.label(ink > 0.2)
        if n:
            sizes = ndimage.sum(ink > 0.2, lab, range(1, n + 1))
            keep = np.concatenate(([False], sizes >= DESPECKLE))
            ink = ink * keep[lab]

    if THICKEN:
        ink = ndimage.grey_dilation(ink, size=(THICKEN * 2 + 1, THICKEN * 2 + 1))
    ink = ndimage.gaussian_filter(ink, 0.8)

    # Keep the drawing off its own cutout boundary, then let it fade out.
    solid = alpha > 0.55
    if EROSION:
        solid = ndimage.binary_erosion(solid, np.ones((EROSION, EROSION)))
    gate = ndimage.gaussian_filter(solid.astype(np.float32), FEATHER)
    ink = ink * np.clip(gate, 0, 1)

    # Dissolve the outer edge so the drawing has no boundary of its own.
    h, w = ink.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    rx = np.abs(xx / max(w - 1, 1) - 0.5) * 2
    ry = np.abs(yy / max(h - 1, 1) - 0.5) * 2
    r = np.maximum(rx, ry)
    ink = ink * np.clip((1.0 - r) / max(VIGNETTE, 1e-6), 0, 1)

    ink = np.clip(ink * 1.25, 0, 1)

    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.putalpha(Image.fromarray((ink * 255).astype(np.uint8), 'L'))

    bbox = out.getchannel('A').point(lambda v: 255 if v > 6 else 0).getbbox()
    if bbox:
        out = out.crop(bbox)
    if max(out.size) > EXPORT:
        s = EXPORT / max(out.size)
        out = out.resize((max(1, round(out.width * s)), max(1, round(out.height * s))), Image.LANCZOS)
    return out


def sheet():
    """Lay the drawings on vellum, in ink, at the size they are actually used."""
    files = sorted(glob.glob(os.path.join(OUT, '*.webp')))
    CELL, COLS, LAB = 210, 7, 18
    rows = (len(files) + COLS - 1) // COLS
    bg = Image.new('RGB', (COLS * CELL, rows * (CELL + LAB)), (243, 232, 205))
    ink_rgb = (74, 52, 26)
    from PIL import ImageDraw
    d = ImageDraw.Draw(bg)
    for i, f in enumerate(files):
        plate = Image.open(f).convert('RGBA')
        plate.thumbnail((CELL - 22, CELL - 22))
        tint = Image.new('RGBA', plate.size, ink_rgb + (255,))
        tint.putalpha(plate.getchannel('A').point(lambda v: int(v * 0.62)))
        r, c = divmod(i, COLS)
        x, y = c * CELL, r * (CELL + LAB)
        bg.paste(tint, (x + (CELL - plate.width) // 2, y + (CELL - plate.height) // 2), tint)
        d.text((x + 4, y + CELL + 2), os.path.basename(f)[:-5], fill=(120, 95, 60))
    p = os.path.join(ROOT, 'art', 'ink-sheet.jpg')
    bg.save(p, quality=90)
    print('sheet ->', p, bg.size)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    os.makedirs(OUT, exist_ok=True)
    total = 0
    for path in sorted(glob.glob(os.path.join(SRC, '*.webp'))):
        name = os.path.splitext(os.path.basename(path))[0]
        if args and not any(a.lower() in name.lower() for a in args):
            continue
        if not args and name not in KEEP:
            continue
        plate = ink_plate(path)
        dest = os.path.join(OUT, f'{name}.webp')
        plate.save(dest, 'WEBP', quality=84, method=4, exact=True)
        sz = os.path.getsize(dest)
        total += sz
        print(f'  {name:14} {plate.width:4}x{plate.height:<4} {sz/1024:6.1f} KB')
    # The page needs each drawing's proportions to reserve the right box.
    import json
    dims = {}
    for f in sorted(glob.glob(os.path.join(OUT, '*.webp'))):
        with Image.open(f) as im:
            dims[os.path.splitext(os.path.basename(f))[0]] = [im.width, im.height]
    with open(os.path.join(OUT, 'index.json'), 'w') as fh:
        json.dump(dims, fh, indent=0)
    print(f'\ntotal {total/1024:.0f} KB  ·  {len(dims)} drawings indexed')
    sheet()
