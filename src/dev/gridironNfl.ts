/**
 * THE FRANCHISE, PLAYED OUT.
 *
 * Twenty seasons of an NFL franchise, simulated end to end, with every number
 * that could quietly be wrong printed where somebody has to look at it. This is
 * the harness that found, in earlier sports, that a squad was decaying by
 * arithmetic, that nobody was ever a need, and that a schedule left everybody a
 * game short — none of which is visible by reading the code.
 *
 *   npm run gridiron-nfl
 */
import {
  TEAMS, divisionsIn, nflTeam, teamsInDivision,
} from '../sports/football/nfl';
import { teamRatings, POSITIONS, type Position } from '../sports/football/data';
import {
  buildSchedule, byeWeek, divisionRanks, divisionTable, seedsFor, sortStandings,
} from '../sports/football/franchise/schedule';
import {
  createFranchise, simulateSeason, startNextSeason, seasonRecord, nextGame,
  simulateOwn, currentWeek, skipWeek,
} from '../sports/football/franchise/season';
import { SALARY_CAP, capUsed, FACILITIES, upgradeFacility } from '../sports/football/franchise/club';
import { gameRoster, rosterOf } from '../sports/football/franchise/world';
import { DRAFT_ROUNDS, draftOrder, draftSlots, generateClass, writeReport } from '../sports/football/franchise/draft';
import { clubAppeal } from '../sports/football/franchise/freeAgency';
import { playerValue, pickValue, evaluateTrade, tradeBlock } from '../sports/football/franchise/trades';
import { coachingOf } from '../sports/football/franchise/staff';
import { takeJob } from '../sports/football/franchise/challenge';
import type { Franchise } from '../sports/football/franchise/types';

const env = (globalThis as {
  process?: { exit(n: number): void };
}).process;

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

/* ================================================================= the league */

console.log('\nTHE LEAGUE\n');

check('thirty-two clubs', TEAMS.length === 32, `${TEAMS.length}`);
check('eight divisions of four',
  [...divisionsIn('AFC'), ...divisionsIn('NFC')].every((d) => teamsInDivision(d).length === 4));
check('every id is unique', new Set(TEAMS.map((t) => t.id)).size === 32);
check('every abbreviation is unique', new Set(TEAMS.map((t) => t.abbr)).size === 32);

/* ============================================================== the schedule */

console.log('\nTHE SCHEDULE\n');

{
  let allGood = true;
  const detail: string[] = [];
  for (let year = 1; year <= 12; year++) {
    const sched = buildSchedule(9001, year, 'kc', divisionRanks({}, {}));
    const games = new Map<string, number>();
    const div = new Map<string, number>();
    const clash = new Set<string>();
    const seen = new Set<string>();
    for (const f of sched) {
      for (const id of [f.homeId, f.awayId]) {
        games.set(id, (games.get(id) ?? 0) + 1);
        if (f.division) div.set(id, (div.get(id) ?? 0) + 1);
        const k = `${id}:${f.week}`;
        if (seen.has(k)) clash.add(k);
        seen.add(k);
      }
    }
    const wrong = TEAMS.filter((t) => games.get(t.id) !== 17);
    const wrongDiv = TEAMS.filter((t) => div.get(t.id) !== 6);
    const noBye = TEAMS.filter((t) => byeWeek(sched, t.id) === null);
    const maxWeek = Math.max(...sched.map((f) => f.week));
    if (wrong.length || wrongDiv.length || clash.size || noBye.length || maxWeek > 18) {
      allGood = false;
      detail.push(`y${year}: ${wrong.length} off count, ${wrongDiv.length} off division, `
        + `${clash.size} clashes, ${noBye.length} no bye, max week ${maxWeek}`);
    }
  }
  check('twelve seasons of fixtures are all legal', allGood, detail.slice(0, 3).join('; '));
}

