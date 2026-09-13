import { clamp } from '../../core/math';
import {
  COURT, attackDir, attackRim, floorDist, inPaint, isThree, otherSide, type Side,
} from './court';
import { RELEASE_CENTRE, distanceToRim, makeChance, releaseWindow } from './shot';
import { HOOPS } from './tuning';
import type { CourtPlayer } from './types';
import type { HoopsGame } from './Game';

/* ---------------------------------------------------------------------------
 * BASKETBALL INTELLIGENCE
 * ---------------------------------------------------------------------------
 * Not "run at the ball". This AI understands the five things a basketball team
 * has to understand, and every one of them is specific to this sport:
 *
 *  SPACING. Five players on a court this small will stand on each other unless
 *  they are deliberately spread. The offence holds five spots around the arc and
 *  the post, and a player who drifts off his spot takes the floor away from the
 *  man with the ball.
 *
 *  SHOT SELECTION. A shot is taken when its expected points beat what another
 *  five seconds of work is worth. That is a comparison, not a threshold: an open
 *  three at 1.14 points is better than a contested layup at 0.9, and the AI
 *  knows it, which is why it moves the ball rather than driving into a crowd.
 *
 *  HELP AND RECOVERY. When the ball beats its man, somebody has to leave his own
 *  man to meet it, and somebody has to cover for him. Help that never arrives is
 *  a game with no defence; help that always arrives is a game where passing is
 *  free. Both are decided here, and how fast it happens is what the difficulty
 *  setting changes — never a rating.
 *
 *  THE BREAK. A defensive rebound or a steal starts a race, and a team that does
 *  not run it is leaving points on the floor.
 *
 *  THE CLOCK. Twenty-four seconds to shoot and a game clock to protect or chase.
 *  A team down four with thirty seconds left does not run the same offence as a
 *  team up four.
 * ------------------------------------------------------------------------- */

/**
 * A chance expressed PER SECOND, applied over one step.
 *
 * Every decision gate in here used to be a raw per-frame roll, which meant a
 * "sixteen per cent chance to look for a pass" fired five times a second and a
 * "one per cent chance to reach in" fired every other second for every defender
 * on the floor. Games ended with a hundred turnovers and a hundred fouls. A
 * decision is a thing a player makes at a rate, not a thing the renderer's frame
 * rate decides for him.
 */
const perSecond = (rate: number, dt: number): number => rate * dt;

/**
 * Where an offence wants bodies.
 *
 * Distances matter to the foot. The arc is 23.75ft at the top and 22ft in the
 * corners, so a spot at 27ft is a bad shot nobody should be standing on — and
 * five spots all beyond the line is not an offence, it is a three-point contest:
 * with those, ninety-five per cent of every shot taken in this game came from
 * outside. These are the real ones: two around the arc, a corner, an elbow and
 * the block, so the floor has a shape and somebody is always inside.
 */
function arcSpots(side: Side): { x: number; y: number }[] {
  const rim = attackRim(side);
  const dir = attackDir(side);
  return [
    // Top of the key, a step behind the line.
    { x: rim.x - dir * 25, y: COURT.centerY },
    // Wings, and the corner, which is the shortest three on the floor.
    { x: rim.x - dir * 19, y: COURT.centerY - 15.5 },
    { x: rim.x - dir * 19, y: COURT.centerY + 15.5 },
    { x: rim.x - dir * 4, y: COURT.centerY - 22 },
    { x: rim.x - dir * 4, y: COURT.centerY + 22 },
  ];
}

/** The two places a player who is better inside than out wants to be. */
function insideSpots(side: Side): { x: number; y: number }[] {
  const rim = attackRim(side);
  const dir = attackDir(side);
  return [
    // The block.
    { x: rim.x - dir * 3.5, y: COURT.centerY - 8 },
    // The elbow.
    { x: rim.x - dir * 14, y: COURT.centerY + 7.5 },
  ];
}

/** Kept for the on-ball AI, which works from the top of the floor. */
function offensiveSpots(side: Side): { x: number; y: number }[] {
  return arcSpots(side);
}

/**
 * Is the straight line from a to b clear of the other side?
 *
 * `ignore` exists for the drive test. The man guarding you is standing directly
 * between you and the basket — that is his job — so counting him as traffic
 * means no lane to the rim is ever clear and the AI never drives at all. Beating
 * him is the whole point of a drive; it is the HELP that decides whether the
 * drive is on.
 */
