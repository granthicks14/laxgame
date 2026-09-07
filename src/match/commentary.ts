import { Rng } from '../core/rng';

const POOLS = {
  goal: ['GOAL!', 'BURIED IT!', 'TOP SHELF!', 'HE SCORES!', 'FINISHES IT!', 'CASH!'],
  bigGoal: ['WHAT A FINISH!', 'ARE YOU KIDDING?!', 'THE CROWD IS UP!', 'ABSOLUTE ROCKET!'],
  save: ['WHAT A SAVE!', 'DENIED!', 'HUGE STOP!', 'STONEWALLED!', 'NOT TODAY!'],
  post: ['OFF THE PIPE!', 'IRON!', 'INCHES AWAY!'],
  intercept: ['INTERCEPTED!', 'PICKED OFF!', 'READ IT PERFECTLY!'],
  check: ['BIG CHECK!', 'STRIPPED HIM!', 'TAKEAWAY!', 'LAID HIM OUT!'],
  groundBall: ['SCOOPED!', 'HE HAS IT!', 'GROUND BALL!'],
  fastBreak: ['FAST BREAK!', 'NUMBERS UP!', 'THEY ARE GONE!'],
  turnover: ['TURNOVER!', 'THROWN AWAY!', 'SLOPPY!'],
  faceoffWin: ['CLAMP AND GO!', 'WINS IT CLEAN!', 'OWNS THE X!'],
  clutch: ['CLUTCH!', 'ICE IN HIS VEINS!', 'WHAT A TIME FOR IT!'],
} as const;

export type CommentaryKey = keyof typeof POOLS;

/** Keeps commentary rare enough to stay exciting. */
export class Commentary {
  private rng: Rng;
  private lastAt = new Map<CommentaryKey, number>();
  private lastLine = '';
  private t = 0;

  constructor(seed: number) {
    this.rng = new Rng(seed ^ 0x1234);
  }

  tick(dt: number): void {
    this.t += dt;
  }

  /** Returns a line, or null if this type fired too recently. */
  say(key: CommentaryKey, minGap = 6): string | null {
    const last = this.lastAt.get(key) ?? -999;
    if (this.t - last < minGap) return null;
    this.lastAt.set(key, this.t);
    const pool = POOLS[key];
    let line = this.rng.pick(pool);
    if (line === this.lastLine && pool.length > 1) line = this.rng.pick(pool);
    this.lastLine = line;
    return line;
  }
}
