import { clamp } from '../../core/math';
import {
  FIELD, attackDir, clampToField, dist2, fieldGoalDistance, otherSide,
  yardsToGoal, type Side,
} from './field';
import {
  DEFENSIVE_PLAYS, OFFENSIVE_PLAYS,
  type DefensivePlay, type OffensivePlay, type PlayFamily, type RouteSpec,
} from './playbook';
import { starterAt, type Player } from './data';
import { FOOTBALL } from './tuning';
import type { FieldPlayer } from './types';
import type { FootballGame } from './Game';

/* ---------------------------------------------------------------------------
 * THE FOOTBALL BRAIN
 * ---------------------------------------------------------------------------
 * Four different kinds of thinking live here, and they are separated because
 * they fail in completely different ways:
 *
 *   RUNNING A ROUTE     a receiver executing an assignment, adjusting to the
 *                       coverage in front of him, and coming back to a bad ball.
 *   PLAYING DEFENCE     man, zone, the rush and the pursuit — the part that
 *                       decides whether the game is any good.
 *   PLAYING QUARTERBACK reading the field, waiting the right length of time, and
 *                       knowing when there is nothing there.
 *   CALLING THE PLAY    the coach, on both sides of the ball.
 *
 * THE RULE THIS FILE IS BUILT ON. Difficulty never touches a rating. A Legend
 * cornerback and a Rookie cornerback with the same card run the same speed and
 * have the same hands. What changes is WHEN he starts moving, HOW MUCH he
 * anticipates, WHETHER he stays with his assignment when the ball goes the other
 * way, and HOW WELL his coordinator guesses. Every difficulty term below feeds
 * one of those four, and none of them feeds an attribute.
 *
 * WHY THE AI READS `game` RATHER THAN A SNAPSHOT. A defender who is told what
 * play was called is not an AI, he is a cheat, and the sport is ruined by it. So
 * the only things read here are things a man on the field can SEE: where the
 * bodies are, where the ball is, and what this offence has done on its previous
 * downs. The play call itself is never read by the defence.
 * ------------------------------------------------------------------------- */

/* ====================================================================== routes */

interface Wp { x: number; y: number; settle: boolean }

/**
 * A ROUTE AS A PATH, not as a probability.
 *
 * Every break is a real point on the grass, so a corner with inside leverage is
 * genuinely beaten by an out and genuinely on top of a slant. That is the whole
 * reason the routes are geometry: it makes the coverage call matter without
 * anybody writing down that it should.
 *
 * `lat` is lateral yards, already mirrored for whichever end the offence is
 * attacking, so "stretch left" is the same play in both directions.
 */
function routePath(route: RouteSpec, sx: number, los: number, dir: 1 | -1): Wp[] {
  const d = route.breakDir * dir;
  const at = (depth: number, lat: number, settle = false): Wp => ({
    x: clampToField(sx + lat),
    y: los + dir * depth,
    settle,
  });
  const k = route.depth;
  switch (route.kind) {
    case 'go':
      return [at(k * 0.6, d * 1.5), at(k, 0), at(k + 20, d * 0.5)];
    case 'slant':
      return [at(k, 0), at(k + 10, d * 11)];
    case 'hitch':
      return [at(k + 1.5, 0), at(k - 1, d * 0.5, true)];
    case 'flat':
      return [at(Math.max(1, k * 0.6), 0), at(k, d * 9), at(k + 1.5, d * 20)];
    case 'drag':
      return [at(k, 0), at(k + 1.2, d * 14), at(k + 2.4, d * 28)];
    case 'out':
      return [at(k, 0), at(k, d * 11), at(k + 0.8, d * 22)];
    case 'in':
      return [at(k, 0), at(k, d * 13), at(k + 1, d * 26)];
    case 'curl':
      return [at(k + 2.5, d * 1.5), at(k, d * 2, true)];
    case 'corner':
      return [at(k, 0), at(k + 12, d * 12), at(k + 22, d * 18)];
    case 'post':
      return [at(k, 0), at(k + 13, d * 11), at(k + 24, d * 17)];
    case 'wheel':
      return [at(1.5, 0), at(2.5, d * 9), at(20, d * 11.5)];
    case 'screen':
      return [at(-1.5, d * 6, true)];
    case 'checkdown':
      return [at(k, d * 3), at(k + 1, d * 8, true)];
    default:
      return [];
  }
}

/**
 * WHERE HE WILL BE IN `t` SECONDS — ALONG THE ROUTE HE IS RUNNING.
 *
 * The difference between this and `position + velocity * t` is the whole passing
 * game. A receiver about to break inside on a slant is, at that instant, running
 * straight upfield at ten yards a second; leading him off that heading for the
 * eight tenths of a second the ball is in the air puts it eight yards deeper
 * than the route ever goes, and a curl — which STOPS — gets led into the next
 * postcode. Measured on the first version, it made the average completion in the
 * game travel seventeen yards through the air, which is more than twice what the
 * real sport does.
 *
 * So the throw is led along the path he was actually given, at the speed he is
 * actually running, and a quarterback anticipating a break is what that is
 * called when a person does it.
 */
export function projectReceiver(
  game: FootballGame, p: FieldPlayer, t: number,
): { x: number; y: number } {
  const route = p.route;
  const linear = { x: clampToField(p.x + p.vx * t), y: p.y + p.vy * t };
  if (!route || route.kind === 'block') return linear;

  const path = routePath(route, routeStartX(game, p), game.lineOfScrimmage, attackDir(p.side));
  if (!path.length) return linear;

  let budget = t * Math.max(3.5, Math.hypot(p.vx, p.vy));
  let cx = p.x;
  let cy = p.y;
  let i = Math.min(Math.max(0, Math.round(p.routeProgress)), path.length - 1);
  let guard = 0;
  while (budget > 0.01 && guard++ < 8) {
    const wp = path[i];
    const leg = dist2(cx, cy, wp.x, wp.y);
    if (leg < 0.01) {
      // He has arrived. A settling route stops here; a vertical one has more path.
      if (i >= path.length - 1) break;
      i++;
      continue;
    }
    if (leg <= budget && i < path.length - 1) {
      budget -= leg;
      cx = wp.x;
      cy = wp.y;
      i++;
      continue;
    }
    const f = Math.min(1, budget / leg);
    cx += (wp.x - cx) * f;
    cy += (wp.y - cy) * f;
    break;
  }
  return { x: clampToField(cx), y: cy };
}