function laneClear(
  game: HoopsGame, from: { x: number; y: number }, to: { x: number; y: number },
  side: Side, width: number = HOOPS.laneClearance, ignore: CourtPlayer | null = null,
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.max(0.001, Math.hypot(dx, dy));
  for (const o of game.teams[otherSide(side)]) {
    if (o.fouledOut || o === ignore) continue;
    const t = ((o.x - from.x) * dx + (o.y - from.y) * dy) / (len * len);
    if (t <= 0.04 || t >= 0.99) continue;
    const px = from.x + dx * t;
    const py = from.y + dy * t;
    if (floorDist(o.x, o.y, px, py) < width) return false;
  }
  return true;
}

/** How many points this player's shot is worth right now, all in. */
export function shotValueNow(game: HoopsGame, p: CourtPlayer): number {
  const points = isThree(p.x, p.y, p.side) ? 3 : 2;
  return game.shotQualityFor(p) * points;
}

/**
 * Would the AI shoot from here?
 *
 * The bar starts high and falls with the shot clock, so a possession looks for a
 * good shot early and takes an honest one late — which is what a coached team
 * does. Patience comes from the difficulty: a Rookie defence will also take worse
 * shots on offence, because it is the same quality of decision-making either way.
 */
export function wantsShot(game: HoopsGame, p: CourtPlayer): boolean {
  const value = shotValueNow(game, p);
  const clock = game.shotClock;
  const patience = game.cfg.difficulty.patience;

  // Desperation: with the clock nearly gone, anything beats a violation.
  if (clock < 1.6) return true;
  if (clock < 3.4) return value > 0.35;

  // WHAT THE POSSESSION IS WORTH IF HE PASSES THIS UP. A good team averages a
  // little over a point a possession, so a shot taken with twenty seconds on the
  // clock has to beat that to be worth taking — and the bar falls as the clock
  // does.
  //
  // This number is load-bearing in both directions. Set too low it produces a
  // team that shoots the first open three every time and never drives. Set above
  // what an open three is actually worth — which is what it was when the shot
  // percentages were recalibrated and this was not — no shot on the floor ever
  // clears it, and the offence passes the ball round the arc until the whistle.
  // An open three here is worth about 1.08, and it should be taken.
  const possession = 0.93 + patience * 0.13;
  const urgency = clamp(1 - clock / 20, 0, 1);
  let bar = possession * (1 - urgency * 0.58);

  // WHO SHOULD BE SHOOTING THREES. On expected points alone, a thirty per cent
  // shooter's open three still beats most of what else is on the floor, and an
  // AI that only reads the arithmetic has all five players launching them: this
  // game took seven shots in ten from outside before this existed. Real teams
  // do not play that way, and not because their coaches cannot do the sum — a
  // team that lets its worst shooter fire at will gets the variance without the
  // skill. The bottom of the roster needs a better look than the top does.
  if (isThree(p.x, p.y, p.side)) {
    const shooter = p.data.attrs.three;
    if (shooter < 70) bar *= 1 + (70 - shooter) / 85;
  }

  return value > bar;
}

/**
 * What driving is worth: the shot he would get at the rim, discounted by the
 * chance of actually arriving there. Without this comparison the AI compares a
 * standing three against nothing and always shoots it.
 */
