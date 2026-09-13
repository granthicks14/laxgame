/* ---------------------------------------------------------------------------
 * PLAYER PORTRAITS
 * ---------------------------------------------------------------------------
 * Every player in the game gets a face, and every one of them is DRAWN — a few
 * dozen rectangles on a small canvas, in the same chunky pixel language as the
 * field sprites and the team emblems. There is no photograph anywhere in this
 * game and there never will be: these are real teenagers and young men on the
 * public rosters, and the honest way to picture them is not to.
 *
 * The look is deterministic from the player's ID. The same player has the same
 * face in the roster list, on his profile, in a scouting report and in the
 * record book ten seasons later — and two players are never twins unless the
 * hash says so, because every feature is drawn from its own stream.
 *
 * It is cheap on purpose. A portrait is flat fills on a 48x48 buffer with no
 * gradients, no blurs and no images to load, so a roster screen can paint
 * twenty-eight of them on a phone without dropping a frame. Results are cached
 * by their own key, so scrolling a list repaints nothing.
 * ------------------------------------------------------------------------- */

import { Rng } from '../core/rng';
import type { Position } from '../data/constants';

/** The buffer every portrait is drawn at, before being scaled up. */
export const PORTRAIT_SIZE = 48;

export interface PortraitTeam {
  primary: string;
  secondary: string;
  trim: string;
}

export interface PortraitOptions {
  /** Stable identity. The same id always produces the same face. */
  id: string;
  pos: Position;
  /** Worn on the chest. Omitted where a screen has no number to show. */
  number?: number;
  team: PortraitTeam;
  /** Draw the helmet. Off for a bare head shot on a profile card. */
  helmet?: boolean;
}

/* ------------------------------------------------------------- the palette */

/**
 * Skin tones, spread deliberately wide. A lacrosse roster is not one colour and
 * a generator that quietly produces one is worse than no generator at all.
 */
const SKIN = [
  ['#f0c9a4', '#d9a87d'], ['#e8b58c', '#cf9668'], ['#d69b6d', '#b97c4f'],
  ['#c08552', '#a26a3c'], ['#9c6438', '#7d4e29'], ['#7a4a28', '#5f381d'],
  ['#5c3620', '#452716'], ['#f6ddc0', '#e0bd9a'],
];

const HAIR = [
  '#1b1512', '#2e2119', '#4a2f1c', '#6b4425', '#8a5a2b', '#b07d3a',
  '#d4a441', '#e6c86a', '#8c3b1e', '#a8452a', '#6d6a67', '#33302e',
];

/** Hair shapes. 'bald' and 'buzz' are as legitimate as the rest. */
type HairStyle = 'short' | 'buzz' | 'mop' | 'curls' | 'long' | 'flow' | 'bald' | 'topknot';
const HAIR_STYLES: HairStyle[] = ['short', 'buzz', 'mop', 'curls', 'long', 'flow', 'bald', 'topknot'];

type FaceShape = 'oval' | 'square' | 'round' | 'long';
const FACES: FaceShape[] = ['oval', 'square', 'round', 'long'];

type Brow = 'flat' | 'angled' | 'raised';
const BROWS: Brow[] = ['flat', 'angled', 'raised'];

/* ------------------------------------------------------------ the features */

export interface PortraitFeatures {
  skin: number;
  hair: string;
  style: HairStyle;
  face: FaceShape;
  brow: Brow;
  eyeGap: number;
  /** 0 = none, 1 = stubble, 2 = moustache, 3 = full beard. */
  facial: number;
  headband: boolean;
  /** Eye black under the eyes, which a lot of players wear. */
  eyeBlack: boolean;
  mouth: number;
}

/**
 * Reads a face out of an id. Each feature takes its own draw, so changing the
 * number of hair styles does not shift everybody's skin tone — a save written
 * today keeps the same faces after a future edit to this file.
 */
export function featuresFor(id: string): PortraitFeatures {
  const pick = <T>(salt: string, list: T[]): T =>
    list[Rng.hash(`${id}:${salt}`) % list.length];
  const roll = (salt: string): number => (Rng.hash(`${id}:${salt}`) % 1000) / 1000;

  const style = pick('hair', HAIR_STYLES);
  return {
    skin: Rng.hash(`${id}:skin`) % SKIN.length,
    hair: pick('haircol', HAIR),
    style,
    face: pick('face', FACES),
    brow: pick('brow', BROWS),
    eyeGap: 9 + Math.floor(roll('gap') * 3),
    facial: roll('facial') < 0.52 ? 0 : roll('facial') < 0.74 ? 1 : roll('facial') < 0.9 ? 2 : 3,
    headband: roll('band') < 0.22,
    eyeBlack: roll('black') < 0.34,
    mouth: Math.floor(roll('mouth') * 3),
  };
}

/* -------------------------------------------------------------- the drawing */

