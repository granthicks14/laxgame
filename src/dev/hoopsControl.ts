/**
 * WHO ARE YOU HOLDING?
 *
 * A basketball game is a team you control for forty minutes, not a player. The
 * one way that promise breaks is invisible from the outside and fatal from the
 * inside: you pass, the ball reaches a team-mate, and the AI takes him over. You
 * are left steering the man who has just given the ball away, and it reads as
 * the controls having failed.
 *
 * That bug shipped. `giveBall` moved control on a steal and on a rebound and NOT
 * on a catch, so every single pass handed your team to the computer for as long
 * as the ball was in somebody else's hands.
 *
 * So: a real game, played by a real input, for thousands of frames, asserting
 * after every possession event that the human still has his own team and that
 * the man he is holding is the man the rules say he should be.
 *
 *   npm run hoops-control
 */
import { HoopsGame } from '../sports/basketball/Game';
import { neutralHoopsInput, type HoopsInput } from '../sports/basketball/input';
import { TEAMS, generateRoster } from '../sports/basketball/data';
import { DIFFICULTIES } from '../sports/basketball/tuning';
import type { CourtPlayer, HoopsConfig } from '../sports/basketball/types';
import { REPLAY_SECONDS, emptyFrame } from '../sports/basketball/replay';
import { COURT } from '../sports/basketball/court';

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

function config(seed: number, human: Side | null): HoopsConfig {
  const home = TEAMS[0];
  const away = TEAMS[1];
  return {
    home: { team: home, roster: generateRoster(home, seed) },
    away: { team: away, roster: generateRoster(away, seed + 1) },
    humanSide: human,
    quarterSeconds: 300,
    difficulty: DIFFICULTIES.pro,
    seed,
    label: 'control test',
  };
}

console.log('\nCONTROL FOLLOWS THE BALL\n');

const HUMAN = 'home' as const;
type Side = 'home' | 'away';
const game = new HoopsGame(config(4242, HUMAN));
const idle = neutralHoopsInput();

/**
 * A bot at the sticks.
 *
 * A neutral input is not a test of a control system: the human stands still,
 * holds the ball for twenty-four seconds and gives it away on the shot clock,
 * and no pass is ever thrown. So this plays — it carries the ball up, passes it
 * on a rhythm, and shoots when it gets near the rim. Crude basketball, but it is
 * basketball, and it throws the passes this file exists to check.
 */
function botInput(g: HoopsGame, side: Side, frame: number): HoopsInput {
  const inp = neutralHoopsInput();
  const me = g.controlled[side];
  if (!me) return inp;

  const dir = side === 'home' ? 1 : -1;
  const rimX = side === 'home' ? 94 - 5.25 : 5.25;
  const mine = g.carrier && g.carrier.side === side;

  if (g.carrier === me) {
    // Carry it at the rim, pass every so often, shoot when close.
    const d = Math.hypot(rimX - me.x, 25 - me.y);
    inp.moveX = Math.sign(rimX - me.x) * dir * dir;
    inp.moveY = Math.sign(25 - me.y) * 0.6;
    if (frame % 150 === 40) inp.passPressed = true;
    if (d < 14) {
      inp.shootHeld = frame % 40 < 22;
      inp.shootReleased = frame % 40 === 22;
    }
  } else if (mine) {
    // Off the ball: get to open floor.
    inp.moveX = Math.sign(rimX - me.x) * 0.5;
    inp.moveY = me.y > 25 ? -0.5 : 0.5;
  } else {
    // Defence: go to the ball.
    const b = g.carrier;
    if (b) {
      inp.moveX = Math.sign(b.x - me.x);
      inp.moveY = Math.sign(b.y - me.y);
    }
  }
  return inp;
}

let frames = 0;
let catches = 0;
let heldWrongMan = 0;
let heldOtherTeam = 0;
let heldFouledOut = 0;
let carrierNotHeld = 0;
let looseWithNobody = 0;
const worstGaps: string[] = [];

