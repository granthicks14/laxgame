import { TEAMS } from '../data/teams';
import { generateRoster } from '../data/players';

const all: number[] = [];
for (const t of TEAMS) {
  for (const p of generateRoster(t, 'sample')) all.push(p.overall);
}
all.sort((a, b) => a - b);
const pct = (q: number) => all[Math.floor((all.length - 1) * q)];
console.log('n =', all.length);
console.log('p50', pct(0.5), 'p90', pct(0.9), 'p95', pct(0.95), 'p98', pct(0.98), 'p99', pct(0.99), 'max', all[all.length - 1]);
for (const t of [84, 86, 88, 90, 92]) {
  console.log(`>=${t}:`, all.filter((v) => v >= t).length, `(${((all.filter((v) => v >= t).length / all.length) * 100).toFixed(1)}%)`);
}
