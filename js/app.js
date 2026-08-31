/*
 * app.js
 * The controller. Owns routing, the shelf, the reader chrome, every sheet,
 * import and backup.
 */

import { summon as summonDemons, demonSrc, beastFor, DEMONS, PLATE_PIGMENTS } from './bestiary.js';
import { prefs, DEFAULTS, FONTS, MARGINS } from './prefs.js';
import * as db from './db.js';
import { Reader, setPageTone, HIGHLIGHT_FILL } from './reader.js';
import { Summon } from './summon.js';
import { loadFrames, shapeFor, frameFor, sliceFor, frameSrc } from './frames.js';
import * as catalogue from './catalogue.js';
import { DEDICATION } from './dedication.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;

let goTo = () => {};
let goBook = () => {};

const state = {
  view: null,
  books: [],
  reader: null,
  current: null,
  chromeTimer: null,
  editing: false,
  coverUrls: new Map(),
  query: '',
  filter: 'all',
};

const FILTERS = {
  all: () => true,
  reading: (b) => (b.percent || 0) > 0.01 && (b.percent || 0) < 0.97,
  unread: (b) => (b.percent || 0) <= 0.01,
  finished: (b) => (b.percent || 0) >= 0.97,
};

/* ══════════════ Toast ══════════════ */
let toastTimer;
function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/* ══════════════ Theme and veils ══════════════ */
const THEME_BG = { garden: '#e5d7b8', vellum: '#e2cfa6', dusk: '#3a3730', hell: '#14100c', limbo: '#000000' };

function applyShell() {
  root.dataset.theme = prefs.theme;
  root.dataset.marginalia = prefs.marginalia ? 'on' : 'off';
  root.dataset.capitals = prefs.capitals ? 'on' : 'off';
  $('#veilDim').style.opacity = String((100 - prefs.brightness) / 100 * 0.72);
  $('#veilWarm').style.opacity = String(prefs.warmth / 100 * 0.5);
  for (const m of $$('meta[name="theme-color"]')) m.setAttribute('content', THEME_BG[prefs.theme]);
}

/* ══════════════ Routing ══════════════ */
function setView(name, push = true) {
  if (state.view === name) return;
  state.view = name;
  root.dataset.view = name;
  for (const v of $$('.view')) v.hidden = v.dataset.view !== name;
  for (const r of $$('[data-rail]')) {
    const on = r.dataset.rail === name;
    if (on) r.setAttribute('aria-current', 'page'); else r.removeAttribute('aria-current');
  }
  if (push) history.pushState({ view: name }, '');
  if (name !== 'reader') showChrome();
}

window.addEventListener('popstate', (e) => {
  const target = e.state?.view || 'library';
  if (state.view === 'reader' && target !== 'reader') closeBook(false);
  else setView(target, false);
});

/* ══════════════ Shelf ══════════════ */
function sortBooks(list) {
  const by = prefs.sort;
  const arr = [...list];
  if (by === 'title') return arr.sort((a, b) => a.sortTitle.localeCompare(b.sortTitle));
  if (by === 'author') return arr.sort((a, b) => (a.author || '~').localeCompare(b.author || '~') || a.sortTitle.localeCompare(b.sortTitle));
  if (by === 'added') return arr.sort((a, b) => b.added - a.added);
  return arr.sort((a, b) => (b.lastOpened || b.added) - (a.lastOpened || a.added));
}

function releaseCovers() {
  for (const url of state.coverUrls.values()) URL.revokeObjectURL(url);
  state.coverUrls.clear();
}

function coverArt(b, i) {
  if (b.cover) {
    const url = URL.createObjectURL(b.cover);
    state.coverUrls.set(`${b.id}:${i}`, url);
    return `<img src="${url}" alt="" loading="lazy" decoding="async">`;
  }
  const [a, c] = PLATE_PIGMENTS[i % PLATE_PIGMENTS.length];
  return `<span class="book-plate" style="--plate-a:${a};--plate-b:${c}">
      <span class="book-plate-title">${escapeHtml(b.title)}</span>
      <span class="book-plate-mark"><img class="beast demon" src="${demonSrc(beastFor(b.id, DEMONS))}" alt="" loading="lazy" decoding="async"></span>
    </span>`;
}

async function renderShelf() {
  state.books = await db.listBooks();
  const shelf = $('#shelf');
  const empty = $('#emptyShelf');
  releaseCovers();

  const total = state.books.length;
  const q = state.query.trim().toLowerCase();
  const shown = state.books
    .filter(FILTERS[state.filter] || FILTERS.all)
    .filter((b) => !q || `${b.title} ${b.author || ''}`.toLowerCase().includes(q));

  const label = total ? `${total} ${total === 1 ? 'volume' : 'volumes'} in the garden` : '';
  $('#shelfCount').textContent = label;
  const railCount = $('#railCount');
  if (railCount) railCount.textContent = label;
  $('#shelfTools') && ($('#shelfTools').hidden = total < 2);
  const tools = $('.shelf-tools');
  if (tools) tools.hidden = total < 2;

  empty.hidden = total > 0;
  $('#btnSort').hidden = total < 2;

  if (!total) { shelf.innerHTML = ''; state.editing = false; shelf.dataset.editing = 'false'; return; }

  if (!shown.length) {
    shelf.innerHTML = `<p class="empty-note" style="grid-column:1/-1">Nothing on the shelf matches that.</p>`;
    return;
  }

  shelf.innerHTML = sortBooks(shown).map((b, i) => {
    let art;
    if (b.cover) {
      const url = URL.createObjectURL(b.cover);
      state.coverUrls.set(b.id, url);
      art = `<img src="${url}" alt="" loading="lazy" decoding="async">`;
    } else {
      const [a, c] = PLATE_PIGMENTS[i % PLATE_PIGMENTS.length];
      art = `<span class="book-plate" style="--plate-a:${a};--plate-b:${c}">
          <span class="book-plate-title">${escapeHtml(b.title)}</span>
          <span class="book-plate-mark"><img class="beast demon" src="${demonSrc(beastFor(b.id, DEMONS))}" alt="" loading="lazy" decoding="async"></span>
        </span>`;
    }
    const pct = Math.round((b.percent || 0) * 100);
    return `
    <div class="book" role="listitem">
      <button class="book-open" data-id="${b.id}" aria-label="Open ${escapeHtml(b.title)}">
        <span class="book-cover">
          ${art}
          ${pct > 0 ? `<span class="book-progress"><span style="width:${pct}%"></span></span>` : ''}
        </span>
      </button>
      <span class="book-meta">
        <span class="book-title">${escapeHtml(b.title)}</span>
        <span class="book-author">${escapeHtml(b.author || 'Unknown hand')}</span>
      </span>
      <button class="book-remove" data-remove="${b.id}" aria-label="Remove ${escapeHtml(b.title)}" tabindex="-1">
        <svg class="ico" aria-hidden="true"><use href="#i-close"/></svg>
      </button>
    </div>`;
  }).join('');

  // The whole card is the tap target, and the cover button fills it.
  for (const el of $$('.book-open', shelf)) {
    el.style.cssText = 'display:block;width:100%;text-align:start';
    el.addEventListener('click', () => { if (!state.editing) goBook(el.dataset.id); });
    bindLongPress(el, () => setEditing(true));
  }
  for (const el of $$('[data-remove]', shelf)) {
    el.addEventListener('click', (e) => { e.stopPropagation(); confirmRemove(el.dataset.remove); });
  }
}

