import { clamp } from '../../core/math';
import { FIELD, attackDir } from './field';
import { FieldCamera } from './camera';
import { paintBowl, paintDownLines, paintField, paintSideline } from './stadium';
import { drawAim, drawBall, drawOffscreenMark, drawPlayer, kitFor, sortForDraw, type Kit } from './render';
import type { FootballGame } from './Game';
import type { FieldPlayer } from './types';
import type { Side } from './field';

/* ---------------------------------------------------------------------------
 * THE FOOTBALL RENDERER
 * ---------------------------------------------------------------------------
 * The same discipline as the other two sports — a small pixel buffer blown up by
 * an integer factor, so the art stays crisp and a phone is not asked to fill a
 * million pixels sixty times a second — and a third completely different
 * picture inside it.
 *
 * The draw order is the whole three-quarter illusion and it runs from the far
 * end of the field toward the camera: the building, the turf and its paint, the
 * two lines that say where the ball is and where it must reach, then
 * twenty-two men sorted by how far upfield they are, then the ball, which is
 * drawn last because it is the thing everybody is looking for.
 * ------------------------------------------------------------------------- */

export class FootballRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly cam = new FieldCamera();
  private ctx: CanvasRenderingContext2D;
  private buffer: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private scale = 3;
  private lastW = 0;
  private lastH = 0;
  private cssW = 0;
  private hudCss = 0;
  private time = 0;
  /** Crowd noise, 0..1, which is the only thing the stands respond to. */
  private roar = 0.25;
  private kits: Record<Side, Kit> | null = null;

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

  /**
   * TWO KITS THAT CANNOT BE CONFUSED.
   *
   * The home side wears its own colour dark and the away side wears the same
   * idea light, which is the real convention and also the only reliable way to
   * keep twenty-two small figures on a green field readable when both clubs
   * happen to have picked blue.
   */
  setTeams(homePrimary: string, homeSecondary: string, awayPrimary: string, awaySecondary: string): void {
    this.kits = {
      home: kitFor(homePrimary, homeSecondary, true),
      away: kitFor(awayPrimary, awaySecondary, false),
    };
  }

  /** How much of the top of the screen the scoreboard covers, in CSS pixels. */
  setHudHeight(cssPx: number): void {
    if (Math.abs(cssPx - this.hudCss) < 1) return;
    this.hudCss = cssPx;
    this.applyHudInset();
  }

  private applyHudInset(): void {
    const bufW = this.buffer.width;
    this.cam.setTopInset(this.hudCss, bufW > 0 ? this.cam.ppy * (this.cssW / bufW) : 0);
  }

  /** A hit worth feeling: the camera jolts and the building wakes up. */
  jolt(power: number): void {
    this.cam.punch(power);
    this.roar = clamp(this.roar + power * 0.3, 0, 1);
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
    this.scale = Math.max(2, Math.min(6, Math.round(short / 320)));
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

  /** Point the camera the coach's way. Done once, when a game starts. */
  orient(side: Side | null, los: number): void {
    this.cam.orientFor(side);
    this.cam.jumpTo(los, side ? attackDir(side) : 1);
  }

  draw(game: FootballGame, dt: number, aimAt: FieldPlayer | null): void {
    this.resize();
    this.time += dt;
    // The crowd settles between plays and lifts when something happens.
    this.roar = clamp(this.roar - dt * 0.28, game.phase === 'live' ? 0.2 : 0.12, 1);

    const b = this.bctx;
    const w = this.buffer.width;
    const h = this.buffer.height;

    const live = game.phase === 'live';
    const dir = attackDir(game.possession);
    this.cam.follow(game.lineOfScrimmage, game.ball.x, game.ball.y, dir, live, dt);

    paintBowl(b, this.cam, w, h, this.time, this.roar);
    paintField(b, this.cam, game.cfg.home.team, game.cfg.away.team);

    /* THE FIRST-DOWN LINE IS HIDDEN ON A KICK, because there is no first down to
     * make on one and a yellow line across a punt is a lie about the situation. */
    const showFirst = game.kickKind === 'none' && game.tryKind === 'none';
    paintDownLines(b, this.cam, game.lineOfScrimmage, game.firstDownLine, showFirst);
    paintSideline(b, this.cam, game.lineOfScrimmage, game.down);

    const kits = this.kits ?? {
      home: kitFor('#1d3f8f', '#f0c419', true),
      away: kitFor('#9a2b2b', '#efe6d2', false),
    };

    const controlled = game.humanSide ? game.controlled[game.humanSide] : null;
    for (const p of sortForDraw(game.players, this.cam.upfield)) {
      drawPlayer(b, this.cam, p, kits[p.side], p === controlled, game.ball.carrier === p.uid);
    }

    // The throwing lane, for the man actually holding the ball.
    if (controlled && game.ball.carrier === controlled.uid && !game.thrown) {
      drawAim(b, this.cam, controlled, aimAt, this.time);
    }

    drawBall(b, this.cam, game.ball, this.time);

    /* A MAN OFF THE TOP OF THE SCREEN IS STILL IN THE PLAY. A go route runs
     * further than any camera can hold, and a receiver who simply vanishes is a
     * receiver the person will never throw to. */
    if (live) {
      for (const p of game.players) {
        if (p.side !== game.possession) continue;
        if (!p.route || p.route.kind === 'block') continue;
        drawOffscreenMark(b, this.cam, p, kits[p.side], w, h);
      }
    }

    this.ctx.drawImage(this.buffer, 0, 0, this.canvas.width, this.canvas.height);
    void FIELD;
  }
}
