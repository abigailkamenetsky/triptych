/*
 * bestiary.js
 *
 * The creatures are not drawn. They are lifted straight out of Hieronymus
 * Bosch, The Garden of Earthly Delights (c. 1490 to 1510), which is public
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
