import type { ControlScheme } from '../../state/keybinds';
import type { RawInput } from '../../input/Input';

/* ---------------------------------------------------------------------------
 * FOOTBALL CONTROLS
 * ---------------------------------------------------------------------------
 * THE HARDEST INPUT PROBLEM IN THE HUB, and the one that decides whether the
 * game is any good: eleven men are on the field and a thumb has to run an
 * offence with them.
 *
 * The answer is that the person is never eleven people. He is:
 *
 *   ON OFFENCE   the quarterback until the ball leaves his hands, and then
 *                whoever is carrying it.
 *   ON DEFENCE   one man, and he can take whoever is nearest the play.
 *
 * Everything else — routes, blocks, coverage, pursuit — belongs to the engine,
 * because a player steering a left guard is not enjoying football, and the
 * decisions that make the sport are the CALL and the THROW, not the footwork of
 * ten other people.
 *
 * SIX BUTTONS, and each one does a different job depending on where the ball is:
 *
 *   SNAP        start the play. The last free moment before it all happens.
 *   THROW       on a phone, tap the receiver you want — the markers on screen
 *               ARE the buttons. On a keyboard, aim with the arrows and throw.
 *   THROW AWAY  out of bounds, live to see second down.
 *   SPRINT      push the stick to the edge, or hold the key.
 *   SWITCH      on defence, take the man nearest the ball.
 *   TACKLE      on defence, go for him — and a dive that misses costs you.
 *   TIMEOUT     three a half, and the end of a close game is made of them.
 *
 * WHY AIM IS ITS OWN STICK. A quarterback moves in the pocket and throws in a
 * different direction at the same time, so movement and aim cannot share an
 * input. On a keyboard that is WASD and the arrows. On a phone it is the stick
 * and a tap, which is better than a second stick: the receivers are already
 * drawn on the field, so pointing at one is the whole gesture.
 * ------------------------------------------------------------------------- */

export const FOOTBALL_CONTROLS: ControlScheme = {
  sport: 'football',
  touch: ['snap', 'throw', 'throwAway', 'switch', 'tackle', 'timeout'],
  hold: [],
  actions: [
    { id: 'moveUp', label: 'Move up', hint: 'Left hand', group: 'move' },
    { id: 'moveDown', label: 'Move down', hint: 'Left hand', group: 'move' },
    { id: 'moveLeft', label: 'Move left', hint: 'Left hand', group: 'move' },
    { id: 'moveRight', label: 'Move right', hint: 'Left hand', group: 'move' },
    { id: 'sprint', label: 'Sprint', hint: 'Hold to run', group: 'move' },
    { id: 'aimUp', label: 'Aim deep', hint: 'Right hand — where the throw goes', group: 'action' },
    { id: 'aimDown', label: 'Aim back', hint: 'Right hand', group: 'action' },
    { id: 'aimLeft', label: 'Aim left', hint: 'Right hand', group: 'action' },
    { id: 'aimRight', label: 'Aim right', hint: 'Right hand', group: 'action' },
    { id: 'snap', label: 'Snap', hint: 'Start the play', group: 'action' },
    { id: 'throw', label: 'Throw', hint: 'To the receiver you are aiming at', group: 'action' },
    { id: 'throwAway', label: 'Throw it away', hint: 'Out of bounds, live to see the next down', group: 'action' },
    { id: 'switch', label: 'Switch player', hint: 'Defence: take the man nearest the ball', group: 'action' },
    { id: 'tackle', label: 'Tackle / Dive', hint: 'Defence: go for him', group: 'action' },
    { id: 'timeout', label: 'Timeout', hint: 'Three a half. Spend them late', group: 'action' },
    { id: 'pause', label: 'Pause', hint: 'Menu, controls and the box score', group: 'system' },
  ],
  defaults: {
    moveUp: ['KeyW'],
    moveDown: ['KeyS'],
    moveLeft: ['KeyA'],
    moveRight: ['KeyD'],
    sprint: ['ShiftLeft', 'ShiftRight'],
    aimUp: ['ArrowUp'],
    aimDown: ['ArrowDown'],
    aimLeft: ['ArrowLeft'],
    aimRight: ['ArrowRight'],
    snap: ['Space'],
    throw: ['KeyK', 'Enter'],
    throwAway: ['KeyL'],
    switch: ['Tab', 'KeyO'],
    tackle: ['KeyJ', 'KeyF'],
    timeout: ['KeyT'],
    pause: ['Escape', 'KeyP'],
  },
};

/** One frame of input, in football's words. */
export interface FootballInput {
  moveX: number;
  moveY: number;
  sprint: boolean;
  /** Where the throw is pointed, as a direction from the passer. */
  aimX: number;
  aimY: number;
  throwPressed: boolean;
  throwAwayPressed: boolean;
  snapPressed: boolean;
  switchPressed: boolean;
  tacklePressed: boolean;
  timeoutPressed: boolean;
}

export const neutralFootballInput = (): FootballInput => ({
  moveX: 0, moveY: 0, sprint: false,
  aimX: 0, aimY: 0,
  throwPressed: false, throwAwayPressed: false, snapPressed: false,
  switchPressed: false, tacklePressed: false, timeoutPressed: false,
});

/**
 * A TAP ON A RECEIVER, handed down from the game screen.
 *
 * The screen knows where the men are drawn and the engine knows where they
 * stand, so the screen turns a tap into a DIRECTION and the engine turns the
 * direction back into a man. Neither of them has to know about the other's
 * coordinate system, and a tap that lands between two receivers resolves the
 * same way an aimed throw does rather than doing nothing.
 */
export interface FootballAim {
  x: number;
  y: number;
  /** True on the frame the tap went down. */
  fire: boolean;
}

export function footballInput(raw: RawInput, aim?: FootballAim | null): FootballInput {
  let aimX = 0;
  let aimY = 0;
  if (raw.held.has('aimLeft')) aimX -= 1;
  if (raw.held.has('aimRight')) aimX += 1;
  if (raw.held.has('aimDown')) aimY -= 1;
  if (raw.held.has('aimUp')) aimY += 1;

  /* A TAP BEATS THE KEYS. A player using a touch screen and a player using a
   * keyboard are never the same person, and if they are, the thing he just
   * pointed at is what he meant. */
  let fire = raw.pressed.has('throw');
  if (aim && (aim.x !== 0 || aim.y !== 0)) {
    aimX = aim.x;
    aimY = aim.y;
    if (aim.fire) fire = true;
  }

  return {
    moveX: raw.moveX,
    moveY: raw.moveY,
    sprint: raw.sprint,
    aimX,
    aimY,
    throwPressed: fire,
    throwAwayPressed: raw.pressed.has('throwAway'),
    snapPressed: raw.pressed.has('snap'),
    switchPressed: raw.pressed.has('switch'),
    tacklePressed: raw.pressed.has('tackle'),
    timeoutPressed: raw.pressed.has('timeout'),
  };
}
