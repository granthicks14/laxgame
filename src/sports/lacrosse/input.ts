import type { RawInput } from '../../input/Input';
import type { InputState } from '../../match/types';

/**
 * One frame of generic input, in lacrosse's own words.
 *
 * The input manager knows about held keys and pressed buttons; the match engine
 * knows about checks, dodges and a charged shot. This is the only place the two
 * vocabularies meet, so the engine never sees an action id and the manager never
 * learns what a dodge is.
 */
export function laxInput(raw: RawInput): InputState {
  return {
    moveX: raw.moveX,
    moveY: raw.moveY,
    sprint: raw.sprint,
    actionPressed: raw.pressed.has('pass'),
    shootHeld: raw.held.has('shoot'),
    shootReleased: raw.released.has('shoot'),
    dodgePressed: raw.pressed.has('dodge'),
    switchPressed: raw.pressed.has('switch'),
    screenPressed: raw.pressed.has('screen'),
  };
}
