# Triptych

A private ebook library that reads like a Hieronymus Bosch panel.

Built as an installable PWA so it lives on the iPhone and iPad home screen with
no App Store, no developer signing, and no seven day re-install. Once added, it
opens like any other app and works with no internet at all.

## What it does

**Reading.** EPUB rendering with the interaction model of Apple Books: tap the
edges to turn, tap the middle for the chrome, swipe, scrub the whole book from
the bottom bar, contents, bookmarks, and full text search across every chapter.
Position, bookmarks and progress persist per book.

**Appearance.** Five panels (Garden, Vellum, Dusk, Hell, Limbo), five typefaces,
size, line spacing and margin steppers, justification, a brightness dimmer and a
blue light warmth veil for night reading. Illuminated blackletter drop capitals
open every chapter, and inked creatures perch down both margins. Both can be
turned off.

**Getting books.** A four step wizard. Type a title, pick a source, follow a
numbered walkthrough written for someone who does not want to think about file
formats, then import the downloaded EPUB through the file picker. Sources are
Standard Ebooks, Project Gutenberg, Anna's Archive and Open Library, each with
its own walkthrough. There is also an AirDrop path for a file that landed on a
computer instead.

Nothing is fetched on the reader's behalf. Every source opens in Safari, the
download happens there, and the file comes back through the picker. A browser
cannot fetch from these sites directly anyway, since CORS and Cloudflare both
block it.

**Keeping it.** Books live in IndexedDB on the device and nowhere else. The app
asks for persistent storage so Safari will not evict the library, and The
Workshop can zip the whole thing, books, bookmarks and reading positions, into a
single backup file through the iOS share sheet.

## Layout

```
index.html          shell, inline SVG icon sprite, every view and sheet
css/bosch.css       design system, five themes, all components
css/fonts.css       generated, local @font-face for the three families
js/app.js           controller: routing, shelf, chrome, sheets, import, backup
js/reader.js        epub.js wrapper: rendition, page styling, gestures, search
js/bestiary.js      the hand-inked creatures, as currentColor SVG
js/summon.js        the four step acquisition wizard
js/prefs.js         reactive settings over localStorage
js/db.js            IndexedDB: books, blobs, reading state, bookmarks
vendor/             epub.js and JSZip, vendored so nothing loads from a CDN
fonts/              EB Garamond, Cormorant Garamond, UnifrakturMaguntia
seed/               four public domain books, imported on first run
build.mjs           regenerates sw.js with an accurate precache list
sw.js               generated, do not edit
```

## Building

There is no bundler and no dependencies. Editing a file is the build.

After changing **any** asset, regenerate the service worker so the precache list
and the cache version stay correct:

```sh
node build.mjs
```

Skipping this means returning visitors keep the old cached copy.

## Running locally

```sh
python3 -m http.server 8823
```

Then open `http://127.0.0.1:8823/`. A service worker needs `localhost` or
HTTPS, so opening `index.html` from the filesystem will not work.

## Deploying

Any static host works. Two rules matter:

1. **HTTPS.** Service workers and persistent storage both require it.
2. **Never change the origin.** IndexedDB is scoped per origin, so moving the
   app to a different domain leaves the library behind on the old one.

Everything is referenced with relative paths, so it runs from a subpath such as
`user.github.io/triptych/` as happily as from a domain root.

## Installing on iPhone or iPad

Open the URL in Safari, tap Share, tap **Add to Home Screen**, tap **Add**. The
app prompts with these steps by itself on first visit. Launch it from the home
screen icon rather than from Safari, so it gets its own storage and full screen.

## Licences

Interface, illustrations and code are original. epub.js and JSZip are MIT. The
three typefaces are SIL Open Font License. The four seeded books come from
Standard Ebooks and are public domain.
