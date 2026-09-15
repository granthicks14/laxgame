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

/**
 * Where a player who is better inside than out wants to be. Three of them,
 * because a post offence really does put three men inside and a spot that does
 * not exist is a player standing on somebody else's toes.
 */
function insideSpots(side: Side): { x: number; y: number }[] {
  const rim = attackRim(side);
  const dir = attackDir(side);
  return [
    // The block.
    { x: rim.x - dir * 3.5, y: COURT.centerY - 8 },
    // The elbow.
    { x: rim.x - dir * 14, y: COURT.centerY + 7.5 },
    // The short corner, on the other side of the lane from the block.
    { x: rim.x - dir * 2, y: COURT.centerY + 11 },
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

/**
 * HOW LIKELY SOMEBODY IS TO GET A HAND ON THIS PASS, 0..1.
 *
 * `laneClear` answers yes or no, which is the wrong shape for a decision: a
 * defender a foot outside the corridor is nearly as dangerous as one inside it,
 * and treating him as free is how a CPU offence threads passes no real defence
 * would allow. This is the graded version, and the offence weighs it.
 */
function laneRisk(
  game: HoopsGame, from: { x: number; y: number }, to: { x: number; y: number },
  side: Side,
): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.max(0.001, Math.hypot(dx, dy));
  let worst = 0;
  for (const o of game.teams[otherSide(side)]) {
    if (o.fouledOut) continue;
    const t = ((o.x - from.x) * dx + (o.y - from.y) * dy) / (len * len);
    if (t <= 0.04 || t >= 0.99) continue;
    const px = from.x + dx * t;
    const py = from.y + dy * t;
    const off = floorDist(o.x, o.y, px, py);
    // Six feet of the line is the width of a man's reach plus a step.
    const near = clamp(1 - off / 6, 0, 1);
    // And a defender with quick hands in a lane is worse than a slow one.
    worst = Math.max(worst, near * (0.55 + o.data.attrs.steal / 160));
  }
  return clamp(worst, 0, 1);
}

/**
 * How many points this player's shot is worth right now, all in.
 *
 * The scheme's opinion of the three lives HERE rather than in `wantsShot`,
 * because this number is what every other decision on the floor is compared
 * against — including the drive. Putting it only in the shooting bar produced a
 * five-out offence that emptied the paint, watched its own handler drive into
 * the vacant lane on every possession, and finished a game with seven per cent
 * of its shots from three and two assists.
 */
export function shotValueNow(game: HoopsGame, p: CourtPlayer): number {
  const three = isThree(p.x, p.y, p.side);
  const points = three ? 3 : 2;
  const value = game.shotQualityFor(p) * points;
  return three ? value - game.schemeFor(p.side).threeBias : value;
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
  const scheme = game.schemeFor(p.side);
  // TEMPO. A team that plays fast is a team that is happy with a shot a slower
  // team would pass up, so the bar it holds a shot to is lower.
  const possession = (0.93 + patience * 0.13) / scheme.tempo;
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
    // What the coach has told them about the three is already in the VALUE, via
    // `shotValueNow`, so that the drive sees it too. Only the shooter's own
    // licence is left to apply here.
    if (shooter < 70) bar *= 1 + (70 - shooter) / 85;
  }

  /* AND HOW WELL THIS TEAM IS COACHED, which is what the tier changes.
   *
   * A poorly run offence pulls the trigger on a shot a good one passes up, and it
   * does so IRREGULARLY — the mistake is that it does not hold its own standard,
   * not that its standard is lower. `mistake` is the size of that wobble, so a
   * Rookie defence gives up bad shots it did not have to and a Legend team works
   * the ball until the look is one it wants.
   *
   * Without this the four tiers worked the ball into shots of 52.6%, 52.3%,
   * 53.2% and 51.8% — which is to say, no tier at all. */
  const sloppy = clamp(game.cfg.difficulty.mistake, 0.2, 2.5);
  if (sloppy > 1 && game.rng.next() < (sloppy - 1) * 0.22) {
    // A possession thrown away on a shot nobody asked for.
    bar *= 0.58;
  }
  /* The standard a well-coached team holds itself to is only slightly higher —
   * MOST of the difference between tiers is that a bad team does not hold its own
   * standard, not that its standard is lower. Push this far and the top tier
   * becomes so patient it shoots at the buzzer every possession and its field
   * goal percentage falls below the tier beneath it, which is the opposite of
   * playing better. */
  bar *= 0.98 + game.cfg.difficulty.decision * 0.05;

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
  const gapToRim = floorDist(p.x, p.y, rim.x, rim.y);
  /* WHO WOULD MEET HIM THERE — when he gets there, not now.
   *
   * Measuring only who is standing in the lane at the moment of the decision
   * values a drive as though the defence were a photograph. It is not: a man
   * fifteen feet away covers most of that in the second and a half the drive
   * takes. Judged on the photograph, a five-out offence that had just emptied its
   * own paint valued every drive as an uncontested layup, drove on every
   * possession from twenty-five feet, and took two three-point shots in a game. */
  const travel = gapToRim / 15 + 0.5;
  let nearest = Infinity;
  let helper = 0;
  for (const o of game.teams[otherSide(p.side)]) {
    if (o.fouledOut) continue;
    const d = floorDist(o.x, o.y, spot.x, spot.y);
    // How much of that gap he closes while the drive is happening.
    const meeting = Math.max(0, d - travel * 13);
    if (meeting < nearest) {
      nearest = meeting;
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
  const gap = gapToRim;
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
  // A pick-and-roll team drives more than a post team, at the same ratings.
  return (beat * arrive + (1 - beat) * reset) * game.schemeFor(p.side).driveBias;
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
    /* THE ENTRY PASS, and where the paint exploit lived.
     *
     * Any big man within nine feet of the basket whose defender was four and a
     * half feet away used to get a RELAXED passing lane — so the moment you
     * pressured the ball and your own man's defender stepped up, the CPU threw
     * it straight through the lane for a layup, every possession down.
     *
     * The relaxation is for exactly one real thing: A LOB OVER A MAN WHO IS
     * FRONTING. A defender playing BEHIND the post is not in the corridor at all
     * and needs no special case — the ordinary lane check already lets that pass
     * through, which is what makes a genuine seal worth working for. A defender
     * in FRONT is in the way, and throwing it over him is a real pass that a
     * real team makes, so it is allowed — for a big man with the size to go up
     * and get it, and priced by the risk term below rather than given away. */
    const rimGap = distanceToRim(m.x, m.y, m.side);
    const guard = game.contestOn(m).defender;
    const fronting = !!guard && floorDist(guard.x, guard.y, p.x, p.y) < gap - 0.5;
    const canLob = rimGap < 9 && mateGap > 3.5 && !!guard
      && m.data.heightIn >= guard.data.heightIn - 1;
    const clearance = fronting && canLob ? 2.2 : HOOPS.laneClearance;
    if (!laneClear(game, p, m, p.side, clearance)) continue;

    /* HOW MANY OTHER PEOPLE ARE STANDING THERE.
     *
     * A clear passing line is not an open man. The HELP is what kills a pass into
     * the lane: three defenders sunk into the paint will all be on him the moment
     * the ball arrives, however clean the corridor looked on the way in. This was
     * the whole of the reported exploit — pressure the ball, watch the CPU fire it
     * into a packed paint, concede a layup, repeat.
     *
     * His own man is deliberately NOT counted: that defender is already priced
     * into the receiver's shot value through the contest. What is being measured
     * here is everybody ELSE, graded by how close they are, so a lane with one
     * help defender drifting at the edge is not treated like a lane with three
     * men standing in it. */
    const guardUid = guard ? guard.uid : null;
    let traffic = 0;
    for (const o of game.teams[otherSide(p.side)]) {
      if (o.fouledOut || o.uid === guardUid) continue;
      traffic += clamp(1 - floorDist(o.x, o.y, m.x, m.y) / 8, 0, 1);
    }

    /* AND WHO ELSE CAN GET A HAND TO IT. A binary clear-or-blocked lane means a
     * defender a hair outside the corridor costs nothing, so the CPU threads
     * passes that a real defence picks off. Risk scales with how near the closest
     * man is to the line, and with how far the ball has to travel to get there. */
    const risk = laneRisk(game, p, m, p.side) * clamp(gap / 24, 0.35, 1.6);

    const score = shotValueNow(game, m)
      + clamp(mateGap - 4, 0, 6) * 0.045
      - gap * 0.004
      - traffic * 0.3
      - risk * 0.55
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
  // BALL MOVEMENT. How often he re-reads the floor for a pass IS the difference
  // between a motion offence and an isolation one: the same five players, the
  // same ratings, and one of them touches the ball four times a possession and
  // the other holds it.
  if (game.rng.next() < perSecond(3 * game.schemeFor(p.side).ballMovement, dt)) {
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
      && game.rng.next() < perSecond(0.8 * game.schemeFor(p.side).screens, dt)) {
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
  // HOW MANY MEN STAND OUTSIDE. This is the shape of the offence on the floor and
  // the one thing a spectator can see a scheme doing: five-out empties the paint,
  // a post offence puts three men in it. The ball-handler is one of the five, so
  // the number who work inside is what is left after the arc takes its share.
  const arcPlayers = clamp(Math.round(game.schemeFor(p.side).arcPlayers), 1, 5);
  const insideCount = clamp(5 - arcPlayers, 0, offBall.length);
  const insideIdx = insideRank.slice(0, insideCount).indexOf(p);
  let target: { x: number; y: number };
  if (insideIdx >= 0) {
    const inside = insideSpots(p.side);
    target = inside[Math.min(insideIdx, inside.length - 1)];
  } else {
    /* WHO STANDS WHERE, decided for the whole side at once and in a FIXED ORDER.
     *
     * Each player claiming his own nearest free spot independently looks like the
     * same thing and is not: two men a foot apart both want the same spot, both
     * see the other as not having claimed it yet, both go, both re-decide next
     * frame, and the offence spends the possession swapping places eight feet
     * behind the line instead of standing on it. With two men spacing the floor
     * that was survivable. With four — which is what a five-out offence is — it
     * meant an entire team drifting to thirty-four feet and taking two threes in
     * a game.
     *
     * So the ranking that decided who plays inside also decides who picks first,
     * and it is the same ranking every frame. */
    // Reversed: the men who play INSIDE picked first for the inside spots, so the
    // best shooters pick first for the outside ones. A centre who has been pushed
    // out to the arc takes what is left, which is how it works in a gym.
    const outside = insideRank.slice(insideCount).reverse();
    const taken = new Set<number>();
    let pick = spots[0];
    for (const m of outside) {
      let bi = -1;
      let bd = Infinity;
      spots.forEach((s, i) => {
        if (taken.has(i)) return;
        const d = floorDist(m.x, m.y, s.x, s.y);
        if (d < bd) { bd = d; bi = i; }
      });
      if (bi < 0) bi = 0;
      taken.add(bi);
      if (m === p) { pick = spots[bi]; break; }
    }
    target = pick;
  }

  // Drift off the spot a little so five players are not standing on marks.
  steer(game, p, target.x, target.y, false, dt);
}

/* ----------------------------------------------------------------- defence */

export function defendAi(game: HoopsGame, p: CourtPlayer, dt: number): void {
  const diff = game.cfg.difficulty;
  const scheme = game.schemeFor(p.side);
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

  /* WHERE THE DEFENCE MEETS THE BALL.
   *
   * A press picks it up as it comes in; a half-court defence lets it cross and
   * then jumps it; a sagging defence waits at the arc. Measured from the
   * defence's OWN basket, so it means the same thing at both ends of the floor.
   */
  const ballDepth = handler
    ? floorDist(handler.x, handler.y, ownRim.x, ownRim.y)
    : 0;
  const engaged = !handler || ballDepth <= scheme.pickUp;

  if (onBall && handler && !engaged) {
    // Not yet. Hold a position between him and the basket, at the pick-up line,
    // rather than running out to meet him seventy feet from the rim.
    const toBall = { x: handler.x - ownRim.x, y: handler.y - ownRim.y };
    const bl = Math.max(0.1, Math.hypot(toBall.x, toBall.y));
    const hold = Math.min(scheme.pickUp, bl);
    steer(game, p, ownRim.x + (toBall.x / bl) * hold, ownRim.y + (toBall.y / bl) * hold,
      false, dt);
    return;
  }

  if (onBall && handler) {
    // ON THE BALL. How close to play him is a real basketball decision: tight on
    // a shooter, off a driver, and always between him and the basket.
    const shooterThreat = handler.data.attrs.three / 99;
    const driveThreat = (handler.data.attrs.speed + handler.data.attrs.handle) / 198;
    const gap = clamp(
      (2.0 + driveThreat * 2.4 - shooterThreat * 1.6) / scheme.manTight, 1.2, 5.2,
    );
    const toRim = { x: ownRim.x - handler.x, y: ownRim.y - handler.y };
    const len = Math.max(0.1, Math.hypot(toRim.x, toRim.y));
    const tx = handler.x + (toRim.x / len) * gap;
    const ty = handler.y + (toRim.y / len) * gap;
    steer(game, p, tx, ty, floorDist(p.x, p.y, tx, ty) > 4, dt);

    // Contest: go up when he goes up, and only then.
    if (handler.gathering && floorDist(p.x, p.y, handler.x, handler.y) < HOOPS.blockRange
        && p.z < 0.05 && p.react <= 0
        && game.rng.next() < perSecond(5.5 * diff.closeout, dt)) {
      game.aiJump(p);
    }
    // Reach in — rarely, and more often when the ball is low and loose-looking.
    if (p.stealCool <= 0 && floorDist(p.x, p.y, handler.x, handler.y) < HOOPS.stealRange) {
      // About one reach every four seconds from an average defender, and a
      // thief reaches more often. Any more and the whistle never stops.
      const appetite = (0.2 + (p.data.attrs.steal - 55) / 150 + diff.decision * 0.12)
        * scheme.gamble;
      if (game.rng.next() < perSecond(Math.max(0.05, appetite), dt)) game.aiSteal(p);
    }
    return;
  }

  /* CONTEST THE SHOT, wherever it comes from.
   *
   * This was missing entirely, and it was the largest hole in the defence. Only
   * the man ON the ball ever went up, so the moment an offence swung the ball the
   * catch-and-shoot man was firing at a defender standing flat-footed beside him.
   * With the contest model now asking whether a hand actually reached the release
   * — and it does — a defence that never raises one is a defence that does not
   * exist, and the AI correctly started shooting forty-two per cent of its shots
   * from three because every one of them was open.
   *
   * So: any defender near a man who is gathering goes up with him. He has to see
   * it first, he has to be close enough to matter, and he is late if he was
   * caught helping — all of which is what makes a shot fake work. */
  const shooter = game.gatheringNear(p, 7);
  if (shooter && p.react <= 0 && p.z < 0.05) {
    const gap = floorDist(p.x, p.y, shooter.x, shooter.y);
    // Close enough to bother him: get a hand up rather than keep sliding.
    if (gap < HOOPS.blockRange + 1.2) {
      const eager = 4.2 * diff.closeout * (0.7 + p.data.attrs.perimeterD / 160);
      if (game.rng.next() < perSecond(eager, dt)) {
        game.aiJump(p);
        return;
      }
    }
    // Not close enough to jump, but close enough to run at: fly at the shooter.
    if (gap < 12) {
      steer(game, p, shooter.x, shooter.y, true, dt);
      return;
    }
  }

  // OFF THE BALL. Between your man and the rim, sagging toward the ball — and
  // the moment the ball beats its man, leave and meet it.
  const ballX = handler ? handler.x : game.ball.x;
  const ballY = handler ? handler.y : game.ball.y;
  /* WHEN HELP GOES.
   *
   * Two triggers, and the second one had to be added. The first is a handler who
   * is simply unguarded near the basket. The second is a man ATTACKING THE RIM AT
   * SPEED, even with his own defender chasing him — because a defender who is
   * behind the play is not guarding anybody, and without this nobody in the
   * building steps over. A five-out offence found that out immediately: it emptied
   * the paint, drove into it on every single possession, and shot nine per cent of
   * its attempts from three while scoring forty points in an unguarded lane. */
  const rimRun = !!handler
    && floorDist(handler.x, handler.y, ownRim.x, ownRim.y) < 13
    && Math.hypot(handler.vx, handler.vy) > 9;
  const helpNeeded = handler
    && floorDist(handler.x, handler.y, ownRim.x, ownRim.y) < 17
    && (game.contestOn(handler).distance > 3.4 || rimRun);

  if (helpNeeded && man) {
    const myDistToBall = floorDist(p.x, p.y, ballX, ballY);
    const closest = game.teams[p.side]
      .filter((d) => d !== p && d.assignment !== handler?.uid)
      .every((d) => floorDist(d.x, d.y, ballX, ballY) >= myDistToBall);
    // Help is a standing decision, not a dice roll: the nearest man goes, and
    // how quickly he commits is what the difficulty changes.
    /* WHO GOES. The nearest man is the right answer, and a good defence finds it;
     * a poor one sends the wrong man, or two men, or nobody. `rotation` is what
     * the tier changes, and it is the difference between help that closes a
     * driving lane and help that opens a corner three. */
    const rightMan = closest || game.rng.next() > diff.rotation;
    if (rightMan && p.react <= 0 && game.rng.next() < perSecond(6 * diff.helpSpeed, dt)) {
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

  /* THE ZONE. A man defence follows a man; a zone holds an AREA and passes him
   * on. So a zoned defender's target is blended toward a fixed station in front
   * of his own basket, shaped by what the zone is for: a 2-3 sits down and
   * protects the rim, a 3-2 comes out and takes the arc away. What the offence
   * sees is exactly what it sees against a real zone — nobody chasing him to the
   * corner, and a paint with three men standing in it. */
  if (scheme.zone > 0.02) {
    const slot = game.teams[p.side].filter((d) => !d.fouledOut).indexOf(p);
    const across = ((slot % 3) - 1) * 9.5;
    const deep = slot < 2 ? 19 : 7.5;
    const depth = deep - scheme.zoneShape * 6.5;
    const zx = ownRim.x + attackDir(otherSide(p.side)) * -depth;
    const zy = COURT.centerY + across;
    // The zone still leans at the ball: a zone that ignores where the ball is
    // is not a zone, it is five men standing still.
    const lean = 0.3;
    const zoneX = zx + (ballX - zx) * lean;
    const zoneY = zy + (ballY - zy) * lean;
    const manX = man.x + (toRim.x / rl) * clamp(3.6 + sag * 6.4, 1.9, 9.5);
    const manY = man.y + (toRim.y / rl) * clamp(3.6 + sag * 6.4, 1.9, 9.5);
    const z = scheme.zone;
    const bx = manX + (zoneX - manX) * z;
    const by = manY + (zoneY - manY) * z;
    steer(game, p, bx, by, floorDist(p.x, p.y, bx, by) > 6, dt);
    return;
  }
  // A shooter is guarded a great deal closer than a man who cannot shoot. Taking
  // the three away is the single biggest decision a modern defence makes, and
  // without it the offence simply shoots over the top all night.
  const threat = man.data.attrs.three / 99;
  // A gambling defence plays the PASSING LANE rather than the man: closer to him,
  // and further round toward the ball. That is where a press gets its turnovers
  // from — the reach-in on the ball is the smaller half of it — and it is also
  // why a press that does not work gives up a layup a minute.
  /* HOW FAR YOU SAG OFF A MAN IS ABOUT WHETHER HE CAN SHOOT, and it has to
   * SCALE the sag rather than subtract from it. Subtracting a constant meant a
   * marksman standing on the far wing was still left six and a half feet of room
   * — which against a shot model that now asks whether a hand reached the release
   * is simply an open three, every time down. A modern defence stays attached to
   * a shooter and sags a long way off a man who cannot shoot, and that choice is
   * the single biggest one it makes. */
  const stand = clamp(
    ((3.6 + sag * 6.4) * (1 - threat * 0.62)) / scheme.gamble, 1.4, 9.5,
  );
  let tx = man.x + (toRim.x / rl) * stand;
  let ty = man.y + (toRim.y / rl) * stand;
  // Pull a step toward the ball, which is what help position means.
  const lean = sag * 0.24 * diff.helpSpeed * scheme.gamble;
  tx += (ballX - tx) * lean;
  ty += (ballY - ty) * lean;

  // Closeout: if his man has the ball coming and is open, get there — but not
  // before the pass has actually been thrown and seen. A defender who breaks the
  // instant the ball leaves the passer's hands closes out faster than the pass
  // travels, and then nobody on the floor is ever open.
  const closing = game.ball.state === 'pass' && game.ball.target === man.uid
    && game.ball.age > 0.2 && p.react <= 0;
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
  // The scheme decides how many of them go: a post offence sends everybody, a
  // five-out offence sends nobody and gets back instead.
  /* WHO GOES TO THE GLASS. The scheme decides how many — a post offence sends
   * everybody, a five-out offence sends nobody and gets back instead — and the
   * TIER decides how hard they work at it, which is what `glass` is for: a
   * poorly drilled team gives up second chances it did not have to. */
  const crash = offense ? game.schemeFor(p.side).crash : 1;
  const effort = clamp(game.cfg.difficulty.glass, 0.5, 1.6);
  const bar = 40 / Math.max(0.2, crash * (offense ? effort : 1));
  const crasher = p.data.attrs.rebounding > bar
    || ((p.pos === 'C' || p.pos === 'PF') && crash > 0.75)
    || (p.pos === 'SF' && crash > 0.95);
  if (offense && !crasher) {
    const dir = attackDir(p.side);
    steer(game, p, rim.x - dir * 30, p.y, true, dt);
    return;
  }

  /* WHERE A REBOUNDER GOES.
   *
   * The defence goes to where the ball is coming down, because it starts between
   * its man and the basket and can simply stand there. The OFFENCE cannot: it
   * starts twenty feet out, and a man who runs at the landing spot arrives after
   * the man who was already near it. So an offensive crasher attacks the RIM side
   * of the spot — which is what crashing the glass actually means, and it is the
   * only way a team gets any of its own misses back. */
  const aim = offense
    ? { x: spot.x + (rim.x - spot.x) * 0.3, y: spot.y + (rim.y - spot.y) * 0.3 }
    : spot;
  steer(game, p, aim.x, aim.y, dist > 3, dt);

  /* Go up for it when it is in reach and coming down. A better-drilled team times
   * this better, which is the other half of what `glass` buys. */
  const gap = floorDist(p.x, p.y, b.x, b.y);
  const window = 2.2 * clamp(game.cfg.difficulty.glass, 0.6, 1.5);
  if (gap < 3.6 && b.z > 3 && b.z < game.reach(p) + window && b.vz < 2 && p.z < 0.05) {
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
