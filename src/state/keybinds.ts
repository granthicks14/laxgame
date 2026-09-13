/* ---------------------------------------------------------------------------
 * KEY BINDINGS
 * ---------------------------------------------------------------------------
 * One rebinding system for every sport in the hub.
 *
 * A sport does not get its own copy of this file. It declares a CONTROL SCHEME
 * — which actions it has, what they are called, what they default to, and which
 * of them appear as on-screen buttons — and everything here works off that
 * declaration: loading, saving, rebinding, conflict resolution, and the
 * rebinding UI in `keybindEditor`. Basketball's step-back and lacrosse's dodge
 * are rebound by the same code, and neither sport can reach the other's keys.
 *
 * Bindings are stored per action as a list of KeyboardEvent.code values, under a
 * key namespaced by sport. Two actions in the SAME sport may not share a code:
 * assigning one takes it from the other, and the loser keeps whatever it has
 * left (or gets its default back if that was its only key), so a scheme can
 * never end up with an unusable control.
 *
 * Five action ids are a shared convention rather than a sport's own invention,
 * because every sport in the hub has a player who moves and a way to pause:
 * moveUp, moveDown, moveLeft, moveRight, sprint and pause. `InputManager` reads
 * those directly. Everything else is the sport's business.
 * ------------------------------------------------------------------------- */

import { load, removeRaw, save } from '../core/storage';

/** Action ids shared by every sport, because every sport moves a player. */
export const MOVE_ACTIONS = ['moveUp', 'moveDown', 'moveLeft', 'moveRight'] as const;
export const SPRINT_ACTION = 'sprint';
export const PAUSE_ACTION = 'pause';

export interface ActionInfo {
  id: string;
  label: string;
  hint: string;
  /** Movement keys are shown as a group and cannot be left empty. */
  group: 'move' | 'action' | 'system';
}

/** Bindings for one sport: action id -> KeyboardEvent.code list. */
export type Keybinds = Record<string, string[]>;

/**
 * Everything the input layer and the rebinding UI need to know about one
 * sport's controls. Declared next to the sport, never here.
 */
export interface ControlScheme {
  /** Namespaces the stored bindings. */
  sport: string;
  actions: ActionInfo[];
  defaults: Keybinds;
  /**
   * Actions that appear as on-screen buttons on a touch device, in layout
   * order. The game screen decides where they sit; this decides which exist.
   */
  touch: string[];
  /**
   * Actions read as a HELD state with a release edge — a charged lacrosse shot,
   * a gathered jump shot — rather than a single press.
   */
  hold: string[];
  /**
   * A storage key from before bindings were namespaced. Read once, when the
   * sport has no bindings of its own yet, so an existing player keeps the keys
   * they chose.
   */
  legacyKey?: string;
}

const keyFor = (sport: string): string => `lsl.keybinds.${sport}.v2`;

/** Fills in anything missing or corrupt, so a bad save can never disable a control. */
export function normalizeKeybinds(
  scheme: ControlScheme, raw: Partial<Keybinds> | null | undefined,
): Keybinds {
  const out: Keybinds = {};
  for (const a of scheme.actions) {
    const list = raw?.[a.id];
    const clean = Array.isArray(list)
      ? list.filter((k): k is string => typeof k === 'string' && k.length > 0).slice(0, 3)
      : [];
    out[a.id] = clean.length ? clean : [...(scheme.defaults[a.id] ?? [])];
  }
  return out;
}

export function loadKeybinds(scheme: ControlScheme): Keybinds {
  const own = load<Partial<Keybinds> | null>(keyFor(scheme.sport), null);
  if (own) return normalizeKeybinds(scheme, own);
  // First run for this sport: adopt the pre-hub bindings if it had any, then
  // write them under the namespaced key and retire the old one.
  if (scheme.legacyKey) {
    const legacy = load<Partial<Keybinds> | null>(scheme.legacyKey, null);
    if (legacy) {
      const binds = normalizeKeybinds(scheme, legacy);
      saveKeybinds(scheme, binds);
      removeRaw(scheme.legacyKey);
      return binds;
    }
  }
  return normalizeKeybinds(scheme, null);
}

