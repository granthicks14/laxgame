import { clamp } from '../../core/math';
import { FIELD } from './field';
import type { FieldCamera } from './camera';
import type { FieldPlayer, FootballBall } from './types';

/* ---------------------------------------------------------------------------
 * TWENTY-TWO MEN AND A BALL
 * ---------------------------------------------------------------------------
 * A football player is drawn differently from the other two sports' players and
 * the reason is armour. A basketball player is a body; a footballer is a helmet,
 * a pair of shoulders twice the width of the man inside them, and a number. At
 * the size these figures are drawn, the SILHOUETTE is the whole thing — nobody
 * is reading a face — so the shoulders are exaggerated, the helmet is a solid
 * blob of team colour with a facemask on the front, and the number goes on the
 * back where the camera can actually see it.
 *
 * FACING IS THE OTHER HALF. Twenty-two figures in two colours on a green field
 * are unreadable unless each one is visibly pointing somewhere: a receiver
 * turning back for a ball, a lineman squared up, a corner opening his hips. So
 * every man is drawn around his facing angle rather than flat on, and the helmet
 * sits forward of the shoulders by the amount he is turned.
 * ------------------------------------------------------------------------- */

export interface Kit {
  jersey: string;
  trim: string;
  helmet: string;
  numbers: string;
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number): number => Math.round(
    amount >= 1 ? c + (255 - c) * (amount - 1) : c * amount,
  );
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

/** Turn a hex colour into a kit: jersey, trim, helmet and legible numbers. */
export function kitFor(primary: string, secondary: string, dark: boolean): Kit {
  return {
    jersey: dark ? primary : shade(primary, 1.55),
    trim: secondary,
    helmet: dark ? shade(primary, 0.78) : shade(primary, 1.3),
    numbers: dark ? '#f4f1e8' : shade(primary, 0.4),
  };
}

/**
 * Draw one man.
 *
 * `controlled` gets the ring; `carrier` gets the ball tucked under an arm. The
 * pose changes the shape rather than swapping a sprite, because at this size a
 * sprite swap reads as a flicker and a shape change reads as a movement.
 */