function setEditing(on) {
  state.editing = on;
  $('#shelf').dataset.editing = String(on);
  for (const el of $$('[data-remove]')) el.tabIndex = on ? 0 : -1;
  if (on) toast('Tap the red mark to banish a book. Tap anywhere else to stop.');
}

function bindLongPress(el, fn) {
  let t = null;
  const start = () => { clearTimeout(t); t = setTimeout(fn, 520); };
  const stop = () => clearTimeout(t);
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchend', stop, { passive: true });
  el.addEventListener('touchmove', stop, { passive: true });
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); fn(); });
}

async function confirmRemove(id) {
  const b = state.books.find((x) => x.id === id);
  if (!b) return;
  if (!confirm(`Banish "${b.title}" from the shelf?\n\nThe file leaves this device. You can always summon it again.`)) return;
  await db.deleteBook(id);
  await renderShelf();
  toast('Gone back into the dark.');
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/* ══════════════ Import ══════════════ */
const stripArticle = (t) => t.replace(/^(the|a|an)\s+/i, '').trim();

async function importFiles(files, opts = {}) {
  const list = [...files];
  if (!list.length) return;

  const epubs = list.filter((f) => /\.epub$/i.test(f.name));
  const zips = list.filter((f) => /\.zip$/i.test(f.name));

  for (const z of zips) await restoreBackup(z);

  if (!epubs.length) { if (!zips.length) toast('That was not an EPUB.'); return; }

  if (!opts.quiet) toast(epubs.length === 1 ? 'Reading the bones of it…' : `Taking in ${epubs.length} books…`, 8000);
  let added = 0, skipped = 0;

  for (const file of epubs) {
    try {
      const buf = await file.arrayBuffer();
      const book = window.ePub(buf);
      await book.ready;
      const meta = await book.loaded.metadata;

      const title = (meta.title || file.name.replace(/\.epub$/i, '')).trim();
      const author = (meta.creator || '').trim();

      const existing = await db.listBooks();
      if (existing.some((b) => b.title === title && (b.author || '') === author)) {
        skipped++; book.destroy(); continue;
      }

      let cover = null;
      try {
        const url = await book.coverUrl();
        if (url) { cover = await (await fetch(url)).blob(); URL.revokeObjectURL(url); }
      } catch { /* many books simply have no cover */ }

      await db.saveBook({
        id: crypto.randomUUID(),
        title,
        author,
        sortTitle: stripArticle(title).toLowerCase(),
        cover,
        size: file.size,
        added: Date.now(),
        lastOpened: 0,
        percent: 0,
      }, buf);

      book.destroy();
      added++;
    } catch {
      if (!opts.quiet) toast(`"${file.name}" would not open. It may be a PDF renamed, or a broken file.`, 4200);
    }
  }

  await renderShelf();
  if (opts.quiet) return added;
  if (added) {
    toast(added === 1 ? 'Shelved.' : `${added} books shelved.`);
    setView('library');
  } else if (skipped) {
    toast(skipped === 1 ? 'That one is already on the shelf.' : 'Those are already on the shelf.');
  }
  return added;
}

/* A shelf should never be empty on the first morning. The titles are listed in
   seed/seeds.json, which `node tools/seeds.mjs <url>...` rewrites for you. */
async function seedFirstRun() {
  if (localStorage.getItem('triptych.seeded') === '1') return;
  if ((await db.listBooks()).length) { localStorage.setItem('triptych.seeded', '1'); return; }

  let names = [];
  try {
    const res = await fetch('seed/seeds.json', { cache: 'no-store' });
    if (res.ok) names = await res.json();
  } catch { /* offline on the very first run, so leave the shelf bare */ }

  const files = [];
  for (const name of names) {
    try {
      const res = await fetch(`seed/${name}`, { cache: 'no-store' });
      if (!res.ok) continue;
      files.push(new File([await res.blob()], name, { type: 'application/epub+zip' }));
    } catch { /* skip the ones that will not come */ }
  }
  if (!files.length) return;

  const n = await importFiles(files, { quiet: true });
  localStorage.setItem('triptych.seeded', '1');
  return n;
}

/* ══════════════ The frontispiece ══════════════ */
function showDedication() {
  if (localStorage.getItem('triptych.dedicated') === '1') return Promise.resolve();
  const d = DEDICATION;
  if (!d?.lines?.length) { localStorage.setItem('triptych.dedicated', '1'); return Promise.resolve(); }

  $('#dedHeading').textContent = d.heading || '';
  $('#dedBody').innerHTML = d.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('');
  $('#dedSign').textContent = d.signature || '';
  $('#dedDate').textContent = d.date || '';
  const enter = $('#dedEnter');
  enter.textContent = d.cta || 'Begin';

  const card = $('#dedication');
  card.hidden = false;
  enter.focus({ preventScroll: true });

  return new Promise((resolve) => {
    enter.addEventListener('click', () => {
      localStorage.setItem('triptych.dedicated', '1');
      card.style.transition = 'opacity 520ms var(--ease)';
      card.style.opacity = '0';
      setTimeout(() => { card.hidden = true; card.style.cssText = ''; resolve(); }, 520);
    }, { once: true });
  });
}

/* ══════════════ Book detail ══════════════ */
const hoursOf = (words) => {
  if (!words) return '';
  const m = Math.round(words / READ_WPM);
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60), r = m % 60;
  return r < 5 ? `${h} ${h === 1 ? 'hour' : 'hours'}` : `${h}h ${r}m`;
};

/* The table of contents lives in the file, so the book has to be opened to
   read it. It is opened, asked, and thrown away without ever being rendered.
   Each section is also measured, because dividing the book evenly puts the
   same estimate against every chapter, which is worse than no estimate. */
async function tocOf(id) {
  const data = await db.getBlob(id);
  if (!data) return { toc: [], words: {} };
  let book;
  try {
    book = window.ePub(data);
    await book.ready;

    const toc = [];
    const walk = (items, depth) => {
      for (const it of items || []) {
        toc.push({ label: (it.label || '').trim() || 'Untitled', href: it.href, depth });
        if (it.subitems?.length) walk(it.subitems, Math.min(depth + 1, 2));
      }
    };
    walk(book.navigation?.toc, 0);

    const words = {};
    for (const item of book.spine.spineItems) {
      try {
        await item.load(book.load.bind(book));
        const text = item.document?.body?.textContent || '';
        words[item.href] = Math.round(text.trim().split(/\s+/).length);
      } catch {
        // A section that will not load simply has no estimate.
      } finally {
        try { item.unload(); } catch { /* already unloaded */ }
      }
    }
    return { toc, words };
  } catch {
    return { toc: [], words: {} };
  } finally {
    try { book?.destroy(); } catch { /* already gone */ }
  }
}

/* Section hrefs and TOC hrefs rarely match exactly: one carries a fragment,
   the other a directory prefix. */
function wordsForHref(href, table) {
  if (!href) return 0;
  const base = href.split('#')[0];
  if (table[base]) return table[base];
  for (const k of Object.keys(table)) {
    if (k.endsWith(base) || base.endsWith(k)) return table[k];
  }
  return 0;
}

