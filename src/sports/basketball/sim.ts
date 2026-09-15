import { Rng } from '../../core/rng';
import { clamp } from '../../core/math';
import { starters, type HoopsPlayer } from './data';
import { NEUTRAL_SCHEME, type ResolvedScheme } from './schemes';
import { emptyLine, emptyTeamBox, type BoxLine, type TeamBox } from './types';

/* ---------------------------------------------------------------------------
 * THE GAME NOBODY WATCHES
 * ---------------------------------------------------------------------------
 * A career is two hundred and forty programmes playing thirty games a year for
 * twenty years. The engine you play is a physics simulation at sixty frames a
 * second: it takes a third of a second to run one game, which is eight minutes
 * for one round of one league, and a career would take a week.
 *
 * So there are two engines, and this is the other one. It plays the same
 * basketball at the level of the POSSESSION rather than the frame: who shoots,
 * from where, against whom, and what happens next. It reads exactly the same
 * inputs — the same attributes, the same schemes, the same coaching — and it
 * produces exactly the same output, a full box score with a line for every
 * player, because everything downstream of a game (standings, statistics,
 * development, the coach's reputation) must not be able to tell which engine
 * played it.
 *
 * It is calibrated against the played engine rather than against a spreadsheet:
 * `npm run hoops-sim` runs both over the same fixtures and fails if the league
 * rates drift apart. When the played engine is retuned, this one is retuned to
 * match it, and not the other way round.
 * ------------------------------------------------------------------------- */

/** One side of a simulated game. */
export interface SimTeam {
  id: string;
  roster: HoopsPlayer[];
  scheme?: ResolvedScheme;
  /**
   * What the coach is worth, as a multiplier on decision quality. 1 is an
   * average staff. This is the only thing a coach adds; it never touches a
   * player's ratings.
   */
  coaching?: number;
}

export interface SimOptions {
  seed: number | string;
  /** Seconds per quarter, so a simulated game is the length its tier plays. */
  quarterSeconds: number;
  /** True when the first team is at home. */
  homeAdvantage?: boolean;
  /** Extra minutes if it finishes level. */
  overtimeSeconds?: number;
}

export interface SimPlayerLine {
  player: HoopsPlayer;
  line: BoxLine;
}

export interface SimSide {
  id: string;
  score: number;
  box: TeamBox;
  lines: SimPlayerLine[];
}

export interface SimResult {
  home: SimSide;
  away: SimSide;
  overtime: number;
  /** Quarter-by-quarter, home then away. */
  byQuarter: { home: number[]; away: number[] };
}

/* ------------------------------------------------------------- calibration */

/**
 * Every number here was read off the played engine over ninety games, not
 * invented. If the played engine changes, these move with it.
 */
const CAL = {
  /** Seconds of game clock one possession eats at neutral tempo. */
  possessionSeconds: 11.6,
  /** Share of possessions that end in a turnover before a shot goes up. */
  turnoverRate: 0.121,
  /**
   * Of those turnovers, how many are credited as a steal. Nearly all of them:
   * the played engine records 8.8 steals against 8.9 turnovers a team, because
   * almost everything it loses, it loses to somebody's hands.
   */
  stealShare: 0.95,
  /**
   * The league's shot diet at a neutral scheme: three, mid-range, rim. A
   * player's own skills move him around this, but a team of players who are
   * equally good at everything shoots exactly this.
   */
  mix: [0.50, 0.245, 0.40] as [number, number, number],
  /**
   * Make chances for a shooter and a defence both rated at `REFERENCE`. Read
   * off the played engine: 36.5% from three, and a two-point game that comes out
   * at 43% across a floor that is half rim and half jump shot.
   */
  makeThree: 0.315,
  makeMid: 0.242,
  makeRim: 0.452,
  /** The rating both sides are measured against. */
  reference: 62,
  /** Share of missed shots the offence rebounds. */
  offRebRate: 0.205,
  /**
   * Misses nobody rebounds: off a hand, out of bounds, off the back iron and
   * into the third row. The played engine loses about a third of them, which is
   * why its rebound totals are lower than its miss totals.
   */
  reboundLost: 0.368,
  /** Share of made field goals that came off a pass. */
  assistRate: 0.465,
  /* Shooting fouls, as a share of attempts at each range.
   *
   * Read off the played engine after its fouls were rebuilt around what the
   * defender actually did rather than how close he was standing. The two engines
   * must agree: a game you watched and a game you simulated cannot send different
   * numbers of players to the line. */
  foulRim: 0.148,
  foulMid: 0.037,
  foulThree: 0.022,
  /** Non-shooting fouls per possession. */
  looseFoulRate: 0.15,
  /** Share of missed shots that were blocked. */
  blockRate: 0.088,
  /** Baseline free-throw rate before the shooter's own rating. */
  freeThrow: 0.722,
  /** How much a rating point of difference is worth, per shot. */
  ratingScale: 0.0042,
  /**
   * What the home floor is worth, as a flat edge on the make chance. About two
   * and a half points of final score, which is what it is worth in life. The
   * played engine reads the identical number off `HoopsConfig.homeEdge`, so a
   * home game is the same game whether it was watched or simulated.
   */
  homeEdge: 0.0085,
};

