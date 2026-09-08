/**
 * Scoring calibration. Simulates thousands of games at every level and prints
 * what the model actually produces, so the constants in league/simulate.ts can
 * be set from measurements rather than guesses.
 *
 *   npm run scoring
 *   GAMES=4000 npm run scoring
 *   npm run scoring -- --matchups     # style, goalie and mismatch cases
 */
import { Rng } from '../core/rng';
import { simulateMatch, simulationBreakdown, type SimResult, type SimWeather } from '../league/simulate';
import { LEVEL_ORDER, LEVELS, type Level } from '../data/levels';
import { teamsAtLevel, teamsInConference } from '../data/world';
import { GAME_LENGTHS } from '../data/constants';
import type { TeamRatings } from '../data/teams';
import type { Tactics } from '../data/tactics';

const env = (globalThis as { process?: { env?: Record<string, string | undefined>; argv?: string[] } }).process;
const GAMES = Number(env?.env?.GAMES ?? 1500);
const ARGS = env?.argv ?? [];
const REG = GAME_LENGTHS.long.quarterSeconds / GAME_LENGTHS.short.quarterSeconds;

const mean = (v: number[]) => v.reduce((n, x) => n + x, 0) / Math.max(1, v.length);
const sd = (v: number[]) => {
  const m = mean(v);
  return Math.sqrt(mean(v.map((x) => (x - m) ** 2)));
};
const pct = (n: number, d: number) => `${((n / Math.max(1, d)) * 100).toFixed(1)}%`;

/* ------------------------------------------------------- level calibration */

interface Sample {
  goals: number[];
  totals: number[];
  shots: number[];
  sog: number[];
  saves: number[];
  possessions: number[];
  margins: number[];
  overtime: number;
  blowouts: number;
  routs: number;
  onePointGames: number;
  games: number;
}

function empty(): Sample {
  return {
    goals: [], totals: [], shots: [], sog: [], saves: [], possessions: [],
    margins: [], overtime: 0, blowouts: 0, routs: 0, onePointGames: 0, games: 0,
  };
}

function record(s: Sample, r: SimResult): void {
  s.games++;
  s.goals.push(r.homeScore, r.awayScore);
  s.totals.push(r.homeScore + r.awayScore);
  s.shots.push(r.home.shots, r.away.shots);
  s.sog.push(r.home.shotsOnGoal, r.away.shotsOnGoal);
  s.saves.push(r.home.saves, r.away.saves);
  s.possessions.push(r.home.possessions, r.away.possessions);
  const margin = Math.abs(r.homeScore - r.awayScore);
  s.margins.push(margin);
  if (r.overtime) s.overtime++;
  if (margin >= 8) s.blowouts++;
  if (margin >= 15) s.routs++;
  if (margin <= 1) s.onePointGames++;
}

/**
 * Two samples per level, because they answer different questions. A season is
 * mostly CONFERENCE games between teams of roughly comparable strength; the
 * whole-level sample includes every possible mismatch and is what a
 * non-conference schedule can throw up.
 */
function sample(level: Level, conferenceOnly: boolean): Sample {
  const s = empty();
  const rng = new Rng(`cal:${level}:${conferenceOnly}`);
  const teams = teamsAtLevel(level);
  const groups = conferenceOnly
    ? [...new Set(teams.map((t) => t.conference))].map((c) => teamsInConference(c))
    : [teams];
  for (let i = 0; i < GAMES; i++) {
    const g = groups[rng.int(0, groups.length - 1)];
    if (g.length < 2) continue;
    const a = g[rng.int(0, g.length - 1)];
    const b = g[rng.int(0, g.length - 1)];
    if (a.id === b.id) continue;
    record(s, simulateMatch(a, b, `cal:${level}:${conferenceOnly}:${i}`, {
      level, lengthScale: REG, homeAdvantage: true,
    }));
  }
  return s;
}

console.log(`SCORING CALIBRATION — ${GAMES} games per level, at Long quarters (regulation)`);
console.log('Conference games: what a season is mostly made of.\n');
console.log('level     goals/tm   total    sd    shots  sh%    sog%   sv%    poss   OT    blowout  1-goal');