async function showBook(id) {
  const b = await db.getBook(id);
  if (!b) return;
  state.detail = b;
  $('#bookViewTitle').textContent = b.title;
  const body = $('#bookBody');
  releaseCovers();

  const pct = Math.round((b.percent || 0) * 100);
  const started = pct > 0;
  body.innerHTML = `
    <div class="detail">
      <span class="detail-cover">${coverArt(b, 0)}</span>
      <div class="detail-text">
        <h2 class="detail-title">${escapeHtml(b.title)}</h2>
        <p class="detail-author">${escapeHtml(b.author || 'Unknown hand')}</p>
        <dl class="detail-facts">
          ${b.words ? `<div><dt>Length</dt><dd>${hoursOf(b.words)}</dd></div>` : ''}
          <div><dt>Progress</dt><dd>${started ? `${pct}% read` : 'Not started'}</dd></div>
          <div><dt>Size</dt><dd>${db.formatBytes(b.size || 0)}</dd></div>
          <div><dt>Added</dt><dd>${new Date(b.added).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div>
        </dl>
        ${started ? `<div class="detail-bar"><span style="width:${pct}%"></span></div>` : ''}
        <div class="detail-actions">
          <button class="btn btn-primary" data-read="${b.id}">${started ? 'Continue reading' : 'Start reading'}</button>
          <button class="btn btn-ghost" data-banish="${b.id}">Remove</button>
        </div>
      </div>
    </div>
    <p class="group-title" id="chapHead">Chapters</p>
    <div id="chapList"><p class="empty-note">Reading the contents…</p></div>`;

  for (const el of $$('[data-read]', body)) el.addEventListener('click', () => openBook(el.dataset.read));
  for (const el of $$('[data-banish]', body)) {
    el.addEventListener('click', async () => {
      await confirmRemove(el.dataset.banish);
      if (!(await db.getBook(el.dataset.banish))) history.back();
    });
  }

  const { toc, words } = await tocOf(id);
  if (state.detail?.id !== id) return;        // she has already moved on

  $('#chapHead').textContent = toc.length ? `${toc.length} chapters` : 'Chapters';
  $('#chapList').innerHTML = toc.length
    ? toc.map((c, i) => {
        const w = wordsForHref(c.href, words);
        const mins = w ? Math.max(1, Math.round(w / READ_WPM)) : 0;
        return `
        <button class="chap" data-depth="${c.depth}" data-chap="${escapeHtml(c.href)}">
          <span class="chap-n">${i + 1}</span>
          <span class="chap-name">${escapeHtml(c.label)}</span>
          ${mins ? `<span class="chap-time">${mins} min</span>` : ''}
        </button>`;
      }).join('')
    : '<p class="empty-note">This book carries no table of contents.</p>';

  for (const el of $$('[data-chap]', $('#chapList'))) {
    el.addEventListener('click', () => openBook(id, el.dataset.chap));
  }
}

/* ══════════════ Reading Now ══════════════ */
const READ_WPM = 250;

function minutesLeft(book) {
  const words = book.words || 0;
  const left = words * (1 - (book.percent || 0));
  if (!left) return null;
  const m = Math.round(left / READ_WPM);
  if (m < 1) return 'less than a minute left';
  if (m < 60) return `${m} ${m === 1 ? 'minute' : 'minutes'} left`;
  const h = Math.round(m / 60);
  return `${h} ${h === 1 ? 'hour' : 'hours'} left`;
}

async function renderHome() {
  state.books = await db.listBooks();
  const body = $('#homeBody');
  releaseCovers();

  const started = state.books
    .filter((b) => (b.percent || 0) > 0.005 && b.lastOpened)
    .sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
  const current = started[0];

  if (!state.books.length) {
    body.innerHTML = `<p class="empty-note">Nothing on the shelf yet. Summon a book and it will appear here.</p>`;
    return;
  }

  const hero = current ? (() => {
    const pct = Math.round((current.percent || 0) * 100);
    const left = minutesLeft(current);
    return `
      <div class="hero">
        <span class="hero-cover">${coverArt(current, 0)}</span>
        <div class="hero-text">
          <p class="hero-eyebrow">Continue reading</p>
          <h2 class="hero-title">${escapeHtml(current.title)}</h2>
          <p class="hero-author">${escapeHtml(current.author || 'Unknown hand')}</p>
          <div class="hero-bar"><span style="width:${pct}%"></span></div>
          <p class="hero-meta">${pct}% through${left ? ` · ${escapeHtml(left)}` : ''}</p>
          <button class="btn btn-primary" data-open="${current.id}" data-hero="1">Continue</button>
        </div>
      </div>`;
  })() : `
      <div class="hero hero-empty">
        <div class="hero-text">
          <p class="hero-eyebrow">Nothing open</p>
          <h2 class="hero-title">Pick something from the shelf</h2>
          <button class="btn btn-primary" data-rail-go="library">Open the library</button>
        </div>
      </div>`;

  const rest = state.books
    .filter((b) => b.id !== current?.id)
    .sort((a, b) => (b.lastOpened || b.added) - (a.lastOpened || a.added))
    .slice(0, 12);

  const strip = rest.length ? `
    <p class="strip-title">On the shelf</p>
    <div class="strip">
      ${rest.map((b, i) => `
        <button class="strip-book" data-open="${b.id}">
          <span class="book-cover">${coverArt(b, i + 1)}
            ${(b.percent || 0) > 0.005 ? `<span class="book-progress"><span style="width:${Math.round(b.percent * 100)}%"></span></span>` : ''}
          </span>
          <span class="strip-name">${escapeHtml(b.title)}</span>
        </button>`).join('')}
    </div>` : '';

  body.innerHTML = hero + strip;

  for (const el of $$('[data-open]', body)) {
    // The hero continues; a cover on the strip opens its page first.
    el.addEventListener('click', () => (el.dataset.hero ? openBook(el.dataset.open) : goBook(el.dataset.open)));
  }
  for (const el of $$('[data-rail-go]', body)) {
    el.addEventListener('click', () => goTo(el.dataset.railGo));
  }
}

/* ══════════════ The border plate behind the page ══════════════ */
async function applyFrame(bookId) {
  const idx = await loadFrames();
  const stage = $('#readerStage');
  const shape = shapeFor();
  // The stand-ins exist so the layout can be built before the art arrives.
  // Until real plates are supplied, the composited frame stays in charge.
  const plate = (bookId && !idx.synthetic) ? frameFor(bookId, shape) : null;

  if (!plate) { root.dataset.frame = 'off'; setPageTone(null); return; }

  const slice = sliceFor(shape);
  root.dataset.frame = 'on';
  root.style.setProperty('--reading-frame', `url("${frameSrc(plate.src)}")`);
  root.style.setProperty('--plate-slice-x', `${(slice.x * 100).toFixed(2)}%`);
  root.style.setProperty('--plate-slice-y', `${(slice.y * 100).toFixed(2)}%`);
  // The corner slice keeps the plate's proportions, so the side borders are
  // drawn wider or narrower than the top and bottom to match.
  const plateAR = (shape === 'landscape' ? 1800 / 1350 : 1350 / 1800);
  root.style.setProperty('--plate-w', `calc(var(--plate-h) * ${plateAR.toFixed(4)})`);
  root.style.setProperty('--frame-centre', plate.centre);
  setPageTone(plate.centre);
  void stage;
}

/* ══════════════ Fetching a book the app is allowed to fetch ══════════════ */
async function fetchFromCatalogue(entry, btn) {
  if (!entry || !btn) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.classList.add('is-working');

  try {
    const file = await catalogue.download(entry, (frac) => {
      btn.textContent = `${Math.round(frac * 100)}%`;
    });
    btn.textContent = 'Shelving…';
    const added = await importFiles([file], { quiet: true });
    await renderHome();

    if (added) {
      btn.textContent = 'On the shelf';
      btn.classList.add('is-done');
      toast(`${entry.title} is on the shelf.`);
    } else {
      btn.textContent = 'Already there';
      btn.classList.add('is-done');
    }
  } catch (err) {
    btn.disabled = false;
    btn.classList.remove('is-working');
    btn.textContent = original;
    toast(err?.message || 'That book would not come.', 4000);
  }
}

