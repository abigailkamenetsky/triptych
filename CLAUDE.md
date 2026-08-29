# Triptych

Birthday gift for Abby's mother, 2026-09-01. An installable PWA ebook reader
styled after Hieronymus Bosch, with a guided flow for acquiring EPUBs.

## Fixed decisions

- **PWA, not native.** The whole point is dodging the App Store and the seven
  day free-signing expiry on sideloaded iOS apps. Do not propose Swift, Capacitor
  or a wrapper.
- **Targets iPhone and iPad**, installed to the home screen from Safari.
- **No build step.** No bundler, no dependencies, no npm install. epub.js and
  JSZip are vendored in `vendor/`, fonts are local in `fonts/`. Nothing loads
  from a CDN at runtime, so the app is fully offline after first launch.
- **Extreme Bosch is the brief**, including on the reading page itself, with
  Apple Books grade reading controls alongside it. Abby chose the maximal option
  explicitly. Do not tone the illustration down for taste.
- **No em dashes anywhere**, including every user-facing string in the app.
- **Acquisition is guided, never automated.** The app opens a search in Safari
  and walks the reader through the download, then imports through the file
  picker. A browser cannot fetch these sites directly regardless, since CORS and
  Cloudflare block it.

## After changing any asset

```sh
node build.mjs
```

This regenerates `sw.js` with an accurate precache list and a fresh cache
version. Skipping it leaves returning visitors on the stale cached copy.
`sw.js` is generated; never hand edit it.

## Environment

Node is not on the default PATH. Prefix commands with:

```sh
export PATH="$HOME/.nvm/versions/node/v22.22.3/bin:$PATH"
```

## Testing

Serve over `http://127.0.0.1` (a service worker will not run from `file://`):

```sh
python3 -m http.server 8823
```

Headless Chrome driven over CDP was used to verify: seeding, opening a book,
chapter navigation, drop capitals, theme switching, contents, page turns, the
summon wizard, the workshop, and a full offline reload with the network cut.

## State as of 2026-08-28

Complete and verified working. Reader, all five themes, appearance controls,
brightness and blue light veils, bookmarks, in-book search, contents, backup and
restore, the four step summon wizard, first run seeding with four Standard
Ebooks titles, and confirmed offline operation.

Not yet deployed. The hosting choice is Abby's, and it is one way: IndexedDB is
scoped per origin, so moving the app later strands the library on the old domain.
