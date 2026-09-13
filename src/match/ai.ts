import { clamp, dist, dist2, normalize } from '../core/math';
import {
  FIELD, SIM, attackingGoal, defendingGoal, attackDir, otherSide, type Side,
} from '../data/constants';
import { MARKING, slotWorld } from './formation';
import { starTier } from '../data/players';
import type { Match } from './Match';
import type { MatchPlayer, SlotKey } from './types';

/* ============================================================================
 * AI
 * Higher difficulties do NOT get better attributes. They get shorter reaction
 * delays, cleaner decisions, tighter marks and smarter slides. Everything below
 * is gated on `m.diff` for exactly those things.
 * ==========================================================================*/

export function updateAI(m: Match, p: MatchPlayer, dt: number): void {
  if (p.stun > 0) { m.setMove(p, 0, 0); return; }

  p.aiThink -= dt;
  const b = m.ball;

  if (b.carrier === p) {
    carrierAI(m, p, dt);
    return;
  }
  if (b.state !== 'carried') {
    looseBallAI(m, p);
    return;
  }
  if (b.carrier && b.carrier.side === p.side) {
    offenseAI(m, p, dt);
  } else {
    defenseAI(m, p, dt);
  }
}

/* ------------------------------------------------------------------ helpers */

function rank(m: Match, p: MatchPlayer, x: number, y: number): number {
  // How many of my teammates are closer to (x,y) than I am.
  let n = 0;
  const mine = dist2(p.x, p.y, x, y);
  for (const t of m.teammatesOf(p)) {
    if (t === p || t.slot === 'G') continue;
    if (dist2(t.x, t.y, x, y) < mine) n++;
  }
  return n;
}

/** Steer toward a point, with light separation from nearby teammates. */
function seek(m: Match, p: MatchPlayer, tx: number, ty: number, sprint = false, arrive = 0.6): void {
  let dx = tx - p.x;
  let dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d < arrive) { m.setMove(p, 0, 0); return; }
  dx /= d; dy /= d;

  // Separation so the AI never balls up into a rugby scrum.
  for (const t of m.teammatesOf(p)) {
    if (t === p || t.slot === 'G') continue;
    const sd = dist(p.x, p.y, t.x, t.y);
    if (sd < 5 && sd > 0.01) {
      const w = ((5 - sd) / 5) ** 1.4 * 1.25;
      dx += (p.x - t.x) / sd * w;
      dy += (p.y - t.y) / sd * w;
    }
  }
  const n = normalize(dx, dy);
  const scale = d < arrive * 3 ? clamp(d / (arrive * 3), 0.35, 1) : 1;
  m.setMove(p, n.x * scale, n.y * scale, sprint && d > 4 && p.stamina > 12);
}

function predictBall(m: Match, lead: number): { x: number; y: number } {
  const b = m.ball;
  return { x: b.x + b.vx * lead, y: b.y + b.vy * lead };
}

/* ------------------------------------------------------------- loose ball */

function looseBallAI(m: Match, p: MatchPlayer): void {
  const b = m.ball;
  const lead = clamp(dist(p.x, p.y, b.x, b.y) / 12, 0.05, 0.7);
  const spot = predictBall(m, lead);
  const r = rank(m, p, spot.x, spot.y);

  // One or two men go for it; everybody else gets back to their job. Nothing
  // looks worse than ten players chasing one ball.
  const nearGoal = Math.min(
    Math.abs(spot.x - 15), Math.abs(spot.x - 95),
  ) < 12 && Math.abs(spot.y - 30) < 14;
  const chasers = b.state === 'shot' || nearGoal ? 1 : 2;
  if (r < chasers) {
    seek(m, p, spot.x, spot.y, true, 0.15);
    return;
  }

  // Position for the next phase of play based on who probably wins it.
  const likely = likelyWinner(m, spot.x, spot.y);
  if (likely === p.side) offenseSlot(m, p, 1);
  else defenseSlot(m, p);
}