const px = (
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string,
): void => {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

/** Face outline widths at a few heights, per shape. */
function faceWidth(shape: FaceShape, t: number): number {
  // t runs 0 (top of the skull) to 1 (chin).
  switch (shape) {
    case 'square': return 22 - t * 2;
    case 'round': return 22 - Math.pow(t, 2) * 6;
    case 'long': return 19 - t * 3;
    default: return 21 - Math.pow(t, 1.6) * 7;
  }
}

function drawHair(
  ctx: CanvasRenderingContext2D, f: PortraitFeatures, top: number, cx: number,
): void {
  const c = f.hair;
  const dark = shade(c, -0.25);
  switch (f.style) {
    case 'bald':
      return;
    case 'buzz':
      px(ctx, cx - 11, top, 22, 4, c);
      px(ctx, cx - 12, top + 2, 24, 3, dark);
      return;
    case 'short':
      px(ctx, cx - 11, top - 1, 22, 6, c);
      px(ctx, cx - 12, top + 3, 3, 5, dark);
      px(ctx, cx + 9, top + 3, 3, 5, dark);
      return;
    case 'mop':
      px(ctx, cx - 12, top - 2, 24, 8, c);
      px(ctx, cx - 13, top + 4, 4, 7, c);
      px(ctx, cx + 9, top + 4, 4, 7, c);
      px(ctx, cx - 12, top - 2, 24, 2, shade(c, 0.18));
      return;
    case 'curls':
      for (let i = 0; i < 7; i++) {
        px(ctx, cx - 13 + i * 4, top - 3, 5, 5, i % 2 ? c : shade(c, 0.14));
      }
      px(ctx, cx - 13, top + 1, 26, 5, c);
      px(ctx, cx - 14, top + 4, 4, 6, c);
      px(ctx, cx + 10, top + 4, 4, 6, c);
      return;
    case 'long':
      px(ctx, cx - 12, top - 2, 24, 7, c);
      px(ctx, cx - 14, top + 2, 4, 16, c);
      px(ctx, cx + 10, top + 2, 4, 16, c);
      px(ctx, cx - 14, top + 12, 4, 6, dark);
      px(ctx, cx + 10, top + 12, 4, 6, dark);
      return;
    case 'flow':
      // The lacrosse haircut. Long at the back, tucked under the helmet line.
      px(ctx, cx - 12, top - 1, 24, 6, c);
      px(ctx, cx - 14, top + 4, 3, 14, c);
      px(ctx, cx + 11, top + 4, 3, 14, c);
      px(ctx, cx - 13, top + 15, 26, 4, dark);
      return;
    case 'topknot':
      px(ctx, cx - 11, top, 22, 5, c);
      px(ctx, cx - 3, top - 5, 6, 5, c);
      px(ctx, cx - 12, top + 3, 24, 3, dark);
      return;
  }
}

/** Lightens or darkens a hex colour without pulling in a colour library. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (v: number) => Math.max(0, Math.min(255, Math.round(
    amount >= 0 ? v + (255 - v) * amount : v * (1 + amount),
  )));
  return `#${((mix(r) << 16) | (mix(g) << 8) | mix(b)).toString(16).padStart(6, '0')}`;
}

/**
 * Paints one portrait into a 48x48 context. Everything is a rectangle, which
 * is what makes it read as a sprite rather than a cartoon.
 */
export function drawPortrait(ctx: CanvasRenderingContext2D, o: PortraitOptions): void {
  const f = featuresFor(o.id);
  const S = PORTRAIT_SIZE;
  const cx = S / 2;
  const [skin, skinShade] = SKIN[f.skin];
  const helmet = o.helmet ?? true;

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, S, S);

  // Background: the team's own colour, darkened so a face reads against it.
  px(ctx, 0, 0, S, S, shade(o.team.primary, -0.55));
  px(ctx, 0, S - 14, S, 14, shade(o.team.primary, -0.4));

  // Shoulders and jersey.
  px(ctx, cx - 18, S - 12, 36, 12, o.team.primary);
  px(ctx, cx - 18, S - 12, 36, 2, shade(o.team.primary, 0.2));
  px(ctx, cx - 6, S - 12, 12, 12, o.team.secondary);
  // Collar.
  px(ctx, cx - 5, S - 13, 10, 3, shade(o.team.secondary, -0.2));

  // Neck.
  px(ctx, cx - 5, S - 18, 10, 7, skinShade);

  const top = 8;
  const faceH = 24;

  // Face, built as horizontal bands so the shape reads at this size.
  for (let i = 0; i < faceH; i++) {
    const t = i / (faceH - 1);
    const w = faceWidth(f.face, t);
    px(ctx, cx - w / 2, top + i, w, 1, i > faceH - 4 ? skinShade : skin);
  }
  // Ears.
  px(ctx, cx - 12, top + 11, 2, 5, skinShade);
  px(ctx, cx + 10, top + 11, 2, 5, skinShade);

  // Hair goes on FIRST either way. Under a helmet only the flow at the sides
  // and back shows, which is exactly how it looks on a field, and it is what
  // stops every helmeted player reading as the same anonymous mask.
  drawHair(ctx, f, top, cx);

  // Brows.
  const browY = top + 9;
  const bw = 5;
  const browC = shade(f.style === 'bald' ? '#3a2c22' : f.hair, -0.2);
  for (const side of [-1, 1]) {
    const x = cx + side * (f.eyeGap / 2) - (side < 0 ? bw : 0);
    const drop = f.brow === 'angled' ? (side < 0 ? 0 : 1) : f.brow === 'raised' ? -1 : 0;
    px(ctx, x, browY + drop, bw, 2, browC);
  }

  // Eyes.
  const eyeY = top + 13;
  for (const side of [-1, 1]) {
    const x = cx + side * (f.eyeGap / 2) - (side < 0 ? 4 : 0);
    px(ctx, x, eyeY, 4, 3, '#f4f1ea');
    px(ctx, x + (side < 0 ? 1 : 1), eyeY + 1, 2, 2, '#221a14');
    if (f.eyeBlack) px(ctx, x, eyeY + 3, 4, 2, '#16120f');
  }

  // Nose and mouth.
  px(ctx, cx - 1, top + 16, 2, 3, skinShade);
  const mouthY = top + 21;
  if (f.mouth === 0) px(ctx, cx - 3, mouthY, 6, 1, shade(skinShade, -0.3));
  else if (f.mouth === 1) px(ctx, cx - 4, mouthY, 8, 2, shade(skinShade, -0.35));
  else { px(ctx, cx - 3, mouthY, 6, 2, shade(skinShade, -0.4)); px(ctx, cx - 2, mouthY + 1, 4, 1, '#e8ded4'); }

  // Facial hair.
  if (f.facial === 1) {
    px(ctx, cx - 7, top + 19, 14, 5, `${shade(f.hair, -0.1)}55`);
  } else if (f.facial === 2) {
    px(ctx, cx - 4, top + 19, 8, 2, shade(f.hair, -0.15));
  } else if (f.facial === 3) {
    px(ctx, cx - 8, top + 18, 16, 6, shade(f.hair, -0.12));
    px(ctx, cx - 3, top + 20, 6, 2, shade(skinShade, -0.45));
  }

  if (f.headband && !helmet) px(ctx, cx - 12, top + 5, 24, 3, o.team.secondary);

  if (helmet) {
    const shell = o.team.primary;
    const bar = o.team.trim;
    // A SHALLOW shell. The first version came down past the eyes and turned
    // every helmeted player into the same mask — the whole point of generating
    // a face is lost if you then cover it up.
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const w = faceWidth(f.face, t * 0.2) + 4;
      px(ctx, cx - w / 2, top - 4 + i, w, 1, i < 2 ? shade(shell, 0.22) : shell);
    }
    px(ctx, cx - 2, top - 4, 4, 9, o.team.secondary);
    px(ctx, cx - 13, top + 5, 3, 7, shade(shell, -0.2));
    px(ctx, cx + 10, top + 5, 3, 7, shade(shell, -0.2));
    // Two thin bars, not a grid: enough to read as a lacrosse cage with the
    // face still legible behind it.
    px(ctx, cx - 9, top + 19, 18, 1, bar);
    px(ctx, cx - 8, top + 23, 16, 1, bar);
    px(ctx, cx - 9, top + 13, 1, 11, bar);
    px(ctx, cx + 8, top + 13, 1, 11, bar);
  }

  // Jersey number on the chest, small and legible.
  if (o.number !== undefined) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.font = '700 9px "Arial Narrow", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = o.team.trim;
    ctx.fillText(String(o.number), cx, S - 6);
    ctx.restore();
  }
}