/** Where a receiver lined up, recovered rather than stored. */
function routeStartX(game: FootballGame, p: FieldPlayer): number {
  const dir = attackDir(p.side);
  return clampToField(game.ballX + (p.route?.splitX ?? 0) * dir);
}

/** Steer toward a spot on the field. */
function driveTo(
  game: FootballGame, p: FieldPlayer, x: number, y: number,
  sprint: boolean, dt: number, pace = 1,
): void {
  game.drive(p, x - p.x, y - p.y, sprint, dt, pace);
}

/**
 * RUNNING A ROUTE.
 *
 * Four behaviours in one, in the order a receiver's priorities actually run:
 * the ball in the air beats everything, then the release off the line, then the
 * assignment, then — once the route is finished — finding grass, which is the
 * difference between a receiver and a waypoint follower.
 */
export function runRoute(game: FootballGame, p: FieldPlayer, dt: number): void {
  const b = game.ball;
  const route = p.route;

  /* THE BALL IS IN THE AIR TO HIM. Everything else stops. He goes to where it
   * is going to land rather than to where it is, which is what lets a receiver
   * come BACK to an underthrown ball instead of running away from it — the
   * single most important behaviour in a passing game, and the thing whose
   * absence makes a football game feel broken. */
  if (b.state === 'thrown') {
    if (b.target === p.uid) {
      driveTo(game, p, b.aimX, b.aimY, true, dt);
      p.pose = dist2(p.x, p.y, b.aimX, b.aimY) < 2 ? 'catch' : 'sprint';
      return;
    }
    /* A NEARBY TEAM-MATE PLAYS THE TIP. Not everybody — a receiver forty yards
     * away chasing a ball he cannot reach looks like a bug. */
    if (dist2(p.x, p.y, b.aimX, b.aimY) < 7) {
      driveTo(game, p, b.aimX, b.aimY, true, dt);
      return;
    }
  }

  if (!route || route.kind === 'block') {
    blockFor(game, p, dt);
    return;
  }

  /* THE RELEASE. A corner pressed up in his face costs him the first step, and
   * how much it costs is his route running against the corner's coverage. On a
   * soft cushion there is nothing to beat and the release is free. */
  let pace = 1;
  if (game.playTime < 0.75) {
    const jam = nearestOpponent(game, p, 1.7);
    if (jam) {
      const win = (p.data.attrs.routeRunning - jam.data.attrs.coverage) / 170;
      pace = clamp(0.52 + win, 0.42, 1);
    }
  }

  const dir = attackDir(p.side);
  const path = routePath(route, routeStartX(game, p), game.lineOfScrimmage, dir);
  if (!path.length) {
    blockFor(game, p, dt);
    return;
  }
  let i = Math.min(Math.max(0, Math.round(p.routeProgress)), path.length - 1);
  const wp = path[i];
  if (dist2(p.x, p.y, wp.x, wp.y) < 1.1 && i < path.length - 1) {
    i += 1;
    p.routeProgress = i;
  }
  const target = path[i];

  /* THE SETTLE. A curl, a hitch or a checkdown is supposed to STOP in a hole,
   * and finding the hole is the receiver's job: against a zone he slides to the
   * space between two defenders; against man there is no hole, so he keeps
   * working away from the man on him. */
  if (target.settle && dist2(p.x, p.y, target.x, target.y) < 2.2) {
    settleInSpace(game, p, target, dt);
    return;
  }

  /* A DEEP ROUTE STEMS AWAY FROM LEVERAGE. If the man covering him is sitting
   * inside, he takes the route a yard further outside — small, and the reason a
   * go route against press is not a coin flip. */
  let tx = target.x;
  if (!target.settle && (route.kind === 'go' || route.kind === 'post' || route.kind === 'corner')) {
    const man = nearestOpponent(game, p, 4);
    if (man) tx = clampToField(tx + Math.sign(p.x - man.x) * 1.4);
  }
  driveTo(game, p, tx, target.y, true, dt, pace);
}

/** Slide into the biggest gap nearby, which is what beats a zone. */
function settleInSpace(game: FootballGame, p: FieldPlayer, wp: Wp, dt: number): void {
  let push = 0;
  let nearest = 99;
  for (const d of game.players) {
    if (d.side === p.side) continue;
    const gap = dist2(p.x, p.y, d.x, d.y);
    if (gap > 9) continue;
    nearest = Math.min(nearest, gap);
    push += (p.x - d.x) / Math.max(1.2, gap * gap);
  }
  // Already open: stand still and give the quarterback a stationary target.
  if (nearest > 5.5) {
    game.drive(p, 0, 0, false, dt);
    p.pose = 'idle';
    return;
  }
  const x = clampToField(p.x + clamp(push * 9, -6, 6));
  driveTo(game, p, x, wp.y, false, dt, 0.85);
}

/**
 * BLOCKING.
 *
 * A blocker does not have a route, he has a MAN, and finding him is the whole
 * job: on a pass he picks up the rusher nearest the quarterback, and on a run he
 * takes the nearest body between the ball and the grass. Once the two meet the
 * engine locks them together and the block is decided by ratings, so all this
 * has to get right is who goes where.
 */
function blockFor(game: FootballGame, p: FieldPlayer, dt: number): void {
  const carrier = game.byUid(game.ball.carrier);
  const dir = attackDir(p.side);

  if (p.engagedWith) {
    const on = game.byUid(p.engagedWith);
    if (on) {
      driveTo(game, p, on.x, on.y, false, dt, 0.4);
      p.pose = 'block';
      return;
    }
  }

  // The man being protected: the ball carrier on a run, the passer on a pass.
  const anchor = carrier ?? game.playerInSlot(p.side, 'QB');
  const ax = anchor ? anchor.x : game.ballX;
  const ay = anchor ? anchor.y : game.lineOfScrimmage;

  let best: FieldPlayer | null = null;
  let bestScore = Infinity;
  for (const d of game.players) {
    if (d.side === p.side || d.engagedWith || d.stunned > 0) continue;
    const toMe = dist2(p.x, p.y, d.x, d.y);
    if (toMe > 11) continue;
    // Whoever is closest to the man I am protecting, weighted by how far I have
    // to go to get there — a guard does not cross the formation for a corner.
    const score = dist2(ax, ay, d.x, d.y) + toMe * 0.75;
    if (score < bestScore) { bestScore = score; best = d; }
  }
  if (!best) {
    // Nobody to hit: on a run, get downfield; on a pass, set in the pocket.
    const y = carrier && (carrier.y - game.lineOfScrimmage) * dir > -1
      ? game.lineOfScrimmage + dir * 6
      : game.lineOfScrimmage - dir * 1.4;
    driveTo(game, p, p.x, y, false, dt, 0.7);
    return;
  }
  /* GET BETWEEN HIM AND THE BALL, rather than running at him — a blocker who
   * aims at a rusher's body gets run around, and one who aims at the spot in
   * front of him does not. */
  const bx = dist2(best.x, best.y, ax, ay) || 1;
  const px = best.x + ((ax - best.x) / bx) * 0.9;
  const py = best.y + ((ay - best.y) / bx) * 0.9;
  driveTo(game, p, px, py, true, dt);
  p.pose = 'block';
}