function likelyWinner(m: Match, x: number, y: number): Side {
  let best: Side = 'home';
  let bestD = Infinity;
  for (const q of m.players) {
    if (q.slot === 'G') continue;
    const d = dist2(q.x, q.y, x, y);
    if (d < bestD) { bestD = d; best = q.side; }
  }
  return best;
}

/* ---------------------------------------------------------------- offense */

/** Keeps an AI target outside the crease so nobody grinds against the clamp. */
function clearOfCrease(x: number, y: number, gx: number, gy: number): { x: number; y: number } {
  const d = Math.hypot(x - gx, y - gy);
  const min = FIELD.creaseRadius + 1.3;
  if (d >= min || d < 1e-4) return { x, y };
  return { x: gx + ((x - gx) / d) * min, y: gy + ((y - gy) / d) * min };
}

/**
 * Where an off-ball attacker wants to be. The whole set shades toward the ball
 * and every player carries a slow personal drift, because a lacrosse offence
 * that stands still on its spots looks — and plays — like a training cone.
 */
function offenseSlot(m: Match, p: MatchPlayer, spacingMul = 1): { x: number; y: number } {
  const t = m.tacticsOf(p.side).off;
  const base = slotWorld(p.side, p.slot, true);
  const goal = attackingGoal(p.side);
  const dir = attackDir(p.side);
  const spacing = t.spacing * spacingMul;
  let x = goal.x - dir * ((goal.x - base.x) * dir) * spacing;
  let y = FIELD.centerY + (base.y - FIELD.centerY) * spacing;

  // Shade the set ball-side, the way a real offence rotates.
  const carrier = m.ball.carrier;
  if (carrier && carrier.side === p.side) {
    y += (carrier.y - goal.y) * 0.22;
    x += (carrier.x - x) * 0.05;
  }

  // A slow personal drift so nobody is ever completely static.
  const phase = p.index * 1.7;
  y += Math.sin(m.elapsed * 0.55 + phase) * 1.4;
  x += Math.cos(m.elapsed * 0.43 + phase) * 1.1;

  const safe = clearOfCrease(x, y, goal.x, goal.y);
  return {
    x: clamp(safe.x, 2, FIELD.length - 2),
    y: clamp(safe.y, 2.5, FIELD.width - 2.5),
  };
}

