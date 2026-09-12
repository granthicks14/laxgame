/**
 * GAMEPLAY RULES THAT ARE EASY TO BREAK AND HARD TO SEE
 *
 * The match engine is 2,000 lines of interacting timers, and the things that
 * go wrong in it are not crashes — they are rules that quietly stop applying.
 * This drives a real Match and asserts the ones that matter.
 *
 * The headline case is the KEEPER. A shot backs off the pipe, he is standing
 * over the ball, and Switch has to give him to you. It used to give you a
 * defender twelve yards away, because the goalie was filtered out of the
 * control pool entirely — invisible unless you were looking for it.
 *
 *   npm run gameplay
 */
import { Match } from '../match/Match';
import { makeMatchConfig } from '../league/matchSetup';
import { getTeam } from '../data/teams';
import type { MatchPlayer } from '../match/types';
import {
  MAX_REPLAY_ZOOM, REPLAY_ANGLES, pickAngle, replayCamera, type ReplayAngle,
} from '../match/replay';

const env = (globalThis as { process?: { exit(n: number): void } }).process;
const problems: string[] = [];
let checks = 0;
function check(name: string, ok: boolean, detail = ''): void {
  checks++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) problems.push(name);
}

const DT = 1 / 60;

function freshMatch(): Match {
  return new Match(makeMatchConfig({
    homeTeam: getTeam('highland-park'),
    awayTeam: getTeam('dallas-jesuit'),
    difficulty: 'varsity',
    gameLength: 'short',
    humanSide: 'home',
    seed: 424242,
    replays: false,
  }));
}

/** Runs to live play so the pieces are on the field and moving. */
function toLive(m: Match): void {
  let guard = 0;
  while (m.phase !== 'live' && guard++ < 2000) m.update(DT);
}

const goalieOf = (m: Match, side: 'home' | 'away'): MatchPlayer => m.goalieOf(side);

/* ------------------------------------------- 1. the keeper plays his own ball */

{
  const m = freshMatch();
  toLive(m);
  const g = goalieOf(m, 'home');

  // A loose ball on the doorstep, with the keeper standing over it and every
  // field player pushed well upfield. There is no reading of "closest" that
  // is not the goalie.
  m.ball.state = 'loose';
  m.ball.carrier = null;
  m.ball.vx = 0; m.ball.vy = 0; m.ball.vz = 0;
  m.ball.x = g.x + 1.5;
  m.ball.y = g.y;
  m.ball.z = 0;
  for (const p of m.teams.home) {
    if (p === g) continue;
    p.x = g.x + 55;
    p.vx = 0; p.vy = 0;
  }

  m.requestSwitch('home');
  check('the keeper can be switched to when he is over the ball',
    m.controlled.home === g, m.controlled.home === g ? 'goalie' : m.controlled.home?.slot ?? 'nobody');

  // And his own AI must stand down while the human has him, or the stick and
  // the AI fight over the same body.
  check('a controlled keeper is not also driven by his AI', !m.aiControls(g));
}

/* --------------------------------- 2. he is not dragged across the field */

{
  const m = freshMatch();
  toLive(m);
  const g = goalieOf(m, 'home');

  // The same geometry at the OTHER end: the keeper is nominally nearest only
  // because everybody else is behind him. He must not be picked — a keeper who
  // chases to the far restraining line has abandoned the only job he has.
  const far = m.teams.home.find((p) => p.slot !== 'G')!;
  m.ball.state = 'loose';
  m.ball.carrier = null;
  m.ball.x = 0;
  m.ball.y = 0;
  m.ball.z = 0;
  g.x = 4; g.y = 0;
  for (const p of m.teams.home) {
    if (p === g) continue;
    p.x = -60; p.y = 30;
  }
  m.requestSwitch('home');
  check('the keeper is not picked for a ball at the far end',
    m.controlled.home !== g, m.controlled.home?.slot ?? 'nobody');
  void far;
}

/* ------------------------------------- 3. a field player still wins when closer */