/* --------------------------------------------------------------- the squad */

interface SimPlayer {
  p: HoopsPlayer;
  line: BoxLine;
  /** Share of his team's possessions he finishes. */
  usage: number;
  /** How he splits his own attempts: three, mid, rim. Sums to 1. */
  mix: [three: number, mid: number, rim: number];
  /** Minutes share, 0..1. */
  minutes: number;
  fouledOut: boolean;
}

/**
 * A player's own shot diet.
 *
 * Measured against HIS OWN other skills rather than against a league average, so
 * it works identically at every tier: a schoolboy who is a better shooter than
 * he is a finisher shoots the same proportion of threes as a professional who is
 * a better shooter than he is a finisher. A player equally good at all three
 * shoots exactly the league mix.
 */
function shotMix(p: HoopsPlayer, scheme: ResolvedScheme): [number, number, number] {
  const a = p.attrs;
  const big = p.pos === 'C' || p.pos === 'PF';
  const guard = p.pos === 'PG' || p.pos === 'SG';
  const own = (a.three + a.shooting + a.finishing) / 3;
  // Willingness, not ability: a player shoots what he believes he can make.
  let three = CAL.mix[0] * Math.exp((a.three - own) / 22) * (big ? 0.68 : guard ? 1.14 : 1);
  let mid = CAL.mix[1] * Math.exp((a.shooting - own) / 26);
  let rim = CAL.mix[2] * Math.exp((a.finishing - own) / 22) * (big ? 1.24 : guard ? 0.9 : 1);
  // The scheme pushes the whole team's diet around.
  three *= clamp(1 - scheme.effects.threeBias * 3.4, 0.2, 2.4);
  rim *= clamp(scheme.effects.driveBias * (scheme.effects.arcPlayers <= 2 ? 1.3 : 1), 0.4, 2);
  mid *= scheme.effects.arcPlayers >= 5 ? 0.6 : 1;
  const total = three + mid + rim;
  return [three / total, mid / total, rim / total];
}

/**
 * Who takes the shots.
 *
 * Usage follows ability, but not linearly: the best player on a team takes a lot
 * more than his share and the twelfth man takes almost none, which is what makes
 * a star worth having. Isolation concentrates it further; motion spreads it.
 */
function buildSide(team: SimTeam, rng: Rng): SimPlayer[] {
  const scheme = team.scheme ?? NEUTRAL_SCHEME;
  const five = new Set(starters(team.roster).map((p) => p.id));
  // The rotation: the five who start and the best of the rest. Nobody outside
  // it plays, which is why depth matters but the fourteenth man does not.
  const rotation = [...team.roster]
    .sort((a, b) => (five.has(b.id) ? 1 : 0) - (five.has(a.id) ? 1 : 0)
      || b.overall - a.overall)
    .slice(0, Math.min(9, team.roster.length));

  const best = Math.max(...rotation.map((p) => p.overall));
  const raw = rotation.map((p) => {
    const starter = five.has(p.id);
    const gap = best - p.overall;
    // A curve, not a line: 8 points below the best man is most of your usage
    // gone, which is roughly how a real rotation shares the ball.
    let u = Math.exp(-gap / 11) * (starter ? 1 : 0.62);
    if (p.overall === best) u *= scheme.effects.isolation;
    // Guards and wings finish more possessions than bigs at the same rating.
    u *= p.pos === 'PG' ? 0.95 : p.pos === 'C' ? 0.86 : 1;
    return { p, u };
  });
  const totalU = raw.reduce((n, r) => n + r.u, 0);

  const minutesRaw = rotation.map((p) => {
    const starter = five.has(p.id);
    return (starter ? 1 : 0.45) * (0.6 + p.attrs.stamina / 250);
  });
  const totalM = minutesRaw.reduce((a, b) => a + b, 0);

  return raw.map((r, i) => ({
    p: r.p,
    line: emptyLine(),
    usage: r.u / Math.max(0.001, totalU),
    mix: shotMix(r.p, scheme),
    minutes: minutesRaw[i] / Math.max(0.001, totalM),
    fouledOut: false,
  })).map((sp) => {
    // A tiny jitter so two identical players do not produce identical seasons.
    sp.usage *= rng.range(0.93, 1.07);
    return sp;
  });
}

