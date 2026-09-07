import { load, save } from '../core/storage';
import type { DifficultyKey } from '../data/difficulty';
import type { GameLengthKey } from '../data/constants';

export interface Settings {
  difficulty: DifficultyKey;
  gameLength: GameLengthKey;
  sfxVolume: number;
  musicVolume: number;
  reducedMotion: boolean;
  showHints: boolean;
  seenTutorial: boolean;
  /** Show a highlight replay after each goal. */
  goalReplays: boolean;
  /** 'auto' picks touch controls on touch devices. */
  controls: 'auto' | 'touch' | 'keyboard';
}

const KEY = 'lsl.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  difficulty: 'varsity',
  gameLength: 'short',
  sfxVolume: 0.7,
  musicVolume: 0.3,
  reducedMotion: false,
  showHints: true,
  seenTutorial: false,
  goalReplays: true,
  controls: 'auto',
};

export function loadSettings(): Settings {
  const raw = load<Partial<Settings>>(KEY, {});
  return { ...DEFAULT_SETTINGS, ...raw };
}

export function saveSettings(s: Settings): void {
  save(KEY, s);
}
