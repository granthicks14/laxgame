import type { Match } from '../../match/Match';
import type { InputState } from '../../match/types';
import { bindingText, DEFAULT_KEYBINDS, type Keybinds } from '../../state/keybinds';

interface Step {
  id: string;
  prompt: (touch: boolean, binds: Keybinds) => string;
  /** Returns true once the step is satisfied. */
  check: (ctx: StepContext) => boolean;
  /** Optional minimum time on screen so prompts do not flash past. */
  minTime?: number;
}

interface StepContext {
  match: Match;
  input: InputState;
  dt: number;
  distanceMoved: number;
  sprintTime: number;
  flags: Set<string>;
}

const STEPS: Step[] = [
  {
    id: 'move',
    prompt: (t, b) => (t ? 'Drag anywhere on the left to move your player' : `Move with ${bindingText(b, 'moveUp')} ${bindingText(b, 'moveLeft')} ${bindingText(b, 'moveDown')} ${bindingText(b, 'moveRight')}`),
    check: (c) => c.distanceMoved > 14,
    minTime: 1.2,
  },
  {
    id: 'sprint',
    prompt: (t, b) => (t ? 'Push the stick all the way out to sprint' : `Hold ${bindingText(b, 'sprint')} to sprint — it drains stamina`),
    check: (c) => c.sprintTime > 1.1,
  },
  {
    id: 'pass',
    prompt: (t, b) => (t ? 'With the ball, aim with the stick and tap PASS' : `With the ball, aim with your movement keys and press ${bindingText(b, 'pass')} to pass`),
    check: (c) => c.flags.has('pass'),
  },
  {
    id: 'dodge',
    prompt: (t, b) => (t ? 'Tap DODGE to burst past a defender' : `Press ${bindingText(b, 'dodge')} to dodge — a burst of speed that beats your man`),
    check: (c) => c.flags.has('dodge'),
  },
  {
    id: 'shoot',
    prompt: (t, b) => (t ? 'Hold SHOOT to charge, release to fire' : `Hold ${bindingText(b, 'shoot')} to charge a shot, release to fire. Aim picks the corner`),
    check: (c) => c.flags.has('shot'),
  },
  {
    id: 'goal',
    prompt: () => 'Now beat the keeper and score one',
    check: (c) => c.flags.has('goal'),
  },
  {
    id: 'check',
    prompt: (t, b) => (t ? 'Lose the ball? Get close and tap CHECK' : `On defence, get close and press ${bindingText(b, 'pass')} to throw a check`),
    check: (c) => c.flags.has('check'),
  },
];

/** Drives the on-field walkthrough. Reads the match rather than scripting it, so
 *  the player is always playing the real game. */
export class Tutorial {
  private index = 0;
  private timeOnStep = 0;
  private ctx: StepContext;
  private done = false;
  readonly touch: boolean;
  private binds: Keybinds;
  onFinished: (() => void) | null = null;

  constructor(match: Match, touch: boolean, binds: Keybinds = DEFAULT_KEYBINDS) {
    this.touch = touch;
    this.binds = binds;
    this.ctx = { match, input: null as never, dt: 0, distanceMoved: 0, sprintTime: 0, flags: new Set() };
    const human = match.humanSide ?? 'home';
    match.events.on('pass', ({ side }) => { if (side === human) this.ctx.flags.add('pass'); });
    match.events.on('shot', ({ side }) => { if (side === human) this.ctx.flags.add('shot'); });
    match.events.on('goal', ({ side }) => { if (side === human) this.ctx.flags.add('goal'); });
    match.events.on('dodge', ({ side }) => { if (side === human) this.ctx.flags.add('dodge'); });
    match.events.on('check', ({ hit }) => { if (hit) this.ctx.flags.add('check'); });
  }

  update(dt: number, input: InputState, match: Match): void {
    if (this.done) return;
    const human = match.humanSide;
    const p = human ? match.controlled[human] : null;
    if (p) {
      const speed = Math.hypot(p.vx, p.vy);
      this.ctx.distanceMoved += speed * dt;
      if (input.sprint && speed > 1) this.ctx.sprintTime += dt;
    }
    this.ctx.input = input;
    this.ctx.dt = dt;
    this.timeOnStep += dt;

    const step = STEPS[this.index];
    if (!step) return;
    if (this.timeOnStep < (step.minTime ?? 0.35)) return;
    if (step.check(this.ctx)) {
      this.index++;
      this.timeOnStep = 0;
      if (this.index >= STEPS.length) {
        this.done = true;
        this.onFinished?.();
      }
    }
  }

  get prompt(): string | null {
    if (this.done) return 'That is everything. Go win a district title.';
    const step = STEPS[this.index];
    return step ? step.prompt(this.touch, this.binds) : null;
  }

  get progress(): string {
    return `${Math.min(this.index + 1, STEPS.length)} / ${STEPS.length}`;
  }

  get isDone(): boolean {
    return this.done;
  }
}
