/* ---------------------------------------------------------------------------
 * THE LACROSSE WORLD
 * ---------------------------------------------------------------------------
 * One registry holding every team the game knows about, from a Class D high
 * school programme to a professional club, so a coaching career can move
 * between them without any system needing to know which tier it is looking at.
 *
 * College and professional teams are BUILT from the compact tables in
 * world/programs.ts rather than written out by hand: a programme's tier decides
 * its ratings, its identity, its venue and its recruiting pull, all derived
 * deterministically so the world is identical for every player and every save.
 * Adding a programme is one row.
 * ------------------------------------------------------------------------- */

import { Rng } from '../core/rng';
import { clamp } from '../core/math';
import { LEVELS, bandFor, universalOverall, withinLevelStanding, type Level } from './levels';
import { setLevelSpan, type LevelSpan } from './levelSpan';
import {
  ALL_CONFERENCES, PROGRAMS_BY_LEVEL, type ConferenceInfo, type ProgramRow, type Region,
} from './world/programs';
import {
  CLASSES, CLASS_ORDER, TEAMS, type ClassKey, type GameTeam, type TeamData, type TeamIdentity,
} from './teams';

export type { Region } from './world/programs';
export { REGION_LABEL } from './world/programs';

/**
 * A team anywhere in the world. It is a GameTeam first — so the match engine,
 * the renderer and the stadium system take it as-is — plus where it sits in the
 * sport and what kind of programme it is.
 */
export interface WorldTeam extends GameTeam {
  level: Level;
  /** Conference id at this level; for high school, the class key. */
  conference: string;
  region: Region;
  /** 0-99 standing of the programme itself: history, facilities, pull. */
  prestige: number;
  /** 0-99 ability to bring in players. */
  recruiting: number;
  /** 0-99 quality of the staff already in the building. */
  coaching: number;
  /** THSLL teams keep their class so Dynasty is untouched. */
  classKey?: ClassKey;
}

/* ------------------------------------------------------------ derivation */

const IDENTITIES: TeamIdentity[] = ['offense', 'defense', 'transition', 'goalie', 'faceoff', 'balanced'];

/** Venue names read as a real ground without pretending to be a specific one. */
const VENUE_SUFFIX: Record<Level, string[]> = {
  hs: ['Stadium', 'Field'],
  d3: ['Field', 'Athletic Field', 'Memorial Field'],
  d2: ['Stadium', 'Athletic Complex', 'Field'],
  d1: ['Stadium', 'Field', 'Athletics Complex'],
  semipro: ['Park', 'Grounds', 'Field'],
  pll: ['Stadium', 'Park'],
};

function venueFor(row: ProgramRow, level: Level, rng: Rng): GameTeam['homeField'] {
  const info = LEVELS[level];
  const suffix = rng.pick(VENUE_SUFFIX[level]);
  const crowd = clamp(
    (0.28 + (row.tier / 99) * 0.6) * info.crowdScale * rng.range(0.92, 1.08),
    0.2, 1,
  );
  const venue: GameTeam['homeField']['venue'] =
    level === 'pll' || level === 'd1' ? 'stadium'
      : level === 'semipro' ? 'complex'
        : row.tier >= 70 ? 'stadium' : 'school';
  const time: GameTeam['homeField']['time'] =
    level === 'pll' ? 'night'
      : level === 'd1' ? (row.tier >= 80 ? 'night' : 'evening')
        : row.tier >= 74 ? 'evening' : 'day';
  const name = level === 'semipro' || level === 'pll'
    ? `${row.name.split(' ')[0]} ${suffix}`
    : `${row.mascot.split(' ').pop()} ${suffix}`;
  return { name, venue, time, crowd };
}

/** How a programme plays, seeded so a team's identity never changes. */
function identityFor(row: ProgramRow, rng: Rng): TeamIdentity {
  // Strong programmes lean toward the identities that win: everyone else has to
  // find an edge somewhere, which is what makes a level feel varied.
  if (row.tier >= 88) return rng.pick(['offense', 'balanced', 'transition'] as TeamIdentity[]);
  return rng.pick(IDENTITIES);
}

const DESCRIPTORS: Record<TeamIdentity, string[]> = {
  offense: ['Score in bunches and dare you to keep up.', 'Six men who can all beat you from anywhere.'],
  defense: ['Nothing comes easily. Every possession is a grind.', 'A defence that makes you shoot from where it wants.'],
  transition: ['Turn a stop into a goal before you have subbed.', 'Push every single possession, all game.'],
  goalie: ['A keeper who steals games on his own.', 'Bend, save, clear, repeat.'],
  faceoff: ['Win the draw, hold the ball, win the game.', 'Possession is the whole plan, and it works.'],
  balanced: ['No obvious weakness and no easy way through.', 'Well coached, well drilled, and hard to surprise.'],
};

/**
 * The range of `tier` values each level's table actually uses. A programme's
 * standing is relative to its own level, so this is what turns it into a
 * universal rating — measured rather than assumed, because editing one row in
 * programs.ts must not silently shift every other team at that level.
 */
