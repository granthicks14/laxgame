/**
 * THE BUZZER.
 *
 * One rule, and the whole thing turns on it:
 *
 *   A SHOT COUNTS IF IT LEFT HIS HANDS BEFORE THE HORN.
 *
 * The engine used to end the period on the frame the clock reached zero,
 * whatever the ball was doing. That killed the shot in mid-air, set the ball
 * dead and made a buzzer-beater literally impossible to hit — not hard, not
 * unlikely, IMPOSSIBLE, because the ball ceased to exist while it was still
 * eight feet from the rim.
 *
 * So this harness puts a shot up with a known amount of time left, over and over,
 * and asserts what the rules of basketball say should happen to it:
 *
 *   released before 0.0 and it goes in    the basket counts, then the period ends
 *   released before 0.0 and it misses     no basket, the period ends
 *   begun after 0.0                       refused: nothing may start after the horn
 *   nothing in the air at 0.0             the period ends immediately, as before
 *
 * And the clock is never extended: it reads zero throughout, which is what the
 * scoreboard shows and what every rule in the engine reads.
 *
 *   npm run hoops-buzzer
 */
import { HoopsGame } from '../sports/basketball/Game';
import { neutralHoopsInput } from '../sports/basketball/input';
import { TEAMS, generateRoster } from '../sports/basketball/data';
import { DIFFICULTIES } from '../sports/basketball/tuning';
import { HOOPS } from '../sports/basketball/tuning';
import { attackRim } from '../sports/basketball/court';
import type { CourtPlayer, HoopsConfig } from '../sports/basketball/types';
import type { Side } from '../sports/basketball/court';

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

const idle = neutralHoopsInput();

function config(seed: number): HoopsConfig {
  return {
    home: { team: TEAMS[0], roster: generateRoster(TEAMS[0], seed) },
    away: { team: TEAMS[5], roster: generateRoster(TEAMS[5], seed + 1) },
    humanSide: null,
    quarterSeconds: 120,
    difficulty: DIFFICULTIES.pro,
    seed,
  };
}

/**
 * A game wound to `left` seconds with one man holding the ball at a chosen spot.
 *
 * Everything is placed by hand rather than played into, because the point is to
 * test the CLOCK and not the offence: a scenario that depends on the AI happening
 * to shoot with three tenths left is a scenario that runs once in a thousand.
 */
function scenario(left: number, feetFromRim: number, seed = 7): {
  game: HoopsGame; shooter: CourtPlayer; side: Side;
} {
  const game = new HoopsGame(config(seed));
  // Out of the tip and into live play.
  for (let i = 0; i < 200 && game.phase === 'tip'; i++) game.update(1 / 60, idle);
  const side: Side = 'home';
  game.setPossessionForTest(side);
  const shooter = game.players.find((p) => p.side === side)!;
  const rim = attackRim(side);
  const dir = rim.x > 47 ? -1 : 1;
  shooter.x = rim.x + dir * feetFromRim;
  shooter.y = rim.y;
  shooter.z = 0;
  shooter.vx = 0;
  shooter.vy = 0;
  // Everybody else out of the way, so a block or a deflection cannot decide it.
  for (const p of game.players) {
    if (p === shooter) continue;
    p.x = 47;
    p.y = p.side === 'home' ? 3 : 47;
    p.vx = 0;
    p.vy = 0;
  }
  game.giveBallForTest(shooter);
  game.setClockForTest(left);
  game.setShotClockForTest(24);
  return { game, shooter, side };
}

/** Run until the period is over, or the frame budget runs out. */
function runOut(game: HoopsGame, maxFrames = 1200): number {
  let f = 0;
  while (f < maxFrames && game.phase !== 'quarterBreak' && game.phase !== 'final') {
    game.update(1 / 60, idle);
    f++;
  }
  return f;
}

/* ------------------------------------------------- a shot beats the buzzer */

console.log('\nA SHOT RELEASED BEFORE THE HORN\n');

for (const left of [5, 2, 1, 0.5, 0.1]) {
  const { game, shooter, side } = scenario(left, 18);
  const before = game.score[side];
  game.releaseShotForTest(shooter, 0.82);
  check(`${left.toFixed(1)}s left: the shot is in the air`,
    game.ball.state === 'shot' && game.ball.shot?.afterBuzzer === false,
    `state ${game.ball.state}`);

  // Step until the clock expires, then keep going.
  let expired = -1;
  let inFlightAfterZero = 0;
  for (let f = 0; f < 1200; f++) {
    game.update(1 / 60, idle);
    if (expired < 0 && game.clock <= 0) expired = f;
    if (expired >= 0 && game.ball.state === 'shot') inFlightAfterZero++;
    if (game.phase === 'quarterBreak' || game.phase === 'final') break;
  }
  check(`  and it was still flying after the clock hit zero`,
    left > 1.6 || inFlightAfterZero > 0,
    `${inFlightAfterZero} frames in the air past 0.0`);
  check('  and the period ended once it resolved',
    game.phase === 'quarterBreak' || game.phase === 'final', game.phase);
  check('  and the clock was never extended', game.clock <= 0,
    `${game.clock.toFixed(2)}s`);
  const scored = game.score[side] - before;
  check('  and it either counted or it did not, cleanly',
    scored === 0 || scored === 2 || scored === 3, `${scored} points`);
}

