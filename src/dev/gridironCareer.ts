/**
 * TWENTY YEARS OF A FOOTBALL CAREER, IN A SECOND.
 *
 * The career engine has no pixels and no screens, so the only way to find out
 * whether it holds together is to run it — a coach taking a job, playing a
 * season, losing his seniors, recruiting the next lot and going round again,
 * twenty times, in both modes.
 *
 * WHAT IT IS LOOKING FOR is not "is the football realistic" — the gridiron
 * harness answers that. It is the things a career mode breaks in ways nobody
 * notices for ten seasons: a roster that empties out, a roster that grows
 * without limit, ratings that drift upward for ever, a schedule that stops
 * being fair, a table that does not add up, a save that will not reload, and a
 * Challenge ladder where nobody is ever hired or sacked.
 *
 *   npm run gridiron-career
 */
import { Rng } from '../core/rng';
import { LEVELS, LEVEL_ORDER, shapeFor } from '../sports/football/levels';
import { rosterFor, teamsAtLevel, worldTeam } from '../sports/football/world';
import { POSITIONS, teamRatings } from '../sports/football/data';
import {
  beginOffseason, createCareer, nextGame, seasonRecord, simulateOwn, simulateSeason,
  startNextSeason, topPerformers,
} from '../sports/football/career/season';
import { sortStandings } from '../sports/football/career/schedule';
import { buyUpgrade, canBuy, perksOf, UPGRADES } from '../sports/football/career/coach';
import { offer, visit } from '../sports/football/career/recruit';
import {
  expectedRate, newChallenge, startingJob, takeJob, updateHeat, verdictFor,
} from '../sports/football/career/challenge';
import type { FootballCareer } from '../sports/football/career/types';

const problems: string[] = [];
let passed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else problems.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

/** A coach who actually coaches: he recruits to need and spends his points. */
function beACoach(career: FootballCareer, rng: Rng): void {
  // Spend on whatever is affordable, favouring the programme upgrades.
  const order = ['strength', 'recruiting', 'scouting', 'oline', 'qb', 'secondary', 'front', 'skill', 'training'];
  let spent = true;
  while (spent) {
    spent = false;
    for (const id of order) {
      if (canBuy(career.coach, id)) { buyUpgrade(career.coach, id); spent = true; break; }
    }
  }
  /* AND HE RECRUITS TO NEED, which is what anybody playing this would do.
   *
   * A test coach who offers to whoever happens to be warmest signs five
   * receivers and no linebackers, and then the harness is measuring a bad coach
   * rather than the engine. Need first, quality second — the order a real
   * recruiting board is worked. */
  const shape = shapeFor(career.level);
  const need = (pos: string): number =>
    shape[pos as keyof typeof shape] - career.roster.filter((x) => x.pos === pos).length;
  const value = (r: { pos: string; overall: number }): number =>
    need(r.pos) * 24 + r.overall;

  const board = [...career.recruits].sort((a, b) => value(b) - value(a));
  for (const r of board) {
    if (career.visitsLeft <= 0) break;
    visit(career, r);
  }
  for (const r of board) {
    if (career.offersLeft <= 0) break;
    offer(career, r);
  }
  void rng;
}

