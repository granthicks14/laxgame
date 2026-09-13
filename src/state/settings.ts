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
  /**
   * PER-SPORT PREFERENCES, keyed by sport id.
   *
   * The settings above it are either genuinely shared — volume, motion, whether
   * the hint strip shows — or lacrosse's own, from before there was more than one
   * sport. Rather than widen `difficulty` into something that has to mean four
   * different ladders at once, each sport keeps its own bag and owns its shape.
   * A sport that has never been played has no entry, and asking for a missing
   * preference gets the fallback the sport passes in.
   */
  sports: Record<string, Record<string, string | number | boolean>>;
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
  sports: {},
};

export function loadSettings(): Settings {
  const raw = load<Partial<Settings>>(KEY, {});
  return { ...DEFAULT_SETTINGS, ...raw };
}

export function saveSettings(s: Settings): void {
  save(KEY, s);
}
