import { Rng } from '../core/rng';
import { clamp } from '../core/math';
import type { TeamRatings } from '../data/teams';

export interface SimResult {
  homeScore: number;
  awayScore: number;
}

/** Expected goals for a side, from its own attack against the other side's defense. */
function expectedGoals(off: TeamRatings, def: TeamRatings, homeEdge: number): number {
  const attack = off.offense * 0.55 + off.attack * 0.25 + off.midfield * 0.2;
  const stop = def.defense * 0.55 + def.goalie * 0.45;
  const possession = 0.5 + (off.faceoff - def.faceoff) / 420 + (off.speed - def.speed) / 900;
  const base = 9.4 + (attack - stop) * 0.19;
  return clamp(base * clamp(possession * 2, 0.55, 1.5) + homeEdge, 2.2, 22);
}

function poisson(rng: Rng, mean: number): number {
  // Knuth's method; means here are small enough that this is cheap.
  const l = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > l && k < 40);
  return k - 1;
}

/** Quick statistical result for games the player is not on the field for. */
export function simulateGame(home: TeamRatings, away: TeamRatings, seedKey: string): SimResult {
  const rng = new Rng(seedKey);
  const hx = expectedGoals(home, away, 0.85);
  const ax = expectedGoals(away, home, 0);
  // Chemistry adds a little consistency; low chemistry teams are streakier.
  const hVar = 1 + (75 - home.chemistry) / 300;
  const aVar = 1 + (75 - away.chemistry) / 300;
  let h = poisson(rng, hx * rng.range(1 - 0.22 * hVar, 1 + 0.22 * hVar));
  let a = poisson(rng, ax * rng.range(1 - 0.22 * aVar, 1 + 0.22 * aVar));
  // High school lacrosse does not end in ties: play it out.
  let guard = 0;
  while (h === a && guard++ < 12) {
    if (rng.next() < hx / (hx + ax)) h++;
    else a++;
  }
  return { homeScore: h, awayScore: a };
}