export function driveValue(game: HoopsGame, p: CourtPlayer): number {
  const rim = attackRim(p.side);
  const dir = attackDir(p.side);
  const spot = { x: rim.x - dir * 2.2, y: rim.y };
  // Who would meet him there.
  let nearest = Infinity;
  let helper = 0;
  for (const o of game.teams[otherSide(p.side)]) {
    if (o.fouledOut) continue;
    const d = floorDist(o.x, o.y, spot.x, spot.y);
    if (d < nearest) {
      nearest = d;
      helper = (o.data.attrs.interiorD + o.data.attrs.block) / 2;
    }
  }
  const finish = makeChance({
    kind: p.data.attrs.finishing + p.data.attrs.vertical >= HOOPS.dunkThreshold * 2
      ? 'dunk' : 'layup',
    distance: 2.2,
    release: 0.7,
    rating: p.data.attrs.finishing,
    finishing: p.data.attrs.finishing,
    contestDistance: nearest,
    contestRating: helper,
    contestInLine: true,
    moving: 8,
    fading: false,
  });
  // Getting there at all: a handler with speed against a set defence.
  const gap = floorDist(p.x, p.y, rim.x, rim.y);
  const { defender, distance } = game.contestOn(p);
  const beat = clamp(
    0.42 + (p.data.attrs.speed + p.data.attrs.handle) / 400
    - (defender ? defender.data.attrs.perimeterD / 320 : 0)
    + clamp(distance - 3, 0, 5) * 0.05
    - clamp(gap - 12, 0, 14) * 0.012,
    0.1, 0.92,
  );

  /* Two things the first version of this got wrong, and together they meant
   * driving could never be worth more than standing still and shooting a three —
   * so the league took eighty-nine per cent of its shots from outside.
   *
   *  1. A DRIVE THAT DOES NOT GET THERE IS NOT A TURNOVER. It is a reset: the
   *     ball comes back out and the possession continues. Multiplying the whole
   *     value by the chance of arriving threw that away.
   *  2. GETTING THERE DRAWS FOULS. Most free throws in basketball come from a
   *     body in the way at the rim, and two free throws are worth about one and a
   *     half points — which is more than any jump shot on the floor. */
  const foul = clamp(0.3 + (p.data.attrs.strength - helper) / 300, 0.08, 0.5);
  const arrive = finish * 2 + foul * 1.45;
  const reset = 0.95;
  return beat * arrive + (1 - beat) * reset;
}

/** The best man to pass to: open, in a better spot, and reachable. */
export function pickPassTarget(game: HoopsGame, p: CourtPlayer): CourtPlayer | null {
  // Never straight back to the man who just gave it to you: that is not ball
  // movement, it is a rally, and it will run a shot clock out on its own.
  const justFrom = game.lastPasserUid;
  const mates = game.teams[p.side]
    .filter((m) => m !== p && !m.fouledOut && m.uid !== justFrom);
  /* The man guarding the passer STAYS in the lane check, unlike the drive check.
   * A driver physically goes around him; a pass thrown past him is a pass he gets
   * a hand on, and excluding him here produced forty-three steals a game. */
  let best: CourtPlayer | null = null;
  let bestScore = 0;
  const myValue = shotValueNow(game, p);

  for (const m of mates) {
    const gap = floorDist(p.x, p.y, m.x, m.y);
    // A short pass to a cutter is a pass; only a handoff is too close to count.
    if (gap < 4 || gap > 46) continue;
    // A pass into the post is not a chest pass down a corridor — it is a lob or a
    // bounce, and a big man who has sealed his man gets it. Demanding the same
    // clear lane as a swing pass around the arc meant the two players standing
    // inside never touched the ball, and two thirds of every shot came from
    // outside because that was the only place the ball ever went.
    const { distance: mateGap } = game.contestOn(m);
    const sealed = distanceToRim(m.x, m.y, m.side) < 9 && mateGap > 4.5;
    if (!laneClear(game, p, m, p.side, sealed ? 1.9 : HOOPS.laneClearance)) continue;
    // What HE could do with it, plus credit for being genuinely open, minus the
    // risk of a long pass.
    const score = shotValueNow(game, m)
      + clamp(mateGap - 4, 0, 6) * 0.045
      - gap * 0.004
      + (m.data.attrs.iq - 55) * 0.0015;
    if (score > bestScore) { bestScore = score; best = m; }
  }

  /* HOW MUCH BETTER THE OTHER OPTION HAS TO BE.
   *
   * Early in the clock, barely at all. A swing pass around the perimeter is worth
   * making even when it does not immediately improve anything, because moving the
   * ball is how the advantage gets created in the first place — that is what a
   * real offence is doing when it makes three passes before it shoots. Late in the
   * clock the calculation inverts: giving up a shot you already have for a
   * marginally better one is how a possession ends in a violation.
   *
   * Held at a flat, high number, this produced an offence averaging under one pass
   * a possession, where real basketball averages three, and barely a third of its
   * baskets came off a pass. */
  const urgency = clamp(1 - game.shotClock / 18, 0, 1);
  const edge = (0.02 + (1 - game.cfg.difficulty.decision) * 0.05) + urgency * 0.3;

  /* THE VALUE OF MOVING THE BALL AT ALL.
   *
   * Comparing only the receiver's immediate shot against the passer's own misses
   * the point of a swing pass: nobody makes it because the man on the wing has a
   * better look right now, they make it because the defence has to move to cover
   * it and the look after that is better than either. Judged purely on whose shot
   * is better this instant, the two are usually within a few hundredths of each
   * other and the ball simply never moves — under one pass a possession, where
   * real basketball makes three.
   *
   * So early in the clock a pass carries a bonus for being a pass. Late, when
   * there is no time for the advantage to develop, it does not. */
  const swing = (1 - urgency) * 0.26;
  return best && bestScore + swing > myValue + edge ? best : null;
}