export function saveKeybinds(scheme: ControlScheme, b: Keybinds): void {
  save(keyFor(scheme.sport), b);
}

/** Which action in this scheme currently owns a key, if any. */
export function ownerOf(
  scheme: ControlScheme, binds: Keybinds, code: string, except?: string,
): string | null {
  for (const a of scheme.actions) {
    if (a.id === except) continue;
    if ((binds[a.id] ?? []).includes(code)) return a.id;
  }
  return null;
}

export interface RebindResult {
  binds: Keybinds;
  /** The action this key was taken from, if any. */
  stolenFrom: string | null;
}

/**
 * Assigns `code` to `action`, replacing the binding at `slot`. Any other action
 * holding that key loses it; if that leaves it with nothing, it falls back to
 * its default so no action is ever unbound.
 */
export function rebind(
  scheme: ControlScheme, binds: Keybinds, action: string, slot: number, code: string,
): RebindResult {
  const next: Keybinds = {};
  for (const a of scheme.actions) next[a.id] = [...(binds[a.id] ?? [])];

  const stolenFrom = ownerOf(scheme, next, code, action);
  if (stolenFrom) {
    next[stolenFrom] = next[stolenFrom].filter((k) => k !== code);
    if (!next[stolenFrom].length) {
      const fallback = (scheme.defaults[stolenFrom] ?? []).filter((k) => k !== code);
      next[stolenFrom] = fallback.length ? [fallback[0]] : [];
    }
  }

  const list = (next[action] ?? []).filter((k) => k !== code);
  if (slot < list.length) list[slot] = code;
  else list.push(code);
  next[action] = list.slice(0, 3);
  return { binds: next, stolenFrom };
}

export function clearBinding(
  scheme: ControlScheme, binds: Keybinds, action: string, slot: number,
): Keybinds {
  const next: Keybinds = {};
  for (const a of scheme.actions) next[a.id] = [...(binds[a.id] ?? [])];
  const list = (next[action] ?? []).filter((_, i) => i !== slot);
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
export function bindingText(binds: Keybinds, action: string): string {
  const keys = binds[action] ?? [];
  if (!keys.length) return 'Unbound';
  return keys.map(keyLabel).join(' / ');
}

/**
 * The scheme in force before any sport has loaded. The hub itself has no
 * gameplay controls — rebinding belongs inside a sport, where the actions being
 * bound actually exist — so this carries only what the shell needs and is never
 * offered to the player for editing.
 */
export const NEUTRAL_SCHEME: ControlScheme = {
  sport: 'hub',
  touch: [],
  hold: [],
  actions: [
    { id: 'moveUp', label: 'Move up', hint: '', group: 'move' },
    { id: 'moveDown', label: 'Move down', hint: '', group: 'move' },
    { id: 'moveLeft', label: 'Move left', hint: '', group: 'move' },
    { id: 'moveRight', label: 'Move right', hint: '', group: 'move' },
    { id: 'sprint', label: 'Sprint', hint: '', group: 'move' },
    { id: 'pause', label: 'Pause', hint: '', group: 'system' },
  ],
  defaults: {
    moveUp: ['KeyW', 'ArrowUp'],
    moveDown: ['KeyS', 'ArrowDown'],
    moveLeft: ['KeyA', 'ArrowLeft'],
    moveRight: ['KeyD', 'ArrowRight'],
    sprint: ['ShiftLeft', 'ShiftRight'],
    pause: ['Escape', 'KeyP'],
  },
};

/** Keys we refuse to bind: browser-level or reserved by the UI. */
export const UNBINDABLE = new Set(['F5', 'F11', 'F12', 'MetaLeft', 'MetaRight', 'ContextMenu']);
