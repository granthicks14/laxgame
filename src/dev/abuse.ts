/**
 * TRYING TO BREAK IT ON PURPOSE
 *
 * The other harnesses play the game the way it is meant to be played. This one
 * does the things a real save eventually does anyway: it corrupts a record,
 * throws away the coach's profile, spends points that are not there, changes
 * jobs five times in five minutes, and asks for a bracket that does not exist.
 *
 * Nothing here should throw, and nothing here should silently corrupt a career.
 *
 *   npm run abuse
 */
import {
  advancePhase, bracketRounds, buyCoachUpgrade, coachProfile, nextUserGame, pitchTo,
  postseasonStatus, runOffseason, seekChallengeJob, simulateUserGame, spendCoachPoints,
  startChallenge, takeChallengeJob, validateRecords,
} from '../league/career';
import { UPGRADES } from '../challenge/coach';
import { stageAt } from '../challenge/ladder';
import { expectationFor } from '../challenge/state';
import { programmesAt } from '../challenge/ladder';
import { CAREER_VERSION, type Career } from '../league/types';
import { migrateCareer } from '../state/saves';
import { LEVELS } from '../data/levels';

const problems: string[] = [];
let checks = 0;
function check(name: string, ok: boolean, detail = ''): void {
  checks++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) problems.push(name);
}

function fresh(seed = 4242): Career {
  return startChallenge({ difficulty: 'varsity', gameLength: 'short', seed });
}

function playGames(career: Career, n: number): number {
  let played = 0;
  while (played < n) {
    const g = nextUserGame(career);
    if (!g) break;
    simulateUserGame(career, g);
    played++;
  }
  return played;
}

/* --------------------------------------------- 1. a record that has drifted */

{
  const career = fresh();
  playGames(career, 6);
  const row = career.standings[career.teamId];
  const real = { w: row.wins, l: row.losses, t: row.ties };

  // Somebody's save says they are 40-0. The schedule says otherwise.
  row.wins = 40; row.losses = 0; row.ties = 0; row.goalsFor = 999;
  const repaired = validateRecords(career);
  check('a tampered record is caught', repaired.length > 0, repaired[0] ?? 'nothing reported');
  check('a tampered record is rebuilt from the schedule',
    row.wins === real.w && row.losses === real.l && row.ties === real.t,
    `${row.wins}-${row.losses}-${row.ties}`);
  check('rebuilding is idempotent', validateRecords(career).length === 0);

  // A row that is missing entirely must not take the rest of the table with it.
  const victim = Object.keys(career.standings).find((id) => id !== career.teamId)!;
  delete career.standings[victim];
  let threw = false;
  try { validateRecords(career); playGames(career, 2); } catch { threw = true; }
  check('a missing standings row does not crash the season', !threw);
  check('the coach still has a record after a row went missing',
    career.standings[career.teamId].wins + career.standings[career.teamId].losses > 0);
}

/* ------------------------------------------ 2. wins + losses = games played */

{
  const career = fresh(97);
  let bad = '';
  for (let i = 0; i < 40; i++) {
    if (!playGames(career, 1)) break;
    const r = career.standings[career.teamId];
    const played = career.schedule.filter((g) => g.featured && g.played && !g.playoff).length;
    if (r.wins + r.losses + r.ties !== played) {
      bad = `${r.wins}+${r.losses}+${r.ties} != ${played} after game ${i + 1}`;
      break;
    }
  }
  check('wins + losses + ties equals games played, every game', !bad, bad || 'held all season');
}

/* -------------------------------------------- 3. the coach cannot be erased */

{
  const career = fresh(555);
  playGames(career, 4);
  const before = coachProfile(career);
  before.points = 50;
  buyCoachUpgrade(career, UPGRADES[0].key);
  const owned = coachProfile(career).owned.length;
  check('an upgrade can be bought', owned === 1, `${owned} owned`);

  // A save from before the profile existed, or one somebody edited.
  career.coach = null;
  const rebuilt = coachProfile(career);
  check('a missing coach profile is rebuilt rather than crashing', !!rebuilt);
  check('the rebuilt profile is a real profile', Array.isArray(rebuilt.owned) && typeof rebuilt.points === 'number');

  // Spending more than you have must not go negative.
  const pts = rebuilt.points;
  spendCoachPoints(career, pts + 1000);
  check('coach points never go negative', coachProfile(career).points >= 0,
    `${coachProfile(career).points} after overspending ${pts}`);
  check('an upgrade you cannot afford is refused',
    !buyCoachUpgrade(career, UPGRADES[UPGRADES.length - 1].key));
}

