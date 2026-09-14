/**
 * A WHOLE CAREER, WITH NOBODY WATCHING.
 *
 * A management mode is a machine that runs for twenty years, and almost
 * everything that can go wrong with one is invisible in a single season: a
 * roster that quietly shrinks by one man a year, statistics that stop adding up
 * after the first graduation, a league whose best programme drifts to the top
 * and stays there forever, a recruiting cycle that signs nobody because a limit
 * is off by one. None of those show up on a screenshot. All of them ruin a
 * career.
 *
 * So careers are played here, in full, and asserted.
 *
 *   npm run hoops-career
 */
import { LEVELS } from '../sports/basketball/levels';
import { teamsAtLevel, worldTeam } from '../sports/basketball/world';
import { starters, teamRatings } from '../sports/basketball/data';
import {
  averages, awaitingDecision, createCareer, needsFor, recruitWeek, recruitingDone,
  coachStature, runOffseason, schemeAdvice, simulateRestOfSeason, startNextSeason,
  takeJob,
  teamLeaders,
} from '../sports/basketball/career/season';
import { levelTable, rowFor } from '../sports/basketball/career/schedule';
import {
  classGrade, committedTo, makeOffer, prospectOdds,
} from '../sports/basketball/career/recruit';
import { openTargets, pitchTo } from '../sports/basketball/career/portal';
import { perksOf, buyUpgrade, coachLevel, UPGRADES } from '../sports/basketball/career/coach';
import {
  modsFor, TIER_ORDER, TIERS, type HoopsTier,
} from '../sports/basketball/career/difficulty';
import { standingOf, squadGap } from '../sports/basketball/career/league';
import { RUNGS, rungAt } from '../sports/basketball/career/ladder';
import { SITUATIONS } from '../sports/basketball/career/challenge';
import type { HoopsCareer } from '../sports/basketball/career/types';

const env = (globalThis as {
  process?: { exit(n: number): void; env?: Record<string, string | undefined> };
}).process;

const YEARS = Number(env?.env?.YEARS ?? 12);

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

/**
 * The season as it stood the moment before the next one wiped it.
 *
 * `startNextSeason` clears the table and the statistics, which is right — they
 * belong to a season — so anything that wants to look at a finished season has
 * to look here. Reading `career.standings` after a loop of `playSeason` reads an
 * empty table and reports a bug that is not there.
 */
interface SeasonSnapshot {
  standings: HoopsCareer['standings'];
  season: HoopsCareer['season'];
  level: HoopsCareer['level'];
}
let lastSeason: SeasonSnapshot | null = null;

/**
 * A plausible coach: recruits whoever his board says he needs, works the
 * portal, buys development first, and plays every game out.
 */
function playSeason(career: HoopsCareer): void {
  simulateRestOfSeason(career);
  runOffseason(career);
  lastSeason = {
    standings: JSON.parse(JSON.stringify(career.standings)),
    season: JSON.parse(JSON.stringify(career.season)),
    level: career.level,
  };
  // A career waiting on a job decision does not have an offseason to run: there
  // is no squad to develop and no class to recruit until somebody hires him.
  if (awaitingDecision(career)) return;

  /* A coach who looks at his squad. Four graduations on, the system that suited
   * last year's five can be the wrong one entirely, and the scheme screen is
   * where a real player would notice. */
  const advice = schemeAdvice(career);
  if (advice.shouldChange) {
    career.offense = advice.bestOffense;
    career.defense = advice.bestDefense;
  }

  // Spend. Development first, then whatever is affordable.
  const order = ['skills', 'eye', 'pitch', 'conditioning', 'spacing1', 'rotations',
    'shooting', 'bigs', 'contacts', 'movement', 'depth', 'breakouts', 'closeouts',
    'sell', 'reach', 'culture', 'retention', 'sets', 'boxout', 'closer', 'ceiling'];
  const scale = modsFor(career.tier).upgradeCost;
  for (const key of order) buyUpgrade(career.coach, key, scale);

  // The window.
  let guard = 0;
  while (career.pitchesLeft > 0 && guard++ < 20) {
    const open = openTargets(career.market)
      .sort((a, b) => b.player.overall - a.player.overall);
    const target = open[0];
    if (!target) break;
    career.pitchesLeft--;
    pitchTo(
      target,
      {
        standing: standingOf(career, career.teamId),
        form: 0.5,
        perks: perksOf(career.coach),
        needs: needsFor(career),
        level: career.level,
      },
      career.teamId,
      perksOf(career.coach),
      modsFor(career.tier),
      career.seed,
    );
  }

  /* RECRUITING LIKE A COACH WHO KNOWS WHERE HE WORKS. Offers go to the best
   * player at a position of need THAT HE CAN ACTUALLY GET — the board's own odds
   * column, which is exactly what a player reads it for. Chasing the top of the
   * board instead, as an earlier version of this did, signed one player in eleven
   * offers at a bottom-half programme and made the whole mode look unwinnable. */
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
      const wanted = [...needs.list].sort((a, b) => b.need - a.need);
      for (const pos of wanted) {
        if (needs.openSpots <= 0) break;
        const best = career.recruiting.prospects
          .filter((p) => !p.committedTo && !p.offered && p.player.pos === pos.pos)
          .map((p) => ({ p, odds: prospectOdds(p, pitch, modsFor(career.tier)) }))
          .filter((x) => x.odds.odds === 'favourite' || x.odds.odds === 'contest')
          .sort((a, b) => b.p.seenCeiling - a.p.seenCeiling)[0];
        if (best) makeOffer(career.recruiting, best.p.id);
      }
      recruitWeek(career);
    }
  }
  startNextSeason(career);
}