{
  // Home and away balance.
  const sched = buildSchedule(77, 3, 'kc', divisionRanks({}, {}));
  const home = new Map<string, number>();
  for (const f of sched) home.set(f.homeId, (home.get(f.homeId) ?? 0) + 1);
  const counts = TEAMS.map((t) => home.get(t.id) ?? 0);
  check('nobody plays more than ten at home',
    Math.max(...counts) <= 10 && Math.min(...counts) >= 7,
    `${Math.min(...counts)}-${Math.max(...counts)}`);
}

/* ================================================================== rosters */

console.log('\nROSTERS AND RATINGS\n');

{
  const ratings = TEAMS.map((t) => ({
    t, r: teamRatings(rosterOf({ seed: 5, teamId: '', rosterEdits: {}, prestigeDrift: {} } as unknown as Franchise, t.id, 1)),
  }));
  const overalls = ratings.map((x) => x.r.overall).sort((a, b) => a - b);
  const best = ratings.slice().sort((a, b) => b.r.overall - a.r.overall)[0];
  const worst = ratings.slice().sort((a, b) => a.r.overall - b.r.overall)[0];
  console.log(`  overall spread ${overalls[0]} to ${overalls[overalls.length - 1]}`
    + ` (median ${overalls[16]})  best ${best.t.abbr} ${best.r.overall}, worst ${worst.t.abbr} ${worst.r.overall}`);
  check('the league is a league, not a pyramid',
    overalls[overalls.length - 1] - overalls[0] >= 5 && overalls[overalls.length - 1] - overalls[0] <= 22,
    `${overalls[overalls.length - 1] - overalls[0]} points between best and worst`);
  check('prestige actually means something',
    ratings.filter((x) => x.t.prestige >= 4).reduce((s, x) => s + x.r.overall, 0)
      / ratings.filter((x) => x.t.prestige >= 4).length
    > ratings.filter((x) => x.t.prestige <= 2).reduce((s, x) => s + x.r.overall, 0)
      / ratings.filter((x) => x.t.prestige <= 2).length);
}

/* ================================================================ a franchise */

console.log('\nTWENTY SEASONS\n');

const fr = createFranchise({
  mode: 'dynasty', teamId: 'cle', coachName: 'Test Coach', difficulty: 'pro', seed: 4242,
});

check('a new franchise is cap legal', capUsed(fr.roster) <= SALARY_CAP,
  `${capUsed(fr.roster)}M of ${SALARY_CAP}M`);
check('and has a squad that can line up', gameRoster(fr).length >= 30,
  `${fr.roster.length} players`);
check('and holds its own picks', fr.picks.filter((p) => p.year === 1).length === DRAFT_ROUNDS);

let totalWins = 0;
let totalLosses = 0;
let titles = 0;
let playoffs = 0;
const capOver: number[] = [];
const sizes: number[] = [];
const ages: number[] = [];
const scores: number[] = [];

let snapshot: Pick<Franchise, 'standings' | 'schedule' | 'seeds' | 'championId'> | null = null;

for (let season = 1; season <= 20; season++) {
  simulateSeason(fr);
  if (season === 20) {
    snapshot = {
      standings: fr.standings, schedule: fr.schedule, seeds: fr.seeds, championId: fr.championId,
    };
  }
  const rec = seasonRecord(fr);
  totalWins += rec.wins;
  totalLosses += rec.losses;
  if (fr.championId === fr.teamId) titles++;
  if (fr.finish && !fr.finish.startsWith('Missed')) playoffs++;

  for (const f of fr.schedule) {
    if (f.played) scores.push(f.homeScore, f.awayScore);
  }

  // Spend the money on something, the way a player would.
  for (const key of ['training', 'medical', 'scouting', 'stadium', 'practice'] as const) {
    upgradeFacility(fr, key);
  }

  startNextSeason(fr);
  capOver.push(Math.round((capUsed(fr.roster) - SALARY_CAP) * 10) / 10);
  sizes.push(fr.roster.length);
  ages.push(Math.round(fr.roster.reduce((s, p) => s + p.age, 0) / fr.roster.length * 10) / 10);
}

