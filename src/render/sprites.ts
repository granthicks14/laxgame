import { FIELD, attackingGoal, attackDir, type Side } from '../data/constants';
import type { MatchPlayer } from '../match/types';
import type { Camera } from './camera';

export interface Jersey {
  body: string;
  accent: string;
  trim: string;
  helmet: string;
}

const r = Math.round;

/** Sprite outline. Dark enough to separate any jersey from any pitch. */
const OUTLINE = '#0c1116';

/** Slightly darken a hex colour for shading. */
export function shade(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  let rr = (n >> 16) & 255;
  let gg = (n >> 8) & 255;
  let bb = n & 255;
  rr = Math.max(0, Math.min(255, Math.round(rr * (1 + amount))));
  gg = Math.max(0, Math.min(255, Math.round(gg * (1 + amount))));
  bb = Math.max(0, Math.min(255, Math.round(bb * (1 + amount))));
  return `rgb(${rr},${gg},${bb})`;
}

export function drawShadow(ctx: CanvasRenderingContext2D, sx: number, sy: number, u: number, scale = 1): void {
  ctx.globalAlpha = 0.26;
  ctx.fillStyle = '#000000';
  const w = Math.max(2, r(u * 0.95 * scale));
  const h = Math.max(1, r(u * 0.34 * scale));
  ctx.fillRect(r(sx - w / 2), r(sy - h / 2), w, h);
  ctx.globalAlpha = 1;
}

export interface PlayerDrawOpts {
  jersey: Jersey;
  controlled: boolean;
  hasBall: boolean;
  /** 0..1 shot charge to draw as a ring. */
  charge: number;
  teamColor: string;
  dim: boolean;
}

export function drawPlayer(
  ctx: CanvasRenderingContext2D, cam: Camera, p: MatchPlayer, o: PlayerDrawOpts,
): void {
  const u = cam.ppy;
  const sx = cam.projectX(p.x, p.y);
  const sy = cam.projectY(p.x, p.y);

  drawShadow(ctx, sx, sy, u, p.animPose === 'down' ? 1.35 : 1);

  const down = p.animPose === 'down' || p.stun > 0;
  const speed = Math.hypot(p.vx, p.vy);
  const stride = down ? 0 : Math.sin(p.animPhase * 2.2) * Math.min(1, speed / 6);

  const bodyW = Math.max(3, r(u * 0.78));
  const bodyH = Math.max(3, r(u * (down ? 0.42 : 0.72)));
  const legH = Math.max(2, r(u * (down ? 0.12 : 0.44)));
  const headS = Math.max(2, r(u * 0.5));

  const feetY = r(sy);
  const bodyY = feetY - legH - bodyH;
  const headY = bodyY - headS + 1;
  const cx = r(sx);

  if (o.dim) ctx.globalAlpha = 0.72;

  const legW = Math.max(1, r(bodyW * 0.28));
  const legLX = cx - r(bodyW * 0.32) - r(legW / 2);
  const legRX = cx + r(bodyW * 0.32) - r(legW / 2);
  const legLY = feetY - legH + r(stride * legH * 0.35);
  const legRY = feetY - legH - r(stride * legH * 0.35);

  // Outline pass. A dark silhouette behind every part keeps a dark jersey from
  // disappearing into a dark field — Southlake's green on turf, for instance.
  const ol = Math.max(1, Math.round(u / 9));
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(legLX - ol, legLY, legW + ol * 2, legH + ol);
  ctx.fillRect(legRX - ol, legRY, legW + ol * 2, legH + ol);
  ctx.fillRect(cx - r(bodyW / 2) - ol, bodyY - ol, bodyW + ol * 2, bodyH + ol * 2);
  ctx.fillRect(cx - r(headS / 2) - ol, headY - ol, headS + ol * 2, headS + ol * 2);

  // Legs
  ctx.fillStyle = shade(o.jersey.body, -0.45);
  ctx.fillRect(legLX, legLY, legW, legH);
  ctx.fillRect(legRX, legRY, legW, legH);

  // Body (jersey) with a shoulder band in the accent colour
  ctx.fillStyle = o.jersey.body;
  ctx.fillRect(cx - r(bodyW / 2), bodyY, bodyW, bodyH);
  ctx.fillStyle = o.jersey.accent;
  ctx.fillRect(cx - r(bodyW / 2), bodyY, bodyW, Math.max(1, r(bodyH * 0.28)));
  // Shoulder pads
  ctx.fillStyle = shade(o.jersey.body, 0.18);
  ctx.fillRect(cx - r(bodyW / 2) - 1, bodyY, bodyW + 2, Math.max(1, r(u * 0.12)));

  // Helmet
  ctx.fillStyle = o.jersey.helmet;
  ctx.fillRect(cx - r(headS / 2), headY, headS, headS);
  ctx.fillStyle = shade(o.jersey.helmet, -0.35);
  const faceDir = Math.cos(p.facing);
  const faceOff = r(faceDir * headS * 0.22);
  ctx.fillRect(cx - r(headS / 2) + faceOff, headY + r(headS * 0.45), headS, Math.max(1, r(headS * 0.22)));

  // Stick
  const stickLen = u * 1.5;
  const sa = p.facing - 1.15 + (p.animPose === 'wind' ? -0.5 : 0) + (p.animPose === 'throw' ? 0.9 : 0);
  const hx = cx + Math.cos(sa) * stickLen * 0.55;
  const hy = bodyY + r(bodyH * 0.25) + Math.sin(sa) * stickLen * 0.3;
  ctx.strokeStyle = down ? '#6b6f78' : '#d7d2c6';
  ctx.lineWidth = Math.max(1, Math.round(u / 6));
  ctx.beginPath();
  ctx.moveTo(cx, bodyY + r(bodyH * 0.5));
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.fillStyle = o.jersey.accent;
  const headW = Math.max(2, r(u * 0.32));
  ctx.fillRect(r(hx - headW / 2), r(hy - headW / 2), headW, headW);

  if (o.hasBall) {
    ctx.fillStyle = '#fdfdf5';
    const bs = Math.max(1, r(u * 0.2));
    ctx.fillRect(r(hx - bs / 2), r(hy - bs / 2), bs, bs);
  }

  ctx.globalAlpha = 1;

  // Control marker: a ring on the turf plus a chevron overhead, so the player you
  // are steering is unmistakable even in a crowd.
  if (o.controlled) {
    ctx.strokeStyle = '#ffe14d';
    ctx.lineWidth = Math.max(1, Math.round(u / 7));
    ctx.beginPath();
    ctx.ellipse(cx, feetY, u * 0.62, u * 0.26, 0, 0, Math.PI * 2);
    ctx.stroke();

    const t = performance.now() / 260;
    const bob = Math.sin(t) * u * 0.1;
    const my = headY - r(u * 0.55 + bob);
    const wdt = Math.max(4, r(u * 0.6));
    const th = Math.max(1, r(u * 0.16));
    ctx.fillStyle = '#141b23';
    ctx.fillRect(cx - r(wdt / 2) - 1, my - 1, wdt + 2, th * 2 + 2);
    ctx.fillStyle = '#ffe14d';
    ctx.fillRect(cx - r(wdt / 2), my, wdt, th);
    ctx.fillRect(cx - r(wdt / 4), my + th, Math.max(2, r(wdt / 2)), th);
  }

  // Charge ring while winding up a shot.
  if (o.charge > 0.02) {
    ctx.strokeStyle = o.charge > 0.75 ? '#ffe14d' : '#ffffff';
    ctx.lineWidth = Math.max(1, Math.round(u / 7));
    ctx.beginPath();
    ctx.arc(cx, feetY - r(u * 0.1), u * 0.95, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * o.charge);
    ctx.stroke();
  }

  // Stamina pip for the player under your control.
  if (o.controlled && p.stamina < 55) {
    const w = Math.max(4, r(u * 1.1));
    const bx = cx - r(w / 2);
    const by = feetY + Math.max(2, r(u * 0.3));
    ctx.fillStyle = '#00000088';
    ctx.fillRect(bx - 1, by - 1, w + 2, 3);
    ctx.fillStyle = p.stamina < 25 ? '#ff5a4d' : '#ffd24d';
    ctx.fillRect(bx, by, Math.max(1, r((w * p.stamina) / 100)), 1);
  }
}

