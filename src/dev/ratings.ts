/**
 * WHERE THE RATINGS ACTUALLY LAND, AT EVERY LEVEL
 *
 * The universal scale gives each level a fixed slice of one 0-99 scale, so a
 * "star" cannot be an absolute number any more: 79 is the best player in a high
 * school district and a bench player in the PLL. This samples real generated
 * rosters at every level, reports the distribution, and checks that the star
 * marks land where they are supposed to — rare enough to mean something, common
 * enough to exist at all.
 *
 *   npm run ratings
 */
import { TEAMS } from '../data/teams';
import { generateRoster, starTier } from '../data/players';
import { LEVELS, type Level } from '../data/levels';
import { teamsAtLevel } from '../data/world';

const env = (globalThis as { process?: { exit(n: number): void } }).process;
const problems: string[] = [];
let checks = 0;
function check(name: string, ok: boolean, detail = ''): void {
  checks++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) problems.push(name);
}

const LEVEL_ORDER: Level[] = ['hs', 'd3', 'd2', 'd1', 'semipro', 'pll'];

/** Rosters as the game actually generates them for a level. */
function sample(level: Level): number[] {
  const teams = level === 'hs' ? TEAMS : teamsAtLevel(level);
  const out: number[] = [];
  for (const t of teams) {
    for (const p of generateRoster(t, `sample:${level}`, level)) out.push(p.overall);
  }
  return out.sort((a, b) => a - b);
}

console.log('PLAYER RATINGS BY LEVEL\n');
console.log('level      n     p50   p90   p95   p99   max    band      stars   elite');
const rates: Record<string, { star: number; elite: number; n: number }> = {};
for (const level of LEVEL_ORDER) {
  const all = sample(level);
  if (!all.length) continue;
  const pct = (q: number) => all[Math.floor((all.length - 1) * q)];
  const stars = all.filter((v) => starTier(v, level) >= 1).length;
  const elite = all.filter((v) => starTier(v, level) === 2).length;
  rates[level] = { star: stars / all.length, elite: elite / all.length, n: all.length };
  const b = LEVELS[level].overallBand;
  console.log(
    `${LEVELS[level].short.padEnd(9)} ${String(all.length).padStart(4)}  `
    + `${String(pct(0.5)).padStart(5)}${String(pct(0.9)).padStart(6)}${String(pct(0.95)).padStart(6)}`
    + `${String(pct(0.99)).padStart(6)}${String(all[all.length - 1]).padStart(6)}`
    + `   ${`${b.lo}-${b.hi}`.padStart(7)}`
    + `${`${(rates[level].star * 100).toFixed(1)}%`.padStart(8)}`
    + `${`${(rates[level].elite * 100).toFixed(1)}%`.padStart(8)}`,
  );
}

console.log();
for (const level of LEVEL_ORDER) {
  const r = rates[level];
  if (!r) continue;
  const name = LEVELS[level].short;
  // A star mark that never appears is a dead feature; one on every third player
  // is meaningless. Both failures are worth catching.
  check(`${name}: stars exist`, r.star > 0.01, `${(r.star * 100).toFixed(1)}% of ${r.n}`);
  check(`${name}: stars are rare`, r.star < 0.12, `${(r.star * 100).toFixed(1)}%`);
  check(`${name}: elite players are rarer still`, r.elite < r.star && r.elite > 0,
    `${(r.elite * 100).toFixed(1)}%`);
}

console.log();
if (problems.length) {
  console.log(`${problems.length} of ${checks} checks FAILED:`);
  for (const p of problems) console.log(`  - ${p}`);
  env?.exit(1);
} else {
  console.log(`${checks}/${checks} checks passed`);
}