const perLevel = new Map<Level, Sample>();
for (const level of LEVEL_ORDER) {
  const s = sample(level, true);
  perLevel.set(level, s);

  const goals = mean(s.goals);
  const shots = mean(s.shots);
  const sog = mean(s.sog);
  const saves = mean(s.saves);
  console.log(
    `${LEVELS[level].short.padEnd(8)}  ${goals.toFixed(1).padStart(5)}    `
    + `${mean(s.totals).toFixed(1).padStart(5)}  ${sd(s.totals).toFixed(1).padStart(4)}  `
    + `${shots.toFixed(1).padStart(5)}  ${pct(goals, shots).padStart(5)}  ${pct(sog, shots).padStart(5)}  `
    + `${pct(saves, saves + goals).padStart(5)}  ${mean(s.possessions).toFixed(0).padStart(4)}   `
    + `${pct(s.overtime, s.games).padStart(5)}  ${pct(s.blowouts, s.games).padStart(6)}   ${pct(s.onePointGames, s.games)}`,
  );
}

console.log('\nAny opponent at the level, including the mismatches a non-conference schedule finds:');
for (const level of LEVEL_ORDER) {
  const s = sample(level, false);
  console.log(
    `  ${LEVELS[level].short.padEnd(8)} ${mean(s.goals).toFixed(1)} goals a team, `
    + `${pct(s.blowouts, s.games)} by eight or more, ${pct(s.routs, s.games)} by fifteen or more, `
    + `${pct(s.onePointGames, s.games)} by one`,
  );
}

/* ------------------------------------------------------- box consistency */

console.log('\nBOX SCORE CONSISTENCY');
{
  let bad = 0;
  let checked = 0;
  for (const level of LEVEL_ORDER) {
    const teams = teamsAtLevel(level);
    for (let i = 0; i < 400; i++) {
      const a = teams[i % teams.length];
      const b = teams[(i * 7 + 3) % teams.length];
      if (a.id === b.id) continue;
      const r = simulateMatch(a, b, `box:${level}:${i}`, { level, lengthScale: REG });
      checked++;
      const ok = r.home.goals === r.homeScore
        && r.away.goals === r.awayScore
        && r.home.saves === Math.max(0, r.away.shotsOnGoal - r.awayScore)
        && r.away.saves === Math.max(0, r.home.shotsOnGoal - r.homeScore)
        && r.home.shotsOnGoal <= r.home.shots
        && r.away.shotsOnGoal <= r.away.shots
        && r.homeScore <= r.home.shotsOnGoal
        && r.awayScore <= r.away.shotsOnGoal
        && r.home.faceoffWins + r.away.faceoffWins === r.home.faceoffTakes
        && r.home.faceoffTakes === r.homeScore + r.awayScore + 4
        && r.home.clears <= r.home.clearAttempts
        && r.homeScore !== r.awayScore;
      if (!ok) bad++;
    }
  }
  console.log(`  ${checked - bad}/${checked} box scores agree with their scoreline`);
}

/* -------------------------------------------------------------- matchups */

const T = (o: Partial<TeamRatings>): TeamRatings => ({
  overall: 75, offense: 75, defense: 75, goalie: 75, attack: 75,
  midfield: 75, faceoff: 75, speed: 75, chemistry: 75, ...o,
});

function series(
  label: string, home: TeamRatings, away: TeamRatings, level: Level,
  opts: { homeTactics?: Tactics; awayTactics?: Tactics; weather?: SimWeather } = {},
): void {
  const s = empty();
  const lines: string[] = [];
  for (let i = 0; i < 400; i++) {
    const r = simulateMatch(home, away, `m:${label}:${i}`, {
      level, lengthScale: REG, homeAdvantage: true, ...opts,
    });
    record(s, r);
    if (i < 5) lines.push(`${r.homeScore}-${r.awayScore}${r.overtime ? ' OT' : ''}`);
  }
  const h = s.goals.filter((_, i) => i % 2 === 0);
  const a = s.goals.filter((_, i) => i % 2 === 1);
  console.log(
    `  ${label.padEnd(34)} ${mean(h).toFixed(1)}-${mean(a).toFixed(1)}  `
    + `(sd ${sd(s.totals).toFixed(1)})  samples: ${lines.join(', ')}`,
  );
}