export function drawBall(ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number, z: number): void {
  const u = cam.ppy;
  const sx = cam.projectX(x, y);
  const groundY = cam.projectY(x, y);
  const sy = groundY - z * u * 0.55;

  ctx.globalAlpha = 0.24;
  ctx.fillStyle = '#000';
  const sw = Math.max(2, r(u * 0.3));
  ctx.fillRect(r(sx - sw / 2), r(groundY - 1), sw, Math.max(1, r(u * 0.12)));
  ctx.globalAlpha = 1;

  const s = Math.max(2, r(u * 0.34));
  ctx.fillStyle = '#fdfdf0';
  ctx.fillRect(r(sx - s / 2), r(sy - s / 2), s, s);
  ctx.fillStyle = '#c9c9b4';
  ctx.fillRect(r(sx - s / 2), r(sy + s / 2) - 1, s, 1);
}

/** Cage drawn from projected world points so it stays correct when the camera rotates. */
export function drawGoal(ctx: CanvasRenderingContext2D, cam: Camera, side: Side): void {
  const goal = attackingGoal(side);
  const dir = attackDir(side);
  const u = cam.ppy;
  const half = FIELD.goalWidth / 2;
  const depth = 2.1;

  const p = (wx: number, wy: number) => ({ x: cam.projectX(wx, wy), y: cam.projectY(wx, wy) });
  const f0 = p(goal.x, goal.y - half);
  const f1 = p(goal.x, goal.y + half);
  const b0 = p(goal.x + dir * depth, goal.y - half * 1.15);
  const b1 = p(goal.x + dir * depth, goal.y + half * 1.15);
  const lift = u * 1.15;

  // Net: a shaded quad from the mouth back to the pipe, with mesh lines.
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#dfe6ec';
  ctx.beginPath();
  ctx.moveTo(f0.x, f0.y - lift);
  ctx.lineTo(f1.x, f1.y - lift);
  ctx.lineTo(b1.x, b1.y - lift * 0.55);
  ctx.lineTo(b0.x, b0.y - lift * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    ctx.beginPath();
    ctx.moveTo(f0.x + (f1.x - f0.x) * t, f0.y + (f1.y - f0.y) * t - lift);
    ctx.lineTo(b0.x + (b1.x - b0.x) * t, b0.y + (b1.y - b0.y) * t - lift * 0.55);
    ctx.stroke();
  }
  ctx.restore();

  // Pipe: two posts, a crossbar between their tops, and the goal line at the base.
  const w = Math.max(2, Math.round(u * 0.2));
  ctx.strokeStyle = '#f26a21';
  ctx.lineCap = 'square';

  ctx.lineWidth = Math.max(1, Math.round(w * 0.7));
  ctx.beginPath();
  ctx.moveTo(f0.x, f0.y);
  ctx.lineTo(f1.x, f1.y);
  ctx.stroke();

  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(f0.x, f0.y - lift);
  ctx.lineTo(f1.x, f1.y - lift);
  ctx.stroke();

  for (const f of [f0, f1]) {
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(f.x, f.y - lift);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}
