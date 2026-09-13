/* ---------------------------------------------------------------------------
 * AUDIO
 * ---------------------------------------------------------------------------
 * All audio is synthesised with the Web Audio API — there are no sound files to
 * load, nothing to license, and nothing that can 404. If the browser blocks
 * audio entirely the game keeps running silently.
 *
 * The engine owns the SYNTHESIS and nothing about any sport. A sport supplies a
 * SOUND PACK: a map from sound name to a recipe written against the two
 * primitives below, `tone` and `noise`, plus the crowd. A rim rattling and a
 * lacrosse ball hitting the post are two recipes, not two engines, and swapping
 * sports swaps the pack.
 *
 * Interface sounds are the exception and live here, because the hub itself makes
 * them before any sport has loaded.
 *
 * `play` takes a plain string rather than a per-sport union, deliberately: the
 * alternative couples this file to every sport's sound list, or renames every
 * `audio.play` call site in the game. A name with no recipe is a no-op, and
 * `npm run sounds` fails the build if any name the game plays has none, which
 * catches the typo that the union would have caught.
 * ------------------------------------------------------------------------- */

/** What a sound recipe is allowed to do. */
export interface SynthApi {
  /** An oscillator blip. `slideTo` sweeps the pitch across the duration. */
  tone(
    freq: number, dur: number, type: OscillatorType, gain: number,
    slideTo?: number, delay?: number,
  ): void;
  /** Band-passed noise — impacts, scrapes, whistles. `sweepTo` moves the band. */
  noise(
    dur: number, gain: number, filterFreq: number, q?: number,
    delay?: number, sweepTo?: number,
  ): void;
  /** A crowd swell over the ambient bed. */
  cheer(intensity: number, dur: number): void;
}

/** One sound, in terms of the primitives. `intensity` is 0..1-ish from the game. */
export type SoundRecipe = (a: SynthApi, intensity: number) => void;

/** A sport's sounds, by name. */
export type SoundPack = Record<string, SoundRecipe>;

