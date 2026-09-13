/**
 * ROSTER NEEDS, AND WHETHER RECRUITS CAN SEE THEM
 *
 * The rule this harness exists to hold: a player weighs the depth chart he
 * would JOIN, not the one that exists today. Three goalkeepers committing to a
 * programme that needed one is the failure mode, and it is only visible if the
 * fourth goalkeeper knows about the first three.
 *
 * Everything here drives the real interest models — `interestFactors` for the
 * recruiting class and `interestIn` for the portal — so a pass means the game
 * behaves this way, not that a helper function does.
 *
 *   npm run needs
 */
import {
  advancePhase, createCareer, effectiveTeam, nextUserGame, programSnapshot,
  recruitContext, runOffseason, simulateUserGame,
} from '../league/career';
import {
  computeNeeds, incomingPlayers, playingTimeOutlook, rosterNeeds,
} from '../league/rosterNeeds';
import { interestFactors, interestTarget } from '../scouting/recruiting';
import { buildClass } from '../scouting/prospects';
import { interestIn } from '../league/transfers';
import { generateRoster } from '../data/players';
import { getTeam } from '../data/teams';
import type { Career } from '../league/types';
import type { Position } from '../data/constants';
import type { Prospect } from '../scouting/prospects';

const env = (globalThis as { process?: { exit(n: number): void } }).process;
const problems: string[] = [];
let checks = 0;
function check(name: string, ok: boolean, detail = ''): void {
  checks++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) problems.push(name);
}

/** A dynasty career with a real squad, a real class and a real market. */
function career(): Career {
  const c = createCareer({
    mode: 'dynasty', teamId: 'highland-park', difficulty: 'varsity',
    gameLength: 'short', seed: 31337,
  });
  // Play a season so the class opens and the portal fills, which is when a
  // coach actually looks at any of this.
  let guard = 0;
  while (guard++ < 400) {
    const g = nextUserGame(c);
    if (!g) break;
    simulateUserGame(c, g);
  }
  advancePhase(c);
  runOffseason(c);
  return c;
}

/** A prospect at a chosen position and rating, built by the real class builder. */
function prospectAt(c: Career, pos: Position, overall: number): Prospect {
  const pool = buildClass('needs:class', {
    level: c.level, size: 40, origin: 'hs', shell: effectiveTeam(c, c.teamId),
  });
  const exact = pool.filter((p) => p.player.pos === pos)
    .sort((a, b) => Math.abs(a.player.overall - overall) - Math.abs(b.player.overall - overall))[0];
  const p = exact ?? pool[0];
  // Put him exactly where the test wants him, keeping everything else real —
  // the ranking included. A prospect rated 64 whose hype still says 80 is not a
  // player the game could ever produce, and he reads as out of reach for a
  // reason that has nothing to do with what is being measured here.
  p.player.pos = pos;
  p.player.overall = overall;
  p.hype = overall + 2;
  return p;
}

/* ----------------------------------------------------- 1. the arithmetic */

{
  const c = career();
  const needs = rosterNeeds(c);
  console.log(`ROSTER NEEDS — ${c.roster.length} players, ${needs.openSpots} open\n`);
  console.log('pos   have  leaving  returning  incoming  projected  slots  open  avg  starters  need');
  for (const n of needs.list) {
    console.log(
      `${n.pos.padEnd(5)}${String(n.have).padStart(4)}${String(n.leaving).padStart(9)}`
      + `${String(n.returning).padStart(11)}${String(n.incoming).padStart(10)}`
      + `${String(n.projected).padStart(11)}${String(n.slots).padStart(7)}${String(n.open).padStart(6)}`
      + `${String(n.avgOverall).padStart(5)}${String(n.starterOverall).padStart(10)}  ${n.needLabel}`,
    );
  }
  console.log();

  check('every position is accounted for', needs.list.length === 5);
  check('have equals leaving plus returning',
    needs.list.every((n) => n.have === n.leaving + n.returning));
  check('projected equals returning plus incoming',
    needs.list.every((n) => n.projected === n.returning + n.incoming));
  check('open spots are never negative', needs.list.every((n) => n.open >= 0));
  check('the squad adds up', needs.list.reduce((t, n) => t + n.have, 0) === c.roster.length);
  check('averages match the roster', needs.list.every((n) => {
    const here = c.roster.filter((p) => p.pos === n.pos);
    if (!here.length) return n.avgOverall === 0;
    const mean = Math.round(here.reduce((t, p) => t + p.overall, 0) / here.length);
    return n.avgOverall === mean;
  }));
}

