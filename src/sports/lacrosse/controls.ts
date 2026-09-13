import type { ControlScheme } from '../../state/keybinds';

/* ---------------------------------------------------------------------------
 * LACROSSE CONTROLS
 * ---------------------------------------------------------------------------
 * The old layout crowded every action onto the left hand: WASD to move, then
 * SPACE, E, F and TAB for pass, dodge, shoot and switch. You cannot hold a
 * direction and dodge with the same hand.
 *
 * The layout splits the keyboard the way an action game should: the left hand
 * lives on WASD and Shift, and every action sits under the right hand's home row
 * (J K L, with I and O above it). The pre-hub keys stay on as secondary
 * bindings so nobody's muscle memory breaks.
 * ------------------------------------------------------------------------- */

/** Lacrosse's own action ids, kept as a union so lacrosse code stays checked. */
export type LaxAction =
  | 'moveUp' | 'moveDown' | 'moveLeft' | 'moveRight'
  | 'sprint' | 'pass' | 'shoot' | 'dodge' | 'switch' | 'screen' | 'pause';

export const LACROSSE_CONTROLS: ControlScheme = {
  sport: 'lacrosse',
  // Bindings predate the hub and were stored unnamespaced.
  legacyKey: 'lsl.keybinds.v1',
  touch: ['pass', 'shoot', 'dodge', 'switch', 'screen'],
  hold: ['shoot'],
  actions: [
    { id: 'moveUp', label: 'Move up', hint: 'Left hand', group: 'move' },
    { id: 'moveDown', label: 'Move down', hint: 'Left hand', group: 'move' },
    { id: 'moveLeft', label: 'Move left', hint: 'Left hand', group: 'move' },
    { id: 'moveRight', label: 'Move right', hint: 'Left hand', group: 'move' },
    { id: 'sprint', label: 'Sprint', hint: 'Hold to run', group: 'move' },
    { id: 'pass', label: 'Pass / Check', hint: 'Also clamps the faceoff', group: 'action' },
    { id: 'shoot', label: 'Shoot', hint: 'Hold to charge, release to fire', group: 'action' },
    { id: 'dodge', label: 'Dodge', hint: 'Burst past your man', group: 'action' },
    { id: 'screen', label: 'Call screen', hint: 'Bring a team-mate over to set a pick', group: 'action' },
    { id: 'switch', label: 'Switch player', hint: 'Take the man closest to the play', group: 'action' },
    { id: 'pause', label: 'Pause', hint: 'Menu, controls and stats', group: 'system' },
  ],
  defaults: {
    moveUp: ['KeyW', 'ArrowUp'],
    moveDown: ['KeyS', 'ArrowDown'],
    moveLeft: ['KeyA', 'ArrowLeft'],
    moveRight: ['KeyD', 'ArrowRight'],
    sprint: ['ShiftLeft', 'ShiftRight'],
    pass: ['KeyJ', 'Space'],
    shoot: ['KeyK', 'KeyF'],
    dodge: ['KeyL', 'KeyE'],
    screen: ['KeyI'],
    switch: ['KeyO', 'Tab'],
    pause: ['Escape', 'KeyP'],
  },
};