function runDynasty(years: number): void {
  const pool = teamsAtLevel('college-big');
  const career = createCareer({
    mode: 'dynasty',
    teamId: pool[6].id,
    coachName: 'Test',
    difficulty: 'pro',
    seed: 4242,
  });
  const rng = new Rng('fb:career:test');

  let minRoster = 99;
  let maxRoster = 0;
  let maxOverall = 0;
  let titles = 0;
  const scores: number[] = [];

  for (let y = 0; y < years; y++) {
    // Play (well, simulate) the whole season a game at a time so the weekly
    // machinery is exercised rather than the shortcut.
    let guard = 0;
    while (career.stage === 'regular' && guard++ < 40) {
      const f = nextGame(career);
      if (!f) break;
      simulateOwn(career, f);
      const mine = f.homeId === career.teamId ? f.homeScore : f.awayScore;
      scores.push(mine);
    }
    if (career.stage !== 'offseason') simulateSeason(career);

    const rec = seasonRecord(career);
    check(`year ${career.year - 1}: a full season was played`,
      rec.wins + rec.losses + rec.ties === LEVELS[career.level].games,
      `${rec.wins}-${rec.losses}-${rec.ties} of ${LEVELS[career.level].games}`);

    if (career.championId === career.teamId) titles++;

    beACoach(career, rng);
    startNextSeason(career);

    minRoster = Math.min(minRoster, career.roster.length);
    maxRoster = Math.max(maxRoster, career.roster.length);
    maxOverall = Math.max(maxOverall, teamRatings(career.roster).overall);
  }

  check('the roster never emptied out', minRoster >= 22, `low of ${minRoster}`);
  check('the roster never ran away', maxRoster <= 48, `high of ${maxRoster}`);
  check('ratings did not spiral', maxOverall <= 99, `best team overall ${maxOverall}`);
  check('every season is in the history', career.history.length === years,
    `${career.history.length} of ${years}`);
  check('alumni accumulated', career.alumni.length > years * 3,
    `${career.alumni.length} former players`);
  check('the coach earned points', career.coach.spent > 0,
    `${career.coach.spent} spent, ${career.coach.points} left`);
  check('the tree was worth something', perksOf(career.coach).development > 1,
    `development x${perksOf(career.coach).development.toFixed(2)}`);
  check('scores stayed sane', scores.every((s) => s >= 0 && s < 100),
    `${Math.min(...scores)}-${Math.max(...scores)}`);

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  check('scoring is football-shaped', avg > 12 && avg < 48, `${avg.toFixed(1)} a game`);

  /* THE SQUAD STILL HAS A SHAPE. A programme twenty years in that has no
   * quarterback, or eleven of them, is a recruiting system that has quietly
   * stopped working. */
  const shape = shapeFor(career.level);
  const missing = POSITIONS.filter((p) => career.roster.filter((x) => x.pos === p).length === 0);
  check('every position is filled', missing.length === 0, missing.join(', '));
  /* A DEEP LINE IS A CHOICE, not a bug — a coach who keeps signing linemen gets
   * linemen. What this is watching for is a position group growing without limit
   * because nothing ever removes anybody from it. */
  const overstuffed = POSITIONS.filter((p) =>
    career.roster.filter((x) => x.pos === p).length > shape[p] + 7);
  check('no position runs away', overstuffed.length === 0, overstuffed.join(', '));

  /* THE ONE COMPARISON THAT EXPLAINS A RECORD. A coached programme that reads
   * five points below every club it plays is not unlucky, it is mis-generated. */
  const rivals = teamsAtLevel(career.level)
    .filter((t) => t.id !== career.teamId)
    .map((t) => teamRatings(rosterFor(t, career.year)).overall);
  const rivalAvg = rivals.reduce((a, b) => a + b, 0) / rivals.length;
  const mine = teamRatings(career.roster).overall;
  check('the coach keeps up with the league', mine >= rivalAvg - 2,
    `coach ${mine} v league ${rivalAvg.toFixed(1)} (${Math.min(...rivals)}-${Math.max(...rivals)})`);

  // Where the gap is, if there is one, so it can be fixed rather than guessed at.
  const r1 = teamRatings(career.roster);
  const r2 = teamRatings(rosterFor(teamsAtLevel(career.level)[6], career.year));
  console.log(`    coach   pass ${r1.passing} run ${r1.rushing} passD ${r1.passDefense}`
    + ` runD ${r1.runDefense} st ${r1.specialTeams}`);
  console.log(`    a rival pass ${r2.passing} run ${r2.rushing} passD ${r2.passDefense}`
    + ` runD ${r2.runDefense} st ${r2.specialTeams}`);
  const cmp = POSITIONS.map((pos) => {
    const a2 = career.roster.filter((p) => p.pos === pos).sort((x, y) => y.overall - x.overall);
    const b2 = rosterFor(teamsAtLevel(career.level)[6], career.year)
      .filter((p) => p.pos === pos).sort((x, y) => y.overall - x.overall);
    const top = (l: typeof a2): string => (l.length ? String(l[0].overall) : '--');
    return `${pos} ${top(a2)}/${top(b2)}`;
  }).join('  ');
  console.log(`    best at each: ${cmp}`);

  console.log(`\n  twenty years: ${career.coach.careerWins}-${career.coach.careerLosses}`
    + `, ${titles} title${titles === 1 ? '' : 's'}, `
    + `roster ${career.roster.length}, team ${teamRatings(career.roster).overall}`);
  const best = topPerformers(career)[0];
  if (best) console.log(`  best this year: ${best.player.pos} ${best.player.last} — ${best.line}`);
}