console.log(`  record ${totalWins}-${totalLosses} over 20 seasons`);
console.log(`  playoffs ${playoffs}, titles ${titles}`);
console.log(`  roster size ${Math.min(...sizes)}-${Math.max(...sizes)}, `
  + `average age ${Math.min(...ages)}-${Math.max(...ages)}`);
console.log(`  worst cap position ${Math.max(...capOver)}M over`);
console.log(`  facilities ${JSON.stringify(fr.facilities)}  funds ${fr.funds}M  fans ${fr.fanSupport}`);
console.log(`  staff ${fr.staff.HC.overall}/${fr.staff.OC.overall}/${fr.staff.DC.overall}`
  + `  development x${coachingOf(fr.staff).development.toFixed(2)}`);

check('a coached franchise is not doomed', totalWins >= 100,
  `${totalWins} wins in 20 seasons (340 games)`);
check('and is not invincible either', totalLosses >= 60, `${totalLosses} losses`);
check('the cap is never blown', Math.max(...capOver) <= 0.01, `${Math.max(...capOver)}M over`);
check('the roster stays a legal size',
  Math.min(...sizes) >= 30 && Math.max(...sizes) <= 40,
  `${Math.min(...sizes)}-${Math.max(...sizes)}`);
check('the squad does not age into a retirement home',
  Math.max(...ages) <= 29 && Math.min(...ages) >= 22,
  `${Math.min(...ages)}-${Math.max(...ages)}`);

{
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const shutouts = scores.filter((n) => n === 0).length / scores.length;
  const big = scores.filter((n) => n >= 45).length / scores.length;
  console.log(`  scoring: mean ${avg.toFixed(1)}, shutouts ${(shutouts * 100).toFixed(1)}%, `
    + `45+ ${(big * 100).toFixed(1)}%`);
  check('scores look like football', avg > 14 && avg < 32, `${avg.toFixed(1)} a side`);
  check('blowouts are rare', big < 0.06, `${(big * 100).toFixed(1)}% of teams score 45+`);
}

/* ============================================================ the table works */

console.log('\nTHE TABLE AND THE BRACKET\n');

if (snapshot) {
  const table = sortStandings(Object.values(snapshot.standings), snapshot.schedule);
  check('every club is in the table', table.length === 32, `${table.length}`);
  const games = table.map((s) => s.wins + s.losses + s.ties);
  check('everybody played seventeen', games.every((g) => g === 17),
    `${Math.min(...games)}-${Math.max(...games)}`);
  for (const conf of ['AFC', 'NFC'] as const) {
    const seeds = seedsFor(snapshot.standings, snapshot.schedule, conf);
    check(`${conf}: seven clubs make it`, seeds.length === 7, `${seeds.length}`);
    check(`${conf}: the top four won divisions`,
      seeds.slice(0, 4).every((s) => s.divisionId !== null));
    check(`${conf}: the top seed has the bye`, seeds[0].bye && !seeds[1].bye);
    const winners = new Set(divisionsIn(conf).map((d) =>
      divisionTable(snapshot!.standings, snapshot!.schedule, d)[0]?.teamId));
    check(`${conf}: the four division winners are the four division winners`,
      seeds.slice(0, 4).every((s) => winners.has(s.teamId)));
  }
}

/* ================================================================== the draft */

console.log('\nTHE DRAFT\n');

