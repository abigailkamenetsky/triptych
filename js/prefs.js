/*
 * prefs.js
 * Small reactive settings store backed by localStorage.
 */

const KEY = 'delights.prefs.v1';

export const DEFAULTS = {
  theme: 'garden',
  font: 'garamond',
  fontScale: 108,       // percent
  lineHeight: 158,      // percent
  margin: 1,            // 0 narrow, 1 normal, 2 wide, 3 widest
  justify: true,
  flow: 'paginated',    // paginated | scrolled
  spread: true,         // two pages side by side when there is room
  brightness: 100,      // 100 is untouched
  warmth: 0,            // 0 is off, 100 is deep amber
  capitals: true,       // illuminated drop capitals
  marginalia: true,     // creatures in the page margins
  sort: 'recent',
};

let state = { ...DEFAULTS };
try {
  const raw = localStorage.getItem(KEY);
  if (raw) state = { ...DEFAULTS, ...JSON.parse(raw) };
} catch { /* a fresh vault is fine */ }

const listeners = new Set();

export const prefs = new Proxy(state, {
  set(target, key, value) {
    if (target[key] === value) return true;
    target[key] = value;
    try { localStorage.setItem(KEY, JSON.stringify(target)); } catch { /* private mode */ }
    for (const fn of listeners) fn(key, value);
    return true;
  },
});

export function onPrefChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const FONTS = {
  garamond: { label: 'Garamond', stack: "'EB Garamond', Georgia, serif" },
  cormorant: { label: 'Cormorant', stack: "'Cormorant Garamond', Georgia, serif" },
  iowan: { label: 'Iowan Old Style', stack: "'Iowan Old Style', 'Palatino', Georgia, serif" },
  system: { label: 'System', stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  original: { label: 'Publisher', stack: null },
};

export const MARGINS = ['Narrow', 'Normal', 'Wide', 'Widest'];