const TIER_SPANS: Record<string, { min: number; max: number }> = (() => {
  const out: Record<string, { min: number; max: number }> = {};
  for (const [level, rows] of Object.entries(PROGRAMS_BY_LEVEL)) {
    const tiers = rows.map((r) => r.tier);
    out[level] = { min: Math.min(...tiers), max: Math.max(...tiers) };
  }
  return out;
})();

function ratingsFrom(row: ProgramRow, level: Level, identity: TeamIdentity, rng: Rng) {
  // The one line that makes the world coherent: a programme's standing among
  // its peers becomes a rating on the same scale the whole sport uses.
  const base = universalOverall(level, row.tier, TIER_SPANS[level] ?? { min: 30, max: 99 });
  const lean = (a: number) => clamp(Math.round(base + a + rng.gauss(0, 3)), 25, 99);
  const b: Record<TeamIdentity, { off: number; def: number; gk: number; fo: number; sp: number }> = {
    offense: { off: 6, def: -5, gk: -2, fo: 0, sp: 2 },
    defense: { off: -6, def: 7, gk: 3, fo: 0, sp: -2 },
    transition: { off: 3, def: -2, gk: -1, fo: 2, sp: 8 },
    goalie: { off: -4, def: 2, gk: 10, fo: -1, sp: -1 },
    faceoff: { off: -1, def: 1, gk: 0, fo: 11, sp: 0 },
    balanced: { off: 1, def: 1, gk: 1, fo: 1, sp: 1 },
  };
  const t = b[identity];
  const offense = lean(t.off);
  const defense = lean(t.def);
  const goalie = lean(t.gk);
  const attack = lean(t.off + 1);
  const midfield = lean(t.off * 0.4 + t.def * 0.3);
  const faceoff = lean(t.fo);
  const speed = lean(t.sp);
  const chemistry = clamp(Math.round(base * 0.55 + 32 + rng.gauss(0, 6)), 35, 96);
  // The components carry identity leans and noise, so their weighted sum drifts
  // off the level's slice of the universal scale. The level's band is the
  // contract the rest of the world relies on, so the sum is held inside it.
  const band = LEVELS[level].overallBand;
  const overall = clamp(Math.round(
    offense * 0.32 + defense * 0.3 + goalie * 0.16 + faceoff * 0.08 + midfield * 0.14,
  ), band.lo, band.hi);
  return { overall, offense, defense, goalie, attack, midfield, faceoff, speed, chemistry };
}

function buildProgram(row: ProgramRow, level: Level): WorldTeam {
  const rng = new Rng(`world:${row.id}`);
  const identity = identityFor(row, rng);
  const ratings = ratingsFrom(row, level, identity, rng);
  const short = row.name;
  return {
    id: row.id,
    name: row.name,
    short,
    abbr: row.abbr,
    mascot: row.mascot,
    primary: row.primary,
    secondary: row.secondary,
    trim: '#ffffff',
    identity,
    description: rng.pick(DESCRIPTORS[identity]),
    homeField: venueFor(row, level, rng),
    rivals: [],
    level,
    conference: row.conference,
    region: row.region,
    // Prestige, recruiting pull and staff quality stay on the WITHIN-LEVEL
    // scale: they say how this programme ranks against its own peers, which is
    // what the job market, the recruiting model and the AI all want to know.
    // Only playing strength is universal.
    prestige: row.tier,
    recruiting: clamp(Math.round(row.tier * 0.85 + 10 + rng.gauss(0, 5)), 20, 99),
    coaching: clamp(Math.round(row.tier * 0.7 + 20 + rng.gauss(0, 7)), 25, 99),
    ...ratings,
  };
}

/** Rivals: the two nearest programmes by tier inside a conference. */
function assignRivals(teams: WorldTeam[]): void {
  const byConf = new Map<string, WorldTeam[]>();
  for (const t of teams) {
    const list = byConf.get(t.conference) ?? [];
    list.push(t);
    byConf.set(t.conference, list);
  }
  for (const list of byConf.values()) {
    const sorted = [...list].sort((a, b) => b.prestige - a.prestige);
    for (let i = 0; i < sorted.length; i++) {
      const rivals: string[] = [];
      if (sorted[i - 1]) rivals.push(sorted[i - 1].id);
      if (sorted[i + 1]) rivals.push(sorted[i + 1].id);
      sorted[i].rivals = rivals;
    }
  }
}

/* ------------------------------------------------------------- the world */

function hsToWorld(t: TeamData): WorldTeam {
  // `overall` is universal, so a strong high school programme rates in the
  // seventies against the whole sport. Prestige, recruiting pull and staff are
  // WITHIN-LEVEL ideas — the best team in Class D has enormous pull in Class D
  // — so they are read off its standing among its own peers, plus the weight
  // of the class it plays in.
  const standing = withinLevelStanding('hs', t.overall);
  // These three formulas were tuned against the district's own authored 60-91
  // ratings, and everything downstream of them — expectations, job offers,
  // recruiting appeal, which situation a programme is in — was balanced on the
  // numbers they produced. `standing` is the same information on a 0-99 scale,
  // so it is put back into those units rather than re-tuning the whole chain.
  const districtRating = 60 + (standing / 99) * 31;
  return {
    ...t,
    level: 'hs',
    conference: t.classKey,
    region: 'texas',
    prestige: clamp(Math.round(districtRating * 0.7 + hsClassBonus(t.classKey)), 20, 95),
    recruiting: clamp(Math.round(districtRating * 0.6 + 20), 20, 92),
    coaching: clamp(Math.round(districtRating * 0.5 + 25), 20, 90),
  };
}

