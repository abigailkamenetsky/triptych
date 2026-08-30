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
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUPPLIED = os.path.join(ROOT, 'art', 'supplied')
EDGE = os.path.join(ROOT, 'assets', 'edge')
GROUND = os.path.join(ROOT, 'assets', 'ground')
OUT = os.path.join(ROOT, 'assets', 'frames')

# The two shapes the reader asks for. Landscape is an iPad held sideways,
# portrait is a phone or an iPad held upright.
SHAPES = {'landscape': (1800, 1350), 'portrait': (1350, 1800)}

# How far in from each edge the border art stops and the page begins. Measured
# off the supplied art; the reader insets its text by this much.
INSET = {'landscape': {'x': 0.125, 'y': 0.115}, 'portrait': {'x': 0.115, 'y': 0.105}}

READABLE = ('.png', '.jpg', '.jpeg', '.webp', '.PNG', '.JPG', '.JPEG', '.WEBP')


def supplied():
    out = []
    for ext in READABLE:
        out.extend(glob.glob(os.path.join(SUPPLIED, f'*{ext}')))
    return sorted(set(out))


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


def centre_colour(im, shape):
    """The tone of the clear middle, so the text page can match it exactly.

    The reader draws its own page inside the border, and any difference in tone
    shows as a rectangle. Sampling the art removes the seam."""
    ins = INSET[shape]
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
    return name, os.path.getsize(path)


if __name__ == '__main__':
    for f in glob.glob(os.path.join(OUT, '*.webp')):
        os.remove(f)

    files = supplied()
    index = {'landscape': [], 'portrait': [], 'inset': INSET, 'synthetic': not files}
    total = 0

    if files:
        counts = {'landscape': 0, 'portrait': 0}
        for f in files:
            im = Image.open(f).convert('RGB')
            shape = 'landscape' if im.width >= im.height else 'portrait'
            counts[shape] += 1
            out = fit_cover(im, SHAPES[shape])
            name, sz = write(out, shape, counts[shape])
            index[shape].append({'src': name, 'centre': centre_colour(out, shape)})
            total += sz
            print(f'  {os.path.basename(f):38} -> {name:16} {out.width}x{out.height} '
                  f'{sz/1024:6.0f} KB  centre {index[shape][-1]["centre"]}')
        # A shape with no art borrows the other, cropped. Better than none.
        for shape in ('landscape', 'portrait'):
            if not index[shape]:
                other = 'portrait' if shape == 'landscape' else 'landscape'
                src = Image.open(os.path.join(OUT, index[other][0]['src'])).convert('RGB')
                out = fit_cover(src, SHAPES[shape])
                name, sz = write(out, shape, 1)
                index[shape].append({'src': name, 'centre': centre_colour(out, shape)})
                total += sz
                print(f'  (borrowed for {shape}) -> {name}')
    else:
        print('  art/supplied/ is empty, building stand-ins from the edge bands')
        for shape in SHAPES:
            im = synth(shape)
            name, sz = write(im, shape, 1)
            index[shape].append({'src': name, 'centre': centre_colour(im, shape)})
            total += sz
            print(f'  synthetic {shape:10} -> {name} {sz/1024:6.0f} KB')

    with open(os.path.join(OUT, 'index.json'), 'w') as fh:
        json.dump(index, fh, indent=1)

    print(f'\n{len(index["landscape"])} landscape, {len(index["portrait"])} portrait, {total/1024:.0f} KB total')
    print('synthetic stand-ins' if index['synthetic'] else 'using supplied art')
