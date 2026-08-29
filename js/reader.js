/*
 * reader.js
 * Wraps epub.js. Owns the rendition, the injected page styling, gesture
 * handling inside the book document, locations, search and progress.
 */

import { prefs, FONTS } from './prefs.js';
import * as db from './db.js';

const STYLE_ID = '__delights_style';
const CAP_CLASS = 'dl-first';

let fontFaceCss = '';

/* Pull the local @font-face block once and rewrite its relative paths to
   absolute ones, so the rules still resolve inside the book's iframe. */
async function loadFontFaces() {
  if (fontFaceCss) return fontFaceCss;
  try {
    const text = await (await fetch('css/fonts.css')).text();
    const base = new URL('fonts/', location.href).href;
    fontFaceCss = text.replace(/url\(\.\.\/fonts\//g, `url(${base}`);
  } catch {
    fontFaceCss = '';
  }
  return fontFaceCss;
}

/* Page palettes mirror the shell themes. */
const PAGE_THEMES = {
  garden: { bg: '#f4ead4', fg: '#241a0d', link: '#a8341f', cap: '#a8341f', capShadow: '#b98c22', sel: 'rgba(185,140,34,.32)' },
  vellum: { bg: '#f0dfb8', fg: '#33240f', link: '#9c4a1c', cap: '#9c4a1c', capShadow: '#b98c22', sel: 'rgba(156,74,28,.24)' },
  dusk:   { bg: '#423e36', fg: '#e9dfc9', link: '#cf8368', cap: '#cf8368', capShadow: '#8a7a52', sel: 'rgba(207,131,104,.3)' },
  hell:   { bg: '#171310', fg: '#ddcda9', link: '#d9611f', cap: '#d9611f', capShadow: '#7a3d13', sel: 'rgba(217,97,31,.32)' },
  limbo:  { bg: '#000000', fg: '#c3b494', link: '#b98c22', cap: '#b98c22', capShadow: '#4a3809', sel: 'rgba(185,140,34,.3)' },
};

const MARGIN_EM = [1.1, 2.0, 3.2, 4.6];

function pageCss() {
  const t = PAGE_THEMES[prefs.theme] || PAGE_THEMES.garden;
  const stack = FONTS[prefs.font]?.stack;
  const family = stack ? `font-family: ${stack} !important;` : '';
  const side = MARGIN_EM[prefs.margin] ?? 2.0;
  const align = prefs.justify ? 'justify' : 'left';

  return `
${fontFaceCss}
html { -webkit-text-size-adjust: none; text-size-adjust: none; }
body {
  background: ${t.bg} !important;
  color: ${t.fg} !important;
  ${family}
  font-size: ${prefs.fontScale}% !important;
  line-height: ${prefs.lineHeight / 100} !important;
  padding: 0 ${side}em !important;
  margin: 0 !important;
  -webkit-hyphens: auto; hyphens: auto;
  word-break: normal;
  overflow-wrap: break-word;
}
p, li, dd, blockquote, div {
  ${family}
  line-height: ${prefs.lineHeight / 100} !important;
  text-align: ${align};
  color: ${t.fg};
}
p { orphans: 2; widows: 2; }
h1, h2, h3, h4, h5, h6 {
  ${family}
  color: ${t.fg};
  line-height: 1.22;
  text-align: left;
  -webkit-hyphens: none; hyphens: none;
  text-wrap: balance;
}
a, a:visited { color: ${t.link} !important; text-decoration-thickness: 1px; text-underline-offset: 2px; }
img, svg, image, video { max-width: 100% !important; height: auto !important; }
::selection { background: ${t.sel}; }
hr { border: 0; height: 1px; background: ${t.fg}; opacity: .25; margin: 1.6em 0; }
blockquote { border-inline-start: 2px solid ${t.link}; padding-inline-start: .9em; opacity: .92; }
table { max-width: 100% !important; }
${prefs.capitals ? `
.${CAP_CLASS}::first-letter {
  float: left;
  font-family: 'UnifrakturMaguntia', 'EB Garamond', Georgia, serif !important;
  font-size: 3.5em;
  line-height: .78;
  padding: .06em .09em 0 0;
  margin-block-start: .04em;
  color: ${t.cap};
  text-shadow: 1px 1px 0 ${t.capShadow};
  -webkit-hyphens: none; hyphens: none;
}
.${CAP_CLASS} { text-indent: 0 !important; }
` : ''}
`;
}

export class Reader {
  constructor(host) {
    this.host = host;
    this.book = null;
    this.rendition = null;
    this.record = null;
    this.location = null;
    this.contents = new Set();
    this.handlers = {};
    this._ro = null;
  }

  on(name, fn) { this.handlers[name] = fn; return this; }
  emit(name, ...a) { this.handlers[name]?.(...a); }

  async open(record, data) {
    await loadFontFaces();
    this.record = record;
    this.book = window.ePub(data);
    await this.book.ready;

    this.rendition = this.book.renderTo(this.host, {
      width: '100%',
      height: '100%',
      flow: prefs.flow === 'scrolled' ? 'scrolled-doc' : 'paginated',
      spread: this._spreadMode(),
      minSpreadWidth: 820,
      allowScriptedContent: true,
      snap: false,
    });

    this.rendition.hooks.content.register((contents) => this._dressPage(contents));
    this.rendition.on('relocated', (loc) => this._onRelocated(loc));

    const state = await db.getState(record.id);

    if (state?.locations) {
      try { this.book.locations.load(state.locations); } catch { /* regenerate below */ }
    }

    await this.rendition.display(state?.cfi || undefined);

    if (!this.book.locations.length()) this._buildLocations();

    this._watchResize();
    return this.book;
  }

  _spreadMode() {
    if (prefs.flow === 'scrolled') return 'none';
    return prefs.spread ? 'auto' : 'none';
  }

  /* Locations power the percentage and the scrubber. Generating them costs a
     few seconds on a long book, so the result is cached against the book. */
  async _buildLocations() {
    try {
      await this.book.locations.generate(1400);
      await db.saveState(this.record.id, { locations: this.book.locations.save() });
      this.emit('locations');
      if (this.location) this._onRelocated(this.location);
    } catch { /* percentage falls back to spine position */ }
  }

  /* ── Page dressing and gestures ── */

  _dressPage(contents) {
    const doc = contents.document;
    this.contents.add(contents);
    contents.on?.('destroy', () => this.contents.delete(contents));

    this._writeStyle(doc);
    this._markFirstParagraph(doc);
    this._bindGestures(doc);
  }

  _writeStyle(doc) {
    let el = doc.getElementById(STYLE_ID);
    if (!el) {
      el = doc.createElement('style');
      el.id = STYLE_ID;
      doc.head?.appendChild(el);
    }
    el.textContent = pageCss();
  }

  _markFirstParagraph(doc) {
    if (!prefs.capitals) return;
    for (const p of doc.querySelectorAll(`.${CAP_CLASS}`)) p.classList.remove(CAP_CLASS);
    const candidates = doc.querySelectorAll('p');
    for (const p of candidates) {
      const text = (p.textContent || '').trim();
      // Skip stubs and anything that opens with punctuation or a numeral.
      if (text.length < 60 || !/^[A-Za-zÀ-ɏ]/.test(text)) continue;
      if (p.querySelector('img, svg')) continue;
      p.classList.add(CAP_CLASS);
      break;
    }
  }

  _bindGestures(doc) {
    let sx = 0, sy = 0, st = 0, tracking = false;

    const zoneAction = (clientX, width) => {
      const r = clientX / width;
      if (r < 0.28) return 'prev';
      if (r > 0.72) return 'next';
      return 'toggle';
    };

    const isInteractive = (t) => !!(t && t.closest?.('a, button, input, select, textarea, [role="link"], [role="button"]'));
    const hasSelection = () => {
      const s = doc.getSelection?.();
      return !!(s && !s.isCollapsed && String(s).trim().length);
    };

    doc.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) { tracking = false; return; }
      tracking = true;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      st = Date.now();
    }, { passive: true });

    doc.addEventListener('touchend', (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const dt = Date.now() - st;
      if (isInteractive(e.target) || hasSelection()) return;

      if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy) * 1.4 && dt < 700) {
        if (prefs.flow !== 'scrolled') dx < 0 ? this.next() : this.prev();
        return;
      }
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 400) {
        const w = doc.documentElement.clientWidth || 1;
        const act = prefs.flow === 'scrolled' ? 'toggle' : zoneAction(t.clientX, w);
        if (act === 'prev') this.prev();
        else if (act === 'next') this.next();
        else this.emit('toggleChrome');
      }
    }, { passive: true });

    // Pointer devices and trackpads.
    doc.addEventListener('click', (e) => {
      if (e.pointerType === 'touch' || isInteractive(e.target) || hasSelection()) return;
      if (!e.detail) return; // synthesised
      const w = doc.documentElement.clientWidth || 1;
      const act = prefs.flow === 'scrolled' ? 'toggle' : zoneAction(e.clientX, w);
      if (act === 'prev') this.prev();
      else if (act === 'next') this.next();
      else this.emit('toggleChrome');
    });

    doc.addEventListener('keydown', (e) => this.handleKey(e));
  }

  handleKey(e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { this.next(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { this.prev(); e.preventDefault(); }
  }

  /* ── Live restyle when the reader changes a setting ── */

  restyle() {
    for (const c of this.contents) {
      if (!c.document) { this.contents.delete(c); continue; }
      this._writeStyle(c.document);
      this._markFirstParagraph(c.document);
    }
  }

  /* Flow and spread changes need the rendition rebuilt around the same spot. */
  async reflow() {
    if (!this.rendition) return;
    const cfi = this.location?.start?.cfi;
    this.rendition.destroy();
    this.contents.clear();
    this.rendition = this.book.renderTo(this.host, {
      width: '100%',
      height: '100%',
      flow: prefs.flow === 'scrolled' ? 'scrolled-doc' : 'paginated',
      spread: this._spreadMode(),
      minSpreadWidth: 820,
      allowScriptedContent: true,
      snap: false,
    });
    this.rendition.hooks.content.register((contents) => this._dressPage(contents));
    this.rendition.on('relocated', (loc) => this._onRelocated(loc));
    await this.rendition.display(cfi || undefined);
  }

  _watchResize() {
    if (typeof ResizeObserver === 'undefined') return;
    let timer = null;
    let lastW = this.host.clientWidth, lastH = this.host.clientHeight;
    this._ro = new ResizeObserver(() => {
      const w = this.host.clientWidth, h = this.host.clientHeight;
      if (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 2) return;
      lastW = w; lastH = h;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const cfi = this.location?.start?.cfi;
        try {
          this.rendition.resize(w, h);
          if (cfi) this.rendition.display(cfi);
        } catch { /* rendition torn down mid-resize */ }
      }, 180);
    });
    this._ro.observe(this.host);
  }

  /* ── Navigation ── */

  next() { return this.rendition?.next(); }
  prev() { return this.rendition?.prev(); }
  display(target) { return this.rendition?.display(target); }

  goToPercent(pct) {
    if (!this.book?.locations?.length()) return;
    const cfi = this.book.locations.cfiFromPercentage(Math.max(0, Math.min(1, pct)));
    if (cfi) this.rendition.display(cfi);
  }

  _onRelocated(loc) {
    this.location = loc;
    const cfi = loc?.start?.cfi;
    if (!cfi) return;

    let percent = 0;
    if (this.book.locations?.length()) {
      percent = this.book.locations.percentageFromCfi(cfi) || 0;
    } else if (loc.start.index != null && this.book.spine?.length) {
      percent = loc.start.index / this.book.spine.length;
    }

    const chapter = this._chapterFor(loc.start.href);
    db.saveState(this.record.id, { cfi, percent, chapter: chapter?.label?.trim() || '' });
    db.touchBook(this.record.id, { lastOpened: Date.now(), percent });

    this.emit('relocated', {
      cfi,
      percent,
      chapter: chapter?.label?.trim() || '',
      href: loc.start.href,
      page: loc.start.displayed?.page || 0,
      pages: loc.start.displayed?.total || 0,
      atStart: !!loc.atStart,
      atEnd: !!loc.atEnd,
    });
  }

  _chapterFor(href) {
    if (!href || !this.book?.navigation) return null;
    const base = href.split('#')[0];
    let best = null;
    const walk = (items) => {
      for (const it of items || []) {
        const ih = (it.href || '').split('#')[0];
        if (ih && (base.endsWith(ih) || ih.endsWith(base))) best = best || it;
        if (it.subitems?.length) walk(it.subitems);
      }
    };
    walk(this.book.navigation.toc);
    return best;
  }

  flatToc() {
    const out = [];
    const walk = (items, depth) => {
      for (const it of items || []) {
        out.push({ label: (it.label || '').trim() || 'Untitled', href: it.href, depth });
        if (it.subitems?.length) walk(it.subitems, Math.min(depth + 1, 2));
      }
    };
    walk(this.book?.navigation?.toc, 0);
    return out;
  }

  /* ── Search across the whole spine ── */

  async search(query, limit = 60) {
    const q = query.trim();
    if (q.length < 2 || !this.book) return [];
    const out = [];
    for (const item of this.book.spine.spineItems) {
      if (out.length >= limit) break;
      try {
        await item.load(this.book.load.bind(this.book));
        const hits = item.find(q) || [];
        for (const h of hits) {
          out.push({ cfi: h.cfi, excerpt: (h.excerpt || '').replace(/\s+/g, ' ').trim() });
          if (out.length >= limit) break;
        }
      } catch { /* a malformed section should not stop the hunt */ }
      finally { try { item.unload(); } catch { /* already unloaded */ } }
    }
    return out;
  }

  async currentExcerpt() {
    try {
      const range = await this.book.getRange(this.location.start.cfi);
      const text = (range?.startContainer?.textContent || '').replace(/\s+/g, ' ').trim();
      return text.slice(0, 150);
    } catch { return ''; }
  }

  destroy() {
    try { this._ro?.disconnect(); } catch { /* nothing observed */ }
    try { this.rendition?.destroy(); } catch { /* already gone */ }
    try { this.book?.destroy(); } catch { /* already gone */ }
    this.contents.clear();
    this.book = this.rendition = this.record = this.location = null;
  }
}
