import { clamp, damp } from '../../core/math';
import { Emitter } from '../../core/events';
import { Rng } from '../../core/rng';
import {
  FIELD, attackDir, attackGoal, clampToField, dist2, fieldGoalDistance, hashSpot,
  inAttackingEndZone, inOwnEndZone, otherSide, outOfBounds, spotText, yardsToGoal,
  type Side,
} from './field';
import {
  DEFENSIVE_SLOTS, DEF_SLOT_DEPTH, DEF_SLOT_POSITION, OFFENSIVE_SLOTS,
  SLOT_DEPTH, SLOT_POSITION, defenseByKey, playByKey,
  type DefensivePlay, type DefensiveSlot, type OffensivePlay, type OffensiveSlot,
} from './playbook';
import { depthAt, starterAt, type Player } from './data';
import { FOOTBALL } from './tuning';
import { neutralFootballInput, type FootballInput } from './input';
import {
  runRoute, steerDefender, aiPlayCall, aiDefenseCall, aiQuarterback, aiSpecialTeams,
  aiSnapDelay, projectReceiver,
} from './ai';
import {
  emptyStatLine, emptyTeamBox,
  type FieldPlayer, type FootballBall, type FootballConfig, type FootballEvents,
  type GamePhase, type GamePlan, type PlayResult, type StatLine, type TeamBox,
} from './types';

/* ---------------------------------------------------------------------------
 * THE FOOTBALL ENGINE
 * ---------------------------------------------------------------------------
 * A DOWN AT A TIME, which is what makes football a different problem from the
 * other two sports in this hub. Lacrosse and basketball are continuous: the
 * clock runs, the ball moves, and a possession ends when somebody shoots.
 * Football is a sequence of six-second plays separated by decisions, and the
 * decisions are most of the game.
 *
 * So the engine is a state machine over PLAYS rather than a simulation that
 * happens to have rules:
 *
 *   PLAYCALL   the coach picks. Nothing moves. This is where the game is won.
 *      v
 *   PRESNAP    eleven men line up, the play clock runs, the defence shows a look
 *      v
 *   LIVE       the only part that is a simulation. Six seconds, usually less.
 *      v
 *   DEAD       the whistle, the result, the spot, and the next down
 *      v
 *   PLAYCALL again, or a score, or a change of possession
 *
 * WHAT THE PERSON CONTROLS is deliberately small, and it is the Retro Bowl
 * insight rather than a simplification: on offence he is the quarterback, and
 * then whoever has the ball. On defence he is one man, usually the one nearest
 * the play. He never steers eleven people, because nobody enjoys steering eleven
 * people, and the interesting decisions are not there anyway.
 *
 * WHAT THE ENGINE OWNS is everything else: routes that are really run, blocks
 * that are really held, coverage that really has leverage, and a tackle that
 * comes out of two men's positions, speeds and ratings rather than out of a
 * dice roll.
 * ------------------------------------------------------------------------- */

const SLOT_COUNT = OFFENSIVE_SLOTS.length;

export class FootballGame {
  readonly cfg: FootballConfig;
  readonly events = new Emitter<FootballEvents>();
  private rng: Rng;

  /* --- the situation ----------------------------------------------------- */
  phase: GamePhase = 'playcall';
  phaseTimer = 0;
  quarter = 1;
  overtime = 0;
  clock: number;
  playClock = FOOTBALL.playClock;
  score: Record<Side, number> = { home: 0, away: 0 };
  timeouts: Record<Side, number> = { home: 3, away: 3 };

  /** Who has the ball. */
  possession: Side = 'home';
  /** Where the ball is spotted, in field y. */
  lineOfScrimmage = FIELD.homeGoal + 25;
  /** Where the ball sits across the field, at a hash or in the middle. */
  ballX: number = FIELD.centerX;
  down = 1;
  /** Yards needed for a first down. */
  toGo = 10;
  /** The y a first down would reach. */
  firstDownLine = 0;

  humanSide: Side | null;
  /**
   * THE PERSON PLAYS OFFENCE AND COACHES DEFENCE. See `FootballConfig`.
   * With this set nobody ever hands him a safety to steer.
   */
  readonly offenseOnly: boolean;
  /** How he wants his defence played while he is not playing it. */
  gamePlan: GamePlan;

  /* --- what is being run ------------------------------------------------- */
  offensivePlay: OffensivePlay;
  defensivePlay: DefensivePlay;
  /** Seconds since the snap. */
  playTime = 0;
  /** Seconds since the offence lined up, which is what a huddle costs. */
  presnapTime = 0;
  /** True once the ball has left the quarterback's hands on a pass. */
  thrown = false;
  /** True on a play that is a kick rather than a snap to the quarterback. */
  kickKind: 'none' | 'fieldGoal' | 'punt' | 'kickoff' | 'extraPoint' = 'none';
  /** Set on an extra-point or two-point try. */
  tryKind: 'none' | 'kick' | 'two' = 'none';

  players: FieldPlayer[] = [];
  ball: FootballBall = {
    x: FIELD.centerX, y: FIELD.homeGoal + 25, z: 1,
    vx: 0, vy: 0, vz: 0,
    state: 'dead', carrier: null, from: null, target: null,
    aimX: FIELD.centerX, aimY: FIELD.homeGoal + 25, age: 0,
  };

  /**
   * THE CLOCK BETWEEN PLAYS, which is most of the clock.
   *
   * Football's clock does not stop when the whistle goes — it runs through the
   * huddle and keeps running until the next snap, and it is STOPPED only by an
   * incompletion, a man going out of bounds, a score, a turnover, a timeout or
   * the end of a period. That rule is the entire reason a two-minute drill
   * exists, and without it a fourteen-minute game runs three hundred plays and
   * nothing late in it means anything.
   *
   * The one place it does not run is the play-call menu, because a menu is not
   * part of the game. A coach who wants to burn clock does it where the sport
   * does it: standing over the ball, letting the play clock go.
   */
  clockRunning = false;

  /** Who the person is steering right now. */
  controlled: Record<Side, FieldPlayer | null> = { home: null, away: null };

  /* --- the record -------------------------------------------------------- */
  box: Record<Side, TeamBox> = { home: emptyTeamBox(), away: emptyTeamBox() };
  stats = new Map<string, StatLine>();
  lastResult: PlayResult | null = null;
  /** The banner and the ticker. */
  banner = '';
  bannerTimer = 0;
  message = '';
  messageTimer = 0;
  /** Plays run, so a tendency can be read. */
  history: { side: Side; family: string; yards: number }[] = [];
  /** Where a completed pass was caught, so the run after it can be credited. */
  private completion: { receiver: string; passer: string | null; air: number } | null = null;
  /** Who snapped it, which is not always who is holding it at the whistle. */
  private snapSide: Side = 'home';

  /** Who takes the field, resolved once per game rather than per play. */
  private rosters: Record<Side, Player[]>;

  constructor(cfg: FootballConfig) {
    this.cfg = cfg;
    this.humanSide = cfg.humanSide;
    this.offenseOnly = cfg.offenseOnly === true && cfg.humanSide !== null;
    this.gamePlan = cfg.gamePlan ?? 'balanced';
    this.rng = new Rng(`football:${cfg.seed}`);
    this.clock = cfg.quarterSeconds;
    this.rosters = { home: cfg.home.roster, away: cfg.away.roster };
    this.offensivePlay = playByKey('inside-run');
    this.defensivePlay = defenseByKey('cover-3');
    this.firstDownLine = this.lineOfScrimmage + 10;
    this.openingKickoff();
  }

  /* ==================================================================== time */

  update(dt: number, input: FootballInput = neutralFootballInput()): void {
    if (this.phase === 'final') return;
    this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    if (this.bannerTimer === 0) this.banner = '';
    this.messageTimer = Math.max(0, this.messageTimer - dt);
    if (this.messageTimer === 0) this.message = '';

    /* A TIMEOUT IS NOT A PLAY, so it is read here rather than inside one of the
     * phases: it is called between downs, which is when none of them is
     * steering anybody. */
    if (input.timeoutPressed && this.humanSide) this.callTimeout(this.humanSide);

    switch (this.phase) {
      case 'playcall': this.updatePlaycall(dt, input); break;
      case 'presnap': this.updatePresnap(dt, input); break;
      case 'live': this.updateLive(dt, input); break;
      case 'dead': this.updateDead(dt); break;
      case 'special': this.updateDead(dt); break;
      case 'quarterBreak': this.updateBreak(dt); break;
      default: break;
    }
  }

  /**
   * WAITING FOR A CALL. The clock does not run, because in football it does not:
   * between plays the world stops and a coach thinks. A game nobody is playing
   * calls for itself immediately.
   */
  private updatePlaycall(dt: number, input: FootballInput): void {
    void dt;
    void input;
    /* A GAME WITH A COACH IN IT WAITS FOR HIM — but only while he has the ball.
     *
     * When the other lot have it and he is coaching rather than playing, there
     * is nothing for him to press: his eleven play it out on their own ratings,
     * his coordinator's work and the game plan he set. That is the whole point
     * of the setting, and a card asking him to pick a coverage on every snap of
     * a drive he is not in would put the eleven defenders straight back. */
    if (this.humanSide !== null && !this.autoPlaying) return;
    const kick = aiSpecialTeams(this);
    if (kick) { this.callKick(kick); return; }
    this.callPlay(aiPlayCall(this), aiDefenseCall(this));
  }

  /**
   * THE COACH IS ON DEFENCE. He picks the look; the computer picks the play it
   * is run against, and picks it without ever seeing what he chose — the call
   * below happens first, from the state of the game rather than from `defense`.
   */
  callDefense(defense: DefensivePlay): void {
    if (this.phase !== 'playcall') return;
    const kick = aiSpecialTeams(this);
    if (kick) { this.callKick(kick); return; }
    this.callPlay(aiPlayCall(this), defense);
  }

  /** What the computer would do with the ball on fourth down, for the hub UI. */
  suggestedKick(): 'fieldGoal' | 'punt' | null {
    return aiSpecialTeams(this);
  }

  /** The coach has chosen. Line them up. */
  callPlay(offense: OffensivePlay, defense: DefensivePlay): void {
    if (this.phase !== 'playcall') return;
    this.offensivePlay = offense;
    this.defensivePlay = defense;
    this.kickKind = 'none';
    this.setFormation();
    this.phase = 'presnap';
    this.playClock = FOOTBALL.playClock;
    this.presnapTime = 0;
    this.playTime = 0;
    this.thrown = false;
  }

  /** A kick instead of a play: field goal, punt, or a kickoff. */
  callKick(kind: 'fieldGoal' | 'punt' | 'kickoff' | 'extraPoint'): void {
    if (this.phase !== 'playcall') return;
    this.kickKind = kind;
    this.setKickFormation();
    this.phase = 'presnap';
    this.playClock = FOOTBALL.playClock;
    this.presnapTime = 0;
    this.playTime = 0;
  }

  /**
   * LINED UP, AND THE PLAY CLOCK RUNNING.
   *
   * The snap is the person's, on offence, because the moment he chooses to start
   * is the last free decision before everything is happening at once. The
   * computer snaps as soon as it is set. A play clock that expires is a delay of
   * game, and it costs five yards, because a clock with no consequence is a
   * decoration.
   */
  private updatePresnap(dt: number, input: FootballInput): void {
    /* THE CLOCK RUNS COMPRESSED WHILE THE BALL IS DEAD — see `deadClockRate`.
     * The play clock runs at the same rate so the two never disagree on screen. */
    const step = dt * FOOTBALL.deadClockRate;
    this.playClock -= step;
    this.presnapTime += step;
    if (this.tickClock(step)) return;

    for (const p of this.players) this.walkToSpot(p, dt);

    if (this.playClock <= 0) {
      this.delayOfGame();
      return;
    }
    /* NOBODY SNAPS A BALL NOBODY IS LINED UP FOR. The men are still walking on
     * for the first moments of the play clock, and a snap taken through that is
     * a snap taken against a defence that is not there. The play clock running
     * low overrides it, because a delay of game is worse. */
    const set = this.allSet() || this.playClock < 7;

    const mine = this.humanSide !== null && this.possession === this.humanSide;
    if (mine) {
      if (input.snapPressed && set) this.snap();
      return;
    }
    /* THE COMPUTER TAKES ITS TIME, and how long is clock management: hurrying
     * when it is behind, standing over the ball when it is ahead. Snapping
     * instantly on every down would hand a trailing AI a free extra quarter. */
    if (set && this.presnapTime >= aiSnapDelay(this)) this.snap();
  }

