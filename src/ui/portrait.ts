/**
 * The one place UI code asks for a player's face.
 *
 * Sizes are integer fractions or multiples of the 48px sprite — 24, 48, 96 —
 * so scaling never falls between pixels and turns a portrait into mush.
 *
 * It exists so that no screen has to know how a portrait is built or which
 * colours a team wears — pass the player and the team he plays for and get an
 * element back. Keeping it in one function is also what guarantees the same
 * player looks the same everywhere he appears.
 */
import { portraitEl } from '../render/portrait';
import type { PlayerData } from '../data/players';
import type { Position } from '../data/constants';
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

/**
 * A face for somebody who is no longer on the roster — a graduating senior, a
 * new arrival, a player in a development report — where all the screen has is
 * the id the report carried. The id is what drives the features, so the face is
 * the same one he had on the roster.
 */
export function reportPortrait(
  id: string, pos: string, team: GameTeam, size = 24,
): HTMLElement {
  const el = portraitEl({
    id,
    pos: pos as Position,
    team: { primary: team.primary, secondary: team.secondary, trim: team.trim },
    helmet: false,
  }, size);
  el.setAttribute('aria-hidden', 'true');
  return el;
}
