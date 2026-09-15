import { clamp } from '../../core/math';
import { COURT, attackRim, otherSide, type Side } from './court';
import { CourtCamera } from './camera';
import {
  COURT_MARGIN, CourtLayer, LIFT, drawBall, drawCourtPlayer, drawHoop, sortForDraw,
  type Jersey,
} from './render';
import { CrowdFlashes } from './arena';
import type { HoopsGame } from './Game';
import type { Ball } from './ball';
import type { CourtPlayer } from './types';
import type { ReplayFrame } from './replay';

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
   * WHOSE BUILDING THIS IS.
   *
   * The home club decides the room: the crowd's colours, the mark at centre
   * court, the name along the baseline and the name on the signage band. A game
   * played at a blue blood should not look like the same gym as one played at a
   * bottom-half programme, and attendance is how that is said — a full house is
   * a wall of colour, a poor one is rows of empty seats.
   */
  setVenue(v: {
    home: Jersey; away: Jersey; arenaName: string; homeAbbr: string; club: string;
    seed: string; attendance: number;
  }): void {
    this.floor.setVenue(v);
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

  /** A made basket: flash the net, shake the camera, and wake the building up. */
  celebrate(side: Side, power: number): void {
    this.swish = 1;
    this.swishSide = side;
    this.cam.punch(power);
    this.crowd.stir(clamp(power * 0.7, 0.3, 2));
  }

  private crowd = new CrowdFlashes();

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

  /**
   * DRAW A RECORDED FRAME INSTEAD OF THE LIVE ONE.
   *
   * The floor, the baskets and the building are identical — it is the same
   * building — so only the ten bodies and the ball come from the buffer. They are
   * written into GHOSTS rather than into the live players: the game is paused
   * behind the replay and its state must come back untouched when the replay
   * ends, and a renderer that edits the thing it is drawing is a renderer that
   * will eventually forget to put it back.
   */
  drawReplay(game: HoopsGame, frame: ReplayFrame, dt: number, focus: { x: number; y: number }): void {
    if (!this.ghosts) {
      this.ghosts = game.players.map((p) => ({ ...p }));
      this.ghostBall = { ...game.ball };
    }
    const ghosts = this.ghosts;
    for (let i = 0; i < ghosts.length; i++) {
      const g = ghosts[i];
      const r = frame.players[i];
      const live = game.players[i];
      g.data = live.data;
      g.side = live.side;
      g.uid = live.uid;
      g.x = r.x; g.y = r.y; g.z = r.z; g.vx = r.vx; g.vy = r.vy;
      g.pose = r.pose;
      g.lean = r.lean; g.leanDir = r.leanDir; g.stridePhase = r.stridePhase;
      g.armAngleL = r.armAngleL; g.armAngleR = r.armAngleR;
      g.armReachL = r.armReachL; g.armReachR = r.armReachR;
      g.flash = 0;
    }
    const ball = this.ghostBall!;
    ball.x = frame.ball.x; ball.y = frame.ball.y; ball.z = frame.ball.z;
    ball.state = frame.ball.state;
    ball.carrier = null;

    this.paint(game, dt, ghosts, ball, focus);
  }

  private ghosts: CourtPlayer[] | null = null;
  private ghostBall: Ball | null = null;

  /** Live play. Everything a replay does not change comes from the same painter. */
  draw(game: HoopsGame, dt: number): void {
    this.paint(game, dt, game.players, game.ball, null);
  }

  /**
   * ONE PAINTER, TWO SOURCES.
   *
   * Live play hands it the game's own players and ball; a replay hands it ghosts
   * read out of the buffer. Everything else — the building, the floor, the
   * baskets, the light, the draw order — is identical, because it IS identical:
   * a replay is the same arena two seconds ago, not a different picture.
   *
   * `focus`, when given, is where the camera should look instead of following
   * the ball, which is how a replay holds the rim while a shot comes down.
   */
  private paint(
    game: HoopsGame,
    dt: number,
    players: readonly CourtPlayer[],
    ball: Ball,
    focus: { x: number; y: number } | null,
  ): void {
    this.resize();
    const ctx = this.bctx;
    const cam = this.cam;
    const w = this.buffer.width;
    const h = this.buffer.height;

    this.swish = Math.max(0, this.swish - dt * 2.2);
    this.crowd.update(dt);

    // The camera holds the half being played and swings on a turnover — or, in a
    // replay, holds the one point the highlight is about.
    if (focus) {
      cam.follow(game.possession, focus.x, focus.y, dt);
    } else if (game.phase === 'live' || game.phase === 'freeThrow') {
      cam.follow(game.possession, ball.x, ball.y, dt);
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

    /* CAMERA FLASHES. Drawn straight after the floor so they are behind every
     * player: a flash is three rows up in the stand, not on the court. Four
     * rectangles a frame, and the building stops being wallpaper. */
    for (const f of this.crowd.flashes) {
      if (!cam.visible(f.x, f.y, 2)) continue;
      const fxp = cam.projectX(f.x, f.y);
      const fyp = cam.projectY(f.x, f.y);
      const sz = Math.max(1, cam.ppy * 0.8);
      ctx.fillStyle = 'rgba(255,252,240,0.92)';
      ctx.fillRect(Math.round(fxp - sz / 2), Math.round(fyp - sz / 2), sz, sz);
      ctx.fillStyle = 'rgba(255,248,220,0.28)';
      ctx.fillRect(Math.round(fxp - sz * 1.4), Math.round(fyp - sz * 1.4), sz * 2.8, sz * 2.8);
    }

    // The basket at the far end of the screen first, so bodies pass in front.
    const far: Side = cam.projectY(attackRim('home').x, attackRim('home').y)
      < cam.projectY(attackRim('away').x, attackRim('away').y) ? 'home' : 'away';
    this.hoop(ctx, far, game);

    // Everything with height, from the back of the screen forward.
    const carrier = ball.carrier;
    const human = game.humanSide;
    for (const p of sortForDraw(players, cam)) {
      if (!cam.visible(p.x, p.y, 8)) continue;
      drawCourtPlayer(
        ctx, cam, p, jerseys[p.side],
        carrier === p.uid,
        !focus && human !== null && game.controlled[human] === p,
      );
    }
    drawBall(ctx, cam, ball);

    this.hoop(ctx, otherSide(far), game);

    /* The release meter, drawn in the world under the shooter so his eyes never
     * have to leave the play. This is the one piece of HUD that belongs here
     * rather than in the DOM: it is a timing control, and a timing control that
     * lives at the edge of the screen cannot be used. A replay has no meter —
     * nobody is shooting. */
    const meter = focus ? null : game.gatherState();
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
