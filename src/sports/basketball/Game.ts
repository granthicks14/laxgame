import { clamp, damp } from '../../core/math';
import { Emitter } from '../../core/events';
import { Rng } from '../../core/rng';
import {
  COURT, attackDir, attackRim, clampToCourt, floorDist, inOwnHalf, inPaint,
  inboundSpot, isThree, otherSide, outOfBounds, type Side, type Vec3,
} from './court';
import {
  BALL_RADIUS, createBall, dribbleExposure, launchAt, launchPass, stepBall,
  stepDribble, stepHeld, type Ball,
} from './ball';
import {
  GATHER_TIME, RELEASE_CENTRE, makeChance, releaseQuality, releaseWindow,
  releasePoint, solveShot, type ShotInput, type ShotKind,
} from './shot';
import { starters, type HoopsPlayer } from './data';
import { HOOPS } from './tuning';
import { neutralHoopsInput, type HoopsInput } from './input';
import {
  emptyLine, emptyTeamBox, type CourtPlayer, type GamePhase, type HoopsConfig,
  type HoopsEvents, type TeamBox,
} from './types';
import { driveAi, offBallAi, defendAi, pickPassTarget, wantsShot } from './ai';

/* ---------------------------------------------------------------------------
 * THE GAME
 * ---------------------------------------------------------------------------
 * Five on five, a twenty-four second clock, and a ten-foot rim.
 *
 * WHAT MAKES THIS NOT THE LACROSSE ENGINE. Lacrosse is a long field with a keeper
 * in front of a goal at ground level; possession changes hands a few times a
 * minute and a shot is a line across a plane. Basketball is a small floor with no
 * keeper, possession turning over every few seconds, and a target in the air that
 * can be hit from underneath. So:
 *
 *  - Z IS A REAL AXIS. Players jump; shots arc; blocks and rebounds are decided
 *    by reach, which is height plus leap. None of that existed in lacrosse.
 *  - EVERY MISS STARTS A NEW CONTEST. Rebounding is a phase of the sport with no
 *    lacrosse equivalent, and it is emergent here: the ball really bounces off
 *    the iron it was aimed at, and whoever is in position gets it.
 *  - THE CLOCK IS AN OPPONENT. A twenty-four second shot clock means the offence
 *    must create something, and the defence only has to survive.
 *  - CONTACT IS CONSTANT AND LEGAL UNTIL IT IS NOT. Fouls, the bonus, and
 *    fouling out are all in here, because a game without them is not basketball.
 *
 * The engine is deterministic from its seed: everything random comes from one
 * seeded stream, so the same game replays identically and the balance harnesses
 * measure something real.
 * ------------------------------------------------------------------------- */

const REACH_BONUS = 1.8;

export class HoopsGame {
  readonly cfg: HoopsConfig;
  readonly rng: Rng;
  readonly events = new Emitter<HoopsEvents>();
  readonly ball: Ball = createBall();

  players: CourtPlayer[] = [];
  teams: Record<Side, CourtPlayer[]> = { home: [], away: [] };

  phase: GamePhase = 'tip';
  /** Seconds left in the quarter. */
  clock: number;
  quarter = 1;
  shotClock: number = HOOPS.shotClock;
  /** Counts down dead-ball pauses. */
  phaseTimer = 0.9;
  overtime = 0;

  score: Record<Side, number> = { home: 0, away: 0 };
  box: Record<Side, TeamBox> = { home: emptyTeamBox(), away: emptyTeamBox() };

  possession: Side = 'home';
  /** Which player each side is steering. */
  controlled: Record<Side, CourtPlayer | null> = { home: null, away: null };
  humanSide: Side | null;

  /** A short line for the HUD: what just happened. */
  message = '';
  messageTimer = 0;
  /** The big banner: QUARTER, TIMEOUT, FINAL. */
  banner = '';
  bannerTimer = 0;

  /** Set while free throws are being taken. */
  freeThrows: {
    shooter: CourtPlayer;
    remaining: number;
    /** Whether possession changes after the last one. */
    side: Side;
    /**
     * True once the current attempt has left his hands. Without this the AI
     * re-shot the same free throw on every frame the ball was not in flight —
     * six hundred attempts a game, and a final score made entirely of them.
     */
    taken: boolean;
  } | null = null;

  inbound: { side: Side; x: number; y: number } | null = null;

  /** The last basket, so the HUD can show it and the camera can react. */
  lastBucket: { side: Side; points: number; shooter: string; at: number } | null = null;

  /** Who threw the last pass, and when — an assist expires. */
  private lastPass: { uid: string; at: number } | null = null;
  /** Exposed so the AI will not hand the ball straight back where it came from. */
  get lastPasserUid(): string | null {
    return this.lastPass && this.elapsed - this.lastPass.at < 1.1 ? this.lastPass.uid : null;
  }
  /** Game clock elapsed, for assist windows and the fast-break test. */
  private elapsed = 0;
  /** Set when a possession started from a turnover or a long rebound. */
  private breakSide: Side | null = null;
  private breakAt = 0;

