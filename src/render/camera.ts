import { clamp, damp } from '../core/math';
import { FIELD } from '../data/constants';

/** Yards of empty ground drawn around the playing field (track, benches, stands). */
export const FIELD_MARGIN = 13;

export class Camera {
  x = FIELD.centerX;
  y = FIELD.centerY;
  ppy = 8;
  rotate = false;
  bufW = 320;
  bufH = 200;
  shake = 0;
  shakeX = 0;
  shakeY = 0;

  /** @param cssShort the CSS-pixel length of the viewport's short edge, used to
   *  keep players a readable physical size on small screens. */
  configure(bufW: number, bufH: number, cssShort: number): void {
    this.bufW = bufW;
    this.bufH = bufH;
    this.rotate = bufH > bufW * 1.06;
    const short = Math.min(bufW, bufH);
    // Show fewer yards on a phone so players stay a readable size, more on a
    // big screen where there is room for situational awareness.
    const yardsAcross = cssShort < 460 ? 25 : cssShort < 700 ? 29 : 33;
    this.ppy = clamp(short / yardsAcross, 6.0, 15);
  }

  /** Yards visible along the world X axis and Y axis respectively. */
  get viewYardsX(): number {
    return (this.rotate ? this.bufH : this.bufW) / this.ppy;
  }
  get viewYardsY(): number {
    return (this.rotate ? this.bufW : this.bufH) / this.ppy;
  }

  follow(tx: number, ty: number, dt: number, lead = 0): void {
    const halfX = this.viewYardsX / 2;
    const halfY = this.viewYardsY / 2;
    // Only ever show a sliver of out-of-bounds: an empty green border reads as
    // a bug, not as a stadium.
    const pad = 2.5;
    const minX = halfX - pad;
    const maxX = FIELD.length - halfX + pad;
    const minY = halfY - pad;
    const maxY = FIELD.width - halfY + pad;

    const goalX = minX > maxX ? FIELD.centerX : clamp(tx + lead, minX, maxX);
    const goalY = minY > maxY ? FIELD.centerY : clamp(ty, minY, maxY);

    this.x = damp(this.x, goalX, 5.5, dt);
    this.y = damp(this.y, goalY, 5.5, dt);

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

  addShake(amount: number): void {
    this.shake = Math.min(this.shake + amount * 0.16, 3.2);
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

  /** Offset for blitting the pre-rendered field layer, in the camera's local space. */
  fieldBlit(): { dx: number; dy: number } {
    return {
      dx: -(this.x - this.shakeX + FIELD_MARGIN) * this.ppy,
      dy: -(this.y - this.shakeY + FIELD_MARGIN) * this.ppy,
    };
  }

  visible(wx: number, wy: number, pad = 4): boolean {
    const sx = this.projectX(wx, wy);
    const sy = this.projectY(wx, wy);
    const p = pad * this.ppy;
    return sx > -p && sx < this.bufW + p && sy > -p && sy < this.bufH + p;
  }
}
