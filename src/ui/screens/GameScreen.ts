import { audio } from '../../audio/Audio';
import { Match } from '../../match/Match';
import type { MatchConfig } from '../../match/types';
import { Renderer, type AimHint, type ViewOverride } from '../../render/Renderer';
import { InputManager, type ButtonId } from '../../input/Input';
import { h, clear } from '../dom';
import type { App, Screen } from '../App';
import { GAME_LENGTHS, type Side } from '../../data/constants';
import { areRivals } from '../../data/teams';
import { shortName } from '../../data/players';
import type { MatchPlayer } from '../../match/types';
import { Tutorial } from './tutorial';
import { pauseIcon } from '../icons';

export interface GameScreenOptions {
  config: MatchConfig;
  /** Optional guided walkthrough overlaid on a real match. */
  tutorial?: boolean;
  /** Called once when the game reaches its final whistle. */
  onComplete: (match: Match) => void;
  /** Called if the player quits early. */
  onQuit: () => void;
  subtitle?: string;
}

const FIXED_DT = 1 / 60;

export class GameScreen implements Screen {
  el: HTMLElement;
  private app: App;
  private opts: GameScreenOptions;
  private match: Match;
  private renderer: Renderer;
  private input = new InputManager();
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = true;
  private paused = false;
  private finished = false;
  private unsubscribes: (() => void)[] = [];

  // HUD refs
  private canvas!: HTMLCanvasElement;
  private elHomeScore!: HTMLElement;
  private elAwayScore!: HTMLElement;
  private elClock!: HTMLElement;
  private elQuarter!: HTMLElement;
  private elShotClock!: HTMLElement;
  private elBanner!: HTMLElement;
  private elBannerText!: HTMLElement;
  private elGoalSlot!: HTMLElement;
  private elTicker!: HTMLElement;
  private elFaceoff!: HTMLElement;
  private elFoZone!: HTMLElement;
  private elFoMarker!: HTMLElement;
  private elFoLabel!: HTMLElement;
  private elShotFeed!: HTMLElement;
  private elReplayFx!: HTMLElement;
  private elReplaySkip!: HTMLElement;
  private elReplaySlow!: HTMLElement;
  private replayShown = false;
  private shotFeedTimer = 0;
  private elTouch!: HTMLElement;
  private elStick!: HTMLElement;
  private elStickNub!: HTMLElement;
  private elActionBtn!: HTMLElement;
  private overlay: HTMLElement | null = null;

  private stickShown = false;
  private stickNubX = 0;
  private stickNubY = 0;
  private tickerTimer = 0;
  private lastScore = { home: -1, away: -1 };
  private lastClockText = '';
  private touchMode: boolean;
  private tutorial: Tutorial | null = null;
  private elCoach: HTMLElement | null = null;

  constructor(app: App, opts: GameScreenOptions) {
    this.app = app;
    this.opts = opts;
    this.match = new Match(opts.config);
    this.touchMode = app.settings.controls === 'touch'
      || (app.settings.controls === 'auto' && isTouchDevice());

    this.el = this.build();
    this.renderer = new Renderer(this.canvas);
    this.renderer.resize();
    this.renderer.prepare(this.match);

    if (opts.tutorial) {
      this.tutorial = new Tutorial(this.match, this.touchMode);
      this.elCoach = h('div', { class: 'ticker', style: 'bottom:auto;top:calc(var(--safe-t) + 68px);border-color:var(--accent);color:var(--text)' });
      this.el.appendChild(this.elCoach);
    }

    this.input.attach(this.el);
    this.input.onPause = () => this.togglePause();
    this.wireEvents();

    audio.unlock();
    audio.stopMusic();
    audio.setCrowd(0.35 + (opts.config.home.team.homeField.crowd * 0.5));

    // Debug hook: lets the live match be inspected from the console (and by the
    // automated play tests). Read-only convenience, no gameplay depends on it.
    (window as unknown as { loneStarLax?: unknown }).loneStarLax = {
      match: this.match, renderer: this.renderer, input: this.input,
    };

    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.showIntro();
  }

  /* ------------------------------------------------------------------ DOM */

