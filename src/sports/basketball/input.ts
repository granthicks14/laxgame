import type { ControlScheme } from '../../state/keybinds';
import type { RawInput } from '../../input/Input';

/* ---------------------------------------------------------------------------
 * BASKETBALL CONTROLS
 * ---------------------------------------------------------------------------
 * Five actions, and every one of them does something different depending on
 * whether you have the ball. That is not a shortcut to keep the button count
 * down — it is how basketball is played. The same hand that passes on offence
 * reaches in on defence; the same hand that shoots goes up to block.
 *
 *   PASS / STEAL    with the ball, find a team-mate. Without it, reach in — and
 *                   a reach-in that misses gets you beaten, or called.
 *   SHOOT / BLOCK   with the ball, hold to gather and release in the window.
 *                   Without it, go up: at the ball for a block, at the rim for a
 *                   rebound.
 *   CROSSOVER       a hard change of direction that beats a man who is leaning,
 *                   or a step-back that buys the space to shoot over him.
 *   SCREEN          call a team-mate up to set one.
 *   SWITCH          take the defender nearest the ball.
 *
 * The left hand moves and sprints, the right hand acts — the same split lacrosse
 * uses, so a player who has learned one is not starting from nothing.
 * ------------------------------------------------------------------------- */

export const BASKETBALL_CONTROLS: ControlScheme = {
  sport: 'basketball',
  touch: ['pass', 'shoot', 'cross', 'switch', 'screen'],
  hold: ['shoot'],
  actions: [
    { id: 'moveUp', label: 'Move up', hint: 'Left hand', group: 'move' },
    { id: 'moveDown', label: 'Move down', hint: 'Left hand', group: 'move' },
    { id: 'moveLeft', label: 'Move left', hint: 'Left hand', group: 'move' },
    { id: 'moveRight', label: 'Move right', hint: 'Left hand', group: 'move' },
    { id: 'sprint', label: 'Sprint', hint: 'Hold to drive', group: 'move' },
    { id: 'pass', label: 'Pass / Steal', hint: 'Reach in when defending', group: 'action' },
    { id: 'shoot', label: 'Shoot / Block', hint: 'Hold to gather, release in the window', group: 'action' },
    { id: 'cross', label: 'Crossover', hint: 'Beat your man, or step back', group: 'action' },
    { id: 'screen', label: 'Call screen', hint: 'Bring a big man up to set one', group: 'action' },
    { id: 'switch', label: 'Switch player', hint: 'Take the man on the ball', group: 'action' },
    { id: 'pause', label: 'Pause', hint: 'Menu, controls and the box score', group: 'system' },
  ],
  defaults: {
    moveUp: ['KeyW', 'ArrowUp'],
    moveDown: ['KeyS', 'ArrowDown'],
    moveLeft: ['KeyA', 'ArrowLeft'],
    moveRight: ['KeyD', 'ArrowRight'],
    sprint: ['ShiftLeft', 'ShiftRight'],
    pass: ['KeyJ', 'Space'],
    shoot: ['KeyK', 'KeyF'],
    cross: ['KeyL', 'KeyE'],
    screen: ['KeyI'],
    switch: ['KeyO', 'Tab'],
    pause: ['Escape', 'KeyP'],
  },
};

/** One frame of input, in basketball's words. */
export interface HoopsInput {
  moveX: number;
  moveY: number;
  sprint: boolean;
  /** Pass on offence, reach in on defence. */
  passPressed: boolean;
  /** Held: gathering a shot, or going up. */
  shootHeld: boolean;
  shootReleased: boolean;
  crossPressed: boolean;
  screenPressed: boolean;
  switchPressed: boolean;
}

export const neutralHoopsInput = (): HoopsInput => ({
  moveX: 0, moveY: 0, sprint: false,
  passPressed: false, shootHeld: false, shootReleased: false,
  crossPressed: false, screenPressed: false, switchPressed: false,
});

export function hoopsInput(raw: RawInput): HoopsInput {
  return {
    moveX: raw.moveX,
    moveY: raw.moveY,
    sprint: raw.sprint,
    passPressed: raw.pressed.has('pass'),
    shootHeld: raw.held.has('shoot'),
    shootReleased: raw.released.has('shoot'),
    crossPressed: raw.pressed.has('cross'),
    screenPressed: raw.pressed.has('screen'),
    switchPressed: raw.pressed.has('switch'),
  };
}
