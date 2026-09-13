import { clamp } from '../../core/math';
import { COURT, attackRim, otherSide, type Side } from './court';
import { CourtCamera } from './camera';
import {
  COURT_MARGIN, CourtLayer, LIFT, drawBall, drawCourtPlayer, drawHoop, sortForDraw,
  type Jersey,
} from './render';
import type { HoopsGame } from './Game';

/* ---------------------------------------------------------------------------
 * THE BASKETBALL RENDERER
 * ---------------------------------------------------------------------------
 * Same discipline as the lacrosse renderer — a small pixel buffer scaled up by
 * an integer factor, so the art stays crisp and the fill rate stays cheap on a
 * phone — and a completely different picture inside it.
 *
 * The order matters and is the only thing that makes the three-quarter view
 * work: the floor, then the far basket, then everything with height sorted from
 * the back of the screen to the front, then the near basket over the top. A
 * player in front of the rim has to be drawn after it or he disappears behind
 * the backboard.
 * ------------------------------------------------------------------------- */

export class HoopsRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly cam = new CourtCamera();
  private ctx: CanvasRenderingContext2D;
  private buffer: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private floor = new CourtLayer();
  private scale = 3;
  private lastW = 0;
  private lastH = 0;
  private jerseys: Record<Side, Jersey> | null = null;
  /** A flash of light behind the rim when one drops. */
  private swish = 0;
  private swishSide: Side = 'home';

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

  setTeams(home: Jersey, away: Jersey): void {
    this.jerseys = { home, away };
  }

  /**
   * How tall the scoreboard is, in CSS pixels. The court stands upright, so the
   * basket and the score want the same piece of screen; the camera settles it by
   * dropping the floor rather than by moving the score somewhere useless.
   */
  setHudHeight(cssPx: number): void {
    if (Math.abs(cssPx - this.hudCss) < 1) return;
    this.hudCss = cssPx;
    this.applyHudInset();
  }

  private hudCss = 0;

  private applyHudInset(): void {
    // The buffer is stretched to the whole canvas, so a foot is worth
    // `ppy * cssWidth / bufferWidth` CSS pixels whatever the device ratio is.
    const bufW = this.buffer.width;
    this.cam.setTopInset(this.hudCss, bufW > 0 ? this.cam.ppy * (this.cssW / bufW) : 0);
  }

  private cssW = 0;

  /** A made basket: flash the net and shake the camera. */
  celebrate(side: Side, power: number): void {
    this.swish = 1;
    this.swishSide = side;
    this.cam.punch(power);
  }

  resize(): boolean {
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

    const short = Math.min(targetW, targetH);
    this.scale = Math.max(2, Math.min(6, Math.round(short / 300)));
    const bufW = Math.ceil(targetW / this.scale);
    const bufH = Math.ceil(targetH / this.scale);
    this.buffer.width = bufW;
    this.buffer.height = bufH;
    this.canvas.width = targetW;
    this.canvas.height = targetH;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.cssW = cssW;
    this.cam.configure(bufW, bufH, Math.min(cssW, cssH));
    this.applyHudInset();
    this.ctx.imageSmoothingEnabled = false;
    this.bctx.imageSmoothingEnabled = false;
    return true;
  }

  draw(game: HoopsGame, dt: number): void {
    this.resize();
    const ctx = this.bctx;
    const cam = this.cam;
    const w = this.buffer.width;
    const h = this.buffer.height;

    this.swish = Math.max(0, this.swish - dt * 2.2);

    // The camera holds the half being played and swings on a turnover.
    if (game.phase === 'live' || game.phase === 'freeThrow') {
      cam.follow(game.possession, game.ball.x, game.ball.y, dt);
    } else {
      cam.hold(dt);
    }

    ctx.fillStyle = '#0c0a09';
    ctx.fillRect(0, 0, w, h);

    const jerseys = this.jerseys ?? {
      home: { primary: '#c9452f', secondary: '#f2d6a0', ink: '#1a0d00' },
      away: { primary: '#2f4f8f', secondary: '#e8ecf5', ink: '#f4f8ff' },
    };

    // The floor. It is painted in court space and turned into camera space here,
    // so the pre-rendered layer never has to know which way up the court stands.
    const layer = this.floor.ensure(cam.ppy, jerseys.home, jerseys.away);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    if (cam.rotate) ctx.rotate(-Math.PI / 2);
    ctx.drawImage(
      layer,
      Math.round(-(cam.x - cam.shakeX + COURT_MARGIN) * cam.ppy),
      Math.round(-(cam.y - cam.shakeY + COURT_MARGIN) * cam.ppy),
    );
    ctx.restore();

    // The basket at the far end of the screen first, so bodies pass in front.
    const far: Side = cam.projectY(attackRim('home').x, attackRim('home').y)
      < cam.projectY(attackRim('away').x, attackRim('away').y) ? 'home' : 'away';
    this.hoop(ctx, far, game);

    // Everything with height, from the back of the screen forward.
    const carrier = game.ball.carrier;
    const human = game.humanSide;
    for (const p of sortForDraw(game.players, cam)) {
      if (!cam.visible(p.x, p.y, 8)) continue;
      drawCourtPlayer(
        ctx, cam, p, jerseys[p.side],
        carrier === p.uid,
        human !== null && game.controlled[human] === p,
      );
    }
    drawBall(ctx, cam, game.ball);

    this.hoop(ctx, otherSide(far), game);

    // The release meter, drawn in the world under the shooter so his eyes never
    // have to leave the play. This is the one piece of HUD that belongs here
    // rather than in the DOM: it is a timing control, and a timing control that
    // lives at the edge of the screen cannot be used.
    const meter = game.gatherState();
    if (meter && human) {
      const p = game.controlled[human];
      if (p) this.releaseMeter(ctx, p.x, p.y, meter);
    }

    // Blit, scaled by an integer so the pixels stay square.
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.buffer, 0, 0, this.canvas.width, this.canvas.height);
  }

  private hoop(ctx: CanvasRenderingContext2D, side: Side, game: HoopsGame): void {
    const rim = attackRim(side);
    if (this.swish > 0 && this.swishSide === side) {
      const sx = this.cam.projectX(rim.x, rim.y);
      const sy = this.cam.projectY(rim.x, rim.y) - COURT.rimHeight * this.cam.ppy * LIFT;
      const r = this.cam.ppy * (2 + (1 - this.swish) * 5);
      ctx.fillStyle = `rgba(255, 220, 140, ${0.5 * this.swish})`;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    void game;
    drawHoop(ctx, this.cam, side, '#ff8c42');
  }

  /**
   * THE RELEASE METER. A bar under the shooter with the window marked on it and
   * a needle crossing it. Hitting the window is the single skill the whole sport
   * rests on, so it is drawn large, close, and in the player's own colours.
   */
  private releaseMeter(
    ctx: CanvasRenderingContext2D, x: number, y: number,
    meter: { gather: number; from: number; to: number },
  ): void {
    const cam = this.cam;
    const cx = cam.projectX(x, y);
    const cy = cam.projectY(x, y) + cam.ppy * 1.6;
    const w = Math.max(26, cam.ppy * 6);
    const hgt = Math.max(4, cam.ppy * 0.8);
    const left = cx - w / 2;

    ctx.fillStyle = 'rgba(8,6,4,0.82)';
    ctx.fillRect(left - 1, cy - 1, w + 2, hgt + 2);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(left, cy, w, hgt);

    // The window.
    const from = left + clamp(meter.from, 0, 1.28) / 1.28 * w;
    const to = left + clamp(meter.to, 0, 1.28) / 1.28 * w;
    ctx.fillStyle = '#7ad151';
    ctx.fillRect(from, cy, Math.max(2, to - from), hgt);

    // The needle.
    const at = left + clamp(meter.gather, 0, 1.28) / 1.28 * w;
    const inWindow = meter.gather >= meter.from && meter.gather <= meter.to;
    ctx.fillStyle = inWindow ? '#ffffff' : '#ff8c42';
    ctx.fillRect(Math.round(at) - 1, cy - 2, 2, hgt + 4);
  }
}