  private build(): HTMLElement {
    const cfg = this.opts.config;
    const home = cfg.home.team;
    const away = cfg.away.team;
    const practice = cfg.practice;

    this.canvas = h('canvas', { class: 'game__canvas' });

    this.elHomeScore = h('div', { class: 'score__num num', text: '0' });
    this.elAwayScore = h('div', { class: 'score__num num', text: '0' });
    this.elClock = h('div', { class: 'score__clock num', text: this.match.clockText() });
    this.elQuarter = h('div', { class: 'score__q', text: practice ? 'DRILL' : 'Q1' });
    this.elShotClock = h('div', { class: 'shotclock num', text: '50' });
    this.elBannerText = h('div', { class: 'banner__slot' });
    this.elGoalSlot = h('div', { class: 'banner__slot' });
    this.elBanner = h('div', { class: 'banner' }, this.elBannerText, this.elGoalSlot);
    this.elTicker = h('div', { class: 'ticker', style: 'display:none' });
    this.elShotFeed = h('div', { class: 'shotfeed', style: 'display:none' });
    this.elReplaySlow = h('span', { class: 'replay-tag__slow' });
    this.elReplayFx = h('div', { class: 'replay-fx' },
      h('div', { class: 'replay-fx__bar replay-fx__bar--top' }),
      h('div', { class: 'replay-fx__bar replay-fx__bar--bottom' }),
      h('div', { class: 'replay-tag' },
        h('span', { class: 'replay-tag__dot' }),
        h('span', { text: 'Replay' }),
        this.elReplaySlow));
    this.elReplaySkip = h('button', {
      class: 'replay-skip', text: 'Skip ▸',
      on: { click: () => this.match.skipReplay() },
    });

    this.elFoZone = h('div', { class: 'fo__zone' });
    this.elFoMarker = h('div', { class: 'fo__marker' });
    this.elFoLabel = h('div', { class: 'fo__label', text: 'SET' });
    this.elFaceoff = h('div', { class: 'fo', style: 'display:none' },
      this.elFoLabel,
      h('div', { class: 'fo__bar' }, this.elFoZone, this.elFoMarker),
      h('div', {
        class: 'fo__hint',
        text: this.touchMode ? 'TAP CLAMP INSIDE THE GREEN' : 'PRESS SPACE INSIDE THE GREEN',
      }),
    );

    const scoreboard = h('div', { class: 'hud' },
      h('div', { class: 'score' },
        h('div', { class: 'score__side' },
          h('div', { class: 'score__chip', style: `background:${home.primary}` }),
          h('div', { class: 'score__abbr', text: home.abbr }),
          this.elHomeScore),
        h('div', { class: 'score__mid' }, this.elClock, this.elQuarter),
        h('div', { class: 'score__side score__side--away' },
          h('div', { class: 'score__chip', style: `background:${away.primary}` }),
          h('div', { class: 'score__abbr', text: away.abbr }),
          this.elAwayScore),
      ),
    );

    this.elStickNub = h('div', { class: 'stick__nub' });
    this.elStick = h('div', { class: 'stick' }, this.elStickNub);
    this.elActionBtn = this.touchButton('action', 'Pass');
    this.elTouch = h('div', { class: `touch${this.touchMode ? '' : ' is-off'}` },
      this.elStick,
      h('div', { class: 'tbtns' },
        this.touchButton('switch', 'Switch'),
        this.touchButton('shoot', 'Shoot'),
        this.elActionBtn,
        this.touchButton('dodge', 'Dodge'),
      ),
    );

    const hints = this.app.settings.showHints && !this.touchMode
      ? h('div', { class: 'hint-strip' },
        key('WASD', 'Move'), key('SHIFT', 'Sprint'), key('SPACE', 'Pass / Check'),
        key('F', 'Shoot (hold)'), key('E', 'Dodge'), key('TAB', 'Switch'))
      : null;

    return h('div', { class: 'game' },
      this.canvas,
      scoreboard,
      practice ? null : this.elShotClock,
      this.elBanner,
      this.elTicker,
      this.elFaceoff,
      this.elShotFeed,
      this.elReplayFx,
      this.elReplaySkip,
      this.elTouch,
      hints,
      h('button', {
        class: 'pause-btn', ariaLabel: 'Pause',
        on: { click: () => this.togglePause() },
      }, pauseIcon(14)),
    );
  }

  private touchButton(id: ButtonId, label: string): HTMLElement {
    const btn = h('button', { class: `tbtn tbtn--${id}`, text: label, ariaLabel: label });
    // The element reports presses; every bit of held state lives in the input
    // manager so a lost pointerup cannot leave a button stuck down.
    this.input.registerButton(id, btn);
    return btn;
  }

