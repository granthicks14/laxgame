/* ---------------------------------------------------------------------------
 * LONE STAR LAX — TEAM DATABASE (THSLL North District)
 * ---------------------------------------------------------------------------
 * DATA PROVENANCE — please read before treating any of this as fact:
 *
 *  - School names and division groupings are a BEST-EFFORT snapshot of the
 *    Texas High School Lacrosse League North District. League membership and
 *    division placement change season to season. Verify against thsll.org and
 *    edit this file to match the current year.
 *  - Mascots are the schools' real mascots to the best of our knowledge.
 *  - COLORS ARE APPROXIMATIONS chosen for on-field readability, not official
 *    brand values. Two teams that share colors in real life are deliberately
 *    separated here so you can tell them apart at a glance during play.
 *  - ALL RATINGS ARE FICTIONAL GAME BALANCE VALUES. They are invented for
 *    gameplay and do not describe any real team's actual strength.
 *  - RIVALRIES ARE GAMEPLAY RIVALRIES. Some reflect well-known matchups;
 *    others exist purely to make the schedule interesting. They are not a
 *    historical claim.
 *
 * This file is the single source of truth for the league. Add, remove, or
 * re-rate teams here and the rest of the game (schedules, standings, playoffs,
 * team select, rosters) follows automatically. See docs/EDITING-DATA.md.
 * ------------------------------------------------------------------------- */

export type DivisionKey = 'd1' | 'd2';

export const DIVISIONS: Record<DivisionKey, { name: string; short: string; blurb: string }> = {
  d1: {
    name: 'North District — Division I',
    short: 'Division I',
    blurb: 'The top flight of North Texas high school lacrosse. Deep rosters, real goalies, no nights off.',
  },
  d2: {
    name: 'North District — Division II',
    short: 'Division II',
    blurb: 'Programs on the rise. Win here and you are knocking on Division I’s door.',
  },
};

/** What a team is *known* for. Drives AI tendencies and roster generation. */
export type TeamIdentity = 'offense' | 'defense' | 'transition' | 'goalie' | 'faceoff' | 'balanced';

export const IDENTITY_LABEL: Record<TeamIdentity, string> = {
  offense: 'High-Powered Offense',
  defense: 'Defensive Powerhouse',
  transition: 'Fast Transition',
  goalie: 'Elite Goaltending',
  faceoff: 'Faceoff Dominant',
  balanced: 'Balanced Program',
};

export type VenueKind = 'stadium' | 'school' | 'complex';
export type TimeOfDay = 'day' | 'evening' | 'night';

export interface HomeField {
  name: string;
  venue: VenueKind;
  time: TimeOfDay;
  /** 0..1 — drives crowd density and noise. */
  crowd: number;
}

export interface TeamRatings {
  overall: number;
  offense: number;
  defense: number;
  goalie: number;
  attack: number;
  midfield: number;
  faceoff: number;
  speed: number;
  chemistry: number;
}

export interface TeamData extends TeamRatings {
  id: string;
  name: string;
  short: string;
  /** 3-4 char scoreboard abbreviation. */
  abbr: string;
  mascot: string;
  division: DivisionKey;
  primary: string;
  secondary: string;
  /** Number/text color drawn on the jersey. */
  trim: string;
  identity: TeamIdentity;
  description: string;
  homeField: HomeField;
  /** Gameplay rivalries, by team id. */
  rivals: string[];
}