function nearestOpponent(game: FootballGame, p: FieldPlayer, within: number): FieldPlayer | null {
  let best: FieldPlayer | null = null;
  let near = within;
  for (const d of game.players) {
    if (d.side === p.side) continue;
    const gap = dist2(p.x, p.y, d.x, d.y);
    if (gap < near) { near = gap; best = d; }
  }
  return best;
}

/* ==================================================================== defence */

/**
 * PLAYING DEFENCE.
 *
 * The order below is the order a defender's eyes actually work, and getting it
 * wrong is what makes a defence look stupid:
 *
 *   1. IS THE BALL IN THE AIR?   then break on it, if he is close enough to have
 *      a play on it at all.
 *   2. IS SOMEBODY RUNNING?      then pursue, at an angle rather than at his
 *      back — but only once he has DIAGNOSED it, which is the whole difference
 *      between a play-action fake working and not.
 *   3. AM I RUSHING?             then win the edge.
 *   4. OTHERWISE                 cover the man or the grass I was given.
 */
export function steerDefender(game: FootballGame, p: FieldPlayer, dt: number): void {
  const b = game.ball;
  const carrier = game.byUid(b.carrier);

  /* 1. THE BALL IN THE AIR. A defender who can get to where it is going goes; one
   * who cannot keeps covering, because a whole secondary sprinting at every
   * throw is how a game gives up thirty yards after the catch. */
  if (b.state === 'thrown' && p.react <= 0) {
    const toSpot = dist2(p.x, p.y, b.aimX, b.aimY);
    const onMyMan = p.assignment !== null && b.target === p.assignment;
    if (onMyMan || toSpot < 11) {
      driveTo(game, p, b.aimX, b.aimY, true, dt);
      return;
    }
  }

  const rushing = p.assignment === null && p.zone === null;

  /* 2. SOMEBODY IS RUNNING WITH IT. Diagnosis takes time, and how much time is
   * the defender's awareness against the difficulty's reaction — never his
   * speed. A linebacker who reads run instantly on every snap makes play action
   * pointless, and play action is one of the best things in the sport. */
  if (carrier && carrier.side !== p.side) {
    const dir = attackDir(carrier.side);
    const past = (carrier.y - game.lineOfScrimmage) * dir;
    const isRun = game.offensivePlay.handoff || game.thrown || past > -0.5
      || carrier.slot !== 'QB';
    /* A MAN WITH THE BALL IN HIS HANDS IN FRONT OF YOU NEEDS NO DIAGNOSING. Past
     * the line, or on a ball already thrown and caught, everybody goes. It is
     * only the handoff itself that has to be recognised. */
    const obvious = game.thrown || past > 0.5 || carrier.slot !== 'QB' ? false : false;
    const needsRead = game.offensivePlay.handoff && past < 1
      && !rushing && !game.thrown;
    const diagnosed = p.react <= 0
      && (!needsRead || game.playTime >= runReadDelay(game, p));
    void obvious;
    if (isRun && diagnosed) {
      pursue(game, p, carrier, dt);
      return;
    }
  }

  if (rushing) {
    rushPasser(game, p, dt);
    return;
  }

  if (p.assignment !== null) {
    coverMan(game, p, dt);
    return;
  }
  if (p.zone) {
    coverZone(game, p, dt);
    return;
  }
  // No job at all: go to the ball. Should not happen, and looks sane if it does.
  driveTo(game, p, b.x, b.y, true, dt);
}

/**
 * HOW LONG IT TAKES HIM TO WORK OUT THAT IT IS A RUN.
 *
 * The single most important number in run defence and the one the first version
 * left out entirely: every defender diagnosed a handoff on the frame it
 * happened and arrived downhill at full speed, which meant a running back five
 * yards deep met three linebackers at the line of scrimmage on every carry and
 * the whole run game averaged under a yard.
 *
 * Real diagnosis takes about half a second, and it is what PLAY ACTION IS FOR —
 * the fake buys the offence exactly this, and nothing else. So awareness sets
 * the base, the difficulty's play reading scales it, and a good fake adds to it
 * against a defence that is not good enough to ignore it.
 */
function runReadDelay(game: FootballGame, p: FieldPlayer): number {
  const iq = clamp(p.data.attrs.awareness / 99, 0, 1);
  const read = clamp(game.cfg.difficulty.playRead, 0, 1);
  let delay = (0.62 - iq * 0.26) * (1.35 - read * 0.55);
  if (game.offensivePlay.family === 'playaction') delay += 0.45 * (1 - read * 0.7);
  return delay;
}

/**
 * A PURSUIT ANGLE.
 *
 * Aimed where the carrier WILL be, not where he is, and how far ahead is the
 * defender's awareness. That is what a bad angle actually is: a defender who
 * runs at a man's current position and arrives three yards behind him. A
 * defender in front of the play takes a shallower lead so he does not overrun
 * a cutback, which is the other half of the same skill.
 */
function pursue(game: FootballGame, p: FieldPlayer, carrier: FieldPlayer, dt: number): void {
  const mine = clamp(p.data.attrs.awareness / 99, 0, 1);
  const gap = dist2(p.x, p.y, carrier.x, carrier.y);
  const mySpeed = FOOTBALL.baseSpeed + p.data.attrs.speed * FOOTBALL.speedPerRating;
  const lead = clamp(gap / Math.max(3, mySpeed), 0, 1.15) * (0.35 + mine * 0.75);

  const dir = attackDir(carrier.side);
  const ahead = (p.y - carrier.y) * dir > 0;
  const use = ahead ? lead * 0.55 : lead;
  let tx = carrier.x + carrier.vx * use;
  let ty = carrier.y + carrier.vy * use;

  /* CONTAIN, AND THEN TACKLE HIM.
   *
   * A defender outside the carrier keeps his outside shoulder so a ball carrier
   * cannot simply run round the edge for ever — but only while he is still a way
   * off. Holding the leverage all the way in produces a defender who runs
   * alongside a man for forty yards and never touches him, which is exactly what
   * the first version did: every long run in the game had an escort. */
  if (ahead && gap > 4 && Math.abs(p.x - carrier.x) > 2) {
    tx = carrier.x + Math.sign(p.x - carrier.x) * 1.1;
    ty = carrier.y + dir * 1.6;
  }
  // Nothing is off the field.
  tx = clampToField(tx);
  ty = clamp(ty, -2, FIELD.length + 2);
  driveTo(game, p, tx, ty, true, dt);
  p.pose = gap < 2.5 ? 'tackle' : 'sprint';
}

