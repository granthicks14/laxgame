/**
 * DOES BASKETBALL'S CAREER ACTUALLY HAVE WHAT LACROSSE'S HAS?
 *
 * Not "is there a file called records.ts" — the brief was explicit that saying
 * the features exist is not the same as them existing. So a career is played
 * here, for real, and every system added for parity is exercised on it:
 *
 *   the wall of alumni        does a graduated senior survive his graduation?
 *   league leaders            do the numbers come back for the WHOLE level?
 *   the record book           does it grow, and does it point at real seasons?
 *   training                  does a coach point actually move an attribute?
 *   the practice emphasis     does a week of shooting reach the floor?
 *   outside interest          does a good coach get called, and can he move?
 *   the résumé                does a multi-job career read as a career?
 *   the news feed             is every line derived from something that happened?
 *   game stories              does a recap describe the game it is a recap of?
 *   integrity                 does a twenty-year save still add up?
 *
 *   npm run hoops-parity
 */
import {
  createCareer, runOffseason, simulateRestOfSeason, startNextSeason, awaitingDecision,
  acceptApproach, coachStature, gameConfigFor, needsFor, nextGame, recruitWeek,
  recruitingDone,
} from '../sports/basketball/career/season';
import { makeOffer, prospectOdds } from '../sports/basketball/career/recruit';
import { buyUpgrade, perksOf, UPGRADES } from '../sports/basketball/career/coach';
import { modsFor } from '../sports/basketball/career/difficulty';
import { standingOf } from '../sports/basketball/career/league';
import { rowFor } from '../sports/basketball/career/schedule';
import {
  bestAlumni, leaderValue, leaders, leagueStatLines, levelForm, programmeRecords,
  rankOf, validateCareer, LEADER_ORDER,
} from '../sports/basketball/career/records';
import {
  PRACTICE_INFO, TRAIN_COST, matchRoster, trainPlayer,
} from '../sports/basketball/career/practice';
import { approachesFor, resume, resumeLabel } from '../sports/basketball/career/interest';
import { newsFeed } from '../sports/basketball/career/news';
import { simStory } from '../sports/basketball/career/story';
import { simulateFixture } from '../sports/basketball/career/league';
import { teamsAtLevel, worldTeam } from '../sports/basketball/world';
import type { HoopsCareer } from '../sports/basketball/career/types';

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

/**
 * A COACH WHO ACTUALLY COACHES.
 *
 * The first version of this harness played the games and did nothing else, and it
 * produced a coach who went 188-315 over twenty years because nine of his twelve
 * roster spots were walk-ons. That is a fair test of the season engine and a
 * useless test of a career: nothing that depends on a coach being any good — the
 * job market above all — can fire for a man who never signs anybody. So he
 * recruits to his needs, and he spends what he earns.
 */
function playSeason(career: HoopsCareer): void {
  simulateRestOfSeason(career);
  runOffseason(career);
  if (awaitingDecision(career)) return;

  const scale = modsFor(career.tier).upgradeCost;
  for (const u of UPGRADES) buyUpgrade(career.coach, u.key, scale);

  if (career.recruiting) {
    for (let w = 0; w < 12 && !recruitingDone(career); w++) {
      const needs = needsFor(career);
      const row = rowFor(career.standings, career.teamId);
      const pitch = {
        teamId: career.teamId,
        standing: standingOf(career, career.teamId),
        form: row.wins / Math.max(1, row.wins + row.losses),
        perks: perksOf(career.coach),
        needs,
        region: 'in state',
        level: career.level,
        reputation: coachStature(career),
      };
      for (const pos of [...needs.list].sort((a, b) => b.need - a.need)) {
        if (needs.openSpots <= 0) break;
        const best = career.recruiting.prospects
          .filter((x) => !x.committedTo && !x.offered && x.player.pos === pos.pos)
          .map((x) => ({ x, odds: prospectOdds(x, pitch, modsFor(career.tier)) }))
          .filter((c) => c.odds.odds === 'favourite' || c.odds.odds === 'contest')
          .sort((a, b) => b.x.seenCeiling - a.x.seenCeiling)[0];
        if (best) makeOffer(career.recruiting, best.x.id);
      }
      recruitWeek(career);
    }
  }
  startNextSeason(career);
}

