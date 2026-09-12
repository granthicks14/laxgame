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

console.log();
if (problems.length) {
  console.log(`${problems.length} of ${checks} checks FAILED:`);
  for (const p of problems) console.log(`  - ${p}`);
  env?.exit(1);
} else {
  console.log(`${checks}/${checks} checks passed`);
}