/**
 * Where an AI player lets go of a shot.
 *
 * It aims at the middle of its own release window and misses by a little, and
 * how much is what separates Rookie from Legend — without touching a rating. The
 * spread has to stay well inside the window: set wider than it, as it first was,
 * and a third of every AI shot released outside its own timing and the league
 * shot twenty-six per cent.
 */
function releaseFor(game: HoopsGame, p: CourtPlayer): number {
  const kind = game.shotKindFor(p);
  const rating = kind === 'three' ? p.data.attrs.three
    : kind === 'jumper' ? p.data.attrs.shooting
      : p.data.attrs.finishing;
  const half = releaseWindow(rating);
  const slop = (1 - game.cfg.difficulty.decision) * 0.55 + 0.18;
  return RELEASE_CENTRE + game.rng.gauss(0, half * slop);
}

/* --------------------------------------------------------------- on the ball */

export function driveAi(game: HoopsGame, p: CourtPlayer, dt: number): void {
  const rim = attackRim(p.side);
  const { defender, distance } = game.contestOn(p);

  // Already going up: let the gather finish.
  if (p.gathering) return;

  const toRimNow = floorDist(p.x, p.y, rim.x, rim.y);
  const shootNow = shotValueNow(game, p);
  const drive = toRimNow > HOOPS.rimRange ? driveValue(game, p) : 0;
  // A driver needs a gap, not a corridor, and he does not need to already be
  // open: creating that step is what the crossover is for. Requiring the defender
  // to be two feet off before a drive was even considered meant the AI shot over
  // the top on four possessions in five.
  // A driving gap is narrow — you go BETWEEN people, not down a corridor — and
  // the man on you does not count as traffic.
  const helpClear = laneClear(game, p, rim, p.side, 2.1, defender);

  // THE CLOCK COMES FIRST. A drive needs time to arrive — about a second for
  // every fifteen feet — and a player who keeps choosing the better play while
  // the clock runs out has chosen a turnover.
  const timeToRim = toRimNow / 15 + 0.9;
  const mustShoot = game.shotClock < Math.min(3.2, timeToRim);

  if (mustShoot) {
    if (p.z <= 0.05) game.startShot(p, releaseFor(game, p));
    return;
  }

  // THE SHOT HE HAD ALREADY DECIDED TO TAKE. Set when the ball arrived, while he
  // was still open.
  if (p.quickShot > 0 && p.z <= 0.05) {
    game.startShot(p, releaseFor(game, p));
    return;
  }

  // RUN SOMETHING FIRST. A coached team does not shoot two seconds into a
  // possession unless it is running out in transition; it moves the ball. Without
  // this the man who brought the ball up took a third of every team's shots
  // himself, and barely four makes in ten came off a pass.
  const justStarted = game.shotClock > HOOPS.shotClock - 2.6 && !game.inTransition;

  // 1. GO TO THE RIM, when that is the best thing on the floor. If his man is in
  // the way, beat him first — which is what a real handler does, and what makes
  // the crossover part of the offence rather than a button for its own sake.
  if (!justStarted && drive > shootNow + 0.08 && helpClear && toRimNow > HOOPS.rimRange
      && game.shotClock > timeToRim) {
    if (defender && distance < 3.4 && p.crossCool <= 0) {
      game.aiCrossover(p, rim);
      return;
    }
    const sideY = p.y < COURT.centerY ? -1 : 1;
    steer(game, p,
      rim.x - attackDir(p.side) * 1.4,
      rim.y + sideY * Math.min(3.2, toRimNow * 0.11),
      true, dt);
    return;
  }

  /* DRIVE AND KICK. A drive that pulls a second defender has already done its job:
   * somebody is now open, and finishing into two men instead of finding him is the
   * mistake a coach shouts about. It is also where a great many real assists come
   * from — without this read, a third of this game's baskets came off a pass where
   * a real one is closer to three in five, because every drive ended in a
   * contested layup by the man who started it. */
  if (toRimNow < 18 && toRimNow > HOOPS.rimRange * 0.8) {
    let helpers = 0;
    for (const o of game.teams[otherSide(p.side)]) {
      if (!o.fouledOut && floorDist(o.x, o.y, p.x, p.y) < 6.5) helpers++;
    }
    if (helpers >= 2) {
      const out = pickPassTarget(game, p);
      if (out) {
        game.pass(p, out);
        return;
      }
    }
  }

  // 2. SHOOT. The whole decision, in one call.
  if (!justStarted && wantsShot(game, p) && p.z <= 0.05) {
    game.startShot(p, releaseFor(game, p));
    return;
  }

  // 3. PASS. Checked before moving, because the pass is usually the better play
  // and an AI that always drives is an AI that never runs offence. Looked at
  // about three times a second, which is roughly how often a handler re-reads
  // the floor.
  if (game.rng.next() < perSecond(3, dt)) {
    const target = pickPassTarget(game, p);
    if (target) {
      game.pass(p, target);
      return;
    }
  }

  // 3b. MAKE SOMETHING HAPPEN. An offence with no way to create an advantage is
  // an offence that passes the ball round the arc until the clock runs out.
  if (defender && distance < 5.5 && p.crossCool <= 0 && game.shotClock > 4) {
    const beatable = (p.data.attrs.handle + p.data.attrs.speed) / 2
      - defender.data.attrs.perimeterD;
    const appetite = clamp(0.35 + beatable / 70, 0.08, 1.3) * (distance < 3.4 ? 1.5 : 1);
    if (game.rng.next() < perSecond(appetite, dt)) {
      game.aiCrossover(p, rim);
      return;
    }
  }

  // A screen: asked for when he cannot get anywhere himself and there is time to
  // use one.
  if (!game.hasScreen(p.side) && game.shotClock > 9 && distance < 6
      && game.rng.next() < perSecond(0.8, dt)) {
    game.aiCallScreen(p);
  }

  // 4. GET SOMEWHERE BETTER. Where that is depends on what the defence is doing.
  const toRim = floorDist(p.x, p.y, rim.x, rim.y);
  const driveOpen = laneClear(game, p, rim, p.side, 3.0)
    && (!defender || distance > 2.6);
  const shooter = p.data.attrs.three > 68;

  let tx: number;
  let ty: number;
  let sprint = false;

  if (driveOpen && toRim > HOOPS.rimRange) {
    // Take it. Angle slightly off-centre so he arrives at the rim rather than
    // running under it.
    const side = p.y < COURT.centerY ? -1 : 1;
    tx = rim.x - attackDir(p.side) * 1.5;
    ty = rim.y + side * Math.min(3, toRim * 0.12);
    sprint = true;
  } else if (defender && distance < 3.2) {
    // Pressed. Back off into space, toward his own best spot.
    const spots = offensiveSpots(p.side);
    const spot = shooter
      ? spots.reduce((b, s) =>
        (floorDist(p.x, p.y, s.x, s.y) < floorDist(p.x, p.y, b.x, b.y) ? s : b), spots[0])
      : spots[0];
    tx = spot.x;
    ty = spot.y;
  } else {
    // Work the top of the floor and look again.
    const spots = offensiveSpots(p.side);
    const spot = spots[0];
    tx = spot.x + game.rng.range(-3, 3);
    ty = spot.y + game.rng.range(-8, 8);
  }

  steer(game, p, tx, ty, sprint, dt);
}