/**
 * THE PASS RUSH.
 *
 * A rusher does not run at the quarterback, he runs at the SIDE of the blocker
 * in his way, and how wide that arc is comes off the difficulty's rush urgency —
 * a Rookie front takes the long way round and arrives after the throw, a Legend
 * front takes the shortest path that is not straight into a block. Neither of
 * them runs a yard per second faster than the other.
 */
function rushPasser(game: FootballGame, p: FieldPlayer, dt: number): void {
  const d = game.cfg.difficulty;
  const target = game.byUid(game.ball.carrier) ?? game.playerInSlot(game.possession, 'QB');
  if (!target) {
    driveTo(game, p, game.ballX, game.lineOfScrimmage, true, dt);
    return;
  }
  if (p.engagedWith) {
    // Locked up. Keep driving through him: the engine decides when he comes free.
    driveTo(game, p, target.x, target.y, true, dt, 0.45);
    p.pose = 'block';
    return;
  }
  if (p.react > 0) {
    driveTo(game, p, p.x, p.y, false, dt, 0.2);
    p.pose = 'stance';
    return;
  }

  let tx = target.x;
  const ty = target.y;
  // Is somebody standing between me and him?
  const gap = dist2(p.x, p.y, target.x, target.y);
  for (const b of game.players) {
    if (b.side === p.side || b.engagedWith) continue;
    if (b.route?.kind !== 'block') continue;
    const between = dist2(b.x, b.y, target.x, target.y) < gap
      && dist2(p.x, p.y, b.x, b.y) < 4.5;
    if (!between) continue;
    /* GO ROUND HIM, on the side he is not. Wide on an easy setting, tight on a
     * hard one — a decision, not a speed. */
    const lane = 1.55 * (2 - clamp(d.rushUrgency, 0.5, 1.5));
    tx = b.x + Math.sign(p.x - b.x || 1) * lane;
    break;
  }
  driveTo(game, p, clampToField(tx), ty, true, dt);
  p.pose = gap < 3 ? 'tackle' : 'rush';
}

/**
 * MAN COVERAGE.
 *
 * Mirror him, from a trail position, aiming at where he is GOING. How far ahead
 * the defender looks is his coverage rating and the difficulty's tightness; how
 * far behind he sits is his coverage rating against the receiver's route
 * running. A beaten corner stays beaten, because the aim point is still the
 * receiver and he simply cannot get there.
 */
function coverMan(game: FootballGame, p: FieldPlayer, dt: number): void {
  const d = game.cfg.difficulty;
  const man = game.byUid(p.assignment);
  if (!man) { coverZone(game, p, dt); return; }

  const skill = clamp(p.data.attrs.coverage / 99, 0, 1);
  const look = (0.12 + skill * 0.3) * clamp(d.coverageTight, 0.5, 1.5);
  const late = p.react > 0 ? 0.35 : 1;

  const dir = attackDir(man.side);
  /* LEVERAGE. He plays between his man and the end zone, so being beaten deep
   * costs a touchdown and being beaten underneath costs six yards — which is
   * why a soft corner gives up the short game and never the long one. */
  const trail = clamp(1.6 - skill * 1.1, 0.4, 1.6) / clamp(d.coverageTight, 0.5, 1.5);
  const tx = man.x + man.vx * look * late;
  const ty = man.y + man.vy * look * late + dir * trail;

  driveTo(game, p, clampToField(tx), ty, true, dt, late);
  p.pose = 'run';
}

/**
 * ZONE COVERAGE.
 *
 * He owns an area, drops to it, and then works to whichever receiver has entered
 * it — which is exactly why two men in one zone beats it and a fast man alone
 * does not. DISCIPLINE decides whether he leaves it early to chase the ball,
 * and on the easy settings he does, which is how a soft zone gets carved up.
 */
function coverZone(game: FootballGame, p: FieldPlayer, dt: number): void {
  const d = game.cfg.difficulty;
  const z = p.zone;
  if (!z) { driveTo(game, p, game.ball.x, game.ball.y, true, dt); return; }

  const dir = attackDir(game.possession);
  const late = p.react > 0 ? 0.45 : 1;

  /* A DEEP ZONE IS A CEILING, NOT A SPOT.
   *
   * The whole job of a deep third is that nobody gets behind it, so the man
   * playing it stays on top of the deepest receiver in his part of the field
   * rather than standing on a coordinate watching a go route run past him. The
   * first version of this sat at a fixed depth and reacted only to receivers
   * inside a radius, which meant every four-verticals call was a touchdown.
   */
  if (z.radius >= 10) {
    let topY = z.y;
    let topX = z.x;
    for (const r of game.players) {
      if (r.side === p.side || !r.route || r.route.kind === 'block') continue;
      if (Math.abs(r.x - z.x) > z.radius * 1.6) continue;
      const look = r.y + r.vy * 0.35;
      if ((look - topY) * dir > 0) { topY = look; topX = r.x + r.vx * 0.35; }
    }
    const ty = topY + dir * 2.6;
    const tx = z.x + clamp(topX - z.x, -z.radius, z.radius);
    driveTo(game, p, clampToField(tx), ty, true, dt, late);
    p.pose = 'run';
    return;
  }

  /* AN UNDERNEATH ZONE IS A SPOT WITH A MAN IN IT. He sits in the window until
   * somebody enters it, then closes — which is why two receivers in one area
   * beats a zone and a fast man alone does not. */
  let threat: FieldPlayer | null = null;
  let near = z.radius * 1.3;
  for (const r of game.players) {
    if (r.side === p.side || !r.route || r.route.kind === 'block') continue;
    const inZone = dist2(r.x + r.vx * 0.3, r.y + r.vy * 0.3, z.x, z.y);
    if (inZone < near) { near = inZone; threat = r; }
  }

  if (!threat) {
    driveTo(game, p, z.x, z.y, false, dt, 0.8);
    p.pose = dist2(p.x, p.y, z.x, z.y) < 1.5 ? 'idle' : 'run';
    return;
  }

  /* SPLIT THE DIFFERENCE. He closes on the man but stays anchored to the middle
   * of his area, and how far he strays is his discipline. A disciplined zone
   * gives up the catch and not the run after it. */
  const pull = clamp(1 - d.discipline, 0.1, 0.8);
  const skill = clamp(p.data.attrs.coverage / 99, 0, 1);
  const look = (0.1 + skill * 0.24) * clamp(d.coverageTight, 0.5, 1.5);
  const bias = 0.62 + pull * 0.38;
  const tx = z.x + (threat.x + threat.vx * look - z.x) * bias;
  const ty = z.y + (threat.y + threat.vy * look - z.y) * bias;
  driveTo(game, p, clampToField(tx), ty, true, dt, late);
  p.pose = 'run';
}