/** The man the rules say the human should be holding right now. */
function expected(g: HoopsGame): CourtPlayer | null {
  const c = g.carrier;
  if (c && c.side === HUMAN) return c;
  return null;
}

let lastCarrier: string | null = null;

for (; frames < 200_000 && game.phase !== 'final'; frames++) {
  game.update(1 / 60, botInput(game, HUMAN, frames));
  const held = game.controlled[HUMAN];

  // 1. The man you hold is always one of yours, and never a man who has fouled out.
  if (held && held.side !== HUMAN) heldOtherTeam++;
  if (held && held.fouledOut) heldFouledOut++;

  // 2. If your side has the ball, you are holding the man who has it.
  const want = expected(game);
  if (want && held !== want) {
    carrierNotHeld++;
    if (worstGaps.length < 4) {
      worstGaps.push(`${game.phase}: holding ${held ? held.data.last : 'nobody'}`
        + `, ball with ${want.data.last}`);
    }
  }

  // 3. Somebody is always being held while the ball is live.
  if (!held && game.phase === 'live') looseWithNobody++;

  /* 4. Count the catches, so the test can say it actually saw passes land.
   *
   * The ball has NO carrier while a pass is in the air, so this tracks the last
   * man who held it rather than the current one: a catch is the ball arriving
   * with somebody other than whoever threw it. */
  const c = game.carrier;
  if (c && c.uid !== lastCarrier) {
    const prevId: string | null = lastCarrier;
    const prev: CourtPlayer | undefined = prevId
      ? game.players.find((p) => p.uid === prevId) : undefined;
    if (prev && prev.side === HUMAN && c.side === HUMAN) {
      catches++;
      // The frame the ball lands, control must already be on the receiver.
      if (game.controlled[HUMAN] !== c) heldWrongMan++;
    }
    lastCarrier = c.uid;
  }
}

console.log(`  ${frames} frames, ${catches} passes completed between team-mates\n`);

check('the game got far enough to test anything', catches >= 20, `${catches} catches`);
check('a completed pass hands you the receiver, every time',
  heldWrongMan === 0, `${heldWrongMan} of ${catches} left with the AI`);
check('you are always holding the man with the ball',
  carrierNotHeld === 0, `${carrierNotHeld} frames`, );
if (worstGaps.length) for (const g of worstGaps) console.log(`      ${g}`);
check('you never end up holding an opponent', heldOtherTeam === 0, `${heldOtherTeam} frames`);
check('and never a man who has fouled out', heldFouledOut === 0, `${heldFouledOut} frames`);
check('somebody is always under your control while the ball is live',
  looseWithNobody === 0, `${looseWithNobody} frames`);

/* --------------------------------------------- the switch button, and defence */

console.log('\nTHE SWITCH BUTTON\n');

{
  const g = new HoopsGame(config(77, HUMAN));
  for (let i = 0; i < 4000 && g.phase !== 'final'; i++) g.update(1 / 60, botInput(g, HUMAN, i));

  // With the ball, switching must never hand your handler to the computer.
  let refusals = 0;
  let tries = 0;
  for (let i = 0; i < 20_000 && g.phase !== 'final'; i++) {
    g.update(1 / 60, botInput(g, HUMAN, i));
    const c = g.carrier;
    if (c && c.side === HUMAN) {
      tries++;
      g.switchControl(HUMAN);
      if (g.controlled[HUMAN] === c) refusals++;
    }
  }
  check('switching with the ball keeps you on your own ball-handler',
    tries > 0 && refusals === tries, `${refusals}/${tries}`);
}

