/**
 * DOES THE COMPUTER PLAY BASKETBALL?
 *
 * Aggregate box scores hide behaviour. A game can average a perfectly respectable
 * forty per cent from the floor while the CPU is doing something absurd on every
 * possession — and one absurd thing in particular was reported from play:
 *
 *   "If I play up on the ball handler, the AI can immediately pass into the paint
 *    and get an essentially free basket."
 *
 * That is invisible in a season's worth of totals and obvious in thirty seconds
 * of playing. So this file builds SPECIFIC SITUATIONS, puts the ten men exactly
 * where the situation says, and asks the AI what it would do — which is the only
 * way to test a decision rather than an average.
 *
 *   npm run hoops-ai
 */
import { HoopsGame } from '../sports/basketball/Game';
import { neutralHoopsInput } from '../sports/basketball/input';
import { TEAMS, generateRoster } from '../sports/basketball/data';
import { DIFFICULTIES } from '../sports/basketball/tuning';
import { COURT, attackRim } from '../sports/basketball/court';
import type { CourtPlayer } from '../sports/basketball/types';

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

function fresh(seed = 7, difficulty = DIFFICULTIES.pro): HoopsGame {
  const home = TEAMS[0];
  const away = TEAMS[1];
  const g = new HoopsGame({
    home: { team: home, roster: generateRoster(home, seed) },
    away: { team: away, roster: generateRoster(away, seed + 1) },
    humanSide: null,
    quarterSeconds: 600,
    difficulty,
    seed,
    label: 'ai test',
  });
  // Get past the tip so the game is live and the ball is in somebody's hands.
  const idle = neutralHoopsInput();
  for (let i = 0; i < 400 && g.phase !== 'live'; i++) g.update(1 / 60, idle);
  return g;
}

/** Put a man exactly somewhere and stop him dead. */
function place(p: CourtPlayer, x: number, y: number): void {
  p.x = x; p.y = y; p.z = 0; p.vx = 0; p.vy = 0; p.vz = 0;
}

/* ---------------------------------------------------- the paint-pass exploit */

console.log('\nTHE PAINT IS NOT A FREE BASKET\n');

{
  /* THE EXACT REPORTED SITUATION. Home has the ball at the top with a defender
   * right up on him. A home big stands in the lane. Three away defenders have
   * sunk in with him — which is what happens when you pressure the ball.
   *
   * TWO THINGS have to be true, and the first one is what the help defence is
   * for: a shot in that lane must be materially worse than the same shot in an
   * empty one. And given a genuinely good alternative — an open shooter at a
   * normal range, not a heave from the corner — the CPU must take it. */
  let firedIn = 0;
  let total = 0;
  let packedQuality = 0;
  let emptyQuality = 0;
  for (let seed = 0; seed < 60; seed++) {
    const g = fresh(seed);
    const off = g.teams.home;
    const def = g.teams.away;
    const rim = attackRim('home');

    const handler = off[0];
    const big = off[4];
    const openWing = off[1];
    place(handler, COURT.centerX + 14, COURT.centerY);
    place(big, rim.x - 4, COURT.centerY + 1);
    // A real three, at a real range, with nobody near him.
    place(openWing, rim.x - 22, COURT.centerY - 13);
    place(off[2], COURT.centerX + 8, COURT.width - 4);
    place(off[3], COURT.centerX + 16, COURT.width - 10);

    // Pressure on the ball, and everybody else sunk into the lane.
    place(def[0], handler.x - 1.6, handler.y);
    place(def[4], rim.x - 5.4, COURT.centerY + 3);
    // Genuinely IN the lane with him, which is what a packed paint is.
    place(def[1], rim.x - 5, COURT.centerY - 2.5);
    place(def[2], rim.x - 5, COURT.centerY + 4);
    place(def[3], COURT.centerX + 16, COURT.width - 11);

    g.giveBallForTest(handler);
    packedQuality += g.shotQualityFor(big);

    const target = g.aiPassChoice(handler);
    total++;
    if (target === big) firedIn++;

    /* The same shot with the lane cleared, to price what the help was worth. His
     * own man stays where he was — what is being measured is the value of
     * EVERYBODY ELSE being in there, which is what help defence is. */
    place(def[1], COURT.centerX + 4, 6);
    place(def[2], COURT.centerX + 4, COURT.width - 6);
    place(def[3], COURT.centerX + 4, COURT.centerY);
    emptyQuality += g.shotQualityFor(big);
  }
  packedQuality /= total;
  emptyQuality /= total;
  console.log(`  the same shot in the lane: ${(emptyQuality * 100).toFixed(1)}% with `
    + `one man on him, ${(packedQuality * 100).toFixed(1)}% with the help sunk in`);
  console.log(`  and the CPU threw it in there ${firedIn} times in ${total}`);

  check('help defence makes a shot in the lane materially worse',
    emptyQuality - packedQuality > 0.06,
    `${(emptyQuality * 100).toFixed(1)}% -> ${(packedQuality * 100).toFixed(1)}%`);
  check('with an open shooter available, the CPU does not force it inside',
    firedIn / total < 0.35, `${((firedIn / total) * 100).toFixed(0)}% of the time`);
}

