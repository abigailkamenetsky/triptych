/*
 * catalogue.js
 * Searching for a book and putting it on the shelf without leaving the app.
 *
 * This works for Standard Ebooks and nowhere else, for one reason: they serve
 * both their catalogue feed and their actual EPUB files with
 * `access-control-allow-origin: *`. A browser is allowed to read them, so the
 * app can fetch a book itself and shelve it.
 *
 * Anna's Archive cannot work this way and no amount of code changes that. It
 * sits behind DDoS-Guard and sends no CORS header, so the browser refuses to
 * let the page read the response. That is a wall in the browser, not a
 * difficulty to be engineered around.
 */

const FEED = 'https://standardebooks.org/feeds/opds/all';

const text = (el, sel, ns) => {
  const n = el.querySelector(sel);
  return n ? (n.textContent || '').trim() : '';
};

/* Strip the markup out of an OPDS summary without trusting it. */
function plain(html) {
  const d = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  return (d.body.textContent || '').replace(/\s+/g, ' ').trim();
}

export async function search(query, { signal } = {}) {
  const q = query.trim();
  if (q.length < 2) return [];

  const res = await fetch(`${FEED}?query=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(`Standard Ebooks answered ${res.status}`);

  const doc = new DOMParser().parseFromString(await res.text(), 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('The catalogue came back malformed.');

  return [...doc.querySelectorAll('entry')].map((e) => {
    const links = [...e.querySelectorAll('link')];
    const byType = (t, rel) => links.find((l) =>
      (l.getAttribute('type') || '').includes(t) &&
      (!rel || (l.getAttribute('rel') || '').includes(rel)));

    // Two epub links are offered; the plain one is the compatible build.
    const epubs = links.filter((l) => (l.getAttribute('type') || '') === 'application/epub+zip');
    const epub = epubs.find((l) => !/advanced/i.test(l.getAttribute('href') || '')) || epubs[0];

    return {
      id: text(e, 'id'),
      title: text(e, 'title'),
      author: text(e, 'author name') || text(e, 'author'),
      summary: plain(text(e, 'content') || text(e, 'summary')),
      cover: byType('image/', 'thumbnail')?.getAttribute('href')
          || byType('image/')?.getAttribute('href') || '',
      epub: epub?.getAttribute('href') || '',
    };
  }).filter((b) => b.epub);
}

/* Fetch the book itself, reporting progress, because 700 KB on a phone is a
   few seconds of nothing happening otherwise. */
export async function download(entry, onProgress) {
  const res = await fetch(entry.epub);
  if (!res.ok) throw new Error(`That book would not download (${res.status}).`);

  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total) return new File([await res.blob()], filenameFor(entry), { type: 'application/epub+zip' });

  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress?.(got / total);
  }
  return new File(chunks, filenameFor(entry), { type: 'application/epub+zip' });
}

const filenameFor = (entry) =>
  `${(entry.author || 'unknown')}_${entry.title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) + '.epub';
