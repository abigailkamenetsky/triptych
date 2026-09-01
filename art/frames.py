#!/usr/bin/env python3
"""
frames.py

Turns illuminated border art into reading page backgrounds.

Drop images into art/supplied/ and run this. Anything readable works: PNG,
JPEG or WebP, portrait or landscape, with a clear centre for the text. They are
sorted by shape, sized to the two aspects the reader uses, and written to
assets/frames/ with an index the app reads at runtime.

With art/supplied/ empty it synthesises a stand-in out of the existing painted
edge bands, so the layout can be built and tested before the real art lands.

    python3 art/frames.py
"""

import os, glob, json
import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUPPLIED = os.path.join(ROOT, 'art', 'supplied')
GENERATED = os.path.join(ROOT, 'art', 'generated')
EDGE = os.path.join(ROOT, 'assets', 'edge')
GROUND = os.path.join(ROOT, 'assets', 'ground')
OUT = os.path.join(ROOT, 'assets', 'frames')

# Art is kept at the shape it was drawn. Stretching a plate to a screen it was
# not drawn for pulls every creature out of proportion, and rebuilding it by
# repeating a band of vine leaves a mechanical stripe down the edge, which is
# worse. So each plate is filed under the shape it actually is, and the reader
# picks whichever is nearest to the screen in front of it.
BUCKETS = [
    ('tall',      0.00, 0.60, (1240, 2560)),   # a phone held upright
    ('portrait',  0.60, 0.95, (1350, 1800)),   # an iPad held upright
    ('landscape', 1.05, 1.55, (1800, 1350)),   # an iPad on its side
    ('wide',      1.55, 9.00, (2000, 1150)),   # a desktop window
]
SHAPES = {b[0]: b[3] for b in BUCKETS}


# How far in from each edge the border art stops and the page begins. Measured
# off the supplied art; the reader insets its text by this much.
INSET = {name: {'x': 0.20, 'y': 0.20} for name, *_ in BUCKETS}

# Where the reader's page sits on the plate. The page background is cut from
# exactly this box, so the paper under the text is the plate's own paper and
# the two meet with no rectangle between them. Must match --page-inset-* in
# the stylesheet.
PAGE_BOX = {'x': 0.13, 'y': 0.10}

READABLE = ('.png', '.jpg', '.jpeg', '.webp', '.PNG', '.JPG', '.JPEG', '.WEBP')


def supplied():
    """Hand-supplied art wins outright; otherwise use what plates.py composed."""
    for folder in (SUPPLIED, GENERATED):
        out = []
        for ext in READABLE:
            out.extend(glob.glob(os.path.join(folder, f'*{ext}')))
        if out:
            return sorted(set(out)), folder
    return [], None


def fit_cover(im, size):
    """Fill the target exactly, cropping the overflow, never distorting."""
    tw, th = size
    s = max(tw / im.width, th / im.height)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    left = (im.width - tw) // 2
    top = (im.height - th) // 2
    return im.crop((left, top, left + tw, top + th))


def synth(shape):
    """A stand-in frame, built from the painted edge bands on vellum."""
    w, h = SHAPES[shape]
    base = Image.open(os.path.join(GROUND, 'page-light.webp')).convert('RGB')
    page = fit_cover(base, (w, h))

    bw = round(w * 0.10)
    bh = round(h * 0.10)
    for name, box, size in [
        ('top', (0, 0), (w, bh)),
        ('bottom', (0, h - bh), (w, bh)),
        ('left', (0, 0), (bw, h)),
        ('right', (w - bw, 0), (bw, h)),
    ]:
        band = Image.open(os.path.join(EDGE, f'{name}.webp')).convert('RGBA')
        band = band.resize(size, Image.LANCZOS)
        page.paste(band, box, band)
    return page


def bucket_for(im):
    a = im.width / im.height
    for name, lo, hi, size in BUCKETS:
        if lo <= a < hi:
            return name, size
    return ('portrait', SHAPES['portrait'])


def centre_colour(im, shape):
    """The tone of the clear middle, so the text page can match it exactly.

    The reader draws its own page inside the border, and any difference in tone
    shows as a rectangle. Sampling the art removes the seam."""
    ins = INSET.get(shape, INSET['portrait'])
    l = int(im.width * (ins['x'] + 0.06))
    r = int(im.width * (1 - ins['x'] - 0.06))
    t = int(im.height * (ins['y'] + 0.06))
    b = int(im.height * (1 - ins['y'] - 0.06))
    patch = im.crop((l, t, r, b)).resize((32, 32), Image.LANCZOS)
    px = list(patch.getdata())
    n = len(px)
    rgb = tuple(round(sum(c[i] for c in px) / n) for i in range(3))
    return '#%02x%02x%02x' % rgb


def write(im, shape, n):
    os.makedirs(OUT, exist_ok=True)
    name = f'{shape}-{n}.webp'
    path = os.path.join(OUT, name)
    im.save(path, 'WEBP', quality=82, method=4)

    # The paper the text will sit on, taken straight out of the plate.
    W, H = im.size
    page = im.crop((int(W * PAGE_BOX['x']), int(H * PAGE_BOX['y']),
                    int(W * (1 - PAGE_BOX['x'])), int(H * (1 - PAGE_BOX['y']))))
    page_name = f'{shape}-{n}-page.webp'
    page.save(os.path.join(OUT, page_name), 'WEBP', quality=84, method=4)

    return name, os.path.getsize(path), page_name


if __name__ == '__main__':
    for f in glob.glob(os.path.join(OUT, '*.webp')):
        os.remove(f)

    files, source = supplied()
    index = {name: [] for name, *_ in BUCKETS}
    index.update({'inset': INSET, 'pageBox': PAGE_BOX, 'synthetic': not files})
    total = 0

    if files:
        counts = {}
        for f in files:
            im = Image.open(f).convert('RGB')
            shape, size = bucket_for(im)
            counts[shape] = counts.get(shape, 0) + 1
            out = fit_cover(im, size)
            name, sz, page = write(out, shape, counts[shape])
            index.setdefault(shape, []).append({
                'src': name, 'page': page,
                'centre': centre_colour(out, shape),
                'aspect': round(size[0] / size[1], 4),
            })
            total += sz
            print(f'  {os.path.basename(f)[:34]:34} -> {name:22} {out.width}x{out.height} '
                  f'{sz/1024:6.0f} KB  {shape}')
    else:
        print('  nothing in art/supplied/ or art/generated/, using stand-ins')
        for shape in ('portrait', 'landscape'):
            im = synth(shape)
            name, sz, page = write(im, shape, 1)
            index[shape].append({'src': name, 'page': page, 'centre': centre_colour(im, shape),
                                 'aspect': round(SHAPES[shape][0] / SHAPES[shape][1], 4)})
            total += sz
            print(f'  synthetic {shape:10} -> {name} {sz/1024:6.0f} KB')

    with open(os.path.join(OUT, 'index.json'), 'w') as fh:
        json.dump(index, fh, indent=1)

    have = ', '.join(f'{len(index[n])} {n}' for n, *_ in BUCKETS if index.get(n))
    print(f'\n{have}, {total/1024:.0f} KB total')
    print('synthetic stand-ins' if index['synthetic'] else f'using art from {os.path.relpath(source, ROOT)}/')
