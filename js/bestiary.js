/*
 * bestiary.js
 * Hand-inked marginalia after Hieronymus Bosch.
 * Every creature is stroked in currentColor so it inherits the theme.
 */

const wrap = (viewBox, inner, opts = {}) => {
  const par = opts.stretch ? ' preserveAspectRatio="none"' : '';
  return `<svg viewBox="${viewBox}"${par} fill="none" stroke="currentColor"
    stroke-width="${opts.w || 2.1}" stroke-linecap="round" stroke-linejoin="round"
    vector-effect="non-scaling-stroke" aria-hidden="true" focusable="false">${inner}</svg>`;
};

/* ── The Tree-Man. Hollow eggshell body, trunk legs standing in boats,
      a disc on his head where the small revellers dance. ── */
const treeMan = wrap('0 0 200 250', `
  <g vector-effect="non-scaling-stroke">
    <!-- the disc, and what is happening on it -->
    <ellipse cx="100" cy="34" rx="63" ry="13"/>
    <path d="M37 34c0 6 28 10 63 10s63-4 63-10"/>
    <path d="M118 22c5-3 11-2 12 3 1 4-3 7-7 6"/>
    <path d="M126 25c6-1 10 2 10 6"/>
    <circle cx="82" cy="25" r="4"/><path d="M82 29v5"/>
    <circle cx="94" cy="23" r="3.4"/><path d="M94 26.4v7.6"/>
    <path d="M66 27c3-2 7-1 8 2"/>

    <!-- head, tilted out toward the viewer -->
    <path d="M79 47c-4 10-3 22 5 29 8 7 22 7 30 0 8-7 9-19 5-29"/>
    <circle cx="88" cy="63" r="2.4" fill="currentColor" stroke="none"/>
    <circle cx="110" cy="63" r="2.4" fill="currentColor" stroke="none"/>
    <path d="M99 66v7M92 78c4 3 11 3 15 0"/>
    <path d="M84 55c3-2 7-2 9 0M106 55c3-2 7-2 9 0"/>

    <!-- the cracked shell of a torso -->
    <path d="M99 83c-27 0-46 20-46 48 0 24 14 41 28 49"/>
    <path d="M99 83c27 0 46 20 46 48 0 24-14 41-28 49"/>
    <path d="M53 123c9 5 22 8 46 8s37-3 46-8"/>
    <!-- the opening, and the ladder going in -->
    <path d="M82 180c0-19 4-32 17-32s17 13 17 32"/>
    <path d="M87 176h24M88 165h22M90 154h18"/>
    <path d="M133 108c6 4 9 11 8 18"/>
    <path d="M62 105c-5 5-7 12-5 19"/>

    <!-- a branch pushing out through the shell, with fruit -->
    <path d="M145 118c11-5 20-14 24-25"/>
    <path d="M162 105c1-6 5-10 10-11"/>
    <circle cx="174" cy="90" r="5"/>
    <path d="M55 116c-11-3-19-11-22-21"/>
    <circle cx="30" cy="90" r="4.4"/>

    <!-- trunk legs, bent outward -->
    <path d="M78 178c-6 12-16 20-27 26-8 5-13 9-14 15"/>
    <path d="M92 184c-4 12-13 22-24 29-7 4-12 8-13 14"/>
    <path d="M120 178c6 12 16 20 27 26 8 5 13 9 14 15"/>
    <path d="M106 184c4 12 13 22 24 29 7 4 12 8 13 14"/>
    <path d="M48 205c4 3 9 4 13 2M144 205c-4 3-9 4-13 2"/>

    <!-- the two little boats they stand in -->
    <path d="M13 225c2 9 12 14 26 14s24-5 26-14z"/>
    <path d="M135 225c2 9 12 14 26 14s24-5 26-14z"/>
    <path d="M13 225h52M135 225h52"/>
  </g>`, { w: 2.15 });

/* ── The Prince of Hell, in profile. Beak, crown, one unblinking eye. ── */
const birdPrinceHead = wrap('0 0 40 40', `
  <path d="M12 30c-5-3-8-9-8-15C4 8 10 3 18 3s14 5 14 12"/>
  <path d="M32 15c4 1 6 4 6 6 0 3-3 5-7 5h-8"/>
  <path d="M31 26c-2 2-5 3-8 3"/>
  <circle cx="16" cy="13" r="2.2" fill="currentColor" stroke="none"/>
  <path d="M8 6c1-3 5-5 9-5M22 1c4 0 7 2 9 5"/>
  <path d="M10 4 8 0M20 3V0M30 4l2-4"/>
  <path d="M12 30c1 4 4 7 8 8"/>
`, { w: 2 });