  constructor(cfg: HoopsConfig) {
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed);
    this.clock = cfg.quarterSeconds;
    this.humanSide = cfg.humanSide;
    this.build();
    this.setBanner('TIP OFF', 1.4);
  }

  /* --------------------------------------------------------------- setup */

  private build(): void {
    for (const side of ['home', 'away'] as Side[]) {
      const setup = side === 'home' ? this.cfg.home : this.cfg.away;
      const five = starters(setup.roster);
      this.teams[side] = five.map((data, i) => this.makePlayer(data, side, i));
    }
    this.players = [...this.teams.home, ...this.teams.away];
    this.assignDefenders();
    this.positionForTip();
    this.ball.state = 'dead';
    this.possession = 'home';
  }

  private makePlayer(data: HoopsPlayer, side: Side, slot: number): CourtPlayer {
    return {
      uid: `${side}-${slot}-${data.id}`,
      data, side, slot, pos: data.pos,
      x: COURT.centerX, y: COURT.centerY, z: 0,
      vx: 0, vy: 0, vz: 0,
      facing: side === 'home' ? 0 : Math.PI,
      stamina: 100,
      pose: 'idle', poseTimer: 0,
      gather: 0, gathering: false, gatherKind: null, aiRelease: null, quickShot: 0,
      stealCool: 0, blockCool: 0, crossCool: 0, stun: 0, screenTimer: 0,
      fouls: 0, fouledOut: false,
      stat: emptyLine(),
      assignment: null,
    };
  }

  /** Man-to-man: each defender takes the opposite number at his own position. */
  private assignDefenders(): void {
    for (const side of ['home', 'away'] as Side[]) {
      const opp = this.teams[otherSide(side)];
      this.teams[side].forEach((p, i) => {
        p.assignment = opp[i]?.uid ?? null;
      });
    }
  }

  byUid(uid: string | null): CourtPlayer | null {
    if (!uid) return null;
    return this.players.find((p) => p.uid === uid) ?? null;
  }

  private positionForTip(): void {
    for (const side of ['home', 'away'] as Side[]) {
      const dir = attackDir(side);
      this.teams[side].forEach((p, i) => {
        // The two tallest jump; the rest ring the circle.
        const angle = (i / 5) * Math.PI * 2 + (side === 'home' ? 0 : Math.PI / 5);
        const r = i === 4 ? 3 : 11;
        p.x = COURT.centerX - dir * (i === 4 ? 2.4 : 0) + Math.cos(angle) * r * 0.5;
        p.y = COURT.centerY + Math.sin(angle) * r;
        p.z = 0; p.vx = 0; p.vy = 0; p.vz = 0;
        p.pose = 'idle';
      });
    }
    this.ball.x = COURT.centerX;
    this.ball.y = COURT.centerY;
    this.ball.z = 9;
    this.ball.state = 'dead';
    this.ball.carrier = null;
  }

  /* ---------------------------------------------------------------- queries */

  get carrier(): CourtPlayer | null {
    return this.byUid(this.ball.carrier);
  }

  get offense(): Side {
    return this.possession;
  }

  get defense(): Side {
    return otherSide(this.possession);
  }

  /** How high a player can reach right now: standing reach plus his jump. */
  reach(p: CourtPlayer): number {
    return p.data.heightIn / 12 + REACH_BONUS + p.z;
  }

  isFinal(): boolean {
    return this.phase === 'final';
  }

  /** The five on the floor for a side, for the HUD. */
  five(side: Side): CourtPlayer[] {
    return this.teams[side];
  }

  setBanner(text: string, seconds: number): void {
    this.banner = text;
    this.bannerTimer = seconds;
  }

  say(text: string, seconds = 2.2): void {
    this.message = text;
    this.messageTimer = seconds;
  }

  /* ------------------------------------------------------------- the loop */

  update(dt: number, input: HoopsInput): void {
    if (this.phase === 'final') return;

    this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    if (this.bannerTimer === 0) this.banner = '';
    this.messageTimer = Math.max(0, this.messageTimer - dt);
    if (this.messageTimer === 0) this.message = '';

    switch (this.phase) {
      case 'tip': this.updateTip(dt); break;
      case 'live': this.updateLive(dt, input); break;
      case 'inbound': this.updateInbound(dt, input); break;
      case 'madeBasket': this.updateDeadBall(dt); break;
      case 'freeThrow': this.updateFreeThrow(dt, input); break;
      case 'quarterBreak': this.updateBreak(dt); break;
    }
  }

  private updateTip(dt: number): void {
    this.phaseTimer -= dt;
    // The ball hangs at the top of the toss, then the better leaper takes it.
    this.ball.z = 9 + Math.sin(clamp(1 - this.phaseTimer / 0.9, 0, 1) * Math.PI) * 5;
    if (this.phaseTimer > 0) return;

    const jumper = (side: Side): CourtPlayer =>
      this.teams[side].reduce((best, p) =>
        (this.tipScore(p) > this.tipScore(best) ? p : best), this.teams[side][0]);
    const h = jumper('home');
    const a = jumper('away');
    const hs = this.tipScore(h) * this.rng.range(0.8, 1.2);
    const as = this.tipScore(a) * this.rng.range(0.8, 1.2);
    const winner = hs >= as ? 'home' : 'away';
    this.events.emit('tip', { side: winner });
    this.say(`${(winner === 'home' ? this.cfg.home : this.cfg.away).team.abbr} wins the tip`);
    this.startPossession(winner, true);
  }

  private tipScore(p: CourtPlayer): number {
    return p.data.heightIn * 1.3 + p.data.attrs.vertical + p.data.attrs.rebounding * 0.5;
  }

  private updateBreak(dt: number): void {
    this.phaseTimer -= dt;
    if (this.phaseTimer > 0) return;
    if (this.quarter >= HOOPS.quarters && this.score.home !== this.score.away) {
      this.finish();
      return;
    }
    if (this.quarter >= HOOPS.quarters && this.score.home === this.score.away) {
      this.overtime++;
      this.quarter++;
      this.clock = HOOPS.overtimeSeconds;
      this.setBanner(`OVERTIME ${this.overtime}`, 2.0);
    } else {
      this.quarter++;
      this.clock = this.cfg.quarterSeconds;
      this.setBanner(`QUARTER ${this.quarter}`, 1.8);
    }
    this.box.home.quarterFouls = 0;
    this.box.away.quarterFouls = 0;
    // Possession alternates by quarter, as it does after the opening tip.
    this.startPossession(this.quarter % 2 === 0 ? 'away' : 'home', false);
  }

  private updateDeadBall(dt: number): void {
    this.phaseTimer -= dt;
    this.driftPlayers(dt);
    if (this.phaseTimer > 0) return;
    if (this.freeThrows) {
      this.beginFreeThrow();
      return;
    }
    const side = this.inbound?.side ?? this.defense;
    this.startPossession(side, false);
  }

  /** Dead-ball drift: players walk back rather than freezing mid-stride. */
  private driftPlayers(dt: number): void {
    for (const p of this.players) {
      p.vx = damp(p.vx, 0, 6, dt);
      p.vy = damp(p.vy, 0, 6, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.z > 0) {
        p.vz -= 32.17 * dt;
        p.z = Math.max(0, p.z + p.vz * dt);
        if (p.z === 0) p.vz = 0;
      }
      p.stamina = clamp(p.stamina + HOOPS.staminaRegen * 1.6 * dt, 0, 100);
      if (p.pose !== 'idle' && p.poseTimer <= 0) p.pose = 'idle';
      p.poseTimer = Math.max(0, p.poseTimer - dt);
    }
  }

  /* ------------------------------------------------------------- possession */

  /** Hand the ball to a side and set everyone up. */
  private startPossession(side: Side, fromTip: boolean): void {
    this.possession = side;
    this.shotClock = HOOPS.shotClock;
    this.inbound = null;
    this.lastPass = null;
    this.ballWasAdvanced = false;

    const five = this.teams[side];
    // The best handler brings it up.
    const handler = five.reduce((best, p) =>
      (p.data.attrs.handle > best.data.attrs.handle ? p : best), five[0]);

    const spot = fromTip
      ? { x: COURT.centerX - attackDir(side) * 6, y: COURT.centerY }
      : this.inboundPlace(side);

    this.setFormation(side, spot);
    handler.x = spot.x;
    handler.y = spot.y;
    handler.z = 0;
    handler.vx = 0;
    handler.vy = 0;

    this.giveBall(handler, 'inbound');
    this.controlled[side] = handler;
    this.controlled[otherSide(side)] = this.defenderOn(handler);
    this.phase = 'live';
  }

  /** Where a side starts a possession that is not a tip: their own baseline. */
  private inboundPlace(side: Side): { x: number; y: number } {
    if (this.inbound) return { x: this.inbound.x, y: this.inbound.y };
    const dir = attackDir(side);
    return { x: COURT.centerX - dir * (COURT.centerX - 6), y: COURT.centerY };
  }

  /**
   * Five-out spacing, which is how a modern offence starts a possession: the
   * ball at the top, two wings, two corners. The defence matches up.
   */
  private setFormation(offSide: Side, ballSpot: { x: number; y: number }): void {
    const rim = attackRim(offSide);
    const dir = attackDir(offSide);
    const off = this.teams[offSide];
    const spots: { x: number; y: number }[] = [
      { x: rim.x - dir * 26, y: COURT.centerY },
      { x: rim.x - dir * 22, y: COURT.centerY - 17 },
      { x: rim.x - dir * 22, y: COURT.centerY + 17 },
      { x: rim.x - dir * 7, y: COURT.centerY - 21 },
      { x: rim.x - dir * 12, y: COURT.centerY + 8 },
    ];
    off.forEach((p, i) => {
      const s = spots[i] ?? spots[0];
      const c = clampToCourt(s.x, s.y, 2);
      p.x = c.x;
      p.y = c.y;
      p.z = 0; p.vx = 0; p.vy = 0; p.vz = 0;
      p.gathering = false;
      p.gather = 0;
      p.pose = 'idle';
    });

    // Defenders line up between their man and the basket they are protecting.
    for (const d of this.teams[otherSide(offSide)]) {
      const man = this.byUid(d.assignment);
      const target = man ?? off[0];
      const toRim = { x: rim.x - target.x, y: rim.y - target.y };
      const len = Math.max(0.1, Math.hypot(toRim.x, toRim.y));
      d.x = target.x + (toRim.x / len) * 3.2;
      d.y = target.y + (toRim.y / len) * 3.2;
      const c = clampToCourt(d.x, d.y, 2);
      d.x = c.x;
      d.y = c.y;
      d.z = 0; d.vx = 0; d.vy = 0; d.vz = 0;
      d.gathering = false;
      d.pose = 'defend';
    }
    void ballSpot;
  }

  private giveBall(p: CourtPlayer, reason: 'inbound' | 'catch' | 'rebound' | 'steal'): void {
    // CATCH AND SHOOT. Judged on the look he had as the ball arrived, not the one
    // he has after his man has closed out.
    if (reason === 'catch' || reason === 'rebound') {
      const { distance } = this.contestOn(p);
      const quality = this.shotQualityFor(p);
      const value = quality * (isThree(p.x, p.y, p.side) ? 3 : 2);
      if (distance > 4.4 && value > 0.86) p.quickShot = 0.42;
    }
    this.ball.carrier = p.uid;
    this.ball.lastTouch = p.uid;
    this.ball.lastSide = p.side;
    this.ball.state = 'dribble';
    this.ball.shot = null;
    this.ball.target = null;
    this.ball.age = 0;
    if (this.possession !== p.side) {
      this.possession = p.side;
      this.shotClock = reason === 'rebound' ? HOOPS.shotClockOffReb : HOOPS.shotClock;
      // A new possession starts with the ball wherever it is, and nothing about
      // where the previous team had advanced it applies any more.
      this.ballWasAdvanced = !inOwnHalf(p.x, p.side);
    }
    if (reason === 'steal' || reason === 'rebound') {
      this.controlled[p.side] = p;
      const d = this.defenderOn(p);
      if (d) this.controlled[otherSide(p.side)] = d;
    }
  }

  private defenderOn(p: CourtPlayer): CourtPlayer | null {
    return this.teams[otherSide(p.side)].find((d) => d.assignment === p.uid)
      ?? this.nearestOpponent(p);
  }

  private nearestOpponent(p: CourtPlayer): CourtPlayer | null {
    let best: CourtPlayer | null = null;
    let bd = Infinity;
    for (const o of this.teams[otherSide(p.side)]) {
      const d = floorDist(p.x, p.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  /** The closest defender to a player, and how far away he is. */
  contestOn(p: CourtPlayer): { defender: CourtPlayer | null; distance: number } {
    let best: CourtPlayer | null = null;
    let bd = Infinity;
    for (const o of this.teams[otherSide(p.side)]) {
      if (o.fouledOut) continue;
      const d = floorDist(p.x, p.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    return { defender: best, distance: bd };
  }

  /* ------------------------------------------------------------------- live */

  private updateLive(dt: number, input: HoopsInput): void {
    // The clock. It stops for a whistle, and it stops when the ball is dead.
    this.clock -= dt;
    this.elapsed += dt;
    for (const p of this.players) p.stat.seconds += dt;

    // THE SHOT CLOCK RUNS FOR THE WHOLE POSSESSION. It used to tick only while
    // somebody was dribbling, which meant a team that passed the ball around the
    // arc was never under any pressure at all: one game went four hundred
    // seconds with three hundred and twenty-seven passes and five shots. The
    // clock stops for a dead ball and nothing else, which is the actual rule.
    if (this.ball.state !== 'dead') {
      this.shotClock -= dt;
      if (this.shotClock <= 0) {
        this.violation('SHOT CLOCK', this.possession);
        return;
      }
    }

    // Decide what everybody is doing.
    const human = this.humanSide;
    for (const p of this.players) {
      if (p.fouledOut) continue;
      const isHuman = human !== null && this.controlled[p.side] === p && p.side === human;
      if (isHuman) this.steerHuman(p, input, dt);
      else this.steerAi(p, dt);
    }

    for (const p of this.players) this.integrate(p, dt);
    this.separate();

    this.updateBall(dt);
    this.checkBackcourt();
    this.watchdog(dt);

    if (this.clock <= 0) {
      this.endQuarter();
      return;
    }
  }

  /** How long the ball has been live with nobody able to do anything about it. */
  private idleBall = 0;

  /**
   * THE BACKSTOP. A live phase must never sit on a ball nobody can play — a dead
   * ball with no inbound pending, or a loose ball rolling in a corner that no
   * rebounder wants. Both of those have happened, and both cost a quarter of a
   * game before anything noticed. If the ball is unplayable for three seconds it
   * is put back in play, and the HUD says why.
   */
  private watchdog(dt: number): void {
    const b = this.ball;
    const playable = b.carrier !== null
      || b.state === 'shot'
      || b.state === 'pass'
      || (b.state === 'loose' && (Math.hypot(b.vx, b.vy) > 0.6 || b.z > 1));
    if (playable) {
      this.idleBall = 0;
      return;
    }
    this.idleBall += dt;
    if (this.idleBall < 3) return;
    this.idleBall = 0;
    const spot = inboundSpot(b.x, b.y);
    this.say('Held ball — reset', 1.6);
    this.deadBall(this.defense, spot.x, spot.y, HOOPS.inboundPause);
  }

  /* ---------------------------------------------------------- human control */

  private steerHuman(p: CourtPlayer, input: HoopsInput, dt: number): void {
    if (p.stun > 0) {
      p.stun -= dt;
      p.vx = damp(p.vx, 0, 9, dt);
      p.vy = damp(p.vy, 0, 9, dt);
      return;
    }

    const hasBall = this.ball.carrier === p.uid;

    if (input.switchPressed && !hasBall) this.switchControl(p.side);

    // Movement is the same on both sides of the ball.
    this.drive(p, input.moveX, input.moveY, input.sprint, dt);

    if (hasBall) {
      this.humanOffense(p, input, dt);
    } else if (this.possession === p.side) {
      // Off the ball: a cut is just movement, and the screen call is the one
      // thing a team-mate can be asked for.
      if (input.screenPressed) this.callScreen(p);
      if (input.shootHeld && this.ball.state === 'shot') this.tryJump(p);
    } else {
      this.humanDefense(p, input, dt);
    }
  }

  private humanOffense(p: CourtPlayer, input: HoopsInput, dt: number): void {
    if (input.screenPressed) this.callScreen(p);

    if (input.crossPressed && p.crossCool <= 0) this.crossover(p, input);

    // THE SHOT. Hold to gather, release in the window.
    if (input.shootHeld && !p.gathering) this.beginGather(p);
    if (p.gathering) {
      p.gather += dt / GATHER_TIME;
      // Holding for ever is a heave, not a stuck state.
      if (p.gather >= 1.28) {
        this.releaseShot(p);
      } else if (input.shootReleased) {
        this.releaseShot(p);
      }
      return;
    }
    if (input.shootReleased && !p.gathering) {
      // A tap with no hold: treat it as a rushed release rather than nothing.
      this.beginGather(p);
      p.gather = 0.12;
      this.releaseShot(p);
      return;
    }

    if (input.passPressed) this.humanPass(p, input);
  }

  private humanDefense(p: CourtPlayer, input: HoopsInput, dt: number): void {
    void dt;
    p.pose = p.pose === 'jump' || p.poseTimer > 0 ? p.pose : 'defend';
    if (input.passPressed) this.trySteal(p);
    if (input.shootHeld) this.tryJump(p);
  }

  /** Human pass: to whoever the stick is pointing at, else the best option. */
  private humanPass(p: CourtPlayer, input: HoopsInput): void {
    const mates = this.teams[p.side].filter((m) => m !== p && !m.fouledOut);
    if (!mates.length) return;
    let target = mates[0];
    const aiming = Math.hypot(input.moveX, input.moveY) > 0.25;
    if (aiming) {
      // Best alignment with the stick, weighted so a nearby man in roughly the
      // right direction beats a distant one dead on it.
      let bestScore = -Infinity;
      for (const m of mates) {
        const dx = m.x - p.x;
        const dy = m.y - p.y;
        const d = Math.max(0.5, Math.hypot(dx, dy));
        const align = (dx / d) * input.moveX + (dy / d) * input.moveY;
        const score = align * 2.2 - d * 0.02;
        if (score > bestScore) { bestScore = score; target = m; }
      }
    } else {
      target = pickPassTarget(this, p) ?? mates[0];
    }
    this.throwPass(p, target);
  }

  switchControl(side: Side): void {
    const ballAt = this.carrier;
    const anchor = ballAt ?? this.byUid(this.ball.lastTouch);
    const from = anchor ? { x: anchor.x, y: anchor.y } : { x: this.ball.x, y: this.ball.y };
    const current = this.controlled[side];
    const options = this.teams[side].filter((p) => !p.fouledOut && p !== current);
    if (!options.length) return;
    const next = options.reduce((best, p) =>
      (floorDist(p.x, p.y, from.x, from.y) < floorDist(best.x, best.y, from.x, from.y) ? p : best),
    options[0]);
    this.controlled[side] = next;
  }

  /* ------------------------------------------------------------------- AI */

  private steerAi(p: CourtPlayer, dt: number): void {
    if (p.stun > 0) {
      p.stun -= dt;
      p.vx = damp(p.vx, 0, 9, dt);
      p.vy = damp(p.vy, 0, 9, dt);
      return;
    }
    // A shot already going up finishes on the release the AI committed to, so it
    // is held to the same window a human is.
    if (p.gathering) {
      p.gather += dt / GATHER_TIME;
      if (p.gather >= (p.aiRelease ?? 1.2) || p.gather >= 1.28) {
        p.aiRelease = null;
        this.releaseShot(p);
      }
      return;
    }
    if (this.ball.carrier === p.uid) driveAi(this, p, dt);
    else if (this.possession === p.side) offBallAi(this, p, dt);
    else defendAi(this, p, dt);
  }

  /* ------------------------------------------------------- what the AI may do
   *
   * The AI has no private verbs. It shoots, jumps and reaches in through the
   * same three methods the human's buttons call, so there is no second set of
   * rules for it to play by — a difficulty setting can change WHEN it does these
   * things and never what they do.
   */

  /** Begin a shot, releasing at `at` along the gather. */
  startShot(p: CourtPlayer, at: number): void {
    if (p.gathering || this.ball.carrier !== p.uid) return;
    this.beginGather(p);
    p.aiRelease = clamp(at, 0.2, 1.25);
  }

  aiJump(p: CourtPlayer): void {
    this.tryJump(p);
  }

  /** Beat a man off the dribble, toward a point. */
  aiCrossover(p: CourtPlayer, toward: { x: number; y: number }): void {
    const dx = toward.x - p.x;
    const dy = toward.y - p.y;
    const d = Math.max(0.001, Math.hypot(dx, dy));
    // Attack past him rather than straight at him: pick the side he is not on.
    const { defender } = this.contestOn(p);
    let ax = dx / d;
    let ay = dy / d;
    if (defender) {
      const off = Math.atan2(ay, ax)
        + (this.rng.bool() ? 1 : -1) * this.rng.range(0.45, 0.95);
      ax = Math.cos(off);
      ay = Math.sin(off);
    }
    this.crossover(p, { ...neutralHoopsInput(), moveX: ax, moveY: ay });
  }

  aiCallScreen(p: CourtPlayer): void {
    this.callScreen(p);
  }

  /** Is somebody on this side already committed to setting a screen? */
  hasScreen(side: Side): boolean {
    return this.teams[side].some((p) => p.screenTimer > 0);
  }

  aiSteal(p: CourtPlayer): void {
    this.trySteal(p);
  }

  /* --------------------------------------------------------------- movement */

  /** Push a player in a direction. The only way anybody moves. */
  drive(p: CourtPlayer, mx: number, my: number, sprint: boolean, dt: number): void {
    const mag = Math.hypot(mx, my);
    const attrs = p.data.attrs;
    const tired = p.stamina < HOOPS.lowStamina ? 0.86 : 1;
    const carrying = this.ball.carrier === p.uid ? HOOPS.dribblePenalty : 1;
    let speed = (HOOPS.baseSpeed
      + (attrs.speed - HOOPS.ratingCentre) * HOOPS.speedPerRating) * tired * carrying;
    // Airborne players keep the momentum they left the floor with.
    if (p.z > 0.05) {
      p.vx *= 1;
      p.vy *= 1;
      return;
    }
    if (sprint && mag > 0.1 && p.stamina > 2) {
      speed *= HOOPS.sprintMultiplier;
      p.stamina = clamp(p.stamina - HOOPS.sprintDrain * dt, 0, 100);
    } else {
      p.stamina = clamp(p.stamina + HOOPS.staminaRegen * dt, 0, 100);
    }

    const accel = HOOPS.accelBase + (attrs.speed - HOOPS.ratingCentre) * HOOPS.accelPerRating;
    const tx = mag > 0.02 ? (mx / Math.max(mag, 1)) * speed : 0;
    const ty = mag > 0.02 ? (my / Math.max(mag, 1)) * speed : 0;
    p.vx = damp(p.vx, tx, accel, dt);
    p.vy = damp(p.vy, ty, accel, dt);

    if (mag > 0.1) {
      const want = Math.atan2(my, mx);
      let delta = want - p.facing;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      p.facing += clamp(delta, -HOOPS.turnRate * dt, HOOPS.turnRate * dt);
    }

    if (p.poseTimer <= 0 && p.z <= 0.05) {
      const moving = Math.hypot(p.vx, p.vy) > 1.2;
      p.pose = this.ball.carrier === p.uid
        ? (moving ? 'dribble' : 'dribble')
        : moving ? 'run' : (this.possession === p.side ? 'idle' : 'defend');
    }
  }

  private integrate(p: CourtPlayer, dt: number): void {
    p.poseTimer = Math.max(0, p.poseTimer - dt);
    p.quickShot = Math.max(0, p.quickShot - dt);
    p.stealCool = Math.max(0, p.stealCool - dt);
    p.blockCool = Math.max(0, p.blockCool - dt);
    p.crossCool = Math.max(0, p.crossCool - dt);
    p.screenTimer = Math.max(0, p.screenTimer - dt);

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (p.z > 0 || p.vz > 0) {
      p.vz -= 32.17 * dt;
      p.z += p.vz * dt;
      if (p.z <= 0) {
        p.z = 0;
        p.vz = 0;
        if (p.pose === 'jump' || p.pose === 'rebound') p.pose = 'idle';
      }
    }

    // The floor is the floor: nobody leaves it, and a shooter who drifts out of
    // bounds on a jumper lands out of bounds, which is a turnover in the sport
    // but reads as a bug in a game, so they are simply stopped.
    const c = clampToCourt(p.x, p.y, 0.8);
    if (c.x !== p.x) p.vx = 0;
    if (c.y !== p.y) p.vy = 0;
    p.x = c.x;
    p.y = c.y;
  }

  /** Bodies take up room. Without this, ten players stack on the ball. */
  private separate(): void {
    const n = this.players.length;
    for (let i = 0; i < n; i++) {
      const a = this.players[i];
      for (let j = i + 1; j < n; j++) {
        const b = this.players[j];
        if (Math.abs(a.z - b.z) > 2.2) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const min = 1.85;
        if (d2 > min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        // A screener holds his ground; so does a stronger man.
        const aHold = a.screenTimer > 0 ? 0.15 : 0.5 + (a.data.attrs.strength - b.data.attrs.strength) / 400;
        const bHold = b.screenTimer > 0 ? 0.15 : 1 - aHold;
        a.x -= nx * push * 2 * aHold;
        a.y -= ny * push * 2 * aHold;
        b.x += nx * push * 2 * bHold;
        b.y += ny * push * 2 * bHold;
      }
    }
  }

  /* ------------------------------------------------------------ the moves */

  /** A hard change of direction, or a step-back if you are moving toward your man. */
  private crossover(p: CourtPlayer, input: HoopsInput): void {
    const { defender, distance } = this.contestOn(p);
    p.crossCool = 1.05;
    const handle = p.data.attrs.handle;
    const mag = Math.hypot(input.moveX, input.moveY);
    const dirX = mag > 0.2 ? input.moveX / mag : Math.cos(p.facing);
    const dirY = mag > 0.2 ? input.moveY / mag : Math.sin(p.facing);

    // A burst in the chosen direction, scaled by how good the handle is.
    const burst = 13 + (handle - HOOPS.ratingCentre) * 0.09;
    p.vx = dirX * burst;
    p.vy = dirY * burst;
    p.pose = 'dribble';
    p.poseTimer = 0.24;
    this.events.emit('dribble', {});

    // If a defender is close and leaning the wrong way, he is beaten.
    if (defender && distance < 5) {
      const lean = (defender.vx * dirX + defender.vy * dirY);
      const beat = clamp(0.35 + (handle - defender.data.attrs.perimeterD) / 160 + lean * 0.035, 0.05, 0.9);
      if (this.rng.next() < beat) {
        defender.stun = 0.26;
        defender.pose = 'down';
        defender.poseTimer = 0.3;
        this.say(`${p.data.last} shakes him loose`, 1.2);
      }
    }
  }

  private callScreen(p: CourtPlayer): void {
    const mates = this.teams[p.side].filter((m) => m !== p && !m.fouledOut);
    if (!mates.length) return;
    // The biggest man who is not already busy comes up.
    const screener = mates.reduce((best, m) =>
      (m.data.attrs.strength > best.data.attrs.strength ? m : best), mates[0]);
    screener.screenTimer = 2.6;
    this.say(`${screener.data.last} comes up to screen`, 1.4);
  }

  /* ------------------------------------------------------------- the shot */

  /** Decide what kind of shot this is from where the feet are. */
  shotKindFor(p: CourtPlayer): 'jumper' | 'three' | 'layup' | 'dunk' {
    const rim = attackRim(p.side);
    const d = floorDist(p.x, p.y, rim.x, rim.y);
    if (d <= HOOPS.rimRange) {
      const power = (p.data.attrs.finishing + p.data.attrs.vertical) / 2;
      const { distance } = this.contestOn(p);
      return power >= HOOPS.dunkThreshold && distance > 2.4 ? 'dunk' : 'layup';
    }
    return isThree(p.x, p.y, p.side) ? 'three' : 'jumper';
  }

  private beginGather(p: CourtPlayer): void {
    p.gathering = true;
    p.gather = 0;
    p.gatherKind = this.shotKindFor(p);
    this.ball.state = 'held';
    p.pose = p.gatherKind === 'dunk' ? 'dunk' : p.gatherKind === 'layup' ? 'layup' : 'gather';
    p.poseTimer = 0.5;
    // A jump shot means jumping. A layup is a gather into the rim.
    if (p.gatherKind === 'jumper' || p.gatherKind === 'three') {
      p.vz = HOOPS.jumpSpeed;
      p.vx *= 0.35;
      p.vy *= 0.35;
    } else {
      p.vz = HOOPS.jumpSpeed * 0.9;
    }
  }

  /** Let go. This is where a possession is decided. */
  releaseShot(p: CourtPlayer): void {
    const kind = p.gatherKind ?? this.shotKindFor(p);
    p.gathering = false;
    const gather = p.gather;
    p.gather = 0;
    p.gatherKind = null;

    const rating = kind === 'three' ? p.data.attrs.three
      : kind === 'jumper' ? p.data.attrs.shooting
        : p.data.attrs.finishing;
    const release = releaseQuality(gather, rating);

    const { defender, distance } = this.contestOn(p);
    const rim = attackRim(p.side);
    const dist = floorDist(p.x, p.y, rim.x, rim.y);
    const inLine = defender
      ? floorDist(defender.x, defender.y, rim.x, rim.y) < dist
      : false;

    // A defender who has gone up in time can get a hand on it.
    if (defender && this.tryBlock(defender, p, kind)) return;

    // CONTACT AT THE RIM. Most free throws in basketball come from a body in the
    // way of a man going to the basket, not from a hack on the perimeter, so a
    // drive into a standing defender draws one.
    if ((kind === 'layup' || kind === 'dunk') && defender && distance < 3.4
        && defender.z < 1.2) {
      const strength = (p.data.attrs.strength + p.data.attrs.finishing) / 2;
      const discipline = (defender.data.attrs.interiorD + defender.data.attrs.iq) / 2;
      const chance = clamp(0.3 + (strength - discipline) / 300, 0.08, 0.5);
      if (this.rng.next() < chance) {
        // A shot that goes in anyway is an and-one, which the free-throw code
        // handles by shooting one.
        const scores = this.rng.next() < 0.34;
        if (scores) {
          const aid = this.assistFor(p);
          this.award(p, isThree(p.x, p.y, p.side) ? 3 : 2, aid ? this.byUid(aid) : null,
            kind, inPaint(p.x, p.y, p.side));
          p.stat.fga++;
          this.box[p.side].fga++;
          this.callFoulAndOne(defender, p);
        } else {
          p.stat.fga++;
          this.box[p.side].fga++;
          this.callFoul(defender, p, true, kind);
        }
        p.pose = kind === 'dunk' ? 'dunk' : 'layup';
        p.poseTimer = 0.4;
        return;
      }
    }

    const value = isThree(p.x, p.y, p.side) ? 3 : 2;
    const shotInput: ShotInput = {
      kind,
      distance: dist,
      release,
      rating,
      finishing: p.data.attrs.finishing,
      contestDistance: distance,
      contestRating: defender
        ? (defender.data.attrs.perimeterD + defender.data.attrs.interiorD) / 2
        : 0,
      contestInLine: inLine,
      moving: Math.hypot(p.vx, p.vy),
      fading: defender ? distance < 4 && !inLine : false,
    };

    const from = releasePoint(p.x, p.y, kind);
    from.z += p.z;
    const sol = solveShot(shotInput, p.side, from, this.rng);
    launchAt(this.ball, from, sol.target, sol.extraArc);
    this.ball.state = 'shot';
    this.ball.carrier = null;
    this.ball.lastTouch = p.uid;
    this.ball.lastSide = p.side;
    this.ball.shot = {
      shooterId: p.uid,
      side: p.side,
      value,
      distance: dist,
      intendedMake: sol.make,
      resolved: false,
      assistId: this.assistFor(p),
      kind,
      fromPaint: inPaint(p.x, p.y, p.side),
    };

    p.pose = kind === 'dunk' ? 'dunk' : kind === 'layup' ? 'layup' : 'shoot';
    p.poseTimer = 0.45;
    p.stat.fga++;
    this.box[p.side].fga++;
    if (value === 3) {
      p.stat.tpa++;
      this.box[p.side].tpa++;
    }
    this.events.emit('shot', { kind, distance: dist, quality: makeChance(shotInput) });
    this.shotClock = Math.max(this.shotClock, 0.1);
  }

  /** Who gets the assist if this goes in: the last passer, if it was recent. */
  private assistFor(shooter: CourtPlayer): string | null {
    if (!this.lastPass) return null;
    if (this.lastPass.uid === shooter.uid) return null;
    const passer = this.byUid(this.lastPass.uid);
    if (!passer || passer.side !== shooter.side) return null;
    // Two and a half seconds and one dribble's worth of time: past that it is
    // the shooter's own work.
    return this.elapsed - this.lastPass.at <= 2.5 ? this.lastPass.uid : null;
  }

  /* -------------------------------------------------------------- defence */

  /** Go up: at the ball to block it, at the rim to rebound. */
  private tryJump(p: CourtPlayer): void {
    if (p.z > 0.05 || p.blockCool > 0) return;
    p.vz = HOOPS.jumpSpeed * (0.85 + p.data.attrs.vertical / 260);
    p.pose = this.ball.state === 'shot' ? 'jump' : 'rebound';
    p.poseTimer = 0.5;
    p.blockCool = 0.35;
  }

  /**
   * A block. Decided at the moment of release, from reach and timing: a defender
   * who left the floor at the right time and is tall enough gets a hand on it.
   */
  private tryBlock(defender: CourtPlayer, shooter: CourtPlayer, kind: ShotKind): boolean {
    if (defender.z < 0.4) return false;
    const gap = floorDist(defender.x, defender.y, shooter.x, shooter.y);
    if (gap > HOOPS.blockRange) return false;

    const releaseZ = releasePoint(shooter.x, shooter.y, kind).z + shooter.z;
    const canReach = this.reach(defender) >= releaseZ - 0.6;
    if (!canReach) return false;

    const skill = defender.data.attrs.block;
    // Rising is the window; on the way down he is late.
    const rising = defender.vz > -2 ? 1 : 0.35;
    const near = clamp(1 - gap / HOOPS.blockRange, 0, 1);
    const chance = clamp(near * rising * (0.16 + (skill - 45) / 190), 0.01, 0.62);

    if (this.rng.next() >= chance) {
      // Late and airborne into a shooter is a foul.
      if (defender.vz < -3 && gap < 2.6 && this.rng.next() < HOOPS.blockFoulBase) {
        this.callFoul(defender, shooter, true, kind);
        return true;
      }
      return false;
    }

    defender.stat.blocks++;
    this.box[defender.side].blocks++;
    shooter.stat.fga++;
    this.box[shooter.side].fga++;
    this.events.emit('block', { by: defender.data.last });
    this.say(`${defender.data.last} blocks it`, 1.8);

    // The ball comes off the block hard and lives.
    const from = releasePoint(shooter.x, shooter.y, kind);
    this.ball.x = from.x;
    this.ball.y = from.y;
    this.ball.z = releaseZ - 0.4;
    const away = Math.atan2(shooter.y - defender.y, shooter.x - defender.x) + this.rng.range(-1, 1);
    const power = this.rng.range(9, 19);
    this.ball.vx = Math.cos(away) * power;
    this.ball.vy = Math.sin(away) * power;
    this.ball.vz = this.rng.range(1, 6);
    this.ball.state = 'loose';
    this.ball.carrier = null;
    this.ball.shot = null;
    this.ball.lastTouch = defender.uid;
    shooter.gathering = false;
    shooter.gather = 0;
    return true;
  }

  /** Reach in. Takes the ball off a careless handler, and gets called if late. */
  private trySteal(d: CourtPlayer): void {
    if (d.stealCool > 0) return;
    d.stealCool = HOOPS.stealCooldown;
    d.pose = 'defend';
    d.poseTimer = 0.2;

    const handler = this.carrier;
    // Reaching at a loose ball is just movement; reaching at a handler is a play.
    if (!handler || handler.side === d.side) return;
    const gap = floorDist(d.x, d.y, handler.x, handler.y);
    if (gap > HOOPS.stealRange) return;

    const exposure = dribbleExposure(this.ball);
    const skill = d.data.attrs.steal;
    const guard = handler.data.attrs.handle;
    const near = clamp(1 - gap / HOOPS.stealRange, 0, 1);
    // A real team gives the ball away on about one possession in twelve, and
    // steals are only part of that. Set three times higher than this, reaching in
    // ended nearly half of all possessions and the game was a scramble rather
    // than basketball.
    const chance = clamp(
      near * (0.03 + exposure * 0.1) * (0.75 + (skill - guard) / 130),
      0.002, 0.2,
    );

    if (this.rng.next() < chance) {
      d.stat.steals++;
      this.box[d.side].steals++;
      handler.stat.turnovers++;
      this.box[handler.side].turnovers++;
      this.events.emit('steal', { by: d.data.last });
      this.say(`${d.data.last} rips it away`, 1.8);
      this.breakSide = d.side;
      this.breakAt = this.elapsed;
      this.giveBall(d, 'steal');
      return;
    }

    // Missed. A reach-in on a handler in tight is how fouls happen.
    d.stun = HOOPS.stealWhiffStun;
    if (gap < 3.4) {
      const discipline = (d.data.attrs.iq + d.data.attrs.perimeterD) / 2;
      const foulChance = clamp(HOOPS.reachFoulBase - (discipline - 55) / 260, 0.08, 0.5);
      if (this.rng.next() < foulChance) this.callFoul(d, handler, false, null);
    }
  }

  /* ---------------------------------------------------------------- fouls */

  /** A foul on a shot that still went in: one free throw. */
  private callFoulAndOne(by: CourtPlayer, on: CourtPlayer): void {
    by.fouls++;
    by.stat.fouls++;
    this.box[by.side].fouls++;
    this.box[by.side].quarterFouls++;
    this.events.emit('foul', { by: by.data.last, shooting: true });
    this.events.emit('whistle', { reason: 'and one' });
    this.say(`${on.data.last} scores through the contact`, 2.2);
    if (by.fouls >= HOOPS.foulOutAt) {
      by.fouledOut = true;
      this.substitute(by);
    }
    this.beginFreeThrows(on, 1);
  }

  private callFoul(
    by: CourtPlayer, on: CourtPlayer, shooting: boolean, kind: ShotKind | null,
  ): void {
    by.fouls++;
    by.stat.fouls++;
    this.box[by.side].fouls++;
    this.box[by.side].quarterFouls++;
    this.events.emit('foul', { by: by.data.last, shooting });
    this.events.emit('whistle', { reason: 'foul' });

    if (by.fouls >= HOOPS.foulOutAt) {
      by.fouledOut = true;
      this.say(`${by.data.last} is out with six`, 2.6);
      this.substitute(by);
    } else {
      this.say(`Foul on ${by.data.last}${shooting ? ' — in the act' : ''}`, 2.2);
    }

    const inBonus = this.box[by.side].quarterFouls >= HOOPS.bonusAt;
    if (shooting) {
      const shots = kind === 'three' ? 3 : 2;
      this.beginFreeThrows(on, shots);
    } else if (inBonus) {
      this.say(`Foul on ${by.data.last} — two shots in the bonus`, 2.2);
      this.beginFreeThrows(on, 2);
    } else {
      // Side out. The offence keeps the ball and a fresh fourteen.
      const spot = inboundSpot(on.x, on.y);
      this.deadBall(on.side, spot.x, spot.y, HOOPS.inboundPause);
      this.shotClock = Math.max(this.shotClock, HOOPS.shotClockOffReb);
    }
  }

  /** A fouled-out player is replaced by the best man on the bench. */
  private substitute(out: CourtPlayer): void {
    const setup = out.side === 'home' ? this.cfg.home : this.cfg.away;
    const onFloor = new Set(this.teams[out.side].map((p) => p.data.id));
    const options = setup.roster
      .filter((p) => !onFloor.has(p.id))
      .sort((a, b) => b.overall - a.overall);
    // Same position first, then the best available.
    const pick = options.find((p) => p.pos === out.pos) ?? options[0];
    if (!pick) return;
    const replacement = this.makePlayer(pick, out.side, out.slot);
    replacement.x = out.x;
    replacement.y = out.y;
    replacement.assignment = out.assignment;
    const idx = this.teams[out.side].indexOf(out);
    this.teams[out.side][idx] = replacement;
    this.players = [...this.teams.home, ...this.teams.away];
    // Anyone guarding the man who left now guards his replacement.
    for (const d of this.teams[otherSide(out.side)]) {
      if (d.assignment === out.uid) d.assignment = replacement.uid;
    }
    if (this.controlled[out.side] === out) this.controlled[out.side] = replacement;
  }

  private beginFreeThrows(shooter: CourtPlayer, count: number): void {
    this.freeThrows = { shooter, remaining: count, side: shooter.side, taken: false };
    this.phase = 'madeBasket';
    this.phaseTimer = HOOPS.freeThrowPause;
    this.ball.state = 'dead';
    this.ball.carrier = null;
  }

  private beginFreeThrow(): void {
    const ft = this.freeThrows;
    if (!ft) return;
    this.phase = 'freeThrow';
    this.phaseTimer = 1.1;
    const shooter = ft.shooter.fouledOut
      ? this.teams[ft.side][0]
      : ft.shooter;
    ft.shooter = shooter;
    // Line everybody up along the lane.
    const rim = attackRim(shooter.side);
    const dir = attackDir(shooter.side);
    shooter.x = rim.x - dir * (COURT.freeThrowX - COURT.rimInset);
    shooter.y = COURT.centerY;
    shooter.z = 0; shooter.vx = 0; shooter.vy = 0; shooter.vz = 0;
    shooter.gathering = false;
    shooter.gather = 0;
    shooter.pose = 'idle';

    // On the lane, not beside it: the two nearest spots are rebounding spots, and
    // a free throw that misses has to be a live ball somebody can actually take.
    const laneSpots = [-1, 1, -1, 1];
    let li = 0;
    for (const p of this.players) {
      if (p === shooter) continue;
      const rowSide = laneSpots[li % laneSpots.length];
      const depth = 4.5 + Math.floor(li / 2) * 4;
      p.x = rim.x - dir * depth;
      p.y = COURT.centerY + rowSide * 7.6;
      p.z = 0; p.vx = 0; p.vy = 0; p.vz = 0;
      p.pose = 'idle';
      li++;
    }
    stepHeld(this.ball, shooter.x, shooter.y, 6.4);
    this.ball.state = 'held';
    this.ball.carrier = shooter.uid;
    this.say(`${shooter.data.last} at the line — ${ft.remaining} to shoot`, 2.0);
  }

  private updateFreeThrow(dt: number, input: HoopsInput): void {
    const ft = this.freeThrows;
    if (!ft) {
      this.phase = 'live';
      return;
    }
    this.phaseTimer -= dt;
    const shooter = ft.shooter;
    const isHuman = this.humanSide === shooter.side;

    // Once it has left his hands the attempt belongs to the ball, whatever it is
    // doing: in the air, off the iron, or rolling away.
    if (ft.taken) {
      this.updateBall(dt);
      this.driftPlayers(dt);
      if (this.ball.state === 'dead') return;
      /* A FREE THROW IS OVER THE MOMENT IT TOUCHES ANYTHING, or anybody has the
       * ball, or a few seconds have passed. All three, because each one of them
       * has left this phase pending for ever at some point during this build, and
       * a pending free throw is a hang that eats the rest of the game: the clock
       * does not run, nobody moves, and nothing can end it.
       *
       * A miss is a miss when it touches iron or the floor. It is also over if
       * somebody has picked the ball up, whatever it touched on the way. And the
       * timer is the backstop for anything neither of those catches. */
      const landed = this.ball.touchedIron
        || this.ball.z <= BALL_RADIUS + 0.06
        || this.ball.state === 'loose'
        || this.ball.carrier !== null
        || this.phaseTimer < -4;
      if (landed) this.missedFreeThrow();
      return;
    }

    if (this.phaseTimer > 0) {
      stepHeld(this.ball, shooter.x, shooter.y, 6.4);
      return;
    }

    // A human shoots his own free throws on the same release window he uses
    // everywhere else. The AI takes them on its rating.
    if (isHuman) {
      if (input.shootHeld && !shooter.gathering) {
        shooter.gathering = true;
        shooter.gather = 0;
        shooter.pose = 'gather';
      }
      if (shooter.gathering) {
        shooter.gather += dt / GATHER_TIME;
        if (shooter.gather >= 1.28 || input.shootReleased) {
          this.shootFreeThrow(shooter, shooter.gather);
        }
        return;
      }
      // Never leave him standing there for ever.
      if (this.phaseTimer < -6) this.shootFreeThrow(shooter, RELEASE_CENTRE - releaseWindow(shooter.data.attrs.freeThrow) * 1.4);
      stepHeld(this.ball, shooter.x, shooter.y, 6.4);
      return;
    }

    // AI: a release near the middle of its own window, jittered by the rating.
    const spread = (1 - shooter.data.attrs.freeThrow / 120) * 0.11;
    this.shootFreeThrow(shooter, RELEASE_CENTRE + this.rng.gauss(0, spread));
  }

  private shootFreeThrow(shooter: CourtPlayer, gather: number): void {
    shooter.gathering = false;
    shooter.gather = 0;
    if (this.freeThrows) this.freeThrows.taken = true;
    const rating = shooter.data.attrs.freeThrow;
    const release = releaseQuality(gather, rating);
    const from = releasePoint(shooter.x, shooter.y, 'freeThrow');
    const input: ShotInput = {
      kind: 'freeThrow',
      distance: floorDist(shooter.x, shooter.y, attackRim(shooter.side).x, attackRim(shooter.side).y),
      release,
      rating,
      finishing: shooter.data.attrs.finishing,
      contestDistance: 99,
      contestRating: 0,
      contestInLine: false,
      moving: 0,
      fading: false,
    };
    const sol = solveShot(input, shooter.side, from, this.rng);
    launchAt(this.ball, from, sol.target, sol.extraArc);
    this.ball.state = 'shot';
    this.ball.carrier = null;
    this.ball.lastTouch = shooter.uid;
    this.ball.lastSide = shooter.side;
    this.ball.shot = {
      shooterId: shooter.uid,
      side: shooter.side,
      value: 2,
      distance: input.distance,
      intendedMake: sol.make,
      resolved: false,
      assistId: null,
      kind: 'freeThrow',
      fromPaint: false,
    };
    shooter.pose = 'shoot';
    shooter.poseTimer = 0.5;
    shooter.stat.fta++;
    this.box[shooter.side].fta++;
    this.events.emit('shot', { kind: 'freeThrow', distance: input.distance, quality: makeChance(input) });
  }

  /* ---------------------------------------------------------------- the ball */

  private updateBall(dt: number): void {
    const carrier = this.carrier;

    if (carrier && (this.ball.state === 'dribble' || this.ball.state === 'held')) {
      if (carrier.gathering || this.ball.state === 'held') {
        const hand = releasePoint(carrier.x, carrier.y, carrier.gatherKind ?? 'jumper');
        stepHeld(this.ball, hand.x, hand.y, hand.z + carrier.z);
        this.ball.state = 'held';
      } else {
        stepDribble(
          this.ball, carrier.x, carrier.y, carrier.facing,
          Math.hypot(carrier.vx, carrier.vy), dt,
        );
        this.ball.state = 'dribble';
      }
      return;
    }

    const ev = stepBall(this.ball, dt, this.rng);
    if (ev.rim) this.events.emit('rim', {});
    if (ev.board) this.events.emit('board', {});

    if (ev.through) {
      this.scoreBasket();
      return;
    }

    if (ev.out) {
      this.ballOut();
      return;
    }

    // A shot that has come off the iron or the floor is a live rebound.
    if (this.ball.state === 'shot' && (this.ball.z <= BALL_RADIUS + 0.05 || this.ball.touchedIron)) {
      if (this.ball.shot && !this.ball.shot.resolved && this.ball.touchedIron) {
        // It missed. Nobody has it yet — the rebound decides who.
        this.ball.state = 'loose';
      } else if (this.ball.z <= BALL_RADIUS + 0.05) {
        this.ball.state = 'loose';
      }
    }

    this.checkCatches();
  }

  /** Anyone close enough, and tall enough, takes the ball. */
  private checkCatches(): void {
    const b = this.ball;
    if (b.state !== 'loose' && b.state !== 'pass' && b.state !== 'shot') return;
    // A SHOT IN FLIGHT BELONGS TO NOBODY. Without this, any player standing
    // under the arc with a hand up caught the ball on its way to the rim — which
    // is not goaltending, not a rebound, and not basketball. It made the whole
    // league shoot zero per cent. A shot becomes collectable the moment it has
    // touched iron, glass or floor, and not before.
    if (b.state === 'shot' && !b.touchedIron && b.z > BALL_RADIUS + 0.05) return;

    let best: CourtPlayer | null = null;
    let bestScore = -Infinity;
    for (const p of this.players) {
      if (p.fouledOut) continue;
      // A PASSER CANNOT CATCH HIS OWN PASS. The ball starts at his own chest, so
      // without this he is the nearest man to it on the very frame he lets go and
      // he takes it straight back — three hundred "passes" in a possession, the
      // ball never leaving one pair of hands, and not a single assist in a whole
      // game because the shooter was always also the passer.
      if (b.state === 'pass' && p.uid === b.lastTouch && b.age < 0.45) continue;
      const gap = floorDist(p.x, p.y, b.x, b.y);
      // A pass thrown TO you is far easier to take than one you are reaching for.
      // With both at an interceptor's reach, a receiver who had moved a step since
      // the pass was thrown simply missed it, and the ball ran out of bounds —
      // sixteen turnovers a game that were nobody's mistake.
      const radius = b.state === 'pass' && b.target === p.uid
        ? HOOPS.catchRadius * 1.9
        : b.state === 'pass'
          ? HOOPS.interceptRadius
          : HOOPS.catchRadius;
      if (gap > radius) continue;
      // Height matters: a ball ten feet up belongs to whoever can get to it.
      if (b.z > this.reach(p) + 0.4) continue;
      if (b.z < 0.1 && p.z > 2.5) continue;

      // Who wants it most: close, tall, and a rebounder.
      const score = (radius - gap) * 2
        + (b.state !== 'pass' ? p.data.attrs.rebounding / 40 + p.z * 0.6 : 0)
        + (b.state === 'pass' && b.target === p.uid ? 3 : 0);
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (!best) return;

    const wasShot = b.shot;
    const shooter = wasShot ? this.byUid(wasShot.shooterId) : null;

    // An intercepted pass is a turnover.
    if (b.state === 'pass' && best.side !== b.lastSide) {
      const passer = this.byUid(b.lastTouch);
      if (passer) {
        passer.stat.turnovers++;
        this.box[passer.side].turnovers++;
      }
      best.stat.steals++;
      this.box[best.side].steals++;
      this.events.emit('steal', { by: best.data.last });
      this.say(`${best.data.last} picks off the pass`, 1.8);
      this.breakSide = best.side;
      this.breakAt = this.elapsed;
      this.giveBall(best, 'steal');
      return;
    }

    // A missed shot collected is a rebound, and which kind matters.
    if (wasShot && !wasShot.resolved && b.touchedIron) {
      wasShot.resolved = true;
      const offensive = best.side === wasShot.side;
      if (offensive) {
        best.stat.offReb++;
        this.box[best.side].offReb++;
      } else {
        best.stat.defReb++;
        this.box[best.side].defReb++;
      }
      this.events.emit('rebound', { by: best.data.last, offensive });
      this.say(`${best.data.last} rebounds${offensive ? ' — second chance' : ''}`, 1.5);
      if (!offensive) {
        this.breakSide = best.side;
        this.breakAt = this.elapsed;
      }
      void shooter;
      this.giveBall(best, 'rebound');
      this.freeThrowContinue();
      return;
    }

    this.giveBall(best, b.state === 'pass' ? 'catch' : 'rebound');
    if (b.state === 'pass') this.events.emit('pass', {});
    this.freeThrowContinue();
  }

  /** A free throw that did not go in — or one that got away from the lane. */
  private missedFreeThrow(): void {
    const ft = this.freeThrows;
    if (!ft) return;
    // Somebody already has it: the attempt is finished either way, and the live
    // loop owns the ball from here.
    if (this.ball.carrier !== null) {
      this.freeThrows = null;
      this.phase = 'live';
      return;
    }
    this.events.emit('freeThrow', { made: false });
    ft.remaining--;
    if (ft.remaining > 0) {
      // Another to come: dead ball, line them up again.
      ft.taken = false;
      this.phase = 'madeBasket';
      this.phaseTimer = 0.85;
      this.ball.state = 'dead';
      this.ball.carrier = null;
      this.ball.shot = null;
      return;
    }
    // The last one missed, so it is live and whoever gets it gets it.
    this.freeThrows = null;
    this.phase = 'live';
  }

  /** After a free throw is collected, either shoot the next or play on. */
  private freeThrowContinue(): void {
    if (this.phase !== 'freeThrow') return;
    this.phase = 'live';
    this.freeThrows = null;
  }

  private throwPass(from: CourtPlayer, to: CourtPlayer): void {
    const speed = HOOPS.passSpeedMin
      + (from.data.attrs.passing / 99) * (HOOPS.passSpeedMax - HOOPS.passSpeedMin);
    // Lead the receiver: a pass to where he is standing arrives behind him.
    const lead = 0.22;
    const target: Vec3 = {
      x: to.x + to.vx * lead,
      y: to.y + to.vy * lead,
      z: 5.2,
    };
    const origin = { x: from.x, y: from.y, z: 5.6 };
    launchPass(this.ball, origin, target, speed, to.uid);
    this.ball.lastTouch = from.uid;
    this.ball.lastSide = from.side;
    this.lastPass = { uid: from.uid, at: this.elapsed };
    from.pose = 'pass';
    from.poseTimer = 0.28;
    this.events.emit('pass', {});
  }

  /** Exposed so the AI passes through exactly the same path a human does. */
  pass(from: CourtPlayer, to: CourtPlayer): void {
    this.throwPass(from, to);
  }

  /* ------------------------------------------------------------- scoring */

  private scoreBasket(): void {
    const shot = this.ball.shot;
    if (!shot || shot.resolved) {
      // Through the hoop with no shot attached: a tipped ball. Count it as two
      // for whoever touched it last, which is what the rule says.
      const toucher = this.byUid(this.ball.lastTouch);
      if (toucher) this.award(toucher, 2, null, 'tip', true);
      this.afterBasket(toucher?.side ?? this.possession);
      return;
    }
    shot.resolved = true;
    const shooter = this.byUid(shot.shooterId);
    if (!shooter) return;

    if (shot.kind === 'freeThrow') {
      shooter.stat.ftm++;
      shooter.stat.points++;
      this.box[shooter.side].ftm++;
      this.box[shooter.side].points++;
      this.score[shooter.side]++;
      this.events.emit('freeThrow', { made: true });
      this.say(`${shooter.data.last} — good`, 1.2);
      this.nextFreeThrowOrPlay(true);
      return;
    }

    const points = shot.value;
    const assist = shot.assistId ? this.byUid(shot.assistId) : null;
    this.award(shooter, points, assist, shot.kind, shot.fromPaint);
    if (!this.ball.touchedIron) {
      this.events.emit('swish', { side: shooter.side, points, shooter: shooter.data.last });
    }
    this.events.emit('bucket', {
      side: shooter.side, points, shooter: shooter.data.last,
      assist: assist?.data.last ?? null, kind: shot.kind,
    });
    this.afterBasket(shooter.side);
  }

  private award(
    shooter: CourtPlayer, points: number, assist: CourtPlayer | null, kind: string,
    fromPaint = false,
  ): void {
    shooter.stat.points += points;
    shooter.stat.fgm++;
    if (points === 3) {
      shooter.stat.tpm++;
      this.box[shooter.side].tpm++;
    }
    this.box[shooter.side].fgm++;
    this.box[shooter.side].points += points;
    this.score[shooter.side] += points;
    if (assist) {
      assist.stat.assists++;
      this.box[shooter.side].assists++;
    }
    if (fromPaint) this.box[shooter.side].paintPoints += points;
    // A basket inside four seconds of winning the ball back is a break.
    if (this.breakSide === shooter.side && this.elapsed - this.breakAt < 4.5) {
      this.box[shooter.side].fastBreak += points;
    }
    this.lastBucket = {
      side: shooter.side, points, shooter: shooter.data.last, at: this.elapsed,
    };
    const label = kind === 'dunk' ? 'DUNK' : points === 3 ? 'THREE' : '';
    this.say(
      `${shooter.data.last} ${kind === 'dunk' ? 'throws it down' : points === 3 ? 'from deep' : 'scores'}`
      + (assist ? ` (${assist.data.last})` : ''),
      2.0,
    );
    if (label) this.setBanner(label, 1.1);
    this.events.emit('crowd', { intensity: points === 3 || kind === 'dunk' ? 1 : 0.6 });
  }

  private nextFreeThrowOrPlay(made: boolean): void {
    const ft = this.freeThrows;
    if (!ft) {
      // Nothing to shoot and a dead ball in hand: put it back in play rather
      // than dropping into a live phase with nobody able to touch it.
      if (this.ball.state === 'dead') this.deadBall(this.defense, COURT.centerX, 1.4, 0.6);
      else this.phase = 'live';
      return;
    }
    ft.remaining--;
    if (ft.remaining > 0) {
      ft.taken = false;
      this.phase = 'madeBasket';
      this.phaseTimer = 0.9;
      this.ball.state = 'dead';
      this.ball.carrier = null;
      this.ball.shot = null;
      return;
    }
    this.freeThrows = null;
    if (made) {
      // Made the last one: the other side takes it out.
      this.deadBall(otherSide(ft.side), COURT.centerX, 1.4, HOOPS.inboundPause);
    } else {
      // Missed the last one: live rebound, which the ball physics is already
      // playing out, so there is nothing to do but let it happen.
      this.phase = 'live';
    }
  }

  private afterBasket(side: Side): void {
    if (this.clock <= 0) {
      this.endQuarter();
      return;
    }
    this.phase = 'madeBasket';
    this.phaseTimer = HOOPS.madeBasketPause;
    this.ball.state = 'dead';
    this.ball.carrier = null;
    // The other side takes it out from under the basket.
    const rim = attackRim(side);
    this.inbound = { side: otherSide(side), x: rim.x, y: COURT.centerY };
    this.breakSide = otherSide(side);
    this.breakAt = this.elapsed;
  }

  /* ----------------------------------------------------- misses and whistles */

  private ballOut(): void {
    const shot = this.ball.shot;
    if (shot && !shot.resolved) {
      shot.resolved = true;
      // Out of bounds off a miss without a rebound: the defence takes it.
      const spot = inboundSpot(this.ball.x, this.ball.y);
      this.deadBall(otherSide(shot.side), spot.x, spot.y, HOOPS.inboundPause);
      this.say('Out of bounds', 1.4);
      return;
    }
    const lastSide = this.ball.lastSide ?? this.possession;
    const toucher = this.byUid(this.ball.lastTouch);
    if (toucher && this.ball.state === 'pass') {
      toucher.stat.turnovers++;
      this.box[toucher.side].turnovers++;
    }
    const spot = inboundSpot(this.ball.x, this.ball.y);
    this.events.emit('whistle', { reason: 'out' });
    this.events.emit('turnover', { side: lastSide, reason: 'out of bounds' });
    this.say('Out of bounds', 1.4);
    this.deadBall(otherSide(lastSide), spot.x, spot.y, HOOPS.inboundPause);
  }

  private violation(label: string, against: Side): void {
    this.events.emit('whistle', { reason: label });
    this.events.emit('turnover', { side: against, reason: label });
    const handler = this.carrier;
    if (handler) {
      handler.stat.turnovers++;
      this.box[handler.side].turnovers++;
    } else {
      this.box[against].turnovers++;
    }
    this.setBanner(label, 1.5);
    this.deadBall(otherSide(against), COURT.centerX, 1.4, HOOPS.inboundPause);
  }

  /**
   * Over and back: once the ball is established in the frontcourt, it cannot go
   * home again.
   *
   * The flag has to be PER POSSESSION. When it was not, a team that had advanced
   * the ball left it set, and the next team — which starts every possession in
   * its own backcourt, because that is where the ball is inbounded — was called
   * for a violation the instant it touched the ball. Three hundred and fifty
   * backcourt calls a game, all of them nonsense, and they were most of the
   * turnovers in the box score.
   */
  private checkBackcourt(): void {
    const carrier = this.carrier;
    if (!carrier) return;
    const own = inOwnHalf(carrier.x, carrier.side);
    if (!own) {
      // A foot over the line does not establish it; a yard does.
      if (Math.abs(carrier.x - COURT.centerX) > 3) this.ballWasAdvanced = true;
      return;
    }
    // A yard back over, and only once the ball was genuinely established.
    if (this.ballWasAdvanced && Math.abs(carrier.x - COURT.centerX) > 2) {
      this.violation('BACKCOURT', carrier.side);
    }
  }

  private ballWasAdvanced = false;

  private deadBall(side: Side, x: number, y: number, pause: number): void {
    this.phase = 'madeBasket';
    this.phaseTimer = pause;
    this.ball.state = 'dead';
    this.ball.carrier = null;
    this.ball.shot = null;
    this.inbound = { side, x, y };
    this.ballWasAdvanced = false;
  }

  private updateInbound(dt: number, input: HoopsInput): void {
    void input;
    this.phaseTimer -= dt;
    this.driftPlayers(dt);
    if (this.phaseTimer <= 0) {
      const side = this.inbound?.side ?? this.possession;
      this.startPossession(side, false);
    }
  }

  private endQuarter(): void {
    this.clock = 0;
    this.box[this.possession].byQuarter[this.quarter - 1] = this.score[this.possession];
    this.events.emit('quarterEnd', { quarter: this.quarter });
    this.box.home.byQuarter[this.quarter - 1] = this.score.home
      - this.box.home.byQuarter.slice(0, this.quarter - 1).reduce((a, b) => a + b, 0);
    this.box.away.byQuarter[this.quarter - 1] = this.score.away
      - this.box.away.byQuarter.slice(0, this.quarter - 1).reduce((a, b) => a + b, 0);

    if (this.quarter >= HOOPS.quarters && this.score.home !== this.score.away) {
      this.finish();
      return;
    }
    this.phase = 'quarterBreak';
    this.phaseTimer = HOOPS.breakPause;
    this.ball.state = 'dead';
    this.ball.carrier = null;
    this.setBanner(
      this.quarter >= HOOPS.quarters ? 'TIED — OVERTIME' : `END OF Q${this.quarter}`,
      HOOPS.breakPause,
    );
  }

  private finish(): void {
    this.phase = 'final';
    this.ball.state = 'dead';
    this.ball.carrier = null;
    this.setBanner('FINAL', 3);
    this.events.emit('gameEnd', {});
  }

  /* --------------------------------------------------------- fast forward */

  /**
   * Run the rest of the game without anybody watching. Used by the pause menu's
   * simulate option and by the season, and it runs the SAME engine at the same
   * fixed step — there is no second model of a basketball game to disagree with
   * this one.
   */
  simulateRest(maxSeconds = 3600, quiet = true): void {
    const dt = 1 / 30;
    const wasHuman = this.humanSide;
    this.humanSide = null;
    // Quiet by default: a whole quarter of crowd noise and confetti arriving in
    // one frame is not a fast-forward, it is a mess. A harness that wants to
    // watch what happened asks for the events.
    this.events.muted = quiet;
    let t = 0;
    while (this.phase !== 'final' && t < maxSeconds) {
      this.update(dt, neutralHoopsInput());
      t += dt;
    }
    this.events.muted = false;
    this.humanSide = wasHuman;
    if (this.phase !== 'final') this.finish();
  }

  /** Where the shot clock stands, for the HUD. */
  get shotClockText(): string {
    return Math.max(0, this.shotClock).toFixed(this.shotClock < 5 ? 1 : 0);
  }

  get clockText(): string {
    const s = Math.max(0, this.clock);
    const m = Math.floor(s / 60);
    const rest = s - m * 60;
    return s < 60 ? `${rest.toFixed(1)}` : `${m}:${Math.floor(rest).toString().padStart(2, '0')}`;
  }

  /** Release meter state for the HUD: how far through the gather, and the window. */
  gatherState(): { active: boolean; gather: number; from: number; to: number } | null {
    const p = this.humanSide ? this.controlled[this.humanSide] : null;
    if (!p || !p.gathering) return null;
    const kind = p.gatherKind ?? 'jumper';
    const rating = kind === 'three' ? p.data.attrs.three
      : kind === 'jumper' ? p.data.attrs.shooting
        : p.data.attrs.finishing;
    const half = releaseWindow(rating);
    return {
      active: true,
      gather: clamp(p.gather, 0, 1.28),
      from: RELEASE_CENTRE - half,
      to: RELEASE_CENTRE + half,
    };
  }

  /** For the AI and the HUD: how good this shot would be right now. */
  shotQualityFor(p: CourtPlayer): number {
    const kind = this.shotKindFor(p);
    const rim = attackRim(p.side);
    const dist = floorDist(p.x, p.y, rim.x, rim.y);
    const { defender, distance } = this.contestOn(p);
    const rating = kind === 'three' ? p.data.attrs.three
      : kind === 'jumper' ? p.data.attrs.shooting
        : p.data.attrs.finishing;
    return makeChance({
      kind,
      distance: dist,
      release: 0.8,
      rating,
      finishing: p.data.attrs.finishing,
      contestDistance: distance,
      contestRating: defender
        ? (defender.data.attrs.perimeterD + defender.data.attrs.interiorD) / 2 : 0,
      contestInLine: defender
        ? floorDist(defender.x, defender.y, rim.x, rim.y) < dist : false,
      moving: Math.hypot(p.vx, p.vy),
      fading: false,
    });
  }

  /** Whether the AI would shoot from here, exposed for the harnesses. */
  aiWantsShot(p: CourtPlayer): boolean {
    return wantsShot(this, p);
  }

  /** True when this side is defending and outnumbered: a live break. */
  get inTransition(): boolean {
    return this.breakSide !== null && this.elapsed - this.breakAt < 3.2;
  }

  /** Shared with the AI so both sides read the same clock pressure. */
  get elapsedSeconds(): number {
    return this.elapsed;
  }

  outOfBoundsCheck(x: number, y: number): boolean {
    return outOfBounds(x, y);
  }
}