function offenseAI(m: Match, p: MatchPlayer, dt: number): void {
  const b = m.ball;
  const carrier = b.carrier!;
  const t = m.tacticsOf(p.side).off;
  const goal = attackingGoal(p.side);
  const dir = attackDir(p.side);

  // Defensemen of the team in possession hold the midline and support the clear.
  if (p.slot.startsWith('D')) {
    const own = defendingGoal(p.side);
    const carrierBack = Math.abs(carrier.x - own.x) < 40;
    const slot = slotWorld(p.side, p.slot, true);
    const phase = p.index * 1.9;
    const ty = carrierBack
      ? clamp(carrier.y + (p.slot === 'D1' ? -14 : p.slot === 'D3' ? 14 : 0), 4, FIELD.width - 4)
      : slot.y + Math.sin(m.elapsed * 0.45 + phase) * 1.5;
    const tx = carrierBack
      ? clamp(carrier.x + dir * 9, 3, FIELD.length - 3)
      : slot.x + Math.cos(m.elapsed * 0.38 + phase) * 1.2;
    seek(m, p, tx, ty, carrierBack, 0.6);
    return;
  }

  // Fast break: if we just won it in our own half, run.
  const inTransition = Math.abs(carrier.x - goal.x) > 48;
  if (inTransition) {
    const laneY = p.slot === 'A2' || p.slot === 'M1' ? 14 : p.slot === 'A3' || p.slot === 'M3' ? 46 : 30;
    const push = clamp(Math.abs(carrier.x - goal.x) - 22, 8, 40) * t.transition * 0.55;
    seek(m, p, goal.x - dir * push, laneY, true, 1.2);
    return;
  }

  p.aiCut -= dt;

  // Cutting: a hard dive to the crease when the lane is open. A coached offence
  // is fussier about what "open" means and times the dive better.
  const iq = m.coachingOf(p.side).offenseIQ;
  if (p.aiCut <= 0) {
    p.aiCut = m.rng.range(1.6, 4.2) / Math.max(0.35, t.cutRate * (1 + iq * 0.25));
    const laneOpen = m.laneRisk(carrier.x, carrier.y, p.x, p.y, p.side) < 0.4 - iq * 0.12;
    const spread = dist(p.x, p.y, carrier.x, carrier.y);
    if (laneOpen && spread > 6 && spread < 26 && m.rng.next() < t.cutRate * (1 + iq * 0.3)) {
      p.aiIntent = 'drive';
      p.poseTimer = 0;
      p.aiTargetX = goal.x - dir * m.rng.range(3.5, 7.5);
      p.aiTargetY = goal.y + m.rng.range(-5, 5);
      p.aiCut = m.rng.range(1.1, 1.7);
      p.animPose = 'run';
    } else {
      p.aiIntent = 'idle';
    }
  }

  if (p.aiIntent === 'drive') {
    seek(m, p, p.aiTargetX, p.aiTargetY, true, 1.0);
    if (dist(p.x, p.y, p.aiTargetX, p.aiTargetY) < 1.6) p.aiIntent = 'idle';
    return;
  }

  // Hold the set, sliding along the perimeter away from the ball for spacing.
  // Coaching widens the spacing discipline and sharpens the step away from a
  // defender who has crept in.
  const slot = offenseSlot(m, p, 1 + iq * 0.12);
  const away = normalize(p.x - carrier.x, p.y - carrier.y);
  const nearest = nearestOpponent(m, p);
  const evadeRange = 2.4 + iq * 0.9;
  const evade = nearest && dist(p.x, p.y, nearest.x, nearest.y) < evadeRange
    ? { x: (p.x - nearest.x) * (0.4 + iq * 0.25), y: (p.y - nearest.y) * (0.4 + iq * 0.25) }
    : { x: 0, y: 0 };
  seek(m, p, slot.x + away.x * (1.2 + iq * 0.5) + evade.x, slot.y + away.y * (1.2 + iq * 0.5) + evade.y, false, 0.5);
}