/* ── A cracked egg on bird legs. Used for waiting. ── */
const egg = wrap('0 0 100 120', `
  <path d="M50 12c-19 0-33 22-33 44 0 20 14 33 33 33s33-13 33-33c0-22-14-44-33-44z"/>
  <path d="M22 46l9 6 8-7 9 7 9-7 8 7 9-6"/>
  <circle cx="39" cy="66" r="2.6" fill="currentColor" stroke="none"/>
  <circle cx="61" cy="66" r="2.6" fill="currentColor" stroke="none"/>
  <path d="M42 77c4 3 12 3 16 0"/>
  <path d="M39 89v13M61 89v13"/>
  <path d="M33 108h12M55 108h12M39 102v6M61 102v6"/>
  <path d="M30 30c4-6 10-9 16-9"/>
`, { w: 2.2 });

/* ── The funnel-hatted conjurer. He fetches things. ── */
const funnelMan = wrap('0 0 100 100', `
  <path d="M28 34 50 4l22 30z"/>
  <path d="M50 4V0"/>
  <path d="M31 34h38"/>
  <circle cx="50" cy="50" r="14"/>
  <circle cx="45" cy="48" r="2.1" fill="currentColor" stroke="none"/>
  <circle cx="56" cy="48" r="2.1" fill="currentColor" stroke="none"/>
  <path d="M44 57c4 3 9 3 13 0"/>
  <path d="M39 62c-9 4-15 13-15 24v12h52V86c0-11-6-20-15-24"/>
  <path d="M24 88c-6-2-10-7-10-13M76 88c6-2 10-7 10-13"/>
  <path d="M50 74v18"/>
`, { w: 2.15 });

/* ── The hurdy-gurdy demon. He crawls the length of the book. ── */
const hurdyGurdy = wrap('0 0 60 60', `
  <ellipse cx="28" cy="32" rx="15" ry="12"/>
  <path d="M13 30c-4-2-7-6-7-10 0-5 4-8 9-8"/>
  <circle cx="19" cy="14" r="7"/>
  <path d="M12 12 6 6M19 7V1"/>
  <circle cx="17" cy="13" r="1.7" fill="currentColor" stroke="none"/>
  <path d="M22 18c2 2 5 2 7 0"/>
  <path d="M38 26c6-3 12-1 14 4 2 5-2 10-8 10"/>
  <circle cx="45" cy="32" r="4"/>
  <path d="M45 32 52 27"/>
  <path d="M20 43v10M33 43v10"/>
  <path d="M15 54h9M29 54h9"/>
  <path d="M40 38c3 4 5 9 4 14"/>
`, { w: 2 });

/* ── Marginalia vines. They run the height of the page. ── */
const vineBody = (dir) => {
  const f = dir === 'l' ? 1 : -1;
  const x = (v) => (dir === 'l' ? v : 60 - v);
  return `
  <path d="M${x(30)} 0 C ${x(14)} 60 ${x(46)} 120 ${x(26)} 200 C ${x(10)} 270 ${x(44)} 320 ${x(30)} 400"/>
  <!-- leaves -->
  <path d="M${x(24)} 46 c ${f * -14} -6 ${f * -16} 8 ${f * -2} 12 c ${f * 8} 2 ${f * 14} -4 ${f * 2} -12z"/>
  <path d="M${x(40)} 108 c ${f * 14} -5 ${f * 15} 9 ${f * 1} 12 c ${f * -8} 2 ${f * -13} -5 ${f * -1} -12z"/>
  <path d="M${x(20)} 250 c ${f * -14} -6 ${f * -16} 8 ${f * -2} 12 c ${f * 8} 2 ${f * 14} -4 ${f * 2} -12z"/>
  <path d="M${x(38)} 340 c ${f * 13} -5 ${f * 14} 9 ${f * 1} 12 c ${f * -8} 2 ${f * -12} -5 ${f * -1} -12z"/>
  <!-- an owl keeping watch -->
  <g transform="translate(${x(18)} 150)">
    <path d="M0 0c-7 0-11 6-11 13s5 12 11 12 11-5 11-12S7 0 0 0z"/>
    <path d="M-7 6a4 4 0 0 0 8 0M1 6a4 4 0 0 0 8 0" transform="translate(-1 -1)"/>
    <circle cx="-4" cy="5" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="4" cy="5" r="1.5" fill="currentColor" stroke="none"/>
    <path d="M0 8l-2 3h4z" fill="currentColor" stroke="none"/>
    <path d="M-8 -1l-3-5M8 -1l3-5"/>
  </g>
  <!-- a fish that walks -->
  <g transform="translate(${x(28)} 292)">
    <path d="M-13 0c5-7 16-7 21 0-5 7-16 7-21 0z"/>
    <path d="M-13 0l-6-5v10z"/>
    <circle cx="4" cy="-1" r="1.3" fill="currentColor" stroke="none"/>
    <path d="M-4 6v5M3 6v5M-6 11h4M1 11h4"/>
  </g>
  <!-- the great strawberry -->
  <g transform="translate(${x(34)} 76)">
    <path d="M0 -6c-7 0-11 4-11 9S-6 14 0 14s11-6 11-11S7-6 0-6z"/>
    <path d="M-8 -6l-4-5M0 -6v-7M8 -6l4-5"/>
    <circle cx="-4" cy="3" r=".9" fill="currentColor" stroke="none"/>
    <circle cx="3" cy="1" r=".9" fill="currentColor" stroke="none"/>
    <circle cx="0" cy="7" r=".9" fill="currentColor" stroke="none"/>
  </g>`;
};

