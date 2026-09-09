import { Emitter } from '../core/events';
import { Rng } from '../core/rng';
import { clamp, dist, dist2, angleDelta, normalize } from '../core/math';
import {
  FIELD, SIM, QUARTERS, attackingGoal, defendingGoal, attackDir, otherSide,
  type Side, type Position,
} from '../data/constants';
import { DIFFICULTIES, type DifficultyProfile } from '../data/difficulty';
import { OFFENSE_STYLES, DEFENSE_STYLES } from '../data/tactics';
import { emptyStats, starters, faceoffMan, shortName, type PlayerData } from '../data/players';
import { areRivals } from '../data/teams';
import { coachEffects, EMPTY_STAFF, type CoachEffects } from '../league/coaching';
import { FIELD_SLOTS, faceoffWorld } from './formation';
import { createFaceoff, stepFaceoff, type FaceoffState } from './faceoff';
import { Commentary } from './commentary';
import { updateAI, updateGoalie, saveRadius } from './ai';

/** A team with no programme behind it coaches to the baseline. */
const NO_COACHING: CoachEffects = coachEffects(EMPTY_STAFF);
import { ReplayBuffer } from './replay';
import type {
  Ball, InputState, MatchConfig, MatchEvents, MatchPhase, MatchPlayer, ScoreEntry,
  ShotInfo, ShotOutcome, SlotKey, TeamMatchStats, TeamSetup,
} from './types';
import { emptyTeamStats, neutralInput } from './types';

const PLAYER_RADIUS = 0.62;
const GOAL_HEIGHT = 2; // yards (6 ft)
const CREASE_PAD = 0.15;

/**
 * The average overall of a typical high school squad. Every shooting, saving
 * and faceoff constant in this engine was tuned against players on that scale,
 * so it is the yardstick a higher level is measured back to.
 */
/**
 * The rating the shooting and save model was tuned against. Lives in SIM so
 * that Match and ai.ts read the same number — see `SIM.parReference`.
 */
const SHOOTING_REFERENCE = SIM.parReference;

export class Match {
  readonly cfg: MatchConfig;
  readonly events = new Emitter<MatchEvents>();
  readonly rng: Rng;
  readonly diff: DifficultyProfile;
  readonly commentary: Commentary;

  readonly setups: Record<Side, TeamSetup>;
  readonly teams: Record<Side, MatchPlayer[]> = { home: [], away: [] };
  players: MatchPlayer[] = [];

  ball: Ball;
  phase: MatchPhase = 'pregame';
  phaseTimer = 0;
  quarter = 1;
  clock = 0;
  shotClock: number = SIM.shotClock;
  overtimePeriod = 0;
  elapsed = 0;

  score: Record<Side, number> = { home: 0, away: 0 };
  stats: Record<Side, TeamMatchStats> = { home: emptyTeamStats(), away: emptyTeamStats() };
  scoring: ScoreEntry[] = [];
  lastGoal: ScoreEntry | null = null;

  controlled: Record<Side, MatchPlayer | null> = { home: null, away: null };
  humanSide: Side | null;
  /** Set while the human is manually steering; cleared by auto-switch logic. */
  private manualHold = 0;

  faceoff: FaceoffState | null = null;
  /** Side that should get possession on the next restart. */
  private restartSide: Side = 'home';
  private restartAt: { x: number; y: number } = { x: FIELD.centerX, y: FIELD.centerY };

  /** Rolling midfield rotation index so bench middies see the field. */
  private midRotation: Record<Side, number> = { home: 0, away: 0 };

  /** Transient banner shown by the HUD (e.g. "OFFSIDES", "SHOT CLOCK"). */
  banner: { text: string; timer: number; tone: 'big' | 'normal' } | null = null;
  /** Camera hint: something worth looking at (goal celebration point). */
  focus: { x: number; y: number } | null = null;

  /** Per-game form. Teams have good nights and bad ones; low-chemistry programs
   *  swing further. Worth a few rating points either way, which is what keeps a
   *  weaker team live in any single game. */
  readonly form: Record<Side, number> = { home: 0, away: 0 };
  /** Separate, larger swing for goaltending. A keeper standing on his head is the
   *  single biggest reason an underdog wins a lacrosse game. */
  readonly goalieForm: Record<Side, number> = { home: 0, away: 0 };
  /**
   * The standard this particular game is played to: the average overall of the
   * two squads on the field. Keepers are judged against it rather than against
   * an absolute number, because a 95 goalie facing 95 shooters is an ordinary
   * professional goalie, not an unbeatable high school one. Without this the
   * game gets LOWER scoring the higher up the ladder you go, which is backwards.
   */
  readonly par: number;

  /** The most recent shot, for on-screen feedback and for balance tooling. */
  lastShot: ShotInfo | null = null;

  /** Rolling highlight buffer. Fixed size, allocation-free after construction. */
  readonly replay = new ReplayBuffer(20);
  /** Playback position within the current clip, in clip-seconds. */
  replayTime = 0;
  replayDuration = 0;
  /** Current playback rate, so the HUD can show the slow-motion beat. */
  replaySpeed = 1;

  /** Practice drill scoring. Unused in a normal game. */
  practice = { reps: 0, success: 0 };
  private pendingPracticeResult: boolean | null = null;

  constructor(cfg: MatchConfig) {
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed ?? Date.now());
    this.diff = DIFFICULTIES[cfg.difficulty];
    this.commentary = new Commentary(this.rng.seed);
    this.setups = { home: cfg.home, away: cfg.away };
    const all = [...cfg.home.roster, ...cfg.away.roster];
    this.par = all.length ? all.reduce((n, p) => n + p.overall, 0) / all.length : SHOOTING_REFERENCE;
    this.humanSide = cfg.home.human ? 'home' : cfg.away.human ? 'away' : null;
    this.clock = cfg.quarterSeconds;

    this.ball = {
      x: FIELD.centerX, y: FIELD.centerY, z: 0, vx: 0, vy: 0, vz: 0,
      state: 'loose', carrier: null, lastCarrier: null, assistCandidate: null,
      assistTimer: 0, intendedTarget: null, lastSide: null, age: 0, onGoalCounted: false,
    };

    for (const side of ['home', 'away'] as Side[]) {
      const chem = this.setups[side].team.chemistry;
      const swing = 5.0 + Math.max(0, 82 - chem) / 5.5;
      this.form[side] = clamp(this.rng.gauss(0, swing), -9, 9);
      this.goalieForm[side] = clamp(this.rng.gauss(0, 0.095), -0.2, 0.2);
    }

