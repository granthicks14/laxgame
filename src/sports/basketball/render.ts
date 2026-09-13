import { clamp } from '../../core/math';
import { COURT, attackRim, type Side } from './court';
import { BALL_RADIUS, type Ball } from './ball';
import type { CourtCamera } from './camera';
import type { CourtPlayer, Pose } from './types';

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
export const COURT_MARGIN = 9;

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

  /** Rebuild if the zoom or the theme changed. Returns the canvas to blit. */
  ensure(ppy: number, home: Jersey, away: Jersey): HTMLCanvasElement {
    const seed = `${home.primary}|${away.primary}`;
    if (Math.abs(ppy - this.builtPpy) < 0.01 && seed === this.builtSeed) return this.canvas;
    this.builtPpy = ppy;
    this.builtSeed = seed;
    this.paint(ppy, home, away);
    return this.canvas;
  }

  private paint(ppy: number, home: Jersey, away: Jersey): void {
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

    // The arena floor around the court: dark enough that the hardwood reads as
    // lit, light enough that it reads as a floor rather than as the edge of the
    // world. The apron is where the camera spends its margin, so it has to be
    // somewhere rather than nowhere.
    ctx.fillStyle = '#241a12';
    ctx.fillRect(0, 0, w, h);
    // The run-off strip immediately outside the lines, a shade up from the rest,
    // so the boundary has depth and a ball going out has somewhere to go.
    ctx.fillStyle = '#2f2217';
    ctx.fillRect(
      fx(-4), fy(-4), (COURT.length + 8) * ppy, (COURT.width + 8) * ppy,
    );

    // The hardwood itself, with boards running the length of the floor.
    const boardH = Math.max(2, Math.round(2.6 * ppy));
    for (let y = 0; y < COURT.width; y += 2.6) {
      const shade = Math.floor(y / 2.6) % 2 === 0 ? '#b9793f' : '#b07439';
      ctx.fillStyle = shade;
      ctx.fillRect(fx(0), fy(y), COURT.length * ppy, boardH);
    }
    // A darker painted key at each end, which is how a real floor is finished.
    for (const side of ['home', 'away'] as Side[]) {
      const rim = attackRim(side);
      const dir = rim.x > COURT.centerX ? -1 : 1;
      const x0 = rim.x > COURT.centerX ? COURT.length - COURT.keyDepth : 0;
      // Painted, not cut out of the floor: the colour is laid over the boards at
      // part strength so the grain still shows through, the way a real key looks.
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = shade(side === 'home' ? away.primary : home.primary, 0.86);
      ctx.fillRect(
        fx(x0), fy(COURT.centerY - COURT.keyWidth / 2),
        COURT.keyDepth * ppy, COURT.keyWidth * ppy,
      );
      ctx.restore();
      void dir;
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

  // The backboard: a pane, seen nearly edge-on from above, so it is drawn as a
  // tall thin face with the shooter's square on it.
  const bw = COURT.boardWidth * cam.ppy;
  const bh = (COURT.boardTop - COURT.boardBottom) * cam.ppy * LIFT;
  const bx = px(boardX, rim.y) - bw / 2;
  const by = py(boardX, rim.y, COURT.boardTop);
  ctx.fillStyle = 'rgba(232, 240, 248, 0.24)';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#e8f0f8';
  ctx.lineWidth = Math.max(1, cam.ppy * 0.13);
  ctx.strokeRect(bx, by, bw, bh);
  // The square.
  ctx.strokeRect(bx + bw * 0.31, by + bh * 0.42, bw * 0.38, bh * 0.46);

  // The net, hanging below the ring.
  const rx = px(rim.x, rim.y);
  const ry = py(rim.x, rim.y, COURT.rimHeight);
  const rr = COURT.rimRadius * cam.ppy;
  const netDrop = 1.4 * cam.ppy * LIFT;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(rx + Math.cos(a) * rr, ry + Math.sin(a) * rr * 0.5);
    ctx.lineTo(rx + Math.cos(a) * rr * 0.55, ry + netDrop);
    ctx.stroke();
  }

  // The ring itself, last and brightest: it is what the player is aiming at.
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1.5, cam.ppy * 0.22);
  ctx.beginPath();
  ctx.ellipse(rx, ry, rr, rr * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();
}

/* --------------------------------------------------------------- the ball */