{
  /* And the other half of the same rule: when the big man HAS genuinely sealed
   * and the lane is empty, the entry pass is the right basketball and the CPU
   * must still make it. A defence that can be beaten by nothing is as broken as
   * one that can be beaten by everything. */
  let firedIn = 0;
  let total = 0;
  for (let seed = 0; seed < 60; seed++) {
    const g = fresh(seed + 500);
    const off = g.teams.home;
    const def = g.teams.away;
    const rim = attackRim('home');

    const handler = off[0];
    const big = off[4];
    place(handler, COURT.centerX + 14, COURT.centerY);
    place(big, rim.x - 4, COURT.centerY + 1);
    place(off[1], COURT.centerX + 8, 4);
    place(off[2], COURT.centerX + 8, COURT.width - 4);
    place(off[3], COURT.centerX + 16, COURT.width - 10);

    // His man is BEHIND him — which is what a seal is — and everybody else is
    // out on the shooters. The lane to the post is genuinely empty.
    place(def[4], rim.x - 1.6, COURT.centerY + 1);
    place(def[0], handler.x - 4, handler.y);
    place(def[1], COURT.centerX + 8, 6);
    place(def[2], COURT.centerX + 8, COURT.width - 6);
    place(def[3], COURT.centerX + 16, COURT.width - 11);

    g.giveBallForTest(handler);
    const target = g.aiPassChoice(handler);
    total++;
    if (target === big) firedIn++;
  }
  console.log(`  big man sealed, lane empty: the CPU threw it inside `
    + `${firedIn} times in ${total}`);
  check('a genuine seal still gets the ball',
    firedIn / total > 0.4, `${((firedIn / total) * 100).toFixed(0)}% of the time`);
}

/* -------------------------------------------------------- open man vs covered */

console.log('\nTHE CPU FINDS THE OPEN MAN\n');

{
  let foundOpen = 0;
  let total = 0;
  for (let seed = 0; seed < 60; seed++) {
    const g = fresh(seed + 900);
    const off = g.teams.home;
    const def = g.teams.away;

    const handler = off[0];
    const openMan = off[1];
    const coveredMan = off[2];
    place(handler, COURT.centerX + 16, COURT.centerY);
    // Both on the arc, same distance, one guarded and one not.
    place(openMan, COURT.centerX + 12, 6);
    place(coveredMan, COURT.centerX + 12, COURT.width - 6);
    place(off[3], COURT.centerX + 24, COURT.centerY);
    place(off[4], COURT.centerX + 24, COURT.centerY + 6);

    place(def[0], handler.x - 2, handler.y);
    place(def[2], coveredMan.x - 0.8, coveredMan.y);
    place(def[1], COURT.centerX + 2, COURT.centerY);
    place(def[3], COURT.centerX + 26, COURT.centerY);
    place(def[4], COURT.centerX + 26, COURT.centerY + 6);

    g.giveBallForTest(handler);
    const target = g.aiPassChoice(handler);
    total++;
    if (target === openMan) foundOpen++;
    else if (target === coveredMan) foundOpen -= 0;
  }
  console.log(`  one open shooter, one guarded: found the open man `
    + `${foundOpen} times in ${total}`);
  check('the CPU passes to the open man rather than the covered one',
    foundOpen / total > 0.55, `${((foundOpen / total) * 100).toFixed(0)}%`);
}

/* ------------------------------------------------------------ the shot clock */