/* ------------------------------------------------------------- one career */

console.log('\nA DYNASTY, TWELVE SEASONS\n');

const career = createCareer({
  mode: 'dynasty',
  teamId: teamsAtLevel('d2')[6].id,
  seed: 5150,
});
const club = worldTeam(career.teamId);
console.log(`  ${club.city} ${club.name} (${LEVELS[career.level].short}),`
  + ` squad ${teamRatings(career.roster).overall}\n`);

const rosterSizes: number[] = [];
const problems: string[] = [];
let championships = 0;
let totalGames = 0;
const start = Date.now();

for (let y = 0; y < YEARS; y++) {
  const before = career.year;
  playSeason(career);
  const last = career.history[career.history.length - 1];
  const dev = career.lastDevelopment;
  const biggest = dev[0];
  const grade = career.recruiting ? classGrade(career.recruiting, career.teamId) : null;
  rosterSizes.push(career.roster.length);
  totalGames += last.wins + last.losses;
  if (last.champion) championships++;

  console.log(`  Year ${String(before).padStart(2)}  ${String(last.wins).padStart(2)}-`
    + `${String(last.losses).padEnd(2)}  ${last.finish.padEnd(34)}`
    + ` squad ${String(teamRatings(career.roster).overall).padStart(2)}`
    + `  roster ${String(career.roster.length).padStart(2)}`
    + `  CP ${String(career.coach.points).padStart(3)}`
    + `  lvl ${String(coachLevel(career.coach)).padStart(2)}`
    + `${biggest && biggest.to - biggest.from >= 3
      ? `  ${biggest.name.split(' ')[1]} +${biggest.to - biggest.from}` : ''}`
    + `${grade && grade.signed ? `  class ${grade.grade} (${grade.signed})` : ''}`);

  // --- invariants, every single season.
  const info = LEVELS[career.level];
  if (career.roster.length > info.rosterSize) {
    problems.push(`year ${before}: ${career.roster.length} players, cap ${info.rosterSize}`);
  }
  if (career.roster.length < 8) {
    problems.push(`year ${before}: only ${career.roster.length} players`);
  }
  if (new Set(career.roster.map((p) => p.id)).size !== career.roster.length) {
    problems.push(`year ${before}: the same player twice on the roster`);
  }
  if (starters(career.roster).length !== 5) {
    problems.push(`year ${before}: no starting five`);
  }
  if (career.roster.some((p) => p.overall < 20 || p.overall > 99)) {
    problems.push(`year ${before}: a rating off the scale`);
  }
  if (career.roster.some((p) => p.potential < p.overall - 1)) {
    problems.push(`year ${before}: a ceiling below the player`);
  }
  if (LEVELS[career.level].ageSystem === 'class'
    && career.roster.some((p) => p.years > info.eligibility)) {
    problems.push(`year ${before}: somebody is out of eligibility and still here`);
  }
  if (last.wins + last.losses !== info.games) {
    problems.push(`year ${before}: played ${last.wins + last.losses} of ${info.games}`);
  }
}
const elapsed = Date.now() - start;