  /* --------------------------------------------------------------- events */

  private wireEvents(): void {
    const m = this.match;
    const fx = () => this.renderer.effects;
    const teamColors = (side: Side) => {
      const t = this.opts.config[side].team;
      return [t.primary, t.secondary, '#ffffff'];
    };

    this.unsubscribes.push(
      m.events.on('goal', ({ side, scorer, assist, distance }) => {
        audio.play('goal');
        const goalPos = m.focus ?? { x: m.ball.x, y: m.ball.y };
        fx().confetti(goalPos.x, goalPos.y, 46, teamColors(side));
        fx().burst(goalPos.x, goalPos.y, 26, teamColors(side), 9);
        fx().screenFlash('#ffffff', 0.45);
        this.renderer.cam.addShake(9);
        this.bumpScore(side);
        this.showGoalCard(side, scorer, assist, distance);
      }),
      m.events.on('save', ({ goalie, power }) => {
        audio.play('save', power);
        fx().burst(goalie.x, goalie.y, 10, ['#ffffff', '#cfe0d2'], 6);
        this.renderer.cam.addShake(2.5);
      }),
      m.events.on('post', ({ x, y }) => {
        audio.play('post');
        fx().burst(x, y, 8, ['#f26a21', '#ffffff'], 7);
      }),
      m.events.on('shot', ({ power }) => audio.play('shot', power)),
      m.events.on('shotFeedback', ({ label, tone }) => this.showShotFeed(label, tone)),
      m.events.on('pass', () => audio.play('pass')),
      m.events.on('catch', () => audio.play('catch')),
      m.events.on('check', ({ hit, x, y }) => {
        if (hit) {
          audio.play('check');
          fx().burst(x, y, 14, ['#ffffff', '#ffe14d'], 7);
        }
      }),
      m.events.on('whistle', () => audio.play('whistle')),
      m.events.on('shake', ({ amount }) => this.renderer.cam.addShake(amount)),
      m.events.on('commentary', ({ text, tone }) => this.showBanner(text, tone)),
      m.events.on('quarterEnd', () => audio.play('buzzer')),
      m.events.on('turnover', () => { /* handled by commentary */ }),
      m.events.on('gameEnd', () => this.finish()),
    );
  }

  private bumpScore(side: Side): void {
    const el = side === 'home' ? this.elHomeScore : this.elAwayScore;
    el.classList.remove('is-bump');
    // Force a reflow so the animation restarts on a second goal in a row.
    void el.offsetWidth;
    el.classList.add('is-bump');
  }

  /* ---------------------------------------------------------------- touch */

  /** Mirrors the input manager's stick state onto the DOM. Called every frame so
   *  the visual can never disagree with what the game is actually reading. */
  private syncStick(): void {
    const st = this.input.stick;
    if (st.active !== this.stickShown) {
      this.stickShown = st.active;
      this.elStick.classList.toggle('is-on', st.active);
    }
    if (!st.active) {
      if (this.stickNubX !== 0 || this.stickNubY !== 0) {
        this.stickNubX = 0;
        this.stickNubY = 0;
        this.elStickNub.style.transform = '';
      }
      return;
    }
    const rect = this.el.getBoundingClientRect();
    this.elStick.style.left = `${st.originX - rect.left}px`;
    this.elStick.style.top = `${st.originY - rect.top}px`;
    if (st.dx !== this.stickNubX || st.dy !== this.stickNubY) {
      this.stickNubX = st.dx;
      this.stickNubY = st.dy;
      this.elStickNub.style.transform = `translate(${st.dx}px, ${st.dy}px)`;
    }
  }

  /* ----------------------------------------------------------------- loop */