console.log('\nTHE CLOCK CHANGES THE DECISION\n');

{
  const early: number[] = [];
  const late: number[] = [];
  for (let seed = 0; seed < 40; seed++) {
    for (const clock of [22, 3]) {
      const g = fresh(seed + 1300);
      const off = g.teams.home;
      const handler = off[0];
      // A mediocre look: long two, a man nearby.
      place(handler, COURT.centerX + 22, COURT.centerY);
      place(g.teams.away[0], handler.x - 3.5, handler.y);
      for (let i = 1; i < 5; i++) {
        place(off[i], COURT.centerX + 14, 6 + i * 8);
        place(g.teams.away[i], COURT.centerX + 13, 6 + i * 8);
      }
      g.giveBallForTest(handler);
      g.setShotClockForTest(clock);
      (clock > 10 ? early : late).push(g.aiWantsShot(handler) ? 1 : 0);
    }
  }
  const rate = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  console.log(`  same mediocre look: shoots it ${(rate(early) * 100).toFixed(0)}% `
    + `early, ${(rate(late) * 100).toFixed(0)}% with three seconds left`);
  check('a bad shot early is passed up, and taken late',
    rate(late) > rate(early), `${(rate(early) * 100).toFixed(0)}% -> ${(rate(late) * 100).toFixed(0)}%`);
}

/* ------------------------------------------------------- defence reacts, late */

console.log('\nTHE DEFENCE IS NOT A MAGNET\n');

{
  /* A pass is thrown to an open man, and the defender ten feet away closes out.
   *
   * HE WILL ARRIVE. A man covering ten feet in the half-second a pass takes is
   * ordinary basketball, and a test that demanded he could not would be asking
   * the defence to be bad rather than late. What must be true is that he arrives
   * OUT OF CONTROL — still closing, hand not yet up — so the shot the receiver
   * gets is materially better than the one he would get against a defender who
   * was standing there all along. That difference is what makes a pass to an
   * open man worth throwing, and it is what a magnet defence destroys.
   */
  let closedOut = 0;
  let alreadyThere = 0;
  let n = 0;
  const idle = neutralHoopsInput();
  for (let seed = 0; seed < 40; seed++) {
    for (const far of [true, false]) {
      const g = fresh(seed + 1700);
      const off = g.teams.home;
      const def = g.teams.away;
      const handler = off[0];
      const receiver = off[1];
      place(handler, COURT.centerX + 16, COURT.centerY);
      place(receiver, COURT.centerX + 12, 7);
      // Either ten feet away, or standing on him from the start.
      place(def[1], far ? COURT.centerX + 6 : COURT.centerX + 12.8, far ? 16 : 7);
      for (let i = 2; i < 5; i++) {
        place(off[i], COURT.centerX + 20, 8 + i * 8);
        place(def[i], COURT.centerX + 19, 8 + i * 8);
      }
      place(def[0], handler.x - 2, handler.y);
      g.giveBallForTest(handler);
      g.pass(handler, receiver);
      for (let i = 0; i < 30 && g.ball.state === 'pass'; i++) g.update(1 / 60, idle);
      const q = g.shotQualityFor(receiver);
      if (far) { closedOut += q; n++; } else alreadyThere += q;
    }
  }
  closedOut /= Math.max(1, n);
  alreadyThere /= Math.max(1, n);
  console.log(`  catching against a closeout: ${(closedOut * 100).toFixed(1)}%`);
  console.log(`  catching against a man already there: ${(alreadyThere * 100).toFixed(1)}%`);
  check('a pass to an open man buys a better shot than a covered one',
    closedOut > alreadyThere + 0.02,
    `${(closedOut * 100).toFixed(1)}% v ${(alreadyThere * 100).toFixed(1)}%`);
}

/* ------------------------------------------------------ difficulty is visible */

console.log('\nAND THE TIER CHANGES HOW WELL IT IS PLAYED\n');

