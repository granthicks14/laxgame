import { clamp } from '../../core/math';
import { COURT, attackRim, type Side } from './court';
import { BALL_RADIUS, type Ball } from './ball';
import { paintArena, paintCourtLight, paintFloorMarks, type ArenaOptions } from './arena';
import type { CourtCamera } from './camera';
import type { CourtPlayer } from './types';

/* ---------------------------------------------------------------------------
 * DRAWING BASKETBALL
 * ---------------------------------------------------------------------------
 * Hardwood, not grass, and a target in the air rather than on the ground.
 *
 * The view is three-quarter top-down: the floor is drawn in plan, and anything
 * with height — a player, the ball, the rim — is lifted up the screen in
 * proportion to how high it is. That single convention is what makes a
 * ten-foot rim and a ball arcing over it readable without a 3D engine, and it
 * is why a jump shot looks like a jump shot: the player, the ball and their
 * shadows all move apart as he rises.
 *
 * Everything is drawn, not loaded. The floor is a pre-rendered layer because its
 * lines never change; the players are pixel figures built from rectangles, the
 * same way the lacrosse game draws its own.
 * ------------------------------------------------------------------------- */

/** How much of a foot of height becomes a pixel of lift. */
export const LIFT = 0.62;

/** Feet of surround drawn around the floor: the apron, benches and seats. */
/**
 * How much room is painted around the floor, in feet.
 *
 * It was nine, which held the apron and nothing else — beyond it the world
 * stopped, and a basketball game played on a brown rectangle floating in black
 * reads as a prototype however carefully the lines are drawn. Twenty holds the
 * apron, the signage band and a fifteen-foot seating bowl, which is everything
 * the camera can reach: it keeps about eighteen feet past a baseline and almost
 * nothing past a sideline, so this is sized to what is actually seen rather than
 * to what would be there in life.
 */
export const COURT_MARGIN = 20;

export interface Jersey {
  primary: string;
  secondary: string;
  /** Numbers and trim that must read against the primary. */
  ink: string;
}

/* -------------------------------------------------------------- the floor */

/**
 * The hardwood, pre-rendered once per scale.
 *
 * Redrawing a hundred lines every frame for a floor that never changes is the
 * kind of waste that shows up on a phone, so it is painted to its own canvas and
 * blitted.
 */
export class CourtLayer {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d');
  private builtPpy = -1;
  private builtSeed = '';

  private venue: ArenaOptions | null = null;

  /**
   * Which building this is.
   *
   * Set before the first frame; changing it rebuilds the layer, which is right —
   * a different club is a different room, a different crowd and a different logo
   * at centre court.
   */
  setVenue(v: ArenaOptions): void {
    this.venue = v;
  }

  /** Rebuild if the zoom or the theme changed. Returns the canvas to blit. */
  ensure(ppy: number, home: Jersey, away: Jersey): HTMLCanvasElement {
    const seed = `${home.primary}|${away.primary}|${this.venue?.seed ?? ''}`;
    if (Math.abs(ppy - this.builtPpy) < 0.01 && seed === this.builtSeed) return this.canvas;
    this.builtPpy = ppy;
    this.builtSeed = seed;
    this.paint(ppy, home);
    return this.canvas;
  }