/* ══════════════ Reader ══════════════ */
async function openBook(id, startAt) {
  const rec = await db.getBook(id);
  if (!rec) return;
  const data = await db.getBlob(id);
  if (!data) { toast('The file for this one has gone missing.'); return; }

  state.cameFrom = state.view === 'reader' ? state.cameFrom : state.view;
  state.current = rec;
  $('#readerTitle').textContent = rec.title;
  $('#pageLoading').hidden = false;
  setView('reader');

  await applyFrame(rec.id);

  const reader = new Reader($('#viewer'));
  state.reader = reader;

  reader
    .on('relocated', onRelocated)
    .on('toggleChrome', () => { hidePopover(); toggleChrome(); })
    .on('select', (sel) => {
      pendingSelection = sel;
      $('#hlDelete').hidden = true;
      placePopover(sel.rect);
    })
    // No hiding on unselect: reaching for the popover clears the selection in
    // the book, and acting on that would throw away what the button is for.
    // It closes on a page turn, on a tap elsewhere, or once it has been used.
    .on('unselect', () => {})
    .on('highlightTap', (h) => {
      pendingSelection = { cfi: h.cfi, text: h.text, rect: { left: window.innerWidth / 2 - 140, top: window.innerHeight / 2, width: 280, height: 0 } };
      $('#hlDelete').hidden = false;
      placePopover(pendingSelection.rect);
    });

  try {
    await reader.open(rec, data, startAt);
  } catch {
    $('#pageLoading').hidden = true;
    toast('That book will not open. It may be damaged.', 4000);
    closeBook();
    return;
  }

  $('#pageLoading').hidden = true;
  buildToc();
  refreshHighlights();
  showChrome();
  state.chromeTimer = setTimeout(hideChrome, 2800);
}

function closeBook(pop = true) {
  clearTimeout(state.chromeTimer);
  hidePopover();
  state.reader?.destroy();
  state.reader = null;
  state.current = null;
  root.dataset.frame = 'off';
  setPageTone(null);
  $('#viewer').innerHTML = '';
  closeSheets();
  setView(state.cameFrom || 'home', false);
  renderShelf();
  renderHome();
  document.dispatchEvent(new Event('delights:closedbook'));
  if (pop && history.state?.view === 'reader') history.back();
}

let lastLoc = { cfi: '', percent: 0, chapter: '', page: 0, pages: 0 };

function onRelocated(loc) {
  // epub.js re-emits relocated as the layout settles and whenever an
  // annotation is painted, so hiding on every one of them tore the popover
  // away before a swatch could be tapped. Only a real page turn closes it.
  if (loc.cfi !== lastLoc.cfi) hidePopover();
  lastLoc = loc;
  const pct = Math.round(loc.percent * 1000);
  const scrub = $('#scrubber');
  if (document.activeElement !== scrub) scrub.value = String(pct);
  paintScrub(pct / 1000);

  // Kindle leads with time remaining and keeps position secondary.
  $('#metaLeft').textContent = state.reader?.minutesLeft(loc) || loc.chapter || '';
  const pctText = `${Math.round(loc.percent * 100)}%`;
  $('#metaRight').textContent = loc.pages > 1 ? `${pctText} · page ${loc.page} of ${loc.pages}` : pctText;

  refreshBookmarkButton();
}

function paintScrub(ratio) {
  const track = $('.scrub-track');
  const w = track.clientWidth || 1;
  $('#scrubFill').style.width = `${ratio * 100}%`;
  $('#scrubCrawler').style.left = `${Math.max(18, Math.min(w - 18, ratio * w))}px`;
}

function showChrome() { root.dataset.chrome = 'shown'; }
function hideChrome() { root.dataset.chrome = 'hidden'; }
function toggleChrome() {
  clearTimeout(state.chromeTimer);
  root.dataset.chrome = root.dataset.chrome === 'hidden' ? 'shown' : 'hidden';
}

async function refreshBookmarkButton() {
  if (!state.current || !lastLoc.cfi) return;
  const on = await db.hasMark(state.current.id, lastLoc.cfi);
  const btn = $('#btnBookmark');
  btn.setAttribute('aria-pressed', String(on));
  btn.querySelector('use').setAttribute('href', on ? '#i-mark-on' : '#i-mark');
}

/* ══════════════ Highlights ══════════════ */
let pendingSelection = null;