  private frame = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);

    let delta = (now - this.last) / 1000;
    this.last = now;
    if (!Number.isFinite(delta) || delta < 0) delta = 0;
    delta = Math.min(delta, 0.25);

    if (!this.paused && !this.finished) {
      this.acc += delta;
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < 5) {
        this.step(FIXED_DT);
        this.acc -= FIXED_DT;
        steps++;
      }
      if (steps === 5) this.acc = 0;
    }

    // Final backstop against a stuck pointer: if the page is not visible,
    // nothing can legitimately still be held.
    this.input.sanityCheck();
    this.syncStick();
    this.draw(delta);
    this.updateHud(delta);
  };

  private step(dt: number): void {
    const raw = this.input.consume();
    const world = this.renderer.cam.inputToWorld(raw.moveX, raw.moveY);
    const state = { ...raw, moveX: world.x, moveY: world.y };
    this.match.update(dt, state);
    if (this.tutorial) {
      this.tutorial.update(dt, state, this.match);
      if (this.elCoach) {
        const text = this.tutorial.prompt;
        const full = text ? `${this.tutorial.progress}  ·  ${text}` : '';
        if (this.elCoach.textContent !== full) this.elCoach.textContent = full;
      }
    }
  }

  /** Drives the replay overlay and hands the renderer a cinematic camera. */
  private replayView(): ViewOverride | null {
    const m = this.match;
    const on = m.phase === 'replay';
    if (on !== this.replayShown) {
      this.replayShown = on;
      this.elReplayFx.classList.toggle('is-on', on);
      this.elReplaySkip.classList.toggle('is-on', on);
      this.elTouch.classList.toggle('is-hidden', on);
      if (on) this.input.releaseAll();
    }
    // Recomputed every frame so pausing during a replay behaves correctly.
    this.input.suspended = on || this.paused || this.finished;
    if (!on) return null;

    const slow = m.replaySpeed < 0.9;
    const slowText = slow ? 'Slow motion' : '';
    if (this.elReplaySlow.textContent !== slowText) this.elReplaySlow.textContent = slowText;

    // Ease the zoom in over the clip and push in harder for the finish.
    const t = m.replayDuration > 0 ? m.replayTime / m.replayDuration : 0;
    const zoom = 1.18 + Math.min(1, t) * 0.24 + (slow ? 0.18 : 0);
    return {
      zoom,
      focusX: m.ball.x,
      focusY: m.ball.y,
      followRate: 9,
      presentation: true,
    };
  }

  private showShotFeed(label: string, tone: 'good' | 'bad' | 'neutral'): void {
    this.elShotFeed.textContent = label;
    this.elShotFeed.className = `shotfeed${tone === 'neutral' ? '' : ` shotfeed--${tone}`}`;
    this.elShotFeed.style.display = '';
    this.shotFeedTimer = 1.7;
  }

  private draw(dt: number): void {
    const m = this.match;
    const carrier = m.ball.carrier;
    const human = m.humanSide;
    let aim: AimHint | null = null;
    if (carrier && human && carrier.side === human) {
      const raw = this.input.peekMove();
      if (Math.hypot(raw.x, raw.y) > 0.12) { this.lastAimX = raw.x; this.lastAimY = raw.y; }
      const dir = this.renderer.cam.inputToWorld(this.lastAimX, this.lastAimY);
      aim = { x: dir.x, y: dir.y, charging: carrier.windup > 0.02, charge: carrier.windup };
    }
    this.renderer.render(m, dt, aim, this.replayView());
  }

  private lastAimX = 0;
  private lastAimY = 0;

  private updateHud(dt: number): void {
    const m = this.match;

    if (m.score.home !== this.lastScore.home) {
      this.lastScore.home = m.score.home;
      this.elHomeScore.textContent = String(m.score.home);
    }
    if (m.score.away !== this.lastScore.away) {
      this.lastScore.away = m.score.away;
      this.elAwayScore.textContent = String(m.score.away);
    }

    const practice = this.opts.config.practice;
    if (practice) {
      const total = practice.reps ?? m.practice.reps;
      this.elClock.textContent = practice.seconds ? m.clockText() : `${m.practice.success}/${total}`;
      this.elQuarter.textContent = practice.seconds ? 'DRILL' : 'REPS';
    } else {
      const ct = m.clockText();
      if (ct !== this.lastClockText) {
        this.lastClockText = ct;
        this.elClock.textContent = ct;
      }
      this.elQuarter.textContent = m.quarterText();
      const sc = Math.max(0, Math.ceil(m.shotClock));
      this.elShotClock.textContent = String(sc);
      this.elShotClock.classList.toggle('is-low', sc <= 10 && m.phase === 'live');
      this.elShotClock.style.display = m.phase === 'live' && m.ball.carrier ? '' : 'none';
    }

    // Contextual action button label.
    if (this.touchMode) {
      const human = m.humanSide;
      const ctrl = human ? m.controlled[human] : null;
      const hasBall = !!ctrl && m.ball.carrier === ctrl;
      const label = m.phase === 'faceoff' ? 'Clamp' : hasBall ? 'Pass' : 'Check';
      if (this.elActionBtn.textContent !== label) this.elActionBtn.textContent = label;
    }

    // Faceoff meter
    const fo = m.faceoff;
    if (fo && m.phase === 'faceoff' && !fo.auto) {
      this.elFaceoff.style.display = '';
      this.elFoLabel.textContent = fo.message;
      const showBar = fo.stage === 'sweep' || fo.stage === 'result';
      this.elFoZone.style.left = `${fo.zoneStart * 100}%`;
      this.elFoZone.style.width = `${(fo.zoneEnd - fo.zoneStart) * 100}%`;
      this.elFoZone.style.opacity = showBar ? '1' : '0.25';
      this.elFoMarker.style.left = `${Math.min(100, fo.marker * 100)}%`;
      this.elFoMarker.style.opacity = showBar ? '1' : '0';
    } else if (this.elFaceoff.style.display !== 'none') {
      this.elFaceoff.style.display = 'none';
    }

    // Banner from the sim (offsides, out of bounds, quarter breaks)
    if (m.banner && this.elBanner.dataset.text !== m.banner.text) {
      this.showBanner(m.banner.text, m.banner.tone);
    }

    if (this.tickerTimer > 0) {
      this.tickerTimer -= dt;
      if (this.tickerTimer <= 0) this.elTicker.style.display = 'none';
    }
    if (this.shotFeedTimer > 0) {
      this.shotFeedTimer -= dt;
      if (this.shotFeedTimer <= 0) this.elShotFeed.style.display = 'none';
    }
    if (this.elGoalCard && m.phase !== 'goal' && m.phase !== 'replay') {
      clear(this.elGoalSlot);
      this.elGoalCard = null;
    }
  }

  /** Big moments get the centre banner; everything else goes to the ticker so
   *  the field is never buried under text. */
  private showBanner(text: string, tone: 'big' | 'normal'): void {
    if (tone === 'big') {
      this.elBanner.dataset.text = text;
      clear(this.elBannerText);
      this.elBannerText.appendChild(h('div', { class: 'banner__text banner__text--big', text }));
      window.setTimeout(() => {
        if (this.elBanner.dataset.text === text) clear(this.elBannerText);
      }, 1200);
    }
    this.elTicker.textContent = text;
    this.elTicker.style.display = '';
    this.tickerTimer = tone === 'big' ? 2.2 : 1.6;
  }

  /** Who scored it, who set it up, and from how far. */
  private showGoalCard(
    side: Side,
    scorer: MatchPlayer | null,
    assist: MatchPlayer | null,
    distance: number,
  ): void {
    if (!scorer) return;
    const team = this.opts.config[side].team;
    const meta = [
      `${team.abbr} · #${scorer.data.number} ${scorer.data.pos}`,
      `${Math.round(distance)} yards`,
      assist ? `assist ${shortName(assist.data)}` : null,
    ].filter(Boolean).join('  ·  ');

    clear(this.elGoalSlot);
    const card = h('div', { class: 'goalcard' },
      h('div', { class: 'goalcard__scorer', text: `${scorer.data.first} ${scorer.data.last}` }),
      h('div', { class: 'goalcard__meta', text: meta }));
    this.elGoalCard = card;
    this.elGoalSlot.appendChild(card);
    // Cleared by phase, not by a timer, so the scorer stays named through the
    // celebration and the replay.
  }

  private elGoalCard: HTMLElement | null = null;

  private showIntro(): void {
    const cfg = this.opts.config;
    const rivalry = cfg.rivalry ?? areRivals(cfg.home.team.id, cfg.away.team.id);
    const label = cfg.contextLabel
      ?? (rivalry ? 'RIVALRY GAME' : cfg.practice ? cfg.practice.title : 'FACEOFF');
    this.showBanner(label, rivalry || cfg.contextLabel ? 'big' : 'normal');

    // Then the venue line, so you know where you are and what it looks like.
    window.setTimeout(() => {
      if (this.finished || !this.running) return;
      this.elTicker.textContent = this.venueLine();
      this.elTicker.style.display = '';
      this.tickerTimer = 3.2;
    }, 1400);
  }

  private venueLine(): string {
    const cfg = this.opts.config;
    const field = cfg.home.team.homeField;
    const weather = this.renderer.weather;
    const bits = [field.name.toUpperCase()];
    if (weather && weather.kind !== 'clear') bits.push(weather.label);
    else if (field.time === 'night') bits.push('Under the lights');
    return bits.join('  ·  ');
  }

  /* ---------------------------------------------------------------- pause */

  private togglePause(): void {
    if (this.finished) return;
    this.paused = !this.paused;
    if (this.paused) this.openPause();
    else this.closePause();
  }

  private closePause(): void {
    this.overlay?.remove();
    this.overlay = null;
    this.last = performance.now();
    this.input.suspended = false;
    this.input.releaseAll();
  }

  private openPause(): void {
    // Drop everything that is held so nothing carries across the pause.
    this.input.suspended = true;
    this.input.releaseAll();
    const cfg = this.opts.config;
    const lengthLabel = cfg.practice
      ? cfg.practice.goal
      : `${GAME_LENGTHS[lengthKeyFor(cfg.quarterSeconds)].label} game`;

    this.overlay = h('div', { class: 'overlay' },
      h('div', { class: 'overlay__card panel' },
        h('div', { class: 'panel__head', text: 'Paused' }),
        h('div', { class: 'panel__body stack' },
          h('div', { class: 'small', text: `${cfg.away.team.name} at ${cfg.home.team.name} · ${lengthLabel}` }),
          h('div', { class: 'tiny', text: this.venueLine() }),
          h('div', { class: 'divider' }),
          h('div', { class: 'eyebrow', text: 'Controls' }),
          this.touchMode
            ? h('div', { class: 'small' },
              h('div', { text: 'Drag anywhere on the left to move. Push to the edge to sprint.' }),
              h('div', { text: 'PASS doubles as CHECK on defence and CLAMP at the faceoff.' }),
              h('div', { text: 'Hold SHOOT to charge, release to fire.' }))
            : h('div', { class: 'small' },
              h('div', { text: 'WASD / Arrows — move · SHIFT — sprint' }),
              h('div', { text: 'SPACE — pass, check, and clamp the faceoff' }),
              h('div', { text: 'F — hold to charge a shot, release to fire' }),
              h('div', { text: 'E — dodge · TAB — switch player · ESC — pause' })),
          h('div', { class: 'divider' }),
          h('button', {
            class: 'btn btn--primary btn--block', text: 'Resume',
            on: { click: () => this.togglePause() },
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
        ),
      ),
    );
    this.el.appendChild(this.overlay);
  }

  /* ---------------------------------------------------------------- finish */

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    // Nothing should still be held once the whistle goes.
    this.input.suspended = true;
    this.input.releaseAll();
    audio.play('buzzer');
    audio.stopCrowd();
    window.setTimeout(() => {
      if (!this.running) return;
      this.opts.onComplete(this.match);
    }, 900);
  }

  /** The screen is measured only once it is in the document. */
  resume(): void {
    if (this.renderer.resize()) this.renderer.prepare(this.match);
  }

  destroy(): void {
    this.elGoalCard = null;
    this.running = false;
    cancelAnimationFrame(this.raf);
    for (const off of this.unsubscribes) off();
    this.unsubscribes.length = 0;
    this.match.events.clear();
    this.input.detach();
    this.renderer.destroy();
    audio.stopCrowd();
    if (this.app.settings.musicVolume > 0) audio.startMusic();
    const w = window as unknown as { loneStarLax?: unknown };
    if (w.loneStarLax && (w.loneStarLax as { match?: unknown }).match === this.match) {
      delete w.loneStarLax;
    }
  }
}

function key(k: string, label: string): HTMLElement {
  return h('div', { class: 'key' }, h('b', { text: k }), ` ${label}`);
}

function isTouchDevice(): boolean {
  return (
    ('ontouchstart' in window) ||
    (navigator.maxTouchPoints ?? 0) > 0
  );
}

function lengthKeyFor(quarterSeconds: number): keyof typeof GAME_LENGTHS {
  let best: keyof typeof GAME_LENGTHS = 'short';
  let bestDiff = Infinity;
  for (const k of Object.keys(GAME_LENGTHS) as (keyof typeof GAME_LENGTHS)[]) {
    const d = Math.abs(GAME_LENGTHS[k].quarterSeconds - quarterSeconds);
    if (d < bestDiff) { bestDiff = d; best = k; }
  }
  return best;
}