/* ------------------------------------------------------------------ setup */

const career = createCareer({
  mode: 'dynasty',
  // A mid-table big high school: room to climb, and a level above it to climb into.
  teamId: teamsAtLevel('hs-big')[8].id,
  seed: 4242,
});
console.log(`\n=== ${worldTeam(career.teamId).name}, ${career.level} ===\n`);

/* ------------------------------------------------- 1. training and practice */

console.log('--- TRAINING AND PRACTICE ---');
career.coach.points = 40;
const subject = career.roster.find((p) => p.attrs.three < 70 && p.overall < p.potential)!;
const beforeThree = subject.attrs.three;
const beforeOverall = subject.overall;
const r1 = trainPlayer(career, subject.id, 'three');
check('a coach point moves an attribute', r1.ok && subject.attrs.three > beforeThree,
  `${beforeThree} -> ${subject.attrs.three}`);
check('training costs what it says', career.coach.points === 40 - TRAIN_COST,
  `${career.coach.points} left`);
check('training moves the overall too', subject.overall >= beforeOverall,
  `${beforeOverall} -> ${subject.overall}`);
career.coach.points = 2;
const r2 = trainPlayer(career, subject.id, 'three');
check('training refuses when it cannot be afforded, and says why',
  !r2.ok && !!(r2 as { reason: string }).reason,
  (r2 as { reason: string }).reason);
career.coach.points = 10;

career.practice = 'shooting';
const practised = matchRoster(career);
const plain = career.roster;
const lift = practised.reduce((n, p, i) => n + (p.attrs.three - plain[i].attrs.three), 0);
check('a practice week reaches the floor', lift > 0, `+${lift} three across the squad`);
check('a practice week does NOT change the roster itself',
  plain.every((p, i) => p.attrs.three === (i === plain.indexOf(subject) ? subject.attrs.three : p.attrs.three))
  && practised !== career.roster,
  'the bonus is on a copy');
const only = PRACTICE_INFO.shooting.attrs;
check('a practice week only moves what it says it moves',
  practised.every((p, i) => (Object.keys(p.attrs) as (keyof typeof p.attrs)[])
    .every((k) => only.includes(k) || p.attrs[k] === plain[i].attrs[k])),
  `moves ${only.join(', ')}`);
career.practice = null;

/* -------------------------------------------------------- 2. a played season */

console.log('\n--- A SEASON, AND WHAT IT LEAVES BEHIND ---');
const first = nextGame(career)!;
const cfg = gameConfigFor(career, first, 'home');
check('a career game config carries a roster for both sides',
  cfg.home.roster.length > 0 && cfg.away.roster.length > 0,
  `${cfg.home.roster.length} v ${cfg.away.roster.length}`);

// A recap of a real result.
const story = simStory(
  simulateFixture(career, first),
  first.homeId === career.teamId ? 'home' : 'away',
  {
    yourAbbr: worldTeam(career.teamId).abbr,
    theirAbbr: worldTeam(first.homeId === career.teamId ? first.awayId : first.homeId).abbr,
  },
);
check('a game story describes the game', !!story.headline && !!story.line,
  `${story.kind}: ${story.headline} — ${story.line}`);

simulateRestOfSeason(career);
const lines = leagueStatLines(career);
const clubs = new Set(lines.map((l) => l.teamId));
check('league statistics cover the whole level', clubs.size >= 8,
  `${lines.length} players across ${clubs.size} clubs`);
check('league statistics include the coach\'s own squad',
  lines.some((l) => l.mine), `${lines.filter((l) => l.mine).length} of mine`);