const vineLeft = wrap('0 0 60 400', vineBody('l'), { stretch: true, w: 1.6 });
const vineRight = wrap('0 0 60 400', vineBody('r'), { stretch: true, w: 1.6 });

/* ── Plate marks, stamped on covers that arrive without artwork. ── */
const owl = wrap('0 0 60 60', `
  <path d="M30 8C17 8 9 18 9 30s9 22 21 22 21-10 21-22S43 8 30 8z"/>
  <circle cx="21" cy="27" r="7"/><circle cx="39" cy="27" r="7"/>
  <circle cx="21" cy="27" r="2.6" fill="currentColor" stroke="none"/>
  <circle cx="39" cy="27" r="2.6" fill="currentColor" stroke="none"/>
  <path d="M30 33l-4 6h8z" fill="currentColor" stroke="none"/>
  <path d="M13 14l-5-9M47 14l5-9"/>
  <path d="M20 45c4 4 16 4 20 0"/>
`, { w: 2.2 });

const fish = wrap('0 0 90 50', `
  <path d="M18 25C28 9 60 9 72 25 60 41 28 41 18 25z"/>
  <path d="M18 25 4 13v24z"/>
  <circle cx="58" cy="21" r="2.4" fill="currentColor" stroke="none"/>
  <path d="M40 12c3 5 3 21 0 26"/>
  <path d="M32 36v8M50 36v8M27 44h9M45 44h9"/>
`, { w: 2.2 });

const strawberry = wrap('0 0 40 50', `
  <path d="M20 13c-9 0-14 6-14 13s6 17 14 17 14-9 14-17-5-13-14-13z"/>
  <path d="M9 12 3 5M20 12V3M31 12l6-7"/>
  <circle cx="14" cy="24" r="1.5" fill="currentColor" stroke="none"/>
  <circle cx="25" cy="21" r="1.5" fill="currentColor" stroke="none"/>
  <circle cx="20" cy="31" r="1.5" fill="currentColor" stroke="none"/>
  <circle cx="12" cy="33" r="1.5" fill="currentColor" stroke="none"/>
`, { w: 2.2 });

const beast = wrap('0 0 60 60', `
  <path d="M14 40c-6-4-9-11-9-18C5 11 15 4 27 4s22 8 22 19c0 6-2 11-6 15"/>
  <path d="M49 20c5 1 8 4 8 8s-4 7-9 7H36"/>
  <circle cx="22" cy="19" r="2.8" fill="currentColor" stroke="none"/>
  <path d="M11 8 7 1M27 4V0M43 8l4-7"/>
  <path d="M14 40c2 6 7 11 13 13M36 48c4-2 8-5 10-9"/>
  <path d="M20 53v5M32 55v5"/>
`, { w: 2.2 });

export const BESTIARY = {
  treeMan, birdPrinceHead, egg, funnelMan, hurdyGurdy,
  vineLeft, vineRight, owl, fish, strawberry, beast,
};

/* Plate marks cycle so a shelf of coverless books still looks hand-made. */
export const PLATE_MARKS = [owl, fish, strawberry, beast, birdPrinceHead];

/* Pigment pairs for generated covers, ground from the panels. */
export const PLATE_PIGMENTS = [
  ['#7a2f1c', '#3a1710'], ['#2f5480', '#16283f'], ['#3f5136', '#1c2617'],
  ['#57334f', '#291726'], ['#9a6a1c', '#4a3009'], ['#a8341f', '#4a160c'],
  ['#4a5a68', '#212a33'], ['#6b4a2a', '#2f2011'],
];

/* Paint every [data-bestiary] placeholder in a subtree. */
export function conjure(root = document) {
  for (const el of root.querySelectorAll('[data-bestiary]')) {
    const art = BESTIARY[el.dataset.bestiary];
    if (art && !el.firstElementChild) el.innerHTML = art;
  }
}