/* -------------------------------------------------------------- off the ball */

export function offBallAi(game: HoopsGame, p: CourtPlayer, dt: number): void {
  const rim = attackRim(p.side);
  const handler = game.carrier;
  const { defender, distance } = game.contestOn(p);

  // A called screen is a commitment: go and stand in the right place.
  if (p.screenTimer > 0 && handler && handler !== p) {
    const hd = game.contestOn(handler).defender;
    if (hd) {
      // Between the handler's defender and where the handler wants to go.
      const tx = hd.x + (rim.x - hd.x) * -0.22 + (handler.x - hd.x) * 0.55;
      const ty = hd.y + (rim.y - hd.y) * -0.22 + (handler.y - hd.y) * 0.55;
      steer(game, p, tx, ty, false, dt);
      p.pose = 'screen';
      p.poseTimer = 0.2;
      return;
    }
  }

  // A shot is up: go and get it. Everybody's job on every miss.
  if (game.ball.state === 'shot') {
    reboundAi(game, p, dt, true);
    return;
  }

  // A pass is coming: meet it. A receiver who holds his spot while the ball flies
  // past him is how a good pass becomes a turnover.
  if (game.ball.state === 'pass' && game.ball.target === p.uid) {
    steer(game, p, game.ball.x, game.ball.y, false, dt);
    return;
  }

  // BACKDOOR. A defender who has turned his head or overplayed the passing lane
  // gets beaten to the rim, and this is the only way an off-ball player scores.
  const overplayed = defender
    && floorDist(defender.x, defender.y, rim.x, rim.y) > floorDist(p.x, p.y, rim.x, rim.y)
    && distance < 5.5;
  if (overplayed && handler && laneClear(game, p, rim, p.side, 2.4)
      && game.rng.next() < perSecond(0.5 + game.cfg.difficulty.decision * 0.7, dt)) {
    steer(game, p, rim.x - attackDir(p.side) * 1.5, rim.y, true, dt);
    return;
  }

  // Otherwise: hold the spacing. Which spot is his depends on what he is — who
  // plays inside is a skill set, not a position: a centre who can shoot stands on
  // the arc and a wing who cannot belongs on the block. Ranking the four off-ball
  // players against each other guarantees the floor always has somebody inside
  // and somebody spacing it, whatever five players happen to be out there.
  const spots = arcSpots(p.side);
  const offBall = game.teams[p.side].filter((m) => m !== handler && !m.fouledOut);
  const insideRank = [...offBall].sort((a, b) =>
    (b.data.attrs.finishing - b.data.attrs.three) - (a.data.attrs.finishing - a.data.attrs.three));
  const insideIdx = insideRank.slice(0, 2).indexOf(p);
  let target: { x: number; y: number };
  if (insideIdx >= 0) {
    target = insideSpots(p.side)[insideIdx];
  } else {
    // Claim the nearest spot nobody nearer is already using.
    const claimed = new Set<number>();
    for (const m of game.teams[p.side]) {
      if (m === p || m === handler) continue;
      let bi = 0;
      let bd = Infinity;
      spots.forEach((s, i) => {
        const d = floorDist(m.x, m.y, s.x, s.y);
        if (d < bd) { bd = d; bi = i; }
      });
      if (bd < 9) claimed.add(bi);
    }
    let pick = spots[0];
    let bd = Infinity;
    spots.forEach((s, i) => {
      if (claimed.has(i)) return;
      const d = floorDist(p.x, p.y, s.x, s.y);
      if (d < bd) { bd = d; pick = s; }
    });
    target = pick;
  }

  // Drift off the spot a little so five players are not standing on marks.
  steer(game, p, target.x, target.y, false, dt);
}

