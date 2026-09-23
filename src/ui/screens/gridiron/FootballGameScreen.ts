import { audio } from '../../../audio/Audio';
import { h, clear } from '../../dom';
import type { App, Screen } from '../../App';
import { InputManager } from '../../../input/Input';
import { keybindEditor } from '../../keybindEditor';
import { keyLabel } from '../../../state/keybinds';
import { pauseIcon } from '../../icons';
import { FootballGame } from '../../../sports/football/Game';
import { FootballRenderer } from '../../../sports/football/FootballRenderer';
import {
  FOOTBALL_CONTROLS, footballInput, neutralFootballInput, type FootballAim,
} from '../../../sports/football/input';
import { aiDefenseCall } from '../../../sports/football/ai';
import {
  DEFENSIVE_PLAYS, FAMILY_LABEL, OFFENSIVE_PLAYS,
  type DefensivePlay, type OffensivePlay, type PlayFamily,
} from '../../../sports/football/playbook';
import { attackDir, dist2, fieldGoalDistance, yardsToGoal } from '../../../sports/football/field';
import { FOOTBALL } from '../../../sports/football/tuning';
import { GAME_PLANS, type FootballConfig, type FieldPlayer, type GamePlan } from '../../../sports/football/types';
import type { Side } from '../../../sports/football/field';
import { footballBoxScore } from './boxScore';

/* ---------------------------------------------------------------------------
 * PLAYING FOOTBALL
 * ---------------------------------------------------------------------------
 * The screen a football game is played on, and it has one job the other two
 * sports' screens do not: IT HAS TO ASK A QUESTION, forty times a game, and get
 * an answer in a couple of seconds.
 *
 * That question — what are we running — is the sport. Everything else on this
 * screen is arranged around making it fast to answer: the plays are grouped by
 * what they DO rather than by name, each one says its trade in a single line,
 * and the card that asks is the same size and in the same place every time so
 * that by the second quarter a player is choosing by position rather than by
 * reading.
 *
 * THE OTHER HALF IS THE THROW, and it is a tap. The receivers are already on
 * the field with rings around them; pointing at one is the entire gesture, on a
 * phone and with a mouse alike. A keyboard aims with the arrow keys and throws
 * with a key, because a keyboard has no pointing.
 * ------------------------------------------------------------------------- */

const FIXED_DT = 1 / 60;

export interface FootballGameOptions {
  config: FootballConfig;
  onComplete: (game: FootballGame) => void;
  onQuit: () => void;
  subtitle?: string;
  /** So a franchise remembers the plan he switched to mid-game. */
  onPlanChange?: (plan: GamePlan) => void;
}

type PauseTab = 'menu' | 'controls' | 'box';

/** What the scoreboard says while the kicking units are out. */
const KICK_LABEL = {
  fieldGoal: 'Field goal', punt: 'Punt', kickoff: 'Kickoff', extraPoint: 'Extra point',
} as const;

export class FootballGameScreen implements Screen {
  el: HTMLElement;

  private app: App;
  private opts: FootballGameOptions;
  private game: FootballGame;
  private renderer!: FootballRenderer;
  private input = new InputManager(FOOTBALL_CONTROLS);
  private raf = 0;
  private last = 0;
  private acc = 0;
  private paused = false;
  private finished = false;
  private unsubscribes: (() => void)[] = [];

  private canvas!: HTMLCanvasElement;
  private elHome!: HTMLElement;
  private elAway!: HTMLElement;
  private elClock!: HTMLElement;
  private elQuarter!: HTMLElement;
  private elDown!: HTMLElement;
  private elSpot!: HTMLElement;
  private elPlayClock!: HTMLElement;
  private elTimeouts!: HTMLElement;
  private elBanner!: HTMLElement;
  private elTicker!: HTMLElement;
  private elTouch!: HTMLElement;
  private elStick!: HTMLElement;
  private elStickNub!: HTMLElement;
  private elHints!: HTMLElement;
  private overlay: HTMLElement | null = null;
  private pauseTab: PauseTab = 'menu';
  private touchMode: boolean;

