/**
 * HOW IT FEELS IN THE HANDS.
 *
 * Box scores cannot see movement. A game can shoot a perfectly respectable
 * percentage while its players change direction at twenty feet a second as
 * though they weighed nothing, slide sideways as fast as they sprint forwards,
 * and lose fourteen per cent of their speed in a single frame when a stamina
 * threshold ticks over. All three of those were true, and none of them showed up
 * in any number the balance harness prints.
 *
 * So: movement, measured. Acceleration curves, braking, the cost of a hard turn,
 * the cost of sliding, the slope of fatigue, and the ball's own physics.
 *
 *   npm run hoops-feel
 */
import { HoopsGame } from '../sports/basketball/Game';
import { neutralHoopsInput } from '../sports/basketball/input';
import { TEAMS, generateRoster } from '../sports/basketball/data';
import { DIFFICULTIES, HOOPS } from '../sports/basketball/tuning';
import { COURT } from '../sports/basketball/court';
import type { CourtPlayer } from '../sports/basketball/types';

const env = (globalThis as { process?: { exit(n: number): void } }).process;

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

function game(seed = 5): HoopsGame {
  const home = TEAMS[0];
  const away = TEAMS[1];
  return new HoopsGame({
    home: { team: home, roster: generateRoster(home, seed) },
    away: { team: away, roster: generateRoster(away, seed + 1) },
    humanSide: null,
    quarterSeconds: 600,
    difficulty: DIFFICULTIES.pro,
    seed,
    label: 'feel',
  });
}

