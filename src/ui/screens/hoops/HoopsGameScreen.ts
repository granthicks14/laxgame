import { audio } from '../../../audio/Audio';
import { h, clear } from '../../dom';
import type { App, Screen } from '../../App';
import { InputManager } from '../../../input/Input';
import { keyLabel } from '../../../state/keybinds';
import { keybindEditor } from '../../keybindEditor';
import { fieldRow, segmented } from '../../components';
import { pauseIcon } from '../../icons';
import { HoopsGame } from '../../../sports/basketball/Game';
import { HoopsRenderer } from '../../../sports/basketball/HoopsRenderer';
import { BASKETBALL_CONTROLS, hoopsInput, neutralHoopsInput } from '../../../sports/basketball/input';
import { HOOPS } from '../../../sports/basketball/tuning';
import { teamLabel, type HoopsTeam } from '../../../sports/basketball/data';
import type { HoopsConfig, CourtPlayer } from '../../../sports/basketball/types';
import type { Side } from '../../../sports/basketball/court';
import { boxScoreTable } from './boxScore';
import {
  bigMoment, freeThrowPlate, lineupCard, quarterCard, type BigMomentKind,
} from './broadcast';

/* ---------------------------------------------------------------------------
 * PLAYING BASKETBALL
 * ---------------------------------------------------------------------------
 * The screen a basketball game is actually played on. It shares the shell with
 * lacrosse — the same App, the same input manager, the same pause-menu
 * furniture — and nothing else: a basketball scoreboard has a shot clock and
 * team fouls on it, its touch buttons do different things, and its hint strip
 * says different words depending on whether you have the ball.
 * ------------------------------------------------------------------------- */

const FIXED_DT = 1 / 60;

export interface HoopsGameOptions {
  config: HoopsConfig;
  onComplete: (game: HoopsGame) => void;
  onQuit: () => void;
  subtitle?: string;
}

type PauseTab = 'menu' | 'controls' | 'box';

export class HoopsGameScreen implements Screen {
  el: HTMLElement;

  private app: App;
  private opts: HoopsGameOptions;
  private game: HoopsGame;
  private renderer!: HoopsRenderer;
  private input = new InputManager(BASKETBALL_CONTROLS);
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = true;
  private paused = false;
  private finished = false;
  private unsubscribes: (() => void)[] = [];

  private canvas!: HTMLCanvasElement;
  private elHome!: HTMLElement;
  private elAway!: HTMLElement;
  private elClock!: HTMLElement;
  private elQuarter!: HTMLElement;
  private elShot!: HTMLElement;
  private elBanner!: HTMLElement;
  private elTicker!: HTMLElement;
  private elBonus!: HTMLElement;
  private elTimeouts!: HTMLElement;
  private elTouch!: HTMLElement;
  private elStick!: HTMLElement;
  private elStickNub!: HTMLElement;
  private elPassBtn!: HTMLElement;
  private elShootBtn!: HTMLElement;
  private elTimeoutBtn!: HTMLElement;
  private lastAttacking: boolean | null = null;
  private elHints!: HTMLElement;
  private overlay: HTMLElement | null = null;
  private pauseTab: PauseTab = 'menu';
  private touchMode: boolean;
  private stickShown = false;
  private lastScore = { home: -1, away: -1 };
  private lastClockText = '';
  private squeakTimer = 0;

  /* --- the broadcast ----------------------------------------------------- */
  /**
   * A presentation beat currently on screen.
   *
   * Separate from `paused` on purpose: the pause MENU is a thing the player
   * opened and can navigate, a beat is a thing the game did and wants dismissed.
   * Sharing one flag meant pressing escape during the lineups opened the pause
   * menu on top of them.
   */
  private beat: { el: HTMLElement; timer: number; off: () => void } | null = null;
  private elFt: HTMLElement | null = null;
  private ftKey = '';
  /** Seconds of slow motion left. Only a genuine big moment ever sets it. */
  private slowmo = 0;
  private momentEl: HTMLElement | null = null;
  private momentTimer = 0;
  private beatClosedAt = 0;