console.log(`\n  ${YEARS} seasons in ${(elapsed / 1000).toFixed(1)}s`
  + `  (${(elapsed / YEARS).toFixed(0)}ms a season, ${totalGames} of the coach's own games)`);

check('a career runs for a dozen seasons without breaking', problems.length === 0,
  problems.slice(0, 3).join('; '));
check('the squad stays a squad', rosterSizes.every((n) => n >= 8),
  `smallest ${Math.min(...rosterSizes)}`);
console.log(`  ${championships} championship${championships === 1 ? '' : 's'} in ${YEARS} seasons`);
check('a season takes a moment, not a minute', elapsed / YEARS < 4000,
  `${(elapsed / YEARS).toFixed(0)}ms`);
check('the coach earned points and levelled up',
  career.coach.xp > 0 && coachLevel(career.coach) > 1,
  `level ${coachLevel(career.coach)}, ${career.coach.owned.length} upgrades`);
check('and could not buy everything',
  career.coach.owned.length < UPGRADES.length,
  `${career.coach.owned.length}/${UPGRADES.length}`);

/* ------------------------------------------------------------- the league */

console.log('\nTHE LEAGUE AROUND HIM\n');

const finished = lastSeason!;
const table = levelTable(finished.standings, finished.level);
console.log(`  ${table.slice(0, 4).map((r) => `${r.team.abbr} ${r.wins}-${r.losses}`).join('   ')}`);

const played = table.reduce((n, r) => n + r.wins + r.losses, 0);
check('every club played a full season',
  table.every((r) => r.wins + r.losses === LEVELS[finished.level].games),
  `${(played / table.length).toFixed(1)} average`);
check('wins and losses balance across the league',
  table.reduce((n, r) => n + r.wins, 0) === table.reduce((n, r) => n + r.losses, 0));
check('the table is ordered',
  table.every((r, i) => i === 0 || table[i - 1].wins >= r.wins));
check('somebody is clearly better than somebody else',
  table[0].wins - table[table.length - 1].wins >= 6,
  `${table[0].wins} to ${table[table.length - 1].wins}`);

const drifted = Object.keys(career.standingDrift).length;
console.log(`  ${drifted} programmes have moved in the sport's estimation`);
check('programmes rise and fall over a decade', drifted > 4, `${drifted}`);
check('and nobody left their own level', Object.entries(career.standingDrift)
  .every(([id, d]) => Math.abs(d) <= 15 && standingOf(career, id) >= 1
    && standingOf(career, id) <= 99));

/* --------------------------------------------------------------- the schedule */

console.log('\nTHE FIXTURE LIST\n');

{
  /* A season that is the same fixture list every year with different numbers on
   * it is a season nobody plays twice. */
  const c = createCareer({ mode: 'dynasty', teamId: teamsAtLevel('d2')[5].id, seed: 61 });
  const years: string[][] = [];
  for (let y = 0; y < 4; y++) {
    years.push(c.schedule.filter((f) => f.featured)
      .map((f) => `${f.homeId}>${f.awayId}`));
    playSeason(c);
  }
  const info = LEVELS[c.level];
  const same = years.slice(1).filter((list, i) =>
    list.join('|') === years[i].join('|')).length;
  const orders = new Set(years.map((y) => y.join('|')));
  console.log(`  ${years[0].length} games a year, ${orders.size} different `
    + `fixture lists in ${years.length} seasons`);

  check('every season is a full card',
    years.every((y) => y.length === info.games), `${years.map((y) => y.length).join('/')}`);
  check('and no two seasons are the same fixture list', same === 0 && orders.size === years.length,
    `${orders.size} of ${years.length} distinct`);

  const home = years[0].filter((g) => g.startsWith(c.teamId)).length;
  check('home and away are close to even', Math.abs(home - years[0].length / 2) <= 3,
    `${home} home of ${years[0].length}`);

  const conf = c.schedule.filter((f) => f.featured && f.conference).length;
  check('there is conference play and non-conference play',
    conf > 0 && conf < info.games, `${conf} conference of ${info.games}`);
  check('and a rivalry game every year',
    c.schedule.some((f) => f.featured && f.rivalry));
}

