#!/usr/bin/env python3
"""
borders.py

Cuts the dense painted bands that frame the app: two tall strips from the Hell
panel for the left and right edges, two wide strips from the centre panel for
the top and bottom, and a column for the iPad rail.

Each edge strip is opaque along the outside and fades to nothing on the inside,
so the painting dissolves into the parchment instead of stopping at a line.

    python3 art/borders.py
"""

import os
import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLATES = os.path.join(ROOT, 'art', 'plates')
OUT = os.path.join(ROOT, 'assets', 'edge')

# name: (plate, crop l/t/r/b as fractions, output w/h, fade direction, fade span)
STRIPS = {
    # Tall edges, from the Hell panel, which is naturally 1:2.4 and packed.
    'left':   ('hell-panel',  (0.090, 0.10, 0.330, 0.97), (360, 3400), 'right',  0.26),
    'right':  ('hell-panel',  (0.640, 0.10, 0.880, 0.97), (360, 3400), 'left',   0.26),
    # Wide edges, from the procession and the crowd in the centre panel.
    'top':    ('garden-full', (0.268, 0.360, 0.732, 0.530), (3200, 320), 'down',  0.30),
    'bottom': ('garden-full', (0.268, 0.770, 0.732, 0.958), (3200, 320), 'up',    0.30),
    # The iPad rail is a whole column of Hell, opaque all the way across.
    'rail':   ('hell-panel',  (0.10, 0.02, 0.62, 1.00), (620, 3400), None, 0),
}


def load(name):
    return Image.open(os.path.join(PLATES, f'{name}.jpg')).convert('RGB')


def crop_frac(im, box):
    l, t, r, b = box
    W, H = im.size
    return im.crop((int(l * W), int(t * H), int(r * W), int(b * H)))


def fade_alpha(size, direction, span):
    """Opaque on the outer edge, gone by `span` of the way across."""
    w, h = size
    if direction in ('right', 'left'):
        ramp = np.clip(np.linspace(0, 1, w) / max(span, 1e-6), 0, 1)
        if direction == 'right':
            a = 1.0 - ramp                    # opaque at x=0
        else:
            a = 1.0 - ramp[::-1]              # opaque at x=w
        a = np.tile(a, (h, 1))
    else:
        ramp = np.clip(np.linspace(0, 1, h) / max(span, 1e-6), 0, 1)
        if direction == 'down':
            a = 1.0 - ramp                    # opaque at y=0
        else:
            a = 1.0 - ramp[::-1]              # opaque at y=h
        a = np.tile(a[:, None], (1, w))

    # Ease it so the fade reads as paint thinning out, not a linear wipe.
    a = a ** 1.35
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))


def build(name, spec):
    plate, box, (ow, oh), direction, span = spec
    im = crop_frac(load(plate), box).resize((ow, oh), Image.LANCZOS)

    if direction:
        out = im.convert('RGBA')
        out.putalpha(fade_alpha((ow, oh), direction, span))
    else:
        out = im.convert('RGB')

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'{name}.webp')
    out.save(path, 'WEBP', quality=80, method=6)
    return out, os.path.getsize(path)


if __name__ == '__main__':
    total = 0
    for name, spec in STRIPS.items():
        im, sz = build(name, spec)
        total += sz
        print(f'  {name:8} {im.width:5}x{im.height:<5} {sz/1024:6.1f} KB')
    print(f'\ntotal {total/1024:.0f} KB')

    # A contact sheet, laid out the way the frame actually sits on screen.
    left = Image.open(os.path.join(OUT, 'left.webp')).convert('RGBA').resize((90, 900))
    right = Image.open(os.path.join(OUT, 'right.webp')).convert('RGBA').resize((90, 900))
    top = Image.open(os.path.join(OUT, 'top.webp')).convert('RGBA').resize((700, 80))
    bottom = Image.open(os.path.join(OUT, 'bottom.webp')).convert('RGBA').resize((700, 80))
    rail = Image.open(os.path.join(OUT, 'rail.webp')).convert('RGB').resize((190, 900))

    sheet = Image.new('RGB', (700 + 190, 900), (238, 227, 202))
    sheet.paste(rail, (0, 0))
    sheet.paste(top, (190, 0), top)
    sheet.paste(bottom, (190, 820), bottom)
    sheet.paste(left, (190, 0), left)
    sheet.paste(right, (700 + 190 - 90, 0), right)
    p = os.path.join(ROOT, 'art', 'frame-sheet.jpg')
    sheet.save(p, quality=90)
    print('sheet ->', p)