/* ----------------------------------------------------------------- defence */

export function defendAi(game: HoopsGame, p: CourtPlayer, dt: number): void {
  const diff = game.cfg.difficulty;
  const ownRim = attackRim(otherSide(p.side));
  const handler = game.carrier;
  const man = game.byUid(p.assignment);

  // A shot is in the air: rebounding is the whole job.
  if (game.ball.state === 'shot') {
    reboundAi(game, p, dt, false);
    return;
  }

  // A loose ball is everybody's.
  if (game.ball.state === 'loose') {
    steer(game, p, game.ball.x, game.ball.y, true, dt);
    return;
  }

  // THE BREAK, from the wrong end of it: get back, and get back to the rim
  // first, because a defender trailing the play is not defending.
  if (game.inTransition && handler && handler.side !== p.side) {
    const behind = attackDir(handler.side) > 0
      ? handler.x > p.x
      : handler.x < p.x;
    if (behind) {
      steer(game, p, ownRim.x - attackDir(handler.side) * 6, ownRim.y, true, dt);
      return;
    }
  }

  const onBall = handler && man && handler.uid === man.uid;

  if (onBall && handler) {
    // ON THE BALL. How close to play him is a real basketball decision: tight on
    // a shooter, off a driver, and always between him and the basket.
    const shooterThreat = handler.data.attrs.three / 99;
    const driveThreat = (handler.data.attrs.speed + handler.data.attrs.handle) / 198;
    const gap = clamp(2.0 + driveThreat * 2.4 - shooterThreat * 1.6, 1.4, 4.2);
    const toRim = { x: ownRim.x - handler.x, y: ownRim.y - handler.y };
    const len = Math.max(0.1, Math.hypot(toRim.x, toRim.y));
    const tx = handler.x + (toRim.x / len) * gap;
    const ty = handler.y + (toRim.y / len) * gap;
    steer(game, p, tx, ty, floorDist(p.x, p.y, tx, ty) > 4, dt);

    // Contest: go up when he goes up, and only then.
    if (handler.gathering && floorDist(p.x, p.y, handler.x, handler.y) < HOOPS.blockRange
        && p.z < 0.05 && game.rng.next() < perSecond(4.5 * diff.closeout, dt)) {
      game.aiJump(p);
    }
    // Reach in — rarely, and more often when the ball is low and loose-looking.
    if (p.stealCool <= 0 && floorDist(p.x, p.y, handler.x, handler.y) < HOOPS.stealRange) {
      // About one reach every four seconds from an average defender, and a
      // thief reaches more often. Any more and the whistle never stops.
      const appetite = 0.2 + (p.data.attrs.steal - 55) / 150 + diff.decision * 0.12;
      if (game.rng.next() < perSecond(Math.max(0.05, appetite), dt)) game.aiSteal(p);
    }
    return;
  }

  // OFF THE BALL. Between your man and the rim, sagging toward the ball — and
  // the moment the ball beats its man, leave and meet it.
  const ballX = handler ? handler.x : game.ball.x;
  const ballY = handler ? handler.y : game.ball.y;
  const helpNeeded = handler
    && floorDist(handler.x, handler.y, ownRim.x, ownRim.y) < 17
    && game.contestOn(handler).distance > 3.4;

  if (helpNeeded && man) {
    const myDistToBall = floorDist(p.x, p.y, ballX, ballY);
    const closest = game.teams[p.side]
      .filter((d) => d !== p && d.assignment !== handler?.uid)
      .every((d) => floorDist(d.x, d.y, ballX, ballY) >= myDistToBall);
    // Help is a standing decision, not a dice roll: the nearest man goes, and
    // how quickly he commits is what the difficulty changes.
    if (closest && game.rng.next() < perSecond(6 * diff.helpSpeed, dt)) {
      // Meet him at the rim, not where he is: help that arrives behind the ball
      // is not help.
      const tx = ballX + (ownRim.x - ballX) * 0.42;
      const ty = ballY + (ownRim.y - ballY) * 0.42;
      steer(game, p, tx, ty, true, dt);
      return;
    }
  }

  if (!man) {
    steer(game, p, ownRim.x, ownRim.y, false, dt);
    return;
  }

  /* Deny position: between him and the basket, pulled toward the ball by how far
   * from it he is. A corner shooter is guarded close; a man on the far side is
   * not.
   *
   * How far off to stand is not a cosmetic number. At two feet — where this
   * started — all five defenders are draped on all five attackers, no shot on the
   * floor is ever open, and an offence that correctly refuses to take a bad shot
   * passes the ball around the arc until the clock runs out. Real off-ball
   * defenders play a man one pass away at five or six feet and sag much further
   * than that when the ball is on the other side, and that sag is exactly what
   * creates the open shot the offence is looking for. */
  const toRim = { x: ownRim.x - man.x, y: ownRim.y - man.y };
  const rl = Math.max(0.1, Math.hypot(toRim.x, toRim.y));
  const sag = clamp(floorDist(man.x, man.y, ballX, ballY) / 26, 0, 1);
  // A shooter is guarded a great deal closer than a man who cannot shoot. Taking
  // the three away is the single biggest decision a modern defence makes, and
  // without it the offence simply shoots over the top all night.
  const threat = man.data.attrs.three / 99;
  const stand = clamp(3.6 + sag * 6.4 - threat * 3.8, 1.9, 9.5);
  let tx = man.x + (toRim.x / rl) * stand;
  let ty = man.y + (toRim.y / rl) * stand;
  // Pull a step toward the ball, which is what help position means.
  tx += (ballX - tx) * sag * 0.24 * diff.helpSpeed;
  ty += (ballY - ty) * sag * 0.24 * diff.helpSpeed;

  // Closeout: if his man has the ball coming and is open, get there — but not
  // before the pass has actually been thrown and seen. A defender who breaks the
  // instant the ball leaves the passer's hands closes out faster than the pass
  // travels, and then nobody on the floor is ever open.
  const closing = game.ball.state === 'pass' && game.ball.target === man.uid
    && game.ball.age > 0.2;
  steer(game, p, tx, ty, closing || floorDist(p.x, p.y, tx, ty) > 6, dt);
}