/* ================================================================ quarterback */

interface Read { p: FieldPlayer; score: number; sep: number; depth: number }

/**
 * PLAYING QUARTERBACK.
 *
 * Three jobs in sequence and the order is the position: SET UP, READ, and then
 * either THROW or SURVIVE. The rating that matters most is `decision`, and it
 * matters in two ways that are both true of real quarterbacks — a bad decision
 * maker SEES fewer receivers, and he MISJUDGES how open the ones he sees are.
 * Neither of those is a dice roll on the throw; they are both errors of the eye,
 * and they produce interceptions the way the sport does.
 */
export function aiQuarterback(game: FootballGame, qb: FieldPlayer, dt: number): void {
  const play = game.offensivePlay;
  const dir = attackDir(qb.side);
  const los = game.lineOfScrimmage;
  const drop = play.routes.find((r) => r.slot === 'QB')?.route.backfield ?? 5;
  const pressure = game.pressureOn(qb);
  const a = qb.data.attrs;
  const decision = clamp(a.decision / 99, 0, 1);

  // Past the line he is a runner and nothing else, which is the rule.
  if ((qb.y - los) * dir > 0.4) {
    game.carrierAi(qb, dt);
    return;
  }

  /* THE DROP. He backs to his spot and sets; until he is set he is not looking
   * at anybody, which is the half-second a blitz is trying to beat. */
  const setBy = 0.2 + drop * 0.11;
  if (game.playTime < setBy) {
    driveTo(game, qb, game.ballX, los - dir * drop, false, dt);
    p_face(qb, dir);
    return;
  }

  const reads = readTheField(game, qb, decision);

  /* HOW OPEN IS OPEN ENOUGH. It falls as the pocket collapses and as the play
   * runs out of time, because a quarterback holding out for a perfect window
   * takes a sack, and taking a sack on every down is worse than a contested
   * throw. */
  const late = game.playTime - play.develops;
  const need = clamp(3.3 - pressure * 1.9 - Math.max(0, late) * 0.75, 0.9, 3.6)
    * (0.85 + (1 - decision) * 0.3);
  /* HE LETS THE PLAY HAPPEN. Throwing at eight tenths of the timing means the
   * ball is gone before the rush has had a chance to matter, and a passing game
   * with no sacks in it is a passing game with no decisions in it. */
  /* ON RHYTHM. A good quarterback throws as the receiver breaks, not after he
   * has finished his route and run another eight yards across the field — the
   * first version waited out the full timing on every play, so the average
   * ball travelled twenty-eight yards and a defender had arrived by the time
   * it landed. Half of all passes were broken up. */
  const ready = game.playTime >= play.develops * (0.84 + (1 - decision) * 0.3);

  /* HE WORKS THE PROGRESSION, and takes the first man who is open.
   *
   * Not the most open man on the field — that is a different quarterback, one
   * with five pairs of eyes, and he throws seventeen yards downfield on every
   * snap because somebody deep always looks the most open. A real one reads one,
   * two, three in the order the play was designed in, and throws as soon as one
   * of them is there, which is why most completions in football are short. */
  /* A MAN STANDING WIDE OPEN GETS THE BALL NOW. Waiting out the full timing of
   * the play with the primary uncovered is how a quarterback turns a six yard
   * completion into a sack, and it is also what keeps the average pass in this
   * game twice as deep as the real sport's. */
  /* A DEEP BALL HAS TO BE MORE OPEN THAN A SHORT ONE BEFORE HE LETS IT GO.
   * Real quarterbacks throw short because short is safe and they know it; one
   * who treats a twenty-five yard window like a six yard one throws the ball
   * twice as far downfield as the sport does, which is what this did. */
  const bar = (r: Read): number => need * (r.depth > 12 ? 1 + (r.depth - 12) / 22
    : r.depth < 7 ? 0.62 : 0.85);
  const gift = reads[0];
  if (gift && gift.sep >= bar(gift) + 4.2 && game.playTime > 0.55) {
    game.throwTo(qb, gift.p);
    return;
  }

  if (ready) {
    const take = reads.find((r) => r.sep >= bar(r));
    if (take) {
      game.throwTo(qb, take.p);
      return;
    }
  }
  const best = reads.reduce<Read | null>(
    (b2, r) => (b2 === null || r.score > b2.score ? r : b2), null,
  );

  /* NOTHING THERE. Step up into the pocket first — the oldest answer to edge
   * pressure — and only then start running, because a quarterback who bails at
   * the first sign of a rusher never completes anything. */
  const desperate = pressure > 0.68 || late > 1.5;
  if (desperate) {
    /* RUNNING IS FOR QUARTERBACKS WHO CAN RUN. At a low enough bar every passer
     * in the league bails out of a collapsing pocket, nobody is ever sacked, and
     * the pass rush — the whole point of a defensive line — stops existing. */
    const legs = a.speed + a.agility;
    const canRun = legs > 150 || late > 2.6;
    if (canRun && (qb.y - los) * dir > -drop * 1.3) {
      game.carrierAi(qb, dt);
      return;
    }
    if (best && best.sep > 1.2 && game.playTime > play.develops * 0.6) {
      game.throwTo(qb, best.p);
      return;
    }
    /* AND YOU CANNOT THROW IT AWAY WITH A MAN ON YOU. Getting rid of it needs a
     * moment, and not having one is exactly what a sack is. */
    if (late > 1.8 && pressure < 0.75) {
      game.throwAway(qb);
      return;
    }
    // Climb the pocket, away from the nearest rusher.
    const chase = nearestOpponent(game, qb, 9);
    const away = chase ? Math.sign(qb.x - chase.x) || 1 : 0;
    driveTo(game, qb, clampToField(qb.x + away * 3), los - dir * (drop - 2), true, dt);
    return;
  }

  // Still waiting: shuffle, keep the eyes downfield.
  const chase = nearestOpponent(game, qb, 6);
  const slide = chase ? clamp((qb.x - chase.x) * 0.6, -2.5, 2.5) : 0;
  driveTo(game, qb, clampToField(qb.x + slide), los - dir * drop, false, dt, 0.55);
  p_face(qb, dir);
}