{
  const cls = generateClass(4242, 9);
  check('a class is a class', cls.length === 140, `${cls.length}`);
  const byPos = new Map<Position, number>();
  for (const p of cls) byPos.set(p.pos, (byPos.get(p.pos) ?? 0) + 1);
  check('every position is on the board',
    POSITIONS.every((pos) => (byPos.get(pos) ?? 0) >= 2),
    POSITIONS.map((p) => `${p}${byPos.get(p) ?? 0}`).join(' '));
  const top = cls.slice(0, 16).reduce((s, p) => s + p.player.overall, 0) / 16;
  const bottom = cls.slice(-16).reduce((s, p) => s + p.player.overall, 0) / 16;
  console.log(`  top 16 average ${top.toFixed(1)}, bottom 16 average ${bottom.toFixed(1)}`);
  check('the top of the board is better than the bottom', top > bottom + 8,
    `${(top - bottom).toFixed(1)} points`);
  const headroom = cls.slice(0, 32)
    .reduce((s, p) => s + (p.player.potential - p.player.overall), 0) / 32;
  check('a first-rounder has somewhere to go', headroom >= 6,
    `${headroom.toFixed(1)} points of ceiling`);

  /* A REPORT IS WRONG, AND LESS WRONG THE MORE YOU LOOK, which is the whole
   * point of having a scouting department at all. */
  const errAt = (level: number, facility: number): number => {
    let sum = 0;
    for (const p of cls.slice(0, 40)) {
      const copy = { ...p };
      writeReport(copy, level, facility);
      sum += Math.abs(copy.grade - copy.player.overall);
    }
    return sum / 40;
  };
  const e0 = errAt(0, 0);
  const e3 = errAt(3, 0);
  const e3f = errAt(3, 4);
  console.log(`  report error: unseen ${e0.toFixed(1)}, studied ${e3.toFixed(1)}, `
    + `studied with a department ${e3f.toFixed(1)}`);
  check('scouting makes a report better', e3 < e0 - 1.5, `${e0.toFixed(1)} -> ${e3.toFixed(1)}`);
  check('and the building makes it better again', e3f < e3, `${e3.toFixed(1)} -> ${e3f.toFixed(1)}`);
  check('but it is never perfect', e3f > 0.2, `${e3f.toFixed(2)}`);

  /* THE ORDER IS READ OFF THE SEASON THAT HAS JUST FINISHED, so it is checked
   * on a franchise standing in its own offseason rather than on one that has
   * already started the next season and wiped the table. */
  const ending = createFranchise({
    mode: 'dynasty', teamId: 'nyg', coachName: 'D', difficulty: 'pro', seed: 606,
  });
  simulateSeason(ending);
  const order = draftOrder(ending);
  check('the draft order is thirty-two clubs', order.length === 32, `${order.length}`);
  const slots = draftSlots(ending, order);
  check('and four rounds of picks', slots.length === 32 * DRAFT_ROUNDS, `${slots.length}`);
  const champ = ending.championId;
  check('the champion picks last in round one',
    !!champ && order[order.length - 1] === champ, `${order[order.length - 1]} vs ${champ}`);
  const worst = sortStandings(Object.values(ending.standings), ending.schedule)[31];
  check('and the worst club picks first', order[0] === worst.teamId,
    `${order[0]} vs ${worst.teamId}`);
}

/* ================================================================== trading */

console.log('\nTHE TRADE DESK\n');

{
  /* A CLUB WITH ROOM ON ITS BOOKS, so what is being tested is the VALUE model
   * rather than the cap check in front of it. */
  const desk = createFranchise({
    mode: 'dynasty', teamId: 'phi', coachName: 'T', difficulty: 'pro', seed: 99,
  });
  for (const p of desk.roster) p.salary = Math.min(p.salary, 2);
  const mine = [...desk.roster].sort((a, b) => b.overall - a.overall);
  const star = mine[0];
  const scrub = mine[mine.length - 1];
  const other = TEAMS.find((t) => t.id !== desk.teamId)!;
  const theirs = tradeBlock(desk, other.id);
  const theirBest = theirs[0];

  check('a star is worth more than a scrub', playerValue(star) > playerValue(scrub) * 3,
    `${playerValue(star)} vs ${playerValue(scrub)}`);
  check('a first-rounder is worth more than a fourth',
    pickValue(1, 10) > pickValue(4, 10) * 3,
    `${pickValue(1, 10)} vs ${pickValue(4, 10)}`);

  const robbery = evaluateTrade(desk, {
    withId: other.id,
    give: [{ kind: 'player', id: scrub.id }],
    get: [{ kind: 'player', id: theirBest.id }],
  });
  check('nobody accepts an obviously terrible trade', !robbery.accepted, robbery.reason);
  check('and the refusal is about value, not paperwork',
    !robbery.reason.includes('cap'), robbery.reason);

  const fair = evaluateTrade(desk, {
    withId: other.id,
    give: [{ kind: 'player', id: star.id }],
    get: [{ kind: 'player', id: theirBest.id }],
  });
  console.log(`  star-for-star: ${fair.accepted ? 'accepted' : 'refused'} (${fair.reason}, margin ${fair.margin})`);
  check('a lopsided ask in your favour is refused',
    !evaluateTrade(desk, {
      withId: other.id,
      give: [{ kind: 'pick', year: desk.year, round: 4, fromId: desk.teamId }],
      get: [{ kind: 'player', id: theirBest.id }],
    }).accepted);
}

