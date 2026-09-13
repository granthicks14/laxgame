import { clamp, damp } from '../../core/math';
import { Viewport, type SurfaceBounds } from '../../render/viewport';
import { COURT, attackRim, type Side } from './court';
import { LIFT } from './render';

/* ---------------------------------------------------------------------------
 * THE BASKETBALL CAMERA
 * ---------------------------------------------------------------------------
 * A different job from the lacrosse camera, and solved differently.
 *
 * Lacrosse is a hundred and ten yards long and the ball crosses it a few times a
 * minute, so its camera trails the ball and leads it toward the cage. Basketball
 * is ninety-four FEET long, possession turns over every few seconds, and
 * everything that matters happens inside one half of it. A camera that chased the
 * ball up and down would swing constantly and show mostly empty hardwood.
 *
 * So this one holds the HALF BEING PLAYED. It settles on the attacking end,
 * frames enough of the floor to see the spacing that the offence is built on, and
 * swings across when possession turns over — quickly, because a fast break is
 * worth watching, and only once, because two swings for one turnover is
 * seasickness.
 *
 * It also stands the court UP. Lacrosse lies its field down because a field is
 * long and thin and a landscape screen is the same shape; a basketball court is
 * 94ft by 50ft, which is WIDER in proportion than any screen, so laying it down
 * and fitting its width means fitting all 94 feet of its length too — ten men
 * the size of ants on a floor that is two-thirds empty. Turned upright, with the
 * baskets at the top and the bottom, the same screen holds the full 50ft width
 * and about a half court of length: every corner is on screen, and the players
 * are twice the size. That is why the rotation here is unconditional rather than
 * the shared portrait rule.
 * ------------------------------------------------------------------------- */

const COURT_BOUNDS: SurfaceBounds = {
  length: COURT.length,
  width: COURT.width,
  // Feet of COURT WIDTH held across the screen's horizontal edge. A court is
  // 50ft wide: a phone gives up the last two feet of each sideline (nobody
  // stands there, and the corners at 3ft are still in shot) to buy back the
  // zoom, a desktop shows the width plus the apron either side.
  yardsAcross: [46, 50, 56],
  ppyRange: [4.0, 24],
};

/**
 * Feet of court that must be visible from the baseline down, plus the apron
 * above it. Thirty of those feet are non-negotiable: the top of the three-point
 * arc is 29ft from the baseline, and an offence whose ball-handler is off the
 * top of the screen is not an offence anybody can play.
 */
const WANT_DEPTH = 38;

/**
 * How far past the baseline the top of the backboard reaches once it is lifted
 * up the screen. The basket is the one object that sticks out of the floor far
 * enough to leave the court, so the camera has to leave it room.
 */
const BASKET_HEADROOM = COURT.boardTop * LIFT - COURT.boardInset;

export class CourtCamera extends Viewport {
  /** Which end the camera is settled on. */
  private end: Side = 'home';
  /** 0..1 across the swing: 1 means fully arrived. */
  private settled = 1;

  constructor() {
    super(COURT_BOUNDS);
  }

  /**
   * The court stands upright however the device is held, and the zoom is set by
   * how much of its WIDTH has to fit across the screen rather than by the screen's
   * short edge. Those are the same thing in landscape and very different on a
   * phone, where the short edge is the one the width has to fit into either way.
   */
  configure(bufW: number, bufH: number, cssShort: number): void {
    this.bufW = bufW;
    this.bufH = bufH;
    this.rotate = true;
    const [phone, tablet, desktop] = COURT_BOUNDS.yardsAcross;
    const across = cssShort < 460 ? phone : cssShort < 700 ? tablet : desktop;
    const [lo, hi] = COURT_BOUNDS.ppyRange;
    // Both constraints have to hold, so the zoom is whichever is the tighter of
    // them: enough width that the corners are on screen, and enough length that
    // the whole arc is. A phone in portrait is bound by the width, a phone on its
    // side by the length, and a desktop by whichever way the window is dragged.
    this.ppy = clamp(Math.min(bufW / across, bufH / WANT_DEPTH), lo, hi);
  }