/** Drive one man for a while and report what he did, in isolation. */
function run(
  p: CourtPlayer, g: HoopsGame, mx: number, my: number, sprint: boolean, seconds: number,
): { speed: number; travelled: number } {
  const x0 = p.x;
  const y0 = p.y;
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    g.drive(p, mx, my, sprint, dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  return {
    speed: Math.hypot(p.vx, p.vy),
    travelled: Math.hypot(p.x - x0, p.y - y0),
  };
}

const solo = (): { g: HoopsGame; p: CourtPlayer } => {
  const g = game();
  const p = g.teams.home[0];
  p.x = COURT.centerX;
  p.y = COURT.centerY;
  p.z = 0; p.vx = 0; p.vy = 0; p.stamina = 100;
  p.facing = 0;
  // Nobody has the ball, so nobody is "on defence" for the slide rules.
  g.setPossessionForTest('home');
  return { g, p };
};

/* ------------------------------------------------------------- acceleration */

console.log('\nGETTING UP TO SPEED\n');

{
  const { g, p } = solo();
  const a = run(p, g, 1, 0, false, 0.1);
  const b = run(p, g, 1, 0, false, 0.4);
  const c = run(p, g, 1, 0, false, 1.5);
  console.log(`  after 0.1s ${a.speed.toFixed(1)} ft/s, 0.5s ${b.speed.toFixed(1)}, `
    + `2s ${c.speed.toFixed(1)}`);
  check('nobody starts at top speed', a.speed < c.speed * 0.75,
    `${a.speed.toFixed(1)} v ${c.speed.toFixed(1)}`);
  check('and everybody gets there eventually', c.speed > 11, `${c.speed.toFixed(1)} ft/s`);
  check('top speed is a basketball speed, not a bicycle',
    c.speed > 10 && c.speed < 22, `${c.speed.toFixed(1)} ft/s`);
}

{
  const { g, p } = solo();
  run(p, g, 1, 0, false, 2);
  const cruise = Math.hypot(p.vx, p.vy);
  run(p, g, 1, 0, true, 1.5);
  const sprinting = Math.hypot(p.vx, p.vy);
  console.log(`  cruise ${cruise.toFixed(1)} ft/s, sprint ${sprinting.toFixed(1)} ft/s`);
  check('sprinting is faster than running', sprinting > cruise * 1.1,
    `${cruise.toFixed(1)} -> ${sprinting.toFixed(1)}`);
}

/* ------------------------------------------------------------------ braking */

console.log('\nSTOPPING\n');

{
  const { g, p } = solo();
  run(p, g, 1, 0, true, 2);
  const before = Math.hypot(p.vx, p.vy);
  run(p, g, 0, 0, false, 0.18);
  const after = Math.hypot(p.vx, p.vy);
  console.log(`  ${before.toFixed(1)} ft/s to ${after.toFixed(1)} in a fifth of a second`);
  check('a player can plant and stop', after < before * 0.55,
    `${before.toFixed(1)} -> ${after.toFixed(1)}`);
  check('but not instantly', after > 0.2, `${after.toFixed(2)} ft/s left`);
}

/* ------------------------------------------------------------ hard turns */

console.log('\nCHANGING DIRECTION\n');

{
  // Straight for two seconds, then reverse. What is left of the speed?
  const { g, p } = solo();
  run(p, g, 1, 0, true, 2);
  const flat = Math.hypot(p.vx, p.vy);
  run(p, g, -1, 0, true, 0.1);
  const reversed = Math.hypot(p.vx, p.vy);

  // And the same man turning ninety degrees rather than all the way round.
  const b = solo();
  run(b.p, b.g, 1, 0, true, 2);
  run(b.p, b.g, 0, 1, true, 0.1);
  const square = Math.hypot(b.p.vx, b.p.vy);

  console.log(`  at ${flat.toFixed(1)} ft/s: reversing leaves ${reversed.toFixed(1)}, `
    + `turning square leaves ${square.toFixed(1)}`);
  check('reversing at speed costs you most of it', reversed < flat * 0.6,
    `${flat.toFixed(1)} -> ${reversed.toFixed(1)}`);
  check('and a square turn costs less than a reversal', square > reversed,
    `${square.toFixed(1)} v ${reversed.toFixed(1)}`);
}

{
  // A better ball-handler keeps more of his speed through a cut.
  const g = game(11);
  const quick = g.teams.home[0];
  const clumsy = g.teams.home[4];
  const keepOf = (p: CourtPlayer): number => {
    p.x = COURT.centerX; p.y = COURT.centerY; p.vx = 0; p.vy = 0;
    p.z = 0; p.stamina = 100; p.facing = 0;
    run(p, g, 1, 0, true, 2);
    const before = Math.hypot(p.vx, p.vy);
    run(p, g, 0, 1, true, 0.12);
    return Math.hypot(p.vx, p.vy) / Math.max(0.01, before);
  };
  g.setPossessionForTest('home');
  const a = keepOf(quick);
  const b = keepOf(clumsy);
  console.log(`  ${quick.pos} (handle ${quick.data.attrs.handle}) keeps `
    + `${(a * 100).toFixed(0)}% through a cut; `
    + `${clumsy.pos} (handle ${clumsy.data.attrs.handle}) keeps ${(b * 100).toFixed(0)}%`);
  check('a better handler keeps more speed through a cut',
    quick.data.attrs.handle <= clumsy.data.attrs.handle || a > b,
    `${(a * 100).toFixed(0)}% v ${(b * 100).toFixed(0)}%`);
}

/* --------------------------------------------------------------- the slide */

console.log('\nTHE DEFENSIVE SLIDE\n');

{
  const g = game(21);
  const d = g.teams.away[0];
  const reset = (): void => {
    d.x = COURT.centerX; d.y = COURT.centerY; d.vx = 0; d.vy = 0;
    d.z = 0; d.stamina = 100; d.facing = 0;
  };
  // He is on defence, and facing along +x because the ball is that way.
  g.setPossessionForTest('home');
  g.putBallAtForTest(COURT.centerX + 44, COURT.centerY);

  reset();
  const forward = run(d, g, 1, 0, true, 1.2).speed;
  reset();
  const sideways = run(d, g, 0, 1, true, 1.2).speed;
  console.log(`  a defender runs at ${forward.toFixed(1)} ft/s and slides at `
    + `${sideways.toFixed(1)} ft/s`);
  check('a defender slides slower than he runs', sideways < forward * 0.95,
    `${forward.toFixed(1)} v ${sideways.toFixed(1)}`);
  check('but a slide is still a basketball speed', sideways > 7,
    `${sideways.toFixed(1)} ft/s`);
}

/* ------------------------------------------------------------------ fatigue */

console.log('\nTIRED LEGS\n');

{
  const { g, p } = solo();
  const at = (stamina: number): number => {
    p.x = COURT.centerX; p.y = COURT.centerY; p.vx = 0; p.vy = 0; p.z = 0;
    p.stamina = stamina;
    // Not sprinting, so stamina does not move while we measure.
    return run(p, g, 1, 0, false, 2).speed;
  };
  const fresh = at(100);
  const middling = at(50);
  const spent = at(4);
  console.log(`  fresh ${fresh.toFixed(1)} ft/s, half gone ${middling.toFixed(1)}, `
    + `spent ${spent.toFixed(1)}`);
  check('a tired player is slower', spent < fresh * 0.95,
    `${fresh.toFixed(1)} -> ${spent.toFixed(1)}`);
  check('and fatigue is a slope, not a cliff',
    middling < fresh && middling > spent,
    `${fresh.toFixed(1)} / ${middling.toFixed(1)} / ${spent.toFixed(1)}`);
  check('nobody is crippled by it', spent > fresh * 0.75,
    `${((spent / fresh) * 100).toFixed(0)}% of fresh`);
}

/* --------------------------------------------------- speed follows the rating */

console.log('\nRATINGS MOVE PLAYERS\n');

{
  const g = game(33);
  const all = [...g.teams.home, ...g.teams.away];
  g.setPossessionForTest('home');
  const rows = all.map((p) => {
    p.x = COURT.centerX; p.y = COURT.centerY; p.vx = 0; p.vy = 0; p.z = 0;
    p.stamina = 100; p.facing = 0;
    return { p, top: run(p, g, 1, 0, true, 2.5).speed };
  }).sort((a, b) => b.top - a.top);
  const fastest = rows[0];
  const slowest = rows[rows.length - 1];
  console.log(`  fastest ${fastest.p.pos} (speed ${fastest.p.data.attrs.speed}) `
    + `${fastest.top.toFixed(1)} ft/s`);
  console.log(`  slowest ${slowest.p.pos} (speed ${slowest.p.data.attrs.speed}) `
    + `${slowest.top.toFixed(1)} ft/s`);
  check('a quicker rating is a quicker player',
    fastest.p.data.attrs.speed > slowest.p.data.attrs.speed
      && fastest.top > slowest.top + 0.5,
    `${fastest.top.toFixed(1)} v ${slowest.top.toFixed(1)}`);
  check('and the spread is real without being silly',
    fastest.top / slowest.top < 1.8,
    `${(fastest.top / slowest.top).toFixed(2)}x`);
}

/* ------------------------------------------------------------ the basketball */

console.log('\nTHE BALL\n');

{
  const g = game(41);
  const idle = neutralHoopsInput();
  /* A ball dropped from ten feet must bounce, and must lose energy doing it.
   *
   * Measured with nobody near it: run the whole game and ten men converge on a
   * loose ball and pick it up, which tests the rebound AI rather than the
   * physics. Everybody is parked at the far end. */
  for (const q of [...g.teams.home, ...g.teams.away]) {
    q.x = 6; q.y = 6; q.vx = 0; q.vy = 0; q.z = 0;
  }
  g.putBallAtForTest(COURT.centerX, COURT.centerY);
  g.ball.z = 10;
  g.ball.vz = 0;
  g.ball.vx = 0;
  g.ball.vy = 0;
  g.ball.state = 'loose';
  g.ball.carrier = null;
  const peaks: number[] = [];
  let rising = false;
  let last = g.ball.z;
  for (let i = 0; i < 600; i++) {
    g.update(1 / 60, idle);
    if (g.ball.z > last && !rising) rising = true;
    if (g.ball.z < last && rising) { peaks.push(last); rising = false; }
    last = g.ball.z;
    if (peaks.length >= 3) break;
  }
  console.log(`  dropped from 10ft, bounced back to ${peaks.map((n) => n.toFixed(1)).join('ft, ')}ft`);
  check('the ball bounces', peaks.length >= 1, `${peaks.length} bounces seen`);
  check('and loses height each time', peaks.length < 2 || peaks[1] < peaks[0],
    peaks.map((n) => n.toFixed(1)).join(' -> '));
  check('a basketball does not bounce like a superball',
    peaks.length === 0 || peaks[0] < 8, `${(peaks[0] ?? 0).toFixed(1)}ft off a 10ft drop`);
}

{
  // A pass is faster than a man can run, or it is not a pass.
  const g = game(51);
  const from = g.teams.home[0];
  const to = g.teams.home[1];
  from.x = COURT.centerX - 10; from.y = COURT.centerY;
  to.x = COURT.centerX + 10; to.y = COURT.centerY;
  g.giveBallForTest(from);
  g.pass(from, to);
  const speed = Math.hypot(g.ball.vx, g.ball.vy);
  console.log(`  a pass travels at ${speed.toFixed(1)} ft/s`);
  check('a pass outruns a sprinter', speed > HOOPS.baseSpeed * 1.5,
    `${speed.toFixed(1)} ft/s v a ${(HOOPS.baseSpeed * HOOPS.sprintMultiplier).toFixed(1)} ft/s sprint`);
}

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log(`\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  env?.exit(1);
}
