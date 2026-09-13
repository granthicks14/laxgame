/**
 * THE BASKETBALL WORLD, CHECKED.
 *
 * Two hundred and forty programmes across nine tiers is a lot of data to get
 * quietly wrong, and most of the ways it can be wrong are invisible on a screen:
 * a conference with seven teams in it schedules badly rather than loudly, two
 * clubs sharing an abbreviation only shows up in a box score months later, and a
 * tier whose rosters are no better than the one below it turns the whole climb
 * into a reskin.
 *
 * So the world is asserted rather than admired.
 *
 *   npm run hoops-world
 */
import {
  LEVELS, LEVEL_ORDER, rosterOptionsFor, type HoopsLevel,
} from '../sports/basketball/levels';
import {
  allWorldTeams, conferencesAt, rankedAtLevel, teamsAtLevel, teamsInConference,
} from '../sports/basketball/world';
import { buildRoster, starters, teamRatings } from '../sports/basketball/data';

const env = (globalThis as {
  process?: { exit(n: number): void; env?: Record<string, string | undefined> };
}).process;

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

/* --------------------------------------------------------------- the shape */

console.log('\nTHE PYRAMID\n');

const all = allWorldTeams();
console.log(`  ${all.length} programmes across ${LEVEL_ORDER.length} tiers`);
for (const level of LEVEL_ORDER) {
  const teams = teamsAtLevel(level);
  const confs = conferencesAt(level);
  console.log(`  ${LEVELS[level].short.padEnd(6)} ${String(teams.length).padStart(3)} teams`
    + `  ${confs.length} conferences  par ${LEVELS[level].par}±${LEVELS[level].spread}`
    + `  ${LEVELS[level].games} games`);
}

check('every tier has teams', LEVEL_ORDER.every((l) => teamsAtLevel(l).length >= 8));
check('every team id is unique', new Set(all.map((t) => t.id)).size === all.length);
check('every abbreviation is unique', new Set(all.map((t) => t.abbr)).size === all.length,
  (() => {
    const seen = new Set<string>();
    const dup = all.filter((t) => (seen.has(t.abbr) ? true : (seen.add(t.abbr), false)));
    return dup.slice(0, 4).map((t) => t.abbr).join(', ');
  })());
check('every team is in a conference that exists', all.every((t) =>
  conferencesAt(t.level).some((c) => c.id === t.conferenceId)));

const confSizes: number[] = [];
for (const level of LEVEL_ORDER) {
  for (const c of conferencesAt(level)) confSizes.push(teamsInConference(level, c.id).length);
}
check('every conference is big enough to play a season',
  confSizes.every((n) => n >= 6), `smallest ${Math.min(...confSizes)}`);
check('and they are all the same size inside a tier', LEVEL_ORDER.every((level) => {
  const sizes = conferencesAt(level).map((c) => teamsInConference(level, c.id).length);
  return new Set(sizes).size === 1;
}));

check('prestige spreads across each tier', LEVEL_ORDER.every((level) => {
  const ranked = rankedAtLevel(level);
  return ranked[0].standing - ranked[ranked.length - 1].standing >= 40;
}));

/* ------------------------------------------------------------ the hierarchy */

console.log('\nTHE HIERARCHY\n');

/** What a tier actually plays like: the starting fives it produces. */
function tierStrength(level: HoopsLevel): { mean: number; best: number; worst: number } {
  const overalls = teamsAtLevel(level).map((t) => {
    let sum = 0;
    const runs = 4;
    for (let s = 0; s < runs; s++) {
      const roster = buildRoster(t.id, 500 + s, rosterOptionsFor(level, t.par));
      sum += teamRatings(roster).overall;
    }
    return sum / runs;
  });
  return {
    mean: overalls.reduce((a, b) => a + b, 0) / overalls.length,
    best: Math.max(...overalls),
    worst: Math.min(...overalls),
  };
}

const strengths = LEVEL_ORDER.map((l) => ({ level: l, ...tierStrength(l) }));
for (const s of strengths) {
  console.log(`  ${LEVELS[s.level].short.padEnd(6)} worst ${s.worst.toFixed(1).padStart(5)}`
    + `   mean ${s.mean.toFixed(1).padStart(5)}   best ${s.best.toFixed(1).padStart(5)}`);
}

