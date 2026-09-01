/*
 * frames.js
 * Illuminated border art for the reading page.
 *
 * art/frames.py writes the plates and an index carrying, per frame, the tone
 * of its clear middle and how far in from each edge the border stops. The page
 * is then laid inside that clear middle and painted the sampled tone, so there
 * is no rectangle where the reader's page meets the art.
 */

const FALLBACK_INSET = { landscape: { x: 0.20, y: 0.20 }, portrait: { x: 0.20, y: 0.20 } };
const BUCKETS = ['tall', 'portrait', 'landscape', 'wide'];

let index = null;

export async function loadFrames() {
  if (index) return index;
  try {
    index = await (await fetch('assets/frames/index.json')).json();
  } catch {
    index = { landscape: [], portrait: [], inset: FALLBACK_INSET };
  }
  return index;
}

/* Pick the plate drawn closest to the shape of the screen. Stretching a plate
   into a shape it was not drawn for is what pulls the creatures about, so the
   less the app has to stretch, the better it looks. */
export function shapeFor(w = window.innerWidth, h = window.innerHeight) {
  const want = w / h;
  let best = null;
  let bestGap = Infinity;
  for (const name of BUCKETS) {
    const list = index?.[name];
    if (!list?.length) continue;
    const have = list[0].aspect || (name === 'landscape' ? 1.333 : 0.75);
    const gap = Math.abs(Math.log(want / have));      // ratios, not differences
    if (gap < bestGap) { bestGap = gap; best = name; }
  }
  return best || (w >= h ? 'landscape' : 'portrait');
}

/* A stable frame per book, so a given title always opens in the same border. */
export function frameFor(seed, shape) {
  const list = index?.[shape] || [];
  if (!list.length) return null;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return list[Math.abs(h) % list.length];
}

/* Where the border stops, as a fraction of the plate. This feeds
   border-image-slice, which needs the figure in the image's own coordinates
   rather than the screen's. */
export function sliceFor(shape) {
  return index?.inset?.[shape] || FALLBACK_INSET[shape] || FALLBACK_INSET.portrait;
}

/* How far the chosen plate has to be pulled to fill the screen. Anything past
   about a fifth starts to show on the figures. */
export function stretchOf(shape, w = window.innerWidth, h = window.innerHeight) {
  const list = index?.[shape];
  const have = list?.[0]?.aspect;
  if (!have) return 0;
  return Math.abs((w / h) / have - 1);
}

/* Kept for anything that still wants the on-screen inset in pixels. */
export function insetPx(shape, boxW, boxH) {
  const nominal = index?.inset?.[shape] || FALLBACK_INSET[shape];
  const ar = ASPECT[shape];
  const boxAR = boxW / boxH;

  let x, y;
  if (boxAR > ar) {
    // Scaled to the box width; the top and bottom are cropped.
    const drawnH = boxW / ar;
    x = nominal.x * boxW;
    y = nominal.y * drawnH - (drawnH - boxH) / 2;
  } else {
    // Scaled to the box height; the sides are cropped.
    const drawnW = boxH * ar;
    y = nominal.y * boxH;
    x = nominal.x * drawnW - (drawnW - boxW) / 2;
  }
  // A heavily cropped frame can put the border off screen entirely. Keep a
  // little breathing room either way.
  return {
    x: Math.round(Math.min(Math.max(x, 10), boxW * 0.28)),
    y: Math.round(Math.min(Math.max(y, 10), boxH * 0.26)),
  };
}

export const frameSrc = (name) =>
  new URL(`assets/frames/${name}`, document.baseURI).href;
