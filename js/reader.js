/*
 * reader.js
 * Wraps epub.js. Owns the rendition, the injected page styling, gesture
 * handling inside the book document, locations, search and progress.
 */

import { prefs, FONTS } from './prefs.js';
import * as db from './db.js';

const STYLE_ID = '__triptych_style';
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
  garden: { bg: '#f7efdc', fg: '#241a0d', link: '#a8341f', cap: '#a8341f', capShadow: '#b98c22', sel: 'rgba(185,140,34,.32)' },
  vellum: { bg: '#f2e3c2', fg: '#33240f', link: '#9c4a1c', cap: '#9c4a1c', capShadow: '#b98c22', sel: 'rgba(156,74,28,.24)' },
  dusk:   { bg: '#464036', fg: '#e9dfc9', link: '#cf8368', cap: '#cf8368', capShadow: '#8a7a52', sel: 'rgba(207,131,104,.3)' },
  hell:   { bg: '#1c1712', fg: '#ddcda9', link: '#d9611f', cap: '#d9611f', capShadow: '#7a3d13', sel: 'rgba(217,97,31,.32)' },
  limbo:  { bg: '#000000', fg: '#c3b494', link: '#b98c22', cap: '#b98c22', capShadow: '#4a3809', sel: 'rgba(185,140,34,.3)' },
};

const MARGIN_EM = [1.1, 2.0, 3.2, 4.6];

/* Wrap every text node the range touches in its own <mark>. A range that
   spans elements cannot be surrounded in one piece, so it is done piecewise. */
function wrapRange(range, cls, id) {
  const doc = range.startContainer.ownerDocument;
  const walker = doc.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) {
    if (range.intersectsNode(n) && n.nodeValue && n.nodeValue.trim()) nodes.push(n);
  }
  if (!nodes.length && range.startContainer.nodeType === 3) nodes.push(range.startContainer);

  for (const node of nodes) {
    let from = 0;
    let to = node.nodeValue.length;
    if (node === range.startContainer) from = range.startOffset;
    if (node === range.endContainer) to = range.endOffset;
    if (to <= from) continue;
    const piece = doc.createRange();
    try {
      piece.setStart(node, from);
      piece.setEnd(node, to);
      const mark = doc.createElement('mark');
      mark.className = cls;
      mark.setAttribute('data-hl', id);
      piece.surroundContents(mark);
    } catch {
      // A node that cannot be surrounded is skipped rather than losing the rest.
    }
  }
}