/* ------------------------------------------------------------ statistics */

console.log('\nWHAT THE STATISTICS SAY\n');

// Career leaders, which outlive a season and so read the live career.
for (const l of teamLeaders(career)) {
  console.log(`  ${l.label.padEnd(10)} ${l.name} ${l.value}`);
}

const lines = Object.values(finished.season).filter((l) => l.games > 0);
check('the squad has statistics', lines.length >= 5, `${lines.length} players`);
check('nobody made more shots than he took',
  lines.every((l) => l.fgm <= l.fga && l.tpm <= l.tpa && l.ftm <= l.fta));
check('nobody played more games than were played',
  lines.every((l) => l.games <= LEVELS[finished.level].games + 12));
check('scoring is basketball', (() => {
  const best = lines.map((l) => averages(l).ppg).sort((a, b) => b - a)[0] ?? 0;
  return best > 8 && best < 45;
})(), `${(lines.map((l) => averages(l).ppg).sort((a, b) => b - a)[0] ?? 0).toFixed(1)} ppg`);

const careerLines = Object.values(career.careerStats).filter((l) => l.games > 0);
check('career totals survived a decade of graduations',
  careerLines.length > career.roster.length,
  `${careerLines.length} players have a career line`);
check('and a career line is never smaller than a season',
  Object.entries(finished.season).every(([id, s]) =>
    !s.games || (career.careerStats[id]?.games ?? 0) >= s.games || !career.careerStats[id]));

/* ----------------------------------------------------------- development */

console.log('\nDEVELOPMENT OVER A CAREER\n');