function placePopover(rect) {
  const pop = $('#hlPop');
  pop.hidden = false;
  const w = pop.offsetWidth || 280;
  const h = pop.offsetHeight || 48;
  let left = rect.left + rect.width / 2 - w / 2;
  left = Math.max(10, Math.min(left, window.innerWidth - w - 10));
  // Above the selection where there is room, below it otherwise.
  let top = rect.top - h - 12;
  if (top < 70) top = rect.top + rect.height + 12;
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

function hidePopover() {
  $('#hlPop').hidden = true;
  $('#hlDelete').hidden = true;
  pendingSelection = null;
}

async function refreshHighlights() {
  if (!state.current || !state.reader) return;
  const notes = await db.listNotes(state.current.id);
  state.reader.applyHighlights(notes);
}

async function saveHighlight(colour) {
  const sel = pendingSelection;
  if (!sel || !state.current) return;
  const existing = (await db.listNotes(state.current.id)).find((n) => n.cfi === sel.cfi);
  const note = await db.saveNote({
    ...(existing || {}),
    bookId: state.current.id,
    cfi: sel.cfi,
    text: sel.text.slice(0, 600),
    colour,
    percent: lastLoc.percent || 0,
    chapter: lastLoc.chapter || '',
  });
  state.reader.addHighlight(note);
  state.reader.clearSelection();
  hidePopover();
  toast('Kept.');
}

async function deleteHighlight(cfi) {
  if (!state.current) return;
  await db.removeNote(state.current.id, cfi);
  state.reader.removeHighlight(cfi);
  hidePopover();
  toast('Highlight lifted.');
}

async function addNoteTo(cfi) {
  if (!state.current) return;
  const all = await db.listNotes(state.current.id);
  const existing = all.find((n) => n.cfi === cfi);
  const body = prompt('Your note', existing?.note || '');
  if (body === null) return;
  const note = await db.saveNote({
    ...(existing || {}),
    bookId: state.current.id,
    cfi,
    text: existing?.text || pendingSelection?.text || '',
    colour: existing?.colour || 'gold',
    note: body.trim(),
    percent: existing?.percent ?? (lastLoc.percent || 0),
    chapter: existing?.chapter ?? (lastLoc.chapter || ''),
  });
  state.reader.addHighlight(note);
  state.reader.clearSelection();
  hidePopover();
  toast(body.trim() ? 'Note kept.' : 'Note cleared.');
}

async function buildNotes() {
  const list = $('#noteList');
  const notes = await db.listNotes(state.current.id);
  if (!notes.length) {
    list.innerHTML = '<p class="empty-note">No highlights yet. Hold a finger on a word and drag to select, then pick a colour.</p>';
    return;
  }
  list.innerHTML = notes.map((n) => `
    <div class="note-row">
      <button data-goto="${escapeHtml(n.cfi)}">
        <span class="note-bar" style="background:${HIGHLIGHT_FILL[n.colour] || HIGHLIGHT_FILL.gold}"></span>
        <span class="note-text">
          <span class="note-quote">${escapeHtml(n.text)}</span>
          ${n.note ? `<span class="note-own">${escapeHtml(n.note)}</span>` : ''}
          <span class="note-where">${escapeHtml(n.chapter || '')} · ${Math.round((n.percent || 0) * 100)}%</span>
        </span>
      </button>
      <button class="glyph" data-note-del="${escapeHtml(n.cfi)}" aria-label="Remove highlight">
        <svg class="ico" aria-hidden="true"><use href="#i-trash"/></svg>
      </button>
    </div>`).join('');

  for (const el of $$('[data-goto]', list)) {
    el.addEventListener('click', () => { state.reader?.display(el.dataset.goto); closeSheets(); showChrome(); });
  }
  for (const el of $$('[data-note-del]', list)) {
    el.addEventListener('click', async () => { await deleteHighlight(el.dataset.noteDel); buildNotes(); });
  }
}

/* ══════════════ Sheets ══════════════ */
function openSheet(id) {
  closeSheets();
  $('#scrim').hidden = false;
  const el = $(id);
  el.hidden = false;
  el.querySelector('input, button:not([data-close-sheet])')?.focus({ preventScroll: true });
}

function closeSheets() {
  $('#scrim').hidden = true;
  for (const s of $$('.sheet')) s.hidden = true;
}

/* ── Contents and bookmarks ── */
function buildToc() {
  const list = $('#tocList');
  const items = state.reader?.flatToc() || [];
  list.innerHTML = items.length
    ? items.map((it) => `
      <button class="toc-item" data-depth="${it.depth}" data-href="${escapeHtml(it.href)}">
        <span>${escapeHtml(it.label)}</span>
      </button>`).join('')
    : '<p class="empty-note">This book carries no table of contents.</p>';

  for (const el of $$('.toc-item', list)) {
    el.addEventListener('click', () => {
      state.reader?.display(el.dataset.href);
      closeSheets();
      showChrome();
    });
  }
}

async function buildMarks() {
  const list = $('#markList');
  const marks = await db.listMarks(state.current.id);
  if (!marks.length) {
    list.innerHTML = '<p class="empty-note">No bookmarks yet. Tap the ribbon at the top of a page you want to keep.</p>';
    return;
  }
  list.innerHTML = marks.map((m) => `
    <div class="mark-row">
      <button data-cfi="${escapeHtml(m.cfi)}">
        <span class="toc-item" style="border:0;padding:0;display:block">${escapeHtml(m.chapter || 'Bookmark')} · ${Math.round(m.percent * 100)}%</span>
        <span class="toc-frag">${escapeHtml(m.excerpt || '')}</span>
      </button>
      <button class="glyph" data-del="${escapeHtml(m.cfi)}" aria-label="Remove bookmark">
        <svg class="ico" aria-hidden="true"><use href="#i-trash"/></svg>
      </button>
    </div>`).join('');

  for (const el of $$('[data-cfi]', list)) {
    el.addEventListener('click', () => { state.reader?.display(el.dataset.cfi); closeSheets(); showChrome(); });
  }
  for (const el of $$('[data-del]', list)) {
    el.addEventListener('click', async () => {
      await db.removeMark(state.current.id, el.dataset.del);
      buildMarks();
      refreshBookmarkButton();
    });
  }
}

/* ── Appearance ── */
/* Kindle splits appearance into Font, Layout and Themes, and that is the
   shape she already knows. Every control is the one we had; only the drawer
   it lives in has changed. */
const THEME_LIST = [
  ['garden', 'Parchment'], ['vellum', 'Sepia'], ['dusk', 'Slate'],
  ['hell', 'Hell'], ['limbo', 'Black'],
];

let appearanceTab = 'font';

function buildAppearance() {
  const body = $('#sheetTypeBody');
  body.innerHTML = `
    <div class="segmented type-tabs" role="tablist" aria-label="Appearance">
      ${[['font', 'Font'], ['layout', 'Layout'], ['themes', 'Themes']].map(([k, label]) => `
        <button role="tab" data-atab="${k}" aria-selected="${appearanceTab === k}">${label}</button>`).join('')}
    </div>
    <div id="typePane"></div>`;

  for (const el of $$('[data-atab]', body)) {
    el.addEventListener('click', () => {
      appearanceTab = el.dataset.atab;
      for (const t of $$('[data-atab]', body)) t.setAttribute('aria-selected', String(t === el));
      paintTypePane();
    });
  }
  paintTypePane();
}

function paintTypePane() {
  const pane = $('#typePane');
  if (!pane) return;

  if (appearanceTab === 'font') {
    pane.innerHTML = `
      <div class="row">
        <span class="row-label"><b>Size</b><small id="sizeNow"></small></span>
        <span class="stepgroup">
          <button data-size="-" aria-label="Smaller"><span class="step-a-sm">A</span></button>
          <button data-size="+" aria-label="Larger"><span class="step-a-lg">A</span></button>
        </span>
      </div>
      <div class="row">
        <span class="row-label"><b>Bolder text</b><small>Thickens the letterforms a little.</small></span>
        <button class="switch" data-toggle="bold" aria-pressed="${prefs.bold}" aria-label="Bolder text"></button>
      </div>
      <p class="group-title">Typeface</p>
      <div class="fontpick" role="group" aria-label="Typeface">
        ${Object.entries(FONTS).map(([k, f]) => `
          <button data-font="${k}" aria-pressed="${prefs.font === k}" style="font-family:${f.stack || 'inherit'}">
            <span>${f.label}</span>
            <svg class="ico" aria-hidden="true"><use href="#i-check"/></svg>
          </button>`).join('')}
      </div>`;
  } else if (appearanceTab === 'layout') {
    pane.innerHTML = `
      <div class="row">
        <span class="row-label"><b>Line spacing</b><small id="leadNow"></small></span>
        <span class="stepgroup">
          <button data-lead="-" aria-label="Tighter">&minus;</button>
          <button data-lead="+" aria-label="Looser">+</button>
        </span>
      </div>
      <div class="row">
        <span class="row-label"><b>Margins</b><small id="marginNow"></small></span>
        <span class="stepgroup">
          <button data-margin="-" aria-label="Narrower">&minus;</button>
          <button data-margin="+" aria-label="Wider">+</button>
        </span>
      </div>
      <div class="row">
        <span class="row-label"><b>Even edges</b><small>Stretches each line to meet both margins.</small></span>
        <button class="switch" data-toggle="justify" aria-pressed="${prefs.justify}" aria-label="Justify text"></button>
      </div>
      <div class="row">
        <span class="row-label"><b>Two pages side by side</b><small>When the iPad is turned on its side.</small></span>
        <button class="switch" data-toggle="spread" aria-pressed="${prefs.spread}" aria-label="Two page spread"></button>
      </div>
      <div class="row">
        <span class="row-label"><b>Scroll instead of turning</b><small>One long column rather than pages.</small></span>
        <button class="switch" data-toggle="flowScroll" aria-pressed="${prefs.flow === 'scrolled'}" aria-label="Scroll instead of pages"></button>
      </div>
      <p class="group-title">Ornament</p>
      <div class="row">
        <span class="row-label"><b>Illuminated capitals</b><small>A great inked letter opens every chapter.</small></span>
        <button class="switch" data-toggle="capitals" aria-pressed="${prefs.capitals}" aria-label="Illuminated capitals"></button>
      </div>
      <div class="row">
        <span class="row-label"><b>Painted border</b><small>The illuminated frame around the page.</small></span>
        <button class="switch" data-toggle="marginalia" aria-pressed="${prefs.marginalia}" aria-label="Painted border"></button>
      </div>`;
  } else {
    pane.innerHTML = `
      <p class="group-title">Page colour</p>
      <div class="theme-list" role="group" aria-label="Page colour">
        ${THEME_LIST.map(([k, label]) => `
          <button class="theme-row theme-${k}" data-theme-set="${k}" aria-pressed="${prefs.theme === k}">
            <span class="theme-chip">Aa</span>
            <span class="theme-name">${label}</span>
            <svg class="ico" aria-hidden="true"><use href="#i-check"/></svg>
          </button>`).join('')}
      </div>
      <p class="group-title">Light</p>
      <div class="slider-row">
        <svg class="ico" aria-hidden="true"><use href="#i-moon"/></svg>
        <input type="range" class="dial" id="dialBright" min="25" max="100" step="1" value="${prefs.brightness}" aria-label="Brightness">
        <svg class="ico" aria-hidden="true"><use href="#i-sun"/></svg>
      </div>
      <div class="row">
        <span class="row-label"><b>Warm the screen</b><small>Takes the blue out of the light for reading at night.</small></span>
      </div>
      <div class="slider-row">
        <input type="range" class="dial" id="dialWarm" min="0" max="100" step="1" value="${prefs.warmth}" aria-label="Screen warmth">
      </div>`;
  }

  syncAppearanceLabels();
  bindTypePane(pane);
}

function bindTypePane(body) {
  for (const el of $$('[data-theme-set]', body)) {
    el.addEventListener('click', () => {
      prefs.theme = el.dataset.themeSet;
      for (const s of $$('[data-theme-set]', body)) s.setAttribute('aria-pressed', String(s.dataset.themeSet === prefs.theme));
    });
  }
  for (const el of $$('[data-font]', body)) {
    el.addEventListener('click', () => {
      prefs.font = el.dataset.font;
      for (const s of $$('[data-font]', body)) s.setAttribute('aria-pressed', String(s.dataset.font === prefs.font));
    });
  }
  for (const el of $$('[data-size]', body)) {
    el.addEventListener('click', () => {
      prefs.fontScale = clamp(prefs.fontScale + (el.dataset.size === '+' ? 8 : -8), 70, 260);
      syncAppearanceLabels();
    });
  }
  for (const el of $$('[data-lead]', body)) {
    el.addEventListener('click', () => {
      prefs.lineHeight = clamp(prefs.lineHeight + (el.dataset.lead === '+' ? 10 : -10), 110, 240);
      syncAppearanceLabels();
    });
  }
  for (const el of $$('[data-margin]', body)) {
    el.addEventListener('click', () => {
      prefs.margin = clamp(prefs.margin + (el.dataset.margin === '+' ? 1 : -1), 0, 3);
      syncAppearanceLabels();
    });
  }
  $('#dialBright', body)?.addEventListener('input', (e) => { prefs.brightness = +e.target.value; });
  $('#dialWarm', body)?.addEventListener('input', (e) => { prefs.warmth = +e.target.value; });

  for (const el of $$('[data-toggle]', body)) {
    el.addEventListener('click', () => {
      const key = el.dataset.toggle;
      if (key === 'flowScroll') prefs.flow = prefs.flow === 'scrolled' ? 'paginated' : 'scrolled';
      else prefs[key] = !prefs[key];
      el.setAttribute('aria-pressed', String(key === 'flowScroll' ? prefs.flow === 'scrolled' : prefs[key]));
    });
  }
}

function syncAppearanceLabels() {
  const s = $('#sizeNow'); if (s) s.textContent = `${prefs.fontScale}%`;
  const l = $('#leadNow'); if (l) l.textContent = `${(prefs.lineHeight / 100).toFixed(2)} lines`;
  const m = $('#marginNow'); if (m) m.textContent = MARGINS[prefs.margin];
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ── The Workshop ── */
async function buildWorkshop() {
  const body = $('#sheetPrefsBody');
  const u = await db.usage();
  const persisted = await navigator.storage?.persisted?.().catch(() => false);
  const standalone = isStandalone();

  body.innerHTML = `
    <div class="row">
      <span class="row-label">
        <b>${state.books.length} ${state.books.length === 1 ? 'volume' : 'volumes'}</b>
        <small>${u ? `${db.formatBytes(u.used)} used of about ${db.formatBytes(u.quota)} available` : 'Storage size unknown'}</small>
      </span>
    </div>
    <div class="row">
      <span class="row-label">
        <b>Kept safely</b>
        <small>${persisted
          ? 'This device has promised not to clear your books when space runs low.'
          : 'Not yet promised. Tap to ask the device to hold on to your library.'}</small>
      </span>
      ${persisted ? '' : '<button class="btn btn-ghost" id="askPersist">Ask</button>'}
    </div>

    <p class="group-title">Keeping a copy</p>
    <div class="row">
      <span class="row-label"><b>Back up the whole garden</b><small>Every book, every bookmark, every page you were on, in one file.</small></span>
    </div>
    <div class="btn-stack" style="margin-top:4px">
      <button class="btn btn-primary btn-block" id="doBackup">Make a backup</button>
      <button class="btn btn-ghost btn-block" id="doRestore">Restore from a backup</button>
    </div>

    <p class="group-title">The shelf</p>
    <div class="row">
      <span class="row-label"><b>Order the books by</b><small>${sortLabel()}</small></span>
      <button class="btn btn-ghost" id="cycleSort">Change</button>
    </div>
    <div class="row">
      <span class="row-label"><b>Banish a book</b><small>Turns on the red marks so you can remove books.</small></span>
      <button class="btn btn-ghost" id="startEdit">Edit</button>
    </div>

    ${standalone ? '' : `
    <p class="group-title">Living on the home screen</p>
    <div class="row">
      <span class="row-label"><b>Triptych is running in the browser</b><small>Add it to your home screen and it opens like a real app, with no address bar.</small></span>
      <button class="btn btn-ghost" id="showCoach">Show me</button>
    </div>`}

    <p class="group-title">This copy</p>
    <div class="row">
      <span class="row-label"><b>Build</b><small id="buildStamp">Checking…</small></span>
      <button class="btn btn-ghost" id="forceUpdate">Check now</button>
    </div>

    <p class="group-title">About</p>
    <p class="empty-note" style="text-align:start;padding:8px 2px">
      Built for you. Every book lives on this device and nowhere else.
      Nothing is uploaded, nothing is tracked, and it works with no internet at all.
    </p>`;

  $('#askPersist', body)?.addEventListener('click', async () => {
    const r = await db.requestPersistence();
    toast(r === 'granted' ? 'Promised. Your books are safe here.' : 'The device would not promise. Keep a backup.');
    buildWorkshop();
  });
  (async () => {
    const stamp = $('#buildStamp', body);
    if (!stamp) return;
    try {
      const keys = await caches.keys();
      const v = (keys.find((k) => k.startsWith('triptych-')) || '').replace('triptych-', '');
      stamp.textContent = v ? `${v}, kept for reading offline` : 'not yet stored for offline';
    } catch { stamp.textContent = 'unknown'; }
  })();
  $('#forceUpdate', body)?.addEventListener('click', async () => {
    toast('Looking for a newer version…');
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
      setTimeout(() => location.reload(), 1200);
    } catch { location.reload(); }
  });
  $('#doBackup', body).addEventListener('click', makeBackup);
  $('#doRestore', body).addEventListener('click', () => pickFile('.zip'));
  $('#cycleSort', body).addEventListener('click', () => {
    const order = ['recent', 'title', 'author', 'added'];
    prefs.sort = order[(order.indexOf(prefs.sort) + 1) % order.length];
    renderShelf();
    buildWorkshop();
  });
  $('#startEdit', body).addEventListener('click', () => { closeSheets(); setEditing(true); });
  $('#showCoach', body)?.addEventListener('click', () => { closeSheets(); $('#installCoach').hidden = false; });
}

const sortLabel = () => ({
  recent: 'Most recently read', title: 'Title', author: 'Author', added: 'When it arrived',
}[prefs.sort]);

/* ══════════════ Backup and restore ══════════════ */
async function makeBackup() {
  if (!state.books.length) { toast('Nothing to back up yet.'); return; }
  toast('Wrapping everything up…', 12000);
  try {
    const zip = new window.JSZip();
    const manifest = { version: 1, made: Date.now(), books: [], state: [], marks: [] };

    for (const b of state.books) {
      const data = await db.getBlob(b.id);
      if (data) zip.file(`books/${b.id}.epub`, data);
      if (b.cover) zip.file(`covers/${b.id}`, b.cover);
      manifest.books.push({ ...b, cover: b.cover ? `covers/${b.id}` : null, coverType: b.cover?.type || '' });
      const s = await db.getState(b.id);
      if (s) manifest.state.push(s);
      manifest.marks.push(...(await db.listMarks(b.id)));
    }
    zip.file('triptych.json', JSON.stringify(manifest));

    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const stamp = new Date().toISOString().slice(0, 10);
    const file = new File([blob], `triptych-backup-${stamp}.zip`, { type: 'application/zip' });

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Triptych backup' });
      toast('Saved.');
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('Backup downloaded.');
    }
  } catch (err) {
    if (err?.name === 'AbortError') { toast('Backup cancelled.'); return; }
    toast('The backup would not finish. Try with fewer books.', 4000);
  }
}