/* ------------------------------------- 4. five job changes in five minutes */

{
  const career = fresh(31337);
  const profile = coachProfile(career);
  profile.points = 400;
  profile.xp = 60000;
  let bought = 0;
  for (const u of UPGRADES) if (buyCoachUpgrade(career, u.key)) bought++;
  check('a rich, experienced coach can buy into the tree', bought > 0, `${bought} upgrades`);

  const snapshot = {
    owned: coachProfile(career).owned.length,
    wins: coachProfile(career).careerWins,
    titles: coachProfile(career).championships,
  };
  let moves = 0;
  for (let i = 0; i < 5; i++) {
    const stage = Math.min(8, i + 1);
    const pool = [...programmesAt(stage)].sort((a, b) => a.prestige - b.prestige);
    const target = pool[Math.floor(pool.length / 2)];
    if (!target) break;
    takeChallengeJob(career, {
      teamId: target.id, teamName: target.name, teamShort: target.short,
      stageIndex: stage, prestige: target.prestige, situation: 'stable',
      expectation: expectationFor(stageAt(stage), target.prestige, 'stable', 80),
      note: '',
    });
    moves++;
    const now = coachProfile(career);
    if (now.owned.length < snapshot.owned) break;
    if (now.careerWins < snapshot.wins) break;
    if (now.championships < snapshot.titles) break;
  }
  const after = coachProfile(career);
  check('the coach survives five job changes in a row', moves === 5, `${moves} moves`);
  check('his upgrades survive every one of them',
    after.owned.length >= snapshot.owned, `${snapshot.owned} -> ${after.owned.length}`);
  check('his record survives every one of them', after.careerWins >= snapshot.wins);
  check('every job he held is on his profile', after.jobs.length >= moves, `${after.jobs.length} jobs`);
  check('the roster he inherited is a real squad', career.roster.length >= 18, `${career.roster.length} players`);
  check('every position is covered after a job change',
    new Set(career.roster.map((p) => p.pos)).size >= 4,
    [...new Set(career.roster.map((p) => p.pos))].join(','));
}

/* ---------------------------------------- 5. asking for things that are not */

{
  const career = fresh(8080);
  check('there is no postseason before the season is played', postseasonStatus(career) === null);
  check('an empty bracket is empty, not broken', bracketRounds(career).length === 0);
  check('a pitch with no window open is refused', pitchTo(career, 'nobody', 'playingtime') === null);
  career.pitchesLeft = 3;
  check('a pitch at a player who does not exist is refused',
    pitchTo(career, 'not-a-real-candidate', 'culture') === null);
  // Mid-season there is nothing to look at, and null is the answer, not a throw.
  let offers: unknown = 'threw';
  try { offers = seekChallengeJob(career); } catch { /* recorded below */ }
  check('asking for jobs mid-season answers null instead of throwing',
    offers === null || Array.isArray(offers), String(offers));
}

/* ------------------------------- 6. a whole season, then the bracket screen */

{
  const career = fresh(1212);
  let guard = 0;
  while (guard++ < 400) {
    const g = nextUserGame(career);
    if (!g) break;
    simulateUserGame(career, g);
  }
  advancePhase(career);
  const status = postseasonStatus(career);
  const rounds = bracketRounds(career);
  check('the postseason exists once the season is played', !!status);
  check('the bracket has rounds', rounds.length > 0, `${rounds.length} rounds`);
  check('the bracket ends in one final',
    rounds.length > 0 && rounds[rounds.length - 1].games.length === 1);
  check('every playoff game belongs to a round',
    rounds.reduce((n, r) => n + r.games.length, 0)
      === career.schedule.filter((g) => g.playoff).length);
  check('an eliminated coach can still see the whole bracket',
    rounds.every((r) => r.games.every((g) => g.played)),
    'every game decided');

  // The offseason resets the screen state so next season qualifies again.
  if (career.seasonComplete) runOffseason(career);
  check('the postseason screens reset for the new season',
    career.postseason.revealed === 0 && !career.postseason.clinchedSeen);
  check('the new season starts with a clean record',
    Object.values(career.standings).every((r) => r.wins + r.losses + r.ties === 0));
}

