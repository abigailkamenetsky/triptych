#!/usr/bin/env python3
"""
plates.py

Composes illuminated border plates: a vellum ground, hand-drawn vine
scrollwork around the four edges, and real Bosch figures perched in the
corners, with a clear centre for the text.

Everything is drawn at three times size and reduced, which is the cheapest
antialiasing there is and keeps the line delicate.

    python3 art/plates.py
"""

import os, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GROUND = os.path.join(ROOT, 'assets', 'ground')
DEMONS = os.path.join(ROOT, 'assets', 'demons')
OUT = os.path.join(ROOT, 'art', 'generated')

SS = 3                       # supersample factor
SHAPES = {'landscape': (1800, 1350), 'portrait': (1350, 1800)}

# Pigments, ground from the panels and aged down. Anything saturated reads as
# modern the moment it sits on vellum.
STEM   = (122, 104, 68)
STEM_D = (86, 72, 46)
LEAF   = (134, 136, 92)
LEAF_D = (104, 108, 70)
BERRY  = (158, 74, 56)
BERRY2 = (152, 122, 58)
BLOOM  = (170, 132, 142)
BLOOM2 = (118, 132, 156)

# Which figures sit in which corner, per plate. Chosen so a plate never
# repeats a creature and the weights sit diagonally opposite each other.
# Only figures whose cutouts are genuinely clean. The reader and the porcupine
# both keep a patch of the ground they stood on, which shows badly on vellum.
# Fourteen figures cut cleanly, three to a plate, no repeats within a plate.
CASTS = [
    [('messenger', 'bl'), ('wheelman', 'tr'), ('strawberry', 'tl')],
    [('skater', 'br'), ('drummer', 'tr'), ('camel', 'tl')],
    [('prince', 'br'), ('rabbit', 'tl'), ('flower', 'tr')],
    [('wheelman', 'bl'), ('iceSkater', 'br'), ('goldfinch', 'tr')],
    [('porcupine', 'tl'), ('messenger', 'br'), ('lobster', 'tr')],
    [('camel', 'bl'), ('prince', 'tr'), ('winged', 'tl')],
]


def lerp(a, b, t):
    return a + (b - a) * t


def bez(p0, p1, p2, p3, t):
    u = 1 - t
    return (u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
            u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1])


def taper_line(d, pts, w0, w1, colour):
    """A stroke that thins along its length.

    Drawn as short joined runs of varying width. Stamping dots along the path
    was the first attempt and it fattened every stem into a ribbon and broke
    every curl into a dotted trail.
    """
    n = len(pts)
    if n < 2:
        return
    chunk = 6
    for i in range(0, n - 1, chunk):
        seg = pts[i:i + chunk + 1]
        if len(seg) < 2:
            continue
        w = max(1, round(lerp(w0, w1, i / max(1, n - 1))))
        d.line([(round(x), round(y)) for x, y in seg], fill=colour, width=w, joint='curve')


def leaf(d, x, y, ang, size, colour, edge):
    """A pointed leaf: a lens between two arcs, with a centre vein."""
    up, down = [], []
    for i in range(15):
        t = i / 14
        bulge = math.sin(t * math.pi) * size * 0.30
        cx = x + math.cos(ang) * size * t
        cy = y + math.sin(ang) * size * t
        up.append((cx - math.sin(ang) * bulge, cy + math.cos(ang) * bulge))
        down.append((cx + math.sin(ang) * bulge, cy - math.cos(ang) * bulge))
    d.polygon(up + list(reversed(down)), fill=colour, outline=edge)
    d.line([(round(x), round(y)),
            (round(x + math.cos(ang) * size), round(y + math.sin(ang) * size))],
           fill=edge, width=1)


def berry(d, x, y, r, colour):
    d.ellipse((x - r, y - r, x + r, y + r), fill=colour,
              outline=(70, 48, 30), width=max(1, int(r * 0.22)))
    d.ellipse((x - r * .42, y - r * .52, x - r * .04, y - r * .14),
              fill=tuple(min(255, c + 46) for c in colour))


def rosette(d, x, y, r, colour, petals=6):
    for i in range(petals):
        a = 2 * math.pi * i / petals
        cx, cy = x + math.cos(a) * r * .58, y + math.sin(a) * r * .58
        d.ellipse((cx - r * .46, cy - r * .46, cx + r * .46, cy + r * .46),
                  fill=colour, outline=(88, 60, 44))
    d.ellipse((x - r * .3, y - r * .3, x + r * .3, y + r * .3), fill=BERRY2)


def tendril(d, x, y, ang, size, rng):
    """A curl coming off the stem, tightening as it goes."""
    pts, a, r = [], ang, size
    px, py = x, y
    for i in range(52):
        a += 0.17 + i * 0.010
        r *= 0.962
        px += math.cos(a) * r * 0.14
        py += math.sin(a) * r * 0.14
        pts.append((px, py))
    taper_line(d, pts, max(1.0, size * 0.018), 1.0, STEM)
    if rng.random() < 0.55:
        berry(d, pts[-1][0], pts[-1][1], max(1.6, size * 0.030),
              BERRY if rng.random() < 0.6 else BERRY2)


