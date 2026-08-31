/*
 * coach.js
 * A large print, one step at a time guide for fetching a book from a site the
 * app cannot reach into.
 *
 * The app cannot draw arrows on Anna's Archive itself. A page may not touch
 * another site's window, and no permission changes that. What it can do is
 * stand beside it: one instruction at a time, set very large, with a picture
 * of the screen she is looking at and an arrow on the thing to tap. On an iPad
 * this sits in Split View next to Safari and behaves like a live guide.
 *
 * Every step can also be read aloud, which for weak eyes is often worth more
 * than the picture.
 */

/* The position lives on the outer group and the animation on the inner one.
   A CSS transform overrides the transform attribute outright, so animating the
   positioned element itself parks every arrow in the top left corner. */
const arrow = (x, y, dir = 'right') => {
  const rot = { right: 0, down: 90, left: 180, up: 270 }[dir] || 0;
  return `<g transform="translate(${x} ${y}) rotate(${rot})">
    <g class="coach-arrow">
      <path d="M-34 0 H16" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>
      <path d="M4 -14 L20 0 L4 14 Z" fill="currentColor"/>
    </g>
  </g>`;
};

const frame = (inner, w = 300, h = 210) =>
  `<svg viewBox="0 0 ${w} ${h}" role="img" aria-hidden="true">
     <rect x="4" y="4" width="${w - 8}" height="${h - 8}" rx="10"
           fill="var(--diagram-bg)" stroke="var(--diagram-line)" stroke-width="2.5"/>
     ${inner}
   </svg>`;

const bar = (x, y, w, h, fill = 'var(--diagram-line)') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}" opacity=".45"/>`;

const chip = (x, y, w, h, label) =>
  `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6"
        fill="var(--diagram-hi)" stroke="var(--diagram-edge)" stroke-width="2.5"/>
     <text x="${x + w / 2}" y="${y + h / 2 + 6}" text-anchor="middle"
           font-size="17" font-weight="600" fill="var(--diagram-ink)">${label}</text></g>`;

export const STEPS = [
  {
    title: 'Tap the book you want',
    body: 'Safari has opened with your search already done. Every result is an EPUB, so any of them will work. Tap the title, not the picture.',
    say: 'Tap the title of the book you want. Any result will work.',
    art: frame(`
      ${bar(28, 26, 244, 12)}
      ${chip(28, 52, 210, 34, 'The book you want')}
      ${arrow(262, 69, 'left')}
      ${bar(28, 100, 190, 11)} ${bar(28, 120, 150, 11)}
      ${bar(28, 148, 200, 11)} ${bar(28, 168, 160, 11)}`),
  },
  {
    title: 'Scroll down to Download',
    body: 'Keep scrolling past the picture and the description. You are looking for a heading that says Download, about halfway down the page.',
    say: 'Scroll down the page until you see the word Download.',
    art: frame(`
      ${bar(28, 24, 120, 40, 'var(--diagram-line)')}
      ${bar(162, 26, 110, 11)} ${bar(162, 44, 90, 11)}
      ${bar(28, 78, 244, 11)} ${bar(28, 96, 210, 11)}
      ${chip(28, 124, 130, 34, 'Download')}
      ${arrow(150, 186, 'down')}`),
  },
  {
    title: 'Tap a Slow Partner Server',
    body: 'There will be three or four of them, numbered. They are the free ones. Any of them is fine. Tap the first.',
    say: 'Tap a link that says Slow Partner Server. There are usually three or four. Any one will do.',
    art: frame(`
      ${bar(28, 24, 130, 12)}
      ${chip(28, 48, 244, 32, 'Slow Partner Server #1')}
      ${arrow(150, 100, 'down')}
      ${bar(28, 118, 244, 26, 'var(--diagram-line)')}
      ${bar(28, 152, 244, 26, 'var(--diagram-line)')}`),
  },
  {
    title: 'Wait for the countdown',
    body: 'A number will count down, sometimes for a whole minute. This is normal and it cannot be hurried. Leave the page alone until it finishes.',
    say: 'A countdown will appear. Wait for it. It can take up to a minute. Do not close the page.',
    art: frame(`
      <circle cx="150" cy="92" r="46" fill="none" stroke="var(--diagram-line)" stroke-width="7" opacity=".4"/>
      <circle cx="150" cy="92" r="46" fill="none" stroke="var(--diagram-edge)" stroke-width="7"
              stroke-dasharray="200 90" stroke-linecap="round" transform="rotate(-90 150 92)"/>
      <text x="150" y="103" text-anchor="middle" font-size="34" font-weight="700"
            fill="var(--diagram-ink)">42</text>
      ${bar(90, 158, 120, 12)}`),
  },
  {
    title: 'Tap the download link',
    body: 'When the countdown finishes, a link appears where the number was. Tap it. Then Safari will ask what to do, and you tap Download.',
    say: 'When the countdown ends, tap the download link. Then tap Download when Safari asks.',
    art: frame(`
      ${chip(52, 40, 196, 34, 'Download now')}
      ${arrow(150, 94, 'down')}
      <rect x="40" y="116" width="220" height="66" rx="12"
            fill="var(--diagram-bg)" stroke="var(--diagram-line)" stroke-width="2.5"/>
      ${bar(56, 130, 130, 11)}
      ${chip(176, 144, 74, 28, 'Download')}`),
  },
  {
    title: 'Come straight back here',
    body: 'Switch back to Triptych. It will already be waiting to bring the book in. Tap the big button and choose the file at the top of the list.',
    say: 'Now switch back to Triptych. Tap the big button and choose the newest file.',
    art: frame(`
      ${bar(28, 26, 244, 12)}
      ${chip(40, 56, 220, 44, 'Choose the EPUB')}
      ${arrow(150, 120, 'down')}
      ${bar(48, 140, 204, 14)}
      ${bar(48, 162, 150, 14)}`),
  },
];

/* Reading a step aloud. Weak eyes are often better served by an ear. */
let voice = null;

export function canSpeak() {
  return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function speak(text) {
  if (!canSpeak()) return false;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.88;          // a little slower than default
    u.pitch = 1;
    if (!voice) {
      const all = speechSynthesis.getVoices();
      voice = all.find((v) => /en-GB|en-US/.test(v.lang) && /female|samantha|serena|kate/i.test(v.name))
           || all.find((v) => v.lang.startsWith('en'))
           || null;
    }
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

export function hush() {
  try { speechSynthesis?.cancel(); } catch { /* nothing speaking */ }
}