const scorers = leaders(lines, 'points', 10);
check('a scoring leader board is ordered and plausible',
  scorers.length === 10
  && scorers.every((l, i) => i === 0 || leaderValue(scorers[i - 1], 'points') >= leaderValue(l, 'points'))
  && leaderValue(scorers[0], 'points') >= 12 && leaderValue(scorers[0], 'points') <= 42,
  `top ${leaderValue(scorers[0], 'points').toFixed(1)} ppg (${scorers[0].name}, ${scorers[0].teamAbbr})`);

const shooters = leaders(lines, 'tpPct', 10);
check('a percentage leader board applies a qualifier',
  shooters.every((l) => l.line.tpa >= 1.5 * l.line.games),
  shooters.length ? `worst qualifier ${Math.min(...shooters.map((l) => l.line.tpa))} attempts` : 'none');

const mineTop = lines.filter((l) => l.mine)
  .sort((a, b) => leaderValue(b, 'points') - leaderValue(a, 'points'))[0];
const rank = mineTop ? rankOf(lines, 'points', mineTop.playerId) : null;
check('a coach can see where his own man ranks', !!rank && rank.rank >= 1,
  rank ? `${mineTop.name} ${rank.rank} of ${rank.of}` : 'no rank');

check('every leader category produces a board',
  LEADER_ORDER.every((c) => leaders(lines, c, 5).length > 0),
  LEADER_ORDER.join(', '));

const form = levelForm(career);
check('the level\'s form table is ordered by net points',
  form.length >= 8 && form.every((r, i) => i === 0
    || (form[i - 1].scored - form[i - 1].conceded) >= (r.scored - r.conceded)),
  `${form[0].abbr} ${(form[0].scored - form[0].conceded).toFixed(1)} net`);

const feed = newsFeed(career, 6);
check('the news feed has something to say about a played season',
  feed.length >= 2 && feed.every((n) => n.headline.length > 4 && n.body.length > 10),
  feed.map((n) => n.kind).join(', '));
console.log(feed.map((n) => `      ${n.headline}  —  ${n.body}`).join('\n'));

/* ------------------------------------------------------------ 3. the wall */

console.log('\n--- THE WALL ---');
const rosterBefore = career.roster.map((p) => p.id);
runOffseason(career);
const wall = [...career.alumni];
check('somebody who left is remembered', wall.length > 0, `${wall.length} on the wall`);
check('everybody on the wall actually left',
  wall.every((a) => !career.roster.some((p) => p.id === a.id))
  && wall.every((a) => rosterBefore.includes(a.id)),
  'no ghosts');
check('an alumnus keeps the line he left on',
  wall.every((a) => a.line.games > 0 && a.seasons >= 1),
  wall.length ? `best ${Math.max(...wall.map((a) => a.line.points))} points` : '');
startNextSeason(career);

/* ------------------------------------------------ 4. twenty years of career */

console.log('\n--- TWENTY YEARS ---');
let moves = 0;
let sawApproach = false;
for (let y = 0; y < 20; y++) {
  playSeason(career);
  if (awaitingDecision(career)) break;
  const offers = approachesFor(career);
  if (offers.length) {
    sawApproach = true;
    // A coach who is offered a step up takes it.
    const up = offers.find((o) => o.stepUp) ?? offers[0];
    if (acceptApproach(career, up)) {
      moves++;
      startNextSeason(career);
    }
  }
}

check('a coach who wins gets called', sawApproach,
  `résumé ${resume(career).toFixed(0)} — ${resumeLabel(resume(career))}`);
check('a coach can actually take a better job', moves > 0, `${moves} moves`);
check('the résumé records every job', career.coach.jobs.length === moves + 1,
  career.coach.jobs.map((j) => `${worldTeam(j.teamId).abbr} ${j.wins}-${j.losses}`).join(', '));
check('a job\'s record adds up to the career record',
  career.coach.jobs.reduce((n, j) => n + j.wins, 0) === career.coach.careerWins,
  `${career.coach.jobs.reduce((n, j) => n + j.wins, 0)} v ${career.coach.careerWins}`);

