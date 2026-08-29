/*
 * app.js
 * The controller. Owns routing, the shelf, the reader chrome, every sheet,
 * import and backup.
 */

import { conjure, beast, beastFor, PLATE_PIGMENTS } from './bestiary.js';
import { prefs, DEFAULTS, FONTS, MARGINS } from './prefs.js';
import * as db from './db.js';
import { Reader } from './reader.js';
import { Summon } from './summon.js';
import { DEDICATION } from './dedication.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;

const state = {
  view: 'library',
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
  for (const r of $$('.rail-item')) {
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
          <span class="book-plate-mark">${beast(beastFor(b.id))}</span>
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
    el.addEventListener('click', () => { if (!state.editing) openBook(el.dataset.id); });
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
  if (localStorage.getItem('delights.seeded') === '1') return;
  if ((await db.listBooks()).length) { localStorage.setItem('delights.seeded', '1'); return; }

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
  localStorage.setItem('delights.seeded', '1');
  return n;
}

/* ══════════════ The frontispiece ══════════════ */
function showDedication() {
  if (localStorage.getItem('delights.dedicated') === '1') return Promise.resolve();
  const d = DEDICATION;
  if (!d?.lines?.length) { localStorage.setItem('delights.dedicated', '1'); return Promise.resolve(); }

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
      localStorage.setItem('delights.dedicated', '1');
      card.style.transition = 'opacity 520ms var(--ease)';
      card.style.opacity = '0';
      setTimeout(() => { card.hidden = true; card.style.cssText = ''; resolve(); }, 520);
    }, { once: true });
  });
}

/* ══════════════ Reader ══════════════ */
async function openBook(id) {
  const rec = await db.getBook(id);
  if (!rec) return;
  const data = await db.getBlob(id);
  if (!data) { toast('The file for this one has gone missing.'); return; }

  state.current = rec;
  $('#readerTitle').textContent = rec.title;
  $('#pageLoading').hidden = false;
  setView('reader');

  const reader = new Reader($('#viewer'));
  state.reader = reader;

  reader.on('relocated', onRelocated).on('toggleChrome', toggleChrome);

  try {
    await reader.open(rec, data);
  } catch {
    $('#pageLoading').hidden = true;
    toast('That book will not open. It may be damaged.', 4000);
    closeBook();
    return;
  }

  $('#pageLoading').hidden = true;
  buildToc();
  showChrome();
  state.chromeTimer = setTimeout(hideChrome, 2800);
}

function closeBook(pop = true) {
  clearTimeout(state.chromeTimer);
  state.reader?.destroy();
  state.reader = null;
  state.current = null;
  $('#viewer').innerHTML = '';
  closeSheets();
  setView('library', false);
  renderShelf();
  if (pop && history.state?.view === 'reader') history.back();
}

let lastLoc = { cfi: '', percent: 0, chapter: '', page: 0, pages: 0 };

