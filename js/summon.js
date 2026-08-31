/*
 * summon.js
 * Getting a book onto the shelf.
 *
 * The one thing worth knowing about this file: a web page cannot fetch a book
 * from Anna's Archive on the reader's behalf. CORS forbids reading the
 * response and Cloudflare turns away anything that is not a browser, so the
 * search runs in Safari and the download happens there. What the app CAN do is
 * take every decision off her: run the search already filtered to EPUB, name
 * the exact link to tap, and then notice the moment she comes back and ask for
 * the file without her having to find her way here again.
 *
 * On iOS the final file pick cannot be removed. A home screen web app has no
 * file handler, no share target and no filesystem access, so a downloaded file
 * can only reach it through the picker. Two taps, not none.
 */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const q = (s) => encodeURIComponent(s);

const ANNAS_MIRRORS = ['annas-archive.gl', 'annas-archive.org', 'annas-archive.se', 'annas-archive.li'];

const SOURCES = {
  annas: {
    name: "Anna's Archive",
    blurb: 'Almost everything. Modern books the free libraries do not carry.',
    tag: 'Everything', tagClass: 'tag-big',
    mark: 'A', pigment: '#57334f',
    // ext=epub means every result is already the right format. No filter to find.
    url: (t) => `https://${ANNAS_MIRRORS[0]}/search?q=${q(t)}&ext=epub`,
    lede: 'Your search is already run and already filtered to EPUB, so everything on the page is the right kind of file.',
    steps: [
      'Tap the title you want from the results.',
      'Scroll down to <b>Download</b>.',
      'Tap any link that says <b>Slow Partner Server</b>. Those are the free ones. There are usually three or four.',
      'A countdown appears, sometimes up to a minute. That is normal. Leave it alone and let it finish, then tap the download link it gives you.',
      'Safari asks what to do. Tap <b>Download</b>.',
      'Come straight back here. Triptych will be waiting with the file picker open.',
    ],
    mirrorsNote: 'Anna’s Archive moves address now and then. If the page will not load, try one of these instead.',
  },
  standard: {
    name: 'Standard Ebooks',
    blurb: 'Free and legal, and the most beautiful typesetting anywhere. Public domain only.',
    tag: 'Free', tagClass: 'tag-free',
    mark: 'S', pigment: '#3f5136',
    url: (t) => `https://standardebooks.org/ebooks?query=${q(t)}`,
    lede: 'Everything here is free, legal, and typeset by hand. Worth checking first for anything older.',
    steps: [
      'Tap the cover of the book you want.',
      'Scroll to <b>Download</b> and tap <b>compatible epub</b>. That is the one that works everywhere.',
      'Safari asks what to do. Tap <b>Download</b>.',
      'Come straight back here.',
    ],
  },
  gutenberg: {
    name: 'Project Gutenberg',
    blurb: 'Seventy thousand free books. Almost everything published before about 1930.',
    tag: 'Free', tagClass: 'tag-free',
    mark: 'G', pigment: '#2f5480',
    url: (t) => `https://www.gutenberg.org/ebooks/search/?query=${q(t)}`,
    lede: 'Free and legal. The scans are plainer than Standard Ebooks, and the catalogue is far larger.',
    steps: [
      'Tap the title in the list of results.',
      'Find the download table and tap <b>EPUB3</b>. Plain <b>EPUB</b> is fine too.',
      'Safari asks what to do. Tap <b>Download</b>.',
      'Come straight back here.',
    ],
  },
  openlib: {
    name: 'Open Library',
    blurb: 'Good for checking which editions exist. Borrowed copies stay locked in their own reader.',
    tag: 'Lookup', tagClass: 'tag-big',
    mark: 'O', pigment: '#6b4a2a',
    url: (t) => `https://openlibrary.org/search?q=${q(t)}`,
    lede: 'Use this to find the exact title, author and year, then hunt for that.',
    steps: [
      'Tap the book to see every edition and its year.',
      'If the button says <b>Borrow</b>, that copy is locked and cannot come to Triptych. Note the exact title and author instead.',
      'If it offers a plain <b>EPUB</b>, take it and come back.',
    ],
  },
};

