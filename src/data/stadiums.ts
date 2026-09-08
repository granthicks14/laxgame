/* ---------------------------------------------------------------------------
 * STADIUMS
 * ---------------------------------------------------------------------------
 * One reusable stadium architecture, configured per team, rather than a
 * hand-built environment for each of the thirty-eight programmes. Everything
 * here is derived from data the team already carries — its venue kind, crowd
 * size, colours and identity — so adding a team gives it a home ground for
 * free, and pinning a specific look is a one-line override.
 *
 * These are STYLISED retro venues, not reproductions of real stadiums.
 * ------------------------------------------------------------------------- */

import type { TeamData, TimeOfDay } from './teams';

export type StadiumStyle =
  /** Seating down both sides, press box, towers: the Friday-night look. */
  | 'bowl'
  /** One big home-side grandstand, small visitor bleachers opposite. */
  | 'grandstand'
  /** Portable bleachers on a school practice field. */
  | 'bleachers'
  /** Club complex: low stands, fence, parking and a scoreboard trailer. */
  | 'complex';

export interface StadiumConfig {
  name: string;
  style: StadiumStyle;
  /** 0..1 of the available surround depth taken by the home-side stands. */
  homeDepth: number;
  awayDepth: number;
  pressBox: boolean;
  lightTowers: boolean;
  /** A branded scoreboard structure behind one end line. */
  scoreboard: 'big' | 'small' | 'none';
  /** Which end line the scoreboard sits behind. */
  scoreboardEnd: 'home' | 'away';
  banners: boolean;
  treeLine: boolean;
  fence: boolean;
  /** Team mark painted at midfield. */
  midfieldLogo: boolean;
  /** Programme name painted across the end zone. */
  endzoneText: boolean;
  crowd: number;
  time: TimeOfDay;
}

const OVERRIDES: Record<string, Partial<StadiumConfig>> = {
  'highland-park': { style: 'bowl', pressBox: true, lightTowers: true, scoreboard: 'big' },
  'dallas-jesuit': { style: 'bowl', pressBox: true, lightTowers: true, scoreboard: 'big' },
  'southlake-carroll': { style: 'bowl', pressBox: true, lightTowers: true, scoreboard: 'big' },
  esd: { style: 'complex', scoreboard: 'small', treeLine: true },
  'bridge': { style: 'complex', fence: true, scoreboard: 'none' },
};

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function stadiumFor(team: TeamData): StadiumConfig {
  const f = team.homeField;
  const h = hash(team.id);
  const bit = (n: number) => ((h >>> n) & 1) === 1;

  let style: StadiumStyle;
  if (f.venue === 'stadium') style = f.crowd >= 0.82 ? 'bowl' : 'grandstand';
  else if (f.venue === 'school') style = 'bleachers';
  else style = 'complex';

  const big = style === 'bowl';
  const base: StadiumConfig = {
    name: f.name,
    style,
    homeDepth: big ? 1 : style === 'grandstand' ? 0.86 : style === 'complex' ? 0.5 : 0.42,
    awayDepth: big ? 0.8 : style === 'grandstand' ? 0.4 : style === 'complex' ? 0.34 : 0.3,
    pressBox: big,
    lightTowers: big || (style === 'grandstand' && f.time !== 'day'),
    scoreboard: big ? 'big' : style === 'bleachers' ? 'none' : 'small',
    scoreboardEnd: bit(3) ? 'away' : 'home',
    banners: f.crowd > 0.55,
    treeLine: style === 'complex' || style === 'bleachers' ? bit(7) : false,
    fence: style !== 'bowl',
    midfieldLogo: true,
    endzoneText: f.crowd > 0.45,
    crowd: f.crowd,
    time: f.time,
  };
  return { ...base, ...OVERRIDES[team.id] };
}

export const STYLE_LABEL: Record<StadiumStyle, string> = {
  bowl: 'Stadium',
  grandstand: 'Grandstand',
  bleachers: 'School field',
  complex: 'Athletic complex',
};
