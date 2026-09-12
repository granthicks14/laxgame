/**
 * The one place UI code asks for a player's face.
 *
 * It exists so that no screen has to know how a portrait is built or which
 * colours a team wears — pass the player and the team he plays for and get an
 * element back. Keeping it in one function is also what guarantees the same
 * player looks the same everywhere he appears.
 */
import { portraitEl } from '../render/portrait';
import type { PlayerData } from '../data/players';
import type { GameTeam } from '../data/teams';

export function playerPortrait(
  p: PlayerData, team: GameTeam, size = 40, helmet = true,
): HTMLElement {
  const el = portraitEl({
    id: p.id,
    pos: p.pos,
    number: p.number,
    team: { primary: team.primary, secondary: team.secondary, trim: team.trim },
    helmet,
  }, size);
  el.setAttribute('aria-hidden', 'true');
  if (size >= 64) el.classList.add('portrait--lg');
  return el;
}
