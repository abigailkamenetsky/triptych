#!/usr/bin/env node
/*
 * tools/seed.mjs
 *
 * Manages the books that appear on her shelf the first time she opens the app.
 *
 *   node tools/seed.mjs list
 *   node tools/seed.mjs add ~/Downloads/some-book.epub [more.epub ...]
 *   node tools/seed.mjs remove some-book.epub
 *   node tools/seed.mjs only a.epub b.epub c.epub d.epub   # exactly these four
 *
 * Every command rewrites seed/seeds.json and reminds you to run build.mjs,
 * without which the service worker keeps serving the old list.
 */

import { readdirSync, copyFileSync, existsSync, writeFileSync, statSync, unlinkSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const ROOT = resolve(new URL('.', import.meta.url).pathname, '..');
const SEED = join(ROOT, 'seed');

const epubs = () => readdirSync(SEED).filter((f) => f.toLowerCase().endsWith('.epub')).sort();

function writeIndex() {
  const names = epubs();
  writeFileSync(join(SEED, 'seeds.json'), JSON.stringify(names, null, 2) + '\n');
  return names;
}

function show(names) {
  if (!names.length) {
    console.log('  the shelf starts empty');
    return;
  }
  let total = 0;
  for (const n of names) {
    const size = statSync(join(SEED, n)).size;
    total += size;
    console.log(`  ${(size / 1024 / 1024).toFixed(1).padStart(5)} MB  ${n}`);
  }
  console.log(`\n  ${names.length} books, ${(total / 1024 / 1024).toFixed(1)} MB downloaded on her first launch`);
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'add') {
  if (!args.length) { console.error('give me at least one .epub'); process.exit(1); }
  for (const a of args) {
    const src = resolve(a);
    if (!existsSync(src)) { console.error(`  missing: ${a}`); continue; }
    if (!src.toLowerCase().endsWith('.epub')) { console.error(`  not an epub: ${a}`); continue; }
    copyFileSync(src, join(SEED, basename(src)));
    console.log(`  added ${basename(src)}`);
  }
} else if (cmd === 'remove') {
  for (const a of args) {
    const p = join(SEED, basename(a));
    if (existsSync(p)) { unlinkSync(p); console.log(`  removed ${basename(a)}`); }
    else console.error(`  not on the shelf: ${a}`);
  }
} else if (cmd === 'only') {
  if (!args.length) { console.error('give me the files that should remain'); process.exit(1); }
  const keep = new Set(args.map((a) => basename(resolve(a))));
  for (const n of epubs()) {
    if (!keep.has(n)) { unlinkSync(join(SEED, n)); console.log(`  removed ${n}`); }
  }
  for (const a of args) {
    const src = resolve(a);
    if (existsSync(src) && !existsSync(join(SEED, basename(src)))) {
      copyFileSync(src, join(SEED, basename(src)));
      console.log(`  added ${basename(src)}`);
    }
  }
} else if (cmd && cmd !== 'list') {
  console.error(`unknown command: ${cmd}`);
  process.exit(1);
}

console.log('\nthe shelf on first launch:\n');
show(writeIndex());
if (cmd && cmd !== 'list') console.log('\nnow run:  node build.mjs');
