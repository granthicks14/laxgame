/** Deterministic, seedable RNG (mulberry32). Used for season sims and roster generation
 *  so that results are reproducible from a saved seed. */
export class Rng {
  private s: number;

  constructor(seed: number | string = Date.now()) {
    this.s = typeof seed === 'string' ? Rng.hash(seed) : seed >>> 0;
    if (this.s === 0) this.s = 0x9e3779b9;
  }

  static hash(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** float in [0,1) */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** float in [min,max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** integer in [min,max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  bool(chance = 0.5): boolean {
    return this.next() < chance;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const a = arr[i];
      arr[i] = arr[j];
      arr[j] = a;
    }
    return arr;
  }

  /** Roughly normal distribution via sum of uniforms, clamped to +/-3 sigma. */
  gauss(mean = 0, sd = 1): number {
    const u = this.next() + this.next() + this.next() + this.next() + this.next() + this.next();
    return mean + (u - 3) * sd;
  }

  get seed(): number {
    return this.s;
  }
}

export const globalRng = new Rng(Date.now() ^ 0x5f3759df);
