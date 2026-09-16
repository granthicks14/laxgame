import { clamp } from '../../core/math';
import { Viewport, type SurfaceBounds } from '../../render/viewport';
import { FIELD, attackDir, type Side } from './field';

/* ---------------------------------------------------------------------------
 * THE FOOTBALL CAMERA
 * ---------------------------------------------------------------------------
 * A football field is 120 yards by 53 — proportionally the longest, thinnest
 * surface in the hub. Laid down the way lacrosse lies down, fitting its length
 * to a phone would put twenty-two men inside forty pixels. So it stands UP, like
 * the basketball court and for the same reason: upright, a phone holds the full
 * width of the field and about fifty yards of it, which is the whole area a
 * football play ever happens in.
 *
 * TWO THINGS THIS CAMERA DOES THAT THE OTHERS DO NOT.
 *
 * IT ALWAYS POINTS THE COACH UPFIELD. Both sides of a football field look
 * identical, so there is nothing to orient by — and unlike basketball, where the
 * basket you are attacking is a large obvious object, a player who cannot tell
 * which way he is going has no way to find out. So the view is mirrored for a
 * coach attacking the other way, and "forward" is up the screen for the whole
 * game. It costs one sign in the projection and it is the difference between a
 * readable game and a confusing one.
 *
 * IT SITS BEHIND THE LINE OF SCRIMMAGE rather than on the ball. A quarterback
 * needs to see the routes in front of him, which means the interesting part of
 * the field is the thirty yards BEYOND the ball, not the fifteen behind it. So
 * the line of scrimmage is held in the lower third of the view and the camera
 * only leaves it once somebody is running.
 * ------------------------------------------------------------------------- */

const FIELD_BOUNDS: SurfaceBounds = {
  /** World X: sideline to sideline. */
  length: FIELD.width,
  /** World Y: goal line to goal line, and then some. */
  width: FIELD.length,
  /** Yards of WIDTH held across the screen at phone, tablet and desktop. */
  yardsAcross: [42, 50, 58],
  ppyRange: [5, 15],
};

/**
 * Yards of field that must be visible along the long axis. Thirty-five of them
 * are in front of the ball and twelve behind it: a punt formation is fourteen
 * yards deep and a four-verticals concept is thirty yards long, and neither of
 * them is playable with an end off the screen.
 */
const WANT_LENGTH = 47;

export class FieldCamera extends Viewport {
  /**
   * +1 when the coach attacks up the screen with increasing y, -1 when the
   * whole picture is mirrored so that he still does.
   */
  private facing: 1 | -1 = 1;

  constructor() {
    super(FIELD_BOUNDS);
    this.y = FIELD.length / 2;
    this.x = FIELD.centerX;
  }

  /** The field stands upright however the device is held. */
  configure(bufW: number, bufH: number, cssShort: number): void {
    this.bufW = bufW;
    this.bufH = bufH;
    this.rotate = false;
    const [phone, tablet, desktop] = FIELD_BOUNDS.yardsAcross;
    const across = cssShort < 460 ? phone : cssShort < 700 ? tablet : desktop;
    const [lo, hi] = FIELD_BOUNDS.ppyRange;
    /* Both constraints hold at once and the tighter wins: enough width that the
     * sidelines are roughly on screen, and enough length that a receiver at the
     * top of his route still is. A phone is bound by the width, a wide desktop
     * window by the length. */
    this.ppy = clamp(Math.min(bufW / across, bufH / WANT_LENGTH), lo, hi);
  }

  /** Point the camera so that this side attacks up the screen. */
  orientFor(side: Side | null): void {
    this.facing = side === null ? 1 : attackDir(side);
  }

  get upfield(): 1 | -1 {
    return this.facing;
  }

  /* --- the mirror ------------------------------------------------------- */

  projectX(wx: number, wy: number): number {
    const dx = (wx - this.x + this.shakeX) * this.facing;
    void wy;
    return this.bufW / 2 + dx * this.ppy;
  }

  projectY(wx: number, wy: number): number {
    void wx;
    /* UP THE SCREEN IS TOWARD THE END ZONE HE IS ATTACKING. The base viewport
     * draws increasing world y downward; football inverts that and then inverts
     * it again for a coach going the other way, which is the whole mirror. */
    const dy = (wy - this.y + this.shakeY) * this.facing;
    return this.bufH / 2 - dy * this.ppy;
  }

  /**
   * A thumb pushed up the screen means upfield, whichever way the coach happens
   * to be attacking, and the same mirror that draws the field has to undo
   * itself here or every control is backwards for one of the two teams.
   */
  inputToWorld(ix: number, iy: number): { x: number; y: number } {
    return { x: ix * this.facing, y: -iy * this.facing };
  }

  /**
   * How much of the top of the screen the scoreboard covers, in yards, so the
   * framing can push the field down out from under it.
   */
  private topInset = 0;

  setTopInset(cssPx: number, cssPerYard: number): void {
    this.topInset = cssPerYard > 0 ? cssPx / cssPerYard : 0;
  }

  /**
   * Frame the play.
   *
   * @param los    the line of scrimmage
   * @param ballY  where the ball actually is, so a long run is followed
   * @param ballX  and how far across the field
   * @param dir    the attacking direction of the side with the ball
   * @param live   true once the ball is snapped: a dead ball holds the spot
   */
  follow(
    los: number, ballX: number, ballY: number, dir: 1 | -1, live: boolean, dt: number,
  ): void {
    const half = this.viewYardsY / 2;

    /* THE LINE OF SCRIMMAGE SITS LOW IN THE VIEW so the field in front of it is
     * the field you can see. A third of the way up, which puts the backfield
     * comfortably on screen and still shows thirty yards of routes. */
    const anchor = los + dir * (half - this.topInset - 6) * 0.42;
    // Once the ball is past the line, follow the ball instead of the spot.
    const past = (ballY - los) * dir;
    const targetY = live && past > 2 ? ballY + dir * half * 0.25 : anchor;
    const targetX = FIELD.centerX + (ballX - FIELD.centerX) * 0.45;

    this.approach(targetX, targetY, dt, live ? 5.2 : 3.4, 3, 8);
    this.settleShake(dt);
  }

  /** Put the camera straight on a spot, for a snap after a long break. */
  jumpTo(los: number, dir: 1 | -1): void {
    const half = this.viewYardsY / 2;
    this.snap(FIELD.centerX, los + dir * (half - this.topInset - 6) * 0.42);
  }

  /** A hit, a sack or a touchdown is worth a jolt. */
  punch(amount: number): void {
    this.addShake(amount, 2.4);
  }
}
