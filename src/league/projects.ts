/* ---------------------------------------------------------------------------
 * DEVELOPMENT PROJECTS
 * ---------------------------------------------------------------------------
 * A coach does not develop a squad evenly. He picks two or three players and
 * decides what they are going to become, and that choice costs him something
 * somewhere else.
 *
 * A project is a season-long commitment to one player:
 *   - it concentrates his offseason growth into a named set of attributes
 *   - it costs Coach Points up front, which is the real budget
 *   - it has a TRADEOFF: growth outside the project is suppressed, so a player
 *     on a shooting project genuinely does get worse at defending relative to
 *     where he would have been
 *
 * The point is that you cannot put every player on a project, and the ones you
 * choose are the ones who become what your team needs rather than what they
 * happened to be.
 * ------------------------------------------------------------------------- */

import type { PlayerAttrs, PlayerData } from '../data/players';

export interface ProjectInfo {
  key: string;
  label: string;
  blurb: string;
  /** What it costs to commit a player for a season. */
  cost: number;
  /** Attributes the project drives hard. */
  focus: (keyof PlayerAttrs)[];
  /** What suffers, in plain words. */
  tradeoff: string;
}

export const PROJECTS: ProjectInfo[] = [
  {
    key: 'shooting',
    label: 'Shooting overhaul',
    blurb: 'Rebuild his release and his placement. He finishes what he gets.',
    cost: 8,
    focus: ['shooting', 'shotAccuracy', 'shotPower'],
    tradeoff: 'Everything outside his shot stalls for the year.',
  },
  {
    key: 'athletic',
    label: 'Athletic development',
    blurb: 'A year in the weight room and on the track.',
    cost: 8,
    focus: ['speed', 'acceleration', 'stamina'],
    tradeoff: 'Stick skills go untouched while he builds a body.',
  },
  {
    key: 'defensive',
    label: 'Defensive retooling',
    blurb: 'Footwork, positioning and the discipline to wait for the check.',
    cost: 8,
    focus: ['defense', 'checking', 'awareness'],
    tradeoff: 'He will not add anything on the offensive end.',
  },
  {
    key: 'iq',
    label: 'Film study',
    blurb: 'Hours of tape. He starts seeing the play before it happens.',
    cost: 6,
    focus: ['awareness', 'passing'],
    tradeoff: 'Slow, unglamorous growth. No physical gains at all.',
  },
  {
    key: 'dodging',
    label: 'One-on-one work',
    blurb: 'Give him a move he can beat anybody with.',
    cost: 8,
    focus: ['dodging', 'acceleration'],
    tradeoff: 'His off-ball game and his defence both go backwards.',
  },
  {
    key: 'faceoff',
    label: 'Faceoff training',
    blurb: 'Hands, hips and the counter when the clamp is beaten.',
    cost: 7,
    focus: ['faceoff', 'checking'],
    tradeoff: 'Nothing else about his game moves this year.',
  },
  {
    key: 'goalie',
    label: 'Goalie technique',
    blurb: 'Arc, hands and the outlet pass that starts the break.',
    cost: 8,
    focus: ['goalie', 'awareness', 'passing'],
    tradeoff: 'A year entirely in the cage.',
  },
  {
    key: 'wellrounded',
    label: 'Complete player',
    blurb: 'No specialism. Push everything a little.',
    cost: 10,
    focus: [],
    tradeoff: 'Costs the most and produces the least in any one area.',
  },
];

const BY_KEY = new Map(PROJECTS.map((p) => [p.key, p]));

export function project(key: string | null | undefined): ProjectInfo | null {
  return key ? BY_KEY.get(key) ?? null : null;
}

/** Projects that make sense for this player, best fit first. */
export function projectsFor(p: PlayerData): ProjectInfo[] {
  const rank: Record<string, number> = {};
  const pos = p.pos;
  const good = pos === 'G' ? ['goalie', 'iq', 'athletic']
    : pos === 'FO' ? ['faceoff', 'athletic', 'defensive']
      : pos === 'D' ? ['defensive', 'athletic', 'iq']
        : pos === 'A' ? ['shooting', 'dodging', 'iq']
          : ['athletic', 'shooting', 'defensive'];
  good.forEach((k, i) => { rank[k] = i; });
  return [...PROJECTS].sort((a, b) => (rank[a.key] ?? 9) - (rank[b.key] ?? 9));
}

/** Total Coach Points currently committed to projects. */
export function committedCost(roster: PlayerData[]): number {
  return roster.reduce((n, p) => n + (project(p.project)?.cost ?? 0), 0);
}