async function restoreBackup(file) {
  toast('Unpacking the backup…', 14000);
  try {
    const zip = await window.JSZip.loadAsync(file);
    const mf = zip.file('triptych.json');
    if (!mf) { toast('That zip is not a Triptych backup.'); return; }
    const manifest = JSON.parse(await mf.async('string'));

    const existing = await db.listBooks();
    const seen = new Set(existing.map((b) => `${b.title}|${b.author || ''}`));
    let n = 0;

    for (const b of manifest.books || []) {
      if (seen.has(`${b.title}|${b.author || ''}`)) continue;
      const entry = zip.file(`books/${b.id}.epub`);
      if (!entry) continue;
      const data = await entry.async('arraybuffer');
      let cover = null;
      if (b.cover && zip.file(b.cover)) {
        cover = new Blob([await zip.file(b.cover).async('blob')], { type: b.coverType || 'image/jpeg' });
      }
      await db.saveBook({ ...b, cover }, data);
      n++;
    }
    for (const s of manifest.state || []) await db.saveState(s.id, s);
    for (const m of manifest.marks || []) await db.addMark(m);

    await renderShelf();
    toast(n ? `${n} ${n === 1 ? 'book' : 'books'} restored.` : 'Everything in that backup was already here.');
  } catch {
    toast('That backup could not be read.', 4000);
  }
}