    this.buildTeams();
    if (cfg.practice && this.isRepDrill) {
      this.startPracticeRep();
    } else {
      this.beginFaceoff(true);
    }
  }

  /* ------------------------------------------------------------ practice */

  get isPractice(): boolean {
    return !!this.cfg.practice;
  }

  private practiceOwner(): Side {
    const human = this.humanSide ?? 'home';
    return this.cfg.practice?.kind === 'defend' ? otherSide(human) : human;
  }

  /** True for the drills that run as a series of possessions from a set spot. */
  private get isRepDrill(): boolean {
    const k = this.cfg.practice?.kind;
    return k === 'shoot' || k === 'defend' || k === 'clear';
  }

  private startPracticeRep(): void {
    const side = this.practiceOwner();
    this.resetToFaceoffPositions();
    this.phase = 'restart';
    this.phaseTimer = 0.5;
    this.restartSide = side;
    // Start reps where the drill's skill actually lives: shooting and defending
    // start in the offensive half, clearing starts behind your own cage.
    const goal = attackingGoal(side);
    const dir = attackDir(side);
    const own = defendingGoal(side);
    const clearing = this.cfg.practice?.kind === 'clear';
    this.restartAt = clearing
      ? { x: own.x - dir * 5, y: FIELD.centerY + this.rng.range(-7, 7) }
      : { x: goal.x - dir * 19, y: FIELD.centerY + this.rng.range(-11, 11) };
    this.ball.state = 'loose';
    this.ball.carrier = null;
    this.ball.x = this.restartAt.x;
    this.ball.y = this.restartAt.y;
    this.ball.z = 0;
    this.ball.vx = 0; this.ball.vy = 0; this.ball.vz = 0;
    this.shotClock = SIM.shotClock;
  }

  /** End the current drill repetition. */
  private practiceRep(success: boolean): void {
    const cfg = this.cfg.practice;
    if (!cfg) return;
    this.practice.reps++;
    if (success) this.practice.success++;
    this.setBanner(success ? 'NICE!' : 'NEXT REP', success ? 'big' : 'normal', 1.0);
    if (cfg.reps && this.practice.reps >= cfg.reps) {
      this.finishGame();
      return;
    }
    this.startPracticeRep();
  }

  // ---------------------------------------------------------------- setup

  private buildTeams(): void {
    for (const side of ['home', 'away'] as Side[]) {
      const setup = this.setups[side];
      const eleven = starters(setup.roster);
      const fo = faceoffMan(setup.roster);
      const list: MatchPlayer[] = [];
      eleven.forEach((data, i) => {
        const slot = FIELD_SLOTS[i];
        // The faceoff specialist takes the M2 slot so he actually takes the draw.
        const chosen = slot === 'M2' && fo.pos === 'FO' ? fo : data;
        list.push(this.makePlayer(chosen, side, slot, i));
      });
      this.teams[side] = list;
    }
    this.players = [...this.teams.home, ...this.teams.away];
    this.resetToFaceoffPositions();
  }

  private makePlayer(data: PlayerData, side: Side, slot: SlotKey, index: number): MatchPlayer {
    const p: MatchPlayer = {
      uid: `${side}-${slot}-${data.id}`,
      data, side, pos: data.pos as Position, slot, index,
      x: FIELD.centerX, y: FIELD.centerY, vx: 0, vy: 0,
      facing: side === 'home' ? 0 : Math.PI,
      stamina: 100, stun: 0, beaten: 0, checkCd: 0,
      dodgeTimer: 0, dodgeCd: 0, dodgeX: 0, dodgeY: 0,
      windup: 0, windupIsPass: false, pickupLock: 0,
      aiThink: this.rng.range(0, 0.25), aiTargetX: FIELD.centerX, aiTargetY: FIELD.centerY,
      aiCut: 0, aiMark: 0, aiSliding: false, aiIntent: 'idle',
      screenTimer: 0, screenHold: 0,
      animPhase: this.rng.range(0, 6), animPose: 'idle', poseTimer: 0, flash: 0,
      stat: emptyStats(),
    };
    return p;
  }

  /** Swap in fresh middies between quarters so depth matters. */
  private rotateMidfield(side: Side): void {
    const setup = this.setups[side];
    const mids = setup.roster.filter((p) => p.pos === 'M').sort((a, b) => b.overall - a.overall);
    if (mids.length < 6) return;
    this.midRotation[side] = (this.midRotation[side] + 1) % 2;
    const offset = this.midRotation[side] * 3;
    const slots: SlotKey[] = ['M1', 'M2', 'M3'];
    const fo = faceoffMan(setup.roster);
    for (let i = 0; i < 3; i++) {
      const target = this.teams[side].find((p) => p.slot === slots[i]);
      if (!target) continue;
      if (slots[i] === 'M2' && fo.pos === 'FO') continue; // FOGO keeps the draw
      const next = mids[(offset + i) % mids.length];
      if (next && next.id !== target.data.id) {
        // Preserve accumulated stats on the outgoing player by keeping them in the list.
        const bench = this.benchStats.get(target.data.id) ?? emptyStats();
        this.benchStats.set(target.data.id, addInto(bench, target.stat));
        target.data = next;
        target.pos = next.pos as Position;
        target.stat = this.benchStats.get(next.id) ?? emptyStats();
        this.benchStats.delete(next.id);
        target.uid = `${side}-${slots[i]}-${next.id}`;
        target.stamina = clamp(target.stamina + 45, 0, 100);
      }
    }
  }

  private benchStats = new Map<string, ReturnType<typeof emptyStats>>();

  /** Final per-player stats keyed by PlayerData.id (includes rotated-out middies). */
  playerStats(): Map<string, ReturnType<typeof emptyStats>> {
    const out = new Map(this.benchStats);
    for (const p of this.players) {
      const prev = out.get(p.data.id);
      out.set(p.data.id, prev ? addInto({ ...prev }, p.stat) : { ...p.stat });
    }
    return out;
  }

  // ---------------------------------------------------------------- helpers

  teammatesOf(p: MatchPlayer): MatchPlayer[] {
    return this.teams[p.side];
  }
  opponentsOf(p: MatchPlayer): MatchPlayer[] {
    return this.teams[otherSide(p.side)];
  }
  /**
   * A keeper's rating for save purposes, re-centred on the scale the shooting
   * model was tuned against. A professional keeper is still better than a high
   * school one — his own squad's par pulls him back only as far as the shooters
   * he is facing.
   */
  keeperRating(g: MatchPlayer): number {
    return clamp(g.data.attrs.goalie - (this.par - SHOOTING_REFERENCE) * 0.85, 25, 99);
  }

  goalieOf(side: Side): MatchPlayer {
    return this.teams[side][0];
  }
  possessionSide(): Side | null {
    return this.ball.carrier ? this.ball.carrier.side : null;
  }
  /** What this side's coaching staff is worth, or nothing for a team with no
   *  programme behind it (quick games, practice, the AI's opponents). */
  coachingOf(side: Side): CoachEffects {
    return this.setups[side].coaching ?? NO_COACHING;
  }

  tacticsOf(side: Side) {
    return {
      off: OFFENSE_STYLES[this.setups[side].tactics.offense],
      def: DEFENSE_STYLES[this.setups[side].tactics.defense],
    };
  }
  /** Chemistry 0..1 used to nudge pass accuracy and off-ball spacing. */
  chemistryOf(side: Side): number {
    return clamp(this.setups[side].team.chemistry / 100, 0.4, 1);
  }
  isRivalry(): boolean {
    return this.cfg.rivalry ?? areRivals(this.cfg.home.team.id, this.cfg.away.team.id);
  }
  isFinal(): boolean {
    return this.phase === 'final';
  }
  /** True when the AI, not the human, is driving this player. */
  /** True while the match is being fast-forwarded: both benches are on AI. */
  autopilot = false;

  aiControls(p: MatchPlayer): boolean {
    if (this.autopilot) return true;
    if (!this.setups[p.side].human) return true;
    return this.controlled[p.side] !== p;
  }

  setBanner(text: string, tone: 'big' | 'normal' = 'normal', time = 1.6): void {
    this.banner = { text, timer: time, tone };
  }

  private say(key: Parameters<Commentary['say']>[0], gap?: number, tone: 'big' | 'normal' = 'normal'): void {
    const line = this.commentary.say(key, gap);
    if (line) this.events.emit('commentary', { text: line, tone });
  }

  // ---------------------------------------------------------------- phases

  private clearScreens(): void {
    for (const p of this.players) { p.screenTimer = 0; p.screenHold = 0; }
  }

  private resetToFaceoffPositions(): void {
    this.clearScreens();
    // Everything below teleports players, so any footage from before this point
    // would play back as a jump cut.
    this.replay.clear();
    for (const side of ['home', 'away'] as Side[]) {
      for (const p of this.teams[side]) {
        const pos = faceoffWorld(side, p.slot);
        p.x = pos.x; p.y = pos.y;
        p.vx = 0; p.vy = 0;
        p.stun = 0; p.beaten = 0; p.dodgeTimer = 0; p.windup = 0; p.pickupLock = 0;
        p.facing = side === 'home' ? 0 : Math.PI;
        p.animPose = 'idle';
      }
    }
    this.ball.x = FIELD.centerX;
    this.ball.y = FIELD.centerY;
    this.ball.z = 0;
    this.ball.vx = 0; this.ball.vy = 0; this.ball.vz = 0;
    this.ball.state = 'loose';
    this.ball.carrier = null;
    this.ball.intendedTarget = null;
    this.ball.assistCandidate = null;
  }

  private beginFaceoff(initial = false): void {
    this.resetToFaceoffPositions();
    this.phase = 'faceoff';
    this.phaseTimer = 0;
    this.shotClock = SIM.shotClock;
    this.focus = { x: FIELD.centerX, y: FIELD.centerY };

    const human = this.humanSide;
    const ai = human ? otherSide(human) : 'away';
    const humanFo = this.foRating(human ?? 'home');
    const aiFo = this.foRating(ai);
    this.faceoff = createFaceoff(this.rng, humanFo, aiFo, this.diff, human !== null);
    this.stats[human ?? 'home'].faceoffTakes++;
    this.stats[ai].faceoffTakes++;
    const hp = this.faceoffPlayer(human ?? 'home');
    const ap = this.faceoffPlayer(ai);
    hp.stat.faceoffTakes++;
    ap.stat.faceoffTakes++;
    if (initial) this.events.emit('whistle', {});
  }

  private faceoffPlayer(side: Side): MatchPlayer {
    return this.teams[side].find((p) => p.slot === 'M2') ?? this.teams[side][4];
  }
  private foRating(side: Side): number {
    return this.faceoffPlayer(side).data.attrs.faceoff;
  }

  private beginLive(): void {
    this.phase = 'live';
    this.phaseTimer = 0;
    this.faceoff = null;
    this.focus = null;
  }

  private beginRestart(side: Side, x: number, y: number, reason: string): void {
    const pr = this.cfg.practice;
    if (pr && this.isRepDrill) {
      this.practiceRep(pr.kind === 'defend' && side === (this.humanSide ?? 'home'));
      return;
    }
    this.restartSide = side;
    this.restartAt = {
      x: clamp(x, 1.5, FIELD.length - 1.5),
      y: clamp(y, 1.5, FIELD.width - 1.5),
    };
    this.phase = 'restart';
    this.phaseTimer = 0.75;
    this.shotClock = SIM.shotClock;
    this.ball.state = 'loose';
    this.ball.carrier = null;
    this.ball.vx = 0; this.ball.vy = 0; this.ball.vz = 0;
    this.ball.x = this.restartAt.x;
    this.ball.y = this.restartAt.y;
    this.ball.z = 0;
    this.events.emit('whistle', {});
    if (reason) this.setBanner(reason, 'normal', 1.1);
  }

  private completeRestart(): void {
    const side = this.restartSide;
    // Give it to the nearest eligible field player (never the goalie unless he is closest).
    let best: MatchPlayer | null = null;
    let bestD = Infinity;
    for (const p of this.teams[side]) {
      if (p.slot === 'G') continue;
      const d = dist2(p.x, p.y, this.restartAt.x, this.restartAt.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (!best) best = this.teams[side][1];
    best.x = this.restartAt.x;
    best.y = this.restartAt.y;
    best.vx = 0; best.vy = 0;
    this.giveBall(best, false);
    this.beginLive();
    this.autoSwitch(true);
  }

  // ---------------------------------------------------------------- main update

  update(dt: number, rawInput?: InputState): void {
    const input = rawInput ?? neutralInput();
    dt = Math.min(dt, 1 / 20); // never let a stall teleport the sim
    this.elapsed += dt;
    this.commentary.tick(dt);
    if (this.banner) {
      this.banner.timer -= dt;
      if (this.banner.timer <= 0) this.banner = null;
    }
    for (const p of this.players) if (p.flash > 0) p.flash -= dt;

    switch (this.phase) {
      case 'faceoff': this.updateFaceoff(dt, input); break;
      case 'live': this.updateLive(dt, input); break;
      case 'goal': this.updateGoalCelebration(dt); break;
      case 'replay': this.updateReplay(dt); break;
      case 'quarterbreak': this.updateQuarterBreak(dt); break;
      case 'restart':
        this.phaseTimer -= dt;
        this.decayPlayers(dt);
        if (this.phaseTimer <= 0) this.completeRestart();
        break;
      case 'final':
      case 'pregame':
      default:
        break;
    }
  }

  private updateFaceoff(dt: number, input: InputState): void {
    const fo = this.faceoff;
    if (!fo) { this.beginLive(); return; }
    this.decayPlayers(dt, 0.4);
    const human = this.humanSide ?? 'home';
    const ai = otherSide(human);
    const done = stepFaceoff(fo, dt, input.actionPressed, human, ai);
    if (!done) return;

    fo.timer -= dt;
    if (fo.timer > 0) return;

    this.resolveFaceoff(fo, human, ai);
  }

  private resolveFaceoff(fo: FaceoffState, human: Side, ai: Side): void {
    const center = { x: FIELD.centerX, y: FIELD.centerY };
    if (fo.result === 'scrum') {
      // Loose ball at X — everyone sprints.
      this.ball.state = 'loose';
      this.ball.carrier = null;
      this.ball.x = center.x + this.rng.range(-1.6, 1.6);
      this.ball.y = center.y + this.rng.range(-1.6, 1.6);
      this.ball.vx = this.rng.range(-3, 3);
      this.ball.vy = this.rng.range(-3, 3);
      this.ball.z = 0.2;
      this.ball.vz = 2;
      this.events.emit('faceoff', { side: null, result: 'scrum' });
      this.setBanner('SCRUM AT X', 'normal', 1.0);
      const prScrum = this.cfg.practice;
      if (prScrum && prScrum.kind === 'faceoff') {
        this.practice.reps++;
        if (prScrum.reps && this.practice.reps >= prScrum.reps) { this.finishGame(); return; }
        this.beginFaceoff();
        return;
      }
      this.beginLive();
      this.autoSwitch(true);
      return;
    }

    const winner: Side = fo.winner ?? (this.rng.bool() ? human : ai);
    const taker = this.faceoffPlayer(winner);
    this.stats[winner].faceoffWins++;
    taker.stat.faceoffWins++;

    if (fo.result === 'violation') {
      this.setBanner('FALSE START — POSSESSION LOST', 'normal', 1.4);
      this.events.emit('faceoff', { side: winner, result: 'violation' });
    } else {
      this.events.emit('faceoff', { side: winner, result: 'win' });
      if (winner === human) this.say('faceoffWin', 14);
    }

    const pr = this.cfg.practice;
    if (pr && pr.kind === 'faceoff') {
      this.practice.reps++;
      if (winner === (this.humanSide ?? 'home') && fo.result !== 'violation') this.practice.success++;
      if (pr.reps && this.practice.reps >= pr.reps) { this.finishGame(); return; }
      this.beginFaceoff();
      return;
    }

    taker.x = center.x + attackDir(winner) * 1.4;
    taker.y = center.y;
    this.giveBall(taker, false);
    this.beginLive();
    this.autoSwitch(true);
  }

  /** True when there is enough footage to be worth showing. */
  private canReplay(): boolean {
    if (this.autopilot) return false;
    return (this.cfg.replays ?? true) && !this.isPractice && this.replay.seconds > 1.4;
  }

  /* ------------------------------------------------------ quarter simulation
   * Fast-forwarding runs the real engine, not a dice roll: the same AI, the
   * same ratings, the same tactics and difficulty, continuing from the exact
   * state on the field. The only differences are that nobody is holding a
   * controller and the presentation is muted.
   * ---------------------------------------------------------------------- */

  /**
   * Plays out the rest of the current quarter with both teams on AI. Returns
   * what happened, so the caller can show it. Never runs longer than one
   * quarter plus a break; a stuck sim ends rather than hanging the tab.
   */
  simulateQuarter(): { homeGoals: number; awayGoals: number; endedGame: boolean; quarter: number } {
    const startQuarter = this.quarter;
    const startOt = this.overtimePeriod;
    const before = { home: this.score.home, away: this.score.away };
    const wasMuted = this.events.muted;

    this.autopilot = true;
    this.events.muted = true;
    this.replay.clear();
    if (this.phase === 'goal' || this.phase === 'replay') this.finishReplay();

    const step = 1 / 60;
    // Cap on wall-clock work: a quarter plus a generous margin for restarts.
    const maxSteps = Math.ceil((this.cfg.quarterSeconds + 90) / step);
    let steps = 0;
    while (steps++ < maxSteps) {
      if (this.phase === 'final') break;
      if (this.quarter !== startQuarter || this.overtimePeriod !== startOt) break;
      this.update(step);
    }

    this.autopilot = false;
    this.events.muted = wasMuted;
    this.replay.clear();
    return {
      homeGoals: this.score.home - before.home,
      awayGoals: this.score.away - before.away,
      endedGame: this.phase === 'final',
      quarter: startQuarter,
    };
  }

  private startReplay(): void {
    this.phase = 'replay';
    this.replayDuration = Math.min(this.replay.seconds, 4.5);
    this.replayTime = 0;
    this.replaySpeed = 1;
    this.focus = null;
  }

  /** Ends the replay early; the next phase runs exactly as if it had finished. */
  skipReplay(): void {
    if (this.phase !== 'replay') return;
    this.finishReplay();
  }

  private finishReplay(): void {
    this.replayTime = this.replayDuration;
    if (this.pendingPracticeResult !== null) {
      const r = this.pendingPracticeResult;
      this.pendingPracticeResult = null;
      this.practiceRep(r);
      return;
    }
    if (this.cfg.suddenVictory && this.overtimePeriod > 0) {
      this.finishGame();
      return;
    }
    this.beginFaceoff();
  }

  private updateReplay(dt: number): void {
    // Real time up to the shot, then slow motion for the finish, which is the
    // part worth looking at.
    const remaining = this.replayDuration - this.replayTime;
    this.replaySpeed = remaining < 1.6 ? 0.38 : 1;
    this.replayTime += dt * this.replaySpeed;

    const ballView = { ballX: this.ball.x, ballY: this.ball.y, ballZ: this.ball.z, ballCarried: false };
    this.replay.apply(this.replayTime, this.replayDuration, this.players, ballView);
    this.ball.x = ballView.ballX;
    this.ball.y = ballView.ballY;
    this.ball.z = ballView.ballZ;
    // Always draw it as a free ball: there is no live carrier to hold it during
    // playback, and the recorded position is already the stick head.
    this.ball.state = 'loose';
    this.ball.carrier = null;
    this.focus = { x: this.ball.x, y: this.ball.y };

    // Hold on the finish for a beat before the faceoff.
    if (this.replayTime >= this.replayDuration + 0.55) this.finishReplay();
  }

  private updateGoalCelebration(dt: number): void {
    this.phaseTimer -= dt;
    this.decayPlayers(dt, 0.25);
    if (this.phaseTimer <= 0) {
      if (this.canReplay()) { this.startReplay(); return; }
      this.finishReplay();
    }
  }

  private updateQuarterBreak(dt: number): void {
    this.phaseTimer -= dt;
    if (this.phaseTimer <= 0) {
      this.quarter++;
      this.rotateMidfield('home');
      this.rotateMidfield('away');
      for (const p of this.players) p.stamina = clamp(p.stamina + 55, 0, 100);
      this.clock = this.overtimePeriod > 0 ? 240 : this.cfg.quarterSeconds;
      this.beginFaceoff();
    }
  }

  private endQuarter(): void {
    if (this.isPractice) { this.finishGame(); return; }
    this.events.emit('quarterEnd', { quarter: this.quarter });
    this.events.emit('whistle', {});
    const isRegulationEnd = this.quarter >= QUARTERS && this.overtimePeriod === 0;
    const tied = this.score.home === this.score.away;

    if (isRegulationEnd || this.overtimePeriod > 0) {
      if (tied && this.cfg.suddenVictory) {
        this.overtimePeriod++;
        this.phase = 'quarterbreak';
        this.phaseTimer = 2.6;
        this.setBanner(this.overtimePeriod === 1 ? 'SUDDEN VICTORY' : `OT ${this.overtimePeriod}`, 'big', 2.4);
        return;
      }
      this.finishGame();
      return;
    }
    this.phase = 'quarterbreak';
    this.phaseTimer = 2.2;
    this.setBanner(`END OF Q${this.quarter}`, 'normal', 2.0);
  }

  private finishGame(): void {
    this.phase = 'final';
    this.ball.carrier = null;
    this.events.emit('gameEnd', {});
  }

  // ---------------------------------------------------------------- live sim

  private updateLive(dt: number, input: InputState): void {
    // Clock
    this.clock -= dt;
    const poss = this.possessionSide();
    if (poss) this.stats[poss].possessionTime += dt;

    if (poss) {
      this.shotClock -= dt;
      if (this.shotClock <= 0) {
        this.turnover(poss, 'SHOT CLOCK VIOLATION', this.ball.x, this.ball.y);
        return;
      }
    }

    if (this.clock <= 0) {
      this.clock = 0;
      this.endQuarter();
      return;
    }

    // Human control
    if (this.humanSide && !this.autopilot) {
      this.applyHumanInput(this.humanSide, input, dt);
    }

    if (this.screenCd.home > 0) this.screenCd.home -= dt;
    if (this.screenCd.away > 0) this.screenCd.away -= dt;

    // AI + movement. A player on his way to set a screen is running an errand
    // for the carrier, so his own AI stands down until it is finished.
    for (const p of this.players) {
      this.tickTimers(p, dt);
      if (p.slot === 'G') {
        updateGoalie(this, p, dt);
      } else if (this.updateScreener(p, dt)) {
        continue;
      } else if (this.aiControls(p)) {
        updateAI(this, p, dt);
      }
    }

    for (const p of this.players) this.integrate(p, dt);
    this.resolveCollisions();
    this.updateBall(dt);
    this.replay.record(dt, this.ball, this.players);
    if (this.phase !== 'live') return;
    this.checkClearDrill();
    this.autoSwitch(false);
    if (this.manualHold > 0) this.manualHold -= dt;
  }

  /** The clearing drill is won by getting the ball over the midline in your own
   *  sticks — exactly what a real clear is. */
  private checkClearDrill(): void {
    if (this.cfg.practice?.kind !== 'clear') return;
    const carrier = this.ball.carrier;
    if (!carrier) return;
    const human = this.humanSide ?? 'home';
    if (carrier.side !== human) return;
    const dir = attackDir(human);
    const past = dir > 0 ? carrier.x > FIELD.centerX + 2 : carrier.x < FIELD.centerX - 2;
    if (past) this.practiceRep(true);
  }

  /** Dead-ball phases: timers still tick and players get their breath back. */
  private decayPlayers(dt: number, motionScale = 0): void {
    for (const p of this.players) {
      this.tickTimers(p, dt);
      this.tickStamina(p, dt, false);
      p.vx *= motionScale > 0 ? 0.9 : 0;
      p.vy *= motionScale > 0 ? 0.9 : 0;
      p.x += p.vx * dt * motionScale;
      p.y += p.vy * dt * motionScale;
      p.animPhase += Math.hypot(p.vx, p.vy) * dt * 1.6;
    }
  }

  private tickTimers(p: MatchPlayer, dt: number): void {
    if (p.stun > 0) p.stun -= dt;
    if (p.beaten > 0) p.beaten -= dt;
    if (p.checkCd > 0) p.checkCd -= dt;
    if (p.dodgeCd > 0) p.dodgeCd -= dt;
    if (p.dodgeTimer > 0) p.dodgeTimer -= dt;
    if (p.pickupLock > 0) p.pickupLock -= dt;
    if (p.poseTimer > 0) {
      p.poseTimer -= dt;
      if (p.poseTimer <= 0 && p.animPose !== 'down') p.animPose = 'idle';
    }
  }

  /** Stamina is spent by sprinting specifically, not merely by running, so the
   *  sprint button is a real decision. Called from integrate(), where the
   *  player's actual intent for this frame is known. */
  private tickStamina(p: MatchPlayer, dt: number, sprinting: boolean): void {
    // Strength and conditioning shows up here: the same legs, more of them left
    // in the fourth quarter.
    const conditioning = this.coachingOf(p.side).staminaRate;
    if (sprinting) p.stamina -= SIM.sprintStaminaDrain * dt * (1 - p.data.attrs.stamina / 260) / conditioning;
    else p.stamina += SIM.staminaRegen * dt * (0.6 + p.data.attrs.stamina / 200) * conditioning;
    p.stamina = clamp(p.stamina, 0, 100);
  }

  maxSpeed(p: MatchPlayer): number {
    const rating = p.data.attrs.speed;
    let s = SIM.baseSpeed + (rating - SIM.ratingCentre) * SIM.speedPerRating;
    if (p.slot === 'G') s *= 0.72;
    if (this.ball.carrier === p) s *= 0.94; // carrying costs a little
    const fatigue = p.stamina < SIM.lowStaminaThreshold ? 0.78 + (p.stamina / SIM.lowStaminaThreshold) * 0.22 : 1;
    // Fighting through a screen costs a defender a step, not the play.
    return s * fatigue * this.screenDrag(p);
  }

  private accelOf(p: MatchPlayer): number {
    let a = SIM.accelBase + (p.data.attrs.acceleration - SIM.ratingCentre) * SIM.accelPerRating;
    if (p.beaten > 0) a *= 0.55;
    if (p.stamina < SIM.lowStaminaThreshold) a *= 0.8;
    return a;
  }

  /** Desired direction + sprint flag are written by AI or human input into these. */
  private moveIntent = new WeakMap<MatchPlayer, { dx: number; dy: number; sprint: boolean }>();

  setMove(p: MatchPlayer, dx: number, dy: number, sprint = false): void {
    this.moveIntent.set(p, { dx, dy, sprint });
  }

  private integrate(p: MatchPlayer, dt: number): void {
    const intent = this.moveIntent.get(p) ?? { dx: 0, dy: 0, sprint: false };
    this.moveIntent.delete(p);

    let targetVx = 0;
    let targetVy = 0;

    if (p.dodgeTimer > 0) {
      const t = p.dodgeTimer / SIM.dodgeDuration;
      const boost = 1 + (SIM.dodgeSpeedBoost - 1) * t;
      targetVx = p.dodgeX * this.maxSpeed(p) * boost;
      targetVy = p.dodgeY * this.maxSpeed(p) * boost;
    } else if (p.stun > 0) {
      targetVx = 0;
      targetVy = 0;
    } else {
      const mag = Math.hypot(intent.dx, intent.dy);
      if (mag > 0.01) {
        const n = { x: intent.dx / mag, y: intent.dy / mag };
        const scale = Math.min(1, mag);
        let speed = this.maxSpeed(p) * scale;
        if (intent.sprint && p.stamina > 3) speed *= SIM.sprintMultiplier;
        // Winding up a shot slows you down — you have to commit.
        if (p.windup > 0.05 && !p.windupIsPass) speed *= 0.62;
        targetVx = n.x * speed;
        targetVy = n.y * speed;
      }
    }

    const moving = Math.hypot(p.vx, p.vy) > 1.2;
    this.tickStamina(p, dt, intent.sprint && moving && p.dodgeTimer <= 0);

    // Cutting back against your own momentum is sharper than accelerating from
    // a standstill. Without this, changing direction feels like driving a bus.
    let accel = this.accelOf(p);
    const curSpeed = Math.hypot(p.vx, p.vy);
    if (curSpeed > 1 && (targetVx !== 0 || targetVy !== 0)) {
      const tm = Math.hypot(targetVx, targetVy) || 1;
      const dot = (p.vx * targetVx + p.vy * targetVy) / (curSpeed * tm);
      if (dot < 0.6) accel *= 1 + (0.6 - dot) * 1.15;
    } else if (targetVx === 0 && targetVy === 0) {
      // Stopping should also be quick — a released stick means stop now.
      accel *= 1.5;
    }

    const a = accel * dt;
    p.vx += clamp(targetVx - p.vx, -a, a);
    p.vy += clamp(targetVy - p.vy, -a, a);

    const speed = Math.hypot(p.vx, p.vy);
    if (speed > 0.25) {
      const want = Math.atan2(p.vy, p.vx);
      p.facing += angleDelta(p.facing, want) * Math.min(1, SIM.turnRate * dt);
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.animPhase += speed * dt * 1.9;

    this.applyBounds(p);
  }

  private applyBounds(p: MatchPlayer): void {
    const m = 0.4;
    p.x = clamp(p.x, m, FIELD.length - m);
    p.y = clamp(p.y, m, FIELD.width - m);

    // Crease: nobody but the goalie may stand in it.
    if (p.slot !== 'G') {
      for (const goal of [attackingGoal(p.side), defendingGoal(p.side)]) {
        const d = dist(p.x, p.y, goal.x, goal.y);
        const r = FIELD.creaseRadius + PLAYER_RADIUS * 0.5 + CREASE_PAD;
        if (d < r && d > 0.001) {
          const push = (r - d) / d;
          p.x += (p.x - goal.x) * push;
          p.y += (p.y - goal.y) * push;
        }
      }
    }

    // Soft offside wall: attackmen stay onside, close defenders stay home.
    const dir = attackDir(p.side);
    if (p.pos === 'A' && p.slot.startsWith('A')) {
      const limit = FIELD.centerX - dir * 3;
      if (dir > 0 ? p.x < limit : p.x > limit) {
        p.x = limit;
        if (dir > 0 ? p.vx < 0 : p.vx > 0) p.vx *= -0.2;
        if (this.controlled[p.side] === p) this.setBanner('STAY ONSIDE', 'normal', 0.7);
      }
    } else if (p.pos === 'D' && p.slot.startsWith('D')) {
      const limit = FIELD.centerX + dir * 3;
      if (dir > 0 ? p.x > limit : p.x < limit) {
        p.x = limit;
        if (dir > 0 ? p.vx > 0 : p.vx < 0) p.vx *= -0.2;
        if (this.controlled[p.side] === p) this.setBanner('STAY ONSIDE', 'normal', 0.7);
      }
    } else if (p.slot === 'G') {
      // Keep the keeper near his own end.
      const own = defendingGoal(p.side);
      if (Math.abs(p.x - own.x) > 16 || Math.abs(p.y - own.y) > 18) {
        p.x += (own.x - p.x) * 0.05;
        p.y += (own.y - p.y) * 0.05;
      }
    }
  }

  private resolveCollisions(): void {
    const n = this.players.length;
    for (let i = 0; i < n; i++) {
      const a = this.players[i];
      for (let j = i + 1; j < n; j++) {
        const b = this.players[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const min = PLAYER_RADIUS * 2;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const overlap = (min - d) / d * 0.5;
        // A stunned or beaten player gets shoved further.
        const aw = a.stun > 0 ? 1.5 : 1;
        const bw = b.stun > 0 ? 1.5 : 1;
        const total = aw + bw;
        a.x -= dx * overlap * (bw / total) * 2;
        a.y -= dy * overlap * (bw / total) * 2;
        b.x += dx * overlap * (aw / total) * 2;
        b.y += dy * overlap * (aw / total) * 2;
      }
    }
  }

  // ---------------------------------------------------------------- ball

  /** World position of a carrier's stick head, where the ball sits. */
  stickPos(p: MatchPlayer): { x: number; y: number } {
    const off = 0.75;
    return {
      x: p.x + Math.cos(p.facing) * off * 0.55 + Math.cos(p.facing - 1.35) * off * 0.7,
      y: p.y + Math.sin(p.facing) * off * 0.55 + Math.sin(p.facing - 1.35) * off * 0.7,
    };
  }

  private updateBall(dt: number): void {
    const b = this.ball;
    b.age += dt;
    if (b.assistTimer > 0) {
      b.assistTimer -= dt;
      if (b.assistTimer <= 0) b.assistCandidate = null;
    }

    if (b.state === 'carried' && b.carrier) {
      const s = this.stickPos(b.carrier);
      b.x = s.x; b.y = s.y; b.z = 1.15;
      b.vx = b.carrier.vx; b.vy = b.carrier.vy; b.vz = 0;
      return;
    }

    // Airborne / rolling integration
    const prevX = b.x;
    const prevY = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.vz -= SIM.gravity * dt;

    if (b.z <= 0) {
      b.z = 0;
      if (b.vz < -1.2) {
        b.vz = -b.vz * 0.42;
        b.vx *= 0.8; b.vy *= 0.8;
      } else {
        b.vz = 0;
        if (b.state !== 'loose') b.state = 'loose';
      }
    }

    const drag = b.z > 0.05 ? SIM.ballFriction : SIM.ballGroundFriction;
    const damp = Math.exp(-drag * dt);
    b.vx *= damp;
    b.vy *= damp;
    if (b.z <= 0 && Math.hypot(b.vx, b.vy) < 0.35) { b.vx = 0; b.vy = 0; }

    this.checkSaves(prevX, prevY);
    this.checkGoals(prevX, prevY);
    if (this.phase !== 'live') return;
    this.checkOutOfBounds();
    if (this.phase !== 'live') return;
    this.checkPickups(dt);
  }

  /** Goalie interception. Runs before the goal test so a keeper can steal one. */
  private checkSaves(prevX: number, prevY: number): void {
    const b = this.ball;
    if (b.state !== 'shot' || b.age < 0.03) return;
    for (const side of ['home', 'away'] as Side[]) {
      if (b.lastCarrier && b.lastCarrier.side === side) continue;
      const g = this.goalieOf(side);
      const own = defendingGoal(side);
      if (Math.abs(b.x - own.x) > 5) continue;
      if (b.z > 2.5) continue;
      // A keeper on a hot night covers more of the cage, not just holds more of
      // what he reaches. This is the single biggest source of upsets.
      const diffReach = this.setups[side].human ? 1 : this.diff.goalieReach;
      const reach = saveRadius(this.keeperRating(g)) * diffReach
        * (1 + (this.isPractice ? 0 : this.goalieForm[side] * 1.9));
      const d = pointSegDist(g.x, g.y, prevX, prevY, b.x, b.y);
      if (d > reach) continue;

      const speed = Math.hypot(b.vx, b.vy);
      const power = clamp(speed / SIM.shotSpeedMax, 0, 1);
      // Even in position, a rocket can beat a keeper's hands.
      const hold = clamp(
        0.58 + this.keeperRating(g) / 260 - speed / 180 - (b.z < 0.4 ? 0.09 : 0)
        + (this.isPractice ? 0 : this.form[side] * 0.005 + this.goalieForm[side]),
        0.2, 0.92,
      );

      b.onGoalCounted = true;
      if (this.rng.next() < hold) {
        this.registerSave(g, power);
        if (this.rng.bool(0.55)) {
          // Clean save — the keeper controls it and starts the clear.
          g.animPose = 'dive';
          g.poseTimer = 0.35;
          this.giveBall(g, false);
        } else {
          // Rebound out in front of the cage.
          const dir = attackDir(side);
          const ang = Math.atan2(b.vy, b.vx) + this.rng.range(-1.1, 1.1);
          b.state = 'loose';
          b.carrier = null;
          b.intendedTarget = null;
          b.x = g.x + dir * 0.8;
          b.y = g.y;
          b.z = 0.6;
          b.vx = Math.cos(ang) * -speed * 0.28 + dir * 5;
          b.vy = Math.sin(ang) * -speed * 0.28;
          b.vz = 3.2;
          b.age = 0;
        }
        this.autoSwitch(true);
        return;
      }

      // Got a piece of it: the shot is slowed and knuckles on.
      b.state = 'loose';
      b.vx *= 0.62;
      b.vy = b.vy * 0.62 + this.rng.range(-2.5, 2.5);
      b.age = 0;
      const shooter = b.lastCarrier;
      if (shooter) shooter.stat.shotsOnGoal++;
      this.stats[otherSide(side)].shotsOnGoal++;
      return;
    }
  }

  private checkGoals(prevX: number, prevY: number): void {
    const b = this.ball;
    if (b.state === 'carried') return;
    for (const side of ['home', 'away'] as Side[]) {
      // side = the team ATTACKING this goal
      const goal = attackingGoal(side);
      const dir = attackDir(side);
      const crossed = dir > 0
        ? prevX < goal.x && b.x >= goal.x
        : prevX > goal.x && b.x <= goal.x;
      if (!crossed) continue;

      const t = (goal.x - prevX) / (b.x - prevX || 1e-6);
      const yAt = prevY + (b.y - prevY) * t;
      const half = FIELD.goalWidth / 2;

      if (Math.abs(yAt - goal.y) <= half && b.z <= GOAL_HEIGHT) {
        this.scoreGoal(side);
        return;
      }
      if (Math.abs(yAt - goal.y) <= half + 0.16 && b.z <= GOAL_HEIGHT + 0.2) {
        // Pipe.
        b.x = goal.x - dir * 0.3;
        b.vx *= -0.55;
        b.vy += this.rng.range(-3, 3);
        this.settleShot('post');
        this.events.emit('post', { x: goal.x, y: yAt });
        this.events.emit('shake', { amount: 3 });
        this.say('post', 12);
        return;
      }
    }
  }

  private scoreGoal(side: Side): void {
    const shooter = this.ball.lastCarrier;
    const assist = this.ball.assistCandidate && this.ball.assistCandidate !== shooter
      ? this.ball.assistCandidate : null;
    const goal = attackingGoal(side);
    const distance = shooter ? dist(shooter.x, shooter.y, goal.x, goal.y) : 10;

    this.score[side]++;
    this.stats[side].goals++;
    if (shooter) {
      shooter.stat.goals++;
      if (!this.ball.onGoalCounted) {
        shooter.stat.shotsOnGoal++;
        this.stats[side].shotsOnGoal++;
        this.ball.onGoalCounted = true;
      }
    }
    if (assist) assist.stat.assists++;
    const keeper = this.goalieOf(otherSide(side));
    keeper.stat.goalsAgainst++;

    const entry: ScoreEntry = {
      side,
      quarter: this.quarter,
      clock: this.clock,
      scorerId: shooter?.data.id ?? '',
      scorerName: shooter ? shortName(shooter.data) : 'Unknown',
      assistId: assist?.data.id ?? null,
      assistName: assist ? shortName(assist.data) : null,
      distance,
    };
    this.scoring.push(entry);
    this.lastGoal = entry;

    this.settleShot('goal');
    this.events.emit('goal', { side, scorer: shooter!, assist, distance });
    this.events.emit('shake', { amount: 9 });
    const close = Math.abs(this.score.home - this.score.away) <= 1;
    const late = this.quarter >= QUARTERS && this.clock < 60;
    if (late && close) this.say('clutch', 0, 'big');
    else if (distance > 13) this.say('bigGoal', 0, 'big');
    else this.say('goal', 0, 'big');

    this.ball.state = 'loose';
    this.ball.carrier = null;
    this.ball.vx = 0; this.ball.vy = 0; this.ball.vz = 0;
    this.ball.x = goal.x;
    this.ball.y = goal.y;
    this.ball.z = 0.4;
    this.focus = { x: goal.x, y: goal.y };
    // Freeze the buffer where it is: everything after this point is celebration.
    this.phase = 'goal';
    this.phaseTimer = this.isPractice ? 1.2 : SIM.goalCelebration;
    const pr = this.cfg.practice;
    if (pr && this.isRepDrill) {
      const human = this.humanSide ?? 'home';
      this.pendingPracticeResult = pr.kind === 'defend' ? side !== human : side === human;
    }
    if (shooter) { shooter.animPose = 'idle'; shooter.flash = 1.2; }
  }

  private checkOutOfBounds(): void {
    const b = this.ball;
    if (b.state === 'carried') return;
    const outLeft = b.x < 0;
    const outRight = b.x > FIELD.length;
    const outTop = b.y < 0;
    const outBottom = b.y > FIELD.width;
    if (!outLeft && !outRight && !outTop && !outBottom) return;

    const wasShot = b.state === 'shot';
    const exitX = clamp(b.x, 0, FIELD.length);
    const exitY = clamp(b.y, 0, FIELD.width);

    let awardTo: Side;
    if (wasShot) this.settleShot('wide');
    if ((outLeft || outRight) && wasShot) {
      // Backing up the shot: nearest player to where it left the field gets it.
      awardTo = this.nearestSideTo(exitX, exitY);
      this.setBanner('BACKED UP', 'normal', 1.0);
    } else {
      const last = b.lastCarrier?.side ?? b.lastSide ?? 'home';
      awardTo = otherSide(last);
      this.setBanner('OUT OF BOUNDS', 'normal', 1.0);
    }
    this.beginRestart(awardTo, exitX, exitY, '');
  }

  private nearestSideTo(x: number, y: number): Side {
    let best: Side = 'home';
    let bestD = Infinity;
    for (const p of this.players) {
      if (p.slot === 'G') continue;
      const d = dist2(p.x, p.y, x, y);
      if (d < bestD) { bestD = d; best = p.side; }
    }
    return best;
  }

  private checkPickups(dt: number): void {
    const b = this.ball;
    if (b.state === 'carried') return;

    let best: MatchPlayer | null = null;
    let bestScore = -Infinity;

    for (const p of this.players) {
      if (p.stun > 0 || p.pickupLock > 0) continue;
      const d = dist(p.x, p.y, b.x, b.y);
      const isTarget = b.intendedTarget === p;
      // A shot is faster and lower than a pass: it can be blocked, but standing
      // in the lane is not enough to take one out of the air.
      const isShot = b.state === 'shot';
      const reach = b.state === 'loose'
        ? SIM.catchRadius + (p.slot === 'G' ? 0.5 : 0)
        : isTarget ? SIM.catchRadius + 0.55
          : isShot ? SIM.interceptRadius * 0.8 : SIM.interceptRadius;
      if (d > reach) continue;
      if (b.z > 2.1) continue;

      // Rates are per second, so the outcome does not depend on the frame rate.
      const a = p.data.attrs;
      const speed = Math.hypot(b.vx, b.vy);
      let rate: number;
      if (b.state === 'loose') {
        // Scooping a settled ball is quick; a skipping ball takes a beat.
        rate = 9 + a.awareness / 12 - clamp(speed * 0.55, 0, 7);
      } else if (isTarget) {
        rate = 14 + a.passing / 8 - clamp((speed - 24) / 3, 0, 6);
        rate *= 0.65 + this.chemistryOf(p.side) * 0.45;
      } else {
        // Interception: real but far from automatic, and the deeper you are in
        // the flight path the more likely you are to read it.
        const ownership = b.lastCarrier && b.lastCarrier.side === p.side ? 0.35 : 1;
        rate = (0.45 + a.awareness / 90 + a.defense / 150) * ownership;
        if (isShot) rate *= 0.22;
        if (b.age < 0.12) rate *= 0.2;
        if (p.slot === 'G') rate *= 2.4;
      }
      rate = Math.max(0, rate);
      const chance = 1 - Math.exp(-rate * dt);

      const score = rate - d * 1.5 + (isTarget ? 6 : 0);
      if (score > bestScore && this.rng.next() < chance) {
        bestScore = score;
        best = p;
      }
    }

    if (!best) return;

    const wasFlight = b.state !== 'loose';
    const stolen = wasFlight && b.lastCarrier != null && best.side !== b.lastCarrier.side;
    const keepPossession = b.lastSide === best.side;

    if (b.state === 'loose') {
      best.stat.groundBalls++;
      this.stats[best.side].groundBalls++;
      if (!keepPossession) this.say('groundBall', 11);
    }

    if (stolen) {
      best.stat.causedTurnovers++;
      this.stats[otherSide(best.side)].turnovers++;
      if (b.lastCarrier) b.lastCarrier.stat.turnovers++;
      if (wasFlight && b.state === 'shot') this.settleShot('blocked');
      this.events.emit('turnover', { side: otherSide(best.side), reason: 'intercepted' });
      this.say('intercept', 8, 'big');
      this.events.emit('shake', { amount: 3 });
    }

    const keepAssist = wasFlight && !stolen && best === b.intendedTarget;
    this.giveBall(best, keepAssist);
    this.events.emit('catch', { side: best.side });
    if (stolen || !keepPossession) this.autoSwitch(true);
  }

  giveBall(p: MatchPlayer, keepAssist: boolean): void {
    const b = this.ball;
    const prevSide = b.lastSide;
    if (!keepAssist) {
      b.assistCandidate = null;
      b.assistTimer = 0;
    } else if (b.lastCarrier && b.lastCarrier !== p) {
      b.assistCandidate = b.lastCarrier;
      b.assistTimer = 4.5;
    }
    const pr = this.cfg.practice;
    if (pr && prevSide !== null && prevSide !== p.side) {
      const human = this.humanSide ?? 'home';
      if ((pr.kind === 'shoot' || pr.kind === 'clear') && p.side !== human) {
        this.practiceRep(false);
        return;
      }
      if (pr.kind === 'defend' && p.side === human) { this.practiceRep(true); return; }
    }
    b.state = 'carried';
    b.carrier = p;
    b.lastCarrier = p;
    b.intendedTarget = null;
    b.age = 0;
    b.lastSide = p.side;
    p.windup = 0;
    p.animPose = 'idle';

    if (prevSide !== p.side) {
      this.shotClock = SIM.shotClock;
      // Count a clear when the defense successfully moves it past midfield later;
      // for now record the attempt.
      if (this.isDefensiveHalf(p)) this.stats[p.side].clearAttempts++;
    }
  }

  private isDefensiveHalf(p: MatchPlayer): boolean {
    const own = defendingGoal(p.side);
    return Math.abs(p.x - own.x) < FIELD.centerX - own.x + 1;
  }

  releaseBall(p: MatchPlayer, vx: number, vy: number, vz: number, state: 'pass' | 'shot', target: MatchPlayer | null): void {
    const b = this.ball;
    const s = this.stickPos(p);
    b.x = s.x; b.y = s.y; b.z = 1.2;
    b.vx = vx; b.vy = vy; b.vz = vz;
    b.state = state;
    b.carrier = null;
    b.lastCarrier = p;
    b.intendedTarget = target;
    b.age = 0;
    b.onGoalCounted = false;
    p.pickupLock = 0.28;
    p.windup = 0;
    p.animPose = 'throw';
    p.poseTimer = 0.22;
  }

  // ---------------------------------------------------------------- actions

  /** Attempt a pass from `p`. `aimX/aimY` is the desired direction (may be zero). */
  doPass(p: MatchPlayer, aimX: number, aimY: number, power: number): void {
    const target = this.choosePassTarget(p, aimX, aimY);
    const tactics = this.tacticsOf(p.side);
    const chem = this.chemistryOf(p.side);

    const a = p.data.attrs;
    const pressure = this.pressureOn(p);
    let accuracy = a.passing + tactics.off.passBonus + (chem - 0.8) * 22 + this.homeEdge(p);
    accuracy -= pressure * 16;
    if (p.stamina < SIM.lowStaminaThreshold) accuracy -= 6;
    accuracy = clamp(accuracy, 20, 99);

    let tx: number;
    let ty: number;
    let speed: number;
    if (target) {
      const flightGuess = dist(p.x, p.y, target.x, target.y) / 24;
      tx = target.x + target.vx * flightGuess * 0.8;
      ty = target.y + target.vy * flightGuess * 0.8;
      speed = clamp(dist(p.x, p.y, tx, ty) / 0.9, SIM.passSpeedMin, SIM.passSpeedMax);
    } else {
      const n = normalize(aimX, aimY);
      if (n.x === 0 && n.y === 0) { n.x = Math.cos(p.facing); n.y = Math.sin(p.facing); }
      tx = p.x + n.x * 18;
      ty = p.y + n.y * 18;
      speed = SIM.passSpeedMin + power * 6;
    }

    // Aim from the stick head, which is where the ball actually leaves from.
    // Aiming from the player's centre throws every pass off by up to a yard.
    const origin = this.stickPos(p);
    let ang = Math.atan2(ty - origin.y, tx - origin.x);
    const err = (1 - accuracy / 100) * 0.3 + this.diff.aimNoise * 0.08;
    ang += this.rng.gauss(0, err * 0.45);

    const badPass = this.rng.next() > 0.6 + (accuracy / 100) * 0.4;
    if (badPass) ang += this.rng.range(-0.3, 0.3);

    // Launch on an arc that lands where the pass is aimed rather than dropping
    // short: vz = g * flightTime / 2 keeps the ball up for the whole throw.
    const flight = clamp(dist(p.x, p.y, tx, ty) / Math.max(6, speed), 0.08, 1.15);
    const vz = clamp((SIM.gravity * flight) / 2, 0.4, 6.4);

    this.releaseBall(
      p,
      Math.cos(ang) * speed,
      Math.sin(ang) * speed,
      vz,
      'pass',
      badPass ? null : target,
    );
    this.events.emit('pass', { side: p.side, power: speed / SIM.passSpeedMax });
    p.flash = 0.2;
  }

  choosePassTarget(p: MatchPlayer, aimX: number, aimY: number): MatchPlayer | null {
    const mates = this.teammatesOf(p).filter((m) => m !== p && m.stun <= 0);
    const hasAim = Math.hypot(aimX, aimY) > 0.25;
    const aimAng = hasAim ? Math.atan2(aimY, aimX) : p.facing;
    let best: MatchPlayer | null = null;
    let bestScore = -Infinity;

    for (const m of mates) {
      const d = dist(p.x, p.y, m.x, m.y);
      if (d < 2.5 || d > 45) continue;
      const ang = Math.atan2(m.y - p.y, m.x - p.x);
      const off = Math.abs(angleDelta(aimAng, ang));
      if (hasAim && off > 1.15) continue;
      if (!hasAim && off > 2.0) continue;

      let score = 100 - off * 42 - d * 0.7;
      // Prefer open men: penalise defenders sitting in the lane.
      const laneRisk = this.laneRisk(p.x, p.y, m.x, m.y, p.side);
      score -= laneRisk * 42;
      // Slight bias toward the goal.
      const goal = attackingGoal(p.side);
      score += (dist(p.x, p.y, goal.x, goal.y) - dist(m.x, m.y, goal.x, goal.y)) * 0.85;
      if (m.slot === 'G') score -= 55;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  /** 0..1 estimate of how contested a passing lane is. */
  laneRisk(ax: number, ay: number, bx: number, by: number, side: Side): number {
    let risk = 0;
    for (const o of this.teams[otherSide(side)]) {
      if (o.slot === 'G') continue;
      const d = pointSegDist(o.x, o.y, ax, ay, bx, by);
      if (d < 2.6) risk += (2.6 - d) / 2.6 * (0.55 + o.data.attrs.awareness / 400);
    }
    return clamp(risk, 0, 1);
  }

  /** A small, deliberate home-field advantage: a friendly crowd is worth about
   *  two rating points of composure. Mirrors the season simulator's home edge. */
  private homeEdge(p: MatchPlayer): number {
    if (this.isPractice) return 0;
    return (p.side === 'home' ? 1.6 : 0) + this.form[p.side];
  }

  /** 0..1 defensive pressure on a player. */
  pressureOn(p: MatchPlayer): number {
    let pr = 0;
    for (const o of this.opponentsOf(p)) {
      if (o.slot === 'G') continue;
      const d = dist(p.x, p.y, o.x, o.y);
      if (d < 4) pr += (4 - d) / 4 * (0.45 + o.data.attrs.defense / 320);
    }
    return clamp(pr, 0, 1.4);
  }

  doShot(p: MatchPlayer, aimX: number, aimY: number, charge: number): void {
    const goal = attackingGoal(p.side);
    const a = p.data.attrs;
    const d = dist(p.x, p.y, goal.x, goal.y);

    // Aim: the goal mouth always runs along the Y axis, so the across-the-mouth
    // component of your input maps straight onto where in the cage the shot
    // goes. Push toward the post you want; no mental rotation required.
    const dir = attackDir(p.side);
    const lateral = Math.hypot(aimX, aimY) > 0.18 ? clamp(aimY * 1.35, -1, 1) : 0;
    const half = FIELD.goalWidth / 2;
    const aimY2 = goal.y + lateral * half * 0.85;

    // Accuracy: distance, pressure, running-shot penalty, charge sweet spot.
    const pressure = this.pressureOn(p);
    const running = Math.hypot(p.vx, p.vy) / Math.max(1, this.maxSpeed(p));
    const sweet = 1 - Math.abs(charge - 0.82) * 1.5;
    let acc = a.shotAccuracy * 0.7 + a.shooting * 0.3 + this.homeEdge(p);
    acc -= pressure * 20;
    acc -= clamp((d - 8) * 2.4, 0, 30);
    // Moving is normal in lacrosse; only a genuine sprint costs you.
    acc -= clamp((running - 0.5) / 0.5, 0, 1) * 10;
    acc += clamp(sweet, -1, 1) * 9;
    acc = clamp(acc, 8, 99);

    const power = SIM.shotSpeedMin + (SIM.shotSpeedMax - SIM.shotSpeedMin) * (0.35 + charge * 0.65)
      * (0.72 + a.shotPower / 260);

    // Spread falls away sharply with accuracy, so a good look is genuinely on
    // frame and a forced one sprays. A flat curve made every shot feel random.
    const spread = ((1 - acc / 100) ** 1.5) * 0.62;
    // Same as passing: the ball leaves the stick head, so that is what has to be
    // pointed at the corner.
    const origin = this.stickPos(p);
    let ang = Math.atan2(aimY2 - origin.y, goal.x + dir * 0.3 - origin.x);
    ang += this.rng.gauss(0, spread * 0.62);

    // A bounce shot: low-charge shots skip off the turf and are harder to read.
    const bounce = charge < 0.55 && this.rng.bool(0.45);
    const shotFlight = clamp(d / Math.max(8, power), 0.05, 0.7);
    const vz = bounce ? -2.4 : clamp((SIM.gravity * shotFlight) / 2, 0.2, 3.4);

    this.releaseBall(p, Math.cos(ang) * power, Math.sin(ang) * power, vz, 'shot', null);
    if (bounce) this.ball.z = 0.9;

    this.lastShot = {
      side: p.side,
      shooter: p,
      quality: this.shotQualityOf(p, acc, d, pressure),
      distance: d,
      pressure,
      accuracy: acc,
      charge,
      onTheRun: running > 0.55,
      outcome: 'pending',
    };

    p.stat.shots++;
    this.stats[p.side].shots++;
    this.shotClock = Math.max(this.shotClock, 12);
    this.events.emit('shot', { side: p.side, shooter: p, power: charge });
    p.animPose = 'throw';
    p.poseTimer = 0.25;
    p.flash = 0.25;
  }

  /** A readable 0..1 summary of how good a look this was. Feedback only. */
  private shotQualityOf(p: MatchPlayer, acc: number, d: number, pressure: number): number {
    const goal = attackingGoal(p.side);
    const dir = attackDir(p.side);
    const along = (goal.x - p.x) * dir;
    const lateral = Math.abs(p.y - goal.y);
    const angle = along < 0.5 ? 0.1 : clamp(1 - lateral / (along * 1.5 + 7), 0.1, 1);
    const distScore = clamp(1 - (d - 4) / 15, 0.05, 1);
    return clamp((acc / 100) * 0.5 + distScore * 0.25 + angle * 0.25 - pressure * 0.12, 0, 1);
  }

  /** Called once the shot resolves, to close out the feedback record. */
  private settleShot(outcome: ShotOutcome): void {
    const info = this.lastShot;
    if (!info || info.outcome !== 'pending') return;
    info.outcome = outcome;
    if (info.side !== this.humanSide) return;

    let label: string | null = null;
    let tone: 'good' | 'bad' | 'neutral' = 'neutral';
    switch (outcome) {
      case 'goal':
        if (info.distance > 12) { label = 'FROM RANGE!'; tone = 'good'; }
        else if (info.quality > 0.62) { label = 'GREAT SHOT'; tone = 'good'; }
        break;
      case 'save':
        label = info.quality > 0.6 ? 'GOOD LOOK — SAVED' : 'SAVED';
        tone = 'bad';
        break;
      case 'post':
        label = 'OFF THE PIPE';
        tone = 'bad';
        break;
      case 'blocked':
        label = 'BLOCKED';
        tone = 'bad';
        break;
      case 'wide':
        if (info.pressure > 0.75) label = 'HEAVY PRESSURE';
        else if (info.distance > 13) label = 'TOO FAR OUT';
        else if (info.onTheRun) label = 'RUSHED IT';
        else label = 'WIDE';
        tone = 'bad';
        break;
      default:
        break;
    }
    if (label) this.events.emit('shotFeedback', { info, label, tone });
  }

  doDodge(p: MatchPlayer, dx: number, dy: number): boolean {
    if (p.dodgeCd > 0 || p.stun > 0 || p.stamina < SIM.dodgeStamina) return false;
    const n = normalize(dx, dy);
    if (n.x === 0 && n.y === 0) { n.x = Math.cos(p.facing); n.y = Math.sin(p.facing); }
    p.dodgeTimer = SIM.dodgeDuration;
    p.dodgeCd = SIM.dodgeCooldown;
    p.dodgeX = n.x;
    p.dodgeY = n.y;
    p.stamina -= SIM.dodgeStamina;
    p.flash = 0.2;
    this.events.emit('dodge', { side: p.side, player: p });

    // Beat nearby defenders based on dodging vs their defense.
    for (const o of this.opponentsOf(p)) {
      if (o.slot === 'G') continue;
      const d = dist(p.x, p.y, o.x, o.y);
      if (d > 3.2) continue;
      const edge = (p.data.attrs.dodging - o.data.attrs.defense) / 100;
      if (this.rng.next() < clamp(0.45 + edge, 0.12, 0.9)) {
        o.beaten = 0.75;
        o.vx *= 0.5;
        o.vy *= 0.5;
      }
    }
    return true;
  }

  doCheck(p: MatchPlayer): boolean {
    if (p.checkCd > 0 || p.stun > 0) return false;
    p.checkCd = SIM.checkCooldown;
    p.animPose = 'check';
    p.poseTimer = 0.28;

    const b = this.ball;
    const carrier = b.carrier;
    this.stats[p.side].checks++;

    if (!carrier || carrier.side === p.side) {
      this.events.emit('check', { hit: false, x: p.x, y: p.y, power: 0 });
      return false;
    }
    const d = dist(p.x, p.y, carrier.x, carrier.y);
    if (d > SIM.checkRange) {
      this.events.emit('check', { hit: false, x: p.x, y: p.y, power: 0 });
      return false;
    }

    const a = p.data.attrs;
    const c = carrier.data.attrs;
    // Checking from the front (between carrier and goal) is easier than trailing.
    const goal = attackingGoal(carrier.side);
    const frontal = dist(p.x, p.y, goal.x, goal.y) < dist(carrier.x, carrier.y, goal.x, goal.y);
    let chance = 0.2 + (a.checking - c.dodging) / 210 + (frontal ? 0.12 : -0.06)
      + (this.isPractice ? 0 : this.form[p.side] * 0.005);
    chance += (SIM.checkRange - d) / SIM.checkRange * 0.14;
    if (carrier.dodgeTimer > SIM.dodgeDuration * 0.45) chance -= 0.3; // dodge protects
    if (!this.setups[p.side].human) chance *= 0.75 + this.diff.checkTiming * 0.35;
    chance = clamp(chance, 0.05, 0.85);

    if (this.rng.next() < chance) {
      // Ball pops loose.
      const ang = this.rng.range(0, Math.PI * 2);
      const speed = this.rng.range(4, 9);
      this.releaseBall(carrier, Math.cos(ang) * speed, Math.sin(ang) * speed, 3.4, 'pass', null);
      this.ball.state = 'loose';
      this.ball.intendedTarget = null;
      carrier.stun = SIM.checkStunTime;
      carrier.animPose = 'down';
      carrier.poseTimer = SIM.checkStunTime;
      carrier.stat.turnovers++;
      p.stat.causedTurnovers++;
      this.stats[carrier.side].turnovers++;
      this.events.emit('check', { hit: true, x: carrier.x, y: carrier.y, power: 1 });
      this.events.emit('shake', { amount: 5 });
      this.events.emit('turnover', { side: carrier.side, reason: 'check' });
      this.say('check', 7, 'big');
      this.autoSwitch(true);
      return true;
    }

    // Whiffed: the defender is out of position for a beat.
    p.beaten = 0.5;
    p.vx *= 0.6;
    p.vy *= 0.6;
    this.events.emit('check', { hit: false, x: p.x, y: p.y, power: 0.3 });
    return false;
  }

  turnover(from: Side, reason: string, x: number, y: number): void {
    this.stats[from].turnovers++;
    if (this.ball.carrier) this.ball.carrier.stat.turnovers++;
    this.events.emit('turnover', { side: from, reason });
    this.beginRestart(otherSide(from), x, y, reason);
  }

  /** Called by the goalie AI when a shot is stopped. */
  registerSave(goalie: MatchPlayer, power: number): void {
    goalie.stat.saves++;
    this.stats[goalie.side].saves++;
    const shooter = this.ball.lastCarrier;
    if (shooter) shooter.stat.shotsOnGoal++;
    this.stats[otherSide(goalie.side)].shotsOnGoal++;
    this.settleShot('save');
    this.events.emit('save', { side: goalie.side, goalie, power });
    this.events.emit('shake', { amount: 2.5 });
    if (power > 0.6) this.say('save', 7, 'big');
    else this.say('save', 11);
    this.shotClock = SIM.shotClock;
  }

  // ---------------------------------------------------------------- human control

  private applyHumanInput(side: Side, input: InputState, dt: number): void {
    let p = this.controlled[side];
    if (!p || p.side !== side) {
      this.autoSwitch(true);
      p = this.controlled[side];
    }
    if (!p) return;

    if (input.switchPressed) {
      this.requestSwitch(side);
      p = this.controlled[side]!;
    }

    if (p.stun > 0) return;

    const mag = Math.hypot(input.moveX, input.moveY);
    const sprint = input.sprint && mag > 0.25;
    this.setMove(p, input.moveX, input.moveY, sprint);
    if (mag > 0.15) this.manualHold = Math.max(this.manualHold, 0.6);

    const hasBall = this.ball.carrier === p;

    if (hasBall) {
      // Shooting: hold to charge, release to fire.
      if (input.shootHeld) {
        p.windup = clamp(p.windup + dt / SIM.shotChargeTime, 0, 1);
        p.windupIsPass = false;
        p.animPose = 'wind';
        p.poseTimer = 0.1;
      }
      if (input.shootReleased && p.windup > 0.03) {
        this.doShot(p, input.moveX, input.moveY, p.windup);
      } else if (input.shootReleased) {
        p.windup = 0;
      }
      if (input.actionPressed) {
        this.doPass(p, input.moveX, input.moveY, 0.6);
      }
      if (input.dodgePressed) {
        this.doDodge(p, input.moveX, input.moveY);
      }
      if (input.screenPressed) {
        this.callScreen(p);
      }
    } else {
      if (input.actionPressed) this.doCheck(p);
      if (input.dodgePressed) this.doDodge(p, input.moveX, input.moveY);
      if (input.shootReleased || input.shootHeld) p.windup = 0;
    }
  }

  /* ----------------------------------------------------------------- screens
   * A screen is the one bit of team play a single controlled player cannot do
   * alone: call for it and the best-placed team-mate comes over, plants himself
   * on the ball defender's side, and holds for a moment. It buys a step, not a
   * goal — the defender is slowed, never frozen, and the cooldown stops it being
   * mashed.
   * ---------------------------------------------------------------------- */

  /** Seconds between screen calls for one team. */
  static readonly SCREEN_COOLDOWN = 6;
  /** How long a screener holds the pick once planted. */
  static readonly SCREEN_HOLD = 2.2;

  screenCd: Record<Side, number> = { home: 0, away: 0 };

  /** Who, if anyone, is currently setting a screen for this side. */
  screenerOf(side: Side): MatchPlayer | null {
    return this.teams[side].find((p) => p.screenTimer > 0 || p.screenHold > 0) ?? null;
  }

  /** Requests a screen for the carrier. Returns false when it cannot be set. */
  callScreen(carrier: MatchPlayer): boolean {
    const side = carrier.side;
    if (this.ball.carrier !== carrier) return false;
    if (this.screenCd[side] > 0) return false;
    if (this.screenerOf(side)) return false;

    const marker = this.nearestDefender(carrier);
    // Pick the team-mate who can get there soonest without being the one man
    // holding the far side of the field open.
    const spot = this.screenSpot(carrier, marker);
    let best: MatchPlayer | null = null;
    let bestScore = Infinity;
    for (const mate of this.teammatesOf(carrier)) {
      // teammatesOf() is the whole squad, so the carrier has to be excluded
      // explicitly — a man cannot set a screen for himself.
      if (mate === carrier || mate.slot === 'G' || mate.stun > 0) continue;
      const t = this.timeToReach(mate, spot.x, spot.y);
      if (t > 2.6) continue;
      const score = t + (mate.pos === 'A' ? 0 : 0.15);
      if (score < bestScore) { bestScore = score; best = mate; }
    }
    if (!best) {
      this.setBanner('NOBODY CLOSE ENOUGH', 'normal', 0.9);
      return false;
    }

    best.screenTimer = 2.4;
    best.screenHold = 0;
    best.flash = 0.4;
    this.screenCd[side] = Match.SCREEN_COOLDOWN;
    if (side === this.humanSide) this.setBanner('SCREEN CALLED', 'normal', 1.0);
    return true;
  }

  /** Where the screener should plant: beside the carrier, on the marker's side. */
  screenSpot(carrier: MatchPlayer, marker: MatchPlayer | null): { x: number; y: number } {
    const goal = attackingGoal(carrier.side);
    // Default to the goal side if nobody is marking, so the pick still opens a
    // driving lane rather than putting a body in the carrier's way.
    let dx = marker ? marker.x - carrier.x : goal.x - carrier.x;
    let dy = marker ? marker.y - carrier.y : goal.y - carrier.y;
    const m = Math.hypot(dx, dy) || 1;
    dx /= m; dy /= m;
    // Stand off the carrier's shoulder: close enough to wall off the defender,
    // far enough that the two never occupy the same yard.
    const off = 2.1;
    return {
      x: clamp(carrier.x + dx * off, 1, FIELD.length - 1),
      y: clamp(carrier.y + dy * off, 1, FIELD.width - 1),
    };
  }

  nearestDefender(carrier: MatchPlayer): MatchPlayer | null {
    let best: MatchPlayer | null = null;
    let bestD = Infinity;
    for (const o of this.opponentsOf(carrier)) {
      if (o.slot === 'G') continue;
      const d = dist(o.x, o.y, carrier.x, carrier.y);
      if (d < bestD) { bestD = d; best = o; }
    }
    return bestD <= 9 ? best : null;
  }

  /** Runs one screener for a frame. Returns true if it took over their movement. */
  updateScreener(p: MatchPlayer, dt: number): boolean {
    if (p.screenTimer <= 0 && p.screenHold <= 0) return false;
    const carrier = this.ball.carrier;
    if (!carrier || carrier.side !== p.side || carrier === p) {
      p.screenTimer = 0;
      p.screenHold = 0;
      return false;
    }
    const spot = this.screenSpot(carrier, this.nearestDefender(carrier));
    const d = dist(p.x, p.y, spot.x, spot.y);

    if (p.screenHold > 0) {
      p.screenHold -= dt;
      // Planted: hold the spot, do not chase.
      if (d > 3.4) { this.setMove(p, 0, 0); return true; }
      const k = clamp(d / 1.2, 0, 1);
      this.setMove(p, ((spot.x - p.x) / (d || 1)) * k, ((spot.y - p.y) / (d || 1)) * k);
      return true;
    }

    p.screenTimer -= dt;
    if (d < 1.0) {
      p.screenHold = Match.SCREEN_HOLD;
      p.screenTimer = 0;
      if (p.side === this.humanSide) this.setBanner('SCREEN SET', 'normal', 0.8);
      return true;
    }
    if (p.screenTimer <= 0) return false;
    const nx = (spot.x - p.x) / (d || 1);
    const ny = (spot.y - p.y) / (d || 1);
    this.setMove(p, nx, ny, d > 4);
    return true;
  }

  /** A defender pushing through a planted screen is slowed, never stopped. */
  screenDrag(p: MatchPlayer): number {
    const carrier = this.ball.carrier;
    if (!carrier || carrier.side === p.side) return 1;
    const screener = this.screenerOf(carrier.side);
    if (!screener || screener.screenHold <= 0) return 1;
    const d = dist(p.x, p.y, screener.x, screener.y);
    if (d > 2.2) return 1;
    // Strongest right on the body, fading to nothing at arm's length.
    return 0.55 + 0.45 * clamp((d - 0.9) / 1.3, 0, 1);
  }

  /* ------------------------------------------------------- player selection
   * Switching is about who can actually get to the ball first, not who happens
   * to be nearest in a straight line. Time-to-reach accounts for the player's
   * speed and which way he is already running, and for a loose ball it aims at
   * where the ball is going rather than where it is.
   * ---------------------------------------------------------------------- */

  /** Rough seconds for `p` to reach a point, allowing for current momentum. */
  timeToReach(p: MatchPlayer, tx: number, ty: number): number {
    const d = dist(p.x, p.y, tx, ty);
    const speed = Math.max(1, this.maxSpeed(p) * SIM.sprintMultiplier);
    let t = d / speed;
    // Already running that way? He gets there sooner. Running away? Later.
    const v = Math.hypot(p.vx, p.vy);
    if (v > 0.5 && d > 0.2) {
      const toward = ((tx - p.x) * p.vx + (ty - p.y) * p.vy) / (d * v);
      t -= toward * 0.22;
    }
    if (p.stun > 0) t += p.stun;
    if (p.beaten > 0) t += 0.15;
    return Math.max(0, t);
  }

  /** Where a chaser should actually run: a couple of fixed-point iterations on
   *  the ball's own motion, so fast balls are led rather than followed. */
  private interceptPoint(p: MatchPlayer): { x: number; y: number } {
    const b = this.ball;
    if (b.state === 'carried' && b.carrier) return { x: b.carrier.x, y: b.carrier.y };
    let t = 0;
    let x = b.x;
    let y = b.y;
    for (let i = 0; i < 3; i++) {
      t = clamp(this.timeToReach(p, x, y), 0, 1.4);
      const decay = Math.exp(-SIM.ballGroundFriction * t * 0.5);
      x = b.x + b.vx * t * decay;
      y = b.y + b.vy * t * decay;
    }
    return { x: clamp(x, 0, FIELD.length), y: clamp(y, 0, FIELD.width) };
  }

  /** Everyone eligible to be handed control: field players who are on their feet. */
  private controlCandidates(side: Side): MatchPlayer[] {
    return this.teams[side].filter((p) => p.slot !== 'G' && p.stun <= 0);
  }

  /** Ranks the squad for control, best first, with each man's score in seconds. */
  private rankForControl(side: Side): { p: MatchPlayer; score: number }[] {
    const b = this.ball;
    const pool = this.controlCandidates(side);
    if (!pool.length) return [];

    const scored = pool.map((p) => {
      const spot = this.interceptPoint(p);
      let score = this.timeToReach(p, spot.x, spot.y);

      if (b.carrier && b.carrier.side !== side) {
        // Defending: reward the man already goal-side of the carrier, because he
        // is the one who can actually do something about it.
        const own = defendingGoal(side);
        const carrierToGoal = dist(b.carrier.x, b.carrier.y, own.x, own.y);
        const meToGoal = dist(p.x, p.y, own.x, own.y);
        if (meToGoal < carrierToGoal) score -= 0.25;
        if (p.pos === 'D') score -= 0.1;
      } else if (b.state !== 'carried') {
        // Loose ball: a defender chasing his own end is better placed than an
        // attacker sprinting back across the midline.
        score += Math.abs(p.x - spot.x) > 40 ? 0.4 : 0;
      }
      return { p, score };
    });

    scored.sort((a, c) => a.score - c.score);
    return scored;
  }

  /** The Switch button. Always lands on the most useful man, never a cycle. */
  requestSwitch(side: Side): void {
    const b = this.ball;
    const cur = this.controlled[side];

    // With the ball, control belongs to the carrier — a switch should never
    // hand the ball to the AI.
    if (b.carrier && b.carrier.side === side) {
      if (cur !== b.carrier) {
        this.setControlled(side, b.carrier);
      } else {
        this.setBanner('YOU HAVE THE BALL', 'normal', 0.7);
      }
      return;
    }

    const ranked = this.rankForControl(side);
    if (!ranked.length) return;

    if (ranked[0].p !== cur) {
      this.setControlled(side, ranked[0].p);
      return;
    }

    // Already on the best man. Hand over to the next one only if he is a real
    // alternative — switching to someone twenty yards further away is worse
    // than doing nothing.
    const alt = ranked[1];
    if (alt && alt.score <= ranked[0].score + 0.55) {
      this.setControlled(side, alt.p);
    } else {
      if (cur) cur.flash = 0.3;
      this.setBanner('CLOSEST MAN', 'normal', 0.6);
    }
  }

  private setControlled(side: Side, p: MatchPlayer): void {
    if (this.controlled[side] === p) return;
    this.controlled[side] = p;
    p.flash = 0.35;
    this.manualHold = 2.2;
  }

  /** Automatic switching between plays. `force` ignores the manual hold. */
  autoSwitch(force: boolean): void {
    const side = this.humanSide;
    if (!side) return;
    const b = this.ball;
    const cur = this.controlled[side];

    // Possession always hands you the ball carrier — the Retro-simple rule.
    if (b.carrier && b.carrier.side === side) {
      if (cur !== b.carrier) {
        this.controlled[side] = b.carrier;
        b.carrier.flash = 0.3;
      }
      return;
    }
    if (!force && this.manualHold > 0 && cur && cur.stun <= 0) return;

    const best = this.rankForControl(side)[0]?.p;
    if (best && best !== cur) {
      this.controlled[side] = best;
      best.flash = 0.3;
    }
  }

  /** Every player who touched the field, with their line from this game. */
  boxScore(): { side: Side; data: PlayerData; stat: ReturnType<typeof emptyStats> }[] {
    const map = this.playerStats();
    const out: { side: Side; data: PlayerData; stat: ReturnType<typeof emptyStats> }[] = [];
    for (const side of ['home', 'away'] as Side[]) {
      for (const p of this.setups[side].roster) {
        const st = map.get(p.id);
        if (st) out.push({ side, data: p, stat: st });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- summary
  // ---------------------------------------------------------------- summary

  clockText(): string {
    const t = Math.max(0, Math.ceil(this.clock));
    const m = Math.floor(t / 60);
    const s = t % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  quarterText(): string {
    if (this.overtimePeriod > 0) return this.overtimePeriod === 1 ? 'OT' : `OT${this.overtimePeriod}`;
    return `Q${this.quarter}`;
  }

  winner(): Side | null {
    if (this.score.home === this.score.away) return null;
    return this.score.home > this.score.away ? 'home' : 'away';
  }
}

function pointSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return dist(px, py, ax, ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  return dist(px, py, ax + dx * t, ay + dy * t);
}

function addInto(target: ReturnType<typeof emptyStats>, src: ReturnType<typeof emptyStats>) {
  for (const k of Object.keys(src) as (keyof typeof src)[]) target[k] += src[k];
  return target;
}