/** Interface sounds every screen in the hub can make, sport or no sport. */
export const UI_SOUNDS: SoundPack = {
  ui: (a) => {
    a.tone(880, 0.05, 'square', 0.05);
    a.tone(1320, 0.05, 'square', 0.035, undefined, 0.035);
  },
  uiBack: (a) => {
    a.tone(520, 0.06, 'square', 0.05);
    a.tone(360, 0.07, 'square', 0.04, undefined, 0.04);
  },
  error: (a) => {
    a.tone(180, 0.16, 'square', 0.07, 120);
  },
  /** The hub handing over to a sport. */
  launch: (a) => {
    a.tone(330, 0.1, 'square', 0.07);
    a.tone(440, 0.1, 'square', 0.07, undefined, 0.08);
    a.tone(660, 0.22, 'square', 0.08, undefined, 0.16);
  },
  crowdUp: (a, intensity) => a.cheer(intensity, 1.4),
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private crowdGain: GainNode | null = null;
  private crowdSource: AudioBufferSourceNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private failed = false;

  sfxVolume = 0.7;
  musicVolume = 0.32;
  enabled = true;

  /** Must be called from a user gesture the first time. */
  unlock(): void {
    if (this.failed || this.ctx) {
      void this.ctx?.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) { this.failed = true; return; }
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(ctx.destination);

      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.master);

      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.master);

      this.crowdGain = ctx.createGain();
      this.crowdGain.gain.value = 0;
      this.crowdGain.connect(this.master);

      // 2 seconds of pink-ish noise, reused for crowd and percussive effects.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let b0 = 0; let b1 = 0; let b2 = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099;
        b1 = 0.963 * b1 + white * 0.2965;
        b2 = 0.57 * b2 + white * 1.0526;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.22;
      }
      this.noiseBuffer = buf;
      void ctx.resume();
    } catch (err) {
      console.warn('[audio] unavailable', err);
      this.failed = true;
    }
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxVolume = sfx;
    this.musicVolume = music;
    if (this.sfxGain) this.sfxGain.gain.value = sfx;
    if (this.musicGain) this.musicGain.gain.value = music;
  }

  private now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private tone(
    freq: number, dur: number, type: OscillatorType, gain: number,
    slideTo?: number, delay = 0,
  ): void {
    const ctx = this.ctx;
    const dest = this.sfxGain;
    if (!ctx || !dest || !this.enabled) return;
    const t = this.now() + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  private noise(dur: number, gain: number, filterFreq: number, q = 1, delay = 0, sweepTo?: number): void {
    const ctx = this.ctx;
    const dest = this.sfxGain;
    if (!ctx || !dest || !this.noiseBuffer || !this.enabled) return;
    const t = this.now() + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, t);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t + dur);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** The recipe surface handed to a sound pack. */
  private readonly api: SynthApi = {
    tone: (freq, dur, type, gain, slideTo, delay) =>
      this.tone(freq, dur, type, gain, slideTo, delay),
    noise: (dur, gain, filterFreq, q, delay, sweepTo) =>
      this.noise(dur, gain, filterFreq, q, delay, sweepTo),
    cheer: (intensity, dur) => this.cheer(intensity, dur),
  };

  private pack: SoundPack = {};

  /**
   * Point the engine at a sport's sounds. Called when a sport loads; the
   * interface pack is always available underneath, so menus keep their clicks.
   */
  usePack(pack: SoundPack): void {
    this.pack = pack;
  }

  /** Is there a recipe for this name? Used by the sound-coverage check. */
  knows(name: string): boolean {
    return !!(this.pack[name] ?? UI_SOUNDS[name]);
  }

  play(name: string, intensity = 1): void {
    if (!this.ctx || !this.enabled) return;
    const recipe = this.pack[name] ?? UI_SOUNDS[name];
    if (!recipe) return;
    recipe(this.api, intensity);
  }

  /** Crowd swell layered over the ambient bed. */
  private cheer(intensity: number, dur: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.crowdGain || !this.noiseBuffer || !this.enabled) return;
    const t = this.now();
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(700, t);
    filter.frequency.linearRampToValueAtTime(1500, t + dur * 0.3);
    filter.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22 * intensity * this.sfxVolume, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.1);
  }

  /** Low ambient crowd bed during play. `level` is 0..1. */
  setCrowd(level: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.crowdGain || !this.noiseBuffer) return;
    if (!this.crowdSource && level > 0) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 620;
      src.connect(filter);
      filter.connect(this.crowdGain);
      src.start();
      this.crowdSource = src;
    }
    const target = this.enabled ? level * 0.1 * this.sfxVolume : 0;
    this.crowdGain.gain.setTargetAtTime(target, this.now(), 0.4);
  }

  stopCrowd(): void {
    if (this.crowdGain) this.crowdGain.gain.setTargetAtTime(0, this.now(), 0.2);
  }

  // ------------------------------------------------------------- music
  private static readonly MELODY = [
    0, 7, 12, 7, 3, 10, 15, 10,
    5, 12, 17, 12, 3, 10, 14, 10,
  ];
  private static readonly BASS = [0, 0, 5, 5, 3, 3, 7, 7];

  startMusic(): void {
    if (!this.ctx || this.musicTimer !== null || !this.enabled) return;
    const stepMs = 190;
    this.musicStep = 0;
    this.musicTimer = window.setInterval(() => this.musicTick(), stepMs);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private musicTick(): void {
    const ctx = this.ctx;
    const dest = this.musicGain;
    if (!ctx || !dest) return;
    const s = this.musicStep++;
    const root = 220;
    const semi = (n: number) => root * Math.pow(2, n / 12);
    const t = this.now();

    const lead = AudioEngine.MELODY[s % AudioEngine.MELODY.length];
    this.blip(semi(lead) * 2, 0.14, 'square', 0.055, t, dest);
    if (s % 2 === 0) {
      const bass = AudioEngine.BASS[Math.floor(s / 2) % AudioEngine.BASS.length];
      this.blip(semi(bass) / 2, 0.24, 'triangle', 0.09, t, dest);
    }
    if (s % 4 === 2 && this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 4200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      src.connect(f); f.connect(g); g.connect(dest);
      src.start(t);
      src.stop(t + 0.09);
    }
  }

  private blip(
    freq: number, dur: number, type: OscillatorType, gain: number, t: number, dest: AudioNode,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
}

export const audio = new AudioEngine();