const rising = (pick: (s: typeof strengths[number]) => number): string | null => {
  for (let i = 1; i < strengths.length; i++) {
    if (pick(strengths[i]) <= pick(strengths[i - 1])) {
      return `${LEVELS[strengths[i].level].short} is not above ${LEVELS[strengths[i - 1].level].short}`;
    }
  }
  return null;
};

check('every tier is better than the one below it, on average',
  rising((s) => s.mean) === null, rising((s) => s.mean) ?? '');
check('the best team at a tier is below the best at the next',
  rising((s) => s.best) === null, rising((s) => s.best) ?? '');
check('and the worst is below the worst at the next',
  rising((s) => s.worst) === null, rising((s) => s.worst) ?? '');

const hs = strengths.find((s) => s.level === 'hs-big')!;
const pro = strengths.find((s) => s.level === 'pro')!;
check('no schoolboy team is as good as any professional one',
  hs.best < pro.worst, `best school ${hs.best.toFixed(1)} vs worst pro ${pro.worst.toFixed(1)}`);

/* ------------------------------------------------------------- the squads */

console.log('\nTHE SQUADS\n');

const squadProblems: string[] = [];
for (const level of LEVEL_ORDER) {
  const info = LEVELS[level];
  for (const t of teamsAtLevel(level).slice(0, 6)) {
    const roster = buildRoster(t.id, 1234, rosterOptionsFor(level, t.par));
    if (roster.length !== info.rosterSize) {
      squadProblems.push(`${t.abbr}: ${roster.length} players, wanted ${info.rosterSize}`);
    }
    const five = starters(roster);
    if (new Set(five.map((p) => p.id)).size !== 5) {
      squadProblems.push(`${t.abbr}: the starting five is not five different men`);
    }
    if (new Set(roster.map((p) => p.number)).size !== roster.length) {
      squadProblems.push(`${t.abbr}: two players wearing the same number`);
    }
    if (roster.some((p) => p.potential < p.overall)) {
      squadProblems.push(`${t.abbr}: a ceiling below where the player already is`);
    }
    if (info.ageSystem === 'class'
      && roster.some((p) => p.years < 1 || p.years > info.eligibility)) {
      squadProblems.push(`${t.abbr}: a class year outside the eligibility window`);
    }
    if (info.ageSystem === 'pro' && roster.some((p) => p.age < 19 || p.age > 38)) {
      squadProblems.push(`${t.abbr}: a professional outside a plausible age`);
    }
  }
}
check('every squad is the size, shape and age its tier says', squadProblems.length === 0,
  squadProblems.slice(0, 3).join('; '));

// Young players have to have somewhere to go, or development is decoration.
// Sampled over a dozen squads: one roster might have one senior in it, and one
// senior is not a claim about how a class system works.
const school = Array.from({ length: 12 }, (_, i) => buildRoster('hs-l-fai', 90 + i, {
  par: LEVELS['hs-big'].par, size: 12, shape: LEVELS['hs-big'].shape,
  ageSystem: 'class', eligibility: 4,
})).flat();
const freshmen = school.filter((p) => p.years === 1);
const seniors = school.filter((p) => p.years === 4);
check('freshmen are worse than seniors',
  !freshmen.length || !seniors.length
  || avg(freshmen.map((p) => p.overall)) < avg(seniors.map((p) => p.overall)),
  `${avg(freshmen.map((p) => p.overall)).toFixed(1)} vs ${avg(seniors.map((p) => p.overall)).toFixed(1)}`);
check('and they have further to grow',
  !freshmen.length || !seniors.length
  || avg(freshmen.map((p) => p.potential - p.overall))
   > avg(seniors.map((p) => p.potential - p.overall)),
  `+${avg(freshmen.map((p) => p.potential - p.overall)).toFixed(1)}`
  + ` vs +${avg(seniors.map((p) => p.potential - p.overall)).toFixed(1)}`);

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/* ------------------------------------------------------------------- done */

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log(`\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  env?.exit(1);
}