{
  /* THE QUALITY OF THE SHOTS IT ACTUALLY TAKES.
   *
   * Sampling whoever happens to be holding the ball measures men bringing it up
   * the floor, which is the same on every tier. What separates a good offence
   * from a bad one is the look it settles for, so this listens to the shots. */
  const quality: Record<string, number> = {};
  const giveaways: Record<string, number> = {};
  const conceded: Record<string, number> = {};
  for (const tier of ['rookie', 'pro', 'allstar', 'legend'] as const) {
    let sum = 0;
    let shots = 0;
    let turnovers = 0;
    let against = 0;
    const idle = neutralHoopsInput();
    for (let seed = 0; seed < 10; seed++) {
      const g = fresh(seed + 2100, DIFFICULTIES[tier]);
      g.events.on('shot', (e) => { sum += e.quality; shots++; });
      for (let i = 0; i < 90_000 && g.phase !== 'final'; i++) g.update(1 / 60, idle);
      /* UNFORCED giveaways only. Total turnovers rise with the tier because the
       * DEFENCE gets better at taking the ball, which is a different thing from
       * the offence throwing it away. What pass accuracy changes is the ball that
       * nobody stole — the one that simply did not arrive. */
      turnovers += (g.box.home.turnovers - g.box.away.steals)
        + (g.box.away.turnovers - g.box.home.steals);
      against += g.score.home + g.score.away;
    }
    quality[tier] = sum / Math.max(1, shots);
    giveaways[tier] = turnovers / 20;
    conceded[tier] = against / 20;
    console.log(`  ${tier.padEnd(9)} shoots a ${(quality[tier] * 100).toFixed(1)}% look`
      + `, throws it away ${giveaways[tier].toFixed(1)} times unforced`
      + `, scores ${conceded[tier].toFixed(1)}`);
  }

  /* EXECUTION, which is what separates the top tiers from each other. They make
   * much the same decisions; what changes is whether the pass arrives where it
   * was aimed. A sloppy team hands the ball over, and that is a difficulty
   * setting you can feel without anybody's rating being touched. */
  /* AND HOW ACCURATELY IT PASSES, measured directly rather than inferred.
   *
   * A sloppy pass mostly shows up as an INTERCEPTION rather than as a ball into
   * the third row, and on a harder tier the defence is better at taking those —
   * so total turnovers rise with the tier even as the passing improves, and no
   * turnover count can separate the two effects. What can is measuring where the
   * ball actually lands against where it was aimed. */
  const aimError = (tier: 'rookie' | 'pro' | 'allstar' | 'legend'): number => {
    let sum = 0;
    let n = 0;
    for (let seed = 0; seed < 30; seed++) {
      const g = fresh(seed + 3300, DIFFICULTIES[tier]);
      const off = g.teams.home;
      const handler = off[0];
      const receiver = off[1];
      place(handler, COURT.centerX + 16, COURT.centerY);
      place(receiver, COURT.centerX + 10, 10);
      for (let i = 2; i < 5; i++) place(off[i], COURT.centerX + 30, 6 + i * 9);
      for (let i = 0; i < 5; i++) place(g.teams.away[i], 12, 6 + i * 9);
      g.giveBallForTest(handler);
      g.pass(handler, receiver);
      const t = g.ball.target;
      void t;
      // Where it was aimed, against where the man is standing.
      sum += Math.hypot(g.ball.aimX - receiver.x, g.ball.aimY - receiver.y);
      n++;
    }
    return sum / Math.max(1, n);
  };
  const sloppy = aimError('rookie');
  const sharp = aimError('legend');
  console.log(`  a pass lands ${sloppy.toFixed(2)}ft from the man on Rookie, `
    + `${sharp.toFixed(2)}ft on Legend`);
  check('a harder tier puts the pass where it meant to',
    sloppy > sharp + 0.3, `${sloppy.toFixed(2)}ft v ${sharp.toFixed(2)}ft`);
  check('and a harder tier is harder to outscore',
    conceded.rookie > conceded.legend + 4,
    `${conceded.rookie.toFixed(1)} v ${conceded.legend.toFixed(1)} points a team`);
  check('a harder tier settles for a better shot',
    quality.legend > quality.rookie + 0.02,
    `${(quality.rookie * 100).toFixed(1)}% -> ${(quality.legend * 100).toFixed(1)}%`);
  check('and the ladder is ordered',
    quality.pro > quality.rookie && quality.allstar > quality.pro - 0.01
    && quality.legend > quality.allstar - 0.01,
    ['rookie', 'pro', 'allstar', 'legend'].map((t) => `${(quality[t] * 100).toFixed(1)}%`).join(' -> '));
}

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log(`\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  env?.exit(1);
}