def run_vine(d, p0, p3, normal, span, rng, w0, w1):
    """One vine along an edge, with leaves, curls and fruit hung off it."""
    amp = span * 0.055
    c1 = (lerp(p0[0], p3[0], .30) + normal[0] * amp,
          lerp(p0[1], p3[1], .30) + normal[1] * amp)
    c2 = (lerp(p0[0], p3[0], .70) - normal[0] * amp,
          lerp(p0[1], p3[1], .70) - normal[1] * amp)

    pts = [bez(p0, c1, c2, p3, i / 340) for i in range(341)]
    taper_line(d, pts, w0, w1, STEM)

    step = 20
    for i in range(step, len(pts) - step, step):
        x, y = pts[i]
        dx = pts[i + 4][0] - pts[i - 4][0]
        dy = pts[i + 4][1] - pts[i - 4][1]
        ang = math.atan2(dy, dx)
        side = 1 if (i // step) % 2 else -1
        roll = rng.random()

        if roll < 0.42:
            leaf(d, x, y, ang + side * (1.05 + rng.random() * .4),
                 span * (0.019 + rng.random() * 0.013),
                 LEAF if rng.random() < .6 else LEAF_D, STEM_D)
        elif roll < 0.66:
            tendril(d, x, y, ang + side * 1.5, span * 0.055, rng)
        elif roll < 0.80:
            berry(d, x + math.cos(ang + side * 1.5) * span * .022,
                  y + math.sin(ang + side * 1.5) * span * .022,
                  span * (0.0055 + rng.random() * 0.0035),
                  BERRY if rng.random() < .55 else BERRY2)
        elif roll < 0.88:
            rosette(d, x + math.cos(ang + side * 1.5) * span * .030,
                    y + math.sin(ang + side * 1.5) * span * .030,
                    span * 0.011, BLOOM if rng.random() < .6 else BLOOM2)


def compose(shape, cast, seed):
    rng = random.Random(seed)
    W, H = SHAPES[shape]
    w, h = W * SS, H * SS

    # Ground. Flat, with only a fine tooth on it.
    #
    # A mottled vellum was the obvious choice and it was wrong: border-image
    # scales the border slices and the centre differently, so any large scale
    # variation in the ground shows up as a step exactly where the border meets
    # the page. One even tone means the join cannot be seen at all.
    base = np.full((h, w, 3), (210, 197, 165), dtype=np.float32)
    tooth = np.random.default_rng(seed).normal(0, 2.6, (h, w, 1))
    plate = Image.fromarray(np.clip(base + tooth, 0, 255).astype(np.uint8), 'RGB')
    plate = plate.filter(ImageFilter.GaussianBlur(SS * 0.18))

    ink = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(ink)

    m = min(w, h) * 0.052              # how far the vine sits in from the edge
    span = min(w, h)
    tl, tr = (m, m), (w - m, m)
    bl, br = (m, h - m), (w - m, h - m)

    run_vine(d, tl, tr, (0, 1), span, rng, span * .0026, span * .0016)
    run_vine(d, br, bl, (0, -1), span, rng, span * .0026, span * .0016)
    run_vine(d, tl, bl, (1, 0), span, rng, span * .0025, span * .0015)
    run_vine(d, tr, br, (-1, 0), span, rng, span * .0025, span * .0015)

    # Corner curls, to close the frame.
    for (cx, cy), a in ((tl, 0.8), (tr, 2.35), (br, 3.9), (bl, 5.45)):
        tendril(d, cx, cy, a, span * 0.085, rng)

    ink = ink.filter(ImageFilter.GaussianBlur(SS * 0.22))
    plate = Image.alpha_composite(plate.convert('RGBA'), ink)

    # The figures, each kept wholly inside its corner. border-image slices the
    # plate into nine, and anything spilling out of a corner into an edge gets
    # repeated the length of that edge.
    CORNER = 0.20
    box_w, box_h = w * CORNER, h * CORNER
    for name, corner in cast:
        p = os.path.join(DEMONS, f'{name}.webp')
        if not os.path.exists(p):
            continue
        fig = Image.open(p).convert('RGBA')
        fs = min(box_w * 0.86 / fig.width, box_h * 0.86 / fig.height)
        fig = fig.resize((max(1, int(fig.width * fs)), max(1, int(fig.height * fs))), Image.LANCZOS)

        pad = m * 0.42
        x = int(pad) if corner in ('tl', 'bl') else int(w - pad - fig.width)
        y = int(pad) if corner in ('tl', 'tr') else int(h - pad - fig.height)

        shadow = Image.new('RGBA', fig.size, (0, 0, 0, 0))
        shadow.putalpha(fig.getchannel('A').point(lambda v: int(v * 0.30)))
        shadow = shadow.filter(ImageFilter.GaussianBlur(SS * 3))
        plate.alpha_composite(shadow, (x + SS * 3, y + SS * 5))
        plate.alpha_composite(fig, (x, y))

    return plate.convert('RGB').resize((W, H), Image.LANCZOS)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    n = 0
    for i, cast in enumerate(CASTS):
        for shape in ('landscape', 'portrait'):
            im = compose(shape, cast, seed=1000 + i * 7)
            path = os.path.join(OUT, f'plate-{shape}-{i + 1}.png')
            im.save(path)
            n += 1
            print(f'  {os.path.basename(path):28} {im.width}x{im.height}  '
                  f'{os.path.getsize(path) / 1024:6.0f} KB')
    print(f'\n{n} plates into art/generated/')