/* eslint-disable max-len */
export const TEAMS: TeamData[] = [
  // ---------------------------------------------------------------- DIVISION I
  {
    id: 'highland-park', name: 'Highland Park', short: 'Highland Park', abbr: 'HP', mascot: 'Scots',
    division: 'd1', primary: '#3f6fd0', secondary: '#f5d020', trim: '#ffffff',
    identity: 'offense',
    description: 'Relentless ball movement and a two-man game that punishes any slide half a step late.',
    homeField: { name: 'Highlander Stadium', venue: 'stadium', time: 'night', crowd: 0.95 },
    rivals: ['jesuit-dallas', 'esd'],
    overall: 89, offense: 93, defense: 85, goalie: 86, attack: 94, midfield: 89, faceoff: 83, speed: 87, chemistry: 90,
  },
  {
    id: 'jesuit-dallas', name: 'Jesuit Dallas', short: 'Jesuit', abbr: 'JES', mascot: 'Rangers',
    division: 'd1', primary: '#0b2f6b', secondary: '#d9a441', trim: '#ffffff',
    identity: 'balanced',
    description: 'The measuring stick. No obvious weakness, and they will grind you down over four quarters.',
    homeField: { name: 'Postell Stadium', venue: 'stadium', time: 'night', crowd: 1.0 },
    rivals: ['highland-park', 'st-marks'],
    overall: 91, offense: 90, defense: 91, goalie: 90, attack: 89, midfield: 92, faceoff: 90, speed: 86, chemistry: 93,
  },
  {
    id: 'st-marks', name: "St. Mark's", short: "St. Mark's", abbr: 'STM', mascot: 'Lions',
    division: 'd1', primary: '#1d4fa8', secondary: '#e8eaf0', trim: '#ffffff',
    identity: 'goalie',
    description: 'A goalie who steals games and a defense happy to make you shoot from twelve yards out.',
    homeField: { name: 'Hunt Family Stadium', venue: 'stadium', time: 'evening', crowd: 0.8 },
    rivals: ['jesuit-dallas', 'esd'],
    overall: 84, offense: 79, defense: 88, goalie: 94, attack: 78, midfield: 82, faceoff: 80, speed: 78, chemistry: 87,
  },
  {
    id: 'southlake-carroll', name: 'Southlake Carroll', short: 'Southlake', abbr: 'SLC', mascot: 'Dragons',
    division: 'd1', primary: '#0f6b3c', secondary: '#f2f2f2', trim: '#ffffff',
    identity: 'transition',
    description: 'Push it every single time. Win a groundball at midfield and they are already at your crease.',
    homeField: { name: 'Dragon Stadium', venue: 'stadium', time: 'night', crowd: 0.98 },
    rivals: ['marcus', 'byron-nelson'],
    overall: 86, offense: 87, defense: 82, goalie: 83, attack: 85, midfield: 91, faceoff: 86, speed: 93, chemistry: 84,
  },
  {
    id: 'marcus', name: 'Flower Mound Marcus', short: 'Marcus', abbr: 'MAR', mascot: 'Marauders',
    division: 'd1', primary: '#7d1128', secondary: '#d5d8dd', trim: '#ffffff',
    identity: 'defense',
    description: 'Heavy poles, brutal slides, and zero interest in a track meet. Low-scoring by design.',
    homeField: { name: 'Marauder Field', venue: 'school', time: 'evening', crowd: 0.72 },
    rivals: ['southlake-carroll', 'coppell'],
    overall: 82, offense: 76, defense: 90, goalie: 84, attack: 75, midfield: 80, faceoff: 82, speed: 76, chemistry: 85,
  },
  {
    id: 'esd', name: 'Episcopal School of Dallas', short: 'ESD', abbr: 'ESD', mascot: 'Eagles',
    division: 'd1', primary: '#b4232f', secondary: '#16307a', trim: '#ffffff',
    identity: 'offense',
    description: 'Skilled, patient, and dangerous from X. They will hold the ball until you make a mistake.',
    homeField: { name: 'Jones Family Field', venue: 'complex', time: 'evening', crowd: 0.7 },
    rivals: ['highland-park', 'st-marks'],
    overall: 80, offense: 85, defense: 75, goalie: 78, attack: 88, midfield: 79, faceoff: 74, speed: 80, chemistry: 81,
  },
  {
    id: 'prosper', name: 'Prosper', short: 'Prosper', abbr: 'PRO', mascot: 'Eagles',
    division: 'd1', primary: '#14204f', secondary: '#c9ced8', trim: '#ffffff',
    identity: 'faceoff',
    description: 'A FOGO who refuses to lose a clamp. Possession numbers that make the scoreboard look unfair.',
    homeField: { name: 'Children’s Health Stadium', venue: 'stadium', time: 'night', crowd: 0.88 },
    rivals: ['mckinney', 'frisco'],
    overall: 79, offense: 78, defense: 78, goalie: 76, attack: 76, midfield: 82, faceoff: 94, speed: 79, chemistry: 77,
  },
  {
    id: 'plano', name: 'Plano', short: 'Plano', abbr: 'PLA', mascot: 'Wildcats',
    division: 'd1', primary: '#c1272d', secondary: '#1a1c22', trim: '#ffffff',
    identity: 'balanced',
    description: 'Big, physical middies and a coaching staff that never lets a game get out of hand early.',
    homeField: { name: 'Clark Stadium', venue: 'stadium', time: 'evening', crowd: 0.76 },
    rivals: ['coppell', 'mckinney'],
    overall: 78, offense: 77, defense: 79, goalie: 77, attack: 75, midfield: 81, faceoff: 78, speed: 77, chemistry: 79,
  },
  {
    id: 'coppell', name: 'Coppell', short: 'Coppell', abbr: 'COP', mascot: 'Cowboys',
    division: 'd1', primary: '#1c1f26', secondary: '#d4262f', trim: '#ffffff',
    identity: 'defense',
    description: 'A packed-in defense that dares you to shoot outside. Clearing is where they get in trouble.',
    homeField: { name: 'Buddy Echols Field', venue: 'stadium', time: 'evening', crowd: 0.74 },
    rivals: ['plano', 'marcus'],
    overall: 76, offense: 71, defense: 84, goalie: 80, attack: 70, midfield: 74, faceoff: 75, speed: 72, chemistry: 78,
  },
  {
    id: 'mckinney', name: 'McKinney', short: 'McKinney', abbr: 'MCK', mascot: 'Lions',
    division: 'd1', primary: '#b3141c', secondary: '#e0b83a', trim: '#ffffff',
    identity: 'transition',
    description: 'Young, fast, and streaky. When the transition offense is clicking they can beat anybody.',
    homeField: { name: 'Ron Poe Stadium', venue: 'stadium', time: 'night', crowd: 0.7 },
    rivals: ['prosper', 'plano'],
    overall: 74, offense: 76, defense: 70, goalie: 72, attack: 75, midfield: 79, faceoff: 73, speed: 85, chemistry: 68,
  },
  {
    id: 'rockwall', name: 'Rockwall', short: 'Rockwall', abbr: 'RWL', mascot: 'Yellowjackets',
    division: 'd1', primary: '#e2701e', secondary: '#16181c', trim: '#ffffff',
    identity: 'balanced',
    description: 'Blue-collar program. Wins groundballs, loses close games, and never stops running.',
    homeField: { name: 'Wilkerson-Sanders Stadium', venue: 'stadium', time: 'evening', crowd: 0.66 },
    rivals: ['frisco', 'wylie'],
    overall: 72, offense: 71, defense: 73, goalie: 71, attack: 70, midfield: 74, faceoff: 76, speed: 73, chemistry: 74,
  },
  {
    id: 'frisco', name: 'Frisco', short: 'Frisco', abbr: 'FRI', mascot: 'Raccoons',
    division: 'd1', primary: '#cf2027', secondary: '#f4f4f4', trim: '#ffffff',
    identity: 'goalie',
    description: 'Undersized everywhere except in the cage. Their goalie is the only reason games stay close.',
    homeField: { name: 'Memorial Stadium', venue: 'stadium', time: 'day', crowd: 0.6 },
    rivals: ['prosper', 'rockwall'],
    overall: 70, offense: 65, defense: 72, goalie: 86, attack: 64, midfield: 68, faceoff: 68, speed: 70, chemistry: 71,
  },

  // --------------------------------------------------------------- DIVISION II
  {
    id: 'grapevine', name: 'Grapevine', short: 'Grapevine', abbr: 'GRP', mascot: 'Mustangs',
    division: 'd2', primary: '#6d3fa3', secondary: '#f0d24a', trim: '#ffffff',
    identity: 'offense',
    description: 'The class of Division II. Enough firepower to hang with the bottom half of D-I.',
    homeField: { name: 'Mustang-Panther Stadium', venue: 'stadium', time: 'night', crowd: 0.82 },
    rivals: ['colleyville-heritage', 'byron-nelson'],
    overall: 76, offense: 82, defense: 71, goalie: 73, attack: 84, midfield: 78, faceoff: 74, speed: 80, chemistry: 79,
  },
  {
    id: 'byron-nelson', name: 'Byron Nelson', short: 'Byron Nelson', abbr: 'BYN', mascot: 'Bobcats',
    division: 'd2', primary: '#17233f', secondary: '#b3a369', trim: '#ffffff',
    identity: 'faceoff',
    description: 'Wins the wing battle, wins the groundball, wins the game. Simple and effective.',
    homeField: { name: 'Bobcat Stadium', venue: 'stadium', time: 'evening', crowd: 0.75 },
    rivals: ['grapevine', 'southlake-carroll'],
    overall: 73, offense: 72, defense: 74, goalie: 72, attack: 70, midfield: 78, faceoff: 88, speed: 74, chemistry: 75,
  },
  {
    id: 'colleyville-heritage', name: 'Colleyville Heritage', short: 'Colleyville', abbr: 'CHP', mascot: 'Panthers',
    division: 'd2', primary: '#1c2c54', secondary: '#c0c4cc', trim: '#ffffff',
    identity: 'defense',
    description: 'Disciplined six-man defense. If you take a bad shot, the clear is going the other way fast.',
    homeField: { name: 'Mustang-Panther Stadium', venue: 'stadium', time: 'evening', crowd: 0.72 },
    rivals: ['grapevine', 'fwcd'],
    overall: 72, offense: 67, defense: 80, goalie: 78, attack: 66, midfield: 70, faceoff: 72, speed: 69, chemistry: 78,
  },
  {
    id: 'guyer', name: 'Denton Guyer', short: 'Guyer', abbr: 'GUY', mascot: 'Wildcats',
    division: 'd2', primary: '#123a7a', secondary: '#d92b2b', trim: '#ffffff',
    identity: 'transition',
    description: 'Athletes first, lacrosse players second — and that is somehow working out for them.',
    homeField: { name: 'Bronco Field', venue: 'school', time: 'evening', crowd: 0.62 },
    rivals: ['argyle', 'hebron'],
    overall: 70, offense: 71, defense: 68, goalie: 69, attack: 69, midfield: 76, faceoff: 70, speed: 84, chemistry: 66,
  },
  {
    id: 'argyle', name: 'Argyle', short: 'Argyle', abbr: 'ARG', mascot: 'Eagles',
    division: 'd2', primary: '#1a6b3c', secondary: '#e8c33c', trim: '#ffffff',
    identity: 'balanced',
    description: 'Small school, tight roster, high chemistry. They have played together since sixth grade.',
    homeField: { name: 'Eagle Stadium', venue: 'school', time: 'day', crowd: 0.58 },
    rivals: ['guyer', 'wakeland'],
    overall: 69, offense: 68, defense: 69, goalie: 70, attack: 67, midfield: 70, faceoff: 71, speed: 68, chemistry: 88,
  },
  {
    id: 'wakeland', name: 'Frisco Wakeland', short: 'Wakeland', abbr: 'WAK', mascot: 'Wolverines',
    division: 'd2', primary: '#103a63', secondary: '#7ec8e8', trim: '#ffffff',
    identity: 'offense',
    description: 'Two attackmen who can beat anyone one-on-one, and a defense that gives most of it back.',
    homeField: { name: 'Memorial Stadium', venue: 'stadium', time: 'night', crowd: 0.64 },
    rivals: ['liberty', 'argyle'],
    overall: 68, offense: 75, defense: 61, goalie: 66, attack: 79, midfield: 70, faceoff: 65, speed: 74, chemistry: 67,
  },
  {
    id: 'fwcd', name: 'Fort Worth Country Day', short: 'Country Day', abbr: 'FWCD', mascot: 'Falcons',
    division: 'd2', primary: '#1f7a4d', secondary: '#f0f0f0', trim: '#ffffff',
    identity: 'goalie',
    description: 'A senior goalie stealing one game a week and a roster that never gets tired.',
    homeField: { name: 'Falcon Field', venue: 'complex', time: 'day', crowd: 0.55 },
    rivals: ['nolan-catholic', 'colleyville-heritage'],
    overall: 67, offense: 62, defense: 69, goalie: 84, attack: 61, midfield: 66, faceoff: 66, speed: 67, chemistry: 76,
  },
  {
    id: 'liberty', name: 'Frisco Liberty', short: 'Liberty', abbr: 'LIB', mascot: 'Redhawks',
    division: 'd2', primary: '#c02128', secondary: '#1a1c22', trim: '#ffffff',
    identity: 'balanced',
    description: 'Middle of the table every year. One good recruiting class from being a real problem.',
    homeField: { name: 'Kuykendall Stadium', venue: 'stadium', time: 'evening', crowd: 0.6 },
    rivals: ['wakeland', 'lake-highlands'],
    overall: 66, offense: 66, defense: 65, goalie: 66, attack: 65, midfield: 68, faceoff: 67, speed: 68, chemistry: 70,
  },
  {
    id: 'nolan-catholic', name: 'Nolan Catholic', short: 'Nolan', abbr: 'NOL', mascot: 'Vikings',
    division: 'd2', primary: '#46187a', secondary: '#dcae2c', trim: '#ffffff',
    identity: 'defense',
    description: 'Physical, penalty-prone, and impossible to dodge on. Games here get ugly in a hurry.',
    homeField: { name: 'Viking Field', venue: 'school', time: 'evening', crowd: 0.57 },
    rivals: ['fwcd', 'hebron'],
    overall: 65, offense: 60, defense: 75, goalie: 68, attack: 58, midfield: 64, faceoff: 69, speed: 64, chemistry: 69,
  },
  {
    id: 'lake-highlands', name: 'Lake Highlands', short: 'Lake Highlands', abbr: 'LH', mascot: 'Wildcats',
    division: 'd2', primary: '#2f7dc4', secondary: '#f4f4f4', trim: '#ffffff',
    identity: 'transition',
    description: 'Fast break or bust. Beautiful when it works, a turnover machine when it does not.',
    homeField: { name: 'Wildcat-Ram Stadium', venue: 'stadium', time: 'night', crowd: 0.63 },
    rivals: ['liberty', 'wylie'],
    overall: 64, offense: 66, defense: 60, goalie: 63, attack: 64, midfield: 70, faceoff: 63, speed: 82, chemistry: 61,
  },
  {
    id: 'hebron', name: 'Hebron', short: 'Hebron', abbr: 'HEB', mascot: 'Hawks',
    division: 'd2', primary: '#0f7a45', secondary: '#14161a', trim: '#ffffff',
    identity: 'balanced',
    description: 'Rebuilding year three of a rebuild. The freshmen are good. The record is not.',
    homeField: { name: 'Hawk Stadium', venue: 'school', time: 'day', crowd: 0.5 },
    rivals: ['guyer', 'nolan-catholic'],
    overall: 62, offense: 61, defense: 62, goalie: 63, attack: 60, midfield: 63, faceoff: 62, speed: 65, chemistry: 60,
  },
  {
    id: 'wylie', name: 'Wylie', short: 'Wylie', abbr: 'WYL', mascot: 'Pirates',
    division: 'd2', primary: '#17244d', secondary: '#e3b93a', trim: '#ffffff',
    identity: 'faceoff',
    description: 'Bottom of the table, but their faceoff man is the best player on the field most nights.',
    homeField: { name: 'Pirate Stadium', venue: 'school', time: 'evening', crowd: 0.52 },
    rivals: ['rockwall', 'lake-highlands'],
    overall: 60, offense: 57, defense: 60, goalie: 61, attack: 56, midfield: 61, faceoff: 80, speed: 63, chemistry: 62,
  },
];
/* eslint-enable max-len */