/**
 * Rebounding.
 *
 * Both sides go to the same place — where the ball is actually coming down —
 * which is why the physics of the miss matters so much: the aim point decided
 * when the shot went up is what puts this spot near the shooter on a short miss
 * and past the rim on a long one. Defenders get there first because they start
 * between their man and the basket, which is exactly why the defence gets most
 * rebounds in real basketball without anybody scripting it.
 */
function reboundAi(game: HoopsGame, p: CourtPlayer, dt: number, offense: boolean): void {
  const b = game.ball;
  const rim = attackRim(offense ? p.side : otherSide(p.side));

  // Predict where it is coming down to a height this player can take it at.
  const spot = predictLanding(game, p);
  const dist = floorDist(p.x, p.y, spot.x, spot.y);

  // Bigs go to the rim; guards hedge back, because somebody has to stop the
  // break. A five-man crash of the offensive glass loses more games than it wins,
  // and a no-man crash hands the defence every miss — real teams get about a
  // quarter of their own misses back.
  const crasher = p.data.attrs.rebounding > 52 || p.pos === 'C' || p.pos === 'PF'
    || p.pos === 'SF';
  if (offense && !crasher) {
    const dir = attackDir(p.side);
    steer(game, p, rim.x - dir * 30, p.y, true, dt);
    return;
  }

  steer(game, p, spot.x, spot.y, dist > 3, dt);

  // Go up for it when it is in reach and coming down.
  const gap = floorDist(p.x, p.y, b.x, b.y);
  if (gap < 3.4 && b.z > 3 && b.z < game.reach(p) + 2.2 && b.vz < 2 && p.z < 0.05) {
    game.aiJump(p);
  }
}

