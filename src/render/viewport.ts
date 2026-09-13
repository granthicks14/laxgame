import { clamp, damp } from '../core/math';

/* ---------------------------------------------------------------------------
 * VIEWPORT
 * ---------------------------------------------------------------------------
 * The part of a camera that every sport in the hub shares, and nothing more.
 *
 * Projection, the portrait rotation, the pixel scale that keeps players a
 * readable size on a phone, and screen shake are the same problem whatever is
 * being played: a rectangle of world measured in yards, drawn into a small pixel
 * buffer, on a screen that might be held either way up.
 *
 * FRAMING is not shared and is deliberately absent. Where the camera should look
 * is the most sport-specific decision a renderer makes — a lacrosse camera trails
 * the ball down a 110-yard field and leads it toward the cage; a basketball
 * camera holds a half court and swings when possession turns over; a tennis
 * camera barely moves at all. Each sport subclasses this and writes its own, so
 * reuse never flattens one sport's feel into another's.
 * ------------------------------------------------------------------------- */

/** The playing surface a viewport is looking at, in yards. */
export interface SurfaceBounds {
  /** World X extent of the playing surface. */
  length: number;
  /** World Y extent. */
  width: number;
  /**
   * Yards visible across the buffer's short edge at phone, tablet and desktop
   * widths. Fewer yards keeps players readable on a small screen; more gives
   * situational awareness where there is room for it.
   */
  yardsAcross: [phone: number, tablet: number, desktop: number];
  /** Clamp on pixels-per-yard, so a huge screen does not zoom absurdly far in. */
  ppyRange: [min: number, max: number];
}

export class Viewport {
  x: number;
  y: number;
  ppy = 8;
  /** True when the screen is taller than it is wide: the world turns 90°. */
  rotate = false;
  bufW = 320;
  bufH = 200;
  shake = 0;
  shakeX = 0;
  shakeY = 0;

  constructor(protected bounds: SurfaceBounds) {
    this.x = bounds.length / 2;
    this.y = bounds.width / 2;
  }

  /** @param cssShort the CSS-pixel length of the viewport's short edge. */
  configure(bufW: number, bufH: number, cssShort: number): void {
    this.bufW = bufW;
    this.bufH = bufH;
    this.rotate = bufH > bufW * 1.06;
    const short = Math.min(bufW, bufH);
    const [phone, tablet, desktop] = this.bounds.yardsAcross;
    const yardsAcross = cssShort < 460 ? phone : cssShort < 700 ? tablet : desktop;
    const [lo, hi] = this.bounds.ppyRange;
    this.ppy = clamp(short / yardsAcross, lo, hi);
  }

  /** Yards visible along the world X axis and Y axis respectively. */
  get viewYardsX(): number {
    return (this.rotate ? this.bufH : this.bufW) / this.ppy;
  }
  get viewYardsY(): number {
    return (this.rotate ? this.bufW : this.bufH) / this.ppy;
  }

  /**
   * Move toward a point, clamped so the camera shows at most `pad` yards past
   * the edge of the surface — `padY` where the two axes need different slack,
   * as they do when a sport keeps room above one end but none at the sides.
   * Subclasses decide WHICH point and how fast; this only guarantees the view
   * stays over the venue.
   */
  protected approach(
    tx: number, ty: number, dt: number, rate: number, pad: number, padY = pad,
  ): void {
    const halfX = this.viewYardsX / 2;
    const halfY = this.viewYardsY / 2;
    const minX = halfX - pad;
    const maxX = this.bounds.length - halfX + pad;
    const minY = halfY - padY;
    const maxY = this.bounds.width - halfY + padY;

    const goalX = minX > maxX ? this.bounds.length / 2 : clamp(tx, minX, maxX);
    const goalY = minY > maxY ? this.bounds.width / 2 : clamp(ty, minY, maxY);

    this.x = damp(this.x, goalX, rate, dt);
    this.y = damp(this.y, goalY, rate, dt);
  }

  /** Decay the shake. Called by subclasses once per frame, after moving. */
  protected settleShake(dt: number): void {
    if (this.shake > 0.01) {
      this.shake = damp(this.shake, 0, 7, dt);
      this.shakeX = (Math.random() - 0.5) * this.shake;
      this.shakeY = (Math.random() - 0.5) * this.shake;
    } else {
      this.shake = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  addShake(amount: number, cap = 3.2): void {
    this.shake = Math.min(this.shake + amount * 0.16, cap);
  }

  snap(tx: number, ty: number): void {
    this.x = tx;
    this.y = ty;
  }

  /** World yards -> buffer pixels. */
  projectX(wx: number, wy: number): number {
    const dx = wx - this.x + this.shakeX;
    const dy = wy - this.y + this.shakeY;
    return this.rotate
      ? this.bufW / 2 + dy * this.ppy
      : this.bufW / 2 + dx * this.ppy;
  }
  projectY(wx: number, wy: number): number {
    const dx = wx - this.x + this.shakeX;
    const dy = wy - this.y + this.shakeY;
    return this.rotate
      ? this.bufH / 2 - dx * this.ppy
      : this.bufH / 2 + dy * this.ppy;
  }

  /** Screen-space input direction -> world direction. */
  inputToWorld(ix: number, iy: number): { x: number; y: number } {
    return this.rotate ? { x: -iy, y: ix } : { x: ix, y: iy };
  }

  visible(wx: number, wy: number, pad = 4): boolean {
    const sx = this.projectX(wx, wy);
    const sy = this.projectY(wx, wy);
    const p = pad * this.ppy;
    return sx > -p && sx < this.bufW + p && sy > -p && sy < this.bufH + p;
  }
}
