import { FIELD, attackingGoal, defendingGoal, attackDir, type Side } from '../data/constants';
import type { SlotKey } from './types';

export interface SlotOffset {
  /** Yards toward midfield from the reference goal. Negative = behind the goal. */
  front: number;
  /** Lateral yards from the center of the field. */
  lat: number;
}

/** 2-3-1 offensive set, measured from the goal being attacked. */
export const OFFENSE_SLOTS: Record<SlotKey, SlotOffset> = {
  G: { front: 0, lat: 0 },
  D1: { front: 44, lat: -13 },
  D2: { front: 47, lat: 0 },
  D3: { front: 44, lat: 13 },
  M1: { front: 13, lat: -12 },
  M2: { front: 18, lat: 0 },
  M3: { front: 13, lat: 12 },
  A1: { front: -6.5, lat: 0 },
  A2: { front: 3.5, lat: -9 },
  A3: { front: 3.5, lat: 9 },
};

/** Matching man-defense set, measured from the goal being defended. */
export const DEFENSE_SLOTS: Record<SlotKey, SlotOffset> = {
  G: { front: 0, lat: 0 },
  D1: { front: 3.5, lat: -9 },
  D2: { front: 3.5, lat: 9 },
  D3: { front: -5.5, lat: 0 },
  M1: { front: 13, lat: -12 },
  M2: { front: 18, lat: 0 },
  M3: { front: 13, lat: 12 },
  A1: { front: 46, lat: 0 },
  A2: { front: 43, lat: -13 },
  A3: { front: 43, lat: 13 },
};

/** Man-marking pairs: defensive slot -> the opposing offensive slot it covers. */
export const MARKING: Partial<Record<SlotKey, SlotKey>> = {
  D1: 'A2', D2: 'A3', D3: 'A1', M1: 'M3', M2: 'M2', M3: 'M1',
};

export function slotWorld(side: Side, slot: SlotKey, offense: boolean): { x: number; y: number } {
  const goal = offense ? attackingGoal(side) : defendingGoal(side);
  const dir = attackDir(side);
  const o = offense ? OFFENSE_SLOTS[slot] : DEFENSE_SLOTS[slot];
  return { x: goal.x - dir * o.front, y: FIELD.centerY + o.lat };
}

/** Starting spots for a faceoff. */
export function faceoffWorld(side: Side, slot: SlotKey): { x: number; y: number } {
  const dir = attackDir(side);
  const own = defendingGoal(side);
  const cx = FIELD.centerX;
  switch (slot) {
    case 'G':
      return { x: own.x + dir * 2.2, y: FIELD.centerY };
    case 'D1':
      return { x: own.x + dir * 12, y: 18 };
    case 'D2':
      return { x: own.x + dir * 15, y: 30 };
    case 'D3':
      return { x: own.x + dir * 12, y: 42 };
    case 'M1':
      return { x: cx - dir * 0.6, y: FIELD.centerY - 20 };
    case 'M2':
      // The faceoff man.
      return { x: cx - dir * 0.55, y: FIELD.centerY };
    case 'M3':
      return { x: cx - dir * 0.6, y: FIELD.centerY + 20 };
    case 'A1':
      return { x: own.x + dir * 63, y: 30 };
    case 'A2':
      return { x: own.x + dir * 60, y: 20 };
    case 'A3':
      return { x: own.x + dir * 60, y: 40 };
  }
}

export const FIELD_SLOTS: SlotKey[] = ['G', 'D1', 'D2', 'D3', 'M1', 'M2', 'M3', 'A1', 'A2', 'A3'];
