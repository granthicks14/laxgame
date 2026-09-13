import type { SoundPack } from '../../audio/Audio';

/* ---------------------------------------------------------------------------
 * BASKETBALL SOUND PACK
 * ---------------------------------------------------------------------------
 * An indoor game on a wooden floor: everything is close, bright and reflective.
 * A lacrosse ball whips; a basketball thuds and squeaks. The rim is the sound
 * the whole sport is organised around — a player can tell from the ring alone
 * whether it is going in — so it gets two recipes: iron that rattles and a net
 * that does not.
 * ------------------------------------------------------------------------- */
export const BASKETBALL_SOUNDS: SoundPack = {
  whistle: (a) => {
    a.tone(2450, 0.13, 'square', 0.085);
    a.tone(3100, 0.13, 'square', 0.05, undefined, 0.004);
  },
  /** The ball off the boards — the metronome of a basketball game. */
  dribble: (a) => {
    a.tone(160, 0.07, 'sine', 0.09, 95);
    a.noise(0.04, 0.05, 1400, 1.8);
  },
  /** A chest pass leaving the hands. */
  pass: (a) => a.noise(0.07, 0.09, 2200, 1.6, 0, 900),
  catch: (a) => {
    a.noise(0.05, 0.11, 1100, 2.4);
    a.tone(220, 0.04, 'triangle', 0.06);
  },
  /** The shot itself is nearly silent; the squeak of the gather is not. */
  shot: (a, intensity) => {
    a.noise(0.09, 0.05 + intensity * 0.04, 3200, 2.6, 0, 1800);
  },
  /** Iron. Hard, bright and ringing, and the reason a rebound is contested. */
  rim: (a) => {
    a.tone(1180, 0.22, 'triangle', 0.1, 760);
    a.tone(1790, 0.14, 'sine', 0.05);
    a.noise(0.06, 0.05, 3600, 3);
  },
  /** Glass. Duller and shorter than the ring. */
  board: (a) => {
    a.tone(420, 0.14, 'sine', 0.1, 280);
    a.noise(0.05, 0.06, 900, 1.4);
  },
  /** All net. The sound a shooter is listening for. */
  swish: (a) => {
    a.noise(0.13, 0.1, 5200, 1.1, 0, 2600);
    a.cheer(0.8, 1.3);
  },
  bucket: (a, intensity) => {
    a.tone(587, 0.08, 'square', 0.09);
    a.tone(784, 0.1, 'square', 0.09, undefined, 0.07);
    a.cheer(0.55 + intensity * 0.45, 1.5);
  },
  /** A block: the meeting of two hands and a ball, and the crowd after it. */
  block: (a) => {
    a.noise(0.1, 0.2, 700, 1.2);
    a.tone(150, 0.12, 'sine', 0.11, 80);
    a.cheer(0.9, 1.4);
  },
  steal: (a) => {
    a.noise(0.07, 0.13, 1800, 2.2, 0, 3200);
    a.cheer(0.45, 0.9);
  },
  rebound: (a) => a.noise(0.06, 0.1, 800, 1.6),
  /** Sneakers on hardwood: the sound nothing else in sport makes. */
  squeak: (a, intensity) => {
    a.noise(0.09, 0.05 + intensity * 0.05, 2600, 7, 0, 4200);
  },
  buzzer: (a) => {
    a.tone(150, 0.75, 'square', 0.1);
    a.tone(151.5, 0.75, 'sawtooth', 0.06);
  },
};