  constructor(app: App, opts: HoopsGameOptions) {
    this.app = app;
    this.opts = opts;
    this.game = new HoopsGame(opts.config);
    this.touchMode = app.settings.controls === 'touch'
      || (app.settings.controls === 'auto' && matchMedia('(hover: none)').matches);

    this.el = this.build();
    this.renderer = new HoopsRenderer(this.canvas);
    const homeKit = jerseyFor(opts.config.home.team, true);
    const awayKit = jerseyFor(opts.config.away.team, false);
    this.renderer.setTeams(homeKit, awayKit);
    /* THE BUILDING BELONGS TO THE HOME CLUB. How full it is comes from how good
     * the club is, which is the honest reading: a blue blood sells out and a
     * bottom-half programme does not, and a half-empty bowl is a fact about the
     * job a coach took rather than a graphical setting. */
    const host = opts.config.home.team;
    this.renderer.setVenue({
      home: homeKit,
      away: awayKit,
      arenaName: host.arena,
      homeAbbr: host.abbr,
      club: host.name,
      seed: host.id,
      attendance: attendanceFor(host),
    });
    this.renderer.resize();
    this.measureHud();
    this.renderer.cam.jumpTo('home');

    this.input.setBindings(app.keybinds);
    this.input.attach(this.el);
    this.input.onPause = () => this.togglePause();
    this.input.onVisualChange = () => this.syncStick();
    app.onKeybindsChanged = (binds) => {
      this.input.setBindings(binds);
      this.renderHints();
    };

    this.wireAudio();
    this.renderHints();
    /* THE LINEUPS, before a ball is thrown up. It holds the clock until somebody
     * presses something or four seconds pass, whichever comes first — a coach who
     * has seen it forty times this season is one button away from the tip. */
    this.showBeat(lineupCard(opts.config, () => this.clearBeat()).el, 4);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);