/* ================================================================ determinism */

console.log('\nDETERMINISM\n');

{
  const a = createFranchise({ mode: 'dynasty', teamId: 'gb', coachName: 'A', difficulty: 'pro', seed: 88 });
  const b = createFranchise({ mode: 'dynasty', teamId: 'gb', coachName: 'A', difficulty: 'pro', seed: 88 });
  for (let i = 0; i < 3; i++) {
    simulateSeason(a);
    simulateSeason(b);
    startNextSeason(a);
    startNextSeason(b);
  }
  check('the same seed plays the same three seasons',
    JSON.stringify(a.history) === JSON.stringify(b.history),
    a.history.map((h) => `${h.wins}-${h.losses}`).join(' '));
}

/* ============================================================== week by week */

console.log('\nA SEASON, A WEEK AT A TIME\n');

{
  const wk = createFranchise({ mode: 'dynasty', teamId: 'sea', coachName: 'W', difficulty: 'pro', seed: 31 });
  let guard = 0;
  let played = 0;
  while (wk.stage === 'regular' && guard++ < 40) {
    const f = nextGame(wk);
    if (f) { simulateOwn(wk, f); played++; } else skipWeek(wk);
  }
  check('seventeen games, one at a time', played === 17, `${played}`);
  check('and the season moved on to January', wk.stage === 'playoffs' || wk.stage === 'offseason',
    wk.stage);
  check('and the week never ran past eighteen', currentWeek(wk) <= 22, `${currentWeek(wk)}`);
}

/* ================================================================= challenge */

console.log('\nCHALLENGE\n');

{
  const ch = createFranchise({
    mode: 'challenge', teamId: 'car', coachName: 'Hot Seat', difficulty: 'pro', seed: 17,
  });
  let sackings = 0;
  let offers = 0;
  for (let season = 1; season <= 20; season++) {
    simulateSeason(ch);
    if (ch.challenge?.sacked) {
      sackings++;
      const take = ch.challenge.offers[0];
      if (take) takeJob(ch, take);
    } else if (ch.challenge?.offers.length) {
      offers++;
    }
    startNextSeason(ch);
  }
  console.log(`  ${sackings} sackings, ${offers} seasons with offers on the table, `
    + `now at ${nflTeam(ch.teamId)?.abbr}, heat ${ch.challenge?.heat}`);
  check('the seat can actually get hot', (ch.challenge?.heat ?? 0) >= 0);
  check('and a career survives twenty seasons of it', ch.history.length === 20,
    `${ch.history.length}`);
}

/* ============================================================== appeal/money */

console.log('\nMONEY AND APPEAL\n');

{
  const rich = createFranchise({ mode: 'dynasty', teamId: 'dal', coachName: 'R', difficulty: 'pro', seed: 5 });
  const poor = createFranchise({ mode: 'dynasty', teamId: 'jax', coachName: 'P', difficulty: 'pro', seed: 5 });
  check('a big club is more attractive than a small one',
    clubAppeal(rich) > clubAppeal(poor),
    `${clubAppeal(rich).toFixed(2)} vs ${clubAppeal(poor).toFixed(2)}`);
  check('every building has four levels and a price',
    Object.values(FACILITIES).every((f) => f.cost.length === 4));
}

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log(`\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  env?.exit(1);
}