/** Where the ball will be when it comes back to grabbing height. */
function predictLanding(game: HoopsGame, p: CourtPlayer): { x: number; y: number } {
  const b = game.ball;
  // If it has not hit anything yet, the rim is the best guess — which is true,
  // and is why everybody converges there before a miss even happens.
  if (!b.touchedIron) {
    const rim = attackRim(b.shot?.side ?? p.side);
    const dir = attackDir(b.shot?.side ?? p.side);
    return { x: rim.x - dir * 3.2, y: rim.y };
  }
  // Ballistic projection down to eight feet, which is about where it gets taken.
  const g = 32.17;
  const target = 7.5;
  const vz = b.vz;
  const dz = b.z - target;
  // Solve for the later root of z(t) = z0 + vz t - g t²/2 = target.
  const disc = vz * vz + 2 * g * dz;
  const t = disc <= 0 ? 0.12 : (vz + Math.sqrt(disc)) / g;
  const tt = clamp(t, 0, 1.4);
  return { x: b.x + b.vx * tt, y: b.y + b.vy * tt };
}

/* ------------------------------------------------------------------ steering */

/** Point a player at a spot. All AI movement goes through here. */
function steer(
  game: HoopsGame, p: CourtPlayer, tx: number, ty: number, sprint: boolean, dt: number,
): void {
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.7) {
    game.drive(p, 0, 0, false, dt);
    // Face the ball when idle, which is what a player actually does.
    const bx = game.ball.x - p.x;
    const by = game.ball.y - p.y;
    if (Math.hypot(bx, by) > 0.5) p.facing = Math.atan2(by, bx);
    return;
  }
  // Ease off in the last couple of feet so nobody oscillates on a spot.
  const throttle = clamp(d / 2.4, 0.25, 1);
  game.drive(p, (dx / d) * throttle, (dy / d) * throttle, sprint && d > 4, dt);
}

/** Exposed for the harness: is this player in a legal, sensible defensive spot? */
export function defensivePosition(game: HoopsGame, p: CourtPlayer): {
  betweenManAndRim: boolean;
  inPaint: boolean;
} {
  const man = game.byUid(p.assignment);
  const ownRim = attackRim(otherSide(p.side));
  if (!man) return { betweenManAndRim: false, inPaint: inPaint(p.x, p.y, otherSide(p.side)) };
  const dMan = floorDist(p.x, p.y, man.x, man.y);
  const dRimMan = floorDist(man.x, man.y, ownRim.x, ownRim.y);
  const dRimMe = floorDist(p.x, p.y, ownRim.x, ownRim.y);
  return {
    betweenManAndRim: dRimMe < dRimMan + 1 && dMan < 14,
    inPaint: inPaint(p.x, p.y, otherSide(p.side)),
  };
}
