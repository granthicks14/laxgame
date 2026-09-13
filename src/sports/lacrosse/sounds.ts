import type { SoundPack } from '../../audio/Audio';

/* ---------------------------------------------------------------------------
 * LACROSSE SOUND PACK
 * ---------------------------------------------------------------------------
 * A stick game: hard plastic on hard plastic, a ball that whips rather than
 * bounces, and a cage that rings when it is struck. Every sound is synthesised
 * from the engine's two primitives — see audio/Audio.ts.
 * ------------------------------------------------------------------------- */
export const LACROSSE_SOUNDS: SoundPack = {
  whistle: (a) => {
    a.tone(2100, 0.16, 'square', 0.09);
    a.tone(2650, 0.16, 'square', 0.06, undefined, 0.005);
  },
  /** The whip of a pass leaving a stick head. */
  pass: (a) => a.noise(0.1, 0.1, 1800, 1.4, 0, 700),
  /** Ball into mesh. */
  catch: (a) => {
    a.noise(0.06, 0.13, 900, 2.2);
    a.tone(240, 0.05, 'triangle', 0.07);
  },
  shot: (a, intensity) => {
    a.noise(0.16, 0.12 + intensity * 0.09, 2600, 1.2, 0, 500);
    a.tone(160 + intensity * 90, 0.1, 'sawtooth', 0.05, 70);
  },
  goal: (a) => {
    a.tone(523, 0.1, 'square', 0.12);
    a.tone(659, 0.1, 'square', 0.12, undefined, 0.09);
    a.tone(784, 0.16, 'square', 0.13, undefined, 0.18);
    a.tone(1047, 0.34, 'square', 0.12, undefined, 0.28);
    a.cheer(1.0, 1.8);
  },
  save: (a) => {
    a.noise(0.11, 0.2, 420, 1.1);
    a.tone(120, 0.14, 'sine', 0.12, 70);
    a.cheer(0.55, 1.1);
  },
  /** Stick on stick, or stick on gloves. */
  check: (a) => {
    a.noise(0.13, 0.22, 260, 0.9);
    a.tone(90, 0.16, 'sine', 0.14, 50);
  },
  /** The pipe. Every player in the game knows this sound. */
  post: (a) => {
    a.tone(880, 0.25, 'sine', 0.16, 620);
    a.tone(1320, 0.18, 'sine', 0.08);
  },
  buzzer: (a) => {
    a.tone(160, 0.7, 'square', 0.11);
    a.tone(161.5, 0.7, 'sawtooth', 0.06);
  },
};
