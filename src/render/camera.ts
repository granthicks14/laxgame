import { FIELD } from '../data/constants';
import { Viewport, type SurfaceBounds } from './viewport';

/** Yards of empty ground drawn around the playing field (track, benches, stands). */
export const FIELD_MARGIN = 13;

/**
 * The lacrosse field, as the camera sees it. Show fewer yards on a phone so
 * players stay a readable size, more on a big screen where there is room for
 * situational awareness.
 */
const LACROSSE_FIELD: SurfaceBounds = {
  length: FIELD.length,
  width: FIELD.width,
  yardsAcross: [25, 29, 33],
  ppyRange: [6.0, 15],
};

/**
 * LACROSSE CAMERA
 *
 * Trails the ball down a long field and leads it toward the cage. The surround
 * is a real venue — track, benches, stands, scoreboard — so letting play at a
 * sideline show it is the point; going much further would just show empty ground.
 */
export class Camera extends Viewport {
  constructor() {
    super(LACROSSE_FIELD);
  }

  follow(tx: number, ty: number, dt: number, lead = 0, rate = 5.5): void {
    this.approach(tx + lead, ty, dt, rate, 8);
    this.settleShake(dt);
  }

  /** Offset for blitting the pre-rendered field layer, in the camera's local space. */
  fieldBlit(): { dx: number; dy: number } {
    return {
      dx: -(this.x - this.shakeX + FIELD_MARGIN) * this.ppy,
      dy: -(this.y - this.shakeY + FIELD_MARGIN) * this.ppy,
    };
  }
}
