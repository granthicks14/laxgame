/**
 * IS THE LACROSSE WORLD IN THE RIGHT ORDER?
 *
 * One rule, and the whole world rests on it: a typical team at one level must
 * be rated below a typical team at the level above it, all the way from Class D
 * to the PLL. Before the universal scale, `overall` was a standing WITHIN a
 * level, so Division III ran 38-95 while the PLL ran 83-96 — and a college side
 * could be rated 94 against a professional club's 88.
 *
 * This checks the whole hierarchy on both scales that matter — the team rating
 * a player reads on screen, and the actual attributes of the players generated
 * from it — and fails the run on any inversion.
 *
 *   npm run hierarchy
 */
import { LEVELS, LEVEL_ORDER, type Level } from '../data/levels';
import { teamsAtLevel } from '../data/world';
import { generateRoster } from '../data/players';

const problems: string[] = [];

interface Row {
  level: Level;
  teams: number;
  teamMin: number;
  teamMean: number;
  teamMax: number;
  /** Quartile means, weakest first — the "weak / average / strong / elite" bands. */
  quartiles: number[];
  playerMean: number;
  playerP90: number;
  bestPlayer: number;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
};

const rows: Row[] = LEVEL_ORDER.map((level) => {
  const teams = teamsAtLevel(level);
  const overalls = teams.map((t) => t.overall).sort((a, b) => a - b);
  const q = Math.max(1, Math.floor(overalls.length / 4));
  // Every player of every team at the level, so the sample is the real thing
  // rather than a handful of squads.
  const players = teams.flatMap((t) => generateRoster(t, `hierarchy:${level}`, level))
    .map((p) => p.overall);
  return {
    level,
    teams: teams.length,
    teamMin: overalls[0],
    teamMean: mean(overalls),
    teamMax: overalls[overalls.length - 1],
    quartiles: [0, 1, 2, 3].map((i) => mean(overalls.slice(i * q, i === 3 ? undefined : (i + 1) * q))),
    playerMean: mean(players),
    playerP90: pct(players, 0.9),
    bestPlayer: Math.max(...players),
  };
});

console.log('TEAM RATINGS — the number on the screen\n');
console.log('level     teams   band        mean    weak   avg  strong  elite   target');
for (const r of rows) {
  const t = LEVELS[r.level].overallBand;
  console.log(
    `${LEVELS[r.level].short.padEnd(9)} ${String(r.teams).padStart(4)}   `
    + `${String(r.teamMin).padStart(2)}-${String(r.teamMax).padEnd(6)} `
    + `${r.teamMean.toFixed(1).padStart(6)}  `
    + r.quartiles.map((v) => v.toFixed(0).padStart(5)).join(' ')
    + `   ${t.lo}-${t.hi}`,
  );
}

console.log('\nPLAYERS — what the ratings actually produce\n');
console.log('level     mean   p90   best');
for (const r of rows) {
  console.log(
    `${LEVELS[r.level].short.padEnd(9)} ${r.playerMean.toFixed(1).padStart(5)} `
    + `${String(r.playerP90).padStart(5)} ${String(r.bestPlayer).padStart(5)}`,
  );
}

/* ------------------------------------------------------------- the rule */

console.log('\nHIERARCHY\n');
for (let i = 1; i < rows.length; i++) {
  const below = rows[i - 1];
  const here = rows[i];
  const teamGap = here.teamMean - below.teamMean;
  const playerGap = here.playerMean - below.playerMean;
  const ok = teamGap > 0 && playerGap > 0;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${LEVELS[below.level].short} -> ${LEVELS[here.level].short}`
    + `   teams +${teamGap.toFixed(1)}   players +${playerGap.toFixed(1)}`,
  );
  if (teamGap <= 0) {
    problems.push(
      `average ${LEVELS[here.level].short} team (${here.teamMean.toFixed(1)}) is not above `
      + `average ${LEVELS[below.level].short} team (${below.teamMean.toFixed(1)})`,
    );
  }
  if (playerGap <= 0) {
    problems.push(
      `average ${LEVELS[here.level].short} player (${here.playerMean.toFixed(1)}) is not above `
      + `average ${LEVELS[below.level].short} player (${below.playerMean.toFixed(1)})`,
    );
  }
}

// Adjacent levels are ALLOWED to overlap, because reality does: the best
// semi-pro club would beat the worst professional one, and the best high school
// team in Texas is a competitive Division III side. What is never believable is
// a level reaching PAST its neighbour — a college team out-rating the average
// professional club, two rungs above it.
// High school is deliberately exempt from the reach rule. It is a different
// population — teenagers, not recruited athletes — and the band it was given
// (40-80) intentionally overlaps the bottom of college, so the best programme
// in Texas rates alongside a decent Division III side. High school is still
// held to the mean rule above and to the PLL ceiling below; narrow its
// `overallBand` in levels.ts if that overlap should be tighter.
const REACH_FROM = LEVEL_ORDER.indexOf('d3');
for (let i = REACH_FROM; i < rows.length; i++) {
  for (let j = i + 2; j < rows.length; j++) {
    if (rows[i].teamMax > rows[j].teamMean) {
      problems.push(
        `the best ${LEVELS[rows[i].level].short} team (${rows[i].teamMax}) out-rates the average `
        + `${LEVELS[rows[j].level].short} team (${rows[j].teamMean.toFixed(1)}), two levels above it`,
      );
    }
  }
}

// And nothing anywhere may out-rate the best professional there is.
const pll = rows[rows.length - 1];
for (const r of rows.slice(0, -1)) {
  if (r.teamMax > pll.teamMax) {
    problems.push(`a ${LEVELS[r.level].short} team (${r.teamMax}) out-rates every PLL club`);
  }
}

// Each level has to actually use the slice of the scale it was given.
for (const r of rows) {
  const band = LEVELS[r.level].overallBand;
  if (r.teamMin < band.lo - 1 || r.teamMax > band.hi + 1) {
    problems.push(
      `${LEVELS[r.level].short} teams run ${r.teamMin}-${r.teamMax}, outside their `
      + `${band.lo}-${band.hi} band`,
    );
  }
}

console.log();
if (problems.length) {
  console.log(`ERROR — the world is out of order:\n`);
  for (const p of problems) console.log(`  - ${p}`);
  console.log(`\n${problems.length} PROBLEMS`);
  (globalThis as { process?: { exit(n: number): void } }).process?.exit(1);
} else {
  console.log('THE HIERARCHY HOLDS AT EVERY LEVEL');
}