  /** The play-call card, up whenever the coach owes an answer. */
  private callCard: HTMLElement | null = null;
  /** The defensive strip, up whenever the other lot have the ball. */
  private elDefence!: HTMLElement;
  private elPlanChip!: HTMLElement;
  private elKick!: HTMLElement;
  private elKickFill!: HTMLElement;
  private elKickBand!: HTMLElement;
  private elKickMark!: HTMLElement;
  private elKickLabel!: HTMLElement;
  private lastKickOn = false;
  private planCard: HTMLElement | null = null;
  /**
   * HOW FAST A SERIES HE IS NOT PLAYING RUNS.
   *
   * He is watching his own defence, not operating it, and watching it in real
   * time doubles the length of a game for a part he has no buttons in. At three
   * and a half it reads as football on fast-forward — fast enough that a ten
   * play drive is fifteen seconds rather than a minute, slow enough to see a
   * sack happen. There is a button next to it for people who would rather not
   * watch at all.
   */
  private watchSpeed = 3.5;
  private lastAuto = false;
  private lastScore = { home: -1, away: -1 };
  private lastClockText = '';

  /** A tap on the field, waiting to be turned into a throw. */
  private aim: FootballAim | null = null;
  /** Who the current aim resolves to, for the ring on the field. */
  private aimTarget: FieldPlayer | null = null;

  constructor(app: App, opts: FootballGameOptions) {
    this.app = app;
    this.opts = opts;
    this.game = new FootballGame(opts.config);
    this.touchMode = app.settings.controls === 'touch'
      || (app.settings.controls === 'auto' && matchMedia('(hover: none)').matches);
    this.el = this.build();

    this.renderer = new FootballRenderer(this.canvas);
    const home = opts.config.home.team;
    const away = opts.config.away.team;
    this.renderer.setTeams(home.primary, home.secondary, away.primary, away.secondary);
    this.renderer.resize();
    this.measureHud();
    this.renderer.orient(opts.config.humanSide, this.game.lineOfScrimmage);

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
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);