{
  /* Fresh careers, so development is measured from a known start — and three of
   * them, because a single squad's freshmen are five players and five players
   * are noise.
   *
   * THE SPLIT IS THE POINT. Minutes are the one development lever the coach
   * holds directly, so the test is not "everybody improves": it is that the
   * young players who PLAYED came back changed and the ones who sat did not.
   * Measuring the two together, as an earlier version of this did, samples
   * whoever happened to survive three years on the bench and calls the system
   * broken when it is working exactly as designed. */
  const rotation: number[] = [];
  const benched: number[] = [];
  let bestGain = 0;

  const squads: [number, number][] = [
    [3, 909], [9, 1717], [14, 2024], [1, 3131], [6, 808], [11, 77], [17, 4040],
    [22, 6161], [27, 313], [33, 1234],
  ];
  for (const [teamIndex, seed] of squads) {
    const c = createCareer({
      mode: 'dynasty', teamId: teamsAtLevel('d2')[teamIndex].id, seed,
    });
    const freshmen = c.roster.filter((p) => p.years === 1)
      .map((p) => ({ id: p.id, from: p.overall }));
    for (let y = 0; y < 3; y++) playSeason(c);
    for (const f of freshmen) {
      const now = c.roster.find((p) => p.id === f.id);
      if (!now) continue;
      const gained = now.overall - f.from;
      bestGain = Math.max(bestGain, gained);
      /* The same share of available minutes the development system itself reads,
       * so this measures what the engine measures rather than a guess at it. */
      const line = c.careerStats[f.id];
      const share = line ? line.seconds / Math.max(1, line.games * 2400) : 0;
      if (share >= 0.111) rotation.push(gained);
      else if (!line || line.games === 0) benched.push(gained);
    }
  }

  const mean = (xs: number[]): number =>
    (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  console.log(`  ${rotation.length} freshmen played real minutes: +${mean(rotation).toFixed(1)}`);
  console.log(`  ${benched.length} never got off the bench: +${mean(benched).toFixed(1)}`);
  console.log(`  the biggest three-year jump was +${bestGain}`);

  check('a young player who plays gets substantially better over three seasons',
    rotation.length >= 3 && mean(rotation) > 3,
    `${rotation.length} players, +${mean(rotation).toFixed(1)}`);
  check('minutes are what develops him',
    benched.length === 0 || mean(rotation) > mean(benched) + 1.5,
    `+${mean(rotation).toFixed(1)} played vs +${mean(benched).toFixed(1)} benched`);
  check('somebody turned into a different player', bestGain >= 8, `best +${bestGain}`);
  check('and not all by the same amount',
    new Set([...rotation, ...benched]).size > 2);

  const c = createCareer({ mode: 'dynasty', teamId: teamsAtLevel('d2')[3].id, seed: 909 });
  for (let y = 0; y < 3; y++) playSeason(c);
  const decliners = c.lastDevelopment.filter((d) => d.to < d.from);
  const risers = c.lastDevelopment.filter((d) => d.to > d.from);
  check('development is not universal improvement',
    risers.length > 0 && (decliners.length > 0 || c.lastDevelopment.some((d) => d.to === d.from)),
    `${risers.length} up, ${decliners.length} down`);
}

/* ------------------------------------------------------------- recruiting */

console.log('\nRECRUITING\n');

{
  const c = createCareer({ mode: 'dynasty', teamId: teamsAtLevel('d1-mid')[2].id, seed: 4242 });
  simulateRestOfSeason(c);
  runOffseason(c);
  const state = c.recruiting!;
  check('a class is generated', state.prospects.length > 10, `${state.prospects.length}`);
  check('the class is a spread of ability, not one band',
    new Set(state.prospects.map((p) => p.stars)).size >= 3);
  check('a coach cannot offer everybody at once', (() => {
    let refused = 0;
    for (const p of state.prospects) if (makeOffer(state, p.id)) refused++;
    return refused > 0;
  })(), `limit ${state.offerLimit}`);

  const needs = needsFor(c);
  console.log(`  needs: ${needs.list.map((n) => `${n.pos} ${n.needLabel} (${n.open} open)`).join(', ')}`);
  console.log(`  ${needs.openSpots} places on a ${needs.cap}-man roster`);
  check('the board reports need and places separately',
    needs.list.every((n) => n.open >= 0 && n.open <= n.slots)
    && needs.openSpots >= 0 && needs.openSpots <= needs.cap);
  check('a position with nobody in it is urgent',
    needs.list.every((n) => n.projected > 0 || n.need === 4));

  for (let w = 0; w < 12 && !recruitingDone(c); w++) recruitWeek(c);
  const signed = committedTo(state, c.teamId);
  console.log(`  signed ${signed.length}: `
    + signed.map((p) => `${p.player.pos} ${p.player.overall}`).join(', '));
  check('recruiting a class actually signs somebody', signed.length > 0, `${signed.length}`);
  check('and never more than there is room for',
    signed.length <= needs.openSpots + 1, `${signed.length} for ${needs.openSpots} places`);
  check('every prospect ends up somewhere',
    state.prospects.every((p) => p.committedTo !== null));

  const before = c.roster.length;
  startNextSeason(c);
  check('the class arrives', c.roster.length >= before,
    `${before} -> ${c.roster.length}`);
  check('and the roster is still legal',
    c.roster.length <= LEVELS[c.level].rosterSize);
}

/* --------------------------------------------------------- a whole climb */

/**
 * THE CLIMB, PLAYED OUT.
 *
 * Challenge Mode is nine rungs and one coach, and the only way to know whether
 * it is a career or a treadmill is to coach the whole thing: take the worst job
 * in the sport, win what you can, take whatever the phone offers, and see where
 * the coach is forty seasons later.
 *
 * What is asserted is the SHAPE of it — that a title is what moves you, that it
 * moves you exactly one rung, that the coach who arrives at the new programme is
 * the same person who left the old one, and that being sacked is survivable.
 */
function climb(tier: HoopsTier, seed: number, cap: number): {
  years: number; rung: number; titles: number; jobs: number; sackings: number;
  complete: boolean; skipped: boolean; identity: boolean; log: string[];
} {
  const bottom = RUNGS[0];
  const pool = teamsAtLevel(bottom.level);
  const career = createCareer({
    mode: 'challenge',
    teamId: pool[seed % pool.length].id,
    tier,
    seed,
    situation: 'rebuild',
  });
  const log: string[] = [];
  let jobs = 1;
  let sackings = 0;
  let skipped = false;
  let identity = true;
  const coach = career.coach;

  for (let i = 0; i < cap && !career.challenge!.complete; i++) {
    const before = career.challenge!.rungIndex;
    playSeason(career);
    if (career.challenge!.complete) break;

    if (awaitingDecision(career)) {
      const state = career.challenge!;
      const kind = state.offerKind;
      if (kind === 'demotion') sackings++;
      // A plausible coach: the best programme that will have him.
      const pick = [...state.offers!].sort((a, b) => b.standing - a.standing)[0];
      if (pick.rungIndex > before + 1) skipped = true;
      log.push(`  y${String(state.totalYears).padStart(2)} `
        + `${kind === 'promotion' ? 'won it at' : kind === 'demotion' ? 'sacked at' : 'rehired at'}`
        + ` ${rungAt(before).short} -> ${pick.teamShort}`
        + ` (${rungAt(pick.rungIndex).short}, ${SITUATIONS[pick.situation].label.toLowerCase()})`);
      takeJob(career, pick);
      jobs++;
      if (career.coach !== coach) identity = false;
    }
  }

  const state = career.challenge!;
  return {
    years: state.totalYears,
    rung: state.rungIndex,
    titles: Object.values(state.titles).reduce((a, b) => a + b, 0),
    jobs,
    sackings,
    complete: state.complete,
    skipped,
    identity: identity && career.coach === coach,
    log,
  };
}

console.log('\nA CHALLENGE CAREER\n');

{
  const run = climb('standard', 31, 60);
  for (const line of run.log.slice(0, 12)) console.log(line);
  console.log(`  ${run.years} seasons, ${run.jobs} jobs, ${run.titles} championships,`
    + ` ${run.sackings} sackings, reached ${rungAt(run.rung).short}`
    + `${run.complete ? ' — CLIMB COMPLETE' : ''}`);

  check('a challenge career runs for decades without breaking', run.years >= 20,
    `${run.years} seasons`);
  check('the coach climbs by winning', run.titles > 0 && run.rung > 0,
    `${run.titles} titles, rung ${run.rung + 1}/${RUNGS.length}`);
  check('and never skips a rung', !run.skipped);
  check('the coach is the same person at every programme', run.identity);
  check('a career is more than one job', run.jobs > 1, `${run.jobs} jobs`);
  check('the climb is long', run.years > 12, `${run.years} seasons so far`);
  check('and it finishes', run.complete && run.rung === RUNGS.length - 1,
    `${run.complete ? 'complete' : `stuck at ${rungAt(run.rung).short}`}`);
  check('a sacking is survivable', run.sackings === 0 || run.complete,
    `${run.sackings} sackings and still ${run.complete ? 'finished' : 'climbing'}`);

  /* THE FIVE TIERS, ON THE SAME CLIMB. Difficulty in this game never touches an
   * opponent's rating, so the only honest way to check that a tier is harder is
   * to coach it: fewer rungs in the same number of seasons, and more sackings. */
  console.log('');
  const paces: { tier: HoopsTier; rung: number; titles: number; sacked: number }[] = [];
  const LIFETIME = 44;
  for (const tier of TIER_ORDER) {
    const r = climb(tier, 31, LIFETIME);
    paces.push({ tier, rung: r.rung, titles: r.titles, sacked: r.sackings });
    console.log(`  ${TIERS[tier].name.padEnd(12)} ${LIFETIME} seasons ->`
      + ` ${rungAt(r.rung).short.padEnd(5)} ${r.titles} titles, ${r.sackings} sackings`);
  }
  check('an easier tier climbs further in the same lifetime',
    paces[0].rung > paces[paces.length - 1].rung,
    `${rungAt(paces[0].rung).short} vs ${rungAt(paces[paces.length - 1].rung).short}`);
  /* The hardest tier is allowed to be brutal. It is not allowed to be a wall: a
   * coach who works a whole lifetime at it must be able to win SOMETHING, or the
   * setting is not a difficulty, it is a locked door. */
  check('every tier is coachable — none is a brick wall',
    paces.every((p) => p.titles > 0),
    paces.map((p) => `${p.titles}`).join('/'));
  check('and the ladder does not invert',
    paces[0].rung >= paces[2].rung && paces[2].rung >= paces[4].rung,
    paces.map((p) => rungAt(p.rung).short).join(' >= '));
}

/* ----------------------------------------------------------- the portal */

console.log('\nTHE PORTAL\n');

{
  const c = createCareer({ mode: 'dynasty', teamId: teamsAtLevel('d2')[9].id, seed: 777 });
  simulateRestOfSeason(c);
  runOffseason(c);
  check('a window opens', c.market.length > 0, `${c.market.length} names`);
  check('every target says what he wants',
    c.market.every((t) => Object.values(t.wants).some((w) => w > 0.5)));
  const target = openTargets(c.market)[0];
  const perks = perksOf(c.coach);
  let signed = false;
  for (let i = 0; i < 3 && target.status === 'open'; i++) {
    const r = pitchTo(
      target,
      { standing: 60, form: 0.6, perks, needs: needsFor(c), level: c.level },
      c.teamId, perks, modsFor(c.tier), c.seed,
    );
    if (r.signed) signed = true;
  }
  check('an approach resolves one way or the other',
    target.status !== 'open', target.status);
  check('and a signed transfer joins the squad', (() => {
    if (!signed) return true;
    const before = c.roster.length;
    startNextSeason(c);
    return c.roster.length > before - 1;
  })());
  check('players leave for reasons that are stated',
    c.portalOut.every((d) => d.text.length > 0));
}

/* ------------------------------------------------------------ difficulty */

console.log('\nTHE DIFFICULTY LADDER\n');

{
  const rows: string[] = [];
  const results: { tier: string; wins: number; cp: number; squad: number; gap: number }[] = [];
  for (const tier of TIER_ORDER) {
    const c = createCareer({
      mode: 'challenge', teamId: teamsAtLevel('hs-big')[10].id, tier, seed: 31337,
    });
    let wins = 0;
    for (let y = 0; y < 4; y++) {
      playSeason(c);
      const last = c.history[c.history.length - 1];
      wins += last.wins;
    }
    const squad = teamRatings(c.roster).overall;
    results.push({
      tier: TIERS[tier].name, wins, cp: c.coach.points + spent(c), squad, gap: squadGap(c),
    });
    rows.push(`  ${TIERS[tier].name.padEnd(12)} ${String(wins).padStart(3)} wins in 4 years`
      + `   squad ${String(squad).padStart(2)}`
      + `   ${c.coach.owned.length} upgrades`
      + `   CP earned ${String(c.coach.points + spent(c)).padStart(3)}`);
  }
  for (const r of rows) console.log(r);

  check('a harder tier earns fewer Coach Points',
    results[0].cp > results[results.length - 1].cp,
    `${results[0].cp} vs ${results[results.length - 1].cp}`);
  check('and starts further behind',
    results[0].squad >= results[results.length - 1].squad,
    `${results[0].squad} vs ${results[results.length - 1].squad}`);
  /* The ordering that is a PROPERTY of the table rather than of one four-year
 * sample: the multipliers themselves. What a coach actually earns depends on how
 * many games he won, so a lucky run on a hard tier can out-earn an unlucky one on
 * an easy tier without anything being wrong. */
check('the point economy tightens at every step',
  TIER_ORDER.every((t, i) => i === 0
    || modsFor(TIER_ORDER[i - 1]).coachPoints > modsFor(t).coachPoints),
  TIER_ORDER.map((t) => modsFor(t).coachPoints).join(' > '))
}

function spent(c: HoopsCareer): number {
  let n = 0;
  for (const key of c.coach.owned) {
    const u = UPGRADES.find((x) => x.key === key);
    if (u) n += Math.round(u.cost * modsFor(c.tier).upgradeCost);
  }
  return n;
}

/* ------------------------------------------------------------ determinism */

console.log('\nTHE SAME CAREER TWICE\n');

{
  const run = (): string => {
    const c = createCareer({ mode: 'dynasty', teamId: teamsAtLevel('d3')[4].id, seed: 8080 });
    for (let y = 0; y < 3; y++) playSeason(c);
    return JSON.stringify({
      history: c.history,
      roster: c.roster.map((p) => `${p.id}:${p.overall}`),
      cp: c.coach.points,
      drift: c.standingDrift,
    });
  };
  check('the same seed plays the same career', run() === run());
}

/* ------------------------------------------------------------------- done */

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log(`\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  env?.exit(1);
}
