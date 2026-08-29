/*
 * summon.js
 * The four step wizard that walks a book from a search box onto the shelf.
 * Nothing is fetched on the reader's behalf. Every source opens in Safari,
 * the download happens there, and the file comes back through the picker.
 */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const SOURCES = {
  standard: {
    name: 'Standard Ebooks',
    blurb: 'Free, legal, and the most beautiful typesetting anywhere. Public domain only.',
    tag: 'Free', tagClass: 'tag-free',
    mark: 'S', pigment: '#3f5136',
    url: (q) => `https://standardebooks.org/ebooks?query=${encodeURIComponent(q)}`,
    steps: [
      'The site opens in Safari with your search already run.',
      'Tap the cover of the book you want.',
      'Scroll to <b>Download</b> and tap the button that says <b>compatible epub</b>. That is the one that works everywhere.',
      'Safari asks what to do. Tap <b>Download</b>.',
      'Come back to Delights and tap <b>Bring it home</b>.',
    ],
  },
  gutenberg: {
    name: 'Project Gutenberg',
    blurb: 'Seventy thousand free books. Everything published before roughly 1930.',
    tag: 'Free', tagClass: 'tag-free',
    mark: 'G', pigment: '#2f5480',
    url: (q) => `https://www.gutenberg.org/ebooks/search/?query=${encodeURIComponent(q)}`,
    steps: [
      'The site opens in Safari with your search already run.',
      'Tap the title in the list of results.',
      'Find the download table and tap <b>EPUB3</b>. If you only see <b>EPUB</b>, that is fine too.',
      'Safari asks what to do. Tap <b>Download</b>.',
      'Come back to Delights and tap <b>Bring it home</b>.',
    ],
  },
  annas: {
    name: "Anna's Archive",
    blurb: 'The largest index. Modern books that the free libraries do not carry.',
    tag: 'Everything', tagClass: 'tag-big',
    mark: 'A', pigment: '#57334f',
    url: (q) => `https://annas-archive.org/search?q=${encodeURIComponent(q)}`,
    steps: [
      'The site opens in Safari with your search already run.',
      'In the filters, choose <b>EPUB</b> under file type. EPUB reflows to your screen. A PDF will be tiny and painful to read.',
      'Tap the title you want.',
      'Scroll down to the download list and tap a <b>Slow Partner Server</b>. Those are the free ones.',
      'A countdown may appear, sometimes up to a minute. That is normal. Leave the tab alone and let it finish.',
      'When Safari asks, tap <b>Download</b>. The file lands in <b>Files</b>, in your <b>Downloads</b> folder.',
      'Come back to Delights and tap <b>Bring it home</b>.',
    ],
    note: '<b>If the site will not load,</b> the address changes now and then. Try one of the mirrors below.',
    mirrors: [
      ['annas-archive.se', (q) => `https://annas-archive.se/search?q=${encodeURIComponent(q)}`],
      ['annas-archive.li', (q) => `https://annas-archive.li/search?q=${encodeURIComponent(q)}`],
    ],
  },
  openlib: {
    name: 'Open Library',
    blurb: 'Good for checking what editions exist. Borrowed copies stay locked in their own reader.',
    tag: 'Lookup', tagClass: 'tag-big',
    mark: 'O', pigment: '#6b4a2a',
    url: (q) => `https://openlibrary.org/search?q=${encodeURIComponent(q)}`,
    steps: [
      'The site opens in Safari with your search already run.',
      'Tap the book to see every edition and its publication year.',
      'If the button says <b>Borrow</b>, that copy is locked and cannot come to Delights. Note the exact title and author instead.',
      'If it offers a plain <b>EPUB</b> download, take it, then tap <b>Bring it home</b>.',
    ],
  },
};