/** What the defence is worth against a given range, as a rating. */
function defenceRating(side: SimPlayer[], range: 0 | 1 | 2, scheme: ResolvedScheme): number {
  const active = side.filter((s) => !s.fouledOut);
  if (!active.length) return 50;
  const w = (s: SimPlayer): number => {
    const a = s.p.attrs;
    if (range === 2) return (a.interiorD * 2 + a.block + a.rebounding) / 4;
    if (range === 1) return (a.perimeterD + a.interiorD) / 2;
    return a.perimeterD;
  };
  const mean = active.reduce((n, s) => n + w(s) * s.minutes, 0)
    / Math.max(0.001, active.reduce((n, s) => n + s.minutes, 0));
  // A zone protects what it is shaped to protect and gives up the rest.
  const shape = scheme.effects.zone * scheme.effects.zoneShape;
  const bend = range === 2 ? -shape * 9 : range === 0 ? shape * 9 : 0;
  return mean + bend;
}

const pickWeighted = (rng: Rng, xs: SimPlayer[], w: (s: SimPlayer) => number): SimPlayer => {
  let total = 0;
  for (const x of xs) total += Math.max(0, w(x));
  let r = rng.range(0, Math.max(0.0001, total));
  for (const x of xs) {
    r -= Math.max(0, w(x));
    if (r <= 0) return x;
  }
  return xs[xs.length - 1];
};

/* ------------------------------------------------------------------ the game */

/**
 * Play a game. Deterministic: the same teams, the same options and the same seed
 * produce the same box score, every time, on every machine.
 */
