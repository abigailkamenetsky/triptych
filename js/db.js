/*
 * db.js
 * The vault. Book metadata, cover art, reading state and bookmarks live in
 * IndexedDB. The EPUB binaries sit in their own store so listing the shelf
 * never has to drag megabytes into memory.
 */

const NAME = 'triptych';
const VERSION = 1;

let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains('books')) {
        const s = db.createObjectStore('books', { keyPath: 'id' });
        s.createIndex('added', 'added');
        s.createIndex('title', 'sortTitle');
      }
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('marks')) {
        const m = db.createObjectStore('marks', { keyPath: 'key' });
        m.createIndex('bookId', 'bookId');
      }
      void e;
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('The vault is open in another tab.'));
  });
  return dbp;
}

async function tx(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction aborted.'));
    fn(...stores.map((s) => t.objectStore(s)));
  });
}

const wait = (req) => new Promise((res, rej) => {
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});

/* ── Books ─────────────────────────────────────────────────── */

export async function listBooks() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction('books', 'readonly');
    const out = [];
    t.objectStore('books').openCursor().onsuccess = (e) => {
      const c = e.target.result;
      if (c) { out.push(c.value); c.continue(); }
    };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
  });
}

export async function getBook(id) {
  const db = await open();
  return wait(db.transaction('books', 'readonly').objectStore('books').get(id));
}

export async function getBlob(id) {
  const db = await open();
  const rec = await wait(db.transaction('blobs', 'readonly').objectStore('blobs').get(id));
  return rec ? rec.data : null;
}

export async function saveBook(meta, data) {
  await tx(['books', 'blobs'], 'readwrite', (books, blobs) => {
    books.put(meta);
    blobs.put({ id: meta.id, data });
  });
  return meta;
}

export async function touchBook(id, patch) {
  const db = await open();
  const t = db.transaction('books', 'readwrite');
  const store = t.objectStore('books');
  const rec = await wait(store.get(id));
  if (rec) store.put({ ...rec, ...patch });
  return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
}

export async function deleteBook(id) {
  const db = await open();
  const t = db.transaction(['books', 'blobs', 'state', 'marks'], 'readwrite');
  t.objectStore('books').delete(id);
  t.objectStore('blobs').delete(id);
  t.objectStore('state').delete(id);
  const idx = t.objectStore('marks').index('bookId');
  idx.openCursor(IDBKeyRange.only(id)).onsuccess = (e) => {
    const c = e.target.result;
    if (c) { c.delete(); c.continue(); }
  };
  return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
}

/* ── Reading state ─────────────────────────────────────────── */

export async function getState(id) {
  const db = await open();
  return (await wait(db.transaction('state', 'readonly').objectStore('state').get(id))) || null;
}

export async function saveState(id, patch) {
  const db = await open();
  const t = db.transaction('state', 'readwrite');
  const store = t.objectStore('state');
  const prev = (await wait(store.get(id))) || { id };
  store.put({ ...prev, ...patch, id, updated: Date.now() });
  return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
}

/* ── Bookmarks ─────────────────────────────────────────────── */

const markKey = (bookId, cfi) => `${bookId}||${cfi}`;

export async function listMarks(bookId) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction('marks', 'readonly');
    const out = [];
    t.objectStore('marks').index('bookId').openCursor(IDBKeyRange.only(bookId)).onsuccess = (e) => {
      const c = e.target.result;
      if (c) { out.push(c.value); c.continue(); }
    };
    t.oncomplete = () => resolve(out.sort((a, b) => a.percent - b.percent));
    t.onerror = () => reject(t.error);
  });
}

export async function addMark(mark) {
  const rec = { ...mark, key: markKey(mark.bookId, mark.cfi), created: Date.now() };
  await tx(['marks'], 'readwrite', (s) => s.put(rec));
  return rec;
}

export async function removeMark(bookId, cfi) {
  await tx(['marks'], 'readwrite', (s) => s.delete(markKey(bookId, cfi)));
}

export async function hasMark(bookId, cfi) {
  const db = await open();
  const r = await wait(db.transaction('marks', 'readonly').objectStore('marks').get(markKey(bookId, cfi)));
  return !!r;
}

/* ── Housekeeping ──────────────────────────────────────────── */

export async function requestPersistence() {
  if (!navigator.storage?.persist) return 'unsupported';
  if (await navigator.storage.persisted?.()) return 'granted';
  return (await navigator.storage.persist()) ? 'granted' : 'denied';
}

export async function usage() {
  if (!navigator.storage?.estimate) return null;
  const { usage: used = 0, quota = 0 } = await navigator.storage.estimate();
  return { used, quota };
}

export function formatBytes(n) {
  if (!n) return '0 KB';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}
