import { Rng } from '../../core/rng';
import { clamp } from '../../core/math';
import { drawEmblem, pixelText } from '../../render/emblem';
import type { Emblem, EmblemMotif, EmblemShape } from '../../data/emblems';
import { COURT } from './court';
import type { Jersey } from './render';

/* ---------------------------------------------------------------------------
 * THE BUILDING
 * ---------------------------------------------------------------------------
 * A basketball court is not a field. A field is outdoors and the world around it
 * is scenery; an arena is a ROOM, and the room is most of why the sport looks
 * the way it does on television — a bright floor in a dark bowl, with three
 * thousand people leaning over it.
 *
 * Before this there was a brown rectangle and then nothing, and "nothing" is what
 * made the game read as a prototype however good the floor markings were. The
 * fix is not more detail on the hardwood. It is the building: raked stands on all
 * four sides, a crowd in the home team's colours, a signage band at the front of
 * the lower bowl, the scorer's table and two benches, and darkness above.
 *
 * RETRO IS NOT AN EXCUSE. Everything here is drawn with flat fills and hard
 * edges at buffer resolution, the way a sixteen-bit sports game would, and the
 * quality comes from the same place it did then: a considered palette, real
 * depth ordering, and light that comes from somewhere. There is no blur, no
 * gradient mesh, and no texture that is not a run of rectangles.
 *
 * IT IS ALL PRE-RENDERED. The building never changes during a game, so it is
 * painted once per zoom level into the same layer as the floor and blitted. The
 * only per-frame cost in the whole room is the camera flashes.
 * ------------------------------------------------------------------------- */

/**
 * HOW FAR TO TURN ANYTHING THAT HAS TO BE READ.
 *
 * The basketball camera stands the court UPRIGHT — unconditionally, on every
 * device, because a 94ft-by-50ft floor laid down does not fit any screen worth
 * playing on. It does that by rotating the whole layer by a quarter turn as it
 * blits, which is right for hardwood and lines and wrong for everything with a
 * top and a bottom: a club badge and a painted wordmark both came out lying on
 * their side. So they are turned the other way here, in court space, and the
 * camera's turn puts them back upright on the screen.
 */
const SCREEN_TURN = Math.PI / 2;

/** How deep the seating bowl is drawn, in feet beyond the apron. */
export const BOWL_DEPTH = 15;

/** Feet of bare floor between the court lines and the front row. */
const APRON = 5;

/** How tall one row of seats is, in feet of court space. */
const ROW = 1.5;

/** A crowd colour that is nobody's kit: coats, hair, empty seats. */
const NEUTRALS = [
  '#3b3a39', '#4a4340', '#2f2e2d', '#585049', '#6b5f55',
  '#8a7a6a', '#54595f', '#413c44',
];

export interface ArenaOptions {
  home: Jersey;
  away: Jersey;
  /** The name over the tunnel, which every club already has. */
  arenaName: string;
  /** Home club's short mark, painted at centre court. */
  homeAbbr: string;
  /** The club's name, painted along both baselines. */
  club: string;
  /** A stable seed, so the same building has the same crowd every time. */
  seed: string;
  /** 0..1. A full house at a blue blood, half empty at the bottom. */
  attendance: number;
}

/**
 * Paint the room around the floor.
 *
 * Called with the layer's own transform already set up: `fx`/`fy` turn court feet
 * into layer pixels, and the court's own margin is what leaves room for all of
 * this. Everything is drawn from the outside in, so the nearer thing wins.
 */