/* ══════════════ File picker ══════════════ */
function pickFile(accept = '.epub,application/epub+zip') {
  const input = $('#fileInput');
  input.accept = accept;
  input.value = '';
  input.click();
}

/* ══════════════ Install coach ══════════════ */
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function maybeCoach() {
  if (isStandalone()) return;
  if (!isIOS()) return;
  if (localStorage.getItem('triptych.coached') === '1') return;
  // Only ever in front of the shelf. It must never land on top of a book.
  setTimeout(() => {
    if (state.view === 'library' && $('#scrim').hidden) $('#installCoach').hidden = false;
  }, 1600);
}

/* ══════════════ Wiring ══════════════ */
function wire() {
  const summon = new Summon($('#summonBody'), {
    onPickFile: () => pickFile(),
    toast,
    isActive: () => state.view === 'summon',
    search: (q) => catalogue.search(q),
    fetchBook: (entry, btn) => fetchFromCatalogue(entry, btn),
    stepper: (n) => {
      for (const li of $$('#stepper li')) {
        const s = Number(li.dataset.step);
        li.dataset.state = s < n ? 'done' : s === n ? 'now' : 'next';
      }
    },
  });

  const openSummon = () => { setView('summon'); summon.reset(); };
  $('#fabSummon')?.addEventListener('click', openSummon);
  $('[data-action="summon"]')?.addEventListener('click', openSummon);
  $('[data-action="leave-summon"]').addEventListener('click', () => history.back());
  $('[data-action="leave-book"]').addEventListener('click', () => history.back());
  $('[data-action="close-book"]').addEventListener('click', () => closeBook());

  // The rail and the tab bar are two faces of one control.
  goBook = async (id) => { await showBook(id); setView('book'); };

  goTo = async (to) => {
    if (to === 'workshop') { await buildWorkshop(); openSheet('#sheetPrefs'); return; }
    if (to === 'summon') { openSummon(); return; }
    if (to === 'home') { await renderHome(); setView('home'); return; }
    if (to === 'library') { await renderShelf(); setView('library'); return; }
  };
  for (const item of $$('[data-rail]')) {
    item.addEventListener('click', () => goTo(item.dataset.rail));
  }

  // Searching and filtering the shelf.
  let shelfTimer;
  $('#shelfSearch')?.addEventListener('input', (e) => {
    clearTimeout(shelfTimer);
    const v = e.target.value;
    shelfTimer = setTimeout(() => { state.query = v; renderShelf(); }, 160);
  });
  for (const chip of $$('.filter')) {
    chip.addEventListener('click', () => {
      state.filter = chip.dataset.filter;
      for (const c of $$('.filter')) c.setAttribute('aria-pressed', String(c === chip));
      renderShelf();
    });
  }

  $('#fileInput').addEventListener('change', (e) => {
    importFiles(e.target.files);
    e.target.value = '';
  });

  $('#btnPrefs').addEventListener('click', async () => { await buildWorkshop(); openSheet('#sheetPrefs'); });
  $('#btnSort').addEventListener('click', async () => { await buildWorkshop(); openSheet('#sheetPrefs'); });
  $('#btnType').addEventListener('click', () => { buildAppearance(); openSheet('#sheetType'); });
  $('#btnToc').addEventListener('click', () => { buildMarks(); openSheet('#sheetToc'); });
  $('#btnSearch').addEventListener('click', () => { openSheet('#sheetSearch'); $('#findInput').focus(); });

  $('#btnBookmark').addEventListener('click', async () => {
    if (!state.current || !lastLoc.cfi) return;
    const on = await db.hasMark(state.current.id, lastLoc.cfi);
    if (on) {
      await db.removeMark(state.current.id, lastLoc.cfi);
      toast('Bookmark lifted.');
    } else {
      const excerpt = await state.reader.currentExcerpt();
      await db.addMark({
        bookId: state.current.id, cfi: lastLoc.cfi, percent: lastLoc.percent,
        chapter: lastLoc.chapter, excerpt,
      });
      toast('Kept.');
    }
    refreshBookmarkButton();
  });

  // The highlight popover. Swallow the press so the book keeps its selection.
  const pop = $('#hlPop');
  for (const type of ['mousedown', 'touchstart', 'pointerdown']) {
    pop.addEventListener(type, (e) => e.preventDefault());
  }
  for (const el of $$('[data-hl]')) el.addEventListener('click', () => saveHighlight(el.dataset.hl));
  $('#hlNote').addEventListener('click', () => pendingSelection && addNoteTo(pendingSelection.cfi));
  $('#hlCopy').addEventListener('click', async () => {
    if (!pendingSelection) return;
    try { await navigator.clipboard.writeText(pendingSelection.text); toast('Copied.'); }
    catch { toast('Could not copy.'); }
    hidePopover();
  });
  $('#hlDelete').addEventListener('click', () => pendingSelection && deleteHighlight(pendingSelection.cfi));

  $('#tapPrev').addEventListener('click', () => state.reader?.prev());
  $('#tapNext').addEventListener('click', () => state.reader?.next());

  // Scrubber
  const scrub = $('#scrubber');
  scrub.addEventListener('input', () => {
    const r = scrub.value / 1000;
    paintScrub(r);
    $('#metaRight').textContent = `${Math.round(r * 100)}%`;
  });
  scrub.addEventListener('change', () => state.reader?.goToPercent(scrub.value / 1000));

  // Contents / bookmarks tabs
  for (const tab of $$('#sheetToc [role="tab"]')) {
    tab.addEventListener('click', () => {
      for (const t of $$('#sheetToc [role="tab"]')) t.setAttribute('aria-selected', String(t === tab));
      const which = tab.dataset.tab;
      $('#tocList').hidden = which !== 'toc';
      $('#markList').hidden = which !== 'marks';
      $('#noteList').hidden = which !== 'notes';
      if (which === 'marks') buildMarks();
      if (which === 'notes') buildNotes();
    });
  }

  // Search inside the book
  let findTimer;
  $('#findInput').addEventListener('input', (e) => {
    clearTimeout(findTimer);
    const q = e.target.value;
    const out = $('#findResults');
    if (q.trim().length < 2) { out.innerHTML = ''; return; }
    out.innerHTML = '<p class="empty-note">Searching every page…</p>';
    findTimer = setTimeout(async () => {
      const hits = await state.reader.search(q);
      if (!hits.length) { out.innerHTML = `<p class="empty-note">Nothing found for “${escapeHtml(q)}”.</p>`; return; }
      out.innerHTML = `<p class="group-title">${hits.length} ${hits.length === 1 ? 'passage' : 'passages'}</p>` +
        hits.map((h) => `
          <button class="toc-item" data-hit="${escapeHtml(h.cfi)}" style="display:block">
            <span class="toc-frag">${highlight(h.excerpt, q)}</span>
          </button>`).join('');
      for (const el of $$('[data-hit]', out)) {
        el.addEventListener('click', () => { state.reader.display(el.dataset.hit); closeSheets(); showChrome(); });
      }
    }, 420);
  });

  // Sheets and scrim
  $('#scrim').addEventListener('click', closeSheets);
  for (const b of $$('[data-close-sheet]')) b.addEventListener('click', closeSheets);

  // Install coach
  $('#dismissCoach').addEventListener('click', () => {
    $('#installCoach').hidden = true;
    localStorage.setItem('triptych.coached', '1');
  });

  // Leaving edit mode
  document.addEventListener('click', (e) => {
    if (state.editing && !e.target.closest('[data-remove], [data-id]')) setEditing(false);
  }, true);

  // Keyboard, for the iPad keyboard case
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!$('#scrim').hidden) closeSheets(); else if (state.view === 'reader') closeBook(); }
    if (state.view === 'reader' && $('#scrim').hidden) state.reader?.handleKey(e);
  });

  let frameTimer;
  window.addEventListener('resize', () => {
    if (state.view !== 'reader') return;
    paintScrub(lastLoc.percent || 0);
    clearTimeout(frameTimer);
    frameTimer = setTimeout(async () => {
      if (!state.current) return;
      await applyFrame(state.current.id);
      state.reader?.restyle();
    }, 200);
  });
}