const cssEscape = (s) => String(s).replace(/["\\]/g, '\\$&');

/* Finding the paragraphs of a book.
 *
 * Standard Ebooks and most publisher EPUBs use <p>. Calibre conversions, which
 * is what almost anything from a shadow library will be, use <div> instead and
 * contain no <p> at all. Looking only for <p> means the drop capital never
 * appears and reading aloud finds nothing to say, silently, on exactly the
 * books she is most likely to bring in.
 *
 * So: take any block that holds text and contains no smaller block inside it.
 */
const FRONT_NAME = /cover|copyri|imprint|colophon|dedicat|epigraph|half.?title|titlepage|frontmatter|praise|acknowledg/i;
const FRONT_TEXT = /all rights reserved|no part of this|\bisbn\b|library of congress|catalogu?ing in publication|first (edition|printing)|printed in the/i;

const BLOCK_SEL = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, dd, div, section, article';

export function blockElements(doc) {
  if (!doc) return [];
  return [...doc.querySelectorAll(BLOCK_SEL)]
    .filter((el) => !el.querySelector(BLOCK_SEL))
    .filter((el) => (el.textContent || '').trim().length > 1);
}

export const HIGHLIGHT_FILL = {
  gold: '#c9a227',
  sage: '#6f8355',
  lapis: '#3a5a8c',
  rose: '#a8341f',
};

/* When a border plate is in use the page shows the plate's own paper, cut from
   exactly the box the page occupies. A flat colour cannot match a plate that
   is unevenly lit, and any difference shows as a rectangle around the text. */
let pageTone = null;
let pagePlate = null;
export function setPageTone(hex, plateUrl) {
  pageTone = hex || null;
  pagePlate = plateUrl || null;
}

/* Reading grounds, painted inside the book document so the page and its
   texture always move together and never show a seam against the shell. */
const PAGE_GROUND = {
  garden: 'page-light', vellum: 'page-mid', dusk: 'page-dark', hell: 'page-hell', limbo: null,
};



function pageCss() {
  const t = PAGE_THEMES[prefs.theme] || PAGE_THEMES.garden;
  const stack = FONTS[prefs.font]?.stack;
  const family = stack ? `font-family: ${stack} !important;` : '';
  const side = MARGIN_EM[prefs.margin] ?? 2.0;
  const align = prefs.justify ? 'justify' : 'left';

  const groundName = pageTone ? null : PAGE_GROUND[prefs.theme];
  const ground = groundName
    ? `background-image: url(${new URL(`assets/ground/${groundName}.webp`, location.href).href}) !important;
       background-size: 1400px 1400px !important;
       background-position: left top !important;
       background-repeat: repeat !important;
       background-attachment: local !important;`
    : '';

  return `
${fontFaceCss}
html { -webkit-text-size-adjust: none; text-size-adjust: none; }
html {
  background-color: ${pageTone || t.bg} !important;
  ${pagePlate ? `background-image: url("${pagePlate}") !important;
  background-size: 100% 100% !important;
  background-repeat: no-repeat !important;
  background-position: center !important;` : ''}
}
body {
  background-color: ${pagePlate ? 'transparent' : (pageTone || t.bg)} !important;
  ${pagePlate ? '' : ground}
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
  ${prefs.bold ? 'font-weight: 500 !important;' : ''}
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
  /* Publishers set chapter spacing for a printed page: this book puts 115px
     under its chapter number, which on a phone is half the screen before a
     word is read. Cap it at something a screen can afford. */
  margin-block: 0.85em 0.6em !important;
  padding-block: 0 !important;
}

/* Calibre inserts a spacer div at the head of every section. */
body > *:first-child { margin-block-start: 0 !important; }
a, a:visited { color: ${t.link} !important; text-decoration-thickness: 1px; text-underline-offset: 2px; }

/* Publishers style the opening words of a chapter with an inline span, often
   in their own sans face and a grey of their choosing. Left alone it sits in
   the middle of the page in a different typeface to everything around it.
   Take the family and the colour; leave small caps, spacing and weight, which
   are deliberate. */
span, em, i, b, strong, cite, small, sub, sup {
  font-family: inherit !important;
  color: inherit !important;
}

/* A full page plate has to fit the page. Height is what runs it off the
   bottom, and only width was ever constrained. */
img, svg, image, video {
  max-width: 100% !important;
  max-height: 88vh !important;
  height: auto !important;
  object-fit: contain;
}
::selection { background: ${t.sel}; }
hr { border: 0; height: 1px; background: ${t.fg}; opacity: .25; margin: 1.6em 0; }
blockquote { border-inline-start: 2px solid ${t.link}; padding-inline-start: .9em; opacity: .92; }
table { max-width: 100% !important; }
mark.dl-hl {
  color: inherit !important;
  background: transparent;
  padding: 0;
  border-radius: 2px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
mark.dl-hl-gold  { background: rgba(201,162,39,.36) !important; }
mark.dl-hl-sage  { background: rgba(111,131,85,.34) !important; }
mark.dl-hl-lapis { background: rgba(58,90,140,.30) !important; }
mark.dl-hl-rose  { background: rgba(168,52,31,.28) !important; }
.dl-speaking {
  background: rgba(201,162,39,.26) !important;
  box-shadow: -0.35em 0 0 rgba(201,162,39,.26), 0.35em 0 0 rgba(201,162,39,.26) !important;
  border-radius: 2px;
}
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
    this._highlights = [];
    this._reading = false;
    this._utterance = null;
  }

  on(name, fn) { this.handlers[name] = fn; return this; }
  emit(name, ...a) { this.handlers[name]?.(...a); }

  async open(record, data, startAt) {
    await loadFontFaces();
    this.record = record;
    this.book = window.ePub(data);
    await this.book.ready;
    this.words = record.words || 0;

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

    // A chapter picked from the book's page wins over where she left off,
    // and where she left off wins over the front matter.
    const from = startAt || state?.cfi || await this._startOfText();
    await this.rendition.display(from || undefined);

    if (!this.book.locations.length()) this._buildLocations();
    else if (!this.words) this._countWords();

    this._watchResize();
    return this.book;
  }

  /* Where a book actually begins.

     Opening a new book on its title page means tapping through a title, an
     imprint and sometimes a copyright notice before reaching a sentence. Every
     other reader skips that, and the books say where to skip to: EPUB 3 marks
     it in the nav landmarks, EPUB 2 in the OPF guide.

     Nothing is guessed away. This only runs when there is no saved place and
     no chapter was chosen, and the front matter is still there behind her. */
  async _startOfText() {
    const declared = (list, re) => (list || []).find((e) => re.test(e?.type || ''))?.href;

    const landmark = declared(this.book.navigation?.landmarks, /bodymatter/i);
    if (landmark) return landmark;

    const guide = declared(this.book.packaging?.guide, /^text$/i);
    if (guide) return guide;

    // Nothing declared, which is usual for a converted file. Measured on a
    // real trade EPUB, the opening sections run:
    //
    //     cover        0 words
    //     title        0 words
    //     copyright  250 words,  2 links
    //     contents   137 words, 63 links
    //     Part One     0 words
    //     prologue  8728 words,  0 links   <- the true start
    //
    // Length alone picks the copyright page, which is long without being
    // prose. Three signals separate them: a copyright notice carries wording
    // no chapter opens with, a table of contents is mostly links, and front
    // matter is named for what it is.
    const items = this.book.spine?.spineItems || [];
    for (const item of items.slice(0, 12)) {
      let words = 0, links = 0, head = '';
      try {
        await item.load(this.book.load.bind(this.book));
        const text = (item.document?.body?.textContent || '').trim();
        words = text ? text.split(/\s+/).length : 0;
        links = item.document?.querySelectorAll('a[href]').length || 0;
        head = text.slice(0, 400).toLowerCase();
      } catch {
        // A section that will not load is not the one to open on.
      } finally {
        try { item.unload(); } catch { /* already unloaded */ }
      }

      if (words < 120) continue;
      if (links > 12) continue;
      if (FRONT_TEXT.test(head)) continue;
      if (FRONT_NAME.test(item.href || '') || FRONT_NAME.test(item.idref || '')) continue;
      return item.href;
    }
    return null;
  }

  /* Roughly five and a half characters to the word, which is the usual figure
     for English prose and close enough for a reading estimate. */
  _countWords() {
    const n = this.book.locations?.length?.() || 0;
    if (!n) return;
    const words = Math.round((n * 1400) / 5.5);
    this.words = words;
    db.touchBook(this.record.id, { words });
  }

  /* Kindle's most recognisable cue. epub.js reports the page within the
     current section, so the estimate is the average chapter scaled by how much
     of this one is left. */
  minutesLeft(loc) {
    const words = this.words || this.record?.words || 0;
    const sections = this.book?.spine?.length || 0;
    const total = loc?.pages || 0;
    if (!words || !sections || total < 1) return '';

    const perChapter = words / sections;
    const leftFraction = Math.max(0, 1 - (loc.page || 1) / total);
    const mins = Math.round((perChapter * leftFraction) / 250);

    if (loc.atEnd) return 'End of the book';
    if (mins < 1) return 'Less than a minute left in chapter';
    if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'} left in chapter`;
    const h = Math.round(mins / 60);
    return `${h} ${h === 1 ? 'hour' : 'hours'} left in chapter`;
  }

  _spreadMode() {
    if (prefs.flow === 'scrolled') return 'none';
    return prefs.spread ? 'auto' : 'none';
  }

  /* Locations power the percentage and the scrubber. Generating them costs a
     few seconds on a long book, so the result is cached against the book.
     They also give the length of the book for nothing: each location covers a
     known span of characters, so the word count falls out of the count. */
  async _buildLocations() {
    try {
      await this.book.locations.generate(1400);
      await db.saveState(this.record.id, { locations: this.book.locations.save() });
      this._countWords();
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
    this._bindSelection(contents);
    // A section that loads later still has to show its highlights.
    for (const h of this._highlights || []) this._paint(h);
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
    const candidates = blockElements(doc);
    for (const p of candidates) {
      const text = (p.textContent || '').trim();
      // Skip stubs and anything that opens with punctuation or a numeral.
      if (text.length < 60 || !/^[A-Za-zÀ-ɏ]/.test(text)) continue;
      if (p.querySelector('img, svg')) continue;
      p.classList.add(CAP_CLASS);
      break;
    }
  }

  /* Selection. epub.js can turn a DOM range into a CFI, which is what makes a
     highlight survive a change of font size or a different device. */
  _bindSelection(contents) {
    const doc = contents.document;
    const win = contents.window || doc.defaultView;

    const report = () => {
      const sel = win.getSelection?.();
      if (!sel || sel.isCollapsed || !String(sel).trim()) { this.emit('unselect'); return; }
      let range;
      try { range = sel.getRangeAt(0); } catch { return; }
      const text = String(sel).replace(/\s+/g, ' ').trim();
      if (text.length < 2) return;

      let cfi = '';
      try { cfi = contents.cfiFromRange(range); } catch { return; }
      if (!cfi) return;

      // The rect is in the book's coordinates; move it into the app's.
      const r = range.getBoundingClientRect();
      const frame = contents.content?.ownerDocument?.defaultView?.frameElement
        || doc.defaultView?.frameElement;
      const off = frame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
      this.emit('select', {
        cfi,
        text,
        rect: { left: off.left + r.left, top: off.top + r.top, width: r.width, height: r.height },
      });
    };

    doc.addEventListener('selectionchange', () => setTimeout(report, 10));
    doc.addEventListener('mouseup', () => setTimeout(report, 10));
    doc.addEventListener('touchend', () => setTimeout(report, 180), { passive: true });
  }

  clearSelection() {
    for (const c of this.contents) {
      try { (c.window || c.document?.defaultView)?.getSelection()?.removeAllRanges(); } catch { /* gone */ }
    }
  }

  /* ── Reading aloud ──────────────────────────────────────────
     Paragraph by paragraph rather than page by page. Each block is brought on
     screen before it is spoken, so what she hears is always what is in front
     of her, and the page turns itself as the voice moves on.
     ─────────────────────────────────────────────────────────── */

  _blocks(contents) {
    return blockElements(contents?.document).map((el) => ({
      el,
      contents,
      text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
    }));
  }

  _currentBlocks() {
    const live = [...this.contents].filter((c) => c.document);
    for (const c of live) {
      const blocks = this._blocks(c);
      if (blocks.length) return blocks;
    }
    return [];
  }

  /* Where to begin: the first block at or after what is on screen. */
  _startIndex(blocks) {
    const doc = blocks[0]?.contents?.document;
    if (!doc) return 0;
    const view = doc.documentElement.clientWidth || 0;
    for (let i = 0; i < blocks.length; i++) {
      const r = blocks[i].el.getBoundingClientRect();
      if (r.width || r.height) {
        // In a paginated column, anything on this page starts at x >= 0.
        if (r.left >= -4 && (!view || r.left < view * 1.5)) return i;
      }
    }
    return 0;
  }

  /* iOS often reports no voices until shortly after the first call, and a
     voiceless engine fails every utterance instantly. */
  async _voicesReady() {
    if (!window.speechSynthesis) return false;
    if (speechSynthesis.getVoices().length) return true;
    return new Promise((resolve) => {
      const done = setTimeout(() => resolve(speechSynthesis.getVoices().length > 0), 1600);
      speechSynthesis.addEventListener('voiceschanged', () => {
        clearTimeout(done);
        resolve(true);
      }, { once: true });
    });
  }

  async readAloud({ rate = 0.95, onBlock, onEnd, onFail } = {}) {
    if (!window.speechSynthesis) return false;
    this.stopReading();
    await this._voicesReady();
    this._reading = true;
    let fails = 0;

    let blocks = this._currentBlocks();
    let i = this._startIndex(blocks);

    const clearMark = () => {
      for (const c of this.contents) {
        if (!c.document) continue;
        for (const el of c.document.querySelectorAll('.dl-speaking')) el.classList.remove('dl-speaking');
      }
    };

    const sayNext = async () => {
      if (!this._reading) return;

      if (i >= blocks.length) {
        // Out of text here. Keep turning until something has words in it: a
        // cover, a title page and a copyright page in a row are perfectly
        // normal, and stopping at the first empty one means a book opened at
        // the beginning never starts reading at all.
        clearMark();
        let advanced = false;
        for (let tries = 0; tries < 14 && this._reading; tries++) {
          const before = this.location?.start?.cfi;
          await this.next();
          await new Promise((r2) => setTimeout(r2, 550));
          if (this.location?.start?.cfi === before) break;   // the end
          blocks = this._currentBlocks();
          i = 0;
          if (blocks.length) { advanced = true; break; }
        }
        if (!advanced) {
          this._reading = false;
          onEnd?.();
          return;
        }
      }

      const block = blocks[i];
      i += 1;
      if (!block?.text) { sayNext(); return; }

      // Bring it on screen before speaking it.
      try {
        const cfi = block.contents.cfiFromNode(block.el);
        if (cfi && !this._onScreen(block.el)) await this.rendition.display(cfi);
      } catch { /* stay where we are */ }

      clearMark();
      block.el.classList.add('dl-speaking');
      onBlock?.(block.text);

      const u = new SpeechSynthesisUtterance(block.text);
      u.rate = rate;
      // Never continue synchronously from a handler. An engine with no voice
      // fails every utterance the instant it is spoken, and calling on from
      // inside onerror recurses until the stack gives out.
      u.onend = () => {
        fails = 0;
        if (this._reading) setTimeout(sayNext, 0);
      };
      u.onerror = () => {
        fails += 1;
        if (fails >= 3) {
          this._reading = false;
          this.stopReading();
          onFail?.();
          return;
        }
        if (this._reading) setTimeout(sayNext, 150);
      };
      this._utterance = u;
      speechSynthesis.speak(u);
    };

    sayNext();
    return true;
  }

  _onScreen(el) {
    const doc = el.ownerDocument;
    const w = doc.documentElement.clientWidth || 0;
    const r = el.getBoundingClientRect();
    return r.left >= -4 && r.left < (w || 1e9);
  }

  pauseReading() {
    try { speechSynthesis.pause(); } catch { /* nothing speaking */ }
  }

  resumeReading() {
    try { speechSynthesis.resume(); } catch { /* nothing paused */ }
  }

  stopReading() {
    this._reading = false;
    this._utterance = null;
    try { speechSynthesis.cancel(); } catch { /* nothing speaking */ }
    for (const c of this.contents) {
      if (!c.document) continue;
      for (const el of c.document.querySelectorAll('.dl-speaking')) el.classList.remove('dl-speaking');
    }
  }

  get isReading() { return !!this._reading; }

  /* ── Highlights ── */

  applyHighlights(list) {
    this._highlights = list || [];
    if (!this.rendition) return;
    for (const h of this._highlights) this._paint(h);
  }

  /* epub.js draws highlights as SVG rectangles over the page. It builds the
     group and the colour correctly and then computes no rectangles for the
     range, leaving an empty overlay. Wrapping the text itself is both simpler
     and better behaved: it reflows with the column, survives a font change,
     and needs no second coordinate system. */
  _paint(h) {
    for (const c of this.contents) {
      if (!c.document) { this.contents.delete(c); continue; }
      this._unwrap(c.document, h.cfi);
      let range;
      try { range = c.range(h.cfi); } catch { continue; }
      if (!range) continue;
      wrapRange(range, `dl-hl dl-hl-${h.colour || 'gold'}`, h.cfi);
    }
  }

  _unwrap(doc, cfi) {
    for (const m of doc.querySelectorAll(`mark[data-hl="${cssEscape(cfi)}"]`)) {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    }
  }

  addHighlight(h) {
    this._highlights = [...(this._highlights || []).filter((x) => x.cfi !== h.cfi), h];
    this._paint(h);
  }

  removeHighlight(cfi) {
    this._highlights = (this._highlights || []).filter((x) => x.cfi !== cfi);
    for (const c of this.contents) {
      if (c.document) this._unwrap(c.document, cfi);
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
          this.restyle();
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
    this.stopReading();
    try { this._ro?.disconnect(); } catch { /* nothing observed */ }
    try { this.rendition?.destroy(); } catch { /* already gone */ }
    try { this.book?.destroy(); } catch { /* already gone */ }
    this.contents.clear();
    this.book = this.rendition = this.record = this.location = null;
  }
}