export function drawBall(
  ctx: CanvasRenderingContext2D, cam: CourtCamera, ball: Ball,
): void {
  const sx = cam.projectX(ball.x, ball.y);
  const floorY = cam.projectY(ball.x, ball.y);
  const sy = floorY - ball.z * cam.ppy * LIFT;
  const r = Math.max(1.6, BALL_RADIUS * cam.ppy * 1.15);

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

  // The mark under the man you control, or the man with the ball.
  if (controlled || marked) {
    ctx.strokeStyle = controlled ? '#ffffff' : jersey.secondary;
    ctx.lineWidth = Math.max(1, u * 0.22);
    ctx.beginPath();
    ctx.ellipse(sx, floorY + u * 0.15, bodyW * 0.82, bodyW * 0.38, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  const lean = poseLean(p.pose) * u;

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
  const stride = p.pose === 'run' || p.pose === 'dribble'
    ? Math.sin(performance.now() / 90 + p.slot) * u * 0.42
    : 0;
  ctx.fillRect(Math.round(sx - bodyW * 0.44 + stride), legTop, legW, legH);
  ctx.fillRect(Math.round(sx + bodyW * 0.44 - legW - stride), legTop, legW, legH);

  // Torso.
  ctx.fillStyle = jersey.primary;
  ctx.fillRect(Math.round(sx - bodyW / 2 + lean * 0.3), torsoTop, bodyW, torsoH);
  // Trim across the chest so two teams never read the same.
  ctx.fillStyle = jersey.secondary;
  ctx.fillRect(
    Math.round(sx - bodyW / 2 + lean * 0.3), torsoTop,
    bodyW, Math.max(1, Math.round(u * 0.26)),
  );

  // Arms, which is where the pose lives.
  ctx.fillStyle = shade(jersey.primary, 1.12);
  const armW = Math.max(1, Math.round(u * 0.42));
  const shoulder = torsoTop + Math.round(u * 0.2);
  switch (p.pose) {
    case 'shoot':
    case 'gather':
      // Both hands up and in front.
      ctx.fillRect(Math.round(sx - bodyW * 0.62), shoulder - Math.round(u * 1.5), armW, Math.round(u * 1.8));
      ctx.fillRect(Math.round(sx + bodyW * 0.18), shoulder - Math.round(u * 1.9), armW, Math.round(u * 2.2));
      break;
    case 'layup':
    case 'dunk':
      // One hand high, the body stretched toward the rim.
      ctx.fillRect(Math.round(sx + bodyW * 0.3), shoulder - Math.round(u * 2.4), armW, Math.round(u * 2.7));
      break;
    case 'defend':
      // Arms wide: the only pose that says "I am guarding you".
      ctx.fillRect(Math.round(sx - bodyW * 1.0), shoulder, armW, Math.round(u * 1.1));
      ctx.fillRect(Math.round(sx + bodyW * 0.55), shoulder, armW, Math.round(u * 1.1));
      break;
    case 'jump':
    case 'rebound':
      ctx.fillRect(Math.round(sx - bodyW * 0.72), shoulder - Math.round(u * 2.0), armW, Math.round(u * 2.3));
      ctx.fillRect(Math.round(sx + bodyW * 0.26), shoulder - Math.round(u * 2.0), armW, Math.round(u * 2.3));
      break;
    case 'pass':
      ctx.fillRect(Math.round(sx + bodyW * 0.42), shoulder - Math.round(u * 0.3), Math.round(u * 1.3), armW);
      break;
    case 'screen':
      ctx.fillRect(Math.round(sx - bodyW * 0.95), shoulder + Math.round(u * 0.2), Math.round(u * 1.9), armW);
      break;
    case 'dribble':
      // One arm down on the ball.
      ctx.fillRect(Math.round(sx + bodyW * 0.34), shoulder + Math.round(u * 0.5), armW, Math.round(u * 1.4));
      break;
    default:
      ctx.fillRect(Math.round(sx - bodyW * 0.6), shoulder, armW, Math.round(u * 1.5));
      ctx.fillRect(Math.round(sx + bodyW * 0.14), shoulder, armW, Math.round(u * 1.5));
  }

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

/** How far a pose leans the body, in body units. */
function poseLean(pose: Pose): number {
  switch (pose) {
    case 'layup':
    case 'dunk': return 0.8;
    case 'run': return 0.4;
    case 'dribble': return 0.25;
    case 'down': return 1.4;
    default: return 0;
  }
}

/** Painter's order: whoever is further up the screen is drawn first. */
export function sortForDraw(players: CourtPlayer[], cam: CourtCamera): CourtPlayer[] {
  return [...players].sort((a, b) => cam.projectY(a.x, a.y) - cam.projectY(b.x, b.y));
}