/* ------------------------------------------- a make at the buzzer counts */

console.log('\nA MAKE AT THE BUZZER COUNTS\n');

{
  /* Forced to go in, so the assertion is about the RULE rather than about a
   * shooting percentage: what is being tested is whether a made shot that was in
   * the air when the horn sounded reaches the scoreboard. */
  let counted = 0;
  let tried = 0;
  for (let s = 0; s < 12; s++) {
    const { game, shooter, side } = scenario(0.25, 6, 20 + s);
    const before = game.score[side];
    game.releaseShotForTest(shooter, 0.82, true);
    if (game.ball.state !== 'shot') continue;
    tried++;
    runOut(game);
    if (game.score[side] - before > 0) counted++;
  }
  check('a made buzzer-beater reaches the scoreboard', tried > 0 && counted === tried,
    `${counted} of ${tried} counted`);
}

{
  let counted = 0;
  let tried = 0;
  for (let s = 0; s < 12; s++) {
    const { game, shooter, side } = scenario(0.25, 6, 40 + s);
    const before = game.score[side];
    game.releaseShotForTest(shooter, 0.82, false);
    if (game.ball.state !== 'shot') continue;
    tried++;
    runOut(game);
    if (game.score[side] - before > 0) counted++;
  }
  check('a missed buzzer-beater does not', tried > 0 && counted === 0,
    `${counted} of ${tried} counted`);
}

/* ------------------------------------------------ nothing starts after it */

console.log('\nNOTHING BEGINS AFTER THE HORN\n');

{
  const { game, shooter, side } = scenario(0.4, 8, 61);
  const before = game.score[side];
  // Let the clock run out with the ball simply held.
  for (let f = 0; f < 60 && game.clock > 0; f++) game.update(1 / 60, idle);
  check('with nothing in the air the period ends at zero',
    game.phase === 'quarterBreak' || game.phase === 'final', game.phase);
  const startedAfter = game.startShotForTest(shooter, 0.82);
  check('and a shot begun after it is refused', !startedAfter);
  check('and the score did not move', game.score[side] === before,
    `${game.score[side] - before}`);
}

{
  /* THE OTHER HALF OF THE RULE. A shot released while the clock reads zero — a
   * tip-in after the horn — is stamped as such and must not count even if it
   * goes down, because the stamp is taken at release. */
  const { game, shooter, side } = scenario(0.3, 5, 77);
  const before = game.score[side];
  for (let f = 0; f < 40 && game.clock > 0; f++) game.update(1 / 60, idle);
  game.setPhaseForTest('buzzer');
  game.releaseShotForTest(shooter, 0.82, true);
  const stamped = game.ball.shot?.afterBuzzer ?? null;
  runOut(game);
  check('a shot released after the horn is stamped as such', stamped === true,
    `${stamped}`);
  check('and it does not count however it lands',
    game.score[side] === before, `${game.score[side] - before} points`);
}

/* --------------------------------------------- the end of a whole game */

console.log('\nTHE END OF A GAME\n');

{
  // A full game, played out, checking the period machine never jams.
  const game = new HoopsGame(config(999));
  let frames = 0;
  while (game.phase !== 'final' && frames < 400_000) {
    game.update(1 / 60, idle);
    frames++;
  }
  check('a whole game still reaches its final buzzer', game.phase === 'final',
    `${game.phase} after ${(frames / 60 / 60).toFixed(1)} minutes of stepping`);
  check('and played every quarter', game.quarter >= HOOPS.quarters,
    `Q${game.quarter}${game.overtime ? ` +${game.overtime}OT` : ''}`);
  check('and it is not a tie', game.score.home !== game.score.away,
    `${game.score.home}-${game.score.away}`);
  check('and every quarter has a score in the box',
    game.box.home.byQuarter.slice(0, HOOPS.quarters).every((n) => n > 0),
    game.box.home.byQuarter.join('-'));
}

{
  /* OVERTIME, reached the honest way: a tie forced at the end of the fourth. */
  const game = new HoopsGame(config(1234));
  for (let i = 0; i < 200 && game.phase === 'tip'; i++) game.update(1 / 60, idle);
  game.setQuarterForTest(HOOPS.quarters);
  game.setScoreForTest(60, 60);
  game.setClockForTest(0.4);
  let frames = 0;
  while (game.overtime === 0 && frames < 4000) {
    game.update(1 / 60, idle);
    frames++;
  }
  check('a tie at the end of the fourth goes to overtime', game.overtime > 0,
    `OT${game.overtime}`);
  check('and the overtime clock is a real one', game.clock > 0,
    `${game.clock.toFixed(1)}s`);
}

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log(`\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  env?.exit(1);
}