function p_face(qb: FieldPlayer, dir: 1 | -1): void {
  qb.facing = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  qb.pose = 'throw';
  qb.poseTimer = 0.05;
}

/**
 * WHAT THE QUARTERBACK SEES.
 *
 * Every eligible receiver, scored on separation, depth and whether the throw is
 * inside his arm — and then DEGRADED by his decision making, in the two ways a
 * quarterback's eyes actually fail. A 40-rated decision maker looks at three
 * receivers and misjudges each of them by a couple of yards; a 95 looks at all
 * five and is nearly right. That is where interceptions come from here, and it
 * is why they come from the wrong quarterbacks rather than at random.
 */
function readTheField(game: FootballGame, qb: FieldPlayer, decision: number): Read[] {
  const rng = game.rngForAi;
  const dir = attackDir(qb.side);
  const reach = game.throwRange(qb);
  const out: Read[] = [];

  const eligible = game.players.filter(
    (r) => r.side === qb.side && r !== qb && r.route && r.route.kind !== 'block',
  );
  void dir;
  /* HOW MANY HE GETS THROUGH. A progression is read in order and a slow processor
   * never reaches the fourth man, which is exactly why a checkdown back is worth
   * something to a bad quarterback and nothing to a good one. */
  /* THE ORDER HE LOOKS IN IS THE ORDER THE PLAY WAS WRITTEN IN. A playbook
   * entry lists its routes primary-first, so the progression is already there
   * and does not need inventing — and how far down it he gets before he has to
   * do something is his decision making. */
  const bySlot = new Map(eligible.map((r) => [r.slot, r]));
  const ordered: FieldPlayer[] = [];
  for (const spec of game.offensivePlay.routes) {
    if (spec.slot === 'QB' || spec.route.kind === 'block') continue;
    const man = bySlot.get(spec.slot);
    if (man) ordered.push(man);
  }
  for (const r of eligible) if (!ordered.includes(r)) ordered.push(r);
  /* THE LOOK DECIDES THE FIRST READ — see `firstRead`. The rest of the
   * progression follows in the order it was written. */
  const first = Math.min(game.firstRead, Math.max(0, ordered.length - 1));
  if (first > 0) ordered.unshift(...ordered.splice(first, 1));
  const canSee = Math.max(2, Math.round(2 + decision * 3.2));
  ordered.length = Math.min(ordered.length, canSee);

  const speed = FOOTBALL.throwSpeedMin
    + (qb.data.attrs.throwPower / 99) * (FOOTBALL.throwSpeedMax - FOOTBALL.throwSpeedMin);

  for (const r of ordered) {
    const throwDist = dist2(qb.x, qb.y, r.x, r.y);
    const flight = clamp(throwDist / speed, 0.1, 2.2);

    /* HOW OPEN HE WILL BE WHEN IT GETS THERE, which is the only kind of open
     * that has ever mattered.
     *
     * Judging a receiver by the space he has RIGHT NOW is the classic way to
     * build a quarterback who throws nothing but interceptions down the field: a
     * man on a go route with a safety three yards behind him looks wide open,
     * and by the time a ball that took a second and a half to arrive gets there
     * the safety is on his hip. Projecting both of them forward by the flight
     * time fixes it, and it fixes it in the direction the sport does — deep
     * throws become genuinely harder than short ones without anybody writing
     * down that they should be.
     */
    const spot = projectReceiver(game, r, flight);
    const rx = spot.x;
    const ry = spot.y;
    let sepAt = 99;
    for (const d of game.players) {
      if (d.side === r.side) continue;
      sepAt = Math.min(sepAt, dist2(rx, ry, d.x + d.vx * flight, d.y + d.vy * flight));
    }

    // The misjudgement. Two yards of error at 40 decision, a third of one at 95.
    const fog = (1 - decision) * 2.4;
    const sep = Math.max(0, sepAt + rng.gauss(0, fog));
    const depth = (r.y - game.lineOfScrimmage) * dir;
    const beyond = Math.max(0, throwDist - reach);
    /* A SCREEN IS THE PLAY, not an option on it. Without this the quarterback
     * looks past the back he was supposed to throw to and finds a go route
     * eleven yards downfield, which is not a screen at all. */
    const designed = r.route?.kind === 'screen' ? 6 : 0;
    const score = sep * 3.1 + depth * 0.06 - beyond * 2.4 - flight * 1.5 + designed
      - (r.route?.kind === 'checkdown' ? 2.4 : 0);

    /* A DEEP BALL NEEDS A BIGGER WINDOW THAN A SHORT ONE, and the reason is
     * simply that it is in the air for longer: every defender on the field gets
     * another second to arrive. Charging the throw for its own flight time is
     * what stops an offence from living entirely on forty yard touchdowns, which
     * is what it did when every throw was judged against the same two yards. */
    out.push({ p: r, score, sep: (sep - beyond * 1.5) / (1 + flight * 0.55), depth });
  }
  // In progression order, not best-first: the caller walks it.
  return out;
}

/* =============================================================== calling plays */

/**
 * WHAT A PLAY CALLER REACHES FOR BEFORE HE LOOKS AT ANYTHING.
 *
 * Weighted the way the real sport is actually called, which is far shorter than
 * it looks on television: about a third runs, and of the passes more than half
 * are quick throws. A book that treats the deep shot as one option in six
 * produces a quarterback whose average pass travels seventeen yards in the air,
 * which is more than twice what any real one does.
 */
const FAMILY_BASE: Record<PlayFamily, number> = {
  run: 0.32, short: 0.3, medium: 0.16, deep: 0.055, screen: 0.075,
  playaction: 0.09, special: 0,
};

/** How much of this side's recent work has been one family. */
function tendency(game: FootballGame, side: Side, family: PlayFamily, window = 6): number {
  const mine = game.history.filter((h) => h.side === side).slice(-window);
  if (mine.length < 3) return 0;
  return mine.filter((h) => h.family === family).length / mine.length;
}

function rosterOf(game: FootballGame, side: Side): Player[] {
  return side === 'home' ? game.cfg.home.roster : game.cfg.away.roster;
}

