/* Headless "human proxy": plays the human side with a sensible policy so shot
 * conversion can be measured the way a real player experiences it, rather than
 * inferred from AI-vs-AI games. Run with: npm run human */
import { Match } from '../match/Match';
import { makeMatchConfig } from '../league/matchSetup';
import { getTeam } from '../data/teams';
import { attackingGoal, attackDir, otherSide, type Side } from '../data/constants';
import { clamp, dist } from '../core/math';
import { DIFFICULTY_ORDER, type DifficultyKey } from '../data/difficulty';
import type { InputState, MatchPlayer, ShotInfo } from '../match/types';

const DT = 1 / 60;

interface Skill {
  /** Yards from the cage at which the proxy starts a shot. */
  shootRange: number;
  /** How precisely it aims away from the keeper, 0..1. */
  aim: number;
  /** Chance per second of dodging when marked. */
  dodge: number;
  /** Chance per second of passing when a better option exists. */
  pass: number;
}

const GOOD: Skill = { shootRange: 10, aim: 0.9, dodge: 1.2, pass: 0.7 };
const AVERAGE: Skill = { shootRange: 12, aim: 0.45, dodge: 0.5, pass: 0.35 };
const NAIVE: Skill = { shootRange: 14, aim: 0, dodge: 0.1, pass: 0.1 };

const blank = (): InputState => ({
  moveX: 0, moveY: 0, sprint: false, actionPressed: false,
  shootHeld: false, shootReleased: false, dodgePressed: false,
  switchPressed: false, screenPressed: false,
});

function policy(m: Match, side: Side, skill: Skill, charging: { on: boolean }): InputState {
  const input = blank();
  const p = m.controlled[side];
  if (!p || m.phase !== 'live') {
    // Clamp the faceoff dead centre so possession is not the variable here.
    if (m.phase === 'faceoff' && m.faceoff && m.faceoff.stage === 'sweep') {
      const mid = (m.faceoff.zoneStart + m.faceoff.zoneEnd) / 2;
      if (m.faceoff.marker >= mid) input.actionPressed = true;
    }
    charging.on = false;
    return input;
  }

  const goal = attackingGoal(side);
  const dir = attackDir(side);
  const hasBall = m.ball.carrier === p;
  const d = dist(p.x, p.y, goal.x, goal.y);

  if (!hasBall) {
    charging.on = false;
    const b = m.ball;
    const t = b.carrier ? { x: b.carrier.x, y: b.carrier.y } : { x: b.x, y: b.y };
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    const mag = Math.hypot(dx, dy) || 1;
    input.moveX = dx / mag;
    input.moveY = dy / mag;
    input.sprint = true;
    if (b.carrier && b.carrier.side !== side && mag < 2.0) input.actionPressed = true;
    return input;
  }

  // Carrying: attack from an angle, then shoot at the corner away from the keeper.
  const keeper = m.goalieOf(otherSide(side));
  const cornerSign = keeper.y > goal.y ? -1 : 1;
  const wantY = goal.y + cornerSign * 5;
  const targetX = goal.x - dir * 7;

  const marker = m.opponentsOf(p)
    .filter((o) => o.slot !== 'G')
    .reduce<{ o: MatchPlayer | null; d: number }>((best, o) => {
      const dd = dist(p.x, p.y, o.x, o.y);
      return dd < best.d ? { o, d: dd } : best;
    }, { o: null, d: 99 });

  if (d <= skill.shootRange && charging.on) {
    input.shootHeld = true;
    // Aim across the mouth; a better player commits harder to the corner.
    input.moveY = cornerSign * skill.aim;
    input.moveX = 0;
    if (p.windup > 0.8) { input.shootReleased = true; charging.on = false; }
    return input;
  }
  if (d <= skill.shootRange && !charging.on && p.windup === 0) {
    charging.on = true;
    input.shootHeld = true;
    input.moveY = cornerSign * skill.aim;
    return input;
  }

  const dx = targetX - p.x;
  const dy = wantY - p.y;
  const mag = Math.hypot(dx, dy) || 1;
  input.moveX = dx / mag;
  input.moveY = dy / mag;
  input.sprint = p.stamina > 30;
  if (marker.d < 2.6 && Math.random() < skill.dodge * DT) input.dodgePressed = true;
  return input;
}

function run(skill: Skill, difficulty: DifficultyKey, seed: number, homeId: string, awayId: string) {
  const cfg = makeMatchConfig({
    homeTeam: getTeam(homeId),
    awayTeam: getTeam(awayId),
    humanSide: 'home',
    difficulty,
    gameLength: 'short',
    seed,
  });
  const m = new Match(cfg);
  const shots: ShotInfo[] = [];
  m.events.on('shotFeedback', () => { /* consumed below via lastShot */ });
  let lastRecorded: ShotInfo | null = null;
  const charging = { on: false };
  let guard = 0;
  while (!m.isFinal() && guard++ < 60 * 60 * 30) {
    m.update(DT, policy(m, 'home', skill, charging));
    if (m.lastShot && m.lastShot !== lastRecorded && m.lastShot.side === 'home') {
      lastRecorded = m.lastShot;
      shots.push(m.lastShot);
    }
  }
  return { m, shots };
}

function summarise(label: string, skill: Skill, difficulty: DifficultyKey) {
  const pairs: [string, string][] = [
    ['highland-park', 'dallas-jesuit'],
    ['plano', 'coppell'],
    ['frisco', 'prosper'],
  ];
  let goalsFor = 0;
  let goalsAgainst = 0;
  const all: ShotInfo[] = [];
  let games = 0;
  for (let i = 0; i < pairs.length; i++) {
    for (let r = 0; r < 2; r++) {
      const { m, shots } = run(skill, difficulty, 3000 + i * 31 + r * 7, pairs[i][0], pairs[i][1]);
      games++;
      goalsFor += m.score.home;
      goalsAgainst += m.score.away;
      all.push(...shots);
    }
  }
  const n = Math.max(1, all.length);
  const by = (o: string) => all.filter((s) => s.outcome === o).length;
  const avg = (f: (s: ShotInfo) => number) => all.reduce((t, s) => t + f(s), 0) / n;
  console.log(
    `${label.padEnd(9)} ${difficulty.padEnd(9)} ` +
    `goals ${(goalsFor / games).toFixed(1)}-${(goalsAgainst / games).toFixed(1)}  ` +
    `shots/gm ${(all.length / games).toFixed(1)}  ` +
    `conv ${((by('goal') / n) * 100).toFixed(0)}%  ` +
    `saved ${((by('save') / n) * 100).toFixed(0)}%  ` +
    `wide ${((by('wide') / n) * 100).toFixed(0)}%  ` +
    `blocked ${((by('blocked') / n) * 100).toFixed(0)}%  ` +
    `post ${((by('post') / n) * 100).toFixed(0)}%  ` +
    `| avg dist ${avg((s) => s.distance).toFixed(1)}y  ` +
    `acc ${avg((s) => s.accuracy).toFixed(0)}  ` +
    `press ${avg((s) => s.pressure).toFixed(2)}`,
  );
}

console.log('Human-proxy shooting (home side played by a scripted player)\n');
for (const d of DIFFICULTY_ORDER) summarise('good', GOOD, d);
console.log('');
summarise('average', AVERAGE, 'varsity');
summarise('naive', NAIVE, 'varsity');
void clamp;