  /**
   * Run the game clock outside a live play, and end the period if it goes.
   * Returns true when the caller should stop what it was doing.
   */
  private tickClock(dt: number): boolean {
    if (!this.clockRunning) return false;
    this.clock = Math.max(0, this.clock - dt);
    if (this.clock > 0) return false;
    this.clockRunning = false;
    this.endQuarter();
    return true;
  }

  private snap(): void {
    this.phase = 'live';
    this.clockRunning = true;
    this.completion = null;
    this.snapSide = this.possession;
    this.playTime = 0;
    this.thrown = false;
    this.ball.state = 'held';
    this.ball.age = 0;

    if (this.kickKind !== 'none') {
      this.beginKick();
      return;
    }
    const qb = this.playerInSlot(this.possession, 'QB');
    if (qb) {
      this.giveBall(qb);
      this.controlled[this.possession] = qb;
    }
    // The defence gets its man nearest the ball.
    const def = otherSide(this.possession);
    this.controlled[def] = this.nearestTo(def, this.ballX, this.lineOfScrimmage);
    for (const p of this.players) {
      p.react = this.reactionFor(p);
      this.statFor(p).snaps++;
    }
    this.events.emit('snap', {
      play: this.offensivePlay,
      defense: this.defensivePlay.coverage,
    });

    /* A HANDOFF IS NOT A THROW. It happens immediately, which is what makes a run
     * a run: there is no drop, no read and no sack, only a back with the ball and
     * eleven men in front of him. */
    if (this.offensivePlay.handoff) {
      const rb = this.playerInSlot(this.possession, 'RB');
      if (rb) {
        this.giveBall(rb);
        this.controlled[this.possession] = rb;
        /* A RUNNING START. A back takes a handoff already moving — standing him
         * still and asking him to accelerate from nothing five yards behind the
         * line hands the linebackers a yard and a half they have not earned. */
        const dir = attackDir(rb.side);
        rb.vy = dir * 4.4;
        rb.vx = (rb.route ? rb.route.breakDir * dir : 0) * 2.2;
      }
    }
  }

  /* ================================================================== live */

  private updateLive(dt: number, input: FootballInput): void {
    this.playTime += dt;
    /* A TRY IS AN UNTIMED DOWN. The clock has already stopped for the touchdown,
     * and running it through a two-point play would quietly eat six seconds of
     * every scoring drive. */
    if (this.tryKind === 'none') this.clock = Math.max(0, this.clock - dt);
    this.box[this.possession].timeOfPossession += dt;

    const human = this.humanSide;
    for (const p of this.players) {
      p.react = Math.max(0, p.react - dt);
      p.stunned = Math.max(0, p.stunned - dt);
      /* THE ONE DEFENSIVE MOMENT HE KEEPS. Coaching the defence does not mean
       * watching somebody else run back the interception his corner has just
       * made — a loose ball in his own hands is his. */
      const isHuman = human !== null && this.controlled[human] === p
        && (!this.offenseOnly || this.possession === human || this.ball.carrier === p.uid);
      if (isHuman) this.steerHuman(p, input, dt);
      else this.steerAi(p, dt);
    }
    for (const p of this.players) this.integrate(p, dt);
    this.resolveBlocks(dt);
    this.updateBall(dt);
    this.checkTackles();
    this.checkCatch(dt);

    if (this.clock <= 0) {
      /* THE CLOCK RUNNING OUT DOES NOT STOP THE PLAY. In football a play that is
       * live when the clock expires is played to its end, and only then does the
       * period finish. The same principle as the basketball buzzer, and for the
       * same reason: the whistle is what ends a play, not the clock. */
      this.clock = 0;
    }
    // A play that somehow never ends is ended, so a game can never hang.
    if (this.playTime > 14) this.endPlay(this.tackleResult(null, 'tackle'));
  }

  /* -------------------------------------------------------- what a person does */

  private steerHuman(p: FieldPlayer, input: FootballInput, dt: number): void {
    const carrying = this.ball.carrier === p.uid;
    const defending = p.side !== this.possession;

    // Movement is the same for everybody: a stick, and a sprint.
    this.drive(p, input.moveX, input.moveY, input.sprint, dt);

    if (defending) {
      if (input.switchPressed) this.switchDefender();
      if (input.tacklePressed) this.attemptTackle(p);
      return;
    }
    if (!carrying) return;

    /* PAST THE LINE HE CANNOT THROW IT, which is the rule and also the reason
     * scrambling is a decision: once he crosses, the ball is in his hands for
     * good. */
    const behindLine = (p.y - this.lineOfScrimmage) * attackDir(p.side) <= 0.4;
    const isQb = p.slot === 'QB' && this.offensivePlay.family !== 'run'
      && !this.offensivePlay.handoff && !this.thrown && behindLine;
    if (isQb) {
      /* THE THROW. Aim comes from the stick, and which receiver it goes to is
       * decided by who the aim points AT rather than by cycling through a list —
       * a player looking downfield should be able to throw where he is looking. */
      if (input.throwPressed) {
        const target = this.receiverToward(p, input.aimX, input.aimY);
        if (target) this.throwTo(p, target, input.aimX, input.aimY);
        else this.throwAway(p);
      } else if (input.throwAwayPressed) {
        this.throwAway(p);
      }
      return;
    }
    // Everybody else with the ball can only run, and try to stay up.
    if (input.tacklePressed) p.pose = 'run';
  }

  /**
   * Move toward a stick direction, with weight.
   *
   * `pace` is a FRACTION OF HIS OWN TOP SPEED, for the two cases where a man is
   * deliberately not running flat out: a receiver fighting off a jam, and a
   * defender who has not yet worked out what he is looking at. It is never used
   * to make one side faster than the other.
   */
  drive(
    p: FieldPlayer, mx: number, my: number, sprint: boolean, dt: number, pace = 1,
  ): void {
    if (p.stunned > 0) {
      p.vx = damp(p.vx, 0, 7, dt);
      p.vy = damp(p.vy, 0, 7, dt);
      return;
    }
    const mag = Math.hypot(mx, my);
    const a = p.data.attrs;
    const tired = 0.86 + clamp(p.stamina / 100, 0, 1) * 0.14;
    const top = (FOOTBALL.baseSpeed + a.speed * FOOTBALL.speedPerRating)
      * (sprint ? FOOTBALL.sprintMultiplier : 1)
      * (p.hasBall ? FOOTBALL.carryPenalty : 1)
      * tired
      * clamp(pace, 0.15, 1);
    const accel = FOOTBALL.accelBase + a.acceleration * FOOTBALL.accelPerRating;

    if (mag < 0.12) {
      p.vx = damp(p.vx, 0, accel * FOOTBALL.brakeMultiplier, dt);
      p.vy = damp(p.vy, 0, accel * FOOTBALL.brakeMultiplier, dt);
      return;
    }
    const nx = mx / mag;
    const ny = my / mag;

    /* A HARD CUT COSTS SPEED, and how much you keep is your agility. Without this
     * a slow power back changes direction exactly as well as a scat back, and the
     * difference between the two archetypes disappears. */
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > 1.2) {
      const align = (p.vx * nx + p.vy * ny) / speed;
      if (align < 0.55) {
        const keep = clamp(0.5 + a.agility / 190, 0.5, 0.95);
        const scrub = 1 - (1 - keep) * FOOTBALL.turnScrub * (0.55 - align);
        p.vx *= scrub;
        p.vy *= scrub;
      }
    }