  /* The away kit is not used here any more: the floor is the HOME club's, and
   * the jerseys on it are drawn by the player painter. It stays in `ensure`'s
   * cache key, because a change of visitor still changes the picture. */
  private paint(ppy: number, home: Jersey): void {
    const w = Math.ceil((COURT.length + COURT_MARGIN * 2) * ppy);
    const h = Math.ceil((COURT.width + COURT_MARGIN * 2) * ppy);
    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    const fx = (x: number): number => (x + COURT_MARGIN) * ppy;
    const fy = (y: number): number => (y + COURT_MARGIN) * ppy;

    /* THE ROOM, before the floor. Stands, signage, the scorer's table and the
     * benches — everything the camera can see beyond the lines. A club that has
     * not been named yet (the very first frame, or a test) gets a plain apron
     * instead of a half-built building. */
    if (this.venue) {
      paintArena(ctx, ppy, COURT_MARGIN, this.venue);
    } else {
      ctx.fillStyle = '#0a0b0f';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#4a3323';
      ctx.fillRect(fx(-5), fy(-5), (COURT.length + 10) * ppy, (COURT.width + 10) * ppy);
    }

    /* THE HARDWOOD.
     *
     * Maple, which is what a basketball floor is made of, and maple is PALE — a
     * warm straw rather than the mahogany this used to be. Two things make it
     * read as a floor rather than as a brown rectangle, and neither is a texture
     * map: boards of VARYING tone rather than two alternating shades, and a dark
     * seam between every one of them. Three tones in an irregular order is enough
     * that the eye stops finding the repeat.
     */
    const plank = 2.2;
    const TONES = ['#c79a5f', '#c1925a', '#cba367', '#bd8d55', '#c69b62', '#c08f57'];
    const boardH = Math.max(2, Math.round(plank * ppy));
    let tone = 0;
    for (let y = 0; y < COURT.width; y += plank) {
      ctx.fillStyle = TONES[tone % TONES.length];
      tone += 1 + ((Math.floor(y / plank) * 7) % 2);
      ctx.fillRect(fx(0), fy(y), COURT.length * ppy, boardH);
      // The seam. One pixel of shadow between planks, which is the whole
      // difference between "boards" and "stripes".
      ctx.fillStyle = 'rgba(70,42,18,0.30)';
      ctx.fillRect(fx(0), fy(y) + boardH - 1, COURT.length * ppy, 1);
    }
    /* BUTT JOINTS. A real floor is laid in lengths of eight feet or so, and the
     * ends do not line up. A short dark tick every so often is all it takes. */
    if (ppy >= 4) {
      ctx.fillStyle = 'rgba(70,42,18,0.14)';
      let j = 0;
      for (let y = 0; y < COURT.width; y += plank) {
        /* An irregular start AND an irregular spacing per row. With a fixed
         * spacing the joints lined up into columns down the floor, which is the
         * one thing a real laid floor never does. */
        const gap = 9 + ((j * 13) % 7);
        for (let x = ((j * 37) % gap) + 2; x < COURT.length; x += gap) {
          ctx.fillRect(Math.round(fx(x)), fy(y), 1, boardH - 1);
        }
        j++;
      }
    }
    /* THE PAINTED KEYS.
     *
     * BOTH IN THE HOME CLUB'S COLOUR, because the floor belongs to the building
     * and not to the two sides standing on it. Taking one key from each jersey —
     * which is what this used to do — meant the visitors' change strip painted
     * one end of the home team's floor white the moment away kits became light.
     *
     * Painted, not cut out: laid over the boards at part strength so the grain
     * still shows through, the way a real key looks. */
    const paintColour = this.venue ? shade(home.primary, 0.9) : shade(home.primary, 0.86);
    for (const side of ['home', 'away'] as Side[]) {
      const rim = attackRim(side);
      const x0 = rim.x > COURT.centerX ? COURT.length - COURT.keyDepth : 0;
      ctx.save();
      ctx.globalAlpha = 0.66;
      ctx.fillStyle = paintColour;
      ctx.fillRect(
        fx(x0), fy(COURT.centerY - COURT.keyWidth / 2),
        COURT.keyDepth * ppy, COURT.keyWidth * ppy,
      );
      ctx.restore();
    }

    /* THE DECALS: centre court and the two baseline wordmarks. Under the lines,
     * because that is the order a real floor is finished in — paint over a logo
     * looks like paint, a logo over paint looks like a sticker. */
    if (this.venue) {
      paintFloorMarks(ctx, ppy, COURT_MARGIN, {
        homeAbbr: this.venue.homeAbbr,
        club: this.venue.club,
        seed: this.venue.seed,
        home,
      });
    }

    ctx.strokeStyle = '#f3e3cb';
    ctx.lineWidth = Math.max(1, Math.round(ppy * 0.22));
    const line = (x1: number, y1: number, x2: number, y2: number): void => {
      ctx.beginPath();
      ctx.moveTo(fx(x1), fy(y1));
      ctx.lineTo(fx(x2), fy(y2));
      ctx.stroke();
    };
    const arc = (
      cx: number, cy: number, r: number, a0: number, a1: number, ccw = false,
    ): void => {
      ctx.beginPath();
      ctx.arc(fx(cx), fy(cy), r * ppy, a0, a1, ccw);
      ctx.stroke();
    };

    // Boundary and halfway.
    ctx.strokeRect(fx(0), fy(0), COURT.length * ppy, COURT.width * ppy);
    line(COURT.centerX, 0, COURT.centerX, COURT.width);
    arc(COURT.centerX, COURT.centerY, COURT.centerCircle, 0, Math.PI * 2);
    arc(COURT.centerX, COURT.centerY, 2, 0, Math.PI * 2);

    for (const side of ['home', 'away'] as Side[]) {
      const rim = attackRim(side);
      const toCourt = rim.x > COURT.centerX ? -1 : 1;
      const baseline = rim.x > COURT.centerX ? COURT.length : 0;

      // The key and the free-throw circle.
      const keyFar = baseline + toCourt * COURT.keyDepth;
      ctx.strokeRect(
        fx(Math.min(baseline, keyFar)), fy(COURT.centerY - COURT.keyWidth / 2),
        COURT.keyDepth * ppy, COURT.keyWidth * ppy,
      );
      arc(keyFar, COURT.centerY, COURT.freeThrowCircle,
        toCourt === 1 ? -Math.PI / 2 : Math.PI / 2,
        toCourt === 1 ? Math.PI / 2 : Math.PI * 1.5);

      // The restricted area under the basket.
      arc(rim.x, rim.y, COURT.restrictedRadius,
        toCourt === 1 ? -Math.PI / 2 : Math.PI / 2,
        toCourt === 1 ? Math.PI / 2 : Math.PI * 1.5);

      // The three-point line: straight in the corners, an arc above them. Drawn
      // exactly the way the rule defines it, because the corner three being the
      // shortest shot on the floor is a real part of how the game is played.
      const breakX = baseline + toCourt * COURT.cornerBreakX;
      line(baseline, COURT.cornerInset, breakX, COURT.cornerInset);
      line(baseline, COURT.width - COURT.cornerInset, breakX, COURT.width - COURT.cornerInset);
      const half = Math.acos(clamp(
        Math.abs(breakX - rim.x) / COURT.threeRadius, -1, 1,
      ));
      arc(rim.x, rim.y, COURT.threeRadius,
        toCourt === 1 ? -half : Math.PI - half,
        toCourt === 1 ? half : Math.PI + half);
    }

    /* THE LIGHT, last, over everything: a pool on the floor and darkness at the
     * edges. One gradient, and it does more for the picture than every line
     * above it — it is what says the court is lit and the room is not. */
    paintCourtLight(ctx, ppy, COURT_MARGIN);
  }
}