{
  // On defence the switch must actually move you, and to one of your own.
  const g = new HoopsGame(config(1313, HUMAN));
  let moved = 0;
  let tries = 0;
  let strayed = 0;
  for (let i = 0; i < 40_000 && g.phase !== 'final'; i++) {
    g.update(1 / 60, botInput(g, HUMAN, i));
    const c = g.carrier;
    if (c && c.side !== HUMAN && g.phase === 'live') {
      const before = g.controlled[HUMAN];
      g.switchControl(HUMAN);
      const after = g.controlled[HUMAN];
      tries++;
      if (after !== before) moved++;
      if (after && after.side !== HUMAN) strayed++;
    }
  }
  check('switching on defence moves you to another defender',
    tries > 10 && moved > tries * 0.5, `${moved} of ${tries}`);
  check('and never off your own team', strayed === 0, `${strayed}`);
}

/* ------------------------------------------------ an exhibition with no human */

console.log('\nNOBODY AT THE STICKS\n');

{
  const g = new HoopsGame(config(999, null));
  let broke = 0;
  for (let i = 0; i < 260_000 && g.phase !== 'final'; i++) {
    g.update(1 / 60, idle);
    if (g.controlled.home && g.controlled.home.side !== 'home') broke++;
    if (g.controlled.away && g.controlled.away.side !== 'away') broke++;
  }
  check('a game with no human still plays itself out', g.phase === 'final', g.phase);
  check('and nothing crosses sides', broke === 0, `${broke}`);
  const total = g.score.home + g.score.away;
  check('and it was a game of basketball', total > 90 && total < 300, `${total} points`);
}

/* ---------------------------------------------------------------- timeouts */

console.log('\nTHE ONE THING A COACH DOES THAT IS NOT MOVING A PLAYER\n');

{
  const g = new HoopsGame(config(31, HUMAN));
  check('a game starts with five timeouts a side',
    g.timeouts.home === 5 && g.timeouts.away === 5,
    `${g.timeouts.home} / ${g.timeouts.away}`);

  // Run to a live possession with the human holding the ball.
  let live = 0;
  for (let i = 0; i < 60_000 && live < 1; i++) {
    g.update(1 / 60, botInput(g, HUMAN, i));
    const c = g.carrier;
    if (g.phase === 'live' && c && c.side === HUMAN) live = 1;
  }
  check('the human can call one with the ball in his hands',
    g.canCallTimeout(HUMAN), `phase ${g.phase}`);

  const tired = g.players.filter((p) => p.side === HUMAN);
  for (const p of tired) p.stamina = 40;
  const before = g.timeouts[HUMAN];
  const called = g.callTimeout(HUMAN);
  check('and calling one is accepted', called && g.phase === 'timeout', g.phase);
  check('and it costs him one', g.timeouts[HUMAN] === before - 1,
    `${g.timeouts[HUMAN]} left`);

  /* A SECOND ONE CANNOT BE CHAINED off the first: without the cooldown a held
   * button calls five in five frames and the game never restarts. */
  check('and he cannot call another on top of it', !g.canCallTimeout(HUMAN));

  for (let i = 0; i < 400; i++) g.update(1 / 60, idle);
  const rested = tired.reduce((n, p) => n + p.stamina, 0) / tired.length;
  check('the huddle puts legs back under his five', rested > 55,
    `${rested.toFixed(0)} stamina`);
  check('and play restarts afterwards', g.phase !== 'timeout', g.phase);

  // Spend the rest and check the floor holds.
  for (let i = 0; i < 12; i++) {
    for (let f = 0; f < 700; f++) g.update(1 / 60, botInput(g, HUMAN, f));
    g.callTimeout(HUMAN);
  }
  check('a coach can never call more than he has', g.timeouts[HUMAN] >= 0,
    `${g.timeouts[HUMAN]}`);
  check('and asking with none left is refused, not ignored',
    g.timeouts[HUMAN] > 0 || !g.canCallTimeout(HUMAN));
}

