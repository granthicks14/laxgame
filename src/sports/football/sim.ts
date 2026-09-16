import { Rng } from '../../core/rng';
import { clamp } from '../../core/math';
import {
  depthAt, starterAt, teamRatings, type Player, type Position,
} from './data';
import { FOOTBALL } from './tuning';
import { emptyStatLine, emptyTeamBox, type StatLine, type TeamBox } from './types';
import type { Side } from './field';

/* ---------------------------------------------------------------------------
 * THE FAST SIMULATOR
 * ---------------------------------------------------------------------------
 * The other engine. A coach plays one game a week and the league plays six, so
 * the other six have to resolve in a millisecond rather than in fourteen minutes
 * of real time — and they have to resolve into the SAME LEAGUE. A season where
 * the games you play finish 24-21 and the ones you simulate finish 63-7 is two
 * games wearing one name.
 *
 * So this is not a scoreline generator. It plays football, at the only
 * resolution that is cheap: A DRIVE AT A TIME, made of plays, each play a real
 * choice between running and throwing with the two teams' actual position groups
 * deciding how it goes. It produces a full box score — passer, backs, receivers,
 * tacklers, kicker — because a career that cannot tell you who had a hundred
 * yards is a career with no players in it.
 *
 * It is kept honest by `npm run gridiron-parity`, which plays games in the real
 * engine and simulates the same fixtures here, and fails if the two disagree
 * about what a football game looks like.
 * ------------------------------------------------------------------------- */

export interface SimTeam {
  id: string;
  roster: Player[];
  /** A small, honest edge for playing at home. */
  homeEdge?: number;
}

export interface SimLine {
  playerId: string;
  line: StatLine;
}

export interface SimResult {
  home: number;
  away: number;
  box: Record<Side, TeamBox>;
  lines: Record<Side, SimLine[]>;
  /** Plays run by each side, for the harness. */
  plays: Record<Side, number>;
}

/** How long a drive's worth of clock is, in the compressed seconds the game uses. */
const SECONDS_PER_PLAY = 6.4;

interface Unit {
  qb: Player | null;
  backs: Player[];
  targets: Player[];
  line: number;
  rush: number;
  cover: number;
  stop: number;
  kicker: Player | null;
  punter: Player | null;
  defenders: Player[];
}

function unitOf(roster: Player[]): Unit {
  const avg = (pos: Position, n: number): number => {
    const at = depthAt(roster, pos).slice(0, n);
    if (!at.length) return 42;
    return at.reduce((s, p) => s + p.overall, 0) / at.length;
  };
  return {
    qb: starterAt(roster, 'QB'),
    backs: depthAt(roster, 'RB').slice(0, 3),
    targets: [...depthAt(roster, 'WR').slice(0, 4), ...depthAt(roster, 'TE').slice(0, 2)],
    line: avg('OL', 5),
    rush: avg('DL', 4),
    cover: avg('CB', 3) * 0.6 + avg('S', 2) * 0.4,
    stop: avg('DL', 4) * 0.45 + avg('LB', 3) * 0.4 + avg('S', 2) * 0.15,
    kicker: starterAt(roster, 'K'),
    punter: starterAt(roster, 'P'),
    defenders: [
      ...depthAt(roster, 'LB').slice(0, 4),
      ...depthAt(roster, 'DL').slice(0, 4),
      ...depthAt(roster, 'CB').slice(0, 3),
      ...depthAt(roster, 'S').slice(0, 2),
    ],
  };
}

/** Pick a man from a group, weighted toward the top of the depth chart. */
function pickFrom(list: Player[], rng: Rng): Player | null {
  if (!list.length) return null;
  const weights = list.map((_, i) => 1 / (1 + i * 0.8));
  let total = 0;
  for (const w of weights) total += w;
  let t = rng.next() * total;
  for (let i = 0; i < list.length; i++) {
    t -= weights[i];
    if (t <= 0) return list[i];
  }
  return list[list.length - 1];
}

