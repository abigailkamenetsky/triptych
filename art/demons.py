#!/usr/bin/env python3
"""
demons.py

Cuts free-standing demons out of The Temptation of Saint Anthony (Lisbon,
c. 1501), which is public domain. These are the walking figures Bosch set
against plain brown and grey ground, which is exactly why they lift cleanly
where the crowded Garden scenes never did.

Output is full colour RGBA to assets/demons/, meant to float on the page.

    python3 art/demons.py             # everything
    python3 art/demons.py messenger   # one
"""

import os, sys
import numpy as np
import cv2
from PIL import Image, ImageFilter, ImageDraw
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLATES = os.path.join(ROOT, 'art', 'plates')
OUT = os.path.join(ROOT, 'assets', 'demons')

WORK = 1000
EXPORT = 700

# name: (plate, crop l/t/r/b as fractions of the plate, tolerance, feather)
# Tolerances were found by sweeping each figure and looking. Bosch paints his
# demons in tones close to the ground they stand on, so the usable window is
# narrow and different for every one of them.
FIGURES = {
    # ── The Temptation of Saint Anthony ──
    'messenger':  ('anthony-full', (0.1560, 0.8060, 0.2080, 0.9620), 2.6, 0.10),
    'wheelman':   ('anthony-full', (0.9110, 0.5160, 0.9630, 0.6350), 2.6, 0.10),
    'reader':     ('anthony-full', (0.0840, 0.7980, 0.1200, 0.8600), 2.4, 0.12),
    'birdegg':    ('anthony-full', (0.0230, 0.7960, 0.0760, 0.9420), 2.6, 0.12),
    'hooded':     ('anthony-full', (0.0900, 0.5300, 0.1780, 0.7450), 2.6, 0.11),
    'redcape':    ('anthony-full', (0.8020, 0.4450, 0.8780, 0.6300), 2.6, 0.11),
    'tabler':     ('anthony-full', (0.7830, 0.7850, 0.8760, 0.9480), 2.6, 0.11),
    'ratrider':   ('anthony-full', (0.5920, 0.5980, 0.6740, 0.7520), 2.6, 0.11),
    'boatman':    ('anthony-full', (0.5280, 0.7680, 0.6140, 0.8940), 2.6, 0.11),
    'pilgrim':    ('anthony-full', (0.4000, 0.5920, 0.4650, 0.7250), 2.6, 0.11),
    'skyfish':    ('anthony-full', (0.0380, 0.4020, 0.1450, 0.5150), 2.6, 0.11),

    # ── The Garden of Earthly Delights ──
    'prince':     ('src-princeOfHell', (0.340, 0.020, 1.000, 0.995), 2.8, 0.07),
    'drummer':    ('src-manInDrum', (0.08, 0.06, 0.94, 0.96), 2.6, 0.09),
    'camel':      ('src-camel', (0.24, 0.08, 0.90, 0.96), 2.6, 0.09),
    'porcupine':  ('src-porcupine', (0.06, 0.06, 0.72, 0.94), 2.6, 0.13),
    'strawberry': ('src-strawberry', (0.24, 0.02, 0.82, 0.76), 2.6, 0.09),
    'skater':     ('src-skatingMonster', (0.14, 0.04, 0.92, 0.96), 2.6, 0.09),
    'rabbit':     ('src-rabbit', (0.44, 0.04, 0.96, 0.86), 2.6, 0.12),
    'raven':      ('src-raven', (0.20, 0.00, 0.74, 0.62), 2.6, 0.10),
    'lobster':    ('src-lobster', (0.02, 0.06, 0.86, 0.97), 2.6, 0.10),
    'beetle':     ('src-beetle', (0.20, 0.06, 0.84, 0.97), 2.6, 0.10),
    'goldfinch':  ('src-birdFeeding', (0.00, 0.00, 0.76, 0.84), 2.6, 0.10),
    'iceSkater':  ('src-iceSkater', (0.24, 0.10, 0.82, 0.94), 2.6, 0.10),
    'winged':     ('src-winged', (0.14, 0.02, 0.90, 0.98), 2.6, 0.10),
    'flower':     ('src-largeFlower', (0.04, 0.02, 0.96, 0.88), 2.6, 0.10),
}

# Already cut cleanly for the shelf, and reused here rather than cut twice.
FROM_BEASTS = []


def load(name):
    return Image.open(os.path.join(PLATES, f'{name}.jpg')).convert('RGB')


def crop_frac(im, box):
    l, t, r, b = box
    W, H = im.size
    return im.crop((int(l * W), int(t * H), int(r * W), int(b * H)))