const LAST_KEY = 'triptych.lastHunt';

export class Summon {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;              // { onPickFile, toast, stepper }
    this.step = 1;
    this.title = '';
    this.source = null;
    this.away = false;           // she has gone out to a source
    this.returned = false;       // and come back

    // The whole point: notice the moment she comes back, and be ready.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (!this.away) return;
      this.away = false;
      this.returned = true;
      if (this.ctx.isActive?.()) this.go(4);
    });
  }

  reset() {
    this.step = 1;
    this.source = null;
    this.away = false;
    this.returned = false;
    try { this.title = localStorage.getItem(LAST_KEY) || ''; } catch { this.title = ''; }
    this.render();
  }

  go(step) {
    this.step = step;
    this.render();
    this.root.closest('.scroller')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  render() {
    this.ctx.stepper?.(this.step);
    const fn = [null, this.stepName, this.stepWhere, this.stepFetch, this.stepShelve][this.step];
    this.root.innerHTML = fn.call(this);
    this.bind();
    if (this.step === 2) this.runSearch();
  }

  /* ── 1. The title ── */
  stepName() {
    return `
    <div class="panel">
      <h2>What are we hunting?</h2>
      <p>Type the title. An author as well if you know it. That is the only thing you have to type.</p>
      <form class="panel-form" id="qForm">
        <input type="text" id="qInput" value="${esc(this.title)}"
          placeholder="The Master and Margarita" autocomplete="off"
          autocapitalize="words" enterkeyhint="search" aria-label="Title or author">
        <button type="submit" class="btn btn-primary btn-block">Begin the hunt</button>
      </form>
      <div class="btn-stack">
        <button class="linkish" data-go="4">I already have the file</button>
      </div>
    </div>`;
  }

  /* ── 2. What the free catalogue has, in the app ── */
  stepWhere() {
    const cards = Object.entries(SOURCES).filter(([k]) => k !== 'standard').map(([key, s]) => `
      <a class="source" href="${s.url(this.title)}" target="_blank" rel="noopener noreferrer" data-source="${key}">
        <span class="source-mark" style="background:${s.pigment}">${s.mark}</span>
        <span class="source-text"><b>${esc(s.name)}</b><small>${s.blurb}</small></span>
        <span class="source-tag ${s.tagClass}">${esc(s.tag)}</span>
      </a>`).join('');

    return `
    <div class="panel">
      <h2>Looking for <span class="hunted">${esc(this.title)}</span></h2>
      <div id="findResultsBox">
        <p class="finding"><span class="spin" aria-hidden="true"></span> Searching the free library…</p>
      </div>

      <p class="group-title" style="margin-top:30px">Not there? Look further afield</p>
      <p class="tiny-note">
        These open in Safari. They cannot hand the file back on their own, so you
        download it there and come straight back.
      </p>
      <div class="panel-form">${cards}</div>

      <div class="btn-stack">
        <button class="linkish" data-go="1">Hunt for something else</button>
      </div>
    </div>`;
  }

  async runSearch() {
    const box = this.root.querySelector('#findResultsBox');
    if (!box) return;
    try {
      const found = await this.ctx.search(this.title);
      if (!found.length) {
        box.innerHTML = `<p class="tiny-note">Nothing in the free library under that name.
          It may still be on Anna's Archive below.</p>`;
        return;
      }
      box.innerHTML = `
        <p class="tiny-note">${found.length} ${found.length === 1 ? 'book' : 'books'} the app can
        fetch and shelve for you, with nothing to download by hand.</p>
        <div class="finds">
          ${found.slice(0, 12).map((b, i) => `
            <div class="find" data-find="${i}">
              <span class="find-cover">${b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy">` : ''}</span>
              <span class="find-text">
                <b>${esc(b.title)}</b>
                <small>${esc(b.author)}</small>
                <em>${esc(b.summary.slice(0, 110))}${b.summary.length > 110 ? '…' : ''}</em>
              </span>
              <button class="btn btn-primary find-add" data-add="${i}">Add</button>
            </div>`).join('')}
        </div>`;
      this.found = found;
      for (const el of box.querySelectorAll('[data-add]')) {
        el.addEventListener('click', () => this.ctx.fetchBook(this.found[+el.dataset.add], el));
      }
    } catch (err) {
      box.innerHTML = `<p class="tiny-note">The free library could not be reached just now.
        The places below still work.</p>`;
      void err;
    }
  }

  /* ── 3. The walkthrough ── */
  stepFetch() {
    const s = SOURCES[this.source] || SOURCES.annas;
    const steps = s.steps.map((t, i) => `<li><span class="num">${i + 1}</span><span>${t}</span></li>`).join('');

    const mirrors = s.mirrorsNote ? `
      <div class="aside-note">
        ${s.mirrorsNote}
        <div class="mirror-row">
          ${ANNAS_MIRRORS.slice(1).map((m) => `
            <a class="mirror" href="https://${m}/search?q=${q(this.title)}&ext=epub"
               target="_blank" rel="noopener noreferrer" data-source="annas">${esc(m)}</a>
          `).join('')}
        </div>
      </div>` : '';

    return `
    <div class="panel">
      <h2>Fetching from ${esc(s.name)}</h2>
      <p>${s.lede}</p>
      <ol class="walk">${steps}</ol>
      ${mirrors}
      <div class="btn-stack">
        <a class="btn btn-primary btn-block" href="${s.url(this.title)}" target="_blank" rel="noopener noreferrer" data-source="${this.source || 'annas'}">
          Open ${esc(s.name)} again
        </a>
        <button class="btn btn-ghost btn-block" data-go="4">I have the file already</button>
        <button class="linkish" data-go="2">Try somewhere else</button>
      </div>
    </div>`;
  }

  /* ── 4. Onto the shelf ── */
  stepShelve() {
    const welcome = this.returned
      ? `<h2>Did you get it?</h2>
         <p>If the download finished, the file is the newest thing in <b>Files</b>. Tap below and it will be sitting at the top.</p>`
      : `<h2>Bring it home</h2>
         <p>Find the EPUB. On an iPhone or iPad it is in <b>Files</b>, inside <b>Downloads</b>. You can pick several at once.</p>`;

    return `
    <div class="panel">
      ${welcome}
      ${this.title ? `<p class="hunting-for">Hunting for <b>${esc(this.title)}</b></p>` : ''}
      <div class="btn-stack">
        <button class="btn btn-primary btn-block btn-big" id="pickFile">Choose the EPUB</button>
        <button class="linkish" data-go="3">Take me back to the download page</button>
      </div>

      <p class="group-title" style="margin-top:30px">If the file is on a computer</p>
      <ol class="walk">
        <li><span class="num">1</span><span>Find the downloaded <b>.epub</b> on the computer.</span></li>
        <li><span class="num">2</span><span>Right click it, choose <b>Share</b>, then <b>AirDrop</b>, then your iPad.</span></li>
        <li><span class="num">3</span><span>On the iPad tap <b>Accept</b>. It saves into <b>Files</b>, under <b>Downloads</b>.</span></li>
        <li><span class="num">4</span><span>Come back and tap <b>Choose the EPUB</b> above.</span></li>
      </ol>
      <div class="aside-note">
        No AirDrop? Email it to yourself, open the mail on the iPad, hold the
        attachment and choose <b>Save to Files</b>. That works just as well.
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
      this.title = v;
      try { localStorage.setItem(LAST_KEY, v); } catch { /* private mode */ }
      this.go(2);
    });

    for (const el of r.querySelectorAll('[data-go]')) {
      el.addEventListener('click', () => this.go(Number(el.dataset.go)));
    }

    // Any link out to a source arms the return watcher.
    for (const el of r.querySelectorAll('[data-source]')) {
      el.addEventListener('click', () => {
        this.source = el.dataset.source;
        this.away = true;
        if (this.step === 2) setTimeout(() => this.go(3), 260);
      });
    }

    r.querySelector('#pickFile')?.addEventListener('click', () => this.ctx.onPickFile());
  }
}
