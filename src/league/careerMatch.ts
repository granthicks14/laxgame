/* ---------------------------------------------------------------------------
 * SETTING UP A CAREER FIXTURE FOR THE MATCH ENGINE
 * ---------------------------------------------------------------------------
 * Turns one scheduled game into a MatchConfig the real engine can play: both
 * squads at the right level, the coach's tactics on his own side, the level's
 * difficulty floor, and the opponent generated exactly as that programme would
 * generate itself.
 *
 * It lives outside the UI on purpose. A game has to be PLAYABLE at every rung of
 * Challenge Mode — not simulation-only — and the only way to prove that is for a
 * headless harness to build the same config the Play button builds and run it
 * through the engine. See `npm run stages`.
 * ------------------------------------------------------------------------- */

import { makeMatchConfig, tacticsFor } from './matchSetup';
import { effectiveTeam, opponentOf, roundName, rosterForMatch, userIsHome } from './career';
import { generateRoster } from '../data/players';
import { difficultyFor } from '../data/levels';
import { coachEffects } from './coaching';
import type { Career, ScheduledGame } from './types';

export function buildSeasonMatch(career: Career, game: ScheduledGame, replays = true) {
  const oppId = opponentOf(career, game);
  const you = effectiveTeam(career, career.teamId);
  const them = effectiveTeam(career, oppId);
  const isHome = userIsHome(career, game);
  const oppRoster = generateRoster(them, `${career.seed}:${career.year}:${oppId}`, career.level);
  const yourRoster = rosterForMatch(career);

  const label = game.playoff
    ? roundName(game.playoff).toUpperCase()
    : game.rivalry ? 'RIVALRY GAME' : undefined;

  return makeMatchConfig({
    homeTeam: isHome ? you : them,
    awayTeam: isHome ? them : you,
    humanSide: isHome ? 'home' : 'away',
    // Nobody plays a professional game on rookie AI: the level sets a floor.
    difficulty: difficultyFor(career.level, career.difficulty),
    gameLength: career.gameLength,
    level: career.level,
    seed: hashSeed(`${career.seed}:${career.year}:${game.id}`),
    contextLabel: label,
    homeRoster: isHome ? yourRoster : oppRoster,
    awayRoster: isHome ? oppRoster : yourRoster,
    homeTactics: isHome ? career.tactics : tacticsFor(them),
    awayTactics: isHome ? tacticsFor(them) : career.tactics,
    // Your staff coaches your side. The opposition coaches itself.
    homeCoaching: isHome ? coachEffects(career.staff) : undefined,
    awayCoaching: isHome ? undefined : coachEffects(career.staff),
    replays,
  });
}


function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