if (ARGS.includes('--matchups') || ARGS.includes('--all') || true) {
  const par = 86; // middle of Division I
  console.log('\nMATCHUPS — Division I, average of 400 games each');
  series('even teams', T({ overall: par, offense: par, defense: par, goalie: par, attack: par, midfield: par, faceoff: par }), T({ overall: par, offense: par, defense: par, goalie: par, attack: par, midfield: par, faceoff: par }), 'd1');
  series('elite offense vs weak defense',
    T({ offense: 97, attack: 97, midfield: 95, defense: 84, goalie: 84 }),
    T({ defense: 70, goalie: 68, offense: 74, attack: 74, midfield: 74 }), 'd1');
  series('two elite defenses',
    T({ defense: 97, goalie: 97, offense: 84, attack: 84 }),
    T({ defense: 96, goalie: 96, offense: 84, attack: 84 }), 'd1');
  series('elite goalie vs weak goalie',
    T({ goalie: 98, defense: 86, offense: 86, attack: 86 }),
    T({ goalie: 70, defense: 86, offense: 86, attack: 86 }), 'd1');
  series('extreme mismatch',
    T({ overall: 99, offense: 99, attack: 99, midfield: 99, defense: 97, goalie: 97, faceoff: 97 }),
    T({ overall: 62, offense: 62, attack: 62, midfield: 62, defense: 62, goalie: 60, faceoff: 60 }), 'd1');
  series('fast break vs pack it in', T({}), T({}), 'd1',
    { homeTactics: { offense: 'fast', defense: 'balanced' }, awayTactics: { offense: 'possession', defense: 'conservative' } });
  series('possession vs possession', T({}), T({}), 'd1',
    { homeTactics: { offense: 'possession', defense: 'conservative' }, awayTactics: { offense: 'possession', defense: 'conservative' } });
  series('heavy rain and wind', T({}), T({}), 'd1',
    { weather: { rain: 1, wind: 0.8, label: 'Heavy rain' } });
  series('perfect conditions', T({}), T({}), 'd1',
    { weather: { rain: 0, wind: 0, label: 'Clear' } });

  console.log('\nGOALIE SENSITIVITY — identical teams, only the keeper changes (D-I)');
  for (const g of [65, 74, 82, 90, 99]) {
    const s = empty();
    for (let i = 0; i < 500; i++) {
      s.games++;
      const r = simulateMatch(T({}), T({ goalie: g }), `g:${g}:${i}`, { level: 'd1', lengthScale: REG });
      s.goals.push(r.homeScore);
    }
    console.log(`  keeper ${String(g).padStart(2)}:  concedes ${mean(s.goals).toFixed(1)} a game`);
  }

  console.log('\nHIGH SCHOOL SPREAD — a strong programme against a weak one');
  series('district champion vs bottom club',
    T({ overall: 90, offense: 90, attack: 90, midfield: 88, defense: 86, goalie: 86, faceoff: 86 }),
    T({ overall: 42, offense: 42, attack: 42, midfield: 44, defense: 44, goalie: 40, faceoff: 44 }), 'hs');

  console.log('\nA SINGLE GAME, BROKEN DOWN (D-I)');
  const one = simulateMatch(
    T({ offense: 92, attack: 93, midfield: 90, defense: 84, goalie: 88, faceoff: 90 }),
    T({ offense: 86, attack: 85, midfield: 87, defense: 91, goalie: 93, faceoff: 82 }),
    'debug:1', { level: 'd1', lengthScale: REG, homeAdvantage: true },
  );
  for (const l of simulationBreakdown(one)) console.log(`  ${l}`);
}

/* ------------------------------------------------- shorter game settings */

console.log('\nSHORTER QUARTERS — the same model, scaled to the length actually played');
for (const key of ['short', 'standard', 'long'] as const) {
  const scale = GAME_LENGTHS[key].quarterSeconds / GAME_LENGTHS.short.quarterSeconds;
  const s = empty();
  const teams = teamsAtLevel('d1');
  for (let i = 0; i < 600; i++) {
    const a = teams[i % teams.length];
    const b = teams[(i * 5 + 11) % teams.length];
    if (a.id === b.id) continue;
    record(s, simulateMatch(a, b, `len:${key}:${i}`, { level: 'd1', lengthScale: scale }));
  }
  console.log(`  ${GAME_LENGTHS[key].label.padEnd(9)} ${GAME_LENGTHS[key].blurb.padEnd(24)} `
    + `${mean(s.goals).toFixed(1)} goals a team, ${mean(s.totals).toFixed(1)} total`);
}
