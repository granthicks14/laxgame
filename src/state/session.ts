import { load, save } from '../core/storage';
import type { DifficultyKey } from '../data/difficulty';
import type { GameLengthKey } from '../data/constants';

export interface QuickPrefs {
  teamId: string;
  opponentId: string;
  home: boolean;
  difficulty: DifficultyKey;
  gameLength: GameLengthKey;
}

const KEY = 'lsl.quick.v1';

const DEFAULTS: QuickPrefs = {
  teamId: 'highland-park',
  opponentId: 'jesuit-dallas',
  home: true,
  difficulty: 'varsity',
  gameLength: 'short',
};

export const quickPrefs: QuickPrefs = { ...DEFAULTS, ...load<Partial<QuickPrefs>>(KEY, {}) };

export function saveQuickPrefs(): void {
  save(KEY, quickPrefs);
}
