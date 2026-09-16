import type { SoundPack } from '../../audio/Audio';

/* ---------------------------------------------------------------------------
 * FOOTBALL SOUND PACK
 * ---------------------------------------------------------------------------
 * An outdoor game played in pads, and everything about the noise follows from
 * that. Lacrosse whips and basketball squeaks on varnish; football THUDS — it is
 * the only sport in this hub where the characteristic sound is two bodies
 * meeting, and the collision gets more care than anything else here.
 *
 * The other rule is that a football crowd is always there. Indoors the crowd is
 * an event; outdoors it is a floor under everything, so several of these are
 * built to sit on top of a constant wash rather than to be heard in silence.
 * ------------------------------------------------------------------------- */
export const FOOTBALL_SOUNDS: SoundPack = {
  whistle: (a) => {
    a.tone(2300, 0.16, 'square', 0.08);
    a.tone(2950, 0.16, 'square', 0.045, undefined, 0.005);
  },
  /** The snap: leather into hands, and the line moving at the same instant. */
  dribble: (a) => {
    a.noise(0.05, 0.08, 1800, 2.2);
    a.tone(120, 0.06, 'triangle', 0.07, 80);
  },
  /** A pass leaving the hand — air, and very little else. */
  pass: (a) => a.noise(0.09, 0.07, 2600, 1.5, 0, 1200),
  catch: (a) => {
    a.noise(0.06, 0.12, 900, 2.6);
    a.tone(180, 0.05, 'triangle', 0.07);
  },
  /** A kick. The hardest, cleanest contact in the sport. */
  shot: (a, intensity) => {
    a.tone(90, 0.12, 'triangle', 0.14 + intensity * 0.05, 45);
    a.noise(0.07, 0.1 + intensity * 0.05, 2200, 2.2);
  },
  /**
   * THE HIT.
   *
   * Low body, mid pads, high air — three layers, because a tackle is not one
   * sound. The low end is what makes it feel like weight rather than like a
   * click, and it is the single most important noise in the game.
   */
  rim: (a) => {
    a.tone(74, 0.16, 'triangle', 0.15, 38);
    a.noise(0.09, 0.13, 900, 2.8);
    a.noise(0.04, 0.06, 3400, 2.2, 0, 1600);
  },
  /** The ball hitting the turf: dead, short, no ring at all. */
  board: (a) => {
    a.tone(150, 0.09, 'sine', 0.09, 90);
    a.noise(0.05, 0.05, 700, 2);
  },
  /** Through the uprights, and the horn that follows it. */
  goal: (a) => {
    a.tone(392, 0.2, 'square', 0.07);
    a.tone(523, 0.26, 'square', 0.07, undefined, 0.09);
    a.tone(784, 0.4, 'square', 0.06, undefined, 0.2);
  },
  /** A touchdown: the building, all at once. */
  crowd: (a, intensity) => {
    a.noise(0.9, 0.05 + intensity * 0.08, 700, 0.8);
    a.noise(0.6, 0.03 + intensity * 0.05, 2000, 1.1, 0.1);
  },
  /** End of a quarter. */
  buzzer: (a) => {
    a.tone(196, 0.55, 'sawtooth', 0.1);
    a.tone(262, 0.55, 'sawtooth', 0.07, undefined, 0.02);
  },
  /** A menu press. */
  click: (a) => a.tone(660, 0.04, 'square', 0.05),
};
