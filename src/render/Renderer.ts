import { FIELD, attackingGoal, type Side } from '../data/constants';
import { jerseyFor } from '../data/teams';
import type { Match } from '../match/Match';
import type { MatchPlayer } from '../match/types';
import { Camera } from './camera';
import { Effects } from './effects';
import { FieldLayer, venueTheme, type VenueTheme } from './field';
import { drawBall, drawGoal, drawPlayer, type Jersey } from './sprites';

export interface AimHint {
  x: number;
  y: number;
  charging: boolean;
  charge: number;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private buffer: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;

  readonly cam = new Camera();
  readonly effects = new Effects();
  private field = new FieldLayer();
  private theme: VenueTheme | null = null;
  private scale = 3;
  private jerseys: Record<Side, Jersey> | null = null;
  private lastW = 0;
  private lastH = 0;
  private drawOrder: MatchPlayer[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available in this browser.');
    this.ctx = ctx;
    this.buffer = document.createElement('canvas');
    const bctx = this.buffer.getContext('2d', { alpha: false });
    if (!bctx) throw new Error('Canvas 2D is not available in this browser.');
    this.bctx = bctx;
  }

  /** Recompute the pixel buffer for the current element size. Safe to call every frame. */
  resize(): boolean {
    // Measure the host, not the canvas: resize() writes an inline size onto the
    // canvas, so measuring itself would latch it at whatever it was first set to.
    const host = this.canvas.parentElement ?? this.canvas;
    const rect = host.getBoundingClientRect();
    const cssW = Math.max(240, Math.floor(rect.width || window.innerWidth));
    const cssH = Math.max(200, Math.floor(rect.height || window.innerHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.floor(cssW * dpr);
    const targetH = Math.floor(cssH * dpr);
    if (targetW === this.lastW && targetH === this.lastH) return false;
    this.lastW = targetW;
    this.lastH = targetH;

    // Pick an integer upscale that lands the pixel buffer near 300px on its short side.
    const short = Math.min(targetW, targetH);
    this.scale = Math.max(2, Math.min(6, Math.round(short / 300)));
    const bufW = Math.ceil(targetW / this.scale);
    const bufH = Math.ceil(targetH / this.scale);

    this.buffer.width = bufW;
    this.buffer.height = bufH;
    this.canvas.width = bufW * this.scale;
    this.canvas.height = bufH * this.scale;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;

    this.cam.configure(bufW, bufH, Math.min(cssW, cssH));
    this.ctx.imageSmoothingEnabled = false;
    this.bctx.imageSmoothingEnabled = false;
    return true;
  }

  prepare(match: Match): void {
    const homeTeam = match.setups.home.team;
    const awayTeam = match.setups.away.team;
    this.theme = venueTheme(homeTeam.homeField);
    this.jerseys = {
      home: jerseyFor(homeTeam, true),
      away: jerseyFor(awayTeam, false),
    };
    this.field.build(this.cam.ppy, this.theme, homeTeam, awayTeam, match.rng.seed);
    this.cam.snap(match.ball.x, match.ball.y);
  }

  render(match: Match, dt: number, aim: AimHint | null): void {
    if (this.resize() && this.theme) {
      this.field.build(this.cam.ppy, this.theme, match.setups.home.team, match.setups.away.team, match.rng.seed);
    }
    if (!this.theme || !this.jerseys) this.prepare(match);
    const theme = this.theme!;
    const jerseys = this.jerseys!;

    // Camera target: the ball, or the celebration point after a goal.
    const focus = match.focus ?? { x: match.ball.x, y: match.ball.y };
    const carrier = match.ball.carrier;
    const lead = carrier ? Math.max(-9, Math.min(9, carrier.vx * 0.55)) : 0;
    this.cam.follow(focus.x, focus.y, dt, this.cam.rotate ? 0 : lead);
    this.effects.update(dt);

    const ctx = this.bctx;
    const { width: bw, height: bh } = this.buffer;

    ctx.fillStyle = theme.surround;
    ctx.fillRect(0, 0, bw, bh);

    // Field layer
    const blit = this.cam.fieldBlit();
    ctx.save();
    ctx.translate(bw / 2, bh / 2);
    if (this.cam.rotate) ctx.rotate(-Math.PI / 2);
    ctx.drawImage(this.field.canvas, Math.round(blit.dx), Math.round(blit.dy));
    ctx.restore();

    // Goals behind the players
    drawGoal(ctx, this.cam, 'home');
    drawGoal(ctx, this.cam, 'away');

    // Ball carrier marker so the eye always finds the ball
    if (carrier) {
      const sx = this.cam.projectX(carrier.x, carrier.y);
      const sy = this.cam.projectY(carrier.x, carrier.y);
      ctx.strokeStyle = carrier.side === match.humanSide ? '#ffe14d' : '#ff6b5a';
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(sx, sy, this.cam.ppy * 0.85, this.cam.ppy * 0.35, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Aim helpers for the human player
    if (aim && carrier && carrier.side === match.humanSide) {
      this.drawAimHelpers(match, carrier, aim);
    }

    // Players, back to front
    this.drawOrder.length = 0;
    for (const p of match.players) {
      if (this.cam.visible(p.x, p.y, 3)) this.drawOrder.push(p);
    }
    this.drawOrder.sort((a, b) =>
      this.cam.projectY(a.x, a.y) - this.cam.projectY(b.x, b.y));

    const controlled = match.humanSide ? match.controlled[match.humanSide] : null;
    for (const p of this.drawOrder) {
      drawPlayer(ctx, this.cam, p, {
        jersey: jerseys[p.side],
        controlled: p === controlled,
        hasBall: match.ball.carrier === p,
        charge: match.ball.carrier === p ? p.windup : 0,
        teamColor: match.setups[p.side].team.primary,
        dim: false,
      });
    }

    if (match.ball.state !== 'carried') {
      drawBall(ctx, this.cam, match.ball.x, match.ball.y, match.ball.z);
    }

    this.effects.draw(ctx, this.cam);
    this.effects.drawFlash(ctx, bw, bh);

    // Off-screen ball indicator
    if (!this.cam.visible(match.ball.x, match.ball.y, 0)) {
      this.drawOffscreenArrow(ctx, match.ball.x, match.ball.y, bw, bh);
    }

    // Upscale to the display canvas with nearest-neighbour for crisp pixels.
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.buffer, 0, 0, this.canvas.width, this.canvas.height);
  }

  private drawAimHelpers(match: Match, carrier: MatchPlayer, aim: AimHint): void {
    const ctx = this.bctx;
    const u = this.cam.ppy;
    if (aim.charging) {
      // Shot line into the cage.
      const goal = attackingGoal(carrier.side);
      const half = FIELD.goalWidth / 2;
      const lat = Math.max(-1, Math.min(1, aim.x * 0 + aimLateral(carrier, goal, aim)));
      const tx = goal.x;
      const ty = goal.y + lat * half * 0.9;
      const x0 = this.cam.projectX(carrier.x, carrier.y);
      const y0 = this.cam.projectY(carrier.x, carrier.y) - u * 0.8;
      const x1 = this.cam.projectX(tx, ty);
      const y1 = this.cam.projectY(tx, ty) - u * 0.8;
      ctx.strokeStyle = aim.charge > 0.75 ? '#ffe14d' : '#ffffff';
      ctx.globalAlpha = 0.32 + aim.charge * 0.4;
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      return;
    }
    // Pass target chevron.
    const target = match.choosePassTarget(carrier, aim.x, aim.y);
    if (!target) return;
    const sx = this.cam.projectX(target.x, target.y);
    const sy = this.cam.projectY(target.x, target.y);
    ctx.fillStyle = '#7fe3a0';
    ctx.globalAlpha = 0.9;
    const w = Math.max(3, Math.round(u * 0.55));
    ctx.fillRect(Math.round(sx - w / 2), Math.round(sy + u * 0.35), w, 1);
    ctx.globalAlpha = 1;
  }

  private drawOffscreenArrow(
    ctx: CanvasRenderingContext2D, wx: number, wy: number, bw: number, bh: number,
  ): void {
    const sx = this.cam.projectX(wx, wy);
    const sy = this.cam.projectY(wx, wy);
    const cx = bw / 2;
    const cy = bh / 2;
    const dx = sx - cx;
    const dy = sy - cy;
    const m = Math.hypot(dx, dy) || 1;
    const rad = Math.min(bw, bh) * 0.42;
    const px = cx + (dx / m) * rad;
    const py = cy + (dy / m) * rad;
    ctx.fillStyle = '#ffe14d';
    ctx.globalAlpha = 0.85;
    ctx.fillRect(Math.round(px) - 2, Math.round(py) - 2, 4, 4);
    ctx.globalAlpha = 1;
  }

  destroy(): void {
    this.effects.clear();
  }
}

function aimLateral(carrier: MatchPlayer, goal: { x: number; y: number }, aim: AimHint): number {
  const dx = goal.x - carrier.x;
  const dy = goal.y - carrier.y;
  const m = Math.hypot(dx, dy) || 1;
  const nx = dx / m;
  const ny = dy / m;
  if (Math.hypot(aim.x, aim.y) < 0.2) return 0;
  return aim.x * -ny + aim.y * nx;
}