function onRelocated(loc) {
  lastLoc = loc;
  const pct = Math.round(loc.percent * 1000);
  const scrub = $('#scrubber');
  if (document.activeElement !== scrub) scrub.value = String(pct);
  paintScrub(pct / 1000);

  $('#metaLeft').textContent = loc.chapter || state.current?.title || '';
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
const THEME_LIST = [
  ['garden', 'Garden'], ['vellum', 'Vellum'], ['dusk', 'Dusk'], ['hell', 'Hell'], ['limbo', 'Limbo'],
];

function buildAppearance() {
  const body = $('#sheetTypeBody');
  body.innerHTML = `
    <p class="group-title">Panel</p>
    <div class="swatches" role="group" aria-label="Colour panel">
      ${THEME_LIST.map(([k, label]) => `
        <button class="swatch swatch-${k}" data-theme-set="${k}" aria-label="${label}"
          aria-pressed="${prefs.theme === k}" title="${label}">A</button>`).join('')}
    </div>

    <div class="row">
      <span class="row-label"><b>Size of the letters</b><small id="sizeNow"></small></span>
      <span class="stepgroup">
        <button data-size="-" aria-label="Smaller"><span class="step-a-sm">A</span></button>
        <button data-size="+" aria-label="Larger"><span class="step-a-lg">A</span></button>
      </span>
    </div>

    <div class="row">
      <span class="row-label"><b>Space between lines</b><small id="leadNow"></small></span>
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

    <p class="group-title">Lettering</p>
    <div class="fontpick" role="group" aria-label="Typeface">
      ${Object.entries(FONTS).map(([k, f]) => `
        <button data-font="${k}" aria-pressed="${prefs.font === k}"
          style="font-family:${f.stack || 'inherit'}">
          <span>${f.label}</span>
          <svg class="ico" aria-hidden="true"><use href="#i-check"/></svg>
        </button>`).join('')}
    </div>

    <p class="group-title">The light</p>
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
    </div>

    <p class="group-title">The page itself</p>
    <div class="row">
      <span class="row-label"><b>Illuminated capitals</b><small>A great inked letter opens every chapter.</small></span>
      <button class="switch" data-toggle="capitals" aria-pressed="${prefs.capitals}" aria-label="Illuminated capitals"></button>
    </div>
    <div class="row">
      <span class="row-label"><b>Creatures in the margins</b><small>Vines and beasts down the edges of the page.</small></span>
      <button class="switch" data-toggle="marginalia" aria-pressed="${prefs.marginalia}" aria-label="Marginalia"></button>
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
    </div>`;

  syncAppearanceLabels();

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
  $('#dialBright', body).addEventListener('input', (e) => { prefs.brightness = +e.target.value; });
  $('#dialWarm', body).addEventListener('input', (e) => { prefs.warmth = +e.target.value; });

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
      <span class="row-label"><b>Delights is running in the browser</b><small>Add it to your home screen and it opens like a real app, with no address bar.</small></span>
      <button class="btn btn-ghost" id="showCoach">Show me</button>
    </div>`}

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
    zip.file('delights.json', JSON.stringify(manifest));

    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const stamp = new Date().toISOString().slice(0, 10);
    const file = new File([blob], `delights-backup-${stamp}.zip`, { type: 'application/zip' });

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Delights backup' });
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
    const mf = zip.file('delights.json');
    if (!mf) { toast('That zip is not a Delights backup.'); return; }
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
  if (localStorage.getItem('delights.coached') === '1') return;
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
  $('[data-action="close-book"]').addEventListener('click', () => closeBook());

  // The rail carries the same destinations as the phone chrome.
  for (const item of $$('.rail-item')) {
    item.addEventListener('click', async () => {
      const to = item.dataset.rail;
      if (to === 'library') { if (state.view !== 'library') history.back(); }
      else if (to === 'summon') openSummon();
      else if (to === 'search') {
        if (state.view !== 'library') history.back();
        setTimeout(() => $('#shelfSearch')?.focus(), 220);
      } else if (to === 'workshop') { await buildWorkshop(); openSheet('#sheetPrefs'); }
    });
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
      const marks = tab.dataset.tab === 'marks';
      $('#tocList').hidden = marks;
      $('#markList').hidden = !marks;
      if (marks) buildMarks();
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
    localStorage.setItem('delights.coached', '1');
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

  window.addEventListener('resize', () => { if (state.view === 'reader') paintScrub(lastLoc.percent || 0); });
}

function highlight(text, q) {
  const safe = escapeHtml(text);
  const needle = escapeHtml(q.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp(needle, 'ig'), (m) => `<b style="color:var(--accent)">${m}</b>`);
}

/* ══════════════ Boot ══════════════ */
async function boot() {
  conjure(document);
  applyShell();
  wire();

  // Live restyle when appearance changes.
  const { onPrefChange } = await import('./prefs.js');
  onPrefChange((key) => {
    applyShell();
    if (!state.reader) return;
    if (key === 'flow' || key === 'spread') state.reader.reflow();
    else if (['theme', 'font', 'fontScale', 'lineHeight', 'margin', 'justify', 'capitals'].includes(key)) {
      state.reader.restyle();
    }
  });

  history.replaceState({ view: 'library' }, '');
  await renderShelf();
  await db.requestPersistence().catch(() => {});

  // The books arrive behind the card, so the shelf is ready when she taps through.
  const firstRun = localStorage.getItem('delights.seeded') !== '1';
  const seeding = seedFirstRun();
  const dedicated = localStorage.getItem('delights.dedicated') === '1';
  await showDedication();
  const seeded = await seeding;
  if (firstRun && seeded && dedicated) {
    toast(`${seeded} to begin with. Happy birthday.`, 5200);
  }
  maybeCoach();

  if (new URLSearchParams(location.search).has('summon')) {
    $('#fabSummon').click();
    history.replaceState({ view: 'summon' }, '', location.pathname);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
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