/**
 * THE OFFENSIVE COORDINATOR.
 *
 * A weighted choice rather than a decision tree, because a coordinator who calls
 * the same play in the same situation every time is scouted after one quarter.
 * The weights come from four honest places: THE SITUATION (down, distance, field
 * position), THE CLOCK, WHO HE HAS (a great back gets carries, a great arm gets
 * throws), and WHAT HE HAS BEEN DOING — because the single most valuable thing
 * a play caller does is not be predictable.
 */
export function aiPlayCall(game: FootballGame): OffensivePlay {
  const side = game.possession;
  const d = game.cfg.difficulty;
  const rng = game.rngForAi;
  const toGo = game.toGo;
  const down = game.down;
  const togoal = yardsToGoal(game.lineOfScrimmage, side);
  const own = 100 - togoal;
  const margin = game.score[side] - game.score[otherSide(side)];
  const half = game.quarter >= 4 || game.quarter === 2;
  const clock = game.clock;
  const hurry = half && clock < 120 && margin <= 0;
  const stall = game.quarter >= 4 && clock < 240 && margin > 0;

  const roster = rosterOf(game, side);
  const qb = starterAt(roster, 'QB');
  const rb = starterAt(roster, 'RB');
  const wr = starterAt(roster, 'WR');
  const ol = starterAt(roster, 'OL');
  const armed = qb ? (qb.attrs.throwAccuracy + qb.attrs.decision) / 2 : 60;
  const legs = rb ? (rb.attrs.speed + rb.attrs.power) / 2 : 60;
  const hands = wr ? (wr.attrs.catching + wr.attrs.routeRunning) / 2 : 60;
  const wall = ol ? ol.attrs.blocking : 60;

  const weights = OFFENSIVE_PLAYS.map((play) => {
    const f = play.family;
    let w = FAMILY_BASE[f];

    /* THE SITUATION. This is most of play calling and it is not subtle: you run
     * on first down, you throw on third and long, and everybody in the stadium
     * knows it — which is what makes the times you do not matter. */
    if (down === 1) {
      if (f === 'run') w *= 1.3;
      if (f === 'deep') w *= 1.15;
    } else if (down === 2) {
      if (toGo <= 3) w *= f === 'run' ? 1.7 : 0.85;
      else if (toGo >= 8) w *= f === 'run' ? 0.7 : 1.2;
    } else if (down === 3 || down === 4) {
      if (toGo <= 2) {
        w *= f === 'run' ? 2.4 : f === 'short' ? 1.1 : f === 'playaction' ? 1.2 : 0.25;
      } else if (toGo <= 6) {
        w *= f === 'short' ? 1.8 : f === 'medium' ? 1.5 : f === 'run' ? 0.45
          : f === 'screen' ? 1.2 : 0.7;
      } else {
        w *= f === 'medium' ? 1.55 : f === 'deep' ? 1.2 : f === 'screen' ? 1.3
          : f === 'run' ? 0.2 : f === 'short' ? 1.05 : 0.8;
      }
    }

    // Backed up against his own goal line: nothing that risks a safety.
    if (own < 6) w *= f === 'run' ? 2 : f === 'deep' ? 0.3 : f === 'screen' ? 0.3 : 0.8;
    // In the red zone there is no field left to throw deep into.
    if (togoal <= 18) w *= f === 'deep' ? 0.2 : f === 'run' ? 1.35 : f === 'short' ? 1.3 : 1;
    // Play action needs a run game to sell, and a line to protect the fake.
    if (f === 'playaction') w *= clamp(0.4 + tendency(game, side, 'run', 8) * 1.6, 0.4, 1.7);

    /* THE CLOCK. Trailing late you throw and get out of bounds; leading late you
     * run and make them spend timeouts. How well the AI does this is its clock
     * sense, which is a coaching quality and not a rating. */
    const sense = clamp(d.clockSense, 0, 1);
    if (hurry) w *= f === 'run' ? (1 - sense * 0.75) : (1 + sense * 0.45);
    if (stall) w *= f === 'run' ? (1 + sense * 1.3) : (1 - sense * 0.5);

    // Who he has.
    if (f === 'run') w *= clamp(0.55 + legs / 110, 0.55, 1.6);
    if (f === 'deep') w *= clamp(0.4 + (armed + hands) / 200, 0.4, 1.7) * (0.6 + d.aggression);
    if (f === 'medium' || f === 'short') w *= clamp(0.6 + armed / 130, 0.6, 1.5);
    if (play.develops > 2.4) w *= clamp(0.55 + wall / 110, 0.55, 1.5);
    // A screen is thrown at a rush, so it is worth more against a side that blitzes.
    if (f === 'screen') w *= 0.8 + game.defensivePlay.rushers * 0.14;

    /* AND DO NOT BE PREDICTABLE. Six inside zones in a row is how a human learns
     * to stop an AI offence permanently, so a family that has been leaned on
     * gets cheaper to abandon. */
    w *= clamp(1.25 - tendency(game, side, f) * 1.1, 0.35, 1.25);
    return Math.max(0.0001, w);
  });

  return pick(OFFENSIVE_PLAYS, weights, rng.next());
}

/**
 * THE DEFENSIVE COORDINATOR.
 *
 * He can see the down, the distance, the clock and WHAT THIS OFFENCE HAS BEEN
 * DOING. He cannot see the play that was just called — this function runs before
 * the call is assigned, deliberately, because a defence that knows the play is
 * not difficulty, it is cheating, and it is instantly obvious to play against.
 *
 * `playRead` is the whole difficulty curve here: at 0.3 he barely notices that
 * you have run six times in a row, at 0.95 the box is loaded before you get to
 * the line.
 */