  /**
   * How much of the top of the screen the scoreboard is covering, in CSS pixels.
   * The camera pushes the floor down by that much so the basket is never behind
   * the score — the one overlap a court standing upright makes unavoidable.
   */
  setTopInset(cssPx: number, cssPerFoot: number): void {
    this.topInsetFeet = cssPerFoot > 0 ? cssPx / cssPerFoot : 0;
  }

  private topInsetFeet = 0;

  /** Where the camera wants to sit to frame the end being attacked. */
  private anchorFor(end: Side): number {
    const far = attackRim(end).x > COURT.centerX;
    const baseline = far ? COURT.length : 0;
    const toCourt = far ? -1 : 1;
    // Put the baseline far enough inside the near edge of the view to clear both
    // the backboard and the scoreboard above it. On a wide screen that frames the
    // half court with the basket near the top; on a phone, where the same rule
    // shows nearly the whole floor, it lands the camera near the middle on its own.
    return baseline + toCourt * (this.viewYardsX / 2 - this.apron());
  }

  /**
   * Frame the half being attacked, biased toward the ball.
   *
   * @param attacking which side is on offence
   * @param ballX     where the ball is, so a break is framed as it happens
   */
  follow(
    attacking: Side, ballX: number, ballY: number, dt: number,
  ): void {
    if (attacking !== this.end) {
      this.end = attacking;
      this.settled = 0;
    }
    this.settled = Math.min(1, this.settled + dt * 1.6);

    // The anchor is where the camera WANTS to sit; the ball decides how far it is
    // allowed to. Holding the attacking end while the ball is still being brought
    // up the floor would leave the man you are controlling off the screen, which
    // is worse than any amount of camera movement.
    const anchorX = this.anchorFor(this.end);
    const keep = Math.max(5, this.viewYardsX / 2 - 8);
    const targetX = clamp(anchorX, ballX - keep, ballX + keep);

    // Vertically, hold the middle and lean toward the ball. Leaning too far
    // hides the weak side, which is where the open man usually is.
    const targetY = COURT.centerY + (ballY - COURT.centerY) * 0.3;

    // A turnover should snap the camera round; settled play should not drift.
    const rate = this.settled < 1 ? 4.4 : 2.8;
    // Slack above the baseline for the basket and the scoreboard; none at the
    // sidelines, where the whole width already fits and drifting only shows the
    // black beyond the apron.
    this.approach(targetX, targetY, dt, rate, this.apron() + 2, 2);
    this.settleShake(dt);
  }

  /**
   * A dead ball holds the framing rather than the exact pixel: if the window was
   * resized or the scoreboard changed height while the clock was stopped, the
   * floor still settles under it instead of waiting for the next possession.
   */
  hold(dt: number): void {
    this.approach(this.anchorFor(this.end), COURT.centerY, dt, 2.2, this.apron() + 3, 2);
    this.settleShake(dt);
  }

  /** Feet of room kept beyond the baseline the camera is looking at. */
  private apron(): number {
    return BASKET_HEADROOM + this.topInsetFeet + 2.2;
  }

  /** Snap straight to an end, for the opening tip and after a quarter break. */
  jumpTo(attacking: Side): void {
    this.end = attacking;
    this.settled = 1;
    this.snap(this.anchorFor(attacking), COURT.centerY);
  }

  /**
   * A basket is worth a jolt, and a dunk is worth more. Capped tighter than
   * lacrosse's because the camera is much closer to the players here.
   */
  punch(amount: number): void {
    this.addShake(amount, 2.1);
  }

  /** Used by the renderer to fade the far end out slightly. */
  get attackingEnd(): Side {
    return this.end;
  }

  /** Zoom in on the rim for a made basket, without moving the anchor. */
  pushIn(target: number, dt: number): void {
    this.ppy = damp(this.ppy, target, 3.2, dt);
  }
}
