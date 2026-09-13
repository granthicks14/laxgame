import { Rng } from '../../core/rng';
import { clamp } from '../../core/math';
import { TEAMS, type HoopsTeam } from './data';
import { LEVELS, LEVEL_ORDER, teamPar, type HoopsLevel } from './levels';
import {
  CONFERENCES_BY_LEVEL, PROGRAMS_BY_LEVEL, type ConferenceInfo, type ProgramRow,
} from './world/programs';

/* ---------------------------------------------------------------------------
 * THE BASKETBALL WORLD
 * ---------------------------------------------------------------------------
 * One registry holding every programme the game knows about, from a small-school
 * high school to a professional club, so a coaching career can move between them
 * without any system needing to know which tier it is looking at.
 *
 * Everything above the top league is DERIVED from the compact tables in
 * world/programs.ts: colours, arena, playing identity, recruiting pull and the
 * talent band the roster is drawn from all come out of one line and the tier it
 * sits in, deterministically, so the world is identical in every save.
 *
 * The top league is not derived. It is the twelve original clubs, exactly as
 * they were written — the same names, the same colours, the same arenas — so
 * Play Now, the standalone Season and everything built on them is untouched by
 * the existence of the pyramid underneath.
 * ------------------------------------------------------------------------- */

/**
 * How a programme plays. It is a real thing, not a label: the scheme system
 * reads it to decide what an AI programme runs, and the fast simulator reads
 * that scheme, so a 'inside' programme really does shoot fewer threes.
 */
export type TeamIdentity = 'balanced' | 'perimeter' | 'inside' | 'pace' | 'defence' | 'guards';

export const IDENTITY_LABEL: Record<TeamIdentity, string> = {
  balanced: 'Balanced',
  perimeter: 'Perimeter-oriented',
  inside: 'Inside-out',
  pace: 'Up-tempo',
  defence: 'Defence-first',
  guards: 'Guard-driven',
};

export interface HoopsWorldTeam extends HoopsTeam {
  level: HoopsLevel;
  /** Conference id at this level. */
  conferenceId: string;
  /** 0-99, WITHIN the level. The best high school and the best club both sit at 95. */
  standing: number;
  /** 0-99 pull with new players. */
  recruiting: number;
  /** 0-99 quality of the staff already in the building. */
  coaching: number;
  identity: TeamIdentity;
  /** The attribute pool this club's roster is drawn from. */
  par: number;
}

/* ------------------------------------------------------------- derivation */

/**
 * Colours are derived so that no two programmes in a conference collide, and
 * every one of them is dark enough to read a white number against.
 */
const PALETTE: [string, string][] = [
  ['#c9452f', '#f2d6a0'], ['#2f4f8f', '#e8ecf5'], ['#1f8f8a', '#0d2a29'],
  ['#6b3fa0', '#e4d8f5'], ['#2b6b3f', '#d8e8c8'], ['#b5872f', '#2a1d05'],
  ['#9c2f4a', '#f5dbe2'], ['#3a3f4a', '#ffb547'], ['#1f5f8f', '#cfe8f5'],
  ['#7a3320', '#f0cfae'], ['#46679c', '#dfe6f2'], ['#2f7a52', '#ddefe0'],
  ['#8f3f7a', '#f5dcef'], ['#556b2f', '#e6eccd'], ['#a04a1f', '#f6ddc4'],
  ['#40506b', '#d9e2f0'],
];

const ARENA_SUFFIX: Record<HoopsLevel, string[]> = {
  'hs-small': ['Gymnasium', 'Fieldhouse', 'Gym'],
  'hs-big': ['Fieldhouse', 'Arena', 'Gymnasium'],
  juco: ['Fieldhouse', 'Gymnasium', 'Activity Center'],
  d3: ['Fieldhouse', 'Gymnasium', 'Athletic Center'],
  d2: ['Arena', 'Fieldhouse', 'Athletic Center'],
  'd1-mid': ['Arena', 'Coliseum', 'Fieldhouse'],
  'd1-high': ['Arena', 'Coliseum', 'Pavilion'],
  dev: ['Arena', 'Center', 'Coliseum'],
  pro: ['Arena', 'Center'],
};

const IDENTITIES: TeamIdentity[] = [
  'balanced', 'perimeter', 'inside', 'pace', 'defence', 'guards',
];