    // The same debug handle lacrosse exposes, so the browser suites can look at
    // a real game rather than guessing from pixels.
    (window as unknown as { hardwood?: unknown }).hardwood = {
      game: this.game,
      renderer: this.renderer,
      input: this.input,
      // A do-nothing input, so a test suite can run a game out at speed without
      // pretending to be a player holding no buttons for forty minutes.
      neutral: neutralHoopsInput,
    };
  }

  /* ------------------------------------------------------------------ build */

  private build(): HTMLElement {
    const cfg = this.opts.config;
    this.canvas = h('canvas', { class: 'game__canvas' });

    this.elHome = h('div', { class: 'hoop-score__pts num', text: '0' });
    this.elAway = h('div', { class: 'hoop-score__pts num', text: '0' });
    this.elClock = h('div', { class: 'hoop-clock num', text: '0:00' });
    this.elQuarter = h('div', { class: 'hoop-quarter', text: 'Q1' });
    this.elShot = h('div', { class: 'hoop-shotclock num', text: '24' });
    this.elBonus = h('div', { class: 'hoop-bonus' });
    this.elTimeouts = h('div', { class: 'hoop-timeouts' });
    this.elBanner = h('div', { class: 'hoop-banner' });
    this.elTicker = h('div', { class: 'hoop-ticker' });

    const teamPlate = (team: HoopsTeam, score: HTMLElement, side: Side) =>
      h('div', { class: `hoop-score hoop-score--${side}` },
        h('div', {
          class: 'hoop-score__badge',
          style: `background:${team.primary};border-color:${team.secondary}`,
          text: team.abbr,
        }),
        score);

    this.elStickNub = h('div', { class: 'stick__nub' });
    this.elStick = h('div', { class: 'stick' }, this.elStickNub);
    this.elPassBtn = this.touchButton('pass', 'Pass');
    this.elShootBtn = this.touchButton('shoot', 'Shoot');
    // Same thumb geometry lacrosse already proved: four round buttons in a 2x2
    // cluster under the right thumb, with the support call as a pill above it.
    // Shoot sits nearest the thumb, pass beside it, the two modifiers on top.
    this.elTouch = h('div', { class: `touch${this.touchMode ? '' : ' is-off'}` },
      this.elStick,
      this.touchButton('screen', 'Screen'),
      h('div', { class: 'tbtns' },
        this.touchButton('switch', 'Switch'),
        this.touchButton('cross', 'Cross'),
        this.elPassBtn,
        this.elShootBtn),
      // Up out of the thumb cluster on its own, because it is not a play: it is
      // a decision, and a decision should never be one thumb-slip away.
      this.elTimeoutBtn = this.touchButton('timeout', 'T/O'),
    );

    this.elHints = h('div', { class: 'hint-strip' });

    const hints = this.app.settings.showHints && !this.touchMode ? this.elHints : null;

    return h('div', { class: `game${this.touchMode ? ' is-touch' : ''}` },
      this.canvas,
      h('div', { class: 'hoop-hud' },
        teamPlate(cfg.away.team, this.elAway, 'away'),
        h('div', { class: 'hoop-hud__mid' },
          this.elClock,
          h('div', { class: 'hoop-hud__row' }, this.elQuarter, this.elShot),
          this.elBonus,
          this.elTimeouts),
        teamPlate(cfg.home.team, this.elHome, 'home')),
      this.elBanner,
      this.elTicker,
      this.elTouch,
      hints,
      h('button', {
        class: 'pause-btn',
        ariaLabel: 'Pause',
        on: { click: () => this.togglePause() },
      }, pauseIcon(14)),
    );
  }

  private touchButton(id: string, label: string): HTMLElement {
    const btn = h('button', { class: `tbtn tbtn--${id}`, text: label, ariaLabel: label });
    this.input.registerButton(id, btn);
    return btn;
  }

  /* ------------------------------------------------------------------ audio */

  private wireAudio(): void {
    const on = <K extends Parameters<typeof this.game.events.on>[0]>(
      type: K, fn: () => void,
    ): void => {
      this.unsubscribes.push(this.game.events.on(type, fn as never));
    };
    on('whistle', () => audio.play('whistle'));
    // The dribble is the floor of the mix: quiet, and only for the ball you can
    // actually hear from where the camera is standing.
    this.unsubscribes.push(this.game.events.on('dribble', () => {
      if (this.renderer.cam.visible(this.game.ball.x, this.game.ball.y, 0)) {
        audio.play('dribble', 0.35);
      }
    }));
    on('pass', () => audio.play('pass'));
    on('rim', () => audio.play('rim'));
    on('board', () => audio.play('board'));
    on('shot', () => audio.play('shot'));
    on('steal', () => audio.play('steal'));
    on('rebound', () => audio.play('rebound'));
    on('block', () => audio.play('block'));
    this.unsubscribes.push(this.game.events.on('swish', () => audio.play('swish')));
    this.unsubscribes.push(this.game.events.on('bucket', (e) => {
      audio.play('bucket', e.points === 3 || e.kind === 'dunk' ? 1 : 0.6);
      this.renderer.celebrate(e.side, e.kind === 'dunk' ? 2.4 : e.points === 3 ? 1.6 : 1);
      // And if it was the one that decided it, the whole picture changes.
      this.checkBigMoment(e);
    }));
    /* A TIMEOUT IS AN EVENT, not a pause. The whistle and the card both come off
     * the engine's own announcement, so the computer calling one looks exactly
     * like the human calling one. */
    this.unsubscribes.push(this.game.events.on('timeout', (e) => {
      audio.play('whistle');
      const team = e.side === 'home' ? this.opts.config.home.team : this.opts.config.away.team;
      const mine = e.side === this.game.humanSide;
      this.game.say(
        e.run >= 6
          ? `${team.abbr} stop the run — ${e.left} left`
          : `${mine ? 'Your' : `${team.abbr}`} timeout — ${e.left} left`,
        2.2,
      );
    }));
    this.unsubscribes.push(this.game.events.on('quarterEnd', (e) => {
      audio.play('buzzer');
      this.showQuarterCard(e.quarter);
    }));
    this.unsubscribes.push(this.game.events.on('gameEnd', () => {
      audio.play('buzzer');
      this.finish();
    }));
    audio.setCrowd(0.4);
  }

  /* ------------------------------------------------------------------- loop */

  private frame = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);

    let delta = (now - this.last) / 1000;
    this.last = now;
    if (!Number.isFinite(delta) || delta < 0) delta = 0;
    delta = Math.min(delta, 0.25);

    /* SLOW MOTION. Only a big moment ever sets it, and it decays on REAL time
     * rather than on game time — otherwise slowing the game down would also slow
     * down the thing that ends the slowing down. */
    if (this.slowmo > 0) {
      this.slowmo = Math.max(0, this.slowmo - delta);
      delta *= 0.28;
    }
    this.tickBeat(delta);

    if (!this.paused && !this.finished && !this.beat) {
      this.acc += delta;
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < 5) {
        this.step(FIXED_DT);
        this.acc -= FIXED_DT;
        steps++;
      }
      if (steps === 5) this.acc = 0;
    }

    if (!this.finished && this.game.isFinal()) this.finish();

    if (this.momentEl) {
      this.momentTimer -= delta;
      if (this.momentTimer <= 0) {
        this.momentEl.remove();
        this.momentEl = null;
      }
    }
    this.syncFreeThrow();

    this.input.sanityCheck();
    this.syncStick();
    this.renderer.draw(this.game, delta);
    this.updateHud(delta);
  };

  /* ------------------------------------------------------------ the broadcast */

  /**
   * Put a card up and hold the game behind it.
   *
   * `seconds` is the longest it may stay: every beat also dismisses on the next
   * thing the player does. That is caught with a listener on the card itself
   * rather than through the input manager, so a key, a gamepad button and a tap
   * all work the same way and the shared manager — which lacrosse uses too —
   * does not grow a basketball-shaped hook.
   */
  private showBeat(el: HTMLElement, seconds: number): void {
    this.clearBeat();
    const dismiss = (): void => this.clearBeat();
    /* A tenth of a second of grace: the press that CAUSED the beat must not also
     * dismiss it before anybody has seen a frame of it. */
    const armAt = performance.now() + 140;
    const guard = (): void => { if (performance.now() >= armAt) dismiss(); };
    el.addEventListener('pointerdown', guard);
    window.addEventListener('keydown', guard);
    this.beat = {
      el,
      timer: seconds,
      off: () => {
        el.removeEventListener('pointerdown', guard);
        window.removeEventListener('keydown', guard);
      },
    };
    this.el.appendChild(el);
    /* The card IS the announcement, so the engine's own banner stands down while
     * it is up — otherwise "TIP OFF" sits across the top of the lineups saying
     * the same thing twice. */
    this.el.classList.add('has-beat');
    // A frame of "off" for the transition to come from.
    requestAnimationFrame(() => el.classList.add('is-on'));
  }

  private clearBeat(): void {
    if (!this.beat) return;
    this.beat.off();
    this.beat.el.remove();
    this.beat = null;
    this.beatClosedAt = performance.now();
    this.el.classList.remove('has-beat');
    // The clock has been held; do not hand the engine the whole held interval.
    this.last = performance.now();
    this.acc = 0;
  }

  private tickBeat(delta: number): void {
    const b = this.beat;
    if (!b) return;
    b.timer -= delta;
    /* Drain the input while the card is up. Without this every button pressed
     * behind a four-second card arrives in one frame the instant it closes, and
     * the tip-off begins with a shot nobody asked for. */
    this.input.consume();
    if (b.timer <= 0) this.clearBeat();
  }

  /**
   * THE CARD BETWEEN QUARTERS.
   *
   * Not on the final buzzer: the game has its own ending and a quarter card in
   * front of it would be a card between the player and the result.
   */
  private showQuarterCard(quarter: number): void {
    const g = this.game;
    if (g.isFinal()) return;
    const title = quarter === 2 ? 'HALF TIME'
      : quarter === 1 ? 'END OF THE FIRST'
        : quarter === 3 ? 'END OF THE THIRD'
          : quarter >= 4 ? `END OF ${g.overtime > 0 ? `OT${g.overtime}` : 'THE FOURTH'}` : 'BREAK';
    this.showBeat(quarterCard({
      title,
      home: this.opts.config.home.team,
      away: this.opts.config.away.team,
      homeScore: g.score.home,
      awayScore: g.score.away,
      byQuarter: { home: [...g.box.home.byQuarter], away: [...g.box.away.byQuarter] },
      star: this.bestLine(),
    }, () => this.clearBeat()).el, 5);
  }

  /** The best line on the floor so far, in the words a broadcast would use. */
  private bestLine(): string | null {
    let best: { name: string; value: number; text: string } | null = null;
    for (const side of ['home', 'away'] as Side[]) {
      for (const p of this.game.played(side)) {
        const s = p.stat;
        const value = s.points + (s.offReb + s.defReb) * 0.9 + s.assists * 1.4;
        if (s.points < 6 || (best && value <= best.value)) continue;
        best = {
          name: playerLabel(p),
          value,
          text: `${playerLabel(p)} — ${s.points} pts, `
            + `${s.offReb + s.defReb} reb, ${s.assists} ast`,
        };
      }
    }
    return best?.text ?? null;
  }

  /**
   * THE MAN ON THE LINE, and the only presentation beat that does not hold the
   * clock: a free throw already has its own pause and a card on top would double
   * it. The plate appears and disappears with the phase.
   */
  private syncFreeThrow(): void {
    const ft = this.game.phase === 'freeThrow' || this.game.freeThrows
      ? this.game.freeThrows : null;
    const key = ft ? `${ft.shooter.uid}:${ft.remaining}` : '';
    if (key === this.ftKey) return;
    this.ftKey = key;
    this.elFt?.remove();
    this.elFt = null;
    if (!ft) return;
    const rating = ft.shooter.data.attrs.freeThrow;
    this.elFt = freeThrowPlate(playerLabel(ft.shooter), rating / 100, {
      shot: ft.total - ft.remaining + 1,
      total: ft.total,
    });
    this.el.appendChild(this.elFt);
    requestAnimationFrame(() => this.elFt?.classList.add('is-on'));
  }

  /**
   * A SHOT THAT MATTERS, and the rules for what counts as one.
   *
   * Three conditions, all of them read off the game rather than guessed: the
   * clock is nearly out, it is the last period, and the basket changed who is
   * winning. A basket that satisfies all three gets slow motion, a white frame
   * and a card. Everything else gets exactly what it got before, because a
   * flourish on every possession is not a flourish.
   */
  private checkBigMoment(e: { side: Side; points: number; shooter: string }): void {
    const g = this.game;
    const late = g.clock <= 2.2;
    const last = g.quarter >= HOOPS.quarters || g.overtime > 0;
    if (!late || !last) return;

    const them = e.side === 'home' ? g.score.away : g.score.home;
    const us = e.side === 'home' ? g.score.home : g.score.away;
    const before = us - e.points;
    let kind: BigMomentKind = 'buzzer';
    if (before <= them && us > them) kind = 'winner';
    else if (before < them && us === them) kind = 'tie';

    this.slowmo = kind === 'buzzer' ? 0.9 : 1.9;
    this.renderer.celebrate(e.side, kind === 'buzzer' ? 1.6 : 3);
    const detail = `${e.points} points · ${g.clockText} left · ${g.score.away}-${g.score.home}`;
    this.momentEl?.remove();
    this.momentEl = bigMoment(kind, e.shooter, detail);
    this.momentTimer = 2.8;
    this.el.appendChild(this.momentEl);
    requestAnimationFrame(() => this.momentEl?.classList.add('is-on'));
  }

  private step(dt: number): void {
    const raw = this.input.consume();
    const world = this.renderer.cam.inputToWorld(raw.moveX, raw.moveY);
    const state = { ...hoopsInput(raw), moveX: world.x, moveY: world.y };
    this.game.update(dt, state);

    // Sneakers. Tied to how hard the man you control is actually cutting, so the
    // sound is information rather than decoration.
    this.squeakTimer -= dt;
    const me = this.game.humanSide ? this.game.controlled[this.game.humanSide] : null;
    if (me && this.squeakTimer <= 0) {
      const speed = Math.hypot(me.vx, me.vy);
      if (speed > 11) {
        audio.play('squeak', Math.min(1, (speed - 11) / 6));
        this.squeakTimer = 0.45 + Math.random() * 0.5;
      }
    }
  }

  /* -------------------------------------------------------------------- hud */

  /**
   * The scoreboard's real height, safe area included, handed to the camera so the
   * basket is framed below it rather than behind it.
   */
  private measureHud(): void {
    const hud = this.el.querySelector('.hoop-hud');
    if (hud instanceof HTMLElement) this.renderer.setHudHeight(hud.getBoundingClientRect().height);
  }

  private updateHud(dt: number): void {
    void dt;
    this.measureHud();
    const g = this.game;
    if (this.lastScore.home !== g.score.home) {
      this.lastScore.home = g.score.home;
      this.elHome.textContent = String(g.score.home);
    }
    if (this.lastScore.away !== g.score.away) {
      this.lastScore.away = g.score.away;
      this.elAway.textContent = String(g.score.away);
    }
    const clockText = g.clockText;
    if (clockText !== this.lastClockText) {
      this.lastClockText = clockText;
      this.elClock.textContent = clockText;
    }
    const q = g.overtime > 0 ? `OT${g.overtime}` : `Q${g.quarter}`;
    if (this.elQuarter.textContent !== q) this.elQuarter.textContent = q;

    const sc = g.shotClockText;
    if (this.elShot.textContent !== sc) this.elShot.textContent = sc;
    this.elShot.classList.toggle('is-late', g.shotClock < 5);

    const homeBonus = g.box.home.quarterFouls >= HOOPS.bonusAt;
    const awayBonus = g.box.away.quarterFouls >= HOOPS.bonusAt;
    const bonus = homeBonus && awayBonus ? 'BOTH IN THE BONUS'
      : homeBonus ? `${this.opts.config.home.team.abbr} IN THE BONUS`
        : awayBonus ? `${this.opts.config.away.team.abbr} IN THE BONUS`
          : `${g.box.away.quarterFouls} · team fouls · ${g.box.home.quarterFouls}`;
    if (this.elBonus.textContent !== bonus) this.elBonus.textContent = bonus;

    /* TIMEOUTS LEFT, for both sides, as pips rather than a number — five little
     * marks that go out one at a time is a thing a player reads at a glance in
     * the last minute, and a number is a thing he has to think about. */
    const pips = `${'•'.repeat(g.timeouts.away)}${'·'.repeat(5 - g.timeouts.away)}`
      + `  T/O  ${'•'.repeat(g.timeouts.home)}${'·'.repeat(5 - g.timeouts.home)}`;
    if (this.elTimeouts.textContent !== pips) this.elTimeouts.textContent = pips;

    // The touch button says whether it can be pressed, rather than doing nothing.
    if (this.touchMode && g.humanSide) {
      const can = g.canCallTimeout(g.humanSide);
      this.elTimeoutBtn.classList.toggle('is-dim', !can);
    }

    if (this.elBanner.textContent !== g.banner) {
      this.elBanner.textContent = g.banner;
      this.elBanner.classList.toggle('is-on', !!g.banner);
    }
    if (this.elTicker.textContent !== g.message) {
      this.elTicker.textContent = g.message;
      this.elTicker.classList.toggle('is-on', !!g.message);
    }

    // Pass and shoot become steal and block the moment the ball changes hands.
    // On a phone there is no key legend to read, so the button has to say it.
    if (this.touchMode) {
      const attacking = g.humanSide !== null && g.possession === g.humanSide;
      if (attacking !== this.lastAttacking) {
        this.lastAttacking = attacking;
        label(this.elPassBtn, attacking ? 'Pass' : 'Steal');
        label(this.elShootBtn, attacking ? 'Shoot' : 'Block');
      }
    }
  }

  private renderHints(): void {
    if (this.touchMode || !this.app.settings.showHints) {
      this.elHints.classList.add('is-off');
      return;
    }
    this.elHints.classList.remove('is-off');
    const b = this.app.keybinds;
    const key = (id: string): string => keyLabel((b[id] ?? [])[0] ?? '');
    clear(this.elHints);
    const pair = (k: string, what: string) =>
      h('span', { class: 'key' }, h('b', { text: k }), ` ${what}`);
    this.elHints.append(
      pair(key('pass'), 'Pass / Steal'),
      pair(key('shoot'), 'Hold to shoot · Block'),
      pair(key('cross'), 'Crossover'),
      pair(key('screen'), 'Screen'),
      pair(key('switch'), 'Switch'),
      pair(key('timeout'), 'Timeout'),
    );
  }

  private syncStick(): void {
    const s = this.input.stick;
    if (s.active !== this.stickShown) {
      this.stickShown = s.active;
      this.elStick.classList.toggle('is-on', s.active);
    }
    if (!s.active) return;
    const host = this.el.getBoundingClientRect();
    this.elStick.style.left = `${s.originX - host.left}px`;
    this.elStick.style.top = `${s.originY - host.top}px`;
    this.elStickNub.style.transform = `translate(${s.dx}px, ${s.dy}px)`;
  }

  /* ------------------------------------------------------------------ pause */

  private togglePause(): void {
    if (this.finished) return;
    /* A PRESS THAT DISMISSES A CARD DOES NOTHING ELSE.
     *
     * Every beat closes on any input, and the pause key is an input — so pressing
     * escape on the lineups used to close the card AND open the pause menu in the
     * same frame. The two listeners race, so a flag is not enough: the moment the
     * card closed is remembered, and a pause arriving in the same breath is the
     * one that closed it. */
    if (this.beat) { this.clearBeat(); return; }
    if (performance.now() - this.beatClosedAt < 220) return;
    this.paused = !this.paused;
    this.input.suspended = this.paused;
    this.input.releaseAll();
    if (this.paused) this.showPause();
    else this.closeOverlay();
  }

  private closeOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  private showPause(): void {
    this.closeOverlay();
    const body = h('div', { class: 'overlay__body stack' });
    const tabs = segmented<PauseTab>(
      [
        { value: 'menu', label: 'Menu' },
        { value: 'controls', label: 'Controls' },
        { value: 'box', label: 'Box score' },
      ],
      this.pauseTab,
      (v) => { this.pauseTab = v; this.fillPause(body); },
      true,
    );
    this.fillPause(body);
    this.overlay = h('div', { class: 'overlay' },
      h('div', { class: 'overlay__card' },
        h('div', { class: 'overlay__head', text: 'Paused' }),
        tabs,
        body));
    this.el.appendChild(this.overlay);
  }

  private fillPause(body: HTMLElement): void {
    clear(body);
    if (this.pauseTab === 'menu') {
      body.append(
        h('button', {
          class: 'btn btn--primary btn--block', text: 'Resume',
          on: { click: () => this.togglePause() },
        }),
        h('button', {
          class: 'btn btn--block', text: 'Simulate the rest',
          on: {
            click: () => {
              this.game.simulateRest();
              this.paused = false;
              this.closeOverlay();
              this.finish();
            },
          },
        }),
        h('button', {
          class: 'btn btn--block', text: 'Quit game',
          on: {
            click: () => {
              this.running = false;
              this.opts.onQuit();
            },
          },
        }),
      );
      return;
    }
    if (this.pauseTab === 'controls') {
      body.append(
        h('div', {
          class: 'small',
          text: 'The same two buttons do different jobs depending on whether you have '
            + 'the ball: pass becomes a reach-in, and shoot becomes a block or a jump '
            + 'for the rebound.',
        }),
        fieldRow('On-screen hints', null, segmented(
          [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }],
          this.app.settings.showHints ? 'on' : 'off',
          (v) => {
            this.app.updateSettings({ showHints: v === 'on' });
            this.renderHints();
          },
        )),
        keybindEditor(this.app, () => this.renderHints()),
      );
      return;
    }
    body.append(boxScoreTable(this.game, this.opts.config));
  }

  /* ----------------------------------------------------------------- finish */

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.input.suspended = true;
    audio.stopCrowd();
    this.opts.onComplete(this.game);
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input.detach();
    for (const off of this.unsubscribes) off();
    this.unsubscribes = [];
    this.app.onKeybindsChanged = null;
    audio.stopCrowd();
    this.game.events.clear();
    delete (window as unknown as { hardwood?: unknown }).hardwood;
  }
}