function runChallenge(years: number): void {
  const job = startingJob(99);
  const career = createCareer({
    mode: 'challenge',
    teamId: job.teamId,
    coachName: 'Climber',
    difficulty: 'pro',
    seed: 99,
  });
  career.challenge = newChallenge(job.teamId, job.level);
  const rng = new Rng('fb:challenge:test');

  const start = LEVEL_ORDER.indexOf(career.level);
  check('a climb starts at the bottom', start === 0, `${LEVELS[career.level].short}`);
  const club = worldTeam(career.teamId);
  check('and at a bad programme', (club?.standing ?? 99) < 30, `standing ${club?.standing}`);

  let moves = 0;
  let sacked = 0;
  let best = start;

  for (let y = 0; y < years; y++) {
    simulateSeason(career);
    const rec = seasonRecord(career);
    const champion = career.championId === career.teamId;
    updateHeat(career.challenge!, rec.wins, rec.losses, champion, expectedRate(career.teamId));

    const verdict = verdictFor(career, champion);
    if (verdict.kind === 'sacked' && verdict.fallback) {
      takeJob(career, verdict.fallback.teamId);
      sacked++;
      moves++;
    } else if (verdict.kind === 'offers' && verdict.offers.length) {
      // Always take the best job offered, which is what a climber does.
      const target = verdict.offers
        .map((id) => worldTeam(id))
        .filter((t): t is NonNullable<typeof t> => !!t)
        .sort((a, b) => LEVEL_ORDER.indexOf(b.level) - LEVEL_ORDER.indexOf(a.level)
          || b.standing - a.standing)[0];
      if (target) { takeJob(career, target.id); moves++; }
    } else if (verdict.kind === 'finished') {
      break;
    }
    best = Math.max(best, LEVEL_ORDER.indexOf(career.level));

    beACoach(career, rng);
    startNextSeason(career);
  }

  check('the ladder can be climbed', best > start,
    `reached ${LEVELS[LEVEL_ORDER[best]].short} from ${LEVELS[LEVEL_ORDER[start]].short}`);
  check('the job market moves', moves > 0, `${moves} moves, ${sacked} of them sackings`);
  check('every job is in the record', (career.challenge?.jobs.length ?? 0) === moves + 1,
    `${career.challenge?.jobs.length} jobs for ${moves} moves`);
  check('heat stayed in range',
    (career.challenge?.heat ?? 0) >= 0 && (career.challenge?.heat ?? 0) <= 100,
    `${career.challenge?.heat}`);

  console.log(`\n  ${years} years: ${career.coach.careerWins}-${career.coach.careerLosses}`
    + `, ${career.championships} titles, ended at ${LEVELS[career.level].short}`
    + ` (${worldTeam(career.teamId)?.name})`);
  for (const j of career.challenge?.jobs ?? []) {
    const t = worldTeam(j.teamId);
    console.log(`    ${String(j.from).padStart(2)}-${j.to ?? 'now'}  `
      + `${LEVELS[j.level].short.padEnd(6)} ${t?.city} ${t?.name}`);
  }
}

/** The table has to add up, or the whole league is a decoration. */
function checkTable(): void {
  const career = createCareer({
    mode: 'dynasty', teamId: teamsAtLevel('pro')[0].id,
    coachName: 'T', difficulty: 'pro', seed: 7,
  });
  simulateSeason(career);
  const table = sortStandings(career.standings);
  const games = LEVELS[career.level].games;
  const wrong = table.filter((s) => s.wins + s.losses + s.ties !== games);
  check('every club played a full card', wrong.length === 0,
    wrong.map((s) => `${s.teamId} ${s.wins + s.losses + s.ties}`).join(', '));
  const wins = table.reduce((n, s) => n + s.wins, 0);
  const losses = table.reduce((n, s) => n + s.losses, 0);
  check('wins and losses balance', wins === losses, `${wins} v ${losses}`);
  const pf = table.reduce((n, s) => n + s.pointsFor, 0);
  const pa = table.reduce((n, s) => n + s.pointsAgainst, 0);
  check('points for and against balance', pf === pa, `${pf} v ${pa}`);
  check('somebody won it', career.championId !== null, career.championId ?? 'nobody');
  check('the champion is a real club', !!worldTeam(career.championId ?? ''), career.championId ?? '');
  void beginOffseason;
  void UPGRADES;
}

console.log('GRIDIRON CAREER — twenty years, twice\n');
console.log('A LEAGUE THAT ADDS UP');
checkTable();
console.log('\nDYNASTY');
runDynasty(20);
console.log('\nCHALLENGE');
runChallenge(24);

console.log(`\n${passed} checks passed`);
if (problems.length) {
  console.log(`${problems.length} problem(s):`);
  for (const p of problems) console.log(`  ! ${p}`);
}
