#!/usr/bin/env python3
"""
cut.py

Lifts individual creatures out of the Bosch plates in art/plates/ and writes
them to assets/beasts/ as feathered RGBA WebP, plus opaque painted bands to
assets/bands/.

    python3 art/cut.py            # everything
    python3 art/cut.py owl raven  # only slugs matching these substrings
    python3 art/cut.py --sheet    # rebuild the review contact sheet

Background removal keeps only the regions that are both close in colour to the
plate's border pixels AND connected to the border, so an interior patch of sky
coloured paint is never punched out by accident.
"""

import sys, os, glob
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLATES = os.path.join(ROOT, 'art', 'plates')
OUT_BEASTS = os.path.join(ROOT, 'assets', 'beasts')
OUT_BANDS = os.path.join(ROOT, 'assets', 'bands')

# slug: (source, crop l/t/r/b as fractions, mode, tolerance, feather px)
#   flood = cut the background away    oval = feathered ellipse
BEASTS = {
    # These segment cleanly: the creature sits on a settled ground.
    'owl':          ('owlWithBoy',      (0.00, 0.04, 0.74, 1.00), 'oval',  0,  14.0),
    'prince':       ('princeOfHell',    (0.38, 0.06, 1.00, 0.97), 'oval',  0,  14.0),
    'porcupine':    ('porcupine',       (0.04, 0.04, 0.76, 0.96), 'flood', 34, 2.0),
    'strawberry':   ('strawberry',      (0.26, 0.03, 0.80, 0.74), 'flood', 30, 2.0),
    'camel':        ('camel',           (0.26, 0.10, 0.88, 0.94), 'flood', 30, 2.0),
    'goldfinch':    ('birdFeeding',     (0.00, 0.00, 0.74, 0.82), 'oval',  0,  14.0),
    'drum':         ('manInDrum',       (0.10, 0.08, 0.92, 0.94), 'oval',  0,  14.0),

    # Craquelure beats the segmenter on these, so give the paint more room.
    'raven':        ('raven',           (0.22, 0.00, 0.72, 0.58), 'oval',  0,  14.0),
    'rabbit':       ('rabbit',          (0.42, 0.02, 0.97, 0.88), 'oval',  0,  14.0),
    'winged':       ('winged',          (0.16, 0.03, 0.88, 0.97), 'oval',  0,  14.0),
    'skater':       ('skatingMonster',  (0.12, 0.03, 0.97, 0.97), 'oval',  0,  14.0),
    'lobster':      ('lobster',         (0.02, 0.06, 0.84, 0.97), 'oval',  0,  14.0),

    # Roundels. A feathered medallion, which is how a manuscript would set them.
    'duckRider':    ('duckRider',       (0.06, 0.06, 0.94, 0.94), 'oval',  0,  14.0),
    'flutist':      ('flutist',         (0.06, 0.02, 0.90, 0.97), 'oval',  0,  14.0),
    'treeDisk':     ('treeManDisk',     (0.02, 0.02, 0.98, 0.72), 'oval',  0,  16.0),
    'treeInside':   ('treeManInside',   (0.10, 0.04, 0.94, 0.96), 'oval',  0,  16.0),
    'bagpipe':      ('bagpipe',         (0.10, 0.02, 0.92, 0.62), 'oval',  0,  14.0),
    'greenPerson':  ('greenPerson',     (0.04, 0.06, 0.72, 0.96), 'oval',  0,  14.0),
    'butterfly':    ('butterflyMonster',(0.02, 0.02, 0.78, 0.78), 'oval',  0,  14.0),
    'cerberus':     ('cerberus',        (0.06, 0.10, 0.88, 0.94), 'oval',  0,  14.0),
    'iceSkater':    ('iceSkater',       (0.26, 0.10, 0.80, 0.92), 'oval',  0,  14.0),
    'salamander':   ('salamanderRider', (0.20, 0.24, 0.90, 0.94), 'oval',  0,  14.0),
    'flower':       ('largeFlower',     (0.06, 0.02, 0.96, 0.86), 'oval',  0,  14.0),
    'key':          ('key',             (0.32, 0.12, 0.97, 0.88), 'oval',  0,  14.0),
    'egg':          ('egg',             (0.02, 0.02, 0.62, 0.98), 'oval',  0,  14.0),
    'beetle':       ('beetle',          (0.22, 0.06, 0.82, 0.97), 'oval',  0,  14.0),
}

# slug: (source, crop, target aspect) opaque painted bands, no alpha
BANDS = {
    'pond':      ('pond',          (0.00, 0.12, 1.00, 0.92)),
    'amphibia':  ('amphibia',      (0.00, 0.04, 1.00, 0.96)),
    'crowd':     ('duckFeeding',   (0.00, 0.06, 1.00, 0.94)),
    'instruments': ('instruments', (0.00, 0.00, 1.00, 1.00)),
    'fruit':     ('fictionalFruit',(0.00, 0.00, 1.00, 1.00)),
    'strawberryMan': ('strawberryMan', (0.00, 0.00, 1.00, 1.00)),
    'egg':       ('egg',           (0.00, 0.00, 1.00, 1.00)),
    'treeFeet':  ('treeManFeet',   (0.00, 0.00, 1.00, 1.00)),
}

WORK = 860          # longest edge used while segmenting
EXPORT = 620         # longest edge of the exported beast


def load(slug):
    p = os.path.join(PLATES, f'src-{slug}.jpg')
    return Image.open(p).convert('RGB')


def crop_frac(im, box):
    l, t, r, b = box
    W, H = im.size
    return im.crop((int(l * W), int(t * H), int(r * W), int(b * H)))