const byId = new Map(TEAMS.map((t) => [t.id, t]));

export function getTeam(id: string): TeamData {
  const t = byId.get(id);
  if (!t) throw new Error(`Unknown team id: ${id}`);
  return t;
}

export function tryGetTeam(id: string | null | undefined): TeamData | null {
  return id ? byId.get(id) ?? null : null;
}

export function teamsInDivision(div: DivisionKey): TeamData[] {
  return TEAMS.filter((t) => t.division === div);
}

export function areRivals(a: string, b: string): boolean {
  const ta = byId.get(a);
  const tb = byId.get(b);
  return !!(ta?.rivals.includes(b) || tb?.rivals.includes(a));
}

/** Difficulty of *coaching* this team: strong programs are easier. 1 (easiest) .. 5 (hardest) */
export function coachingDifficulty(t: TeamData): number {
  const peers = teamsInDivision(t.division);
  const best = Math.max(...peers.map((p) => p.overall));
  const worst = Math.min(...peers.map((p) => p.overall));
  const norm = (t.overall - worst) / Math.max(1, best - worst); // 0 weakest .. 1 strongest
  const divBump = t.division === 'd2' ? 0.35 : 0;
  return Math.max(1, Math.min(5, Math.round(5 - norm * 3.2 + divBump)));
}

export const DIFFICULTY_WORDS = ['', 'Easy', 'Moderate', 'Tough', 'Hard', 'Brutal'] as const;

/** Colors used to draw a team on the field. Home wears its primary shell; the
 *  visitor wears a light shell accented with its primary so the two never clash. */
export function jerseyFor(team: TeamData, isHome: boolean) {
  if (isHome) {
    return { body: team.primary, accent: team.secondary, trim: team.trim, helmet: team.secondary };
  }
  return { body: '#eef1f6', accent: team.primary, trim: team.primary, helmet: team.primary };
}