export function drawPlayer(
  ctx: CanvasRenderingContext2D, cam: FieldCamera, p: FieldPlayer,
  kit: Kit, controlled: boolean, carrier: boolean,
): void {
  const sx = cam.projectX(p.x, p.y);
  const sy = cam.projectY(p.x, p.y);
  const u = Math.max(1.6, cam.ppy);

  /* THE FACING, THROUGH THE MIRROR. The camera can flip the whole world, and a
   * man's heading has to flip with it or every player on the field faces the
   * wrong way for one of the two teams. */
  const face = cam.upfield > 0 ? p.facing : p.facing + Math.PI;
  const fx = Math.cos(face);
  const fy = -Math.sin(face);

  const shoulder = u * 1.55;
  const bodyH = u * 1.5;
  const headR = u * 0.52;
  const down = p.pose === 'down';

  // The shadow, which is what keeps a figure attached to the grass.
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + u * 0.18, shoulder * 0.55, shoulder * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  if (controlled) {
    const pulse = Math.min(1, p.flash / 0.3);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, u * (0.16 + pulse * 0.2));
    ctx.beginPath();
    ctx.ellipse(sx, sy + u * 0.2, shoulder * (0.78 + pulse * 0.45),
      shoulder * (0.4 + pulse * 0.22), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (down) {
    // Flat on the turf: the whole figure lies along his heading.
    ctx.fillStyle = shade(kit.jersey, 0.8);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.atan2(fy, fx));
    ctx.fillRect(-shoulder * 0.7, -u * 0.34, shoulder * 1.4, u * 0.68);
    ctx.fillStyle = kit.helmet;
    ctx.beginPath();
    ctx.arc(shoulder * 0.62, 0, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  /* THE LEGS. Two of them, out of phase, swung by the stride the engine has been
   * advancing at the speed he is running — so a man at a walk shuffles and a man
   * at a sprint churns, from the same three lines of drawing code. */
  const pace = Math.hypot(p.vx, p.vy);
  const swing = Math.sin(p.stridePhase) * clamp(pace / 7, 0, 1) * u * 0.5;
  const legW = Math.max(1, Math.round(u * 0.34));
  ctx.fillStyle = shade(kit.jersey, 0.62);
  ctx.fillRect(Math.round(sx - u * 0.42 - legW / 2), Math.round(sy - bodyH * 0.1),
    legW, Math.max(1, Math.round(bodyH * 0.5 + swing)));
  ctx.fillRect(Math.round(sx + u * 0.42 - legW / 2), Math.round(sy - bodyH * 0.1),
    legW, Math.max(1, Math.round(bodyH * 0.5 - swing)));

  // The shoulders: a slab across his heading, which is most of the silhouette.
  ctx.save();
  ctx.translate(sx, sy - bodyH * 0.55);
  ctx.rotate(Math.atan2(fy, fx) + Math.PI / 2);

  ctx.fillStyle = 'rgba(10,14,10,0.55)';
  ctx.fillRect(-shoulder * 0.5 - 1, -u * 0.46 - 1, shoulder + 2, u * 0.92 + 2);
  ctx.fillStyle = kit.jersey;
  ctx.fillRect(-shoulder * 0.5, -u * 0.46, shoulder, u * 0.92);
  // A trim stripe across the shoulders, which is what makes two kits tell apart.
  ctx.fillStyle = kit.trim;
  ctx.fillRect(-shoulder * 0.5, -u * 0.46, shoulder, Math.max(1, u * 0.18));

  // The number, on the back, big enough to matter and small enough to fit.
  if (u >= 5.5) {
    ctx.fillStyle = kit.numbers;
    ctx.font = `bold ${Math.round(u * 0.62)}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(p.data.number), 0, u * 0.1);
  }
  ctx.restore();

  /* THE ARMS, and they are the pose. A blocker's are out in front, a passer's
   * are up and back, a catcher's reach for the ball. Two short bars, and they
   * carry more of the read than anything else on the figure. */
  const armY = sy - bodyH * 0.55;
  const armLen = p.pose === 'block' || p.pose === 'rush' ? u * 0.85
    : p.pose === 'catch' ? u * 0.75 : u * 0.4;
  if (armLen > u * 0.5) {
    ctx.strokeStyle = shade(kit.jersey, 1.25);
    ctx.lineWidth = Math.max(1, u * 0.24);
    ctx.beginPath();
    for (const off of [-0.42, 0.42]) {
      const ox = -fy * off * shoulder;
      const oy = fx * off * shoulder;
      ctx.moveTo(sx + ox, armY + oy);
      ctx.lineTo(sx + ox + fx * armLen, armY + oy + fy * armLen);
    }
    ctx.stroke();
  }

  // The helmet, forward of the shoulders by however far he is turned.
  const hx = sx + fx * u * 0.2;
  const hy = sy - bodyH * 0.55 - u * 0.5 + fy * u * 0.2;
  ctx.fillStyle = 'rgba(8,10,8,0.5)';
  ctx.beginPath();
  ctx.arc(hx, hy + 1, headR + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = kit.helmet;
  ctx.beginPath();
  ctx.arc(hx, hy, headR, 0, Math.PI * 2);
  ctx.fill();
  // The facemask: one bar on the front, and it is how you tell which way he looks.
  if (u >= 4) {
    ctx.strokeStyle = '#d8d4c8';
    ctx.lineWidth = Math.max(1, u * 0.13);
    ctx.beginPath();
    ctx.moveTo(hx + fx * headR * 0.55 - fy * headR * 0.5, hy + fy * headR * 0.55 + fx * headR * 0.5);
    ctx.lineTo(hx + fx * headR * 0.55 + fy * headR * 0.5, hy + fy * headR * 0.55 - fx * headR * 0.5);
    ctx.stroke();
  }

  // The ball, tucked high and tight under the outside arm.
  if (carrier) {
    const bx = hx - fy * u * 0.6;
    const by = hy + fx * u * 0.6 + u * 0.55;
    ctx.fillStyle = '#7a4420';
    ctx.beginPath();
    ctx.ellipse(bx, by, u * 0.3, u * 0.19, Math.atan2(fy, fx), 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * THE BALL IN THE AIR.
 *
 * Height is drawn as a lift up the screen plus a shadow left behind on the
 * grass, the same trick every other sport in this hub uses — and it is the only
 * way a flat camera can show a pass arcing over a linebacker rather than
 * through him. The spiral is a rotation on the long axis, which at this size is
 * a two-pixel wobble and still reads as spin.
 */
export function drawBall(
  ctx: CanvasRenderingContext2D, cam: FieldCamera, ball: FootballBall, time: number,
): void {
  if (ball.state === 'held' || ball.state === 'dead') return;
  const u = Math.max(2, cam.ppy);
  const sx = cam.projectX(ball.x, ball.y);
  const groundY = cam.projectY(ball.x, ball.y);
  const lift = ball.z * u * 0.55;

  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(sx, groundY, u * 0.26, u * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  const angle = Math.atan2(ball.vy * cam.upfield, ball.vx * cam.upfield);
  ctx.save();
  ctx.translate(sx, groundY - lift);
  ctx.rotate(-angle + Math.sin(time * 26) * 0.12);
  ctx.fillStyle = '#8a4d22';
  ctx.beginPath();
  ctx.ellipse(0, 0, u * 0.36, u * 0.21, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#efe6d2';
  ctx.fillRect(-u * 0.1, -u * 0.2, Math.max(1, u * 0.2), Math.max(1, u * 0.09));
  ctx.restore();
}

/**
 * WHERE A THROW IS POINTED.
 *
 * Only ever drawn for the person holding the ball, and only while he can still
 * throw it. It marks the receiver the aim currently resolves to, which is the
 * single most important thing a passing game can tell a player before he commits
 * — a passing mechanic where you find out who you threw to afterwards is a
 * guessing game, not a skill.
 */
export function drawAim(
  ctx: CanvasRenderingContext2D, cam: FieldCamera,
  qb: FieldPlayer, target: FieldPlayer | null, time: number,
): void {
  if (!target) return;
  const u = Math.max(2, cam.ppy);
  const ax = cam.projectX(qb.x, qb.y);
  const ay = cam.projectY(qb.x, qb.y);
  const bx = cam.projectX(target.x, target.y);
  const by = cam.projectY(target.x, target.y);

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#f5d312';
  ctx.lineWidth = Math.max(1, u * 0.12);
  ctx.setLineDash([u * 0.5, u * 0.5]);
  ctx.lineDashOffset = -time * u * 4;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  const pulse = 0.8 + Math.sin(time * 8) * 0.2;
  ctx.strokeStyle = '#f5d312';
  ctx.lineWidth = Math.max(1.5, u * 0.18);
  ctx.beginPath();
  ctx.arc(bx, by, u * 0.95 * pulse, 0, Math.PI * 2);
  ctx.stroke();
}

/** Far men behind near men, so a pile of bodies has a front and a back. */
export function sortForDraw(players: FieldPlayer[], upfield: 1 | -1): FieldPlayer[] {
  return [...players].sort((a, b) => (b.y - a.y) * upfield);
}

/** Keep a marker on a man who has run off the top of the view. */
export function drawOffscreenMark(
  ctx: CanvasRenderingContext2D, cam: FieldCamera, p: FieldPlayer,
  kit: Kit, w: number, h: number,
): void {
  const sx = cam.projectX(p.x, p.y);
  const sy = cam.projectY(p.x, p.y);
  if (sx > -8 && sx < w + 8 && sy > -8 && sy < h + 8) return;
  const u = Math.max(3, cam.ppy);
  const cx = clamp(sx, u, w - u);
  const cy = clamp(sy, u, h - u);
  ctx.fillStyle = kit.jersey;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(cx, cy, u * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  void FIELD;
}
