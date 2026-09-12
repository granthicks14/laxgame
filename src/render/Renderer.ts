import { FIELD, attackingGoal, type Side } from '../data/constants';
import { jerseyFor } from '../data/teams';
import { tryWorldTeam } from '../data/world';
import type { Match } from '../match/Match';
import type { MatchPlayer } from '../match/types';
import { starTier } from '../data/players';
import { Camera } from './camera';
import { Effects } from './effects';
import { FieldLayer, venueTheme, type VenueTheme } from './field';
import { drawBall, drawGoal, drawPlayer, type Jersey } from './sprites';
import { drawRain, weatherFor, type Weather } from './weather';

/** Optional presentation override, used by the goal replay. */
export interface ViewOverride {
  /** 1 = normal. Higher crops into the buffer, keeping the pixel grid intact. */
  zoom: number;
  /** World point to keep centred while zoomed. */
  focusX: number;
  focusY: number;
  /** Camera follow rate; higher is snappier. */
  followRate: number;
  /** Broadcast mode: hide the gameplay affordances and trail the ball. */
  presentation: boolean;
}

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
  weather: Weather | null = null;
  private scale = 3;
  private jerseys: Record<Side, Jersey> | null = null;
  private lastW = 0;
  private lastH = 0;
  private drawOrder: MatchPlayer[] = [];
  private rainT = 0;

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
    // Where the home team plays decides the spring it plays in.
    this.weather = weatherFor(
      match.cfg.seed ?? match.rng.seed,
      homeTeam.homeField.time,
      tryWorldTeam(homeTeam.id)?.region ?? 'texas',
    );
    this.theme = venueTheme(homeTeam.homeField, this.weather);
    this.jerseys = {
      home: jerseyFor(homeTeam, true),
      away: jerseyFor(awayTeam, false),
    };
    this.field.build(this.cam.ppy, this.theme, homeTeam, awayTeam, match.rng.seed);
    this.cam.snap(match.ball.x, match.ball.y);
  }

  render(match: Match, dt: number, aim: AimHint | null, view?: ViewOverride | null): void {
    if (this.resize() && this.theme) {
      this.field.build(this.cam.ppy, this.theme, match.setups.home.team, match.setups.away.team, match.rng.seed);
    }
    if (!this.theme || !this.jerseys) this.prepare(match);
    const theme = this.theme!;
    const jerseys = this.jerseys!;

    // Camera target: the replay's cinematic point, the ball, or the celebration
    // point after a goal. A presentation override drives both the camera and the
    // crop from one world point, so the framing it asks for is the framing shown.
    const focus = view
      ? { x: view.focusX, y: view.focusY }
      : match.focus ?? { x: match.ball.x, y: match.ball.y };
    const carrier = match.ball.carrier;
    const lead = carrier ? Math.max(-9, Math.min(9, carrier.vx * 0.55)) : 0;
    this.cam.follow(
      focus.x, focus.y, dt,
      view ? 0 : (this.cam.rotate ? 0 : lead),
      view ? view.followRate : 5.5,
    );
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

    const presenting = !!view?.presentation;

    // Ball carrier marker so the eye always finds the ball
    if (carrier && !presenting) {
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
    if (aim && carrier && carrier.side === match.humanSide && !presenting) {
      this.drawAimHelpers(match, carrier, aim);
    }

    // Players, back to front
    this.drawOrder.length = 0;
    for (const p of match.players) {
      if (this.cam.visible(p.x, p.y, 3)) this.drawOrder.push(p);
    }
    this.drawOrder.sort((a, b) =>
      this.cam.projectY(a.x, a.y) - this.cam.projectY(b.x, b.y));

    const controlled = presenting ? null : (match.humanSide ? match.controlled[match.humanSide] : null);
    for (const p of this.drawOrder) {
      drawPlayer(ctx, this.cam, p, {
        jersey: jerseys[p.side],
        controlled: p === controlled,
        hasBall: match.ball.carrier === p,
        charge: match.ball.carrier === p ? p.windup : 0,
        teamColor: match.setups[p.side].team.primary,
        dim: false,
        star: starTier(p.data.overall),
      });
    }

    if (presenting) this.drawBallTrail(ctx, match.ball.x, match.ball.y, match.ball.z);
    else this.trail.length = 0;

    if (match.ball.state !== 'carried') {
      drawBall(ctx, this.cam, match.ball.x, match.ball.y, match.ball.z);
    }

    this.effects.draw(ctx, this.cam);

    // Cosmetic conditions, laid over the whole scene so players sit in the same
    // light as the pitch.
    if (this.weather?.tint) {
      ctx.globalAlpha = this.weather.alpha;
      ctx.fillStyle = this.weather.tint;
      ctx.fillRect(0, 0, bw, bh);
      ctx.globalAlpha = 1;
    }
    if (this.weather?.rain) {
      this.rainT += dt;
      drawRain(ctx, bw, bh, this.rainT, this.weather.rain);
    }

    this.effects.drawFlash(ctx, bw, bh);

    // Off-screen ball indicator
    if (!presenting && !this.cam.visible(match.ball.x, match.ball.y, 0)) {
      this.drawOffscreenArrow(ctx, match.ball.x, match.ball.y, bw, bh);
    }

    // Upscale to the display canvas with nearest-neighbour for crisp pixels.
    // A zoomed view crops the buffer instead of scaling the world, so the pixel
    // grid and the pre-rendered field layer both stay untouched.
    this.ctx.imageSmoothingEnabled = false;
    const zoom = view && view.zoom > 1.001 ? view.zoom : 1;
    if (zoom > 1) {
      const sw = bw / zoom;
      const sh = bh / zoom;
      const fx = this.cam.projectX(view!.focusX, view!.focusY);
      const fy = this.cam.projectY(view!.focusX, view!.focusY);
      const sx = Math.max(0, Math.min(bw - sw, fx - sw / 2));
      const sy = Math.max(0, Math.min(bh - sh, fy - sh / 2));
      this.ctx.drawImage(this.buffer, sx, sy, sw, sh, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.drawImage(this.buffer, 0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private drawAimHelpers(match: Match, carrier: MatchPlayer, aim: AimHint): void {
    const ctx = this.bctx;
    const u = this.cam.ppy;
    if (aim.charging) {
      // Shot line into the cage. Mirrors Match.doShot exactly, so what you see
      // is where the ball is aimed.
      const goal = attackingGoal(carrier.side);
      const half = FIELD.goalWidth / 2;
      const lat = Math.hypot(aim.x, aim.y) > 0.18
        ? Math.max(-1, Math.min(1, aim.y * 1.35))
        : 0;
      const tx = goal.x;
      const ty = goal.y + lat * half * 0.85;
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
      // A marker on the goal line showing the exact spot being aimed at.
      const mw = Math.max(2, Math.round(u * 0.3));
      ctx.fillStyle = aim.charge > 0.75 ? '#ffe14d' : '#ffffff';
      ctx.fillRect(Math.round(x1 - mw / 2), Math.round(y1 - mw / 2), mw, mw);
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

  private trail: number[] = [];

  /** A short fading tail behind the ball, so a replayed shot reads at a glance. */
  private drawBallTrail(ctx: CanvasRenderingContext2D, x: number, y: number, z: number): void {
    const last = this.trail.length;
    if (last === 0 || Math.hypot(this.trail[last - 3] - x, this.trail[last - 2] - y) > 0.25) {
      this.trail.push(x, y, z);
      if (this.trail.length > 3 * 14) this.trail.splice(0, 3);
    }
    const n = this.trail.length / 3;
    for (let i = 0; i < n - 1; i++) {
      const t = (i + 1) / n;
      const px = this.trail[i * 3];
      const py = this.trail[i * 3 + 1];
      const pz = this.trail[i * 3 + 2];
      ctx.globalAlpha = t * 0.5;
      ctx.fillStyle = '#ffe9a8';
      const sx = this.cam.projectX(px, py);
      const sy = this.cam.projectY(px, py) - pz * this.cam.ppy * 0.55;
      const sz = Math.max(1, Math.round(this.cam.ppy * 0.18 * t));
      ctx.fillRect(Math.round(sx - sz / 2), Math.round(sy - sz / 2), sz, sz);
    }
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
