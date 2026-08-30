/*
 * bestiary.js
 *
 * The creatures are not drawn. They are lifted straight out of Hieronymus
 * Bosch, The Garden of Earthly Triptych (c. 1490 to 1510), which is public
 * domain. art/cut.py does the lifting and writes assets/beasts/.
 *
 * Most arrive as feathered roundels, the way a manuscript would set a figure.
 * A few cut free of their ground cleanly and are used where a silhouette reads
 * better than a medallion.
 */

/* Roundels: a painted medallion with a soft edge. */
export const ROUNDELS = [
  'bagpipe', 'beetle', 'butterfly', 'cerberus', 'drum', 'duckRider', 'egg',
  'flower', 'flutist', 'goldfinch', 'greenPerson', 'iceSkater', 'key',
  'lobster', 'owl', 'prince', 'rabbit', 'raven', 'salamander', 'skater',
  'treeDisk', 'treeInside', 'winged',
];

/* Cut free of their ground, so they float. */
export const CUTOUTS = ['camel', 'porcupine', 'strawberry'];

export const BEASTS = [...ROUNDELS, ...CUTOUTS];

/* Painted bands, opaque, for friezes and columns. */
export const BANDS = [
  'pond', 'amphibia', 'crowd', 'instruments', 'fruit', 'strawberryMan', 'egg', 'treeFeet',
];

export const beastSrc = (name) => `assets/beasts/${name}.webp`;

/* The cut figures, for anywhere a creature has to stand on its own. */
export const DEMONS = [
  'camel', 'drummer', 'messenger', 'porcupine', 'prince',
  'rabbit', 'reader', 'skater', 'strawberry', 'wheelman',
];
export const bandSrc = (name) => `assets/bands/${name}.webp`;

export function beast(name, cls = '') {
  return `<img class="beast ${cls}" src="${beastSrc(name)}" alt="" ` +
         `loading="lazy" decoding="async" draggable="false">`;
}

/* Paint every [data-beast] placeholder in a subtree. */
export function conjure(root = document) {
  for (const el of root.querySelectorAll('[data-beast]')) {
    if (el.firstElementChild) continue;
    el.innerHTML = beast(el.dataset.beast, el.dataset.beastClass || '');
  }
}

/* A stable creature per book, so a given title always keeps its own beast. */
export function beastFor(seed, pool = BEASTS) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return pool[Math.abs(h) % pool.length];
}

/* Pigment pairs for generated covers, ground from the panels themselves. */
export const PLATE_PIGMENTS = [
  ['#7a2f1c', '#3a1710'], ['#2f5480', '#16283f'], ['#3f5136', '#1c2617'],
  ['#57334f', '#291726'], ['#9a6a1c', '#4a3009'], ['#a8341f', '#4a160c'],
  ['#4a5a68', '#212a33'], ['#6b4a2a', '#2f2011'],
];


/* ── Ink drawings ─────────────────────────────────────────────
   Alpha-only plates traced from the paintings by art/ink.py. The page uses
   them as CSS masks, so a creature is drawn in exactly the ink the text is
   set in and follows the theme without a second asset.
   ───────────────────────────────────────────────────────────── */

export const inkSrc = (name) => `assets/ink/${name}.webp`;

let inkIndex = null;

export async function loadInkIndex() {
  if (inkIndex) return inkIndex;
  try {
    inkIndex = await (await fetch('assets/ink/index.json')).json();
  } catch {
    inkIndex = {};
  }
  return inkIndex;
}

/* Give every [data-ink] its mask and its proportions. */
export async function draw(root = document) {
  const marks = [...root.querySelectorAll('[data-ink]')];
  if (!marks.length) return;
  const index = await loadInkIndex();
  for (const el of marks) {
    const name = el.dataset.ink;
    // Resolved against the document. A url() carried in a custom property
    // would resolve against the stylesheet instead and miss by one directory.
    const href = new URL(inkSrc(name), document.baseURI).href;
    el.style.maskImage = `url("${href}")`;
    el.style.webkitMaskImage = `url("${href}")`;
    const dims = index[name];
    if (dims) el.style.aspectRatio = `${dims[0]} / ${dims[1]}`;
  }
}


/* ── Demons ───────────────────────────────────────────────────
   Free-standing figures lifted out of The Temptation of Saint Anthony and the
   Garden by art/demons.py, in full colour, meant to stand on the page rather
   than sit in a medallion beside it.
   ───────────────────────────────────────────────────────────── */

export const demonSrc = (name) => `assets/demons/${name}.webp`;

let demonIndex = null;

export async function loadDemonIndex() {
  if (demonIndex) return demonIndex;
  try {
    demonIndex = await (await fetch('assets/demons/index.json')).json();
  } catch {
    demonIndex = {};
  }
  return demonIndex;
}

/* Fill every [data-demon] with its figure, sized to its own proportions. */
export async function summon(root = document) {
  const slots = [...root.querySelectorAll('[data-demon]')];
  if (!slots.length) return;
  const index = await loadDemonIndex();
  for (const el of slots) {
    if (el.firstElementChild) continue;
    const name = el.dataset.demon;
    const dims = index[name];
    if (dims) el.style.aspectRatio = `${dims[0]} / ${dims[1]}`;
    el.innerHTML = `<img class="beast demon" src="${demonSrc(name)}" alt="" ` +
                   `loading="lazy" decoding="async" draggable="false">`;
  }
}
