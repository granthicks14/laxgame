import { Rng } from '../core/rng';
import { clamp } from '../core/math';
import type { TeamRatings } from '../data/teams';

export interface SimResult {
  homeScore: number;
  awayScore: number;
}

/**
 * Expected goals for a side. Calibrated against the full match engine so a
 * simulated result looks like a game you could have played: around four to five
 * goals a side between even teams, scaling with the configured game length.
 * If the engine's scoring is retuned, re-check this with `npm run balance`.
 */
function expectedGoals(
  off: TeamRatings, def: TeamRatings, homeEdge: number, lengthScale: number,
): number {
  const attack = off.offense * 0.55 + off.attack * 0.25 + off.midfield * 0.2;
  const stop = def.defense * 0.55 + def.goalie * 0.45;
  const possession = 0.5 + (off.faceoff - def.faceoff) / 420 + (off.speed - def.speed) / 900;
  const base = 4.4 + (attack - stop) * 0.13;
  return clamp((base * clamp(possession * 2, 0.55, 1.5) + homeEdge) * lengthScale, 0.7, 14);
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

/**
 * Quick statistical result for games the player is not on the field for.
 * `lengthScale` is 1 for a Short game and scales with the quarter length.
 */
export function simulateGame(
  home: TeamRatings, away: TeamRatings, seedKey: string, lengthScale = 1,
): SimResult {
  const rng = new Rng(seedKey);
  const hx = expectedGoals(home, away, 0.4, lengthScale);
  const ax = expectedGoals(away, home, 0, lengthScale);
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