export function simulateGame(
  home: SimTeam, away: SimTeam, seed: string, quarterSeconds = 210,
): SimResult {
  const rng = new Rng(`fbsim:${seed}`);
  const units: Record<Side, Unit> = { home: unitOf(home.roster), away: unitOf(away.roster) };
  const ratings: Record<Side, ReturnType<typeof teamRatings>> = {
    home: teamRatings(home.roster),
    away: teamRatings(away.roster),
  };
  const edge = home.homeEdge ?? 2;

  const box: Record<Side, TeamBox> = { home: emptyTeamBox(), away: emptyTeamBox() };
  const stats: Record<Side, Map<string, StatLine>> = { home: new Map(), away: new Map() };
  const plays: Record<Side, number> = { home: 0, away: 0 };

  const lineOf = (side: Side, p: Player): StatLine => {
    let s = stats[side].get(p.id);
    if (!s) { s = emptyStatLine(); stats[side].set(p.id, s); }
    return s;
  };

  const score = { home: 0, away: 0 };
  let quarter = 1;
  let clock = quarterSeconds;
  let offence: Side = 'home';

  const addPoints = (side: Side, n: number): void => {
    score[side] += n;
    box[side].points += n;
    box[side].byQuarter[Math.min(3, quarter - 1)] += n;
  };

  /* A DRIVE. Starts somewhere, runs plays until it ends, and ends in one of the
   * four ways a football drive can: points, a punt, a turnover, or the clock. */
  let spot = 25;

  while (quarter <= FOOTBALL.quarters) {
    const off = units[offence];
    const def = units[offence === 'home' ? 'away' : 'home'];
    const offRating = ratings[offence];
    const boost = offence === 'home' ? edge : 0;

    let down = 1;
    let toGo = 10;
    let alive = true;
    let driveOver = false;

    while (alive && clock > 0) {
      /* RUN OR THROW. The same decision the play caller in the real engine
       * makes, from the same situation, so the two produce the same shape of
       * game: runs on early downs and short distance, throws when behind the
       * chains or behind on the scoreboard late. */
      const behind = score[offence] - score[offence === 'home' ? 'away' : 'home'] < 0;
      const hurry = quarter >= 4 && clock < 150 && behind;
      let passChance = 0.55;
      if (down === 1) passChance = 0.5;
      else if (down >= 3 && toGo >= 7) passChance = 0.86;
      else if (down >= 3 && toGo <= 2) passChance = 0.32;
      if (hurry) passChance = Math.min(0.95, passChance + 0.28);
      if (offRating.rushing > offRating.passing + 6) passChance -= 0.1;
      if (offRating.passing > offRating.rushing + 6) passChance += 0.1;

      const isPass = rng.next() < clamp(passChance, 0.05, 0.95);
      let gain = 0;
      let turnover = false;
      let stopClock = false;
      plays[offence]++;

      if (isPass) {
        const qb = off.qb;
        const target = pickFrom(off.targets, rng);
        const pressure = clamp((def.rush + 6 - off.line) / 70, -0.3, 0.55);

        // A sack, first: the rush beating the line before anything else happens.
        if (rng.next() < clamp(0.055 + pressure * 0.09, 0.01, 0.16)) {
          gain = -Math.round(rng.range(4, 10));
          box[offence].sacksAllowed++;
          if (qb) lineOf(offence, qb).sacked++;
          const by = pickFrom(def.defenders.slice(0, 6), rng);
          if (by) {
            const l = lineOf(offence === 'home' ? 'away' : 'home', by);
            l.sacks++;
            l.tackles++;
          }
          stopClock = false;
        } else {
          const arm = qb ? (qb.attrs.throwAccuracy * 0.5 + qb.attrs.decision * 0.3
            + qb.attrs.throwPower * 0.2) : 45;
          const hands = target ? (target.attrs.catching * 0.6 + target.attrs.routeRunning * 0.4) : 45;
          const quality = (arm * 0.55 + hands * 0.45) + boost - def.cover;
          const complete = rng.next() < clamp(0.54 + quality / 160 - pressure * 0.2, 0.25, 0.8);
          if (qb) lineOf(offence, qb).passAttempts++;
          if (target) lineOf(offence, target).targets++;

          if (complete) {
            /* A COMPLETION IS AIR PLUS WHATEVER HE DOES WITH IT, and the long
             * tail is the second half: most catches are eight yards and the
             * occasional one is sixty. */
            const air = Math.max(-2, Math.round(rng.range(2, 15) + (down >= 3 ? toGo * 0.5 : 0)));
            const breakaway = rng.next() < clamp(0.1 + (target ? target.attrs.speed - def.cover : 0) / 260, 0.03, 0.26);
            const yac = breakaway
              ? Math.round(rng.range(8, 34))
              : Math.round(rng.range(0, 6));
            gain = air + yac;
            if (qb) {
              const l = lineOf(offence, qb);
              l.completions++;
              l.passYards += gain;
            }
            if (target) {
              const l = lineOf(offence, target);
              l.catches++;
              l.recYards += gain;
            }
            const by = pickFrom(def.defenders, rng);
            if (by) lineOf(offence === 'home' ? 'away' : 'home', by).tackles++;
          } else {
            stopClock = true;
            const picked = rng.next() < clamp(0.055 + (def.cover - (qb?.attrs.decision ?? 50)) / 420, 0.012, 0.13);
            if (picked) {
              turnover = true;
              box[offence].turnovers++;
              if (qb) lineOf(offence, qb).interceptions++;
              const by = pickFrom(def.defenders.slice(6), rng) ?? pickFrom(def.defenders, rng);
              if (by) lineOf(offence === 'home' ? 'away' : 'home', by).picks++;
            } else {
              const by = pickFrom(def.defenders.slice(6), rng);
              if (by) lineOf(offence === 'home' ? 'away' : 'home', by).passesDefended++;
            }
          }
        }
      } else {
        const back = pickFrom(off.backs, rng);
        const power = back ? (back.attrs.speed * 0.35 + back.attrs.power * 0.35
          + back.attrs.agility * 0.3) : 45;
        const holes = off.line + boost - def.stop;
        /* A RUN'S SHAPE, and it is the shape the played engine produces: a
         * cluster around three or four, a tail of losses when the front wins,
         * and one carry in twenty that breaks. */
        const base = rng.range(-2, 7) + holes / 22 + (power - 60) / 30;
        const broke = rng.next() < clamp(0.045 + (power - def.stop) / 420, 0.01, 0.13);
        gain = Math.round(broke ? base + rng.range(9, 32) : base);
        if (back) {
          const l = lineOf(offence, back);
          l.carries++;
          l.rushYards += gain;
        }
        const by = pickFrom(def.defenders.slice(0, 8), rng);
        if (by) lineOf(offence === 'home' ? 'away' : 'home', by).tackles++;
      }

      // Yardage on the board.
      box[offence].totalYards += gain;
      if (isPass) box[offence].passYards += gain;
      else box[offence].rushYards += gain;
      if (down === 3) box[offence].thirdDownAtt++;

      clock -= stopClock ? SECONDS_PER_PLAY * 0.6 : SECONDS_PER_PLAY;
      box[offence].timeOfPossession += SECONDS_PER_PLAY;
      spot = clamp(spot + gain, 1, 99);

      if (turnover) {
        driveOver = true;
        alive = false;
        break;
      }

      // A touchdown.
      if (spot >= 100 || (spot >= 99 && gain > 0)) {
        addPoints(offence, FOOTBALL.touchdown);
        if (isPass) {
          const qb = off.qb;
          if (qb) lineOf(offence, qb).passTD++;
          const t = pickFrom(off.targets, rng);
          if (t) lineOf(offence, t).recTD++;
        } else {
          const b = pickFrom(off.backs, rng);
          if (b) lineOf(offence, b).rushTD++;
        }
        // The extra point, which is nearly but not quite automatic.
        const k = off.kicker;
        if (rng.next() < clamp(0.9 + (k?.attrs.kicking ?? 55) / 900, 0.86, 0.985)) {
          addPoints(offence, FOOTBALL.extraPoint);
        }
        driveOver = true;
        alive = false;
        break;
      }

      if (gain >= toGo) {
        // The conversion belongs to the down it happened ON, so it is counted
        // before the down is reset — which the first version did the other way
        // round and therefore never counted one at all.
        if (down === 3) box[offence].thirdDownConv++;
        down = 1;
        toGo = 10;
        box[offence].firstDowns++;
      } else {
        down++;
        toGo -= gain;
        if (down > FOOTBALL.downs) {
          driveOver = true;
          alive = false;
          break;
        }
      }

      /* FOURTH DOWN. Kick it, punt it, or go — the same three questions the
       * real coach asks, answered off the same numbers. */
      if (down === 4) {
        const fgDistance = (100 - spot) + 17;
        const leg = off.kicker?.attrs.kicking ?? 55;
        const range = FOOTBALL.fieldGoalRangeMin
          + (leg / 99) * (FOOTBALL.fieldGoalRangeMax - FOOTBALL.fieldGoalRangeMin);
        const odds = clamp(0.985 - 0.0045 * Math.max(0, fgDistance - 18)
          - 0.05 * Math.max(0, fgDistance - (range - 10)), 0.02, 0.985);
        const goFor = toGo <= 1.5 && spot > 55;
        if (!goFor && odds >= 0.58) {
          if (off.kicker) {
            const l = lineOf(offence, off.kicker);
            l.fgAttempts++;
            if (rng.next() < odds) { l.fgMade++; addPoints(offence, FOOTBALL.fieldGoal); }
          } else if (rng.next() < odds) addPoints(offence, FOOTBALL.fieldGoal);
          driveOver = true;
          alive = false;
          break;
        }
        if (!goFor && spot < 68) {
          const p = off.punter;
          const dist = FOOTBALL.puntDistanceMin
            + ((p?.attrs.kicking ?? 55) / 99) * (FOOTBALL.puntDistanceMax - FOOTBALL.puntDistanceMin)
            + rng.range(-6, 6);
          if (p) {
            const l = lineOf(offence, p);
            l.punts++;
            l.puntYards += Math.round(dist);
          }
          spot = clamp(spot + dist, 1, 90);
          driveOver = true;
          alive = false;
          break;
        }
      }
    }

    if (clock <= 0) {
      quarter++;
      clock = quarterSeconds;
      if (quarter === 3) {
        offence = 'home';
        spot = 25;
        continue;
      }
      if (quarter > FOOTBALL.quarters) break;
    }

    if (driveOver) {
      // The ball changes hands, and the new offence starts from the far side.
      offence = offence === 'home' ? 'away' : 'home';
      spot = clamp(100 - spot, 1, 80);
      // A drive that ended in points restarts the other side at its own 25.
      if (spot > 78 || spot < 3) spot = 25;
    }
  }

  /* OVERTIME. One extra period each, and if it is still level it stays level —
   * a league table with draws in it is better than a coin flip. */
  let guard = 0;
  while (score.home === score.away && guard++ < 2) {
    for (const side of ['home', 'away'] as const) {
      const r = ratings[side];
      const other = ratings[side === 'home' ? 'away' : 'home'];
      const good = rng.next() < clamp(0.34 + (r.offense - other.defense) / 90, 0.12, 0.66);
      if (good) addPoints(side, rng.next() < 0.6 ? FOOTBALL.touchdown + 1 : FOOTBALL.fieldGoal);
    }
  }

  const linesOf = (side: Side): SimLine[] =>
    [...stats[side].entries()].map(([playerId, line]) => ({ playerId, line }));

  return {
    home: score.home,
    away: score.away,
    box,
    lines: { home: linesOf('home'), away: linesOf('away') },
    plays,
  };
}
