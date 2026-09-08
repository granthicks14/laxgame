import { Rng } from '../core/rng';
import type { TimeOfDay } from '../data/teams';
import type { Region } from '../data/world/programs';

/* ---------------------------------------------------------------------------
 * WEATHER
 * ---------------------------------------------------------------------------
 * Weather is presentation first. It changes the light, the sky and the crowd,
 * and it gives every fixture a bit of character. The only mechanical effect is
 * light rain, and it is deliberately tiny — a wet ball is a texture, not a
 * handicap. Nothing here can decide a game.
 *
 * Conditions are deterministic from the match seed, so a replayed fixture looks
 * the same, and the temperature is generated locally: no weather API, no key,
 * nothing to pay for. A game in the northeast in March is a different afternoon
 * from one in Texas, so the REGION shifts both the sky and the thermometer.
 * ------------------------------------------------------------------------- */

export type WeatherKind = 'sunny' | 'cloudy' | 'evening' | 'night' | 'rain';

export interface Weather {
  kind: WeatherKind;
  label: string;
  /** Full-screen tint applied after the world is drawn. */
  tint: string | null;
  alpha: number;
  /** Falling rain, drawn as streaks. 0 = none. */
  rain: number;
  /** Multiplies the light on the pitch. 1 = midday. */
  light: number;
  /** Stadium lights are on and pooling on the grass. */
  lights: boolean;
  /** Fahrenheit, generated — this game has no weather feed. */
  tempF: number;
  /** Very small handling penalties. Both are ~1 for everything but rain. */
  passAccuracy: number;
  footing: number;
}

const BASE = {
  tint: null as string | null,
  alpha: 0,
  rain: 0,
  light: 1,
  lights: false,
  passAccuracy: 1,
  footing: 1,
};

const TABLE: Record<WeatherKind, Omit<Weather, 'tempF'>> = {
  sunny: { ...BASE, kind: 'sunny', label: 'Clear', tint: '#fff0c2', alpha: 0.05, light: 1.06 },
  cloudy: { ...BASE, kind: 'cloudy', label: 'Overcast', tint: '#8a97a8', alpha: 0.13, light: 0.92 },
  evening: { ...BASE, kind: 'evening', label: 'Sunset', tint: '#ff9a4d', alpha: 0.14, light: 0.88, lights: true },
  night: { ...BASE, kind: 'night', label: 'Clear and cool', tint: '#0d2044', alpha: 0.2, light: 0.8, lights: true },
  rain: {
    ...BASE, kind: 'rain', label: 'Light rain', tint: '#5f7c96', alpha: 0.17, light: 0.84,
    rain: 1, passAccuracy: 0.97, footing: 0.98,
  },
};

/** How each part of the country plays in the spring: wetter, greyer, colder. */
const CLIMATE: Record<Region, { wet: number; degrees: number }> = {
  texas: { wet: 0, degrees: 0 },
  south: { wet: 0.03, degrees: 4 },
  west: { wet: -0.06, degrees: -2 },
  midwest: { wet: 0.08, degrees: -10 },
  'mid-atlantic': { wet: 0.07, degrees: -6 },
  northeast: { wet: 0.11, degrees: -13 },
};

/** Time of day sets the light; the roll picks the sky on top of it. */
export function weatherFor(seed: number, time: TimeOfDay = 'day', region: Region = 'texas'): Weather {
  const rng = new Rng(seed ^ 0x7a11ed);
  const roll = rng.next();
  const climate = CLIMATE[region] ?? CLIMATE.texas;
  const wet = climate.wet;
  let kind: WeatherKind;
  if (time === 'night') kind = roll < 0.82 - wet ? 'night' : 'rain';
  else if (time === 'evening') kind = roll < 0.66 ? 'evening' : roll < 0.86 - wet ? 'cloudy' : 'rain';
  else kind = roll < 0.55 - wet * 0.5 ? 'sunny' : roll < 0.84 - wet ? 'cloudy' : 'rain';

  const base = TABLE[kind];
  // A spring afternoon, shifted by where in the country the game is played.
  const warm = (time === 'day' ? 74 : time === 'evening' ? 68 : 61) + climate.degrees;
  const tempF = Math.round(warm + rng.range(-7, 9) - (kind === 'rain' ? 6 : 0) + (kind === 'sunny' ? 4 : 0));
  return { ...base, tempF };
}

export const TIME_LABEL: Record<TimeOfDay, string> = {
  day: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

/** Rain streaks, drawn straight onto the buffer. Cheap: no particle objects. */
export function drawRain(
  ctx: CanvasRenderingContext2D, w: number, h: number, t: number, amount: number,
): void {
  if (amount <= 0) return;
  const drops = Math.round(w * h * 0.0016 * amount);
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#cfe3f2';
  for (let i = 0; i < drops; i++) {
    // Deterministic per-drop lane, animated by time: no allocation, no state.
    const lane = (i * 97) % w;
    const speed = 90 + (i % 7) * 22;
    const y = (t * speed + i * 53) % (h + 12) - 6;
    const x = (lane + y * 0.22) % w;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 3);
  }
  ctx.restore();
}
