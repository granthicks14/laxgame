import { Rng } from '../core/rng';

/** Cosmetic only. Weather never touches the simulation — a game should never be
 *  decided by an effect the player cannot see or influence. */
export type WeatherKind = 'clear' | 'overcast' | 'humid' | 'breezy';

export interface Weather {
  kind: WeatherKind;
  label: string;
  /** Full-screen tint applied after the world is drawn. */
  tint: string | null;
  alpha: number;
}

const TABLE: Record<WeatherKind, Weather> = {
  clear: { kind: 'clear', label: 'Clear', tint: null, alpha: 0 },
  overcast: { kind: 'overcast', label: 'Overcast', tint: '#8a97a8', alpha: 0.12 },
  humid: { kind: 'humid', label: 'Warm and humid', tint: '#ffb46b', alpha: 0.09 },
  breezy: { kind: 'breezy', label: 'Breezy', tint: '#a8c4d8', alpha: 0.07 },
};

/** Deterministic from the match seed so a replayed game looks the same. */
export function weatherFor(seed: number): Weather {
  const rng = new Rng(seed ^ 0x7a11ed);
  const roll = rng.next();
  if (roll < 0.5) return TABLE.clear;
  if (roll < 0.75) return TABLE.overcast;
  if (roll < 0.9) return TABLE.humid;
  return TABLE.breezy;
}