def fit(im, longest):
    if max(im.size) <= longest:
        return im
    s = longest / max(im.size)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def grabcut_alpha(im, inset=0.06, iters=7, seed_box=None):
    """A matte from GrabCut.

    GrabCut models foreground and background as colour mixtures and finds the
    cut between them, which is the right instrument for a painted figure whose
    tones overlap the ground it stands on. Hand-tuned thresholds are not.
    """
    img = cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR)
    h, w = img.shape[:2]

    mask = np.zeros((h, w), np.uint8)
    if seed_box:
        l, t, r, b = seed_box
        rect = (int(l * w), int(t * h), int((r - l) * w), int((b - t) * h))
    else:
        m = int(min(h, w) * inset)
        rect = (m, m, w - 2 * m, h - 2 * m)

    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(img, mask, rect, bgd, fgd, iters, cv2.GC_INIT_WITH_RECT)

    fg = np.isin(mask, [cv2.GC_FGD, cv2.GC_PR_FGD])

    # One figure, holes filled.
    lab, n = ndimage.label(fg)
    if n > 1:
        sizes = ndimage.sum(fg, lab, range(1, n + 1))
        biggest = int(np.argmax(sizes)) + 1
        # Keep smaller pieces only if they are substantial: a beak, a skate,
        # a trailing tail are all disconnected at this resolution.
        keep = [i + 1 for i, sz in enumerate(sizes) if sz > 0.06 * sizes.max()]
        if biggest not in keep:
            keep.append(biggest)
        fg = np.isin(lab, keep)
    fg = ndimage.binary_fill_holes(fg)

    return fg


def decontaminate(rgb, alpha, reach=8.0):
    """Push edge pixels toward the colour just inside them.

    A half-transparent edge pixel is a mix of the figure and whatever it stood
    on, which is what leaves a coloured lip around a cutout. Extending the
    interior colour outward and blending it across the soft band removes the lip
    without touching the figure.
    """
    a = np.asarray(alpha, dtype=np.float32) / 255.0
    img = np.asarray(rgb, dtype=np.float32)

    core = (a > 0.90).astype(np.float32)[..., None]
    num = ndimage.gaussian_filter(img * core, (reach, reach, 0))
    den = ndimage.gaussian_filter(core, (reach, reach, 0)) + 1e-5
    inside = num / den

    band = (np.clip((0.95 - a) / 0.95, 0, 1) * (a > 0.02))[..., None]
    out = img * (1 - band) + inside * band
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB')


def cut(name, spec):
    plate, box, feather = spec[0], spec[1], spec[2]
    inset = spec[3] if len(spec) > 3 else 0.06
    seed_box = spec[4] if len(spec) > 4 else None

    im = fit(crop_frac(load(plate), box), WORK)
    fg = grabcut_alpha(im, inset, 7, seed_box)

    # Round the staircase off the boundary, then feather so it sits in the page.
    soft = ndimage.gaussian_filter(fg.astype(np.float32), 2.0)
    fg = soft > 0.5
    alpha = Image.fromarray((fg * 255).astype(np.uint8), 'L')
    alpha = alpha.filter(ImageFilter.GaussianBlur(feather))

    rgb = decontaminate(im, alpha)
    out = rgb.convert('RGBA')
    out.putalpha(alpha)

    bbox = out.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox()
    if bbox:
        out = out.crop(bbox)
    out = fit(out, EXPORT)

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'{name}.webp')
    out.save(path, 'WEBP', quality=90, method=4)
    return out, os.path.getsize(path)


def sheet():
    import glob, json
    from PIL import ImageDraw
    files = sorted(glob.glob(os.path.join(OUT, '*.webp')))
    CELL, COLS, LAB = 300, 6, 20
    rows = (len(files) + COLS - 1) // COLS
    bg = Image.new('RGB', (COLS * CELL, rows * (CELL + LAB)), (243, 232, 205))
    d = ImageDraw.Draw(bg)
    dims = {}
    for i, f in enumerate(files):
        im = Image.open(f).convert('RGBA')
        dims[os.path.splitext(os.path.basename(f))[0]] = [im.width, im.height]
        im.thumbnail((CELL - 20, CELL - 20))
        r, c = divmod(i, COLS)
        x, y = c * CELL, r * (CELL + LAB)
        bg.paste(im, (x + (CELL - im.width) // 2, y + (CELL - im.height) // 2), im)
        d.text((x + 4, y + CELL + 2), os.path.basename(f)[:-5], fill=(110, 85, 50))
    with open(os.path.join(OUT, 'index.json'), 'w') as fh:
        json.dump(dims, fh, indent=0)
    p = os.path.join(ROOT, 'art', 'demons-sheet.jpg')
    bg.save(p, quality=90)
    print('sheet ->', p, bg.size)


def borrow():
    """Copy the Garden cutouts that already lift cleanly."""
    src = os.path.join(ROOT, 'assets', 'beasts')
    os.makedirs(OUT, exist_ok=True)
    for name in FROM_BEASTS:
        a = os.path.join(src, f'{name}.webp')
        if not os.path.exists(a):
            continue
        im = Image.open(a).convert('RGBA')
        im = fit(im, EXPORT)
        b = os.path.join(OUT, f'{name}.webp')
        im.save(b, 'WEBP', quality=88, method=4)
        print(f'  {name:12} {im.width:4}x{im.height:<4} borrowed')


if __name__ == '__main__':
    args = sys.argv[1:]
    total = 0
    for name, spec in FIGURES.items():
        if args and not any(a.lower() in name.lower() for a in args):
            continue
        try:
            im, sz = cut(name, spec)
            total += sz
            print(f'  {name:12} {im.width:4}x{im.height:<4} {sz/1024:6.1f} KB')
        except Exception as e:
            print(f'  FAIL {name}: {e}')
    if not args:
        borrow()
    print(f'\ntotal {total/1024:.0f} KB')
    sheet()