/** Darken or lighten a hex colour. */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.round(((n >> 16) & 255) * amount);
  const g = Math.round(((n >> 8) & 255) * amount);
  const b = Math.round((n & 255) * amount);
  return `rgb(${r},${g},${b})`;
}

/* --------------------------------------------------------------- the hoop */

/**
 * A basket, drawn as the three-dimensional object it is: a board standing up
 * off the floor, a ring hanging in front of it, and a net under that.
 */
export function drawHoop(
  ctx: CanvasRenderingContext2D, cam: CourtCamera, side: Side, accent: string,
): void {
  const rim = attackRim(side);
  const toCourt = rim.x > COURT.centerX ? -1 : 1;
  const boardX = rim.x - toCourt * (COURT.rimInset - COURT.boardInset);
  const px = (x: number, y: number): number => cam.projectX(x, y);
  const py = (x: number, y: number, z: number): number =>
    cam.projectY(x, y) - z * cam.ppy * LIFT;

  // The stanchion, so the board is not floating. Its base stands OUTSIDE the
  // baseline, where a real one does — put it under the board instead and the
  // lift draws a pole straight through the paint.
  const baseline = rim.x > COURT.centerX ? COURT.length : 0;
  const postFoot = baseline - toCourt * 2;
  // The basket at the near end of the screen is seen from behind, and its
  // stanchion — which really stands outside the baseline, below the bottom of the
  // picture — is lifted back up ACROSS the paint by the same convention that makes
  // a jump shot readable. So it is drawn faintly there: enough that the board is
  // not floating, not so much that there is a pole through the key.
  const behind = cam.projectY(postFoot, rim.y) < cam.projectY(rim.x, rim.y);
  ctx.globalAlpha = behind ? 0.8 : 0.26;
  ctx.fillStyle = '#2a2622';
  const postX = px(postFoot, rim.y);
  const postTop = py(postFoot, rim.y, COURT.boardTop);
  const postW = Math.max(2, cam.ppy * 0.36);
  ctx.fillRect(postX - postW / 2, postTop, postW, py(postFoot, rim.y, 0) - postTop);
  // And the arm that reaches from it out to the board.
  const armY = py(boardX, rim.y, COURT.boardTop - 0.6);
  ctx.beginPath();
  ctx.moveTo(postX - postW / 2, postTop);
  ctx.lineTo(px(boardX, rim.y), armY);
  ctx.lineTo(px(boardX, rim.y), armY + postW);
  ctx.lineTo(postX + postW / 2, postTop + postW);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  /* THE BACKBOARD.
   *
   * Seen nearly edge-on from above, so it is a tall thin face. What makes it
   * read as GLASS rather than as a rectangle of fog is that a real one is a pane
   * in a painted frame: the pane is dark and barely there, the padding along the
   * bottom edge is solid, and the two lines that matter — the outer border and
   * the shooter's square — are the brightest thing on it.
   */
  const bw = COURT.boardWidth * cam.ppy;
  const bh = (COURT.boardTop - COURT.boardBottom) * cam.ppy * LIFT;
  const bx = px(boardX, rim.y) - bw / 2;
  const by = py(boardX, rim.y, COURT.boardTop);

  // The pane. Dark and cold, because glass at night reflects the dark room.
  ctx.fillStyle = 'rgba(126, 148, 172, 0.2)';
  ctx.fillRect(bx, by, bw, bh);
  // A highlight down the top edge: the one place the arena lights catch it.
  ctx.fillStyle = 'rgba(236, 246, 255, 0.35)';
  ctx.fillRect(bx, by, bw, Math.max(1, cam.ppy * 0.12));
  // The padding along the bottom, which every board has and which is the part a
  // player's hands actually reach.
  const padH = Math.max(1, bh * 0.12);
  ctx.fillStyle = '#1d2027';
  ctx.fillRect(bx, by + bh - padH, bw, padH);

  ctx.strokeStyle = '#eef4fb';
  ctx.lineWidth = Math.max(1, cam.ppy * 0.13);
  ctx.strokeRect(bx, by, bw, bh);
  // The shooter's square.
  ctx.strokeRect(bx + bw * 0.31, by + bh * 0.42, bw * 0.38, bh * 0.46);

  const rx = px(rim.x, rim.y);
  const ry = py(rim.x, rim.y, COURT.rimHeight);
  const rr = COURT.rimRadius * cam.ppy;

  /* THE NET. Twelve cords rather than seven, crossed by two hoops of mesh, and
   * it TAPERS — a real net is wide at the ring and narrow at the bottom, and
   * getting that one shape right is most of why a basket looks like a basket. */
  const netDrop = 1.5 * cam.ppy * LIFT;
  const cords = 12;
  ctx.strokeStyle = 'rgba(248,250,255,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < cords; i++) {
    const a = (i / cords) * Math.PI * 2;
    ctx.moveTo(rx + Math.cos(a) * rr, ry + Math.sin(a) * rr * 0.5);
    ctx.lineTo(rx + Math.cos(a) * rr * 0.42, ry + netDrop);
  }
  ctx.stroke();
  // Two rings of mesh across the cords.
  ctx.strokeStyle = 'rgba(248,250,255,0.3)';
  for (const t of [0.45, 0.82]) {
    ctx.beginPath();
    ctx.ellipse(rx, ry + netDrop * t, rr * (1 - t * 0.58), rr * 0.5 * (1 - t * 0.5),
      0, 0, Math.PI * 2);
    ctx.stroke();
  }

  /* THE RING. Last and brightest, because it is what the player is aiming at —
   * and drawn as a ring with a lit front edge rather than a flat ellipse, so it
   * has a near side and a far side like a real one seen from above. */
  ctx.strokeStyle = shade(accent, 0.68);
  ctx.lineWidth = Math.max(1.5, cam.ppy * 0.24);
  ctx.beginPath();
  ctx.ellipse(rx, ry, rr, rr * 0.5, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.beginPath();
  ctx.ellipse(rx, ry, rr, rr * 0.5, 0, 0, Math.PI);
  ctx.stroke();
}