function nearestOpponent(m: Match, p: MatchPlayer): MatchPlayer | null {
  let best: MatchPlayer | null = null;
  let bd = Infinity;
  for (const o of m.opponentsOf(p)) {
    if (o.slot === 'G') continue;
    const d = dist2(p.x, p.y, o.x, o.y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

/* --------------------------------------------------------------- carrier */

function shotQuality(m: Match, p: MatchPlayer): number {
  const goal = attackingGoal(p.side);
  const d = dist(p.x, p.y, goal.x, goal.y);
  // Better players shoot from further out, and hit from further out. The range
  // a shot is worth taking from grows with the standard of the game, which is
  // most of why a professional offence generates more looks than a high school
  // one against defenders who are also better.
  const reach = 19 + (m.par - SIM.parReference) * 0.14;
  if (d > reach || d < 1.5) return 0;

  // Angle: shooting from straight on is far better than from behind the cage.
  const dir = attackDir(p.side);
  const along = (goal.x - p.x) * dir; // >0 means in front of the goal
  if (along < 0.5) return 0;
  const lateral = Math.abs(p.y - goal.y);
  const angleScore = clamp(1 - lateral / (along * 1.5 + 7), 0.08, 1);

  const distScore = clamp(1 - (d - 3) / (16 + (m.par - SIM.parReference) * 0.14), 0.05, 1);
  const pressureF = clamp(1 - m.pressureOn(p) * 0.45, 0.25, 1);
  const laneF = clamp(1 - m.laneRisk(p.x, p.y, goal.x, goal.y, p.side) * 0.45, 0.4, 1);

  // Goalie positioning: a keeper caught off his line leaves room.
  const g = m.goalieOf(otherSide(p.side));
  const gOff = clamp(Math.abs(g.y - goal.y) / 2.4, 0, 1) * 0.12;

  const skill = (p.data.attrs.shooting * 0.6 + p.data.attrs.shotAccuracy * 0.4) / 100;
  return clamp(distScore * angleScore * pressureF * laneF * (0.7 + skill * 0.45) + gOff, 0, 1);
}

function carrierAI(m: Match, p: MatchPlayer, dt: number): void {
  const goal = attackingGoal(p.side);
  const t = m.tacticsOf(p.side).off;
  const d = m.diff;
  const pressure = m.pressureOn(p);
  const marker = nearestOpponent(m, p);
  const markerDist = marker ? dist(p.x, p.y, marker.x, marker.y) : 99;

  // --- committed to a shot: keep charging, then let it rip.
  if (p.aiIntent === 'shoot') {
    p.windup = clamp(p.windup + dt / SIM.shotChargeTime, 0, 1);
    p.animPose = 'wind';
    p.poseTimer = 0.1;
    const targetCharge = p.aiTargetX;
    // Drive toward the cage while winding up.
    const toGoal = normalize(goal.x - p.x, goal.y - p.y);
    m.setMove(p, toGoal.x, toGoal.y, false);
    if (p.windup >= targetCharge || markerDist < 1.3) {
      const lat = p.aiTargetY;
      const perpX = -toGoal.y * lat;
      const perpY = toGoal.x * lat;
      m.doShot(p, perpX, perpY, p.windup);
      p.aiIntent = 'idle';
      p.aiThink = d.reaction;
    }
    return;
  }

  if (p.aiThink > 0) {
    driveMove(m, p, marker, markerDist);
    return;
  }
  p.aiThink = d.reaction * m.rng.range(0.7, 1.3);

  const q = shotQuality(m, p);
  // Patience decays as the shot clock runs down, so a possession always ends
  // in a shot rather than a stall.
  const urgency = clamp(m.shotClock / 22, 0.28, 1);
  // A "good look" is relative to the standard of the game. Against a defence
  // where every man is quick and in position, the shot an offence has to take
  // is worse than the one it would take in high school — and if the bar does
  // not move with the level, a better defence stops the game being played at
  // all rather than conceding fewer goals. High school sits at par, so this is
  // exactly 1 there and Dynasty is unchanged.
  // Calibrated so it cancels the DIFFICULTY FLOOR each level applies. Higher
  // levels are meant to think better — react sooner, slide smarter, aim
  // straighter — not to stop shooting. Without this the ladder is not even
  // monotonic: Division I, whose floor is All-State, produced fewer goals than
  // Division II, whose floor is Varsity.
  const parEase = clamp(1 - (m.par - SIM.parReference) / 100, 0.7, 1);
  const shootThreshold = (d.shotGreed / Math.max(0.4, t.shotGreed)) * urgency * parEase;
  const clockPanic = m.shotClock < 7;

  // --- shoot?
  if (q > shootThreshold || (clockPanic && q > 0.08)) {
    const good = m.rng.next() < d.decisionQuality;
    if (good || m.rng.bool(0.5)) {
      p.aiIntent = 'shoot';
      p.aiTargetX = clamp(0.55 + q * 0.4 + m.rng.range(-0.1, 0.1), 0.25, 1);
      // Pick a corner away from the keeper.
      const g = m.goalieOf(otherSide(p.side));
      const lat = g.y > goal.y ? -1 : 1;
      p.aiTargetY = lat * m.rng.range(0.55, 1) * (0.4 + d.decisionQuality * 0.6);
      return;
    }
  }

  // --- pass?
  const mate = bestPassOption(m, p);
  if (mate) {
    const mateQ = shotQualityAt(m, p.side, mate);
    const risk = m.laneRisk(p.x, p.y, mate.x, mate.y, p.side);
    const wantPass =
      (pressure > 0.55 && risk < 0.55) ||
      (mateQ > q + 0.16 && risk < 0.45) ||
      (m.shotClock < 14 && mateQ > q && risk < 0.5) ||
      (m.rng.next() < 0.12 * (t.key === 'possession' ? 1.9 : 1) && risk < 0.3);
    if (wantPass && m.rng.next() < 0.35 + d.decisionQuality * 0.65) {
      const aim = normalize(mate.x - p.x, mate.y - p.y);
      m.doPass(p, aim.x, aim.y, 0.7);
      p.aiThink = d.reaction * 1.4;
      return;
    }
  }

  // --- dodge?
  if (markerDist < 2.6 && p.dodgeCd <= 0 && p.stamina > SIM.dodgeStamina + 6) {
    const edge = (p.data.attrs.dodging - (marker?.data.attrs.defense ?? m.par)) / 100;
    if (m.rng.next() < clamp(0.3 + edge + (t.key === 'aggressive' ? 0.22 : 0), 0.08, 0.85)) {
      // Dodge past the marker, toward the goal.
      const toGoal = normalize(goal.x - p.x, goal.y - p.y);
      const side = marker && (marker.y > p.y) ? -1 : 1;
      const dx = toGoal.x * 0.7 - toGoal.y * side * 0.7;
      const dy = toGoal.y * 0.7 + toGoal.x * side * 0.7;
      m.doDodge(p, dx, dy);
      p.aiThink = 0.3;
      return;
    }
  }

  // --- otherwise drive / reset.
  driveMove(m, p, marker, markerDist);
}

function shotQualityAt(m: Match, side: Side, q: MatchPlayer): number {
  const goal = attackingGoal(side);
  const d = dist(q.x, q.y, goal.x, goal.y);
  const dir = attackDir(side);
  const along = (goal.x - q.x) * dir;
  if (along < 0.5 || d > 19) return 0;
  const lateral = Math.abs(q.y - goal.y);
  const angleScore = clamp(1 - lateral / (along * 1.5 + 7), 0.08, 1);
  const distScore = clamp(1 - (d - 3) / (16 + (m.par - SIM.parReference) * 0.14), 0.05, 1);
  return distScore * angleScore * clamp(1 - m.pressureOn(q) * 0.45, 0.25, 1);
}

function bestPassOption(m: Match, p: MatchPlayer): MatchPlayer | null {
  let best: MatchPlayer | null = null;
  let bestScore = -Infinity;
  for (const mate of m.teammatesOf(p)) {
    if (mate === p || mate.slot === 'G' || mate.stun > 0) continue;
    const d = dist(p.x, p.y, mate.x, mate.y);
    if (d < 4 || d > 38) continue;
    const risk = m.laneRisk(p.x, p.y, mate.x, mate.y, p.side);
    const q = shotQualityAt(m, p.side, mate);
    // WHO is open matters, not only WHERE. This used to score position alone,
    // which meant a 95 and a 40 standing in the same spot were the same pass —
    // so a squad's best player got no more of the ball than its worst, and a
    // star was worth almost nothing. Kept deliberately secondary to shape: it
    // breaks ties toward the man who can finish, it does not force the ball to
    // him through traffic.
    const finish = (mate.data.attrs.shooting * 0.6 + mate.data.attrs.shotAccuracy * 0.4);
    const quality = (finish - m.par) * 0.35;
    const score = q * 100 + quality - risk * 90 - d * 0.5 - m.pressureOn(mate) * 25;
    if (score > bestScore) { bestScore = score; best = mate; }
  }
  return best;
}

function driveMove(m: Match, p: MatchPlayer, marker: MatchPlayer | null, markerDist: number): void {
  const goal = attackingGoal(p.side);
  const dir = attackDir(p.side);
  const t = m.tacticsOf(p.side).off;
  const own = defendingGoal(p.side);

  // Clearing: if we are deep in our own half, just get the ball upfield.
  if (Math.abs(p.x - own.x) < 34) {
    const laneY = clamp(p.y + (p.y < FIELD.centerY ? -6 : 6), 8, FIELD.width - 8);
    seek(m, p, own.x + dir * 55, laneY, true, 2);
    return;
  }

  const along = (goal.x - p.x) * dir;
  let tx: number;
  let ty: number;

  if (along < 1.5) {
    // Behind the cage — carry around to a shooting angle.
    const side = p.y >= goal.y ? 1 : -1;
    tx = goal.x - dir * 3.5;
    ty = goal.y + side * 7.5;
  } else if (markerDist < 2.2 && t.key !== 'aggressive') {
    // Pressured: pull back to a safer spot.
    tx = p.x - dir * 4;
    ty = clamp(p.y + (marker && marker.y > p.y ? -5 : 5), 4, FIELD.width - 4);
  } else {
    // Attack the cage from an angle rather than straight into the crease.
    const lateralBias = p.y >= goal.y ? 1 : -1;
    tx = goal.x - dir * (5.5 + m.rng.range(-0.4, 0.4));
    ty = goal.y + lateralBias * 4.6;
  }

  const sprint = markerDist > 3 && p.stamina > 25;
  seek(m, p, tx, ty, sprint, 0.8);
}

/* --------------------------------------------------------------- defense */

function markFor(m: Match, p: MatchPlayer): MatchPlayer | null {
  const wanted = MARKING[p.slot as SlotKey];
  const opp = m.opponentsOf(p);
  if (wanted) {
    const found = opp.find((o) => o.slot === wanted);
    if (found) return found;
  }
  return nearestOpponent(m, p);
}

function defenseSlot(m: Match, p: MatchPlayer): void {
  const slot = slotWorld(p.side, p.slot, false);
  // Same slow drift as the offensive set: holding a zone is not standing still.
  const phase = p.index * 2.3;
  seek(
    m, p,
    slot.x + Math.cos(m.elapsed * 0.4 + phase) * 1.3,
    slot.y + Math.sin(m.elapsed * 0.5 + phase) * 1.6,
    false, 0.5,
  );
}

function defenseAI(m: Match, p: MatchPlayer, dt: number): void {
  const b = m.ball;
  const carrier = b.carrier!;
  const own = defendingGoal(p.side);
  const d = m.diff;
  const tac = m.tacticsOf(p.side).def;

  // Attackmen of the defending team ride briefly, then get back onside.
  if (p.slot.startsWith('A')) {
    const carrierDeep = dist(carrier.x, carrier.y, own.x, own.y) > 55;
    if (carrierDeep && rank(m, p, carrier.x, carrier.y) < 1) {
      seek(m, p, carrier.x, carrier.y, true, 1.0);
      if (dist(p.x, p.y, carrier.x, carrier.y) < SIM.checkRange && p.checkCd <= 0
        && m.rng.next() < 1 - Math.exp(-0.6 * d.checkTiming * dt)) {
        m.doCheck(p);
      }
    } else {
      defenseSlot(m, p);
    }
    return;
  }

  const mark = markFor(m, p);
  const onBall = mark === carrier;
  const carrierToGoal = dist(carrier.x, carrier.y, own.x, own.y);
  const myToCarrier = dist(p.x, p.y, carrier.x, carrier.y);

  // Star awareness: a defence knows who it cannot let get going. A marked star
  // is played a touch tighter and drawn help a touch sooner. Deliberately small
  // — a star should still be worth having, just not free.
  const star = starTier(carrier.data.overall, m.cfg.level);
  const starTight = star === 2 ? 0.82 : star === 1 ? 0.9 : 1;
  const starHelp = star === 2 ? 1.15 : star === 1 ? 1.07 : 1;

  // A coached defence slides on time and covers lanes; an uncoached one waits
  // for the ball to come to it.
  const dIQ = m.coachingOf(p.side).defenseIQ;
  const markDist = Math.min(tac.markDistance, d.markDistance) * (onBall ? starTight : 1) * (1 - dIQ * 0.1);
  const slideRange = Math.max(tac.slideTrigger, d.slideTrigger) * starHelp * (1 + dIQ * 0.14);

  // --- on-ball defender: body up and look for a check.
  if (onBall) {
    const toGoal = normalize(own.x - carrier.x, own.y - carrier.y);
    const raw = clearOfCrease(
      carrier.x + toGoal.x * markDist * 0.85,
      carrier.y + toGoal.y * markDist * 0.85,
      own.x, own.y,
    );
    seek(m, p, raw.x, raw.y, myToCarrier > 3, 0.25);

    if (myToCarrier < SIM.checkRange * 0.95 && p.checkCd <= 0) {
      // Attempts per second, not per frame — a defender throws a check roughly
      // every couple of seconds, not thirty times a second.
      const perSecond = 0.5 * tac.checkRate * (0.5 + d.checkTiming * 0.7);
      const smart = carrier.dodgeTimer <= 0 ? 1 : 0.2;
      if (m.rng.next() < 1 - Math.exp(-perSecond * smart * dt)) m.doCheck(p);
    }
    return;
  }

  // --- slide: help when the carrier gets inside.
  const shouldSlide =
    carrierToGoal < slideRange &&
    myToCarrier < slideRange * 1.15 &&
    rank(m, p, carrier.x, carrier.y) < 1;

  if (shouldSlide && m.rng.next() < clamp(0.35 + d.decisionQuality * 0.65 + dIQ * 0.2, 0, 0.98)) {
    p.aiSliding = true;
    seek(m, p, carrier.x, carrier.y, true, 0.3);
    if (dist(p.x, p.y, carrier.x, carrier.y) < SIM.checkRange && p.checkCd <= 0) {
      const perSecond = 0.7 * tac.checkRate * (0.5 + d.checkTiming * 0.7);
      if (m.rng.next() < 1 - Math.exp(-perSecond * dt)) m.doCheck(p);
    }
    return;
  }
  p.aiSliding = false;

  // --- off-ball: sit between your man and the cage, shading toward the crease.
  if (!mark) { defenseSlot(m, p); return; }
  const toGoal = normalize(own.x - mark.x, own.y - mark.y);
  let tx = mark.x + toGoal.x * markDist;
  let ty = mark.y + toGoal.y * markDist;

  // Pack it in: bias help defenders toward the crease.
  const creasePull = (tac.creaseBias - 1) * 0.55;
  if (creasePull !== 0) {
    tx += (own.x - tx) * creasePull * 0.35;
    ty += (own.y - ty) * creasePull * 0.35;
  }

  // Deny the passing lane if we are close to it.
  const laneD = pointSeg(p.x, p.y, carrier.x, carrier.y, mark.x, mark.y);
  if (laneD < 3 + dIQ && m.rng.next() < clamp(d.decisionQuality + dIQ * 0.25, 0, 0.98)) {
    const mid = { x: (carrier.x + mark.x) / 2, y: (carrier.y + mark.y) / 2 };
    tx = tx * 0.55 + mid.x * 0.45;
    ty = ty * 0.55 + mid.y * 0.45;
  }

  const safe = clearOfCrease(tx, ty, own.x, own.y);
  seek(m, p, safe.x, safe.y, dist(p.x, p.y, safe.x, safe.y) > 5, 0.4);
}

function pointSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return dist(px, py, ax, ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  return dist(px, py, ax + dx * t, ay + dy * t);
}

/* ---------------------------------------------------------------- goalie */

/** How much of the cage a keeper covers with body and stick, in yards. The goal
 *  mouth is 2 yards wide, so this deliberately never covers the whole thing. */
export function saveRadius(goalieRating: number): number {
  return 0.25 + goalieRating / 300;
}

export function updateGoalie(m: Match, g: MatchPlayer, dt: number): void {
  const b = m.ball;
  const own = defendingGoal(g.side);
  const dir = attackDir(g.side);
  const a = g.data.attrs;

  // Has the ball: outlet it. The longer he holds, the less picky he gets.
  if (b.carrier === g) {
    g.aiCut += dt;
    g.aiThink -= dt;
    const upfield = own.x + dir * 12;
    const mate = m.choosePassTarget(g, dir, 0);
    const tolerance = g.aiCut > 3 ? 1.1 : g.aiCut > 1.5 ? 0.7 : 0.45;
    if (g.aiThink <= 0) {
      if (mate && m.laneRisk(g.x, g.y, mate.x, mate.y, g.side) < tolerance) {
        const aim = normalize(mate.x - g.x, mate.y - g.y);
        m.doPass(g, aim.x, aim.y, 0.9);
        m.stats[g.side].clears++;
        g.aiCut = 0;
        return;
      }
      g.aiThink = 0.3;
    }
    seek(m, g, upfield, clamp(g.y, 12, FIELD.width - 12), true, 1.5);
    return;
  }
  g.aiCut = 0;

  // A shot is on the way. He does NOT react instantly: a reaction window runs
  // first, which is exactly why picking a corner beats him.
  if (b.state === 'shot' && isComingAt(m, g)) {
    const reactMul = m.setups[g.side].human ? 1 : m.diff.goalieReaction;
    const keeper = m.keeperRating(g);
    const reactionWindow = clamp(0.34 - keeper / 520, 0.08, 0.34) / Math.max(0.5, reactMul);
    g.aiMark += dt;
    if (g.aiMark < reactionWindow) {
      // Frozen for a beat — still holding his arc position.
      const holdTo = normalize(own.x + dir * 1.1 - g.x, own.y - g.y);
      m.setMove(g, holdTo.x * 0.2, holdTo.y * 0.2, false);
      g.animPose = 'idle';
      return;
    }
    const tCross = timeToLine(m, own.x);
    const predictedY = b.y + b.vy * clamp(tCross, 0, 0.7);
    // Weaker keepers guess late and short.
    const blend = clamp(0.3 + m.keeperRating(g) / 190, 0.25, 0.95) * clamp(reactMul, 0.6, 1.1);
    const targetY = b.y + (predictedY - b.y) * blend;
    const ty = clamp(targetY, own.y - 3.2, own.y + 3.2);
    const tx = own.x + dir * 0.55;
    const step = normalize(tx - g.x, ty - g.y);
    m.setMove(g, step.x, step.y, true);
    g.animPose = 'dive';
    g.poseTimer = 0.2;
    return;
  }
  g.aiMark = 0;

  // Normal arc positioning: stay on the line between the ball and the cage.
  const bx = b.carrier ? b.carrier.x : b.x;
  const by = b.carrier ? b.carrier.y : b.y;
  const toBall = normalize(bx - own.x, by - own.y);
  const arc = 0.95 + clamp(a.awareness / 320, 0, 0.45);
  const tx = own.x + toBall.x * arc;
  const ty = clamp(own.y + toBall.y * arc * 1.35, own.y - 2.6, own.y + 2.6);
  seek(m, g, tx, ty, false, 0.2);
}

function isComingAt(m: Match, g: MatchPlayer): boolean {
  const b = m.ball;
  const own = defendingGoal(g.side);
  const dir = attackDir(g.side);
  // Ball travelling toward our goal line.
  const toward = dir > 0 ? b.vx < -2 : b.vx > 2;
  return toward && Math.abs(b.x - own.x) < 26 && Math.abs(b.y - own.y) < 16;
}

function timeToLine(m: Match, lineX: number): number {
  const b = m.ball;
  if (Math.abs(b.vx) < 0.5) return 0;
  return clamp((lineX - b.x) / b.vx, 0, 1.2);
}
