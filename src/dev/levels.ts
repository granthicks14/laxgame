/**
 * Cross-level match balance. Runs the REAL match engine at every tier and
 * reports what a game actually looks like there, because a shooting and goalie
 * model tuned for high school players can quietly fall apart when everybody on
 * the field is a 95.
 *
 *   npm run levels
 */
import { Match } from '../match/Match';
import { makeMatchConfig } from '../league/matchSetup';
import { LEVEL_ORDER, LEVELS, difficultyFor, type Level } from '../data/levels';
import { teamsAtLevel } from '../data/world';
import type { GameTeam, TeamData } from '../data/teams';

const DT = 1 / 60;

function run(home: GameTeam, away: GameTeam, level: Level, seed: number) {
  const cfg = makeMatchConfig({
    homeTeam: home as TeamData,
    awayTeam: away as TeamData,
    humanSide: null,
    difficulty: difficultyFor(level, 'varsity'),
    gameLength: 'short',
    seed,
    level,
  });
  const m = new Match(cfg);
  let guard = 0;
  while (!m.isFinal() && guard++ < 60 * 60 * 30) m.update(DT);
  return m;
}

const GAMES = Number((globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env?.GAMES ?? 12);

console.log('level     score      shots/team  sh%    save%   FO   possessions');
for (const level of LEVEL_ORDER) {
  const teams = teamsAtLevel(level);
  // Middle of the table against middle of the table: the typical game.
  const sorted = [...teams].sort((a, b) => b.overall - a.overall);
  const mid = sorted.slice(Math.floor(sorted.length * 0.3), Math.floor(sorted.length * 0.7));
  const pool = mid.length >= 2 ? mid : sorted;

  let goals = 0; let shots = 0; let sog = 0; let saves = 0; let fo = 0; let foTot = 0;
  for (let i = 0; i < GAMES; i++) {
    const home = pool[i % pool.length];
    const away = pool[(i + 1 + Math.floor(pool.length / 2)) % pool.length];
    if (home.id === away.id) continue;
    const m = run(home, away, level, 8000 + i * 131);
    goals += m.score.home + m.score.away;
    shots += m.stats.home.shots + m.stats.away.shots;
    sog += m.stats.home.shotsOnGoal + m.stats.away.shotsOnGoal;
    saves += m.stats.home.saves + m.stats.away.saves;
    fo += m.stats.home.faceoffWins;
    foTot += m.stats.home.faceoffWins + m.stats.away.faceoffWins;
  }
  const per = (n: number) => (n / GAMES).toFixed(1);
  const pc = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(0)}%` : '—');
  console.log(
    `${LEVELS[level].short.padEnd(8)}  ${per(goals).padStart(5)} tot  `
    + `${per(shots / 2).padStart(6)}      ${pc(goals, shots).padStart(4)}   `
    + `${pc(saves, sog).padStart(5)}   ${pc(fo, foTot).padStart(4)}`,
  );
}
