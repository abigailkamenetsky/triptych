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
    # The messenger: funnel hat, red cloak, a letter in his beak, on skates.
    'messenger':  ('anthony-full', (0.1575, 0.8090, 0.2065, 0.9600), 20, 1.5),
    # Red hooded figure carried on a wheeled frame.
    'wheelman':   ('anthony-full', (0.9120, 0.5180, 0.9620, 0.6330), 20, 1.5, True),
    # The Prince of Hell, from the Garden. Blue bird head on his throne.
    'prince':     ('src-princeOfHell', (0.360, 0.040, 1.000, 0.980), 40, 1.6),
    # A man riding inside a drum, also from the Garden.
    'drummer':    ('src-manInDrum', (0.10, 0.08, 0.92, 0.94), 48, 1.6),
}

# Already cut cleanly for the shelf, and reused here rather than cut twice.
FROM_BEASTS = ['camel', 'porcupine', 'strawberry']


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


def cut_alpha(im, tol, trim_edges=False):
    """Background is whatever both resembles the frame edge and reaches it."""
    a = np.asarray(im, dtype=np.int16)
    H, W = a.shape[:2]

    border = np.concatenate([a[0, :], a[-1, :], a[:, 0], a[:, -1]]).reshape(-1, 3)
    samples = border[::max(1, len(border) // 1200)]

    centres = []
    for c in samples:
        if all(np.linalg.norm(c - k) > tol * 1.25 for k in centres):
            centres.append(c)
        if len(centres) >= 9:
            break
    if not centres:
        centres = [samples.mean(axis=0)]

    flat = a.reshape(-1, 3)
    near = np.zeros(flat.shape[0], dtype=bool)
    for c in centres:
        near |= (np.linalg.norm(flat - c, axis=1) < tol)
    near = near.reshape(H, W)

    lab, n = ndimage.label(near)
    if n:
        edge = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
        edge.discard(0)
        bg = np.isin(lab, list(edge)) if edge else np.zeros_like(near)
    else:
        bg = np.zeros_like(near)

    fg = ~bg
    fg = ndimage.binary_closing(fg, np.ones((7, 7)))
    fg = ndimage.binary_fill_holes(fg)
    fg = ndimage.binary_opening(fg, np.ones((3, 3)))

    lab, n = ndimage.label(fg)
    if n:
        sizes = ndimage.sum(fg, lab, range(1, n + 1))
        biggest = sizes.max()
        if trim_edges:
            # The crop is generous, so the figure never reaches the frame.
            # Anything that does is ground the tolerance failed to catch.
            touching = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
            touching.discard(0)
            keep = [i + 1 for i, sz in enumerate(sizes)
                    if sz > 0.10 * biggest and (i + 1) not in touching]
            if not keep:
                keep = [int(np.argmax(sizes)) + 1]
        else:
            keep = [i + 1 for i, sz in enumerate(sizes) if sz > 0.10 * biggest]
        fg = np.isin(lab, keep)

    return Image.fromarray((fg * 255).astype(np.uint8))


def cut(name, spec):
    plate, box, tol, feather = spec[:4]
    trim = spec[4] if len(spec) > 4 else False
    vig = spec[5] if len(spec) > 5 else 0.0
    im = fit(crop_frac(load(plate), box), WORK)

    alpha = cut_alpha(im, tol, trim)
    alpha = alpha.filter(ImageFilter.GaussianBlur(feather))
    # Pull the edge in a touch, so no rim of background survives.
    alpha = alpha.point(lambda v: 0 if v < 132 else min(255, int((v - 132) * 2.6)))
    alpha = alpha.filter(ImageFilter.GaussianBlur(feather * 0.6))

    # Safety net. Where the segmenter fuses a figure to its ground, a generous
    # feathered ellipse dissolves the corners it left behind. Figures that cut
    # cleanly are already well inside it and are untouched.
    if vig:
        w, h = im.size
        m = Image.new('L', (w, h), 0)
        ImageDraw.Draw(m).ellipse((w * vig, h * vig, w * (1 - vig), h * (1 - vig)), fill=255)
        m = m.filter(ImageFilter.GaussianBlur(min(w, h) * 0.10))
        alpha = Image.fromarray(
            (np.asarray(alpha, dtype=np.float32) * np.asarray(m, dtype=np.float32) / 255.0
             ).clip(0, 255).astype(np.uint8))

    out = im.convert('RGBA')
    out.putalpha(alpha)
    bbox = out.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox:
        out = out.crop(bbox)
    out = fit(out, EXPORT)

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'{name}.webp')
    out.save(path, 'WEBP', quality=88, method=4)
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
