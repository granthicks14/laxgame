/**
 * EVERY SOUND THE GAME ASKS FOR HAS TO EXIST
 *
 * The audio engine takes a sound by name rather than by a union type, because
 * the alternative is a file that has to import every sport's sound list — or a
 * rename of every `audio.play` call in the game. The cost of that choice is that
 * a typo becomes silence instead of a compile error.
 *
 * This buys the compile error back. It reads every `audio.play('x')` in the
 * source, reads what the interface pack and each sport's pack actually define,
 * and fails if anything is asked for that nobody can play — or if a pack defines
 * a sound nothing ever plays, which is dead weight worth knowing about.
 *
 *   npm run sounds
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
});

const files = walk('src');
const problems = [];

/* ------------------------------------------------- what the game asks to play */

/** name -> the files that play it */
const played = new Map();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/audio\.play\(\s*'([a-zA-Z][\w]*)'/g)) {
    const list = played.get(m[1]) ?? [];
    list.push(f);
    played.set(m[1], list);
  }
}

/* ----------------------------------------------------- what the packs define */

/** Top-level keys of an object literal assigned to a SoundPack. */
function packKeys(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) return null;
  const open = src.indexOf('{', at);
  if (open < 0) return null;
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return null;
  const body = src.slice(open + 1, end);
  // Only depth-1 keys count: a recipe body contains braces of its own.
  const keys = [];
  let d = 0;
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (d === 0) {
      const k = trimmed.match(/^([a-zA-Z][\w]*)\s*:/);
      if (k) keys.push(k[1]);
    }
    for (const ch of line) {
      if (ch === '{' || ch === '(' || ch === '[') d++;
      else if (ch === '}' || ch === ')' || ch === ']') d--;
    }
  }
  return keys;
}

const ui = packKeys(readFileSync('src/audio/Audio.ts', 'utf8'), 'export const UI_SOUNDS');
if (!ui) problems.push('could not read UI_SOUNDS from src/audio/Audio.ts');

const packs = new Map();
if (ui) packs.set('interface', ui);
for (const f of files.filter((p) => /src\/sports\/[^/]+\/sounds\.ts$/.test(p))) {
  const src = readFileSync(f, 'utf8');
  const name = f.split('/')[2];
  const keys = packKeys(src, 'export const');
  if (!keys) problems.push(`could not read a sound pack from ${f}`);
  else packs.set(name, keys);
}

const defined = new Set([...packs.values()].flat());

/* ------------------------------------------------------------------ the check */

for (const [name, where] of [...played].sort()) {
  if (defined.has(name)) continue;
  problems.push(`nothing can play "${name}" (asked for in ${[...new Set(where)].join(', ')})`);
}

const unused = [...defined].filter((n) => !played.has(n)).sort();

console.log(`${files.length} source files, ${played.size} sounds played, ${defined.size} defined`);
for (const [pack, keys] of packs) {
  console.log(`  ${pack.padEnd(12)} ${keys.length.toString().padStart(2)}  ${keys.join(' ')}`);
}
if (unused.length) console.log(`\nDefined but never played: ${unused.join(', ')}`);

if (problems.length) {
  console.log(`\n${problems.length} PROBLEM${problems.length === 1 ? '' : 'S'}:`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('\nEvery sound the game plays has a recipe.');