/* ------------------------------------- 7. a save from the build before this */

{
  // The universal rating scale changed every number a save carries. A career
  // somebody has played for thirty seasons has to survive that, so this puts a
  // genuinely v7-shaped save through the real migration and checks the squad
  // comes out the other side as a squad.
  const career = fresh(2024);
  playGames(career, 4);

  // Rebuild the save the way v7 wrote it: old-scale ratings, no tier, no
  // conference split. The endpoints are the old high school band plus players
  // either side of it, which is what actually broke first.
  const v7 = JSON.parse(JSON.stringify(career)) as Record<string, unknown>;
  v7.version = 7;
  (v7.challenge as Record<string, unknown>).tier = undefined;
  const OLD = { lo: 60, hi: 91 };
  const roster = v7.roster as Record<string, unknown>[];
  roster.forEach((p, i) => {
    // Spread the squad across the old band and a little outside it at both ends.
    const value = OLD.lo - 6 + (i / Math.max(1, roster.length - 1)) * (OLD.hi - OLD.lo + 12);
    p.overall = Math.round(value);
    p.potential = Math.round(value + 4);
    const attrs = p.attrs as Record<string, number>;
    for (const key of Object.keys(attrs)) attrs[key] = Math.round(value);
  });

  const migrated = migrateCareer(v7) as Record<string, unknown>;
  const out = migrated.roster as Record<string, unknown>[];
  const overalls = out.map((p) => p.overall as number);
  const attrs = out.flatMap((p) => Object.values(p.attrs as Record<string, number>));
  const band = LEVELS.hs.band;

  check('an old save migrates to the current version', migrated.version === CAREER_VERSION,
    `v7 -> v${migrated.version}`);
  check('a career from before difficulties existed is a Standard career',
    (migrated.challenge as Record<string, unknown>)?.tier === 'standard');
  check('the squad survives with everybody in it', out.length === roster.length,
    `${out.length} players`);
  check('every migrated rating lands on the new scale',
    overalls.every((o) => o >= band.lo - 6 && o <= band.hi + 4),
    `${Math.min(...overalls)}-${Math.max(...overalls)} against a ${band.lo}-${band.hi} band`);
  check('no attribute is mangled into nonsense',
    attrs.every((a) => a >= 20 && a <= 99), `${Math.min(...attrs)}-${Math.max(...attrs)}`);
  check('the squad keeps its shape', out.every((p, i) => (
    i === 0 || (out[i - 1].overall as number) <= (p.overall as number)
  )), 'relative strength preserved');
  // The Elite -> Hard rename must carry a career across, not reset it.
  const v8 = JSON.parse(JSON.stringify(career)) as Record<string, unknown>;
  v8.version = 8;
  (v8.challenge as Record<string, unknown>).tier = 'elite';
  const renamed = migrateCareer(v8) as Record<string, unknown>;
  check('an Elite career becomes a Hard career, not a Standard one',
    (renamed.challenge as Record<string, unknown>)?.tier === 'hard',
    String((renamed.challenge as Record<string, unknown>)?.tier));

  check('a current save passes through untouched',
    (migrateCareer(JSON.parse(JSON.stringify(career))) as Record<string, unknown>).version
      === CAREER_VERSION);
}

console.log();
if (problems.length) {
  console.log(`${problems.length} of ${checks} checks FAILED:`);
  for (const p of problems) console.log(`  - ${p}`);
  (globalThis as { process?: { exit(n: number): void } }).process?.exit(1);
} else {
  console.log(`${checks}/${checks} checks passed — nothing broke`);
}