    p.vx = damp(p.vx, nx * top, accel, dt);
    p.vy = damp(p.vy, ny * top, accel, dt);
    if (sprint && mag > 0.2) p.stamina = clamp(p.stamina - FOOTBALL.sprintDrain * dt, 0, 100);
    else p.stamina = clamp(p.stamina + FOOTBALL.staminaRegen * dt * 0.2, 0, 100);
    p.pose = sprint && speed > 4 ? 'sprint' : 'run';
  }

  /**
   * WALKING TO A SPOT, and stopping dead on it.
   *
   * Used by the dead ball and by the play clock alike. Quick — this is a jog
   * back to the line, not a play — and it brakes hard at the end, because a man
   * who jitters on his mark for the whole play clock reads worse than one who
   * teleported onto it.
   */
  private walkToSpot(p: FieldPlayer, dt: number): void {
    const gap = dist2(p.x, p.y, p.setX, p.setY);
    if (gap > 0.4) {
      this.drive(p, p.setX - p.x, p.setY - p.y, gap > 6, dt, clamp(gap / 3, 0.45, 1));
      p.pose = gap > 6 ? 'run' : 'idle';
    } else {
      p.vx = damp(p.vx, 0, 14, dt);
      p.vy = damp(p.vy, 0, 14, dt);
      p.pose = 'stance';
    }
    this.integrate(p, dt);
  }

  /** True once everybody is standing where the call put him. */
  private allSet(): boolean {
    for (const p of this.players) {
      if (dist2(p.x, p.y, p.setX, p.setY) > 1.2) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------ what the AI does */

  private steerAi(p: FieldPlayer, dt: number): void {
    if (p.stunned > 0) {
      p.vx = damp(p.vx, 0, 7, dt);
      p.vy = damp(p.vy, 0, 7, dt);
      return;
    }
    if (p.side === this.possession) {
      if (this.ball.carrier === p.uid) {
        if (p.slot === 'QB' && this.offensivePlay.family !== 'run'
          && !this.offensivePlay.handoff && !this.thrown) {
          aiQuarterback(this, p, dt);
        } else {
          this.carrierAi(p, dt);
        }
        return;
      }
      runRoute(this, p, dt);
      return;
    }
    steerDefender(this, p, dt);
  }

  /**
   * A BALL CARRIER THE COMPUTER IS RUNNING.
   *
   * He looks for grass: the direction that gets him furthest upfield with the
   * fewest bodies in the way, weighted so that a small gain straight ahead beats
   * a big one through three men. A back who runs at the nearest defender is a
   * back who gains two yards for ever.
   */
  carrierAi(p: FieldPlayer, dt: number): void {
    const dir = attackDir(p.side);

    /* HE RUNS THE PLAY FIRST AND READS SECOND.
     *
     * A back who starts hunting for grass on the snap never reaches the hole his
     * line is making, because at that moment there is no hole anywhere — there
     * are twenty-two men inside eight yards and every heading looks equally bad.
     * So for the first half second he takes the aiming point the call gave him,
     * and only then does he start looking. That is what a running back actually
     * does, and it is the difference between three yards and a loss. */
    if (this.offensivePlay.handoff && this.playTime < 0.55 && p.route) {
      const aim = clampToField(this.ballX + p.route.breakDir * dir * 3.4);
      this.drive(p, aim - p.x, dir * 2.6, true, dt);
      return;
    }

    let best = { score: -Infinity, x: 0, y: 0 };
    for (let i = 0; i < 9; i++) {
      const a = (-0.85 + (i / 8) * 1.7);
      const vx = Math.sin(a);
      const vy = Math.cos(a) * dir;
      // Look three yards ahead along this heading and count who is really there.
      const lx = clampToField(p.x + vx * 3.2);
      const ly = p.y + vy * 3.2;
      let danger = 0;
      for (const d of this.players) {
        if (d.side === p.side || d.stunned > 0) continue;
        const gap = dist2(lx, ly, d.x, d.y);
        if (gap >= 3.6) continue;
        /* A BLOCKED MAN IS NOT IN THE WAY. Counting engaged defenders as traffic
         * means the back looks at his own line locked up with theirs, sees a wall
         * of eleven bodies, and runs into the first one. The hole a running play
         * makes IS the space between two men who are busy with each other. */
        const busy = d.engagedWith ? 0.45 : 1;
        danger += ((3.6 - gap) / 3.6) * busy;
      }
      const gain = (ly - p.y) * dir;
      const score = gain - danger * 2.6 - Math.abs(vx) * 0.5;
      if (score > best.score) best = { score, x: vx, y: vy };
    }
    this.drive(p, best.x, best.y, true, dt);
  }

  /* ------------------------------------------------------------- the trenches */

  /**
   * BLOCKS, HELD OR LOST.
   *
   * A blocker and a rusher who meet are ENGAGED: neither of them moves much and
   * a timer runs. How long it runs is the blocker's blocking against the
   * rusher's pass rush, so a good line really does buy a quarterback the extra
   * second a deep route needs. When the timer runs out the rusher is free and
   * the blocker is beaten, and from then on it is a footrace to the passer.
   */
  private resolveBlocks(dt: number): void {
    const offense = this.possession;
    const blockers = this.players.filter(
      (p) => p.side === offense && p.route?.kind === 'block' && p.slot !== 'QB',
    );
    /* WHO THERE IS TO BLOCK.
     *
     * On a PASS it is the rush and only the rush: a guard does not run downfield
     * to block a cornerback, and letting him try is how an offensive line ends
     * up twenty yards from the quarterback it is supposed to be protecting.
     *
     * On a RUN it is anybody in the way — and that distinction is the whole run
     * game. The first version of this only ever offered up the four designated
     * rushers, which meant a linebacker could not be blocked by anybody, ever;
     * three free men arrived on every carry, no run in the game reached the
     * second level, and the longest gain in twenty-four games was five yards. */
    const run = this.offensivePlay.handoff;
    const rushers = this.players.filter(
      (p) => p.side !== offense
        && (run ? Math.abs(p.y - this.lineOfScrimmage) < 12 : (p.zone === null && p.assignment === null)),
    );

    for (const b of blockers) {
      if (b.engagedWith) {
        const on = this.byUid(b.engagedWith);
        if (!on || on.stunned > 0 || dist2(b.x, b.y, on.x, on.y) > 3.2) {
          b.engagedWith = null;
          if (on) on.engagedWith = null;
          continue;
        }
        b.blockTimer -= dt;
        /* LOCKED TOGETHER, AND THE PILE MOVES.
         *
         * Which way it moves is the difference between the two kinds of block a
         * lineman is asked for. In PASS PROTECTION he is giving ground on
         * purpose and a man he cannot handle drives him back into the passer. On
         * a RUN he is going forward, and that yard and a half of push is where a
         * running game comes from — without it the two lines stand still, the
         * back has nowhere to go, and half the carries in the game lose yardage.
         */
        const dir = attackDir(offense);
        const edge = (b.data.attrs.blocking
          - (on.data.attrs.power * 0.55 + on.data.attrs.tackling * 0.45)) / 150;
        const forward = this.offensivePlay.handoff
          ? clamp(0.55 + edge * 2, -0.3, 1.6)
          : clamp(edge, -0.85, 0.15) * 1.7;
        b.vy = damp(b.vy, dir * forward, 8, dt);
        b.vx = damp(b.vx, 0, 8, dt);
        on.vy = damp(on.vy, dir * forward, 8, dt);
        on.vx = damp(on.vx, 0, 8, dt);
        b.pose = 'block';
        on.pose = 'block';
        if (b.blockTimer <= 0) {
          // Beaten. The rusher comes free and the blocker is a half-second late.
          on.engagedWith = null;
          b.engagedWith = null;
          b.stunned = 0.45;
        }
        continue;
      }
      if (b.stunned > 0) continue;
      /* A BLOCKER PICKS UP A MAN IN FRONT OF HIM, and a rusher who has already
       * gone past him is not in front of him.
       *
       * Without this the beaten blocker simply grabs the same rusher again on
       * the very next frame with a fresh timer, and no pass rush in the game
       * ever reaches the quarterback — which is precisely what the first version
       * did: nought sacks in twenty-four games. Protecting somebody means
       * standing BETWEEN him and the rush, so a rusher who is closer to the
       * passer than the blocker is has already won and cannot be re-engaged. */
      const anchor = this.byUid(this.ball.carrier) ?? this.playerInSlot(offense, 'QB');
      const ax = anchor ? anchor.x : this.ballX;
      const ay = anchor ? anchor.y : this.lineOfScrimmage;
      const mine = dist2(b.x, b.y, ax, ay);

      let target: FieldPlayer | null = null;
      let near = 4.2;
      for (const r of rushers) {
        if (r.engagedWith || r.stunned > 0) continue;
        if (dist2(r.x, r.y, ax, ay) < mine - 0.4) continue;
        const d = dist2(b.x, b.y, r.x, r.y);
        if (d < near) { near = d; target = r; }
      }
      if (target) {
        b.engagedWith = target.uid;
        target.engagedWith = b.uid;
        const shed = run ? target.data.attrs.power * 0.5 + target.data.attrs.tackling * 0.5
          : target.data.attrs.passRush;
        const hold = FOOTBALL.blockHoldBase
          + (b.data.attrs.blocking - shed) * FOOTBALL.blockHoldPerRating;

        /* NO TWO BLOCKS ARE THE SAME, and without saying so every run in the
         * game gains between three and seven yards. Football's yardage is a
         * fat-tailed distribution: about one carry in ten loses ground because
         * somebody got blown off the ball, and about one in ten breaks because
         * nobody did. Both tails come from here. */
        /* PASS PROTECTION IS SCHEMED AND RUN BLOCKING IS A FIGHT, so they do not
         * fail at the same rate. A line that gives up a free rusher on a sixth
         * of its snaps is not a line, and it puts the sack rate at one pass in
         * six — nearly three times what the sport does. */
        const looseness = run ? 0.16 : 0.09;
        const scale = run ? 400 : 700;
        const blownOff = this.rng.next()
          < clamp(looseness + (shed - b.data.attrs.blocking) / scale, 0.02, run ? 0.34 : 0.17);
        b.blockTimer = blownOff
          ? this.rng.range(0.12, 0.55)
          : clamp(hold, 0.5, 5.5) * this.rng.range(0.7, 1.45);
      }
    }
  }

  /* ------------------------------------------------------------------ the ball */

  private updateBall(dt: number): void {
    const b = this.ball;
    b.age += dt;
    if (b.state === 'held') {
      const c = this.byUid(b.carrier);
      if (c) {
        b.x = c.x;
        b.y = c.y;
        b.z = 2.4;
      }
      return;
    }
    if (b.state === 'dead') return;

    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vz -= 32.17 / 3 * dt; // yards per second squared
    b.z += b.vz * dt;

    if (b.z <= 0.2) {
      if (b.state === 'thrown') {
        this.incomplete('overthrown');
        return;
      }
      if (b.state === 'kicked') {
        this.ballLanded();
        return;
      }
      b.z = 0.2;
      b.vz = 0;
      b.vx *= 0.82;
      b.vy *= 0.82;
    }
    if (outOfBounds(b.x) || b.y < -2 || b.y > FIELD.length + 2) {
      if (b.state === 'thrown') this.incomplete('overthrown');
      else this.ballLanded();
    }
  }

  /* ================================================================ throwing */

  /** The receiver the aim points at, within a generous cone. */
  receiverToward(qb: FieldPlayer, aimX: number, aimY: number): FieldPlayer | null {
    const eligible = this.players.filter(
      (p) => p.side === qb.side && p !== qb && p.route && p.route.kind !== 'block',
    );
    if (!eligible.length) return null;
    const mag = Math.hypot(aimX, aimY);
    if (mag < 0.15) {
      // No aim: the man the play is designed to hit, which is the deepest open one.
      return this.bestOpenReceiver(qb);
    }
    const nx = aimX / mag;
    const ny = aimY / mag;
    let best: FieldPlayer | null = null;
    let bestScore = -Infinity;
    for (const r of eligible) {
      const dx = r.x - qb.x;
      const dy = r.y - qb.y;
      const d = Math.hypot(dx, dy) || 1;
      const align = (dx / d) * nx + (dy / d) * ny;
      if (align < 0.35) continue;
      // Aimed at, and not thirty yards further away than somebody else aimed at.
      const score = align * 3 - d * 0.035;
      if (score > bestScore) { bestScore = score; best = r; }
    }
    return best ?? this.bestOpenReceiver(qb);
  }

  /** Who is actually open, for the AI and for a throw with no aim. */
  bestOpenReceiver(qb: FieldPlayer): FieldPlayer | null {
    let best: FieldPlayer | null = null;
    let bestScore = -Infinity;
    const dir = attackDir(qb.side);
    for (const r of this.players) {
      if (r.side !== qb.side || r === qb || !r.route || r.route.kind === 'block') continue;
      const sep = this.separation(r);
      const depth = (r.y - this.lineOfScrimmage) * dir;
      const throwDist = dist2(qb.x, qb.y, r.x, r.y);
      // Open, downfield, and within the arm. In that order.
      const reach = this.throwRange(qb);
      const score = sep * 2.6 + depth * 0.32 - Math.max(0, throwDist - reach) * 1.6;
      if (score > bestScore) { bestScore = score; best = r; }
    }
    return best;
  }

  /** Yards to the nearest defender. The one number coverage comes down to. */
  separation(r: FieldPlayer): number {
    let near = 99;
    for (const d of this.players) {
      if (d.side === r.side) continue;
      near = Math.min(near, dist2(r.x, r.y, d.x, d.y));
    }
    return near;
  }

  /** How far this man can throw it. */
  throwRange(qb: FieldPlayer): number {
    return 22 + (qb.data.attrs.throwPower / 99) * 34;
  }

  /**
   * THE THROW.
   *
   * Aimed at where the receiver WILL BE, not where he is — a pass thrown at a
   * man running away from you arrives behind him, and leading him is what makes
   * a pass a pass. How well it is led is the quarterback's accuracy; how far it
   * can be led is his arm.
   *
   * ACCURACY IS AN ERROR, NOT A ROLL. The ball goes where it goes, the receiver
   * adjusts to it if he can, and a badly thrown ball can be caught by the wrong
   * man. Nothing here decides "complete" or "incomplete" — that is decided later,
   * by where the ball and the bodies actually are.
   */
  throwTo(qb: FieldPlayer, target: FieldPlayer, aimX = 0, aimY = 0): void {
    if (this.thrown || this.ball.carrier !== qb.uid) return;
    const a = qb.data.attrs;
    const speed = FOOTBALL.throwSpeedMin
      + (a.throwPower / 99) * (FOOTBALL.throwSpeedMax - FOOTBALL.throwSpeedMin);

    // Lead him by how long the ball will be in the air.
    /* LEAD HIM BY THE TIME THE BALL WILL ACTUALLY BE IN THE AIR.
     *
     * And that is not the time it takes to reach where he is standing — it is
     * the time it takes to reach where he is GOING, which is further away. Using
     * the first number leaves every pass short, using his current velocity over
     * that longer time leaves every pass long, and the way out is one round of
     * settling: lead him, re-measure, lead him again. Two lines, and the
     * difference between a passing game and eight yards of air.
     *
     * And he is led ALONG HIS ROUTE rather than along his current heading — see
     * `projectReceiver` — so a ball thrown as a man breaks arrives where the
     * break goes rather than eight yards past it. */
    let lead = clamp(dist2(qb.x, qb.y, target.x, target.y) / speed, 0.1, 1.7);
    for (let i = 0; i < 2; i++) {
      const spot = projectReceiver(this, target, lead);
      lead = clamp(dist2(qb.x, qb.y, spot.x, spot.y) / speed, 0.1, 1.7);
    }
    const aimAt = projectReceiver(this, target, lead);
    let tx = aimAt.x;
    let ty = aimAt.y;

    /* THE STICK NUDGES THE BALL. A player aiming hard in a direction throws it a
     * yard or two that way, which is how a person throws a receiver open or puts
     * it where only his man can get it. Small, because it is a nudge and not a
     * second targeting system. */
    const aimMag = Math.hypot(aimX, aimY);
    if (aimMag > 0.25) {
      tx += (aimX / aimMag) * 2.2;
      ty += (aimY / aimMag) * 2.2;
    }

    /* THE ERROR. An eighty-rated arm misses by about a yard; a forty-rated one
     * misses by three, and misses more the further it throws. Under pressure it
     * is worse, which is what makes a collapsing pocket cost something other
     * than a sack. */
    const distance = dist2(qb.x, qb.y, tx, ty);
    const pressure = this.pressureOn(qb);
    const err = (1.35 - a.throwAccuracy / 120)
      * (0.5 + distance / 34)
      * (1 + pressure * 0.9)
      * (2 - this.cfg.difficulty.throwWindow);
    tx += this.rng.gauss(0, err);
    ty += this.rng.gauss(0, err);
    /* AND NOBODY THROWS IT INTO THE STANDS ON PURPOSE. A receiver running at the
     * sideline stops at it, so leading him past it aims at a point he can never
     * reach and turns every out route into a guaranteed incompletion. */
    tx = clampToField(tx);
    ty = clamp(ty, FIELD.homeGoal - 8, FIELD.awayGoal + 8);

    const flight = Math.max(0.25, dist2(qb.x, qb.y, tx, ty) / speed);
    this.ball.state = 'thrown';
    this.ball.carrier = null;
    this.ball.from = qb.uid;
    this.ball.target = target.uid;
    this.ball.aimX = tx;
    this.ball.aimY = ty;
    this.ball.x = qb.x;
    this.ball.y = qb.y;
    this.ball.z = 2.4;
    this.ball.vx = (tx - qb.x) / flight;
    this.ball.vy = (ty - qb.y) / flight;
    // An arc that clears the linebackers on anything but a quick out.
    this.ball.vz = (1.7 - 2.4) / flight + 0.5 * (32.17 / 3) * flight;
    this.ball.age = 0;
    this.thrown = true;
    qb.hasBall = false;
    qb.pose = 'throw';
    qb.poseTimer = 0.4;

    const s = this.statFor(qb);
    s.passAttempts++;
    this.statFor(target).targets++;
    this.controlled[qb.side] = target;
    target.flash = 0.3;
    this.events.emit('throw', { by: this.nameOf(qb), distance });
    this.batAtLine(qb);
  }

  /** How hard he is being chased, 0..1. */
  pressureOn(qb: FieldPlayer): number {
    let worst = 0;
    for (const d of this.players) {
      if (d.side === qb.side || d.engagedWith || d.stunned > 0) continue;
      const gap = dist2(qb.x, qb.y, d.x, d.y);
      if (gap < 7) worst = Math.max(worst, 1 - gap / 7);
    }
    return worst;
  }

  /** Out of bounds, out of trouble. Costs the down and nothing else. */
  throwAway(qb: FieldPlayer): void {
    if (this.thrown || this.ball.carrier !== qb.uid) return;
    const dir = attackDir(qb.side);
    this.ball.state = 'thrown';
    this.ball.carrier = null;
    this.ball.from = qb.uid;
    this.ball.target = null;
    this.ball.x = qb.x;
    this.ball.y = qb.y;
    this.ball.z = 2.2;
    this.ball.vx = (qb.x < FIELD.centerX ? -1 : 1) * 16;
    this.ball.vy = dir * 9;
    this.ball.vz = 6;
    this.thrown = true;
    qb.hasBall = false;
    qb.pose = 'throw';
    qb.poseTimer = 0.4;
    this.statFor(qb).passAttempts++;
    this.say('Thrown away', 1.4);
  }

  /* ------------------------------------------------------------ the catch */

  /**
   * WHO GETS IT.
   *
   * Every man within reach of the ball is a candidate — the receiver it was
   * meant for, the corner on his hip, and the safety who read it. Each of them
   * has a chance based on how close he is, what he is rated at catching or
   * covering, and whether he is the intended target, and the best chance wins.
   *
   * A DEFENDER CATCHING IT IS AN INTERCEPTION, which is the whole reason this is
   * one calculation rather than two. A system that asks "did the receiver catch
   * it" and then separately "was it intercepted" can produce neither, or both.
   */
  private checkCatch(dt: number): void {
    const b = this.ball;
    if (b.state !== 'thrown') return;

    /* A LINEMAN CAN BAT IT DOWN, and that is the only thing that can happen to
     * a football in the first fifth of a second of its flight. The first version
     * of this contested the catch on every frame, which meant a defensive tackle
     * standing two yards in front of the passer broke up every pass in the game:
     * the ball flew through him on its way out. */
    if (b.age < 0.22) return;
    // Over everybody's head.
    if (b.z > 3.4) return;

    /* WHOSE HANDS ARE ON IT. One receiver and one defender, because a football
     * is caught by the man nearest to it and everyone else is a spectator. */
    let rec: FieldPlayer | null = null;
    let recGap: number = FOOTBALL.catchRadius;
    let def: FieldPlayer | null = null;
    let defGap: number = FOOTBALL.contestRange;
    for (const p of this.players) {
      const gap = dist2(b.x, b.y, p.x, p.y);
      if (p.side === this.possession) {
        if (gap < recGap) { recGap = gap; rec = p; }
      } else if (gap < defGap) { defGap = gap; def = p; }
    }
    if (!rec && (!def || defGap > FOOTBALL.catchRadius)) return;

    /* AND IT IS DECIDED AT THE CLOSEST THE BALL EVER GETS TO HIM.
     *
     * A thrown ball crosses a receiver's catch radius in about four frames, and
     * resolving on the first of them judges him at arm's length every single
     * time — which produced a seventeen per cent completion rate with receivers
     * standing wide open, because the ball was still a yard and a half away when
     * the game asked whether he had caught it. So the contest waits while the
     * ball is still closing and fires on the frame it starts to leave. */
    const claimant = rec ?? def;
    if (claimant) {
      const nz = b.z + b.vz * dt;
      const now = dist2(b.x, b.y, claimant.x, claimant.y);
      const next = dist2(
        b.x + b.vx * dt, b.y + b.vy * dt,
        claimant.x + claimant.vx * dt, claimant.y + claimant.vy * dt,
      );
      if (next < now && nz > 0.2) return;
    }

    const help = this.cfg.difficulty.catchHelp;
    const press = def ? clamp(1 - defGap / FOOTBALL.contestRange, 0, 1) : 0;

    /* NOBODY IN WHITE IS THERE. A defender alone under the ball has jumped the
     * route, and that is where a real interception comes from — not from a
     * lineman standing near a completed pass. */
    if (!rec && def) {
      /* AND MOST OF THEM ARE DROPPED. A ball arriving at a defender with nobody
       * in the way is a chance, not a turnover — real defensive backs put both
       * hands on far more footballs than they catch, and an engine that hands
       * them every one produces a dozen interceptions a game. */
      const read = 0.04 + (def.data.attrs.coverage * 0.6 + def.data.attrs.awareness * 0.4) / 1500;
      if (this.rng.next() < clamp(read, 0.02, 0.2)) this.intercept(def);
      else { this.statFor(def).passesDefended++; this.incomplete('defended'); }
      return;
    }
    if (!rec) return;

    /* THE CONTEST.
     *
     * Three things decide a catch and the first version of this only had one of
     * them: how well the ball is placed, how good his hands are, and HOW HARD HE
     * IS BEING COVERED. Leaving the third out meant a receiver with a corner
     * draped over him caught ninety-seven per cent of everything and the game
     * had no interceptions at all — coverage existed but could not do anything.
     */
    const reach = clamp(1 - recGap / FOOTBALL.catchRadius, 0, 1);
    const hands = 0.5 + rec.data.attrs.catching / 140;
    const cover = def ? 0.35 + def.data.attrs.coverage / 150 : 0;
    const chance = clamp(
      (0.55 + reach * 0.45) * hands * help * (1 - press * cover * 0.62),
      0.05, 0.95,
    );
    if (this.rng.next() < chance) {
      this.completePass(rec, press > 0.4);
      return;
    }

    /* HE DID NOT COME DOWN WITH IT. Whether that is a pick, a break-up or a drop
     * is decided by who else was there, which is the reason this is one
     * calculation and not three: a system that asks each question separately can
     * answer none of them, or all of them. */
    if (def) {
      const pick = clamp(0.014 + def.data.attrs.coverage / 1800, 0.012, 0.1) * press;
      if (this.rng.next() < pick) { this.intercept(def); return; }
      this.statFor(def).passesDefended++;
      this.incomplete('defended');
      return;
    }
    this.incomplete('dropped');
  }

  /**
   * A LINEMAN GETS A HAND ON IT.
   *
   * ONE ROLL, AT THE RELEASE, and that is the entire point of where this lives.
   * The first version ran it inside the per-frame catch check, so four linemen
   * each got a fresh roll on each of the ten frames the ball spent leaving the
   * quarterback's hand — forty chances at a fifth each, which batted down
   * essentially every pass in the game and made a passing offence impossible.
   *
   * A batted ball is roughly one pass in fifty. It needs a rusher who has beaten
   * his man and is standing in the throwing lane, and it is his pass rush that
   * does it. Returns true when the ball is dead.
   */
  private batAtLine(qb: FieldPlayer): boolean {
    let best: FieldPlayer | null = null;
    let near = 1.8;
    for (const d of this.players) {
      if (d.side === qb.side || d.stunned > 0 || d.engagedWith) continue;
      const gap = dist2(qb.x, qb.y, d.x, d.y);
      if (gap < near) { near = gap; best = d; }
    }
    if (!best) return false;
    // In the lane, not beside him: a rusher coming off the edge cannot reach it.
    const lane = Math.abs(best.x - qb.x) < 1.6;
    if (!lane) return false;
    if (this.rng.next() > 0.02 + best.data.attrs.passRush / 1400) return false;
    this.statFor(best).passesDefended++;
    this.say(`${best.data.last} bats it down`, 1.6);
    this.incomplete('defended');
    return true;
  }

  private completePass(receiver: FieldPlayer, contested: boolean): void {
    const dir = attackDir(receiver.side);
    const yards = (receiver.y - this.lineOfScrimmage) * dir;
    this.giveBall(receiver);
    this.controlled[receiver.side] = receiver;
    this.thrown = true;
    this.ball.state = 'held';

    const qb = this.byUid(this.ball.from);
    if (qb) {
      const s = this.statFor(qb);
      s.completions++;
      s.passYards += Math.round(yards);
    }
    const r = this.statFor(receiver);
    r.catches++;
    r.recYards += Math.round(yards);
    /* AIR YARDS NOW, YARDS AFTER THE CATCH AT THE WHISTLE. Remembering where he
     * caught it is the only way the second half can be credited, and a receiving
     * line with no yards after the catch is not a receiving line. */
    this.completion = { receiver: receiver.uid, passer: this.ball.from, air: Math.round(yards) };
    receiver.pose = 'catch';
    receiver.poseTimer = 0.3;
    this.events.emit('catch', { by: this.nameOf(receiver), yards: Math.round(yards), contested });
    this.say(`${receiver.data.last} — ${Math.round(yards)} yards`, 1.6);
  }

  private intercept(by: FieldPlayer): void {
    const qb = this.byUid(this.ball.from);
    if (qb) this.statFor(qb).interceptions++;
    this.statFor(by).picks++;
    this.events.emit('interception', { by: this.nameOf(by), on: qb ? this.nameOf(qb) : '' });
    this.giveBall(by);
    this.ball.state = 'held';
    this.controlled[by.side] = by;
    /* THE PICK IS NOT THE END OF THE PLAY. He can run it back, which is one of
     * the best moments in the sport, so possession changes and the play carries
     * on with the same eleven men in the wrong shirts. */
    this.possession = by.side;
    this.box[otherSide(by.side)].turnovers++;
    this.setBanner('INTERCEPTED', 2);
    for (const p of this.players) p.react = this.reactionFor(p) * 1.6;
  }

  private incomplete(reason: 'overthrown' | 'defended' | 'dropped'): void {
    this.events.emit('incomplete', { reason });
    const text = reason === 'defended' ? 'Broken up'
      : reason === 'dropped' ? 'Dropped' : 'Incomplete';
    this.endPlay({
      outcome: 'incomplete',
      yards: 0,
      side: this.possession,
      by: null,
      on: null,
      text,
      turnover: false,
      points: 0,
      // An incompletion stops the clock. This is the rule that makes a
      // two-minute drill possible, and without it the end of a half is a formality.
      clockRuns: false,
    });
  }

  /* ---------------------------------------------------------------- tackling */

  /**
   * A TACKLE IS A CONTEST, not a collision.
   *
   * Whether a man goes down comes out of the two players and the geometry:
   * the defender's tackling and power against the carrier's power, agility and
   * balance, adjusted by how square the hit is — a defender arriving from behind
   * at full speed brings him down, one reaching across his body does not.
   *
   * NOBODY IS EVER MOVED BY THE TACKLE ITSELF. A defender who whiffs is beaten
   * and stunned where he stands; a carrier who breaks one keeps running from
   * where he was. There is no snapping, no teleporting and no sliding, because
   * nothing here sets a position.
   */
  private checkTackles(): void {
    const carrier = this.byUid(this.ball.carrier);
    if (!carrier || this.ball.state !== 'held') return;
    if (this.phase !== 'live') return;

    for (const d of this.players) {
      if (d.side === carrier.side || d.stunned > 0 || d.engagedWith) continue;
      const gap = dist2(d.x, d.y, carrier.x, carrier.y);
      if (gap > FOOTBALL.tackleRange) continue;
      this.resolveTackle(d, carrier);
      return;
    }
  }

  /** A human pressing the tackle button reaches for the man. */
  private attemptTackle(d: FieldPlayer): void {
    const carrier = this.byUid(this.ball.carrier);
    if (!carrier || carrier.side === d.side) return;
    const gap = dist2(d.x, d.y, carrier.x, carrier.y);
    // A dive extends the reach and costs you if it misses.
    if (gap > FOOTBALL.tackleRange + 1.1) return;
    this.resolveTackle(d, carrier, true);
  }

  private resolveTackle(d: FieldPlayer, carrier: FieldPlayer, diving = false): void {
    const da = d.data.attrs;
    const ca = carrier.data.attrs;

    // How square the hit is: head-on is worth more than an arm across the body.
    const dx = carrier.x - d.x;
    const dy = carrier.y - d.y;
    const gap = Math.hypot(dx, dy) || 1;
    const closing = (d.vx * dx + d.vy * dy) / gap;
    const square = clamp(0.45 + closing / 9, 0.25, 1.1);

    const strength = (da.tackling * 0.62 + da.power * 0.38) * square * (diving ? 0.86 : 1);
    const escape = ca.power * 0.4 + ca.agility * 0.38 + ca.ballSecurity * 0.22;

    /* MOST TACKLES ARE MADE, and the first version of this had two evenly rated
     * men breaking half of them — which turns every carry into a coin flip on
     * whether it is a two yard gain or a forty yard run, and makes a difficulty
     * setting that touches the number swing the whole sport.
     *
     * A broken tackle is roughly one in six. Ratings move that a long way in both
     * directions; difficulty moves it a little, because it is the one term here
     * that is not a rating and it is not allowed to decide the game. */
    const base = clamp(0.82 + (strength - escape) / 300, 0.5, 0.97);
    const chance = clamp(base - (this.cfg.difficulty.tackleBreak - 1) * 0.16, 0.45, 0.97);

    if (this.rng.next() < chance) {
      this.statFor(d).tackles++;
      const dir = attackDir(carrier.side);
      const yards = (carrier.y - this.lineOfScrimmage) * dir;

      /* THE BALL COMES OUT.
       *
       * Rare — about one carry in sixty — and it is the hit against the hands:
       * a big tackler arriving square on a back with poor ball security, not a
       * dice roll bolted onto every tackle. Whoever is nearest picks it up,
       * which is most often the defence but not always, and that is the whole
       * reason a fumble is frightening rather than simply bad. */
      const looseness = clamp(
        0.012 + (da.power - ca.ballSecurity) / 2600 + (square - 0.7) * 0.02,
        0.002, 0.055,
      );
      if (!this.thrown && this.kickKind === 'none' && this.rng.next() < looseness) {
        this.forceFumble(d, carrier, yards);
        return;
      }
      const sack = carrier.slot === 'QB' && this.offensivePlay.family !== 'run'
        && !this.offensivePlay.handoff && !this.thrown;
      if (sack) {
        this.statFor(d).sacks++;
        this.statFor(carrier).sacked++;
        this.box[carrier.side].sacksAllowed++;
        this.events.emit('sack', {
          by: this.nameOf(d), on: this.nameOf(carrier), yards: Math.round(yards),
        });
        this.endPlay(this.tackleResult(d, 'sack'));
        return;
      }
      this.events.emit('tackle', {
        by: this.nameOf(d), on: this.nameOf(carrier), yards: Math.round(yards),
      });
      this.endPlay(this.tackleResult(d, 'tackle'));
      return;
    }

    /* BROKEN. The defender is beaten for half a second — he does not vanish, he
     * is simply behind the play, which is what a missed tackle looks like. */
    d.stunned = FOOTBALL.missedTackleStun;
    d.pose = 'down';
    d.poseTimer = FOOTBALL.missedTackleStun;
    carrier.pose = 'sprint';
    this.say(`${carrier.data.last} breaks one`, 1.2);
  }

  /**
   * A FUMBLE, AND THE SCRAMBLE FOR IT.
   *
   * Whoever is closest to the carrier when it comes out has it — and the
   * offence is closest about a third of the time, which is what keeps a fumble
   * a moment rather than a sentence. The ball is spotted where it came out,
   * because that is the rule.
   */
  private forceFumble(by: FieldPlayer, carrier: FieldPlayer, yards: number): void {
    this.statFor(by).forcedFumbles++;
    this.statFor(carrier).fumbles++;

    let winner: FieldPlayer = by;
    let near = Infinity;
    for (const p of this.players) {
      if (p === carrier || p.stunned > 0) continue;
      const gap = dist2(p.x, p.y, carrier.x, carrier.y)
        // A man already going the other way is slower onto a loose ball.
        * (p.side === carrier.side ? 1.25 : 1);
      if (gap < near) { near = gap; winner = p; }
    }

    const kept = winner.side === carrier.side;
    this.giveBall(winner);
    this.ball.state = 'held';
    this.events.emit('fumble', { by: this.nameOf(carrier), recovered: winner.side });
    this.setBanner('FUMBLE', 2);
    if (!kept) {
      this.possession = winner.side;
      this.box[carrier.side].turnovers++;
    }
    this.say(kept ? `${carrier.data.last} fumbles — and gets it back`
      : `${carrier.data.last} fumbles — ${winner.data.last} has it`, 2.2);

    this.endPlay({
      outcome: 'fumble',
      yards: Math.round(yards),
      side: winner.side,
      by: this.nameOf(by),
      on: this.nameOf(carrier),
      text: kept ? 'Fumble, recovered' : 'Fumble, turned over',
      turnover: false,
      points: 0,
      clockRuns: false,
    });
  }

  private tackleResult(by: FieldPlayer | null, outcome: 'tackle' | 'sack'): PlayResult {
    const carrier = this.byUid(this.ball.carrier);
    const side = carrier?.side ?? this.possession;
    const dir = attackDir(side);
    const yards = carrier ? Math.round((carrier.y - this.lineOfScrimmage) * dir) : 0;
    const outAt = carrier ? outOfBounds(carrier.x) : false;
    return {
      outcome: outAt ? 'outOfBounds' : outcome,
      yards,
      side,
      by: by ? this.nameOf(by) : null,
      on: carrier ? this.nameOf(carrier) : null,
      text: outcome === 'sack'
        ? `Sacked for ${Math.abs(yards)}`
        : `${yards >= 0 ? `${yards} yard` : `${Math.abs(yards)} yard loss`}`,
      turnover: false,
      points: 0,
      // Out of bounds stops the clock; a tackle in the field does not.
      clockRuns: !outAt,
    };
  }

  /* ============================================================= ending a play */

  /**
   * THE WHISTLE.
   *
   * Everything that happens between plays happens here, in one place and in the
   * order the rulebook does it: the spot, the score if there was one, the down,
   * the change of possession, the clock. Scattering this across the places a
   * play can end is how a football game ends up with four different opinions
   * about what down it is.
   */
  endPlay(result: PlayResult): void {
    if (this.phase !== 'live') return;
    this.lastResult = result;
    this.phase = 'dead';
    this.phaseTimer = FOOTBALL.huddlePause;
    this.ball.state = 'dead';
    this.events.emit('whistle', {});
    this.history.push({
      side: this.possession,
      family: this.kickKind !== 'none' ? 'special' : this.offensivePlay.family,
      yards: result.yards,
    });

    const carrier = this.byUid(this.ball.carrier);
    const dir = attackDir(result.side);

    /* A TRY IS NOT A TOUCHDOWN. Reaching the end zone on a two-point play is
     * worth two and nothing else, and it has to be caught here, before the
     * scoring rule below hands out six for it. */
    if (this.tryKind === 'two') {
      const good = !!carrier && carrier.side === this.possession
        && inAttackingEndZone(carrier.y, carrier.side);
      this.resolveTwoPoint(good);
      return;
    }

    /* THE BOOKS ARE KEPT BEFORE ANYTHING ELSE HAPPENS.
     *
     * The first version of this credited the stat line and the yardage AFTER the
     * scoring checks, which return early — so a sixty yard touchdown run was
     * worth six points and nought yards, on the box score and on the rushing
     * line alike. A team finished with three hundred and fifty yards and six
     * touchdowns, which is not a football game, it is two football games'
     * numbers stapled together. Scores are plays too, and they are counted here
     * with everything else.
     */
    const scored = !!carrier && inAttackingEndZone(carrier.y, carrier.side);
    const conceded = !!carrier && inOwnEndZone(carrier.y, carrier.side)
      && result.outcome !== 'incomplete';
    const box = this.box[result.side];

    if (this.kickKind === 'none' && carrier && result.outcome !== 'incomplete') {
      if (this.completion) {
        const yac = result.yards - this.completion.air;
        const rec = this.byUid(this.completion.receiver);
        const passer = this.byUid(this.completion.passer);
        if (rec) this.statFor(rec).recYards += yac;
        if (passer) this.statFor(passer).passYards += yac;
      } else if (result.outcome !== 'sack' && !this.thrown && carrier.side === this.snapSide) {
        /* A CARRY BELONGS TO THE OFFENCE THAT SNAPPED IT. A linebacker returning
         * an interception is not a running back having a bad day, and crediting
         * him with one puts fifteen yard losses on the rushing line and drags a
         * whole team's yards per carry under a yard. */
        const s = this.statFor(carrier);
        s.carries++;
        s.rushYards += result.yards;
      }
    }

    if (result.outcome !== 'incomplete' && this.kickKind === 'none') {
      box.totalYards += result.yards;
      if (this.offensivePlay.handoff || result.outcome === 'sack') box.rushYards += result.yards;
      else if (this.thrown) box.passYards += result.yards;
      else box.rushYards += result.yards;
    }
    /* WHERE THE BALL WILL BE SPOTTED, worked out before it is spotted, because
     * two things need it: whether a third down was converted, and the spot
     * itself. Asking the question against the OLD line of scrimmage — which is
     * what it looked like this was doing — makes every third down a failure. */
    const endY = result.outcome !== 'incomplete' && carrier
      ? clamp(carrier.y, FIELD.homeGoal + 0.5, FIELD.awayGoal - 0.5)
      : this.lineOfScrimmage;

    if (this.down === 3 && this.kickKind === 'none') {
      box.thirdDownAtt++;
      // A third down that ends in the end zone is the most converted third down
      // there is, and it has to be counted as one.
      if (scored || (endY - this.firstDownLine) * dir >= 0) box.thirdDownConv++;
    }

    /* A SCORE IS DECIDED BY WHERE THE BALL ENDED, not by what the play was. A
     * pick returned to the house and a forty yard run are the same rule. */
    if (scored && carrier) {
      this.touchdown(carrier);
      return;
    }
    if (conceded && carrier) {
      this.safety(carrier.side);
      return;
    }

    // Spot the ball.
    if (result.outcome !== 'incomplete' && carrier) {
      this.lineOfScrimmage = endY;
      this.ballX = hashSpot(clamp(carrier.x, 0.5, FIELD.width - 0.5));
    }

    /* THE BALL CHANGED HANDS DURING THE PLAY.
     *
     * An interception returned and tackled leaves a completely different team on
     * offence, and everything below this line — the down, the distance, the line
     * to gain — belongs to the side that snapped it. Falling through with the old
     * marker still set gives the intercepting team a first down it never earned,
     * or hands the ball straight back on downs, depending on which way the two
     * teams happened to be facing. Both were happening.
     */
    if (result.side !== this.snapSide) {
      this.changePossession(result.side, 'Turnover');
      return;
    }

    if (result.turnover) {
      this.changePossession(otherSide(result.side), 'Turnover');
      return;
    }

    // Did that get a first down?
    const reached = (this.lineOfScrimmage - this.firstDownLine) * dir >= 0;
    if (reached) {
      box.firstDowns++;
      this.down = 1;
      this.setFirstDown();
      this.events.emit('firstDown', { side: this.possession });
      this.setBanner('FIRST DOWN', 1.4);
    } else if (this.down >= FOOTBALL.downs) {
      this.turnoverOnDowns();
      return;
    } else {
      this.down++;
      this.toGo = Math.max(1, Math.round((this.firstDownLine - this.lineOfScrimmage) * dir));
    }

    this.clockRunning = result.clockRuns;
    this.say(result.text, 1.8);
    this.headToHuddle();
  }

  /**
   * BACK TO THE BALL.
   *
   * Set at the whistle so the twenty-two men spend the dead ball WALKING to
   * roughly where the next snap will want them, rather than standing where the
   * play left them and then appearing in formation.
   *
   * This is the half of it that matters: a receiver twenty yards downfield
   * cannot cover that ground inside a play clock, so if he only starts moving
   * when the call comes in he is still jogging when the ball is snapped — and a
   * defence that snaps out of position turns every pass into a completion. That
   * was measured: twenty-two yards an attempt and nine touchdowns a game.
   */
  private headToHuddle(): void {
    const dir = attackDir(this.possession);
    for (const p of this.players) {
      const off = p.side === this.possession;
      const spread = ((p.slot.charCodeAt(0) + p.slot.charCodeAt(1)) % 9) - 4;
      p.setX = clampToField(this.ballX + spread * 2.4);
      p.setY = this.lineOfScrimmage - dir * (off ? 7 : -5);
    }
  }

  private setFirstDown(): void {
    const dir = attackDir(this.possession);
    const goal = attackGoal(this.possession);
    const target = this.lineOfScrimmage + dir * FOOTBALL.yardsForFirst;
    /* AND GOAL. Inside ten yards the line to gain is the goal line, because there
     * is nothing past it — a first down marker in the end zone is the kind of
     * thing that makes a scoreboard read as broken. */
    const beyond = (target - goal) * dir > 0;
    this.firstDownLine = beyond ? goal : target;
    this.toGo = Math.max(1, Math.round((this.firstDownLine - this.lineOfScrimmage) * dir));
  }

  private updateDead(dt: number): void {
    this.phaseTimer -= dt;
    if (this.phase === 'dead') this.considerAiTimeout();
    if (this.phase === 'dead' && this.tickClock(dt * FOOTBALL.deadClockRate)) return;
    // Between plays the men walk back toward the ball rather than freezing.
    for (const p of this.players) {
      this.walkToSpot(p, dt);
      p.stamina = clamp(p.stamina + FOOTBALL.staminaRegen * dt, 0, 100);
      if (p.poseTimer <= 0 && Math.hypot(p.vx, p.vy) < 0.4) p.pose = 'idle';
      p.poseTimer = Math.max(0, p.poseTimer - dt);
    }
    if (this.phaseTimer > 0) return;

    /* A SCORE OR A KICK HAS SOMETHING WAITING BEHIND IT — the try after a
     * touchdown, the kickoff after the try — and this is where it happens. A
     * touchdown on the last play of a quarter still gets its extra point, which
     * is the rule, so the period cannot end until nothing is pending. */
    if (this.phase === 'special') {
      if (this.clock <= 0 && this.pendingAfter !== 'try') {
        this.pendingAfter = 'none';
        this.endQuarter();
        return;
      }
      const landed = this.resumeAfterSpecial();
      if (this.clock <= 0 && landed === 'playcall') this.endQuarter();
      return;
    }

    if (this.clock <= 0) {
      this.endQuarter();
      return;
    }
    this.phase = 'playcall';
  }

  /* ================================================================ scoring */

  private touchdown(by: FieldPlayer): void {
    this.clockRunning = false;
    const side = by.side;
    this.score[side] += FOOTBALL.touchdown;
    this.box[side].points += FOOTBALL.touchdown;
    this.box[side].byQuarter[Math.min(3, this.quarter - 1)] += FOOTBALL.touchdown;
    const kind = this.thrown ? 'pass' : this.offensivePlay.handoff ? 'run' : 'return';
    const s = this.statFor(by);
    if (kind === 'pass') {
      s.recTD++;
      const qb = this.byUid(this.ball.from);
      if (qb) this.statFor(qb).passTD++;
    } else if (kind === 'run') s.rushTD++;
    this.events.emit('touchdown', {
      side, by: this.nameOf(by), yards: Math.round(this.lastResult?.yards ?? 0), kind,
    });
    this.setBanner('TOUCHDOWN', 2.6);
    this.say(`${by.data.first} ${by.data.last} scores`, 2.4);
    by.pose = 'celebrate';
    by.poseTimer = 2;
    this.possession = side;
    this.tryKind = 'kick';
    this.phase = 'special';
    this.phaseTimer = FOOTBALL.scorePause;
    this.pendingAfter = 'try';
  }

  /** Two points or none, and then the kickoff either way. */
  private resolveTwoPoint(good: boolean): void {
    this.clockRunning = false;
    const side = this.possession;
    if (good) {
      this.score[side] += FOOTBALL.twoPoint;
      this.box[side].points += FOOTBALL.twoPoint;
      this.box[side].byQuarter[Math.min(3, this.quarter - 1)] += FOOTBALL.twoPoint;
    }
    this.lastResult = {
      outcome: good ? 'twoPoint' : 'twoPointFail',
      yards: 0, side, by: null, on: null,
      text: good ? 'Two-point conversion' : 'No good',
      turnover: false, points: good ? FOOTBALL.twoPoint : 0, clockRuns: false,
    };
    this.setBanner(good ? 'TWO POINTS' : 'NO GOOD', 1.8);
    this.tryKind = 'none';
    this.phase = 'special';
    this.phaseTimer = FOOTBALL.huddlePause;
    this.pendingAfter = 'kickoff';
  }

  private safety(against: Side): void {
    this.clockRunning = false;
    const scorer = otherSide(against);
    this.score[scorer] += FOOTBALL.safety;
    this.box[scorer].points += FOOTBALL.safety;
    this.box[scorer].byQuarter[Math.min(3, this.quarter - 1)] += FOOTBALL.safety;
    this.events.emit('safety', { side: scorer });
    this.setBanner('SAFETY', 2.2);
    this.phase = 'special';
    this.phaseTimer = FOOTBALL.scorePause;
    this.pendingAfter = 'freeKick';
    this.possession = against;
  }

  /** What happens once the celebration is over. */
  private pendingAfter: 'none' | 'try' | 'kickoff' | 'freeKick' = 'none';

  /* --------------------------------------------------------- the extra point */

  /**
   * THE TRY.
   *
   * A kick or a two-point play, and the choice is a real one late in a game: down
   * eight, a touchdown and two gets you level. The AI decides by the scoreboard
   * and the clock, which is what a coach does.
   */
  beginTry(kind: 'kick' | 'two'): void {
    this.clockRunning = false;
    this.tryKind = kind;
    this.down = 1;
    this.toGo = 2;
    const dir = attackDir(this.possession);
    this.lineOfScrimmage = attackGoal(this.possession) - dir * (kind === 'kick' ? 15 : 2);
    this.ballX = FIELD.centerX;
    this.firstDownLine = attackGoal(this.possession);
    this.phase = 'playcall';
    this.pendingAfter = 'kickoff';
    if (kind === 'kick') this.callKick('extraPoint');
  }

  /* ------------------------------------------------------------- the kicks */

  private setKickFormation(): void {
    this.buildPlayers();
    const dir = attackDir(this.possession);
    const kicker = this.playerInSlot(this.possession, 'QB');
    if (kicker) {
      kicker.setX = this.ballX;
      kicker.setY = this.lineOfScrimmage - dir * (this.kickKind === 'kickoff' ? 6 : 7);
      kicker.x = kicker.setX;
      kicker.y = kicker.setY;
    }
  }

  private beginKick(): void {
    const side = this.possession;
    const roster = this.rosters[side];
    const specialist = this.kickKind === 'punt'
      ? starterAt(roster, 'P') : starterAt(roster, 'K');
    const leg = specialist?.attrs.kicking ?? 55;
    const acc = specialist?.attrs.awareness ?? 55;
    const dir = attackDir(side);

    if (this.kickKind === 'fieldGoal' || this.kickKind === 'extraPoint') {
      const distance = this.kickKind === 'extraPoint'
        ? 33 : fieldGoalDistance(this.lineOfScrimmage, side);
      const made = this.rng.next() < this.fieldGoalChance(distance, leg, acc);
      if (specialist && this.kickKind === 'fieldGoal') {
        const s = this.statForId(specialist.id);
        s.fgAttempts++;
        if (made) s.fgMade++;
      }
      this.resolveKickResult(made, distance);
      return;
    }

    if (this.kickKind === 'punt') {
      const dist = FOOTBALL.puntDistanceMin
        + (leg / 99) * (FOOTBALL.puntDistanceMax - FOOTBALL.puntDistanceMin)
        + this.rng.range(-5, 5);
      const land = this.lineOfScrimmage + dir * dist;
      this.events.emit('punt', { side, distance: Math.round(dist) });
      if (specialist) {
        const s = this.statForId(specialist.id);
        s.punts++;
        s.puntYards += Math.round(dist);
      }
      this.finishKickAt(land, 'punt', `Punt, ${Math.round(dist)} yards`);
      return;
    }

    // Kickoff.
    const land = this.lineOfScrimmage + dir * (FOOTBALL.kickoffDistance + this.rng.range(-4, 6));
    this.events.emit('kickoff', { side });
    this.finishKickAt(land, 'kickoff', 'Kickoff');
  }

  /**
   * HOW OFTEN A KICK LIKE THIS GOES IN.
   *
   * One function, used both to decide the kick and to decide whether to attempt
   * it, because a coach who sends his kicker out from forty-eight has to be
   * working off the same numbers the kicker is. The shape is the sport's: nearly
   * automatic inside thirty, falling gently to about sixty per cent at fifty,
   * and then off a cliff at the edge of the leg.
   */
  fieldGoalChance(distance: number, leg: number, accuracy: number): number {
    const range = FOOTBALL.fieldGoalRangeMin
      + (leg / 99) * (FOOTBALL.fieldGoalRangeMax - FOOTBALL.fieldGoalRangeMin);
    const comfort = range - 10;
    const base = 0.985
      - 0.0045 * Math.max(0, distance - 18)
      - 0.05 * Math.max(0, distance - comfort);
    return clamp(base * (0.86 + accuracy / 420), 0.02, 0.985);
  }

  /** What the kicker on this side is, for the coach deciding whether to send him. */
  kickerFor(side: Side): { leg: number; accuracy: number } {
    const k = starterAt(this.rosters[side], 'K');
    return { leg: k?.attrs.kicking ?? 55, accuracy: k?.attrs.awareness ?? 55 };
  }

  private resolveKickResult(made: boolean, distance: number): void {
    this.clockRunning = false;
    const side = this.possession;
    this.events.emit('fieldGoal', { side, made, distance: Math.round(distance) });
    if (this.kickKind === 'extraPoint') {
      if (made) {
        this.score[side] += FOOTBALL.extraPoint;
        this.box[side].points += FOOTBALL.extraPoint;
        this.box[side].byQuarter[Math.min(3, this.quarter - 1)] += FOOTBALL.extraPoint;
      }
      this.setBanner(made ? 'EXTRA POINT GOOD' : 'NO GOOD', 1.8);
      this.phase = 'special';
      this.phaseTimer = FOOTBALL.huddlePause;
      this.pendingAfter = 'kickoff';
      this.tryKind = 'none';
      return;
    }
    if (made) {
      this.score[side] += FOOTBALL.fieldGoal;
      this.box[side].points += FOOTBALL.fieldGoal;
      this.box[side].byQuarter[Math.min(3, this.quarter - 1)] += FOOTBALL.fieldGoal;
      this.setBanner('IT IS GOOD', 2.2);
      this.lastResult = {
        outcome: 'fieldGoal', yards: 0, side, by: null, on: null,
        text: `Field goal, ${Math.round(distance)} yards`,
        turnover: false, points: FOOTBALL.fieldGoal, clockRuns: false,
      };
      this.phase = 'special';
      this.phaseTimer = FOOTBALL.scorePause;
      this.pendingAfter = 'kickoff';
      return;
    }
    /* A MISSED FIELD GOAL IS A TURNOVER AT THE SPOT, which is what makes a long
     * attempt a real decision rather than a free roll. */
    this.setBanner('NO GOOD', 2);
    this.lastResult = {
      outcome: 'fieldGoalMiss', yards: 0, side, by: null, on: null,
      text: `Field goal missed from ${Math.round(distance)}`,
      turnover: true, points: 0, clockRuns: false,
    };
    this.phase = 'special';
    this.phaseTimer = FOOTBALL.huddlePause;
    this.pendingAfter = 'none';
    const dir = attackDir(side);
    this.lineOfScrimmage = clamp(this.lineOfScrimmage - dir * 7,
      FIELD.homeGoal + 1, FIELD.awayGoal - 1);
    this.changePossession(otherSide(side), 'Missed field goal');
  }

  private finishKickAt(land: number, kind: 'punt' | 'kickoff', text: string): void {
    const side = this.possession;
    const receiving = otherSide(side);
    const theirGoal = attackGoal(side);
    const dir = attackDir(side);
    // Into the end zone is a touchback: the ball comes out to the twenty-five.
    const touchback = (land - theirGoal) * dir >= 0;

    /* AND A KICK THAT LANDS IN THE FIELD IS RUN BACK.
     *
     * Simplified to one number, which is all a return needs to be here — but it
     * has to EXIST. Without it a sixty-two yard kickoff from the thirty-five
     * spots the ball on the receiving team's three, every single time, and every
     * drive in the game starts backed up against its own goal line. A returner's
     * legs decide how far it comes back; a punt comes back less than a kickoff
     * because a punt has hang time and a gunner arriving with it.
     */
    let spot: number;
    if (touchback) {
      spot = theirGoal - dir * 25;
    } else {
      const returner = starterAt(this.rosters[receiving], kind === 'kickoff' ? 'WR' : 'RB');
      const legs = returner?.attrs.speed ?? 60;
      const base = kind === 'kickoff' ? 17 : 5;
      const back = Math.max(0, base + (legs - 60) * 0.2 + this.rng.range(-5, 9));
      spot = clamp(land - dir * back, FIELD.homeGoal + 1, FIELD.awayGoal - 1);
    }
    this.lineOfScrimmage = spot;
    this.ballX = FIELD.centerX;
    this.setBanner(kind === 'kickoff' ? '' : text, 1.4);
    this.lastResult = {
      outcome: kind, yards: Math.round(Math.abs(land - this.lineOfScrimmage)),
      side, by: null, on: null, text, turnover: true, points: 0, clockRuns: false,
    };
    this.phase = 'special';
    this.phaseTimer = FOOTBALL.huddlePause;
    this.pendingAfter = 'none';
    this.changePossession(receiving, touchback ? 'Touchback' : text);
  }

  private ballLanded(): void {
    this.endPlay({
      outcome: 'tackle', yards: 0, side: this.possession, by: null, on: null,
      text: 'Down', turnover: false, points: 0, clockRuns: false,
    });
  }

  /* ------------------------------------------------------------- possession */

  private changePossession(to: Side, why: string): void {
    // A change of hands always stops it, whichever way the ball got there.
    this.clockRunning = false;
    this.possession = to;
    this.down = 1;
    this.setFirstDown();
    this.thrown = false;
    this.kickKind = 'none';
    this.say(why, 2);
    this.phase = this.phase === 'special' ? 'special' : 'dead';
    if (this.phaseTimer <= 0) this.phaseTimer = FOOTBALL.huddlePause;
  }

  private turnoverOnDowns(): void {
    this.events.emit('turnoverOnDowns', { side: this.possession });
    this.setBanner('TURNOVER ON DOWNS', 2);
    this.changePossession(otherSide(this.possession), 'Turnover on downs');
  }

  private delayOfGame(): void {
    // A penalty stops the clock until the ball is set again.
    this.clockRunning = false;
    const dir = attackDir(this.possession);
    this.lineOfScrimmage = clamp(this.lineOfScrimmage - dir * 5,
      FIELD.homeGoal + 1, FIELD.awayGoal - 1);
    this.toGo += 5;
    this.box[this.possession].penalties++;
    this.setBanner('DELAY OF GAME', 1.8);
    this.phase = 'playcall';
    this.playClock = FOOTBALL.playClock;
  }

  /* ------------------------------------------------------------- the kickoff */

  private openingKickoff(): void {
    // The away side kicks off to the home side to open the game.
    this.kickoffFrom('away');
    this.setBanner('KICKOFF', 1.6);
  }

  /* ================================================================ the clock */

  private updateBreak(dt: number): void {
    this.phaseTimer -= dt;
    if (this.phaseTimer > 0) return;
    if (this.quarter >= FOOTBALL.quarters && this.score.home !== this.score.away) {
      this.finish();
      return;
    }
    if (this.quarter >= FOOTBALL.quarters) {
      this.overtime++;
      this.quarter++;
      this.clock = FOOTBALL.overtimeSeconds;
      this.setBanner(`OVERTIME ${this.overtime}`, 2.2);
    } else {
      this.quarter++;
      this.clock = this.cfg.quarterSeconds;
      this.setBanner(this.quarter === 3 ? 'SECOND HALF' : `QUARTER ${this.quarter}`, 2);
      if (this.quarter === 3) {
        /* THE SECOND HALF IS KICKED OFF BY WHOEVER RECEIVED THE FIRST ONE, which
         * is the rule and is also why deferring is a real decision. The away side
         * opens the game by kicking, so the home side kicks to open the half. */
        this.timeouts = { home: 3, away: 3 };
        this.kickoffFrom('home');
        return;
      }
    }
    this.phase = 'playcall';
  }

  /** Line up a kickoff from this side's own thirty-five. */
  private kickoffFrom(side: Side): void {
    this.clockRunning = false;
    this.possession = side;
    this.lineOfScrimmage = attackGoal(side) - attackDir(side) * 65;
    this.ballX = FIELD.centerX;
    this.down = 1;
    this.toGo = 10;
    this.kickKind = 'kickoff';
    this.tryKind = 'none';
    this.thrown = false;
    this.setKickFormation();
    this.phase = 'presnap';
    this.playClock = FOOTBALL.playClock;
  }

  private endQuarter(): void {
    this.clockRunning = false;
    this.events.emit('quarterEnd', { quarter: this.quarter });
    if (this.quarter >= FOOTBALL.quarters && this.score.home !== this.score.away) {
      this.finish();
      return;
    }
    this.phase = 'quarterBreak';
    this.phaseTimer = 2.2;
    this.setBanner(
      this.quarter === 2 ? 'HALF TIME'
        : this.quarter >= FOOTBALL.quarters ? 'TIED — OVERTIME'
          : `END OF Q${this.quarter}`,
      2.2,
    );
  }

  private finish(): void {
    this.phase = 'final';
    this.ball.state = 'dead';
    this.setBanner('FINAL', 3);
    this.events.emit('gameEnd', {});
  }

  isFinal(): boolean {
    return this.phase === 'final';
  }

  /* ================================================================ the field */

  /**
   * ELEVEN AND ELEVEN, PUT WHERE THE PLAY SAYS.
   *
   * Built fresh each snap from the depth chart and the play, which is what lets
   * a tight end block on one down and run a seam on the next without anything
   * having to remember which he did last time.
   */
  private setFormation(): void {
    this.buildPlayers();
    const dir = attackDir(this.possession);
    const los = this.lineOfScrimmage;

    for (const p of this.players) {
      if (p.side === this.possession) {
        const route = p.route;
        /* MIRRORED FOR THE END BEING ATTACKED, so "stretch left" is the offence's
         * left in both directions rather than the screen's. Without this every
         * play in the book is its own mirror image for one of the two teams. */
        const split = (route?.splitX ?? 0) * dir;
        const back = route?.backfield ?? 0;
        p.setX = clampToField(this.ballX + split);
        p.setY = los - dir * (back || FIELD.lineSplit);
      } else {
        this.placeDefender(p);
      }

      /* HE WALKS TO THE LINE UNLESS HE IS MILES FROM IT.
       *
       * Between two downs of the same drive everybody is within a few yards of
       * where the next play wants him, so he jogs there during the play clock
       * and the picture never jumps. After a change of possession, a kick or a
       * score he is at the wrong end of the field entirely, and walking sixty
       * yards is not a transition, it is a wait — so that one snaps. */
      if (dist2(p.x, p.y, p.setX, p.setY) > 22) {
        p.x = p.setX;
        p.y = p.setY;
      }
      p.vx = 0;
      p.vy = 0;
      p.routeProgress = 0;
      p.pose = 'stance';
      p.engagedWith = null;
      p.blockTimer = 0;
      p.stunned = 0;
      p.hasBall = false;
    }
    this.assignCoverage();
  }

  /**
   * WHERE A DEFENDER STARTS, which is most of what a defensive call IS.
   *
   * The cushion decides whether a slant is open; the box load decides whether a
   * run has a hole; the deep safeties decide whether a go route has anybody over
   * the top. All three come off the play the coach called, so calling one really
   * does change the picture at the snap.
   */
  /**
   * Where a defender lines up. Written to his SET point rather than his
   * position, so he walks onto it with everybody else.
   */
  private placeDefender(p: FieldPlayer): void {
    const off = this.possession;
    const dir = attackDir(off);
    const los = this.lineOfScrimmage;
    const d = this.defensivePlay;
    const slot = p.slot as DefensiveSlot;

    /* MIRRORED WITH THE OFFENCE. The formation flips for the side attacking the
     * other way, so the defence lined up against it has to flip too or the
     * strong side of the offence meets the weak side of the defence. */
    const m = dir;
    const line = (x: number): void => {
      p.setX = clampToField(this.ballX + x * m);
      p.setY = los + dir * 1.2;
    };
    switch (slot) {
      case 'DE1': line(-5.2); break;
      case 'DT1': line(-1.6); break;
      case 'DT2': line(1.6); break;
      case 'DE2': line(5.2); break;
      case 'LB1':
        p.setX = clampToField(this.ballX - 5 * m);
        p.setY = los + dir * (5 - d.boxLoad * 0.9);
        break;
      case 'LB2':
        p.setX = clampToField(this.ballX);
        p.setY = los + dir * (5 - d.boxLoad * 0.9);
        break;
      case 'LB3':
        p.setX = clampToField(this.ballX + 5 * m);
        p.setY = los + dir * (5 - d.boxLoad * 0.9);
        break;
      case 'CB1':
        p.setX = clampToField(this.ballX - 17 * m);
        p.setY = los + dir * d.cushion;
        break;
      case 'CB2':
        p.setX = clampToField(this.ballX + 17 * m);
        p.setY = los + dir * d.cushion;
        break;
      case 'S1':
        p.setX = clampToField(this.ballX - (d.deep >= 2 ? 12 : 0) * m);
        p.setY = los + dir * (d.deep === 0 ? 7 : 14);
        break;
      default:
        p.setX = clampToField(this.ballX + (d.deep >= 2 ? 12 : 8) * m);
        p.setY = los + dir * (d.boxLoad >= 3 ? 6 : d.deep >= 2 ? 14 : 12);
        break;
    }
  }

  /**
   * WHO HAS WHO.
   *
   * Man coverage gives every eligible receiver a defender and rushes the rest.
   * Zone gives them areas. A blitz is man with more rushers and fewer defenders,
   * which is exactly what makes it a gamble rather than a free advantage.
   */
  private assignCoverage(): void {
    const off = this.possession;
    const def = otherSide(off);
    const d = this.defensivePlay;
    const dir = attackDir(off);
    const los = this.lineOfScrimmage;

    const eligible = this.players
      .filter((p) => p.side === off && p.route && p.route.kind !== 'block');
    const defenders = this.players.filter((p) => p.side === def);
    for (const p of defenders) {
      p.assignment = null;
      p.zone = null;
    }

    const group = (pre: string): FieldPlayer[] =>
      defenders.filter((p) => (p.slot as string).startsWith(pre));
    const line = group('DE').concat(group('DT'));
    const backers = group('LB');
    const corners = group('CB');
    const safeties = group('S');

    /* WHO RUSHES. The four down linemen always, and then whichever linebackers
     * the call sends — a blitz is literally "send more of them", and the men it
     * sends are men who are then not covering anybody. */
    const rushing = [...line, ...backers].slice(0, d.rushers);
    const rushes = (p: FieldPlayer): boolean => rushing.includes(p);
    const cover = defenders.filter((p) => !rushes(p));

    if (d.coverage === 'man' || d.coverage === 'blitz') {
      /* CORNERS ON THE WIDE MEN, safeties and backers inside, and whatever is
       * left over drops into the middle. Handing the outside receiver to a
       * defensive tackle — which the first version of this did, because it
       * assigned in whatever order the slots happened to be listed — is not a
       * difficulty setting, it is a broken defence. */
      const takers = [...corners, ...safeties, ...backers, ...line]
        .filter((p) => !rushes(p));
      const spare = Math.max(0, takers.length - eligible.length);
      const help = Math.min(d.deep, spare);
      const manOn = takers.slice(0, takers.length - help);

      /* EACH MAN TAKES THE RECEIVER HE IS STANDING NEXT TO.
       *
       * Assigning by width RANK instead — the corner takes the widest man, the
       * next corner the next widest — looks equivalent and is not: two receivers
       * split equally wide on opposite sides tie, and the tie is broken by
       * whatever order they happen to be in. That put a corner on the left
       * hash in man coverage on a receiver thirty-four yards away on the right,
       * every time one side of the formation mirrored. Measured, it was a third
       * of all completions going for twenty or more yards after the catch with
       * no defender inside ten yards of the ball.
       *
       * Nearest-first is also just what a defence does, and it cannot come apart
       * when a formation flips. */
      const unclaimed = [...eligible];
      for (const p of manOn) {
        let best = -1;
        let near = Infinity;
        for (let i = 0; i < unclaimed.length; i++) {
          /* MEASURED FROM WHERE THEY WILL LINE UP, not from where they are
           * standing — which at the moment this runs is a huddle, because the
           * men now walk onto their spots rather than appearing on them.
           * Matching on the huddle put every corner on the wrong receiver and
           * put twenty-two yards an attempt back on the board. */
          const gap = dist2(p.setX, p.setY, unclaimed[i].setX, unclaimed[i].setY);
          if (gap < near) { near = gap; best = i; }
        }
        if (best >= 0) {
          p.assignment = unclaimed[best].uid;
          unclaimed.splice(best, 1);
        } else {
          p.zone = { x: this.ballX, y: los + dir * 8, radius: 9 };
        }
      }
      // Whatever help the call has left sits on top of everything.
      for (const p of takers.slice(manOn.length)) {
        p.zone = { x: this.ballX, y: los + dir * 20, radius: 15 };
      }
      return;
    }

    /* ZONE. The field is divided into areas and each man owns one, which is why
     * a zone is beaten by putting two men in one area and never by speed alone.
     *
     * WHICH men go deep is the call itself: two safeties in cover two, a safety
     * and both corners in cover three. Taking "the last few in the list" instead
     * puts a corner in the deep middle and a safety in the flat, and the defence
     * stops meaning what its name says.
     */
    const wanted = Math.max(1, Math.min(d.deep, cover.length - 1));
    const picked = wanted >= 3
      ? [...safeties.slice(0, 1), ...corners.slice(0, 2)]
      : safeties.slice(0, wanted);
    const deep = picked.filter((p) => p && !rushes(p));
    const under = cover.filter((p) => !deep.includes(p));

    const spreadOut = (men: FieldPlayer[], width: number, depth: number, radius: number): void => {
      const sorted = [...men].sort((a, b) => a.setX - b.setX);
      sorted.forEach((p, idx) => {
        const t = sorted.length === 1 ? 0 : (idx / (sorted.length - 1) - 0.5) * 2;
        p.zone = {
          x: clampToField(this.ballX + t * width),
          y: los + dir * depth,
          radius,
        };
      });
    };
    spreadOut(deep, deep.length >= 3 ? 17 : 13, 18, deep.length >= 3 ? 11 : 15);
    spreadOut(under, 17, 7, 8.5);
  }

  /** Build the twenty-two, from the depth chart and the play. */
  private buildPlayers(): void {
    const off = this.possession;
    const def = otherSide(off);
    this.players = [];
    const routeFor = (slot: OffensiveSlot) =>
      this.offensivePlay.routes.find((r) => r.slot === slot)?.route ?? null;

    for (const slot of OFFENSIVE_SLOTS) {
      const pos = SLOT_POSITION[slot];
      const man = depthAt(this.rosters[off], pos)[SLOT_DEPTH[slot]]
        ?? starterAt(this.rosters[off], pos);
      if (!man) continue;
      this.players.push(this.makeFieldPlayer(man, off, slot, routeFor(slot)));
    }
    for (const slot of DEFENSIVE_SLOTS) {
      const pos = DEF_SLOT_POSITION[slot];
      const man = depthAt(this.rosters[def], pos)[DEF_SLOT_DEPTH[slot]]
        ?? starterAt(this.rosters[def], pos);
      if (!man) continue;
      this.players.push(this.makeFieldPlayer(man, def, slot, null));
    }
  }

  private makeFieldPlayer(
    data: Player, side: Side, slot: OffensiveSlot | DefensiveSlot,
    route: FieldPlayer['route'],
  ): FieldPlayer {
    return {
      uid: `${side}:${slot}:${data.id}`,
      data,
      side,
      slot,
      route,
      x: FIELD.centerX,
      y: this.lineOfScrimmage,
      setX: FIELD.centerX,
      setY: this.lineOfScrimmage,
      vx: 0, vy: 0,
      facing: attackDir(side) > 0 ? Math.PI / 2 : -Math.PI / 2,
      pose: 'stance',
      poseTimer: 0,
      stridePhase: 0,
      routeProgress: 0,
      react: 0,
      stamina: 100,
      stunned: 0,
      assignment: null,
      zone: null,
      engagedWith: null,
      blockTimer: 0,
      hasBall: false,
      flash: 0,
    };
  }

  /* ---------------------------------------------------------------- helpers */

  private integrate(p: FieldPlayer, dt: number): void {
    p.x = clampToField(p.x + p.vx * dt);
    p.y = clamp(p.y + p.vy * dt, -4, FIELD.length + 4);
    p.flash = Math.max(0, p.flash - dt);
    p.poseTimer = Math.max(0, p.poseTimer - dt);
    const pace = Math.hypot(p.vx, p.vy);
    p.stridePhase = (p.stridePhase + pace * dt * 2.1) % (Math.PI * 2);
    if (pace > 0.4) {
      const want = Math.atan2(p.vy, p.vx);
      let d = want - p.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.facing += d * Math.min(1, FOOTBALL.turnRate * dt);
    }
  }

  giveBall(p: FieldPlayer): void {
    for (const q of this.players) q.hasBall = false;
    p.hasBall = true;
    this.ball.carrier = p.uid;
    this.ball.state = 'held';
    this.ball.x = p.x;
    this.ball.y = p.y;
    this.ball.z = 2.4;
    p.flash = 0.3;
  }

  /** How long this man takes to react, from his awareness and the difficulty. */
  private reactionFor(p: FieldPlayer): number {
    const iq = clamp(p.data.attrs.awareness / 99, 0, 1);
    return (0.1 + (1 - iq) * 0.22) * clamp(this.cfg.difficulty.reaction, 0.4, 2.2);
  }

  /**
   * A TIMEOUT.
   *
   * Three a half, and the whole of their value is that they STOP THE CLOCK —
   * which is only worth anything because the clock otherwise runs through the
   * huddle. Callable when the ball is dead, which is when a real one is called,
   * and never when there is nothing to stop.
   */
  canCallTimeout(side: Side): boolean {
    if (this.timeouts[side] <= 0) return false;
    if (this.phase !== 'dead' && this.phase !== 'presnap' && this.phase !== 'playcall') return false;
    return this.clockRunning || this.phase === 'presnap';
  }

  callTimeout(side: Side): boolean {
    if (!this.canCallTimeout(side)) return false;
    this.timeouts[side] -= 1;
    this.clockRunning = false;
    this.playClock = FOOTBALL.playClock;
    this.presnapTime = 0;
    this.setBanner('TIMEOUT', 1.6);
    this.say(`${side === 'home' ? this.cfg.home.team.name : this.cfg.away.team.name} take one`, 2);
    this.events.emit('whistle', {});
    return true;
  }

  /**
   * AND THE COMPUTER SPENDS ITS OWN.
   *
   * Two cases, and they are the only two that matter: stopping the clock when
   * it is behind late, and stopping it on defence to get the ball back. How
   * well it judges the moment is its clock sense, which is coaching.
   */
  private considerAiTimeout(): void {
    if (this.clock > 150 || this.quarter < 2) return;
    const sense = clamp(this.cfg.difficulty.clockSense, 0, 1);
    for (const side of ['home', 'away'] as const) {
      if (side === this.humanSide) continue;
      if (!this.canCallTimeout(side)) continue;
      const margin = this.score[side] - this.score[otherSide(side)];
      const attacking = this.possession === side;
      const wants = attacking
        ? margin <= 0 && this.clock < 80
        : margin < 0 && this.clock < 120;
      if (!wants) continue;
      if (this.rng.next() > sense * 0.7) continue;
      this.callTimeout(side);
      return;
    }
  }

  /** Take the defender nearest the ball. */
  switchDefender(): void {
    const side = this.humanSide;
    if (side === null || side === this.possession || this.offenseOnly) return;
    const near = this.nearestTo(side, this.ball.x, this.ball.y);
    if (near) {
      this.controlled[side] = near;
      near.flash = 0.3;
    }
  }

  nearestTo(side: Side, x: number, y: number): FieldPlayer | null {
    let best: FieldPlayer | null = null;
    let near = Infinity;
    for (const p of this.players) {
      if (p.side !== side) continue;
      const d = dist2(p.x, p.y, x, y);
      if (d < near) { near = d; best = p; }
    }
    return best;
  }

  playerInSlot(side: Side, slot: OffensiveSlot | DefensiveSlot): FieldPlayer | null {
    return this.players.find((p) => p.side === side && p.slot === slot) ?? null;
  }

  byUid(uid: string | null): FieldPlayer | null {
    if (!uid) return null;
    return this.players.find((p) => p.uid === uid) ?? null;
  }

  statFor(p: FieldPlayer): StatLine {
    return this.statForId(p.data.id);
  }

  /** For the specialists, who kick without ever being one of the twenty-two. */
  statForId(id: string): StatLine {
    let s = this.stats.get(id);
    if (!s) { s = emptyStatLine(); this.stats.set(id, s); }
    return s;
  }

  nameOf(p: FieldPlayer): string {
    return `${p.data.first} ${p.data.last}`;
  }

  setBanner(text: string, seconds: number): void {
    this.banner = text;
    this.bannerTimer = seconds;
  }

  say(text: string, seconds = 2): void {
    this.message = text;
    this.messageTimer = seconds;
  }

  /**
   * TRUE WHEN THE ENGINE IS PLAYING ITSELF and nobody is waiting on a button.
   *
   * Either nobody is coaching at all, or somebody is coaching offence only and
   * the other lot have the ball. The screen reads it too, to run the clock on
   * faster through a drive the person is watching rather than playing.
   */
  get autoPlaying(): boolean {
    if (this.humanSide === null) return true;
    return this.offenseOnly && this.possession !== this.humanSide;
  }

  /** The down-and-distance line, as a scoreboard says it. */
  get downText(): string {
    const ord = ['1st', '2nd', '3rd', '4th'][this.down - 1] ?? `${this.down}th`;
    const goal = yardsToGoal(this.lineOfScrimmage, this.possession) <= this.toGo;
    return `${ord} & ${goal ? 'Goal' : this.toGo}`;
  }

  get spot(): string {
    return spotText(this.lineOfScrimmage, this.possession);
  }

  get clockText(): string {
    const total = Math.max(0, Math.ceil(this.clock));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /**
   * Resume after a score or a kick, which is what `pendingAfter` is for.
   * Returns the phase it landed in, so the caller can tell a kickoff from a
   * huddle without asking a narrowed field what it is.
   */
  resumeAfterSpecial(): GamePhase {
    const next = this.pendingAfter;
    this.pendingAfter = 'none';
    if (next === 'try') {
      this.beginTry(this.chooseTry());
      return this.phase;
    }
    if (next === 'kickoff' || next === 'freeKick') {
      this.kickoffFrom(this.possession);
      return this.phase;
    }
    this.phase = 'playcall';
    return this.phase;
  }

  /** Kick the extra point, or go for two. A scoreboard decision. */
  private chooseTry(): 'kick' | 'two' {
    const me = this.score[this.possession];
    const them = this.score[otherSide(this.possession)];
    const margin = me - them;
    const late = this.quarter >= FOOTBALL.quarters && this.clock < 300;
    if (!late) return 'kick';
    // The classic two-point chart, reduced to the cases that actually come up.
    if (margin === -2 || margin === -10 || margin === 5) return 'two';
    return 'kick';
  }

  /* ------------------------------------------------ hooks for the harnesses */

  /** Put the game in a situation, so a rule can be tested without playing to it. */
  setSituationForTest(o: {
    side?: Side; los?: number; down?: number; toGo?: number;
    clock?: number; quarter?: number; score?: [number, number];
  }): void {
    if (o.side) this.possession = o.side;
    if (o.los !== undefined) this.lineOfScrimmage = o.los;
    if (o.down !== undefined) this.down = o.down;
    if (o.clock !== undefined) this.clock = o.clock;
    if (o.quarter !== undefined) this.quarter = o.quarter;
    if (o.score) { this.score.home = o.score[0]; this.score.away = o.score[1]; }
    this.setFirstDown();
    if (o.toGo !== undefined) {
      this.toGo = o.toGo;
      this.firstDownLine = this.lineOfScrimmage + attackDir(this.possession) * o.toGo;
    }
    this.phase = 'playcall';
    this.kickKind = 'none';
  }

  /** How many men are within five yards of the ball, for an AI check. */
  boxCount(): number {
    const dir = attackDir(this.possession);
    let n = 0;
    for (const p of this.players) {
      if (p.side === this.possession) continue;
      const depth = (p.y - this.lineOfScrimmage) * dir;
      if (depth < 6 && Math.abs(p.x - this.ballX) < 9) n++;
    }
    return n;
  }

  get rngForAi(): Rng {
    return this.rng;
  }
}

export { SLOT_COUNT };