def fit(im, longest):
    if max(im.size) <= longest:
        return im
    s = longest / max(im.size)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def flood_alpha(im, tol):
    """Alpha from regions that both resemble the border colour and touch the border."""
    a = np.asarray(im, dtype=np.int16)
    H, W = a.shape[:2]

    # A handful of representative border colours.
    border = np.concatenate([a[0, :], a[-1, :], a[:, 0], a[:, -1]]).reshape(-1, 3)
    step = max(1, len(border) // 900)
    samples = border[::step]

    # Cheap clustering: keep samples that are far apart from each other.
    centres = []
    for c in samples:
        if all(np.linalg.norm(c - k) > tol * 1.35 for k in centres):
            centres.append(c)
        if len(centres) >= 7:
            break
    if not centres:
        centres = [samples.mean(axis=0)]

    flat = a.reshape(-1, 3)
    near = np.zeros(flat.shape[0], dtype=bool)
    for c in centres:
        near |= (np.linalg.norm(flat - c, axis=1) < tol)
    near = near.reshape(H, W)

    # Only the background blobs that actually reach the frame edge.
    lab, n = ndimage.label(near)
    if n:
        edge_ids = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
        edge_ids.discard(0)
        bg = np.isin(lab, list(edge_ids)) if edge_ids else np.zeros_like(near)
    else:
        bg = np.zeros_like(near)

    fg = ~bg
    fg = ndimage.binary_closing(fg, np.ones((5, 5)))
    fg = ndimage.binary_fill_holes(fg)
    fg = ndimage.binary_opening(fg, np.ones((3, 3)))

    # Drop stray specks, keep anything of real size.
    lab, n = ndimage.label(fg)
    if n > 1:
        sizes = ndimage.sum(fg, lab, range(1, n + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s > 0.02 * sizes.max()]
        fg = np.isin(lab, keep)

    return Image.fromarray((fg * 255).astype(np.uint8), 'L')


def oval_alpha(size, feather):
    w, h = size
    m = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(m)
    inset = feather * 1.5
    d.ellipse((inset, inset, w - inset, h - inset), fill=255)
    return m.filter(ImageFilter.GaussianBlur(feather))


def trim(im):
    bbox = im.split()[-1].getbbox()
    return im.crop(bbox) if bbox else im


def cut_beast(name, spec):
    src, box, mode, tol, feather = spec
    im = fit(crop_frac(load(src), box), WORK)

    if mode == 'flood':
        alpha = flood_alpha(im, tol)
        alpha = alpha.filter(ImageFilter.GaussianBlur(feather))
        # Pull the edge in slightly so no background halo survives.
        alpha = alpha.point(lambda v: 0 if v < 128 else min(255, int((v - 128) * 2.4)))
        alpha = alpha.filter(ImageFilter.GaussianBlur(feather * 0.7))
    else:
        alpha = oval_alpha(im.size, feather)

    out = im.convert('RGBA')
    out.putalpha(alpha)
    out = trim(out)
    out = fit(out, EXPORT)

    os.makedirs(OUT_BEASTS, exist_ok=True)
    path = os.path.join(OUT_BEASTS, f'{name}.webp')
    out.save(path, 'WEBP', quality=88, method=6)
    return out, os.path.getsize(path)


def cut_band(name, spec):
    src, box = spec
    im = fit(crop_frac(load(src), box), 1500)
    os.makedirs(OUT_BANDS, exist_ok=True)
    path = os.path.join(OUT_BANDS, f'{name}.webp')
    im.save(path, 'WEBP', quality=82, method=6)
    return im, os.path.getsize(path)


def sheet():
    """Lay the cut beasts on parchment so the edges can actually be judged."""
    files = sorted(glob.glob(os.path.join(OUT_BEASTS, '*.webp')))
    CELL, COLS, LAB = 260, 6, 20
    rows = (len(files) + COLS - 1) // COLS
    bg = Image.new('RGB', (COLS * CELL, rows * (CELL + LAB)), (233, 220, 195))
    d = ImageDraw.Draw(bg)
    for i, f in enumerate(files):
        im = Image.open(f).convert('RGBA')
        im.thumbnail((CELL - 16, CELL - 16))
        r, c = divmod(i, COLS)
        x, y = c * CELL, r * (CELL + LAB)
        bg.paste(im, (x + (CELL - im.width) // 2, y + (CELL - im.height) // 2), im)
        d.text((x + 4, y + CELL + 2), os.path.basename(f)[:-5], fill=(60, 40, 20))
    p = os.path.join(ROOT, 'art', 'beasts-sheet.jpg')
    bg.save(p, quality=88)
    print('sheet ->', p, bg.size)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if '--sheet' in sys.argv and not args:
        sheet(); sys.exit(0)

    total = 0
    for name, spec in BEASTS.items():
        if args and not any(a.lower() in name.lower() for a in args):
            continue
        try:
            im, sz = cut_beast(name, spec)
            total += sz
            print(f'  beast {name:14} {im.width:4}x{im.height:<4} {sz/1024:6.1f} KB')
        except Exception as e:
            print(f'  FAIL  {name}: {e}')
    for name, spec in BANDS.items():
        if args and not any(a.lower() in name.lower() for a in args):
            continue
        try:
            im, sz = cut_band(name, spec)
            total += sz
            print(f'  band  {name:14} {im.width:4}x{im.height:<4} {sz/1024:6.1f} KB')
        except Exception as e:
            print(f'  FAIL  {name}: {e}')
    print(f'\ntotal {total/1024:.0f} KB')
    sheet()
