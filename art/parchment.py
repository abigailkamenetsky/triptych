#!/usr/bin/env python3
"""
parchment.py

Synthesises the vellum grounds the app is painted on. Real parchment is uneven
in three separate ways: fine tooth, long fibres running with the grain, and
broad blotching where the skin took the size unevenly. All three are layered
here, then a craquelure net is laid over the top to match the panels.

    python3 art/parchment.py
"""

import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'ground')
SIZE = 1800

rng = np.random.default_rng(7)


def octave_noise(shape, octaves=6, persistence=0.55):
    """Fractal value noise, summed from coarse to fine."""
    h, w = shape
    total = np.zeros(shape, dtype=np.float32)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        res = max(2, 2 ** (o + 2))
        small = rng.random((res, res)).astype(np.float32)
        layer = np.asarray(
            Image.fromarray((small * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC),
            dtype=np.float32) / 255.0
        total += layer * amp
        norm += amp
        amp *= persistence
    return total / norm


def fibres(shape, strength=0.05):
    """Long horizontal streaks, as if the skin were stretched on a frame."""
    h, w = shape
    n = rng.random((h, max(8, w // 90))).astype(np.float32)
    n = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC),
                   dtype=np.float32) / 255.0
    n = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(0.6)), dtype=np.float32) / 255.0
    return (n - 0.5) * strength


def craquelure(shape, density=0.00022, length=90):
    """A thin net of hairline cracks, like aged varnish."""
    h, w = shape
    layer = Image.new('L', (w, h), 0)
    px = layer.load()
    count = int(h * w * density)
    for _ in range(count):
        x, y = rng.integers(0, w), rng.integers(0, h)
        ang = rng.random() * np.pi * 2
        for _ in range(int(length * (0.3 + rng.random()))):
            ang += (rng.random() - 0.5) * 0.55
            x += np.cos(ang) * 1.3
            y += np.sin(ang) * 1.3
            if not (0 <= x < w and 0 <= y < h):
                break
            px[int(x), int(y)] = 255
    return np.asarray(layer.filter(ImageFilter.GaussianBlur(0.5)), dtype=np.float32) / 255.0


def build(name, base, warm, crack_strength, blot_strength, vignette=0.30, lift=0.0):
    shape = (SIZE, SIZE)
    tooth = octave_noise(shape, octaves=7, persistence=0.6)
    blotch = octave_noise(shape, octaves=3, persistence=0.75)

    lum = 0.80 + (tooth - 0.5) * 0.16 + (blotch - 0.5) * blot_strength
    lum += fibres(shape)

    # Broad falloff toward the edges, the way a stretched skin darkens at the frame.
    yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32) / SIZE
    r = np.sqrt((xx - 0.5) ** 2 + (yy - 0.5) ** 2)
    lum -= np.clip(r - 0.34, 0, None) * vignette
    lum += lift

    lum = np.clip(lum, 0.05, 1.25)

    base = np.array(base, dtype=np.float32)
    warm = np.array(warm, dtype=np.float32)
    # Darker passages pull toward the warmer pigment.
    t = np.clip((lum - 0.55) / 0.5, 0, 1)[..., None]
    rgb = warm * (1 - t) + base * t
    rgb = rgb * np.clip(lum, 0, 1.2)[..., None]

    cracks = craquelure(shape)
    rgb = rgb * (1 - cracks[..., None] * crack_strength)

    im = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB')
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'{name}.webp')
    im.save(path, 'WEBP', quality=80, method=6)
    print(f'  {name:10} {im.size[0]}x{im.size[1]}  {os.path.getsize(path)/1024:.0f} KB')


if __name__ == '__main__':
    build('vellum-light', base=(247, 234, 200), warm=(205, 168, 112), crack_strength=0.20, blot_strength=0.13)
    build('vellum-mid',   base=(236, 218, 180), warm=(186, 152, 104), crack_strength=0.24, blot_strength=0.15)
    build('vellum-dark',  base=(46, 38, 30),    warm=(22, 17, 13),    crack_strength=0.40, blot_strength=0.22)
    build('vellum-hell',  base=(38, 27, 20),    warm=(14, 9, 7),      crack_strength=0.45, blot_strength=0.26)

    # Reading grounds. No falloff, because the page is cropped from them at a
    # different scale than the shell and any vignette shows up as a seam.
    build('page-light', base=(249, 238, 208), warm=(228, 204, 158), crack_strength=0.13, blot_strength=0.07, vignette=0.0, lift=0.05)
    build('page-mid',   base=(243, 228, 194), warm=(224, 200, 156), crack_strength=0.13, blot_strength=0.07,  vignette=0.0, lift=0.04)
    build('page-dark',  base=(72, 66, 56),    warm=(56, 50, 42),    crack_strength=0.22, blot_strength=0.09,  vignette=0.0, lift=0.02)
    build('page-hell',  base=(30, 24, 19),    warm=(20, 15, 12),    crack_strength=0.30, blot_strength=0.10,  vignette=0.0, lift=0.0)
