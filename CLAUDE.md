# Triptych

Birthday gift for Abby's mother, 2026-09-01. An installable PWA ebook reader
styled after Hieronymus Bosch, with a guided flow for acquiring EPUBs.

**Live:** https://abigailkamenetsky.github.io/triptych/
**Repo:** https://github.com/abigailkamenetsky/triptych (public, required for
Pages on a free plan)

The local working directory is still `~/delights` from before the rename.

## Fixed decisions

- **PWA, not native.** The whole point is dodging the App Store and the seven
  day free-signing expiry on sideloaded iOS apps. Do not propose Swift,
  Capacitor or a wrapper.
- **The origin is permanent.** IndexedDB is scoped per origin. Moving the app
  off `abigailkamenetsky.github.io/triptych/` strands her whole library on the
  old address. Treat the URL as immovable.
- **Targets iPhone and iPad**, installed to the home screen from Safari. One
  breakpoint at 760px switches to the rail layout, so iPad portrait gets it too.
- **No build step.** No bundler, no dependencies, no npm install. epub.js and
  JSZip are vendored, fonts are local. Nothing loads from a CDN at runtime, so
  the app is fully offline after first launch.
- **Extreme Bosch is the brief**, including on the reading page. Abby chose the
  maximal option explicitly. Do not tone the illustration down for taste.
- **No em dashes anywhere**, including every user-facing string in the app.
- **Acquisition is guided, never automated.** A browser cannot fetch from
  Anna's Archive: CORS forbids reading the response and Cloudflare turns away
  anything that is not a browser. The search opens in Safari and the file
  returns through the picker.

## The art pipeline

Source paintings live in `art/plates/` and are **gitignored** (about 100 MB).
Re-download them from Wikimedia Commons if the scripts need to be re-run.

| Script | Makes | Notes |
| --- | --- | --- |
| `art/demons.py` | `assets/demons/` | Free-standing figures, **GrabCut**. This is the one that matters. |
| `art/cut.py` | `assets/beasts/`, `assets/bands/` | Older roundels for the shelf and frieze. |
| `art/borders.py` | `assets/edge/` | The painted frame and the rail column. |
| `art/parchment.py` | `assets/ground/` | Synthesised vellum. |
| `art/ink.py` | `assets/ink/` | Traced line drawings. Built, then rejected. Kept in case. |

**Use GrabCut for any new figure.** Hand-thresholded colour distance cannot
separate a painted figure from a ground painted in the same tones, and the
morphological closing that fills a figure's interior will weld it to its
backdrop. GrabCut models both as colour mixtures and finds the cut. Adding a
figure means a crop box and an inset, nothing more.

Figures that fragment after GrabCut are dropped rather than shipped ragged.
Abby has rejected ragged cutouts twice; the bar is seamless.

## The reading page frame

The plate is drawn with **`border-image`, nine-sliced, `repeat: stretch`**.
Do not go back to `background-size: 100% 100%`.

Stretching a whole plate to the screen pulls every creature by however far the
screen differs from the art: measured at **-39% on a phone** and **+43% in a
desktop window**, against only -7% and +8% on a real iPad. Nine-slice holds all
four corners at their true proportions at any shape and puts the whole
difference into the four edges, which are vine, and vine carries stretching
along its own length without reading as distorted.

`stretch`, never `round`. `round` tiles the edge slice, which repeats the
bird-headed reader down the left margin. That is why an earlier pass abandoned
nine-slice; the fault was the repeat mode, not the technique.

The corner piece is a fifth of the plate each way, so `--plate-w` is set inline
from the plate's own aspect in `applyFrame`. Setting the two border widths
equal squashes whichever creature stands in the corner.

Because the corners now hold at any shape, the `tall` and `wide` buckets are a
refinement rather than a repair. The code picks them up automatically if art
ever lands in `art/supplied/`.

## After changing any asset

```sh
node build.mjs
```

Regenerates `sw.js` with an accurate precache list and a fresh cache version.
Skipping it leaves returning visitors on the stale cached copy. `sw.js` is
generated; never hand edit it.

## Environment

Node is not on the default PATH:

```sh
export PATH="$HOME/.nvm/versions/node/v22.22.3/bin:$PATH"
```

Python has numpy, scipy, Pillow and opencv (installed for GrabCut).

## Testing

Serve over `http://127.0.0.1` (a service worker will not run from `file://`):

```sh
python3 -m http.server 8823
```

Headless Chrome driven over CDP verifies the flows. The scripts live in the
session scratchpad, not the repo. First precache on the live site takes over a
minute, so any offline test needs a generous wait.

## Open items

- Abby still owes the four seed titles and the dedication text
  (`js/dedication.js`, the only file to edit for it).
- Not built from her mockup: book detail with the chapter list, Reading Now,
  Collections, Highlights.
- `messenger` and `drummer` cut clean under GrabCut. Earlier notes about ground
  patches are obsolete.