function highlight(text, q) {
  const safe = escapeHtml(text);
  const needle = escapeHtml(q.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp(needle, 'ig'), (m) => `<b style="color:var(--accent)">${m}</b>`);
}

/* ══════════════ The service worker, and getting off an old one ══════════════ */
/* Cache-first means a stale build can serve itself forever. Without this the
   only way onto a new version is closing every tab, which nobody does. */
function registerWorker() {
  let reloading = false;
  let pending = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker.register('sw.js').then((reg) => {
    const check = () => reg.update().catch(() => {});

    reg.addEventListener('updatefound', () => {
      const next = reg.installing;
      if (!next) return;
      next.addEventListener('statechange', () => {
        // A controller already exists, so this is an update rather than a
        // first install.
        if (next.state !== 'installed' || !navigator.serviceWorker.controller) return;
        if (state.view === 'reader') {
          // Never yank the page out from under her mid-chapter.
          pending = true;
          toast('A new version is ready. It will load when you close the book.', 4000);
        } else {
          next.postMessage('skipWaiting');
        }
      });
    });

    // Take the update the moment she leaves the book.
    document.addEventListener('delights:closedbook', () => {
      if (pending && reg.waiting) reg.waiting.postMessage('skipWaiting');
    });

    check();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  }).catch(() => {});
}

/* ══════════════ Boot ══════════════ */
async function boot() {
  // First, before anything that can block. The dedication card waits on a tap,
  // and registering behind it meant the app only became offline-capable once
  // she had dismissed it.
  if ('serviceWorker' in navigator) registerWorker();

  summonDemons(document);
  applyShell();
  wire();

  // Live restyle when appearance changes.
  const { onPrefChange } = await import('./prefs.js');
  onPrefChange((key) => {
    applyShell();
    if (!state.reader) return;
    if (key === 'flow' || key === 'spread') state.reader.reflow();
    else if (['theme', 'font', 'fontScale', 'lineHeight', 'margin', 'justify', 'capitals', 'bold'].includes(key)) {
      state.reader.restyle();
    }
  });

  // Kindle opens on whatever you are in the middle of, so this does too.
  history.replaceState({ view: 'home' }, '');
  await renderShelf();
  await renderHome();
  setView('home', false);
  await db.requestPersistence().catch(() => {});

  // The books arrive behind the card, so the shelf is ready when she taps through.
  const firstRun = localStorage.getItem('triptych.seeded') !== '1';
  const seeding = seedFirstRun();
  const dedicated = localStorage.getItem('triptych.dedicated') === '1';
  await showDedication();
  const seeded = await seeding;
  if (seeded) await renderHome();
  if (firstRun && seeded && dedicated) {
    toast(`${seeded} to begin with. Happy birthday.`, 5200);
  }
  maybeCoach();

  if (new URLSearchParams(location.search).has('summon')) {
    $('#fabSummon').click();
    history.replaceState({ view: 'summon' }, '', location.pathname);
  }

  // Books opened from Files, if the browser offers the handler.
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (params) => {
      if (!params?.files?.length) return;
      const files = await Promise.all(params.files.map((h) => h.getFile()));
      importFiles(files);
    });
  }

  void DEFAULTS;
}

boot();
