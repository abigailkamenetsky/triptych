#!/usr/bin/env python3
"""
splash.py

Launch screens for the home screen app.

Without these iOS shows a white rectangle while the app boots, which is the
single clearest sign that something is a web page wearing an icon. With them
it opens on its own ground like anything else on the home screen.

iOS matches these by exact device pixel size, so each one has to be built at
the size of a real device and declared with a matching media query.

    python3 art/splash.py
"""

import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON = os.path.join(ROOT, 'icons', 'icon-1024.png')
OUT = os.path.join(ROOT, 'icons', 'splash')

# device pixels, portrait. Landscape is produced from each iPad entry.
DEVICES = [
    ('iphone-se',        750, 1334, 2),
    ('iphone-14',       1170, 2532, 3),
    ('iphone-15',       1179, 2556, 3),
    ('iphone-15-max',   1290, 2796, 3),
    ('iphone-16-max',   1320, 2868, 3),
    ('ipad-109',        1640, 2360, 2),
    ('ipad-pro-11',     1668, 2388, 2),
    ('ipad-pro-13',     2048, 2732, 2),
]
LANDSCAPE_FOR = {'ipad-109', 'ipad-pro-11', 'ipad-pro-13'}


def ground(w, h):
    """The same vermilion the icon sits on, lit from above."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = w / 2, h * 0.34
    r = np.sqrt(((xx - cx) / (w * 0.95)) ** 2 + ((yy - cy) / (h * 0.85)) ** 2)
    r = np.clip(r, 0, 1)[..., None]

    hot = np.array([184, 69, 42], dtype=np.float32)
    mid = np.array([143, 45, 30], dtype=np.float32)
    dark = np.array([57, 16, 10], dtype=np.float32)
    rgb = np.where(r < 0.5, hot + (mid - hot) * (r / 0.5), mid + (dark - mid) * ((r - 0.5) / 0.5))

    # No grain here. It is invisible behind an icon for half a second and it
    # takes a 200 KB gradient to four megabytes.
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB')


def build(w, h):
    plate = ground(w, h)
    mark = Image.open(ICON).convert('RGBA')

    # The icon reads best at roughly a third of the short edge.
    size = int(min(w, h) * 0.34)
    mark = mark.resize((size, size), Image.LANCZOS)

    # Round its corners the way the home screen does.
    mask = Image.new('L', (size, size), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.225), fill=255)
    mark.putalpha(mask)

    shadow = Image.new('RGBA', mark.size, (0, 0, 0, 0))
    shadow.putalpha(mask.point(lambda v: int(v * 0.45)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(size * 0.045))

    x = (w - size) // 2
    y = int(h * 0.42) - size // 2
    plate = plate.convert('RGBA')
    plate.alpha_composite(shadow, (x, y + int(size * 0.035)))
    plate.alpha_composite(mark, (x, y))
    return plate.convert('RGB')


def media(w, h, ratio, landscape=False):
    cw, ch = (w / ratio, h / ratio)
    if landscape:
        cw, ch = ch, cw
    orient = 'landscape' if landscape else 'portrait'
    return (f'(device-width: {cw:g}px) and (device-height: {ch:g}px) '
            f'and (-webkit-device-pixel-ratio: {ratio}) and (orientation: {orient})')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    links = []
    total = 0
    for name, w, h, ratio in DEVICES:
        variants = [(name, w, h, False)]
        if name in LANDSCAPE_FOR:
            variants.append((f'{name}-land', h, w, True))
        for label, vw, vh, land in variants:
            im = build(vw, vh)
            path = os.path.join(OUT, f'{label}.png')
            im.convert('P', palette=Image.ADAPTIVE, colors=64).save(path, optimize=True)
            total += os.path.getsize(path)
            links.append(f'<link rel="apple-touch-startup-image" '
                         f'media="{media(w, h, ratio, land)}" '
                         f'href="icons/splash/{label}.png">')
            print(f'  {label:20} {vw}x{vh}  {os.path.getsize(path)/1024:6.0f} KB')

    with open(os.path.join(OUT, 'links.html'), 'w') as f:
        f.write('\n'.join(links) + '\n')
    print(f'\n{len(links)} launch screens, {total/1024/1024:.1f} MB')
    print('link tags written to icons/splash/links.html')