{
  const m = freshMatch();
  toLive(m);
  const g = goalieOf(m, 'home');
  const d = m.teams.home.find((p) => p.slot !== 'G')!;

  m.ball.state = 'loose';
  m.ball.carrier = null;
  m.ball.vx = 0; m.ball.vy = 0;
  m.ball.x = g.x + 8;
  m.ball.y = g.y;
  m.ball.z = 0;
  d.x = g.x + 9; d.y = g.y; d.vx = 0; d.vy = 0;
  for (const p of m.teams.home) {
    if (p === g || p === d) continue;
    p.x = g.x + 60;
  }
  m.requestSwitch('home');
  check('a defender a yard from the ball beats the keeper eight yards away',
    m.controlled.home === d, m.controlled.home === d ? 'defender' : m.controlled.home?.slot ?? 'nobody');
}

/* ------------------------------------------------ 4. the rest of the engine */

{
  const m = freshMatch();
  let guard = 0;
  while (!m.isFinal() && guard++ < 60 * 60 * 40) m.update(DT);
  const total = m.score.home + m.score.away;
  const shots = m.stats.home.shots + m.stats.away.shots;
  const saves = m.stats.home.saves + m.stats.away.saves;
  check('a full game reaches a final whistle', m.isFinal(), `${m.score.home}-${m.score.away}`);
  check('the game produced real play', shots > 0 && saves > 0, `${shots} shots, ${saves} saves`);
  check('nobody ended the game stuck in a stun', m.players.every((p) => p.stun < 5));
  check('the ball ended somewhere on the field',
    Number.isFinite(m.ball.x) && Number.isFinite(m.ball.y));
  check('scoring landed in a believable range', total >= 2 && total <= 40, `${total} goals`);
}

/* ------------------------------------------------ 5. quarter simulation */

{
  const m = freshMatch();
  toLive(m);
  const before = { q: m.quarter, home: m.score.home, away: m.score.away };
  const res = m.simulateQuarter();
  check('simulating a quarter advances the game',
    m.quarter > before.q || m.isFinal(), `Q${before.q} -> Q${m.quarter}`);
  check('a simulated quarter reports what happened',
    res.homeGoals >= 0 && res.awayGoals >= 0,
    `${res.homeGoals}-${res.awayGoals}`);
  check('the score moved with it',
    m.score.home - before.home === res.homeGoals && m.score.away - before.away === res.awayGoals);
  check('control comes back to the player', m.autopilot === false);
}

/* ------------------------------------------------ 6. call for screen */

{
  const m = freshMatch();
  toLive(m);
  // Put the ball in a home player's stick and ask for a screen.
  const carrier = m.teams.home.find((p) => p.slot !== 'G')!;
  m.ball.state = 'carried';
  m.ball.carrier = carrier;
  for (const p of m.teams.home) {
    if (p === carrier || p.slot === 'G') continue;
    p.x = carrier.x + 6; p.y = carrier.y + 4;
  }
  const called = m.callScreen(carrier);
  check('a screen can be called', called);
  check('somebody is actually setting it',
    m.teams.home.some((p) => p !== carrier && p.screenTimer > 0));
  check('calling twice in a row is on cooldown', !m.callScreen(carrier));
}

/* ------------------------------------- 7. the goal replay is actually a replay
 * Seven framings of the same footage. The things worth asserting are that the
 * choice varies, that every framing is a different picture, and that each one
 * tightens onto the cage for the finish instead of wandering off it.
 * -------------------------------------------------------------------------- */