export function aiDefenseCall(game: FootballGame): DefensivePlay {
  const off = game.possession;
  const d = game.cfg.difficulty;
  const rng = game.rngForAi;
  const toGo = game.toGo;
  const down = game.down;
  const togoal = yardsToGoal(game.lineOfScrimmage, off);
  const margin = game.score[off] - game.score[otherSide(off)];
  const read = clamp(d.playRead, 0, 1);

  /* WHOSE DEFENCE IS THIS? When it is the person's own — he plays offence and
   * coaches this — his game plan bends the call below. When it is the
   * computer's, it calls it straight. */
  const plan = game.offenseOnly && otherSide(off) === game.humanSide
    ? game.gamePlan : 'balanced';

  const ranRecently = tendency(game, off, 'run', 5);
  const deepRecently = tendency(game, off, 'deep', 5) + tendency(game, off, 'medium', 5);

  const weights = DEFENSIVE_PLAYS.map((play) => {
    let w = play.coverage === 'cover3' ? 0.28
      : play.coverage === 'man' ? 0.22
        : play.coverage === 'cover2' ? 0.22
          : play.coverage === 'blitz' ? 0.15 : 0.13;

    if (down === 1) {
      if (play.coverage === 'runstop') w *= 1.15;
    } else if (down >= 3) {
      if (toGo <= 2) {
        w *= play.coverage === 'runstop' ? 2.3 : play.coverage === 'blitz' ? 1.5
          : play.coverage === 'man' ? 1.1 : 0.45;
      } else if (toGo >= 8) {
        w *= play.coverage === 'cover2' ? 1.6 : play.coverage === 'cover3' ? 1.5
          : play.coverage === 'blitz' ? 1.2 : play.coverage === 'runstop' ? 0.12 : 1;
      }
    }
    // Goal line: they cannot throw it over the top of anybody from the four.
    if (togoal <= 6) {
      w *= play.coverage === 'runstop' ? 2 : play.coverage === 'man' ? 1.4
        : play.deep >= 2 ? 0.4 : 1;
    }

    /* READING THE TENDENCY. This is the skill difficulty actually buys, and it is
     * a fair one: the human can beat it by not being predictable, which is the
     * same thing his own coordinator has to do. */
    if (play.coverage === 'runstop') w *= 1 + (ranRecently - 0.4) * 2.2 * read;
    if (play.deep >= 2) w *= 1 + (deepRecently - 0.35) * 1.8 * read;
    if (play.coverage === 'blitz') w *= 0.55 + d.aggression;

    /* THE GAME PLAN, when this defence belongs to somebody who is coaching it
     * rather than playing it. One lever, three settings, and it does what it
     * says on the card: attack presses and blitzes and lives with what gets
     * behind it; bend keeps two men deep and makes them earn every yard. */
    if (plan !== 'balanced') {
      const attack = plan === 'aggressive';
      if (play.coverage === 'blitz') w *= attack ? 2.4 : 0.3;
      if (play.coverage === 'man') w *= attack ? 1.4 : 0.6;
      if (play.coverage === 'runstop') w *= attack ? 1.3 : 0.8;
      if (play.deep >= 2) w *= attack ? 0.55 : 1.8;
    }

    // Trailing late, a defence has to take the ball back rather than bend.
    if (game.quarter >= 4 && game.clock < 180 && margin > 0) {
      w *= play.coverage === 'blitz' ? 1 + d.clockSense * 0.9
        : play.deep >= 2 ? 1 - d.clockSense * 0.25 : 1;
    }
    return Math.max(0.0001, w);
  });

  return pick(DEFENSIVE_PLAYS, weights, rng.next());
}

/**
 * FOURTH DOWN.
 *
 * The decision a football coach is judged on, reduced to the three questions he
 * actually asks: can my kicker make it from here, is it short enough to go for,
 * and am I out of time. Clock sense decides how well he answers the third — a
 * Rookie coach punts from the opponent's thirty-eight with two minutes left and
 * a Legend does not.
 *
 * Returns null when the offence should run a play instead of kicking.
 */
export function aiSpecialTeams(game: FootballGame): 'fieldGoal' | 'punt' | null {
  if (game.down < FOOTBALL.downs) return null;
  if (game.tryKind !== 'none') return null;

  const side = game.possession;
  const distance = fieldGoalDistance(game.lineOfScrimmage, side);
  const togoal = yardsToGoal(game.lineOfScrimmage, side);
  const margin = game.score[side] - game.score[otherSide(side)];
  const sense = clamp(game.cfg.difficulty.clockSense, 0, 1);

  /* WHAT HIS OWN KICKER WOULD DO WITH IT, rather than a flat "is it in range".
   * A coach does not send a man out from fifty-four because it is theoretically
   * possible; he sends him out when he expects it to go in. Asking the engine
   * the same question the kick itself will be decided by keeps the two honest
   * with each other. */
  const k = game.kickerFor(side);
  const odds = game.fieldGoalChance(distance, k.leg, k.accuracy);

  const late = game.quarter >= FOOTBALL.quarters && game.clock < 300;
  const veryLate = game.quarter >= FOOTBALL.quarters && game.clock < 110;
  const behind = margin < 0;

  /* OUT OF TIME. Down by more than a field goal with under two minutes left, a
   * punt is the end of the game, so there is nothing left to weigh. */
  if (veryLate && behind && margin < -3 && sense > 0.3) return null;
  if (veryLate && behind && margin >= -3 && odds > 0.25) return 'fieldGoal';

  // Fourth and inches in their half is worth taking, and more so late.
  const gutsy = game.toGo <= (late && behind ? 4 : 1.5) && togoal < 48;
  if (gutsy && odds < 0.82 && sense > 0.25) return null;

  // Worth the three points: he expects to make it.
  if (odds >= (behind && late ? 0.42 : 0.58)) return 'fieldGoal';
  /* AND NOBODY PUNTS FROM THE TWENTY. Too close to punt, too far to kick, so
   * the only thing left is to play. */
  if (togoal <= 33) return null;
  return 'punt';
}

/** Weighted choice from a parallel array of weights. */
function pick<T>(items: T[], weights: number[], roll: number): T {
  let total = 0;
  for (const w of weights) total += w;
  let t = roll * total;
  for (let i = 0; i < items.length; i++) {
    t -= weights[i];
    if (t <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * HOW LONG THE COMPUTER STANDS OVER THE BALL.
 *
 * The other half of clock management, and the half a player actually feels. A
 * team protecting a lead lets the play clock run down to four; a team two
 * scores behind with a minute left snaps the moment everybody is set. How well
 * it judges which is which is `clockSense`, which is a coaching quality — the
 * players run exactly as fast either way.
 */
export function aiSnapDelay(game: FootballGame): number {
  // In CLOCK seconds, the same ones the play clock counts, not wall seconds.
  // With the clock stopped there is nothing to manage: get on with it.
  if (!game.clockRunning) return 2;

  const side = game.possession;
  const sense = clamp(game.cfg.difficulty.clockSense, 0, 1);
  const margin = game.score[side] - game.score[otherSide(side)];
  const closing = game.quarter === 2 || game.quarter >= FOOTBALL.quarters;

  // Behind, and running out of half: no huddle.
  if (closing && game.clock < 150 && margin < 0) return 1.2 + (1 - sense) * 2.4;
  // Ahead late: every second at the line is a second they do not get.
  if (game.quarter >= FOOTBALL.quarters && game.clock < 260 && margin > 0) {
    return 4 + sense * (FOOTBALL.playClock - 6);
  }
  return 3.5;
}