export function simulateGame(home: SimTeam, away: SimTeam, opts: SimOptions): SimResult {
  const rng = new Rng(`hoops:sim:${home.id}:${away.id}:${opts.seed}`);
  const sides = [buildSide(home, rng), buildSide(away, rng)];
  const schemes = [home.scheme ?? NEUTRAL_SCHEME, away.scheme ?? NEUTRAL_SCHEME];
  const coaching = [home.coaching ?? 1, away.coaching ?? 1];
  const boxes = [emptyTeamBox(), emptyTeamBox()];
  const scores = [0, 0];
  const byQuarter: number[][] = [[], []];

  const tempo = (schemes[0].effects.tempo + schemes[1].effects.tempo) / 2;
  const possessionSeconds = CAL.possessionSeconds / tempo;

  const homeEdge = opts.homeAdvantage === false ? 0 : CAL.homeEdge;

  const playPeriod = (seconds: number, quarter: number): void => {
    const possessions = Math.max(1, Math.round(seconds / possessionSeconds));
    const qStart = [scores[0], scores[1]];
    boxes[0].quarterFouls = 0;
    boxes[1].quarterFouls = 0;
    for (let i = 0; i < possessions; i++) {
      possession(i % 2, quarter);
      possession((i + 1) % 2, quarter);
    }
    byQuarter[0].push(scores[0] - qStart[0]);
    byQuarter[1].push(scores[1] - qStart[1]);
  };

  function possession(o: number, quarter: number, chances = 0): void {
    const off = (o % 2) as 0 | 1;
    const def = (1 - off) as 0 | 1;
    const attack = sides[off].filter((s) => !s.fouledOut);
    const defend = sides[def].filter((s) => !s.fouledOut);
    if (!attack.length || !defend.length) return;
    const scheme = schemes[off];
    const dScheme = schemes[def];
    const edge = (off === 0 ? homeEdge : -homeEdge) + (coaching[off] - coaching[def]) * 0.018;

    // --- a turnover before anything else happens.
    const pressure = dScheme.effects.gamble * (1 + (coaching[def] - 1) * 0.1);
    const handleQuality = attack.reduce((n, s) => n + s.p.attrs.handle * s.usage, 0)
      / Math.max(0.001, attack.reduce((n, s) => n + s.usage, 0));
    const toChance = clamp(
      CAL.turnoverRate * pressure
      * (1 + (58 - handleQuality) * 0.006)
      * (2 - scheme.effects.ballMovement * 0.5) * 0.667,
      0.02, 0.34,
    );
    if (chances === 0 && rng.bool(toChance)) {
      const loser = pickWeighted(rng, attack, (s) => s.usage * (1.6 - s.p.attrs.handle / 120));
      loser.line.turnovers++;
      boxes[off].turnovers++;
      if (rng.bool(CAL.stealShare)) {
        const thief = pickWeighted(rng, defend, (s) => s.p.attrs.steal * s.minutes);
        thief.line.steals++;
        boxes[def].steals++;
      }
      return;
    }

    // --- who shoots, and from where.
    const shooter = pickWeighted(rng, attack, (s) => s.usage);
    const roll = rng.range(0, 1);
    const range: 0 | 1 | 2 = roll < shooter.mix[0] ? 0
      : roll < shooter.mix[0] + shooter.mix[1] ? 1 : 2;

    const a = shooter.p.attrs;
    const rating = range === 0 ? a.three : range === 1 ? a.shooting : a.finishing;
    const dRating = defenceRating(sides[def], range, dScheme);
    const base = range === 0 ? CAL.makeThree : range === 1 ? CAL.makeMid : CAL.makeRim;
    let make = base
      + (rating - CAL.reference) * CAL.ratingScale
      - (dRating - CAL.reference) * CAL.ratingScale * 0.8
      + edge
      - scheme.offensePenalty
      + dScheme.defensePenalty;
    // Spacing: an empty paint is an easier rim, a crowded one is not.
    if (range === 2) make += (scheme.effects.arcPlayers - 3) * 0.012;
    make = clamp(make, 0.14, 0.86);

    const points = range === 0 ? 3 : 2;
    shooter.line.fga++;
    boxes[off].fga++;
    if (range === 0) { shooter.line.tpa++; boxes[off].tpa++; }

    // --- a shooting foul.
    const foulBase = range === 2 ? CAL.foulRim : range === 1 ? CAL.foulMid : CAL.foulThree;
    if (rng.bool(clamp(foulBase * dScheme.effects.fouling, 0.005, 0.4))) {
      const fouler = pickWeighted(rng, defend, (s) => s.minutes * (1.4 - s.p.attrs.iq / 160));
      chargeFoul(fouler, def, quarter);
      // And-one or a trip to the line.
      const and1 = rng.bool(make * 0.28);
      if (and1) {
        scoreIt(shooter, off, points, range, quarter);
        freeThrows(shooter, off, 1);
      } else {
        shooter.line.fga--;
        boxes[off].fga--;
        if (range === 0) { shooter.line.tpa--; boxes[off].tpa--; }
        freeThrows(shooter, off, points === 3 ? 3 : 2);
      }
      return;
    }

    if (rng.bool(make)) {
      scoreIt(shooter, off, points, range, quarter);
      // The pass that made it.
      const assistChance = clamp(
        CAL.assistRate * scheme.effects.ballMovement
        * (range === 2 ? 0.82 : 1.08) * (1 - (scheme.effects.isolation - 1) * 0.3),
        0.1, 0.92,
      );
      if (attack.length > 1 && rng.bool(assistChance)) {
        const passer = pickWeighted(
          rng, attack.filter((s) => s !== shooter), (s) => s.p.attrs.passing * s.minutes,
        );
        passer.line.assists++;
        boxes[off].assists++;
      }
      return;
    }

    // --- a miss. Blocked, then rebounded.
    if (rng.bool(clamp(CAL.blockRate * (range === 2 ? 2.1 : range === 1 ? 0.7 : 0.25), 0, 0.3))) {
      const blocker = pickWeighted(rng, defend, (s) => s.p.attrs.block * s.minutes);
      blocker.line.blocks++;
      boxes[def].blocks++;
    }

    const offGlass = clamp(
      CAL.offRebRate * scheme.effects.crash / Math.max(0.4, dScheme.effects.boxOut),
      0.04, 0.42,
    );
    if (chances < 2 && rng.bool(offGlass)) {
      const reb = pickWeighted(rng, attack, (s) => s.p.attrs.rebounding * s.minutes);
      reb.line.offReb++;
      boxes[off].offReb++;
      possession(off, quarter, chances + 1);
      return;
    }
    // Not every miss is rebounded by somebody: a third of them go out of bounds,
    // off a hand, or off the iron and into the crowd.
    if (!rng.bool(CAL.reboundLost)) {
      const reb = pickWeighted(
        rng, defend, (s) => (s.p.attrs.rebounding + s.p.attrs.vertical * 0.4) * s.minutes,
      );
      reb.line.defReb++;
      boxes[def].defReb++;
    }

    // --- a foul away from the ball, on the way back the other way.
    if (rng.bool(CAL.looseFoulRate * schemes[def].effects.fouling)) {
      const fouler = pickWeighted(rng, defend, (s) => s.minutes);
      chargeFoul(fouler, def, quarter);
      if (boxes[def].quarterFouls > 4) {
        const taker = pickWeighted(rng, attack, (s) => s.usage);
        freeThrows(taker, off, 2);
      }
    }
  }

  function scoreIt(
    s: SimPlayer, side: 0 | 1, points: number, range: 0 | 1 | 2, quarter: number,
  ): void {
    void quarter;
    s.line.fgm++;
    s.line.points += points;
    boxes[side].fgm++;
    boxes[side].points += points;
    scores[side] += points;
    if (range === 0) { s.line.tpm++; boxes[side].tpm++; }
    if (range === 2) boxes[side].paintPoints += points;
  }

  function freeThrows(s: SimPlayer, side: 0 | 1, count: number): void {
    const chance = clamp(CAL.freeThrow + (s.p.attrs.freeThrow - 70) * 0.005, 0.35, 0.96);
    for (let i = 0; i < count; i++) {
      s.line.fta++;
      boxes[side].fta++;
      if (rng.bool(chance)) {
        s.line.ftm++;
        s.line.points++;
        boxes[side].ftm++;
        boxes[side].points++;
        scores[side]++;
      }
    }
  }

  function chargeFoul(s: SimPlayer, side: 0 | 1, quarter: number): void {
    void quarter;
    s.line.fouls++;
    boxes[side].fouls++;
    boxes[side].quarterFouls++;
    if (s.line.fouls >= 6) s.fouledOut = true;
  }

  for (let q = 1; q <= 4; q++) playPeriod(opts.quarterSeconds, q);

  let overtime = 0;
  const otLength = opts.overtimeSeconds ?? Math.round(opts.quarterSeconds * 0.45);
  while (scores[0] === scores[1] && overtime < 6) {
    overtime++;
    playPeriod(otLength, 4 + overtime);
  }
  // Nothing in a league table can be a draw. If six overtimes have not settled
  // it, the better free-throw shooting team gets the basket.
  if (scores[0] === scores[1]) scores[rng.bool() ? 0 : 1]++;

  // Minutes, so the stat screen can show them. Play time is the rotation share
  // of the whole game, which is what the simulator actually used.
  const gameSeconds = opts.quarterSeconds * 4 + overtime * otLength;
  for (const side of sides) {
    for (const s of side) s.line.seconds = Math.round(s.minutes * gameSeconds * 5);
  }

  boxes[0].points = scores[0];
  boxes[1].points = scores[1];
  boxes[0].byQuarter = byQuarter[0];
  boxes[1].byQuarter = byQuarter[1];

  const pack = (i: 0 | 1, team: SimTeam): SimSide => ({
    id: team.id,
    score: scores[i],
    box: boxes[i],
    lines: sides[i].map((s) => ({ player: s.p, line: s.line })),
  });

  return {
    home: pack(0, home),
    away: pack(1, away),
    overtime,
    byQuarter: { home: byQuarter[0], away: byQuarter[1] },
  };
}

/** A one-line result, for a schedule row. */
export function scoreLine(r: SimResult): string {
  return `${r.home.score}-${r.away.score}${r.overtime ? ` (${r.overtime}OT)` : ''}`;
}