{
  /* THE COMPUTER'S OWN HAND ON THE LEVER. Played out with nobody at the sticks
   * on both a soft tier and a hard one: a better-coached bench stops a run
   * sooner, and neither of them is allowed to run out of timeouts entirely
   * before the last minutes. */
  const spent = (key: 'rookie' | 'legend'): number => {
    // Nobody at the sticks, so both benches are the computer's and both of them
    // have to manage themselves. A side being run off the floor is what a run is.
    const cfg = config(4242, null);
    cfg.difficulty = DIFFICULTIES[key];
    const g = new HoopsGame(cfg);
    for (let i = 0; i < 260_000 && g.phase !== 'final'; i++) g.update(1 / 60, idle);
    return (5 - g.timeouts.away) + (5 - g.timeouts.home);
  };
  const soft = spent('rookie');
  const hard = spent('legend');
  check('the computer calls timeouts of its own', hard > 0, `${hard} on Legend`);
  check('and a better-coached bench stops a run sooner', hard >= soft,
    `rookie ${soft}, legend ${hard}`);
}

/* ----------------------------------------------------------- the highlight */

console.log('\nSHOW IT AGAIN\n');

{
  const g = new HoopsGame(config(77, HUMAN));
  const frame = emptyFrame(10);

  check('nothing can be replayed before anything has happened',
    !g.replay.sample(1, frame), `${g.replay.seconds.toFixed(1)}s buffered`);

  for (let i = 0; i < 900; i++) g.update(1 / 60, botInput(g, HUMAN, i));
  check('the buffer fills as the game is played',
    g.replay.seconds >= REPLAY_SECONDS - 0.2,
    `${g.replay.seconds.toFixed(1)}s of ${REPLAY_SECONDS}`);
  check('and it never grows past its own length',
    g.replay.seconds <= REPLAY_SECONDS + 0.05, `${g.replay.seconds.toFixed(1)}s`);

  const now = g.players.map((p) => ({ x: p.x, y: p.y }));
  check('reading the newest sample gives the floor as it stands',
    g.replay.sample(0.05, frame)
    && frame.players.every((r, i) => Math.hypot(r.x - now[i].x, r.y - now[i].y) < 3),
    frame.players.map((r, i) => Math.hypot(r.x - now[i].x, r.y - now[i].y).toFixed(1)).join(','));

  check('reading further back than the buffer reaches is refused',
    !g.replay.sample(REPLAY_SECONDS + 1, frame));

  /* WALKING THE WHOLE BUFFER, which is what a replay does. Every sample has to
   * be readable and every body has to be somewhere on the floor — a frame that
   * comes back at the origin is a frame that draws ten men in the corner. */
  let bad = 0;
  let read = 0;
  for (let t = REPLAY_SECONDS - 0.3; t > 0.05; t -= 1 / 60) {
    if (!g.replay.sample(t, frame)) { bad++; continue; }
    read++;
    for (const r of frame.players) {
      if (r.x < -12 || r.x > COURT.length + 12 || r.y < -12 || r.y > COURT.width + 12) bad++;
    }
  }
  check('every frame of a highlight is readable and on the floor',
    bad === 0 && read > 200, `${read} frames, ${bad} bad`);

  /* CONTINUITY. A replay is watched at a fifth of a second a frame; if two
   * neighbouring samples disagree by more than a stride, the picture judders. */
  let jump = 0;
  const a = emptyFrame(10);
  const b = emptyFrame(10);
  for (let t = 3; t > 0.2; t -= 0.05) {
    if (!g.replay.sample(t, a) || !g.replay.sample(t - 0.05, b)) continue;
    for (let i = 0; i < 10; i++) {
      if (Math.hypot(b.players[i].x - a.players[i].x, b.players[i].y - a.players[i].y) > 2.2) jump++;
    }
  }
  check('and nobody teleports between frames', jump === 0, `${jump} jumps`);

  // And it costs nothing to keep: one array, allocated once.
  const before = g.replay.seconds;
  for (let i = 0; i < 600; i++) g.update(1 / 60, botInput(g, HUMAN, i));
  check('recording for longer does not grow the buffer',
    Math.abs(g.replay.seconds - before) < 0.2,
    `${before.toFixed(1)}s then ${g.replay.seconds.toFixed(1)}s`);
}

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log(`\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  env?.exit(1);
}