function deriveTeam(row: ProgramRow, level: HoopsLevel, index: number): HoopsWorldTeam {
  const rng = new Rng(`hoops:world:${row.id}`);
  const [primary, secondary] = PALETTE[(index + row.abbr.charCodeAt(0)) % PALETTE.length];
  const suffix = rng.pick(ARENA_SUFFIX[level]);
  const arenaStem = level === 'dev' ? row.name : row.name.split(' ')[0];
  // A stronger programme plays and recruits better than a weak one, but not
  // identically well: a school can be a recruiting magnet with a bad staff.
  const standing = row.tier;
  return {
    id: row.id,
    city: row.name,
    name: row.mascot,
    abbr: row.abbr,
    primary,
    secondary,
    arena: `${arenaStem} ${suffix}`,
    conference: row.conference,
    conferenceId: row.conference,
    level,
    // `prestige` stays the 1-5 scale the roster generator has always used, so
    // one code path builds every roster in the game.
    prestige: clamp(Math.round(1 + (standing / 99) * 4), 1, 5),
    standing,
    recruiting: clamp(Math.round(standing + rng.range(-12, 12)), 1, 99),
    coaching: clamp(Math.round(standing + rng.range(-15, 10)), 1, 99),
    identity: IDENTITIES[rng.int(0, IDENTITIES.length - 1)],
    par: teamPar(level, standing),
  };
}

/* ------------------------------------------------------------- the top league */

/**
 * The twelve original clubs, promoted into the world unchanged. Their standing
 * is read off the prestige they were written with, so the pecking order the
 * standalone Season already had is the pecking order the career sees.
 */
function topLeague(): HoopsWorldTeam[] {
  return TEAMS.map((t) => {
    const rng = new Rng(`hoops:world:pro:${t.id}`);
    const standing = clamp(Math.round(((t.prestige - 1) / 4) * 88 + 8), 1, 99);
    return {
      ...t,
      level: 'pro' as const,
      conferenceId: `pro-${t.conference.toLowerCase()}`,
      standing,
      recruiting: clamp(Math.round(standing + rng.range(-10, 10)), 1, 99),
      coaching: clamp(Math.round(standing + rng.range(-12, 8)), 1, 99),
      identity: IDENTITIES[rng.int(0, IDENTITIES.length - 1)],
      // The band the twelve were already built to: 52 + prestige * 3.4.
      par: 52 + t.prestige * 3.4,
    };
  });
}

/* ------------------------------------------------------------- the registry */

const REGISTRY: HoopsWorldTeam[] = (() => {
  const out: HoopsWorldTeam[] = [];
  for (const level of LEVEL_ORDER) {
    if (level === 'pro') { out.push(...topLeague()); continue; }
    const rows = PROGRAMS_BY_LEVEL[level];
    rows.forEach((row, i) => out.push(deriveTeam(row, level, i)));
  }
  return out;
})();

const BY_ID = new Map(REGISTRY.map((t) => [t.id, t]));

export const allWorldTeams = (): HoopsWorldTeam[] => REGISTRY;

export function worldTeam(id: string): HoopsWorldTeam {
  const t = BY_ID.get(id);
  if (t) return t;
  throw new Error(`unknown basketball programme: ${id}`);
}

export const tryWorldTeam = (id: string): HoopsWorldTeam | null => BY_ID.get(id) ?? null;

export function teamsAtLevel(level: HoopsLevel): HoopsWorldTeam[] {
  return REGISTRY.filter((t) => t.level === level);
}

export function conferencesAt(level: HoopsLevel): ConferenceInfo[] {
  if (level !== 'pro') return CONFERENCES_BY_LEVEL[level];
  return [
    { id: 'pro-east', name: 'Eastern Conference', short: 'East', level: 'pro' },
    { id: 'pro-west', name: 'Western Conference', short: 'West', level: 'pro' },
  ];
}

export function conferenceInfo(level: HoopsLevel, id: string): ConferenceInfo {
  return conferencesAt(level).find((c) => c.id === id)
    ?? { id, name: id, short: id, level };
}

export function teamsInConference(level: HoopsLevel, conferenceId: string): HoopsWorldTeam[] {
  return teamsAtLevel(level).filter((t) => t.conferenceId === conferenceId);
}

/** Every programme, best first, at one level. Used by the job market. */
export function rankedAtLevel(level: HoopsLevel): HoopsWorldTeam[] {
  return [...teamsAtLevel(level)].sort((a, b) => b.standing - a.standing);
}

export const worldSize = (): number => REGISTRY.length;

/** A one-line description of what a programme is, for a job card. */
export function programmeBlurb(t: HoopsWorldTeam): string {
  const info = LEVELS[t.level];
  const rank = t.standing >= 85 ? 'a blue blood'
    : t.standing >= 68 ? 'an established programme'
      : t.standing >= 45 ? 'a solid programme'
        : t.standing >= 25 ? 'a programme with work to do'
          : 'a programme at the bottom of its league';
  return `${info.short} · ${rank} · ${IDENTITY_LABEL[t.identity].toLowerCase()}`;
}
