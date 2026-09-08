/* ---------------------------------------------------------------------------
 * KEY BINDINGS
 * ---------------------------------------------------------------------------
 * The old layout crowded every action onto the left hand: WASD to move, then
 * SPACE, E, F and TAB for pass, dodge, shoot and switch. You cannot hold a
 * direction and dodge with the same hand.
 *
 * The default now splits the keyboard the way an action game should: the left
 * hand lives on WASD and Shift, and every action sits under the right hand's
 * home row (J K L, with I and O above it). The old keys stay on as secondary
 * bindings so nobody's muscle memory breaks.
 *
 * Bindings are stored per action as a list of KeyboardEvent.code values. Two
 * actions may not share a code: assigning one takes it from the other, and the
 * loser keeps whatever it has left (or gets its default back if that was its
 * only key), so the game can never end up with an unusable control.
 * ------------------------------------------------------------------------- */

import { load, save } from '../core/storage';

export type ActionId =
  | 'moveUp' | 'moveDown' | 'moveLeft' | 'moveRight'
  | 'sprint' | 'pass' | 'shoot' | 'dodge' | 'switch' | 'screen' | 'pause';

export interface ActionInfo {
  id: ActionId;
  label: string;
  hint: string;
  /** Movement keys are shown as a group and cannot be left empty. */
  group: 'move' | 'action' | 'system';
}

export const ACTIONS: ActionInfo[] = [
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
];

export type Keybinds = Record<ActionId, string[]>;

export const DEFAULT_KEYBINDS: Keybinds = {
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
};

const KEY = 'lsl.keybinds.v1';

const ACTION_IDS = ACTIONS.map((a) => a.id);

/** Fills in anything missing or corrupt, so a bad save can never disable a control. */
export function normalizeKeybinds(raw: Partial<Keybinds> | null | undefined): Keybinds {
  const out = {} as Keybinds;
  for (const id of ACTION_IDS) {
    const list = raw?.[id];
    const clean = Array.isArray(list)
      ? list.filter((k): k is string => typeof k === 'string' && k.length > 0).slice(0, 3)
      : [];
    out[id] = clean.length ? clean : [...DEFAULT_KEYBINDS[id]];
  }
  return out;
}

export function loadKeybinds(): Keybinds {
  return normalizeKeybinds(load<Partial<Keybinds>>(KEY, {}));
}

export function saveKeybinds(b: Keybinds): void {
  save(KEY, b);
}

/** Which action currently owns a key, if any. */
export function ownerOf(binds: Keybinds, code: string, except?: ActionId): ActionId | null {
  for (const id of ACTION_IDS) {
    if (id === except) continue;
    if (binds[id].includes(code)) return id;
  }
  return null;
}

export interface RebindResult {
  binds: Keybinds;
  /** The action this key was taken from, if any. */
  stolenFrom: ActionId | null;
}

/**
 * Assigns `code` to `action`, replacing the binding at `slot`. Any other action
 * holding that key loses it; if that leaves it with nothing, it falls back to
 * its default so no action is ever unbound.
 */
export function rebind(binds: Keybinds, action: ActionId, slot: number, code: string): RebindResult {
  const next: Keybinds = { ...binds };
  for (const id of ACTION_IDS) next[id] = [...binds[id]];

  const stolenFrom = ownerOf(next, code, action);
  if (stolenFrom) {
    next[stolenFrom] = next[stolenFrom].filter((k) => k !== code);
    if (!next[stolenFrom].length) {
      const fallback = DEFAULT_KEYBINDS[stolenFrom].filter((k) => k !== code);
      next[stolenFrom] = fallback.length ? [fallback[0]] : [];
    }
  }

  const list = next[action].filter((k) => k !== code);
  if (slot < list.length) list[slot] = code;
  else list.push(code);
  next[action] = list.slice(0, 3);
  return { binds: next, stolenFrom };
}

export function clearBinding(binds: Keybinds, action: ActionId, slot: number): Keybinds {
  const next: Keybinds = { ...binds };
  for (const id of ACTION_IDS) next[id] = [...binds[id]];
  const list = next[action].filter((_, i) => i !== slot);
  // An action with no key is a dead control, so the last one cannot be removed.
  next[action] = list.length ? list : next[action];
  return next;
}

/** Human-readable name for a KeyboardEvent.code. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  const named: Record<string, string> = {
    Space: 'Space',
    Escape: 'Esc',
    Tab: 'Tab',
    Enter: 'Enter',
    ShiftLeft: 'L Shift',
    ShiftRight: 'R Shift',
    ControlLeft: 'L Ctrl',
    ControlRight: 'R Ctrl',
    AltLeft: 'L Alt',
    AltRight: 'R Alt',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
  };
  return named[code] ?? code;
}

/** "J or Space" — what the pause menu and hint strip show. */
export function bindingText(binds: Keybinds, action: ActionId): string {
  const keys = binds[action];
  if (!keys.length) return 'Unbound';
  return keys.map(keyLabel).join(' / ');
}

/** Keys we refuse to bind: browser-level or reserved by the UI. */
export const UNBINDABLE = new Set(['F5', 'F11', 'F12', 'MetaLeft', 'MetaRight', 'ContextMenu']);