    /* The same debug handle the other two sports expose, so a browser suite can
     * look at a real game rather than guessing from pixels. */
    (window as unknown as { gridiron?: unknown }).gridiron = {
      game: this.game,
      renderer: this.renderer,
      input: this.input,
      neutral: neutralFootballInput,
    };
  }

  /* ------------------------------------------------------------------ build */

  private build(): HTMLElement {
    const cfg = this.opts.config;
    this.canvas = h('canvas', { class: 'game__canvas' });
    this.canvas.addEventListener('pointerdown', (e) => this.onFieldTap(e));

    this.elHome = h('div', { class: 'fb-score__pts num', text: '0' });
    this.elAway = h('div', { class: 'fb-score__pts num', text: '0' });
    this.elClock = h('div', { class: 'fb-clock num', text: '0:00' });
    this.elQuarter = h('div', { class: 'fb-quarter', text: 'Q1' });
    this.elDown = h('div', { class: 'fb-down', text: '1st & 10' });
    this.elSpot = h('div', { class: 'fb-spot', text: '' });
    this.elPlayClock = h('div', { class: 'fb-playclock num', text: '25' });
    this.elTimeouts = h('div', { class: 'fb-timeouts' });
    this.elBanner = h('div', { class: 'fb-banner' });
    this.elTicker = h('div', { class: 'fb-ticker' });

    const plate = (abbr: string, primary: string, secondary: string,
      score: HTMLElement, side: Side) =>
      h('div', { class: `fb-score fb-score--${side}` },
        h('div', {
          class: 'fb-score__badge',
          style: `background:${primary};border-color:${secondary}`,
          text: abbr,
        }),
        score);

    this.elStickNub = h('div', { class: 'stick__nub' });
    this.elStick = h('div', { class: 'stick' }, this.elStickNub);
    this.elTouch = h('div', { class: `touch${this.touchMode ? '' : ' is-off'}` },
      this.elStick,
      /* NO SWITCH AND NO TACKLE WHEN HE IS NOT ON DEFENCE. A button that does
       * nothing all game is a button that makes the ones that matter slower to
       * find, and it is also a lie about what the game is. */
      h('div', { class: 'tbtns' },
        this.opts.config.offenseOnly ? null : this.touchButton('switch', 'Switch'),
        this.touchButton('throwAway', 'Out'),
        this.opts.config.offenseOnly ? null : this.touchButton('tackle', 'Tackle'),
        this.touchButton('snap', 'Snap')),
      this.touchButton('timeout', 'T/O'),
    );

    /* THE DEFENSIVE STRIP. Up only while the other lot have the ball, and it
     * holds the two things a coach can actually do about that: say how he wants
     * it played, and decide whether to watch it. */
    this.elPlanChip = h('button', {
      class: 'fb-plan__chip',
      text: 'Balanced',
      on: { click: () => this.showPlanCard() },
    });
    this.elDefence = h('div', { class: 'fb-defence is-off' },
      h('span', { class: 'fb-defence__tag', text: 'THEIR BALL' }),
      this.elPlanChip,
      h('button', {
        class: 'fb-plan__chip fb-plan__chip--ghost',
        text: 'Sim drive',
        on: { click: () => this.skipDefensiveSeries() },
      }));

    /* THE KICK.
     *
     * A field goal is the most tense forty-five seconds in the sport and a dice
     * roll turns it into a loading screen. The band is the kicker's accuracy,
     * its centre is moved by the wind, and the whole strip is the button —
     * because on a phone the thing you are looking at should be the thing you
     * press. */
    this.elKickBand = h('div', { class: 'fb-kick__band' });
    this.elKickMark = h('div', { class: 'fb-kick__mark' });
    this.elKickFill = h('div', { class: 'fb-kick__track' }, this.elKickBand, this.elKickMark);
    this.elKickLabel = h('div', { class: 'fb-kick__label', text: '' });
    this.elKick = h('button', {
      class: 'fb-kick is-off',
      ariaLabel: 'Kick',
    }, this.elKickLabel, this.elKickFill,
    h('div', { class: 'fb-kick__hint tiny', text: 'Hit the band' }));
    this.input.registerButton('snap', this.elKick);

    this.elHints = h('div', { class: 'hint-strip' });
    const hints = this.app.settings.showHints && !this.touchMode ? this.elHints : null;

    return h('div', { class: `game${this.touchMode ? ' is-touch' : ''}` },
      this.canvas,
      h('div', { class: 'fb-hud' },
        plate(cfg.away.team.abbr, cfg.away.team.primary, cfg.away.team.secondary,
          this.elAway, 'away'),
        h('div', { class: 'fb-hud__mid' },
          this.elClock,
          h('div', { class: 'fb-hud__row' }, this.elQuarter, this.elPlayClock),
          this.elDown,
          this.elSpot,
          this.elTimeouts),
        plate(cfg.home.team.abbr, cfg.home.team.primary, cfg.home.team.secondary,
          this.elHome, 'home')),
      this.elBanner,
      this.elKick,
      this.opts.config.offenseOnly ? this.elDefence : null,
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
      type: K, fn: (e: never) => void,
    ): void => {
      this.unsubscribes.push(this.game.events.on(type, fn as never));
    };
    on('whistle', () => audio.play('whistle'));
    on('snap', () => audio.play('dribble'));
    on('throw', () => audio.play('pass'));
    on('catch', () => audio.play('catch'));
    on('tackle', () => { audio.play('rim'); this.renderer.jolt(0.6); });
    on('sack', () => { audio.play('rim', 1); this.renderer.jolt(1.3); });
    on('incomplete', () => audio.play('board'));
    on('interception', () => { audio.play('crowd', 0.8); this.renderer.jolt(1); });
    on('fumble', () => { audio.play('crowd', 0.6); this.renderer.jolt(1.2); });
    on('touchdown', () => { audio.play('crowd', 1); this.renderer.jolt(1.6); });
    on('fieldGoal', (e: { made: boolean }) => {
      if (e.made) { audio.play('goal'); this.renderer.jolt(0.8); } else audio.play('board');
    });
    on('punt', () => audio.play('shot', 0.8));
    on('kickoff', () => audio.play('shot', 1));
    on('safety', () => { audio.play('crowd', 0.7); this.renderer.jolt(1); });
    on('quarterEnd', () => audio.play('buzzer'));
  }

  /* ------------------------------------------------------------- the throw */

  /**
   * A TAP ON THE FIELD IS A THROW AT WHOEVER IS NEAREST IT.
   *
   * Not "at the exact pixel" — a thumb on a phone is a half-inch wide and a
   * receiver is eight pixels. The tap is turned into a direction from the
   * passer and the engine resolves the direction to a man, which is the same
   * path a keyboard's aim keys take. One mechanic, two ways of pointing at it.
   */
  private onFieldTap(e: PointerEvent): void {
    if (this.paused || this.finished || this.callCard) return;
    const me = this.game.humanSide;
    if (me === null) return;
    const carrier = this.game.byUid(this.game.ball.carrier);
    if (!carrier || carrier.side !== me) return;

    const rect = this.canvas.getBoundingClientRect();
    const bx = ((e.clientX - rect.left) / rect.width) * this.renderer.cam.bufW;
    const by = ((e.clientY - rect.top) / rect.height) * this.renderer.cam.bufH;
    const px = this.renderer.cam.projectX(carrier.x, carrier.y);
    const py = this.renderer.cam.projectY(carrier.x, carrier.y);

    // Screen delta back into world yards, through the camera's own mirror.
    const world = this.renderer.cam.inputToWorld(bx - px, by - py);
    const mag = Math.hypot(world.x, world.y);
    if (mag < 0.5) return;
    this.aim = { x: world.x / mag, y: world.y / mag, fire: true };
  }

  /* ------------------------------------------------------------- the frame */

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const delta = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    this.syncCallCard();

    /* THE ENGINE DOES NOT RUN WHILE THE COACH IS CHOOSING. A football play call
     * is not a timed decision in this game, and the clock does not move behind
     * the card — which is also why the play clock can be a real rule during the
     * part that follows it. */
    if (!this.paused && !this.finished && !this.callCard) {
      /* A SERIES HE IS NOT PLAYING RUNS FAST. Same engine, same rules, same
       * twenty-two men — the clock on the wall is simply wound on. */
      this.acc += delta * (this.game.autoPlaying ? this.watchSpeed : 1);
      let steps = 0;
      const budget = this.game.autoPlaying ? 14 : 5;
      while (this.acc >= FIXED_DT && steps < budget) {
        this.step(FIXED_DT);
        this.acc -= FIXED_DT;
        steps++;
      }
      if (steps === budget) this.acc = 0;
    }

    if (!this.finished && this.game.isFinal()) this.finish();

    this.input.sanityCheck();
    this.syncStick();
    this.resolveAimTarget();
    this.renderer.draw(this.game, delta, this.aimTarget);
    this.updateHud();
  };

  private step(dt: number): void {
    const raw = this.input.consume();
    const world = this.renderer.cam.inputToWorld(raw.moveX, raw.moveY);
    const state = footballInput(raw, this.aim);
    state.moveX = world.x;
    state.moveY = world.y;
    // A keyboard aim is in screen space too, and goes through the same mirror.
    if (!this.aim && (state.aimX !== 0 || state.aimY !== 0)) {
      const a = this.renderer.cam.inputToWorld(state.aimX, -state.aimY);
      state.aimX = a.x;
      state.aimY = a.y;
    }
    this.game.update(dt, state);
    // A tap is one frame of intent, not a held button.
    if (this.aim) this.aim = { ...this.aim, fire: false };
  }

  /** Who a throw would go to right now, so the ring on the field is honest. */
  private resolveAimTarget(): void {
    this.aimTarget = null;
    const me = this.game.humanSide;
    if (me === null || this.game.phase !== 'live' || this.game.thrown) return;
    const carrier = this.game.byUid(this.game.ball.carrier);
    if (!carrier || carrier.side !== me || carrier.slot !== 'QB') return;
    if (this.game.offensivePlay.family === 'run' || this.game.offensivePlay.handoff) return;

    const a = this.aim;
    if (a) {
      this.aimTarget = this.game.receiverToward(carrier, a.x, a.y);
      return;
    }
    this.aimTarget = this.game.bestOpenReceiver(carrier);
  }

  /* --------------------------------------------------------- the play call */

  /**
   * THE CARD GOES UP WHEN THE COACH OWES AN ANSWER, and comes down the instant
   * he gives one. It is driven off the engine's own phase rather than off a flag
   * this screen keeps, so there is exactly one opinion about whose turn it is.
   */
  private syncCallCard(): void {
    const g = this.game;
    /* HE IS ASKED ONLY WHEN IT IS HIS BALL. `autoPlaying` is the engine's own
     * word for "nobody is waiting on a button", so there is exactly one opinion
     * about whose turn it is rather than two that can disagree. */
    const mine = g.humanSide !== null && g.phase === 'playcall' && !g.autoPlaying;
    if (mine && !this.callCard) this.showCallCard();
    if (!mine && this.callCard) this.hideCallCard();
    this.syncDefenceStrip();
  }

  /** The strip that says the other lot have it, and what to do about that. */
  private syncDefenceStrip(): void {
    if (!this.opts.config.offenseOnly) return;
    const on = this.game.autoPlaying && !this.finished;
    if (on !== this.lastAuto) {
      this.lastAuto = on;
      this.elDefence.classList.toggle('is-off', !on);
      /* Snap and Out do nothing while he is watching, so they go; the timeout
       * stays, because a coach can call one on defence. */
      this.elTouch.classList.toggle('is-watching', on);
      if (!on) this.closePlanCard();
    }
  }

  private showPlanCard(): void {
    if (this.planCard) { this.closePlanCard(); return; }
    audio.play('click');
    const card = h('div', { class: 'fb-plan__card' },
      ...GAME_PLANS.map((p) => h('button', {
        class: `fb-plan__opt${this.game.gamePlan === p.key ? ' is-on' : ''}`,
        on: {
          click: () => {
            audio.play('click');
            this.game.gamePlan = p.key;
            this.opts.onPlanChange?.(p.key);
            this.elPlanChip.textContent = p.label;
            this.closePlanCard();
          },
        },
      },
      h('div', { class: 'fb-plan__name', text: p.label }),
      h('div', { class: 'fb-plan__blurb', text: p.blurb }))));
    this.planCard = card;
    this.el.appendChild(card);
  }

  private closePlanCard(): void {
    this.planCard?.remove();
    this.planCard = null;
  }

  /**
   * RUN THE REST OF THEIR POSSESSION AT ONCE.
   *
   * The same engine stepped as fast as the machine can, not a different model:
   * a coach who skips the series still gets the series his defence actually
   * played. It stops the moment the ball comes back, the quarter ends, or a
   * sanity budget runs out — which is what stops a bug here from hanging the
   * tab rather than merely being wrong.
   */
  private skipDefensiveSeries(): void {
    if (!this.game.autoPlaying || this.finished) return;
    audio.play('click');
    const idle = neutralFootballInput();
    for (let i = 0; i < 12_000; i++) {
      if (!this.game.autoPlaying || this.game.isFinal()) break;
      this.game.update(FIXED_DT, idle);
    }
    this.acc = 0;
    this.input.releaseAll();

  }

  private hideCallCard(): void {
    this.callCard?.remove();
    this.callCard = null;
    this.input.releaseAll();
  }

  private showCallCard(): void {
    const g = this.game;
    const me = g.humanSide as Side;
    const onOffence = g.possession === me;
    const card = onOffence ? this.offenceCard() : this.defenceCard();
    this.callCard = card;
    this.el.appendChild(card);
  }

  private offenceCard(): HTMLElement {
    const g = this.game;
    const me = g.possession;
    const togoal = yardsToGoal(g.lineOfScrimmage, me);
    const fg = fieldGoalDistance(g.lineOfScrimmage, me);

    const pick = (play: OffensivePlay): void => {
      audio.play('click');
      this.hideCallCard();
      g.callPlay(play, aiDefenseCall(g));
    };

    const families: PlayFamily[] = ['run', 'short', 'medium', 'deep', 'screen', 'playaction'];
    const groups = families.map((f) => {
      const plays = OFFENSIVE_PLAYS.filter((p) => p.family === f);
      return h('div', { class: 'callcard__group' },
        h('div', { class: 'callcard__family', text: FAMILY_LABEL[f] }),
        ...plays.map((p) => h('button', {
          class: 'callcard__play',
          on: { click: () => pick(p) },
        },
        h('div', { class: 'callcard__name', text: p.label }),
        h('div', { class: 'callcard__blurb', text: p.blurb }),
        h('div', { class: 'callcard__time', text: p.develops > 0 ? `${p.develops.toFixed(1)}s` : 'snap' }))),
      );
    });

    /* SPECIAL TEAMS IS ONLY OFFERED WHEN IT IS A REAL OPTION. A punt button on
     * first and ten is a button nobody will ever press, and every one of those
     * on a card makes the ones that matter slower to find. */
    const special: HTMLElement[] = [];
    if (g.down >= 4 || togoal <= 40) {
      const k = g.kickerFor(me);
      const odds = Math.round(g.fieldGoalChance(fg, k.leg, k.accuracy) * 100);
      special.push(h('button', {
        class: 'callcard__play callcard__play--special',
        on: { click: () => { audio.play('click'); this.hideCallCard(); g.callKick('fieldGoal'); } },
      },
      h('div', { class: 'callcard__name', text: `Field goal — ${Math.round(fg)} yards` }),
      h('div', { class: 'callcard__blurb', text: `Your kicker makes this about ${odds} times in a hundred.` })));
    }
    if (g.down >= 4) {
      special.push(h('button', {
        class: 'callcard__play callcard__play--special',
        on: { click: () => { audio.play('click'); this.hideCallCard(); g.callKick('punt'); } },
      },
      h('div', { class: 'callcard__name', text: 'Punt' }),
      h('div', { class: 'callcard__blurb', text: 'Give it back deep and play defence.' })));
    }
    if (g.tryKind === 'two') {
      // A two-point try: the run and short groups only, from the two yard line.
      return this.cardShell('GOING FOR TWO', 'From the two. One play.', groups.slice(0, 2));
    }

    /* On fourth down the kick is the question, so it goes first; on any other
     * down it is the exception (the end of a half) and waits at the bottom. */
    const kicks = special.length
      ? h('div', { class: 'callcard__group' },
        h('div', { class: 'callcard__family', text: g.down >= 4 ? 'Fourth down — kick it or go for it' : 'Special teams' }),
        ...special)
      : null;
    const body = !kicks ? groups : g.down >= 4 ? [kicks, ...groups] : [...groups, kicks];

    return this.cardShell(
      `${g.downText}`,
      `${this.game.spot} — ${togoal <= 20 ? 'red zone' : `${Math.round(togoal)} to the end zone`}`,
      body,
    );
  }

  private defenceCard(): HTMLElement {
    const g = this.game;
    const pick = (play: DefensivePlay): void => {
      audio.play('click');
      this.hideCallCard();
      g.callDefense(play);
    };
    const group = h('div', { class: 'callcard__group' },
      h('div', { class: 'callcard__family', text: 'The look' }),
      ...DEFENSIVE_PLAYS.map((p) => h('button', {
        class: 'callcard__play',
        on: { click: () => pick(p) },
      },
      h('div', { class: 'callcard__name', text: p.label }),
      h('div', { class: 'callcard__blurb', text: p.blurb }),
      h('div', { class: 'callcard__time', text: `${p.rushers} rush` }))),
    );
    return this.cardShell(
      `${g.downText} — their ball`,
      `${g.spot}. Pick a look; you steer one man once it is live.`,
      [group],
    );
  }

  private cardShell(title: string, sub: string, body: HTMLElement[]): HTMLElement {
    return h('div', { class: 'callcard' },
      h('div', { class: 'callcard__inner' },
        h('div', { class: 'callcard__head' },
          h('div', { class: 'callcard__title', text: title }),
          h('div', { class: 'callcard__sub', text: sub })),
        h('div', { class: 'callcard__body' }, ...body)));
  }

  /* -------------------------------------------------------------------- hud */

  private measureHud(): void {
    const hud = this.el.querySelector('.fb-hud');
    if (hud instanceof HTMLElement) this.renderer.setHudHeight(hud.getBoundingClientRect().height);
  }

  private updateHud(): void {
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

    const pc = g.phase === 'presnap' ? String(Math.max(0, Math.ceil(g.playClock))) : '—';
    if (this.elPlayClock.textContent !== pc) this.elPlayClock.textContent = pc;
    this.elPlayClock.classList.toggle('is-late', g.phase === 'presnap' && g.playClock < 6);

    const down = g.kickKind !== 'none' ? KICK_LABEL[g.kickKind] : g.downText;
    if (this.elDown.textContent !== down) {
      this.elDown.textContent = down;
      // "4th & Goal" and "Field goal" are wider than the column on a phone.
      this.elDown.classList.toggle('is-long', down.length > 8);
    }
    const spot = `${g.possession === g.humanSide ? 'Ball on' : 'Their ball,'} ${g.spot}`;
    if (this.elSpot.textContent !== spot) this.elSpot.textContent = spot;

    /* THREE PIPS A SIDE. A timeout a coach has forgotten he still holds is a
     * timeout he will not spend, and at the end of a close game that is the
     * whole difference. */
    const pips = (n: number): string => '●'.repeat(Math.max(0, n)) + '○'.repeat(Math.max(0, 3 - n));
    const to = `${pips(g.timeouts.away)}  ${pips(g.timeouts.home)}`;
    if (this.elTimeouts.textContent !== to) this.elTimeouts.textContent = to;

    if (this.elBanner.textContent !== g.banner) {
      this.elBanner.textContent = g.banner;
      this.elBanner.classList.toggle('is-on', g.banner.length > 0);
    }
    if (this.elTicker.textContent !== g.message) this.elTicker.textContent = g.message;
    this.syncKick();
  }

  /** The kick meter, driven straight off the engine's own readout. */
  private syncKick(): void {
    const m = this.game.kickReadout;
    const on = !!m;
    if (on !== this.lastKickOn) {
      this.lastKickOn = on;
      this.elKick.classList.toggle('is-off', !on);
      // The strip is the button; the snap cluster under it would only compete.
      this.elTouch.classList.toggle('is-kicking', on);
    }
    if (!m) return;
    const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
    this.elKickBand.style.left = pct(Math.max(0, m.sweet - m.width));
    this.elKickBand.style.width = pct(Math.min(1, m.width * 2));
    this.elKickMark.style.left = pct(m.t);
    this.elKick.classList.toggle('is-struck', m.taken);
    const wind = this.game.wind;
    const windText = Math.abs(wind) < 0.12
      ? 'no wind'
      : `${Math.abs(wind) > 0.6 ? 'strong' : 'light'} wind ${wind < 0 ? 'left' : 'right'}`;
    const label = m.taken
      ? (m.quality > 0.6 ? 'Struck it' : m.quality > 0 ? 'Caught it' : 'Pushed it')
      : `${Math.round(m.distance)} yards · ${windText}`;
    if (this.elKickLabel.textContent !== label) this.elKickLabel.textContent = label;
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
    const pair = (k: string, what: string): HTMLElement =>
      h('span', { class: 'key' }, h('b', { text: k }), ` ${what}`);
    this.elHints.append(
      pair('WASD', 'Move'),
      pair('Arrows', 'Aim'),
      pair(key('throw'), 'Throw'),
      pair(key('throwAway'), 'Throw it away'),
      pair(key('snap'), 'Snap'),
      ...(this.opts.config.offenseOnly ? [] : [
        pair(key('tackle'), 'Tackle'),
        pair(key('switch'), 'Switch'),
      ]),
    );
  }

  private syncStick(): void {
    const s = this.input.stick;
    if (!s.active) {
      this.elStick.classList.remove('is-on');
      return;
    }
    this.elStick.classList.add('is-on');
    this.elStick.style.left = `${s.originX}px`;
    this.elStick.style.top = `${s.originY}px`;
    this.elStickNub.style.transform = `translate(${s.dx}px, ${s.dy}px)`;
  }

  /* ------------------------------------------------------------ pause menu */

  private togglePause(): void {
    if (this.finished) return;
    this.paused = !this.paused;
    this.input.suspended = this.paused;
    this.input.releaseAll();
    if (this.paused) this.showPause();
    else this.closeOverlay();
  }

  private showPause(): void {
    this.closeOverlay();
    const tabs = h('div', { class: 'seg seg--sticky' },
      ...(['menu', 'controls', 'box'] as PauseTab[]).map((t) => h('button', {
        /* `.seg__opt`, which is the class the stylesheet actually styles. The
         * first version said `seg__btn`, which nothing in the CSS has ever
         * matched — so football's pause menu had three naked browser buttons at
         * the top of it, on every platform, for as long as it has existed. */
        class: `seg__opt${this.pauseTab === t ? ' is-on' : ''}`,
        text: t === 'menu' ? 'Paused' : t === 'controls' ? 'Controls' : 'Box score',
        on: { click: () => { this.pauseTab = t; this.showPause(); } },
      })));

    const body = this.pauseTab === 'controls'
      ? keybindEditor(this.app, () => this.renderHints())
      : this.pauseTab === 'box'
        ? footballBoxScore(this.game)
        : h('div', { class: 'stack' },
          h('button', { class: 'btn btn--primary', text: 'Resume', on: { click: () => this.togglePause() } }),
          h('button', {
            class: 'btn',
            text: 'Quit to menu',
            on: { click: () => { this.paused = false; this.opts.onQuit(); } },
          }));

    /* THE TAB STRIP STAYS PUT.
     *
     * A football box score is five tables a side, so the panel scrolls — and a
     * tab strip that scrolls away with it is a pause menu a player cannot get
     * out of once he has looked at the box score. Caught by the suite, which
     * could not find the button it had just used. */
    this.overlay = h('div', { class: 'overlay' },
      h('div', { class: 'overlay__card panel' }, tabs, body));
    this.el.appendChild(this.overlay);
  }

  private closeOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  /* ------------------------------------------------------------------- end */

  private finish(): void {
    this.finished = true;
    this.hideCallCard();
    this.input.suspended = true;
    this.opts.onComplete(this.game);
  }

  onCovered(): void {
    this.input.suspended = true;
    this.input.releaseAll();
  }

  onUncovered(): void {
    this.input.suspended = this.paused;
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.input.detach();
    this.app.onKeybindsChanged = null;
    for (const off of this.unsubscribes) off();
    this.unsubscribes = [];
    delete (window as unknown as { gridiron?: unknown }).gridiron;
    void dist2;
    void attackDir;
    void FOOTBALL;
  }
}