{
  // 1. the framing changes from goal to goal, and never repeats back to back.
  const seen = new Set<ReplayAngle>();
  let repeats = 0;
  for (let seed = 1; seed <= 40; seed++) {
    let prev: ReplayAngle | null = null;
    for (let goal = 0; goal < 12; goal++) {
      const a = pickAngle(seed * 7919, goal, prev);
      if (a === prev) repeats++;
      seen.add(a);
      prev = a;
    }
  }
  check('every camera angle gets used', seen.size === REPLAY_ANGLES.length,
    `${seen.size}/${REPLAY_ANGLES.length}: ${[...seen].join(', ')}`);
  check('the same angle never runs twice in a row', repeats === 0, `${repeats} repeats`);
  check('the same goal always replays the same way',
    pickAngle(12345, 3, 'ball') === pickAngle(12345, 3, 'ball'));

  // 2. a real goal mouth, a real shooter and a real keeper, mid-flight.
  const subject = (t: number, slow: boolean) => ({
    ballX: 88, ballY: 26, shooterX: 84, shooterY: 22,
    goalieX: 94.4, goalieY: 30, goalX: 95, goalY: 30, t, slow,
  });
  const frames = new Set<string>();
  for (const angle of REPLAY_ANGLES) {
    const open = replayCamera(angle, subject(0, false));
    const close = replayCamera(angle, subject(1, true));
    frames.add(`${open.x.toFixed(2)},${open.y.toFixed(2)},${open.zoom.toFixed(2)}`);

    const finite = [open.x, open.y, open.zoom, open.rate, close.x, close.y, close.zoom]
      .every((n) => Number.isFinite(n));
    check(`${angle}: produces a usable camera`, finite);
    check(`${angle}: stays inside the zoom the pixel grid can take`,
      open.zoom >= 1 && close.zoom <= MAX_REPLAY_ZOOM + 1e-9,
      `${open.zoom.toFixed(2)} -> ${close.zoom.toFixed(2)}`);
    check(`${angle}: pushes in over the clip`, close.zoom > open.zoom + 0.05,
      `${open.zoom.toFixed(2)} -> ${close.zoom.toFixed(2)}`);
    // The finish either tightens onto the cage or was already sat on it — the
    // end-line camera lives behind the net and stays there.
    const d0 = Math.hypot(open.x - 95, open.y - 30);
    const d1 = Math.hypot(close.x - 95, close.y - 30);
    check(`${angle}: frames the cage for the finish`, d1 <= Math.max(d0, 4) + 0.01,
      `${d0.toFixed(1)} -> ${d1.toFixed(1)} yards off the goal`);
    // Nothing should try to look at the car park.
    check(`${angle}: keeps the camera on the venue`,
      open.x > -15 && open.x < 125 && open.y > -15 && open.y < 75,
      `${open.x.toFixed(1)}, ${open.y.toFixed(1)}`);
  }
  check('each angle is a different picture', frames.size === REPLAY_ANGLES.length,
    `${frames.size} distinct openings of ${REPLAY_ANGLES.length}`);

  // 3. a goal in a real match arms the clip with the right people in it.
  const m = freshMatch();
  m.cfg.replays = true;
  toLive(m);
  // Whoever scores first is the one to check: the engine decides, not the test.
  let guard = 0;
  while (!m.lastGoal && guard++ < 60 * 600) m.update(DT);
  check('the engine scored a goal to replay', !!m.lastGoal, `after ${(guard / 60) | 0}s`);
  const side = m.lastGoal?.side ?? 'home';
  const beaten = side === 'home' ? 'away' : 'home';
  const cage = side === 'home' ? 95 : 15;
  const cut = m.replayCut;
  check('the clip knows who scored it', !!cut && !!cut.scorer, cut?.scorer?.data.last ?? 'nobody');
  check('the clip knows which keeper was beaten',
    !!cut && cut.keeper === m.goalieOf(beaten), cut?.keeper.data.last ?? 'nobody');
  check('the clip knows which cage it went into',
    !!cut && Math.abs(cut.goalX - cage) < 0.01 && Math.abs(cut.goalY - 30) < 0.01,
    cut ? `${cut.goalX}, ${cut.goalY}` : 'no cut');

  // The celebration runs, then the replay; it must pick a framing and it must
  // end on its own rather than hanging the game.
  let steps = 0;
  while (m.phase !== 'replay' && steps++ < 60 * 10) m.update(DT);
  check('a goal rolls into a replay', m.phase === 'replay', m.phase);
  check('the replay picked a framing', !!m.replayAngle, m.replayAngle ?? 'none');
  check('the replay has footage to show', m.replayDuration > 1, `${m.replayDuration.toFixed(1)}s`);
  let slowSeen = false;
  steps = 0;
  while (m.phase === 'replay' && steps++ < 60 * 30) {
    m.update(DT);
    if (m.replaySpeed < 0.9) slowSeen = true;
  }
  check('the replay drops into slow motion for the finish', slowSeen);
  check('the replay ends and play resumes', m.phase !== 'replay', m.phase);

  // Skipping has to land in exactly the same place.
  const m2 = freshMatch();
  m2.cfg.replays = true;
  toLive(m2);
  let g2 = 0;
  while (m2.phase !== 'replay' && g2++ < 60 * 600) m2.update(DT);
  if (m2.phase === 'replay') {
    m2.skipReplay();
    check('skipping a replay resumes the game', m2.phase !== 'replay', m2.phase);
  } else {
    check('skipping a replay resumes the game', false, 'never reached a replay');
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