export function paintArena(
  ctx: CanvasRenderingContext2D,
  ppy: number,
  margin: number,
  opts: ArenaOptions,
): void {
  const fx = (x: number): number => (x + margin) * ppy;
  const fy = (y: number): number => (y + margin) * ppy;
  const rng = new Rng(`hoops:arena:${opts.seed}`);

  /* 1. THE ROOM. Nearly black, and slightly blue rather than slightly brown:
   *    the dark of a lit building is cold, and it makes the hardwood look warm
   *    by contrast, which is the whole trick of an arena at night. */
  ctx.fillStyle = '#0a0b0f';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  /* 2. THE BOWL. Four banks of seating, each a run of rows that steps darker and
   *    tighter as it recedes. A row further from the floor gets less light, which
   *    is the only depth cue a flat picture has and it is enough. */
  const rows = Math.floor(BOWL_DEPTH / ROW);
  const banks: {
    /** Outward direction in court space. */
    dx: number; dy: number;
    /** The edge the front row sits against. */
    edge: number;
    /** Along-the-edge extent. */
    from: number; to: number;
    /** Whose end of the building this is. */
    kit: Jersey;
  }[] = [
    // Behind each baseline: the deepest banks, and the ones the camera sees.
    { dx: -1, dy: 0, edge: -APRON, from: -APRON, to: COURT.width + APRON, kit: opts.home },
    { dx: 1, dy: 0, edge: COURT.length + APRON, from: -APRON, to: COURT.width + APRON, kit: opts.away },
    // The sidelines: shallower, because the scorer's table and the benches take
    // the first few feet of one of them.
    { dx: 0, dy: -1, edge: -APRON, from: -APRON, to: COURT.length + APRON, kit: opts.home },
    { dx: 0, dy: 1, edge: COURT.width + APRON, from: -APRON, to: COURT.length + APRON, kit: opts.away },
  ];

  for (const bank of banks) {
    const along = bank.dx !== 0;
    for (let r = 0; r < rows; r++) {
      const depth = r / Math.max(1, rows - 1);
      /* THE STEP the row sits on. It gets darker going back, which is the only
       * depth cue a flat picture has — and the front row is lit hard, because
       * the court lights spill onto it and that spill is what makes the bowl
       * look like it surrounds something bright. */
      const lum = 1 - depth;
      ctx.fillStyle = `rgb(${Math.round(30 + lum * 62)},${Math.round(31 + lum * 62)},${Math.round(38 + lum * 66)})`;
      const a = bank.edge + (bank.dx + bank.dy) * (r * ROW);
      if (along) {
        const x0 = Math.min(a, a + bank.dx * ROW);
        ctx.fillRect(fx(x0), fy(bank.from), ROW * ppy, (bank.to - bank.from) * ppy);
      } else {
        const y0 = Math.min(a, a + bank.dy * ROW);
        ctx.fillRect(fx(bank.from), fy(y0), (bank.to - bank.from) * ppy, ROW * ppy);
      }

      /* THE CROWD. One person every fifteen inches, which at this scale is one
       * or two pixels each — and that is exactly right, because a crowd is a
       * TEXTURE rather than a collection of people. Every third or fourth of
       * them wears the home club's colours near the home end. */
      // A shadow line at the front of each step, so rows read as rows.
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      if (along) {
        const a2 = bank.edge + (bank.dx + bank.dy) * (r * ROW);
        ctx.fillRect(
          Math.round(fx(a2 + (bank.dx > 0 ? 0 : ROW)) - (bank.dx > 0 ? 0 : 1)),
          fy(bank.from), 1, (bank.to - bank.from) * ppy,
        );
      } else {
        const a2 = bank.edge + (bank.dx + bank.dy) * (r * ROW);
        ctx.fillRect(
          fx(bank.from),
          Math.round(fy(a2 + (bank.dy > 0 ? 0 : ROW)) - (bank.dy > 0 ? 0 : 1)),
          (bank.to - bank.from) * ppy, 1,
        );
      }

      const seatPitch = 1.25;
      const span = bank.to - bank.from;
      const n = Math.floor(span / seatPitch);
      const lit = 1 - depth * 0.55;
      for (let i = 0; i < n; i++) {
        if (rng.next() > opts.attendance * (1 - depth * 0.25)) continue;
        const t = bank.from + (i + 0.5) * seatPitch + rng.range(-0.2, 0.2);
        const roll = rng.next();
        const colour = roll < 0.3 ? bank.kit.primary
          : roll < 0.4 ? bank.kit.secondary
            : NEUTRALS[rng.int(0, NEUTRALS.length - 1)];
        ctx.globalAlpha = lit;
        ctx.fillStyle = colour;
        const size = Math.max(1, Math.round(ppy * 0.7));
        if (along) {
          ctx.fillRect(
            Math.round(fx(a + bank.dx * ROW * 0.35)), Math.round(fy(t)), size, size,
          );
        } else {
          ctx.fillRect(
            Math.round(fx(t)), Math.round(fy(a + bank.dy * ROW * 0.35)), size, size,
          );
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  /* 3. THE SIGNAGE BAND at the front of the lower bowl. In a real building it is
   *    an LED ribbon; here it is a dark strip with the arena's name on it, which
   *    is the one piece of writing in the room and therefore the one that sells
   *    it as a place. */
  const bandDepth = 1.4;
  const band = (x: number, y: number, w: number, h: number): void => {
    ctx.fillStyle = '#12141c';
    ctx.fillRect(fx(x), fy(y), w * ppy, h * ppy);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(fx(x), fy(y), w * ppy, Math.max(1, ppy * 0.12));
  };
  band(-APRON - bandDepth, -APRON, bandDepth, COURT.width + APRON * 2);
  band(COURT.length + APRON, -APRON, bandDepth, COURT.width + APRON * 2);
  band(-APRON, -APRON - bandDepth, COURT.length + APRON * 2, bandDepth);
  band(-APRON, COURT.width + APRON, COURT.length + APRON * 2, bandDepth);

  // The name, along both sidelines, where a camera behind the basket would read it.
  if (ppy >= 5) {
    const name = opts.arenaName.toUpperCase();
    for (const y of [-APRON - bandDepth / 2, COURT.width + APRON + bandDepth / 2]) {
      ctx.save();
      ctx.translate(fx(COURT.centerX), fy(y));
      ctx.rotate(SCREEN_TURN);
      pixelText(ctx, name, 0, 0, ppy * 1.05, 'rgba(240,230,210,0.5)');
      ctx.restore();
    }
  }

  /* 4. THE APRON: the bare floor between the lines and the front row. A real one
   *    is the same surface as the court, darker because nothing is lighting it. */
  ctx.fillStyle = '#4a3323';
  ctx.fillRect(
    fx(-APRON), fy(-APRON),
    (COURT.length + APRON * 2) * ppy, (COURT.width + APRON * 2) * ppy,
  );

  /* 5. THE FURNITURE. The scorer's table at the centre of one sideline with the
   *    two benches either side of it, which is exactly where they are in every
   *    gym in the world, and the only thing in the room that tells you which
   *    sideline you are looking at. */
  const tableY = -APRON + 1.2;
  const tableH = 2.2;
  ctx.fillStyle = '#1b1d26';
  ctx.fillRect(fx(COURT.centerX - 10), fy(tableY), 20 * ppy, tableH * ppy);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(fx(COURT.centerX - 10), fy(tableY), 20 * ppy, Math.max(1, ppy * 0.18));

  const bench = (x0: number, kit: Jersey): void => {
    ctx.fillStyle = '#15161d';
    ctx.fillRect(fx(x0), fy(tableY), 16 * ppy, tableH * ppy);
    // Twelve chairs in the club's colour: the bench is who is not playing.
    const seats = 12;
    for (let i = 0; i < seats; i++) {
      ctx.fillStyle = i % 3 === 0 ? kit.secondary : kit.primary;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(
        Math.round(fx(x0 + 0.7 + i * 1.25)), Math.round(fy(tableY + 0.5)),
        Math.max(1, Math.round(ppy * 0.8)), Math.max(1, Math.round(ppy * 0.9)),
      );
      ctx.globalAlpha = 1;
    }
  };
  bench(COURT.centerX - 28, opts.home);
  bench(COURT.centerX + 12, opts.away);
}

/**
 * The centre-court mark and the baseline wordmarks.
 *
 * Painted ON the hardwood, after the boards and under the lines, because that is
 * the order a real floor is finished in — and because a logo over the lines looks
 * like a sticker rather than like paint.
 */
export function paintFloorMarks(
  ctx: CanvasRenderingContext2D,
  ppy: number,
  margin: number,
  opts: { homeAbbr: string; club: string; seed: string; home: Jersey },
): void {
  const fx = (x: number): number => (x + margin) * ppy;
  const fy = (y: number): number => (y + margin) * ppy;

  /* THE CENTRE MARK. A real emblem rather than a bullseye — the shared emblem
   * painter draws an original club badge from a spec, which is the same one the
   * lacrosse game uses on its midfield, so there is one emblem system rather
   * than two. It goes on at part strength because a centre logo is a decal under
   * the finish: the grain of the boards shows through it, and it must never be
   * the brightest thing on the floor.
   */
  /* Sized to sit INSIDE the centre circle with room to spare, because an emblem
   * that touches the line reads as a sticker somebody put there rather than as
   * part of the floor — and at a third of full strength, because it is a decal
   * under the varnish and must never out-shine the lines. */
  const r = COURT.centerCircle * 0.5 * ppy;
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.translate(fx(COURT.centerX), fy(COURT.centerY));
  ctx.rotate(SCREEN_TURN);
  drawEmblem(ctx, hoopsEmblem(opts.seed, opts.homeAbbr, opts.home), 0, 0, r, 1, true);
  ctx.restore();

  /* THE CLUB NAME ON THE APRON, beyond each baseline, where a real floor puts it
   * — out past the lines, reading toward the stands behind it. It was inside the
   * arc before, at twice this size, and it sat straight across the free-throw
   * circle like a watermark on a photograph. */
  if (ppy >= 4) {
    const word = opts.club.toUpperCase();
    const size = ppy * 1.5;
    for (const x of [-2.6, COURT.length + 2.6]) {
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.translate(fx(x), fy(COURT.centerY));
      ctx.rotate(SCREEN_TURN);
      pixelText(ctx, word, 0, 0, size, '#e7d6bb');
      ctx.restore();
    }
  }
}

/* ---------------------------------------------------------------------------
 * A CLUB'S MARK
 * ---------------------------------------------------------------------------
 * Derived from the club's id, so it is the same badge every time, and built to
 * the SHARED emblem spec so the painter that draws lacrosse's midfield logo
 * draws this one too. Nothing is fetched and nothing can be missing.
 * ------------------------------------------------------------------------- */

const SHAPES: EmblemShape[] = ['shield', 'circle', 'star', 'diamond', 'banner', 'hex'];
const MOTIFS: EmblemMotif[] = ['none', 'chevron', 'bar', 'stripe', 'cross'];

export function hoopsEmblem(seed: string, abbr: string, kit: Jersey): Emblem {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = Math.abs(h);
  return {
    shape: SHAPES[h % SHAPES.length],
    motif: MOTIFS[(h >> 5) % MOTIFS.length],
    glyph: abbr.slice(0, 2).toUpperCase(),
    body: kit.primary,
    edge: kit.secondary,
    ink: kit.ink,
  };
}

/**
 * THE LIGHT.
 *
 * A pool of it on the floor and darkness at the edges, painted over the finished
 * hardwood. It is the cheapest thing in this file and it does more than anything
 * else: it says the court is lit and the room is not, which is the single visual
 * fact that separates a basketball arena from a gym with the strip lights on.
 */
export function paintCourtLight(
  ctx: CanvasRenderingContext2D, ppy: number, margin: number,
): void {
  const fx = (x: number): number => (x + margin) * ppy;
  const fy = (y: number): number => (y + margin) * ppy;
  const cx = fx(COURT.centerX);
  const cy = fy(COURT.centerY);
  const outer = Math.hypot(COURT.length / 2 + APRON, COURT.width / 2 + APRON) * ppy;

  const light = ctx.createRadialGradient(cx, cy, COURT.width * 0.3 * ppy, cx, cy, outer);
  /* Gentle. A heavy vignette buries the apron and the front row of the crowd,
   * which are the two things that make the floor look like it is inside a
   * building — the light should say "lit court, dark room", not "torch". */
  light.addColorStop(0, 'rgba(255,244,214,0.09)');
  light.addColorStop(0.6, 'rgba(255,240,205,0.015)');
  light.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/* ------------------------------------------------------------ the flashes */

/**
 * CAMERA FLASHES IN THE CROWD.
 *
 * The one thing in the building that moves, and the reason it is worth having is
 * that a still crowd reads as wallpaper. A handful of one-frame white squares a
 * second is enough for the room to feel occupied; after a basket the rate jumps,
 * so the building reacts to the game rather than idling through it.
 *
 * It is drawn live rather than baked because it is four rectangles.
 */
export class CrowdFlashes {
  private rng = new Rng('hoops:flash');
  private lit: { x: number; y: number; life: number }[] = [];
  private excited = 0;

  /** Something happened worth photographing. */
  stir(amount = 1): void {
    this.excited = Math.min(2.5, this.excited + amount);
  }

  update(dt: number): void {
    this.excited = Math.max(0, this.excited - dt * 0.8);
    for (const f of this.lit) f.life -= dt;
    this.lit = this.lit.filter((f) => f.life > 0);

    const rate = 1.6 + this.excited * 14;
    if (this.rng.next() < clamp(rate * dt, 0, 0.9)) {
      // Anywhere in the bowl, which is anywhere outside the apron.
      const side = this.rng.int(0, 3);
      const depth = this.rng.range(0.5, BOWL_DEPTH);
      const along = this.rng.range(-APRON, (side < 2 ? COURT.width : COURT.length) + APRON);
      const p = side === 0 ? { x: -APRON - depth, y: along }
        : side === 1 ? { x: COURT.length + APRON + depth, y: along }
          : side === 2 ? { x: along, y: -APRON - depth }
            : { x: along, y: COURT.width + APRON + depth };
      this.lit.push({ ...p, life: 0.09 });
    }
  }

  /** Court-space positions of everything currently lit. */
  get flashes(): { x: number; y: number; life: number }[] {
    return this.lit;
  }
}