export class Summon {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;          // { onPickFile, toast, done, stepper }
    this.step = 1;
    this.query = '';
    this.source = null;
  }

  reset() {
    this.step = 1;
    this.query = '';
    this.source = null;
    this.render();
  }

  go(step) {
    this.step = step;
    this.render();
    this.root.closest('.scroller')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  render() {
    this.ctx.stepper?.(this.step);
    const fn = [null, this.stepName, this.stepHunt, this.stepFetch, this.stepShelve][this.step];
    this.root.innerHTML = fn.call(this);
    this.bind();
  }

  /* ── 1. Name it ── */
  stepName() {
    return `
    <div class="panel">
      <h2>What are we hunting?</h2>
      <p>Type a title, an author, or both. The more you give, the better the odds.</p>
      <form class="panel-form" id="qForm">
        <input type="text" id="qInput" value="${esc(this.query)}"
          placeholder="The Master and Margarita" autocomplete="off"
          autocapitalize="words" enterkeyhint="search" aria-label="Title or author">
        <button type="submit" class="btn btn-primary btn-block">Begin the hunt</button>
      </form>
      <div class="aside-note">
        Already have the file? If the EPUB is sitting in Files or on your computer,
        skip straight to the end.
      </div>
      <div class="btn-stack">
        <button class="btn btn-ghost btn-block" data-go="4">I already have the file</button>
      </div>
    </div>`;
  }

  /* ── 2. Choose a source ── */
  stepHunt() {
    const cards = Object.entries(SOURCES).map(([key, s]) => `
      <a class="source" href="${s.url(this.query)}" target="_blank" rel="noopener noreferrer" data-source="${key}">
        <span class="source-mark" style="background:${s.pigment}">${s.mark}</span>
        <span class="source-text">
          <b>${esc(s.name)}</b>
          <small>${s.blurb}</small>
        </span>
        <span class="source-tag ${s.tagClass}">${esc(s.tag)}</span>
      </a>`).join('');

    return `
    <div class="panel">
      <h2>Where shall we look?</h2>
      <p>Searching for <b>${esc(this.query)}</b>. Tap a place and it opens in Safari with the search already run.</p>
      <div class="panel-form">${cards}</div>
      <div class="aside-note">
        <b>Try the free ones first.</b> Anything published before about 1930 is on
        Standard Ebooks or Gutenberg, free and legal, and the typesetting there is
        far better than a scanned copy.
      </div>
      <div class="btn-stack">
        <button class="linkish" data-go="1">Search for something else</button>
      </div>
    </div>`;
  }

  /* ── 3. Walkthrough for the chosen source ── */
  stepFetch() {
    const s = SOURCES[this.source] || SOURCES.annas;
    const steps = s.steps.map((t, i) => `<li><span class="num">${i + 1}</span><span>${t}</span></li>`).join('');
    const mirrors = s.mirrors ? `
      <div class="aside-note">
        ${s.note}
        <div class="btn-stack" style="margin-top:12px">
          ${s.mirrors.map(([label, u]) => `
            <a class="btn btn-ghost btn-block" href="${u(this.query)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>
          `).join('')}
        </div>
      </div>` : '';

    return `
    <div class="panel">
      <h2>Fetching from ${esc(s.name)}</h2>
      <p>Safari should have opened in another window. Follow along there, then come back.</p>
      <ol class="walk">${steps}</ol>
      ${mirrors}
      <div class="btn-stack">
        <a class="btn btn-ghost btn-block" href="${s.url(this.query)}" target="_blank" rel="noopener noreferrer">Open ${esc(s.name)} again</a>
        <button class="btn btn-primary btn-block" data-go="4">I have the file</button>
        <button class="linkish" data-go="2">Try somewhere else</button>
      </div>
    </div>`;
  }

  /* ── 4. Bring it onto the shelf ── */
  stepShelve() {
    return `
    <div class="panel">
      <h2>Bring it home</h2>
      <p>Tap below, then find the EPUB. On an iPhone or iPad it will be in <b>Files</b>, inside <b>Downloads</b>. You can pick several at once.</p>
      <div class="btn-stack">
        <button class="btn btn-primary btn-block" id="pickFile">Choose the EPUB</button>
      </div>

      <p class="group-title" style="margin-top:30px">The file is on my computer</p>
      <ol class="walk">
        <li><span class="num">1</span><span>On the computer, find the downloaded <b>.epub</b> file.</span></li>
        <li><span class="num">2</span><span>Right click it and choose <b>Share</b>, then <b>AirDrop</b>, then pick your iPad or iPhone.</span></li>
        <li><span class="num">3</span><span>On the iPad, tap <b>Accept</b>. It saves into <b>Files</b>, under <b>Downloads</b>.</span></li>
        <li><span class="num">4</span><span>Come back here and tap <b>Choose the EPUB</b> above.</span></li>
      </ol>
      <div class="aside-note">
        No AirDrop? Email the file to yourself, open the mail on the iPad, hold
        the attachment, and choose <b>Save to Files</b>. That works just as well.
      </div>

      <div class="btn-stack">
        <button class="linkish" data-go="1">Hunt for another book</button>
      </div>
    </div>`;
  }

  bind() {
    const r = this.root;

    r.querySelector('#qForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = r.querySelector('#qInput').value.trim();
      if (!v) { this.ctx.toast('Give me something to hunt for.'); return; }
      this.query = v;
      this.go(2);
    });

    for (const el of r.querySelectorAll('[data-go]')) {
      el.addEventListener('click', () => this.go(Number(el.dataset.go)));
    }

    for (const el of r.querySelectorAll('[data-source]')) {
      el.addEventListener('click', () => {
        this.source = el.dataset.source;
        // Let the anchor open Safari first, then move the wizard along.
        setTimeout(() => this.go(3), 260);
      });
    }

    r.querySelector('#pickFile')?.addEventListener('click', () => this.ctx.onPickFile());
  }
}
