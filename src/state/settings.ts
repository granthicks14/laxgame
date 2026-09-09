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
  /** The recruiting walkthrough opens once, then lives behind a button. */
  seenRecruiting: boolean;
  /** The Challenge difficulty offered first next time. Not the career's own —
   *  that is fixed on the save the moment the career starts. */
  challengeTier: string;
  /** Show a highlight replay after each goal. */
  goalReplays: boolean;
  /** 'auto' picks touch controls on touch devices. */
  controls: 'auto' | 'touch' | 'keyboard';
  /** Show how a simulated result was arrived at. Off by default: it is a tool
   *  for working out why a scoreline looks wrong, not part of playing. */
  simDetails: boolean;
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
  seenRecruiting: false,
  challengeTier: 'standard',
  goalReplays: true,
  controls: 'auto',
  simDetails: false,
};

export function loadSettings(): Settings {
  const raw = load<Partial<Settings>>(KEY, {});
  return { ...DEFAULT_SETTINGS, ...raw };
}

export function saveSettings(s: Settings): void {
  save(KEY, s);
}