/* ------------------------------- 2. TEST 3 — commitments count immediately */

{
  const c = career();
  const state = c.recruiting!;
  // One keeper on the books, so there is a real place to fill before anybody
  // commits — otherwise "the commitments closed the open places" proves nothing.
  const keepers0 = c.roster.filter((p) => p.pos === 'G');
  c.roster = c.roster.filter((p) => p.pos !== 'G').concat(keepers0.slice(0, 1));
  const before = rosterNeeds(c).byPos.G;
  // A prospect the programme could plausibly sign: one it has no chance with is
  // pinned at zero interest and would hide the effect being measured.
  const keeper = prospectAt(c, 'G', 64);
  const ctxBefore = recruitContext(c);
  const interestBefore = interestTarget(keeper, ctxBefore, c.level);

  // Three goalkeepers commit. Nothing else changes.
  const keepers = state.prospects.filter((p) => p.player.pos === 'G').slice(0, 3);
  for (const k of keepers) k.committedTo = c.teamId;
  const missing = 3 - keepers.length;
  for (let i = 0; i < missing; i++) {
    const spare = state.prospects.find((p) => !p.committedTo && p.player.pos !== 'G');
    if (spare) { spare.player.pos = 'G'; spare.committedTo = c.teamId; }
  }

  const after = rosterNeeds(c).byPos.G;
  const ctxAfter = recruitContext(c);
  const interestAfter = interestTarget(keeper, ctxAfter, c.level);

  check('three commitments show up in the depth chart at once',
    after.incoming >= 3 && after.incoming > before.incoming,
    `${before.incoming} -> ${after.incoming} incoming`);
  check('and they close the open places', before.open > 0 && after.open === 0,
    `${before.open} -> ${after.open} open`);
  check('a fourth goalkeeper is much less interested', interestAfter < interestBefore - 8,
    `${interestBefore.toFixed(0)} -> ${interestAfter.toFixed(0)} interest`);
  const reasons = interestFactors(keeper, ctxAfter, c.level).map((f) => f.label);
  check('and he says why', reasons.some((r) => /full|behind|sit|nothing left/i.test(r)),
    reasons.join(' | '));

  // The exception the brief asks for: a keeper who is plainly better than the
  // ones already coming in is looking at a job, not a queue. Measured on the
  // opportunity itself — whether he FANCIES the programme is a separate
  // question, and an elite prospect turning down a mid programme is correct.
  const needsAfter = rosterNeeds(c);
  const better = playingTimeOutlook(needsAfter, 'G', needsAfter.byPos.G.starterLine + 12);
  const worse = playingTimeOutlook(needsAfter, 'G', needsAfter.byPos.G.starterLine - 10);
  check('a clearly better goalkeeper still sees a way in', better.delta > worse.delta && better.starts,
    `${worse.delta} ("${worse.label}") -> ${better.delta} ("${better.label}")`);
}

/* ------------------------------ 3. TEST 4 — a weak position with room */