/* ------------------------------------------------------------- the cache */

const cache = new Map<string, HTMLCanvasElement>();
/** Plenty for a full roster screen plus a scouting board, and bounded. */
const CACHE_LIMIT = 160;

function keyOf(o: PortraitOptions): string {
  return `${o.id}|${o.number ?? '-'}|${o.team.primary}|${o.team.secondary}|${o.team.trim}|${o.helmet ? 'h' : 'b'}`;
}

/**
 * A portrait as a canvas, drawn once and reused. Callers get the SAME element
 * back for the same player, so a list must clone it rather than adopt it —
 * `portraitEl` below does that and is what UI code should use.
 */
export function portraitCanvas(o: PortraitOptions): HTMLCanvasElement {
  const key = keyOf(o);
  const hit = cache.get(key);
  if (hit) return hit;

  const c = document.createElement('canvas');
  c.width = PORTRAIT_SIZE;
  c.height = PORTRAIT_SIZE;
  const ctx = c.getContext('2d');
  if (ctx) drawPortrait(ctx, o);

  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, c);
  return c;
}

/**
 * A portrait ready to drop into the DOM at a chosen size. Nearest-neighbour
 * scaling keeps it a sprite rather than a blur.
 */
export function portraitEl(o: PortraitOptions, size = 48): HTMLElement {
  const src = portraitCanvas(o);
  const el = document.createElement('canvas');
  el.width = PORTRAIT_SIZE;
  el.height = PORTRAIT_SIZE;
  el.className = 'portrait';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  const ctx = el.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0);
  }
  return el;
}