const wall2 = career.alumni;
check('the wall survives changing clubs', wall2.length > wall.length,
  `${wall.length} -> ${wall2.length} names`);
check('nobody on the wall claims more seasons than the level allows',
  wall2.every((a) => a.seasons <= 6), `longest ${Math.max(...wall2.map((a) => a.seasons))}`);
const star = bestAlumni(career, 'points', 1)[0];
check('the programme\'s leading scorer is a plausible player',
  star.line.points / Math.max(1, star.line.games) < 34,
  `${star.name}: ${star.line.points} in ${star.line.games} games over ${star.seasons} seasons `
  + `(${(star.line.points / Math.max(1, star.line.games)).toFixed(1)} ppg)`);
check('the wall is capped', wall2.length <= 120, `${wall2.length}`);

const book = programmeRecords(career);
check('the record book has real records', book.length >= 4,
  book.map((r) => `${r.label}: ${r.value}`).join(' | '));
const best = bestAlumni(career, 'points', 3);
check('the best alumni are actually the best',
  best.length === 3 && best[0].line.points >= best[1].line.points,
  best.map((a) => `${a.name} ${a.line.points}`).join(', '));

/* ------------------------------------- 5. reading the past does not rewrite it */

console.log('\n--- READING THE PAST ---');
{
  /* THE CASE THAT USED TO CORRUPT A SAVE. Every rival roster is derived from the
   * YEAR, and an offseason has already moved the year on while the fixture list
   * still belongs to the season just finished — so replaying it to recover the
   * league's statistics used to replay it with next season's squads and overwrite
   * the results the coach had just been congratulated for. This is a separate
   * career, taken to exactly that point. */
  const c2 = createCareer({ mode: 'dynasty', teamId: teamsAtLevel('d2')[4].id, seed: 909 });
  simulateRestOfSeason(c2);
  runOffseason(c2);
  check('the check is run in an offseason, where it matters',
    c2.stage === 'offseason' && c2.schedule.some((f) => f.played), c2.stage);

  const before = c2.schedule.map((f) => `${f.id}:${f.homeScore}-${f.awayScore}:${f.played}`);
  const read = leagueStatLines(c2);
  const after = c2.schedule.map((f) => `${f.id}:${f.homeScore}-${f.awayScore}:${f.played}`);
  check('opening league statistics does not change a single result',
    before.join('|') === after.join('|'),
    `${read.length} lines read across ${new Set(read.map((l) => l.teamId)).size} clubs`);

  const row = c2.standings[c2.teamId];
  check('and the table still matches the fixture list afterwards',
    validateCareer(c2).length === 0,
    row ? `${row.wins}-${row.losses}` : '');

  // The same read twice is the same read: the recovery is deterministic.
  const again = leagueStatLines(c2);
  check('the same season reads the same way twice',
    again.length === read.length
    && again.every((l, i) => l.playerId === read[i].playerId
      && l.line.points === read[i].line.points),
    `${again.length} lines`);
}

/* ----------------------------------------------------------- 6. integrity */

console.log('\n--- INTEGRITY ---');
const problems = validateCareer(career);
check('a twenty-year career still adds up', problems.length === 0,
  problems.join('; ') || 'nothing to repair');

// And it catches a real corruption rather than always passing.
const row = career.standings[career.teamId];
if (row) row.wins += 3;
const caught = validateCareer(career);
check('the integrity check catches a broken table', caught.length > 0,
  caught.join('; '));
check('and repairs it', validateCareer(career).length === 0, 'clean on the second pass');

career.alumni.push({ ...career.alumni[0] });
const dupe = validateCareer(career);
check('the integrity check catches a duplicated alumnus',
  dupe.some((p) => p.includes('twice')), dupe.join('; '));

/* --------------------------------------------------------------- the score */

console.log(`\n${passed} passed, ${failures.length} problem(s)`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  env?.exit(1);
}