/* --------------------------------------------------------------- the ball */

/**
 * WHERE THE BALL HAS BEEN.
 *
 * A basketball spends most of a possession three feet off the floor and a third
 * of it twenty feet up, and on a court drawn from above those two look the same:
 * a small orange dot. The lift makes the height readable in principle, but only
 * if the eye can see the SHAPE of the flight — so a shot and a pass leave a short
 * fading trail behind them, and a dribble and a held ball leave none, because a
 * ball nobody has thrown has no flight to read.
 *
 * Twelve positions is about a fifth of a second, which is enough to show an arc
 * and not enough to smear the picture.
 */
const TRAIL_MAX = 12;
const trail: { x: number; y: number; z: number }[] = [];

export function drawBall(
  ctx: CanvasRenderingContext2D, cam: CourtCamera, ball: Ball,
): void {
  const sx = cam.projectX(ball.x, ball.y);
  const floorY = cam.projectY(ball.x, ball.y);
  const sy = floorY - ball.z * cam.ppy * LIFT;
  const r = Math.max(1.6, BALL_RADIUS * cam.ppy * 1.15);

  /* The trail is kept per FLIGHT rather than per frame: a new shot or pass wipes
   * what the last one left, so a rebound does not drag a line back across the
   * floor to where the miss came from. */
  const flying = ball.state === 'shot' || ball.state === 'pass';
  if (!flying) {
    trail.length = 0;
  } else {
    /* `age` is seconds since the ball's state last changed, so a fresh flight is
     * a young one — and a young flight wipes whatever the last one left rather
     * than dragging a line back across the floor to where the miss came from. */
    if (ball.age < 0.06) trail.length = 0;
    trail.push({ x: ball.x, y: ball.y, z: ball.z });
    if (trail.length > TRAIL_MAX) trail.shift();
    for (let i = 0; i < trail.length - 1; i++) {
      const t = i / TRAIL_MAX;
      const q = trail[i];
      const qx = cam.projectX(q.x, q.y);
      const qy = cam.projectY(q.x, q.y) - q.z * cam.ppy * LIFT;
      ctx.fillStyle = `rgba(255,170,90,${0.32 * t})`;
      const qr = Math.max(1, r * (0.35 + t * 0.55));
      ctx.beginPath();
      ctx.arc(qx, qy, qr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The shadow is what tells you how high it is.
  const high = clamp(ball.z / 14, 0, 1);
  ctx.fillStyle = `rgba(0,0,0,${0.34 * (1 - high * 0.7)})`;
  ctx.beginPath();
  ctx.ellipse(sx, floorY, r * (1 - high * 0.3), r * 0.4 * (1 - high * 0.3), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#e06a1f';
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  // Two seams, which is all a ball this size can carry and still read.
  ctx.strokeStyle = 'rgba(40,18,4,0.75)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx - r, sy);
  ctx.lineTo(sx + r, sy);
  ctx.moveTo(sx, sy - r);
  ctx.lineTo(sx, sy + r);
  ctx.stroke();
}

/* ------------------------------------------------------------- the players */

/**
 * A player, as a pixel figure.
 *
 * Built from rectangles at whatever scale the camera is running, because a
 * fixed-size sprite sheet would either be soft on a desktop or unreadable on a
 * phone. The pose changes the arms and the lean, which is the whole animation
 * system: a shooter's arms go up and stay up, a defender's go out, a dribbler's
 * drop to the ball, and a man going to the rim leans into it.
 */
export function drawCourtPlayer(
  ctx: CanvasRenderingContext2D, cam: CourtCamera, p: CourtPlayer,
  jersey: Jersey, marked: boolean, controlled: boolean,
): void {
  const sx = Math.round(cam.projectX(p.x, p.y));
  const floorY = Math.round(cam.projectY(p.x, p.y));
  const lift = p.z * cam.ppy * LIFT;
  const sy = Math.round(floorY - lift);

  // One unit is one foot of HEIGHT as the lift draws it, so a player is built in
  // the same currency as the rim above him and the arc of a shot between them.
  // He is drawn a little over seven of those feet tall: taller than scale, the
  // way an arcade game draws a man, because at ten men to a 50ft floor a figure
  // drawn at true scale on a phone is four pixels of nothing.
  const u = Math.max(1, cam.ppy * LIFT);
  const bodyH = u * 4.6;
  const bodyW = Math.max(2, Math.round(u * 1.7));
  const headR = Math.max(1.3, u * 0.62);
  const top = sy - bodyH;
  const torsoTop = Math.round(top + u * 1.15);
  const torsoH = Math.max(2, Math.round(u * 1.85));
  const legTop = torsoTop + torsoH - Math.round(u * 0.15);
  const legH = Math.max(2, sy - legTop);
  const legW = Math.max(1, Math.round(u * 0.62));

  // Shadow first, and it shrinks as he leaves the floor.
  const air = clamp(p.z / 3.5, 0, 1);
  ctx.fillStyle = `rgba(0,0,0,${0.36 * (1 - air * 0.55)})`;
  ctx.beginPath();
  ctx.ellipse(sx, floorY, bodyW * 0.62 * (1 - air * 0.25), bodyW * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  /* THE REFLECTION.
   *
   * A basketball floor is varnished, and a varnished floor under arena lights
   * holds a smeared copy of everything standing on it. It is the single cheapest
   * thing that separates "a sports game" from "shapes on a brown rectangle", and
   * here it is three rectangles at a tenth of the alpha, squashed to a bit over a
   * third of the height and fading out as they go.
   *
   * It fades as the man leaves the floor, because a reflection belongs to
   * contact: a player at the top of a dunk has nothing on the boards under him.
   */
  const gloss = 0.14 * (1 - air);
  if (gloss > 0.01 && u >= 2) {
    const mirrorH = bodyH * 0.38;
    const steps = 3;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      ctx.globalAlpha = gloss * (1 - t * 0.8);
      ctx.fillStyle = i === 0 ? jersey.primary : shade(jersey.primary, 0.7);
      ctx.fillRect(
        Math.round(sx - bodyW * (0.5 - t * 0.08)),
        Math.round(floorY + t * mirrorH),
        Math.round(bodyW * (1 - t * 0.16)),
        Math.ceil(mirrorH / steps),
      );
    }
    ctx.globalAlpha = 1;
  }

  /* The mark under the man you control, or the man with the ball.
   *
   * Control moves on its own — a pass hands you the receiver — so when it has
   * just moved the ring PULSES for a third of a second. Without that the ball
   * arrives, the man you were steering stops answering the stick, and it reads
   * as the controls having broken rather than as control having moved. */
  if (controlled || marked) {
    const pulse = controlled ? Math.min(1, p.flash / 0.3) : 0;
    ctx.strokeStyle = controlled ? '#ffffff' : jersey.secondary;
    ctx.lineWidth = Math.max(1, u * (0.22 + pulse * 0.24));
    ctx.beginPath();
    ctx.ellipse(sx, floorY + u * 0.15,
      bodyW * (0.82 + pulse * 0.5), bodyW * (0.38 + pulse * 0.24), 0, 0, Math.PI * 2);
    ctx.stroke();
    if (pulse > 0) {
      ctx.globalAlpha = pulse * 0.55;
      ctx.beginPath();
      ctx.ellipse(sx, floorY + u * 0.15,
        bodyW * (1.1 + pulse * 0.7), bodyW * (0.5 + pulse * 0.32), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /* THE LEAN comes from the player, smoothed by the engine, and it tips the way
   * he is actually going. Reading a fixed number off the pose meant every change
   * of shape was a snap, and every lean was toward positive x whichever way the
   * man was running. */
  const leanX = Math.cos(p.leanDir - (cam.rotate ? 0 : 0));
  const lean = p.lean * u * clamp(leanX, -1, 1);

  // A dark edge around the solid parts, so ten men in warm kit still read against
  // a floor that is itself warm. Hugging the body rather than boxing it: a single
  // rectangle behind the whole figure turns every player into a dark card.
  const edge = Math.max(1, Math.round(u * 0.16));
  ctx.fillStyle = 'rgba(12,8,4,0.75)';
  ctx.fillRect(
    Math.round(sx - bodyW / 2 + lean * 0.3) - edge, torsoTop - edge,
    bodyW + edge * 2, torsoH + edge * 2,
  );
  ctx.fillRect(sx - Math.round(bodyW * 0.46) - edge, legTop, bodyW + edge * 2, legH + edge);

  // Legs.
  ctx.fillStyle = shade(jersey.primary, 0.62);
  /* THE STRIDE runs at the speed the man is moving, because the engine advances
   * his phase by his own pace. It used to be `performance.now()`, which gave a
   * man standing still and a man at a dead sprint exactly the same legs — and
   * made the renderer impossible to test, because it read a wall clock. */
  const pace = Math.hypot(p.vx, p.vy);
  const stride = pace > 0.8 && p.z < 0.05
    ? Math.sin(p.stridePhase) * u * clamp(0.18 + pace / 26, 0.18, 0.5)
    : 0;
  // Airborne, the legs tuck rather than churn.
  const tuck = p.z > 0.05 ? u * 0.3 : 0;
  ctx.fillRect(Math.round(sx - bodyW * 0.44 + stride), legTop,
    legW, Math.round(legH - tuck));
  ctx.fillRect(Math.round(sx + bodyW * 0.44 - legW - stride), legTop,
    legW, Math.round(legH - tuck * 0.5));

  // Torso.
  ctx.fillStyle = jersey.primary;
  ctx.fillRect(Math.round(sx - bodyW / 2 + lean * 0.3), torsoTop, bodyW, torsoH);
  // Trim across the chest so two teams never read the same.
  ctx.fillStyle = jersey.secondary;
  ctx.fillRect(
    Math.round(sx - bodyW / 2 + lean * 0.3), torsoTop,
    bodyW, Math.max(1, Math.round(u * 0.26)),
  );

  /* ARMS, DRAWN FROM WHERE THEY ACTUALLY ARE.
   *
   * The engine eases each arm's angle and reach toward what the pose wants (see
   * `poseArmTarget`), so this does no deciding at all: it takes two numbers per
   * arm and draws a limb. That is the whole difference between a shape that
   * SNAPS between poses and a body that moves into them — a renderer cannot ease
   * anything, because it has no memory of the frame before.
   *
   * An arm is two segments so it can bend: upper from the shoulder, forearm
   * carrying on from the elbow at a fraction of the angle, which reads as a
   * joint without needing a joint.
   */
  ctx.fillStyle = shade(jersey.primary, 1.12);
  const armW = Math.max(1, Math.round(u * 0.42));
  const shoulder = torsoTop + Math.round(u * 0.28);
  const limb = (side: -1 | 1, angle: number, reach: number): void => {
    /* Drawn twice: a dark pass a pixel thicker, then the kit colour over it. Ten
     * men in light change strips on a pale maple floor need an edge or the arms
     * dissolve into the boards — the same reason the torso has one. */
    const ox = sx + side * bodyW * 0.44 + lean * 0.3;
    const upper = u * (0.72 + reach * 0.5);
    const fore = u * (0.6 + reach * 0.55);
    /* Angle is measured from straight DOWN and opens toward the outside of the
     * body, so the same number means the same shape on both arms. Screen space
     * has y going down, hence the sign. */
    const a = -Math.PI / 2 - side * angle;
    const ex = ox + Math.cos(a) * upper;
    const ey = shoulder - Math.sin(a) * upper * LIFT_ARM;
    // Forearm carries on a little straighter, which is what an elbow does.
    const a2 = a - side * angle * 0.22;
    const hx = ex + Math.cos(a2) * fore;
    const hy = ey - Math.sin(a2) * fore * LIFT_ARM;
    const keep = ctx.fillStyle;
    ctx.fillStyle = 'rgba(12,8,4,0.7)';
    segment(ctx, ox, shoulder, ex, ey, armW + edge);
    segment(ctx, ex, ey, hx, hy, Math.max(1, armW - 1) + edge);
    ctx.fillStyle = keep;
    segment(ctx, ox, shoulder, ex, ey, armW);
    segment(ctx, ex, ey, hx, hy, Math.max(1, armW - 1));
  };
  limb(-1, p.armAngleL, p.armReachL);
  limb(1, p.armAngleR, p.armReachR);

  // Head, with the same dark edge and a cap of hair, so the face is not the
  // biggest and brightest thing on the man.
  const hx = sx + lean * 0.5;
  const hy = Math.round(top + headR);
  ctx.fillStyle = 'rgba(14,9,5,0.8)';
  ctx.beginPath();
  ctx.arc(hx, hy, headR + Math.max(0.8, u * 0.16), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c98f5e';
  ctx.beginPath();
  ctx.arc(hx, hy, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b1c12';
  ctx.beginPath();
  ctx.arc(hx, hy, headR, Math.PI * 1.08, Math.PI * 1.92);
  ctx.fill();

  // Number, only when there is room for it to be legible.
  if (u >= 3.2) {
    ctx.fillStyle = jersey.ink;
    ctx.font = `${Math.round(u * 1.1)}px ${'monospace'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(p.data.number), sx + lean * 0.3, torsoTop + torsoH * 0.62);
  }
}

/**
 * How much of an arm's vertical reach survives the three-quarter view.
 *
 * The same compression the whole picture uses for height, and it has to be the
 * same number or a raised arm would reach past the rim it is shooting at.
 */
const LIFT_ARM = LIFT * 1.62;

/** A limb: a rectangle between two points, thick enough to read at any zoom. */
function segment(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number, w: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 0.4) return;
  ctx.save();
  ctx.translate(x1, y1);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.fillRect(0, -w / 2, len, w);
  ctx.restore();
}

/** Painter's order: whoever is further up the screen is drawn first. */
export function sortForDraw(players: CourtPlayer[], cam: CourtCamera): CourtPlayer[] {
  return [...players].sort((a, b) => cam.projectY(a.x, a.y) - cam.projectY(b.x, b.y));
}