/** A team's colours, in the renderer's terms. */
/**
 * WHAT THE TWO SIDES WEAR.
 *
 * Basketball's own rule is home light, away dark. This does the opposite, on
 * purpose: a club's colour is its identity, the home club's building is the one
 * being drawn, and a home side in white would put the only colours in the picture
 * on the visitors. So the home side wears its kit and the VISITOR wears its
 * change strip — near-white with its own primary as the trim and the numbers,
 * which is a real away kit and which no home club can ever clash with.
 *
 * The clash is not a cosmetic worry. Ten men on a fifty-foot floor at three
 * pixels a jersey is the hardest reading problem in the game, and two clubs with
 * similar primaries would make it unplayable.
 */
export function jerseyFor(team: HoopsTeam, isHome = true): {
  primary: string; secondary: string; ink: string;
} {
  if (isHome) {
    return { primary: team.primary, secondary: team.secondary, ink: '#ffffff' };
  }
  return { primary: '#e9ecf2', secondary: team.primary, ink: team.primary };
}

/** Exported for the post-game screen. */
export const neutralInput = neutralHoopsInput;
export const playerLabel = (p: CourtPlayer): string => `${p.data.first} ${p.data.last}`;
export const teamName = teamLabel;

/** Keeps the visible face and the screen-reader name of a button in step. */
function label(el: HTMLElement, text: string): void {
  el.textContent = text;
  el.setAttribute('aria-label', text);
}

/**
 * How full the building is, 0..1.
 *
 * Read off the club's own prestige, which every team in the world carries. Two
 * thirds is a respectable crowd; a blue blood is nearly full and a club at the
 * bottom of its level plays in front of half a bowl of empty seats.
 */
function attendanceFor(team: HoopsTeam): number {
  const standing = 'standing' in team ? (team as { standing: number }).standing : 55;
  return Math.max(0.34, Math.min(0.97, 0.34 + (standing / 99) * 0.63));
}