{
  const c = career();
  const shape = rosterNeeds(c);
  // Strip the defence back to three tired bodies and gut their ratings, leaving
  // real open places; leave attack stacked and good.
  const defs = c.roster.filter((p) => p.pos === 'D');
  c.roster = c.roster.filter((p) => p.pos !== 'D').concat(defs.slice(0, 3).map((p) => {
    p.overall = 62;
    return p;
  }));
  const needs = rosterNeeds(c);
  check('a gutted position reads as a high need',
    needs.byPos.D.need >= 3, `${needs.byPos.D.needLabel}, ${needs.byPos.D.open} open`);
  check('a full position does not', needs.byPos.A.need <= needs.byPos.D.need,
    `attack ${needs.byPos.A.needLabel} v defence ${needs.byPos.D.needLabel}`);
  void shape;

  const ctx = recruitContext(c);
  const defender = prospectAt(c, 'D', 76);
  const attacker = prospectAt(c, 'A', 76);
  const dInterest = interestTarget(defender, ctx, c.level);
  const aInterest = interestTarget(attacker, ctx, c.level);
  check('the defender sees the opportunity the attacker does not',
    dInterest > aInterest + 8, `defence ${dInterest.toFixed(0)} v attack ${aInterest.toFixed(0)}`);
  const why = interestFactors(defender, ctx, c.level).map((f) => f.label);
  check('and the reason is playing time', why.some((r) => /start|open|priority/i.test(r)),
    why.join(' | '));
}

/* ------------------------------------ 4. overload: quality, not just count */

{
  // A stacked, elite attack against a thin, poor defence — the brief's example.
  const roster = generateRoster(getTeam('highland-park'), 'overload', 'hs');
  // Nobody graduating: this test is about a crowded position, not an emptying
  // one, and a senior-heavy squad would open the places it is measuring.
  for (const p of roster) p.grade = 10;
  const attack = roster.filter((p) => p.pos === 'A');
  [95, 90, 88, 85].forEach((ovr, i) => { if (attack[i]) attack[i].overall = ovr; });
  const defence = roster.filter((p) => p.pos === 'D');
  [72, 69, 67].forEach((ovr, i) => { if (defence[i]) defence[i].overall = ovr; });
  const thin = roster.filter((p) => p.pos !== 'D').concat(defence.slice(0, 3));
  const needs = computeNeeds(thin, 'hs');

  const intoAttack = playingTimeOutlook(needs, 'A', 84);
  const intoDefence = playingTimeOutlook(needs, 'D', 84);
  check('an 84 attacker behind 95-90-88 sees competition', intoAttack.delta < 0,
    `${intoAttack.delta} — "${intoAttack.label}"`);
  check('an 84 defender behind 72-69-67 sees a job', intoDefence.delta > 10,
    `${intoDefence.delta} — "${intoDefence.label}"`);
  check('the difference is large', intoDefence.delta - intoAttack.delta > 20,
    `${intoAttack.delta} v ${intoDefence.delta}`);
}

/* ------------------------------------------- 5. the portal reads it too */

{
  const c = career();
  const snap = programSnapshot(c);
  check('the transfer market sees the same needs',
    !!snap.needs && snap.needs.list.length === 5);
  check('and the same commitments', snap.committed.length === incomingPlayers(c).length);

  const target = c.market[0];
  if (target) {
    const pos = target.player.pos;
    const base = interestIn(target, snap).score;
    // Commit three players at his position and ask again.
    const state = c.recruiting!;
    let filled = 0;
    for (const p of state.prospects) {
      if (filled >= 3) break;
      if (p.committedTo) continue;
      p.player.pos = pos;
      p.player.overall = Math.max(p.player.overall, target.player.overall + 5);
      p.committedTo = c.teamId;
      filled++;
    }
    const after = interestIn(target, programSnapshot(c)).score;
    check('a transfer loses interest once his position fills up', after < base,
      `${base.toFixed(0)} -> ${after.toFixed(0)} at ${pos}`);
  } else {
    check('a transfer loses interest once his position fills up', false, 'no market to test');
  }
}

console.log();
if (problems.length) {
  console.log(`${problems.length} of ${checks} checks FAILED:`);
  for (const p of problems) console.log(`  - ${p}`);
  env?.exit(1);
} else {
  console.log(`${checks}/${checks} checks passed`);
}