function hsClassBonus(key: ClassKey): number {
  return { a: 22, b: 16, 'c-east': 10, 'c-west': 10, d: 4 }[key];
}

const built: WorldTeam[] = [
  ...TEAMS.map(hsToWorld),
  ...(Object.keys(PROGRAMS_BY_LEVEL) as Exclude<Level, 'hs'>[])
    .flatMap((level) => PROGRAMS_BY_LEVEL[level].map((row) => buildProgram(row, level))),
];
assignRivals(built.filter((t) => t.level !== 'hs'));

export const WORLD_TEAMS: WorldTeam[] = built;

const worldById = new Map(WORLD_TEAMS.map((t) => [t.id, t]));

/* ------------------------------------------------------- the player scale */

/** The range — and the average — of team ratings that exists at each level. */
const SPANS: Record<Level, LevelSpan> = (() => {
  const out = {} as Record<Level, LevelSpan>;
  const totals = {} as Record<Level, { sum: number; n: number }>;
  for (const t of built) {
    const cur = out[t.level];
    if (!cur) {
      out[t.level] = { min: t.overall, max: t.overall, mean: t.overall };
      totals[t.level] = { sum: t.overall, n: 1 };
    } else {
      cur.min = Math.min(cur.min, t.overall);
      cur.max = Math.max(cur.max, t.overall);
      totals[t.level].sum += t.overall;
      totals[t.level].n++;
    }
  }
  for (const level of Object.keys(out) as Level[]) {
    out[level].mean = totals[level].sum / totals[level].n;
  }
  return out;
})();

// Publish the measured ranges so player generation can map ratings onto bands
// without depending on the whole registry.
for (const [level, span] of Object.entries(SPANS)) setLevelSpan(level as Level, span);

export function levelSpan(level: Level): LevelSpan {
  return SPANS[level] ?? { min: 40, max: 95, mean: 68 };
}

/**
 * The attribute pool a team's players are drawn from, in absolute terms. This
 * is what makes a step up the ladder a step up: the same coach, the same
 * engine, better opponents. High school is the scale everything else is
 * measured against, so it passes through unchanged.
 */
export function poolFor(team: { level?: Level }, rating: number): number {
  const level = team.level ?? 'hs';
  return bandFor(level, rating, levelSpan(level));
}

export function worldTeam(id: string): WorldTeam {
  const t = worldById.get(id);
  if (!t) throw new Error(`Unknown world team: ${id}`);
  return t;
}

export function tryWorldTeam(id: string | null | undefined): WorldTeam | null {
  return id ? worldById.get(id) ?? null : null;
}

export function teamsAtLevel(level: Level): WorldTeam[] {
  return WORLD_TEAMS.filter((t) => t.level === level);
}

export function teamsInConference(conference: string): WorldTeam[] {
  return WORLD_TEAMS.filter((t) => t.conference === conference);
}

/* ---------------------------------------------------------- conferences */

const hsConferences: ConferenceInfo[] = CLASS_ORDER.map((key) => ({
  id: key,
  name: CLASSES[key].name,
  short: CLASSES[key].short,
  level: 'hs' as Level,
  autoBid: false,
}));

export const CONFERENCES: ConferenceInfo[] = [...hsConferences, ...ALL_CONFERENCES];

const confById = new Map(CONFERENCES.map((c) => [c.id, c]));

export function conference(id: string): ConferenceInfo {
  const c = confById.get(id);
  if (!c) throw new Error(`Unknown conference: ${id}`);
  return c;
}

export function conferencesAtLevel(level: Level): ConferenceInfo[] {
  return CONFERENCES.filter((c) => c.level === level);
}

export type { ConferenceInfo } from './world/programs';

/* -------------------------------------------------------------- checks */

/** Structural problems in the world, reported once at startup. */
export function validateWorld(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const t of WORLD_TEAMS) {
    if (seen.has(t.id)) problems.push(`duplicate world team id: ${t.id}`);
    seen.add(t.id);
    if (!confById.has(t.conference)) {
      problems.push(`${t.id} plays in unknown conference "${t.conference}"`);
    }
    if (confById.get(t.conference)?.level !== t.level) {
      problems.push(`${t.id} is ${t.level} but its conference is not`);
    }
  }
  for (const c of CONFERENCES) {
    const n = teamsInConference(c.id).length;
    // Four is the fewest a conference can be and still produce a real season.
    if (n < 4) problems.push(`conference ${c.id} has only ${n} teams`);
  }
  return problems;
}
