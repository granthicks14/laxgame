/* ---------------------------------------------------------------------------
 * LONE STAR LAX — NORTH DISTRICT LEAGUE DATA
 * ---------------------------------------------------------------------------
 * PROVENANCE. Read this before treating anything here as fact.
 *
 * HOW THIS WAS SOURCED: thsll.org could not be reached from the environment
 * this game was built in, so nothing here was read off the league site
 * directly. The structure and membership below come from public search results
 * describing the 2026 North District. Treat it as good but unconfirmed.
 *
 * WHAT COMES FROM THOSE SOURCES (North District, 2026 season):
 *   - The class structure: Class A, Class B, Class C East, Class C West and
 *     Class D. The district also runs a Sixes competition; that is a different
 *     format (6v6 on a short field) and is deliberately not modelled here,
 *     because this game simulates the field game.
 *   - The set of member programs listed below.
 *
 * WHAT IS BEST-EFFORT AND SHOULD BE VERIFIED:
 *   - Which class each program sits in. Every team carries a `placement` field:
 *     'reported' means the class was stated on a THSLL page; 'assumed' means it
 *     is our placement and needs checking. Fix them and the whole game follows.
 *   - Mascots and colours. Colours are chosen for on-field readability, not to
 *     reproduce official branding.
 *
 * WHAT IS ENTIRELY FICTIONAL:
 *   - EVERY RATING. They are gameplay balance values invented for this game and
 *     describe no real team's actual strength.
 *   - RIVALRIES. Some reflect well-known matchups; others exist to make the
 *     schedule interesting. They are not a historical claim.
 *   - PLAYERS. See rosters.ts — every team ships with `rosterSource:
 *     'generated'`, meaning fictional players. Real rosters can be dropped in.
 *
 * LAST REVIEWED: September 2026, from public search results — NOT verified
 * against thsll.org itself. Re-check each season. See docs/EDITING-DATA.md.
 * ------------------------------------------------------------------------- */

import { OFFICIAL_ROSTERS, rosterImportProblems } from './rosters';
import { universalOverall } from './levels';

export type ClassKey = 'a' | 'b' | 'c-east' | 'c-west' | 'd';

export const CLASS_ORDER: ClassKey[] = ['a', 'b', 'c-east', 'c-west', 'd'];

export const CLASSES: Record<ClassKey, { name: string; short: string; blurb: string }> = {
  a: {
    name: 'North District — Class A',
    short: 'Class A',
    blurb: 'The top flight. Deep rosters, real goalies, and no nights off.',
  },
  b: {
    name: 'North District — Class B',
    short: 'Class B',
    blurb: 'One rung down and just as competitive. The gap to Class A is a recruiting class.',
  },
  'c-east': {
    name: 'North District — Class C East',
    short: 'Class C East',
    blurb: 'The eastern half of Class C: Plano, Richardson, Rockwall and their neighbours.',
  },
  'c-west': {
    name: 'North District — Class C West',
    short: 'Class C West',
    blurb: 'The western half of Class C, from Grapevine across to Fort Worth and Denton.',
  },
  d: {
    name: 'North District — Class D',
    short: 'Class D',
    blurb: 'Smaller and newer programs. Everything to prove and nothing to lose.',
  },
};

/** How confident we are that this team sits in this class. */
export type Placement = 'reported' | 'assumed';

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

/**
 * Everything the game needs to PLAY a team: who they are, what they look like,
 * how good they are and where they play. Both the THSLL teams below and every
 * college and professional programme in data/world.ts satisfy this, so the
 * match engine, the renderer, the emblems and the stadiums all work at every
 * level of the sport without knowing which one they are looking at.
 */
export interface GameTeam extends TeamRatings {
  id: string;
  name: string;
  short: string;
  /** 2-4 char scoreboard abbreviation. */
  abbr: string;
  mascot: string;
  primary: string;
  secondary: string;
  /** Number/text colour drawn on the jersey. */
  trim: string;
  identity: TeamIdentity;
  description: string;
  homeField: HomeField;
  /** Gameplay rivalries, by team id. */
  rivals: string[];
}

/** A THSLL team: a game team that also sits in one of the district's classes. */
export interface TeamData extends GameTeam {
  classKey: ClassKey;
  placement: Placement;
}

/* eslint-disable max-len */
const AUTHORED_TEAMS: TeamData[] = [
  // ============================================================== CLASS A
  {
    id: 'highland-park', name: 'Highland Park', short: 'Highland Park', abbr: 'HP', mascot: 'Scots',
    classKey: 'a', placement: 'reported', primary: '#3f6fd0', secondary: '#f5d020', trim: '#ffffff',
    identity: 'offense',
    description: 'Relentless ball movement and a two-man game that punishes any slide half a step late.',
    homeField: { name: 'Highlander Stadium', venue: 'stadium', time: 'night', crowd: 0.95 },
    rivals: ['dallas-jesuit', 'esd'],
    overall: 89, offense: 93, defense: 85, goalie: 86, attack: 94, midfield: 89, faceoff: 83, speed: 87, chemistry: 90,
  },
  {
    id: 'dallas-jesuit', name: 'Dallas Jesuit', short: 'Jesuit', abbr: 'JES', mascot: 'Rangers',
    classKey: 'a', placement: 'reported', primary: '#0b2f6b', secondary: '#d9a441', trim: '#ffffff',
    identity: 'balanced',
    description: 'The measuring stick. No obvious weakness, and they will grind you down over four quarters.',
    homeField: { name: 'Postell Stadium', venue: 'stadium', time: 'night', crowd: 1.0 },
    rivals: ['highland-park', 'st-marks'],
    overall: 91, offense: 90, defense: 91, goalie: 90, attack: 89, midfield: 92, faceoff: 90, speed: 86, chemistry: 93,
  },
  {
    id: 'st-marks', name: "St. Mark's", short: "St. Mark's", abbr: 'STM', mascot: 'Lions',
    classKey: 'a', placement: 'reported', primary: '#1d4fa8', secondary: '#e8eaf0', trim: '#ffffff',
    identity: 'goalie',
    description: 'A goalie who steals games and a defence happy to make you shoot from twelve yards out.',
    homeField: { name: 'Hunt Family Stadium', venue: 'stadium', time: 'evening', crowd: 0.8 },
    rivals: ['dallas-jesuit', 'esd'],
    overall: 84, offense: 79, defense: 88, goalie: 94, attack: 78, midfield: 82, faceoff: 80, speed: 78, chemistry: 87,
  },
  {
    id: 'esd', name: 'Episcopal School of Dallas', short: 'ESD', abbr: 'ESD', mascot: 'Eagles',
    classKey: 'a', placement: 'reported', primary: '#b4232f', secondary: '#16307a', trim: '#ffffff',
    identity: 'offense',
    description: 'Skilled, patient and dangerous from X. They will hold the ball until you make a mistake.',
    homeField: { name: 'Jones Family Field', venue: 'complex', time: 'evening', crowd: 0.72 },
    rivals: ['highland-park', 'st-marks'],
    overall: 86, offense: 90, defense: 81, goalie: 84, attack: 91, midfield: 85, faceoff: 79, speed: 84, chemistry: 85,
  },
  {
    id: 'southlake-carroll', name: 'Southlake Carroll', short: 'Southlake', abbr: 'SLC', mascot: 'Dragons',
    classKey: 'a', placement: 'reported', primary: '#12965a', secondary: '#f2f2f2', trim: '#ffffff',
    identity: 'transition',
    description: 'Push it every single time. Win a groundball at midfield and they are already at your crease.',
    homeField: { name: 'Dragon Stadium', venue: 'stadium', time: 'night', crowd: 0.98 },
    rivals: ['keller', 'flower-mound'],
    overall: 85, offense: 87, defense: 81, goalie: 82, attack: 85, midfield: 90, faceoff: 85, speed: 93, chemistry: 83,
  },
  {
    id: 'rockwall', name: 'Rockwall', short: 'Rockwall', abbr: 'RWL', mascot: 'Yellowjackets',
    classKey: 'a', placement: 'reported', primary: '#e2701e', secondary: '#16181c', trim: '#ffffff',
    identity: 'faceoff',
    description: 'Owns the X. Possession numbers that make the scoreboard look unfair by the fourth quarter.',
    homeField: { name: 'Wilkerson-Sanders Stadium', venue: 'stadium', time: 'evening', crowd: 0.78 },
    rivals: ['mckinney', 'rockwall-heath'],
    overall: 81, offense: 79, defense: 80, goalie: 78, attack: 78, midfield: 84, faceoff: 93, speed: 80, chemistry: 80,
  },
  {
    id: 'mckinney', name: 'McKinney', short: 'McKinney', abbr: 'MCK', mascot: 'Lions',
    classKey: 'a', placement: 'reported', primary: '#b3141c', secondary: '#e0b83a', trim: '#ffffff',
    identity: 'transition',
    description: 'Young, fast and streaky. When the transition offence is clicking they can beat anybody.',
    homeField: { name: 'Ron Poe Stadium', venue: 'stadium', time: 'night', crowd: 0.74 },
    rivals: ['rockwall', 'prosper'],
    overall: 79, offense: 81, defense: 75, goalie: 76, attack: 80, midfield: 84, faceoff: 77, speed: 88, chemistry: 72,
  },
  {
    id: 'allen', name: 'Allen', short: 'Allen', abbr: 'ALN', mascot: 'Eagles',
    classKey: 'a', placement: 'reported', primary: '#c8102e', secondary: '#1a1c22', trim: '#ffffff',
    identity: 'defense',
    description: 'Enormous poles and a defence that treats every possession like a personal insult.',
    homeField: { name: 'Eagle Stadium', venue: 'stadium', time: 'night', crowd: 1.0 },
    rivals: ['plano', 'mckinney'],
    overall: 83, offense: 77, defense: 91, goalie: 85, attack: 76, midfield: 81, faceoff: 82, speed: 79, chemistry: 84,
  },

  // ============================================================== CLASS B
  {
    id: 'coppell', name: 'Coppell', short: 'Coppell', abbr: 'COP', mascot: 'Cowboys',
    classKey: 'b', placement: 'reported', primary: '#1c1f26', secondary: '#d4262f', trim: '#ffffff',
    identity: 'defense',
    description: 'A packed-in defence that dares you to shoot from outside. Clearing is where they get in trouble.',
    homeField: { name: 'Buddy Echols Field', venue: 'stadium', time: 'evening', crowd: 0.76 },
    rivals: ['flower-mound', 'plano'],
    overall: 79, offense: 74, defense: 86, goalie: 83, attack: 73, midfield: 77, faceoff: 78, speed: 74, chemistry: 81,
  },
  {
    id: 'flower-mound', name: 'Flower Mound', short: 'Flower Mound', abbr: 'FLM', mascot: 'Jaguars',
    classKey: 'b', placement: 'reported', primary: '#0f3d7a', secondary: '#c9ced8', trim: '#ffffff',
    identity: 'balanced',
    description: 'Well drilled and hard to rattle. Nothing spectacular, nothing you can exploit either.',
    homeField: { name: 'Neal Wilson Stadium', venue: 'stadium', time: 'evening', crowd: 0.72 },
    rivals: ['coppell', 'lewisville-marcus'],
    overall: 77, offense: 76, defense: 78, goalie: 77, attack: 75, midfield: 79, faceoff: 76, speed: 77, chemistry: 82,
  },
  {
    id: 'frisco', name: 'Frisco', short: 'Frisco', abbr: 'FRI', mascot: 'Raccoons',
    classKey: 'b', placement: 'reported', primary: '#cf2027', secondary: '#f4f4f4', trim: '#ffffff',
    identity: 'goalie',
    description: 'Undersized nearly everywhere except in the cage. Their keeper is why games stay close.',
    homeField: { name: 'Memorial Stadium', venue: 'stadium', time: 'day', crowd: 0.62 },
    rivals: ['lone-star', 'prosper'],
    overall: 72, offense: 67, defense: 74, goalie: 88, attack: 66, midfield: 70, faceoff: 70, speed: 72, chemistry: 73,
  },
  {
    id: 'keller', name: 'Keller', short: 'Keller', abbr: 'KEL', mascot: 'Indians',
    classKey: 'b', placement: 'reported', primary: '#1b3f8b', secondary: '#d8dbe0', trim: '#ffffff',
    identity: 'faceoff',
    description: 'Wins the wing battle, wins the groundball, wins the game. Simple and effective.',
    homeField: { name: 'Keller ISD Stadium', venue: 'stadium', time: 'evening', crowd: 0.7 },
    rivals: ['southlake-carroll', 'colleyville-heritage'],
    overall: 75, offense: 73, defense: 75, goalie: 74, attack: 71, midfield: 79, faceoff: 89, speed: 76, chemistry: 76,
  },
  {
    id: 'lovejoy', name: 'Lovejoy', short: 'Lovejoy', abbr: 'LOV', mascot: 'Leopards',
    classKey: 'b', placement: 'reported', primary: '#1d6b3f', secondary: '#efefef', trim: '#ffffff',
    identity: 'offense',
    description: 'Two attackmen who can beat anyone one-on-one, and a defence that gives some of it back.',
    homeField: { name: 'Leopard Stadium', venue: 'stadium', time: 'evening', crowd: 0.68 },
    rivals: ['mckinney', 'prosper'],
    overall: 76, offense: 82, defense: 70, goalie: 73, attack: 84, midfield: 78, faceoff: 73, speed: 79, chemistry: 78,
  },
  {
    id: 'plano', name: 'Plano', short: 'Plano', abbr: 'PLA', mascot: 'Wildcats',
    classKey: 'b', placement: 'reported', primary: '#c1272d', secondary: '#1a1c22', trim: '#ffffff',
    identity: 'balanced',
    description: 'Big, physical middies and a staff that never lets a game get away from them early.',
    homeField: { name: 'Clark Stadium', venue: 'stadium', time: 'evening', crowd: 0.8 },
    rivals: ['plano-east', 'plano-west'],
    overall: 80, offense: 80, defense: 80, goalie: 79, attack: 78, midfield: 84, faceoff: 80, speed: 79, chemistry: 82,
  },
  {
    id: 'prosper', name: 'Prosper', short: 'Prosper', abbr: 'PRO', mascot: 'Eagles',
    classKey: 'b', placement: 'reported', primary: '#14204f', secondary: '#c9ced8', trim: '#ffffff',
    identity: 'transition',
    description: 'Fastest team in the class and they know it. Everything is a break waiting to happen.',
    homeField: { name: "Children's Health Stadium", venue: 'stadium', time: 'night', crowd: 0.86 },
    rivals: ['mckinney', 'lovejoy'],
    overall: 78, offense: 79, defense: 74, goalie: 75, attack: 77, midfield: 83, faceoff: 76, speed: 89, chemistry: 74,
  },
  {
    id: 'parish-episcopal', name: 'Parish Episcopal', short: 'Parish', abbr: 'PAR', mascot: 'Panthers',
    classKey: 'b', placement: 'reported', primary: '#123a7a', secondary: '#c8a24a', trim: '#ffffff',
    identity: 'balanced',
    description: 'Small school, tight roster, high chemistry. They have played together since sixth grade.',
    homeField: { name: 'Midway Campus Field', venue: 'complex', time: 'day', crowd: 0.58 },
    rivals: ['esd', 'greenhill'],
    overall: 74, offense: 73, defense: 74, goalie: 75, attack: 72, midfield: 75, faceoff: 74, speed: 72, chemistry: 89,
  },
  {
    id: 'highland-park-b', name: 'Highland Park B', short: 'Highland Park B', abbr: 'HPB', mascot: 'Scots',
    classKey: 'b', placement: 'reported', primary: '#4a7fd4', secondary: '#f5d020', trim: '#ffffff',
    identity: 'offense',
    description: 'The same system as the varsity side, run by players who want the varsity spot.',
    homeField: { name: 'Highlander Stadium', venue: 'stadium', time: 'evening', crowd: 0.6 },
    rivals: ['dallas-jesuit-b'],
    overall: 73, offense: 77, defense: 69, goalie: 71, attack: 78, midfield: 74, faceoff: 71, speed: 76, chemistry: 80,
  },
  {
    id: 'dallas-jesuit-b', name: 'Dallas Jesuit B', short: 'Jesuit B', abbr: 'JSB', mascot: 'Rangers',
    classKey: 'b', placement: 'reported', primary: '#16407f', secondary: '#d9a441', trim: '#ffffff',
    identity: 'defense',
    description: 'Coached exactly like the first team: disciplined, physical and allergic to bad shots.',
    homeField: { name: 'Postell Stadium', venue: 'stadium', time: 'evening', crowd: 0.62 },
    rivals: ['highland-park-b'],
    overall: 74, offense: 70, defense: 79, goalie: 77, attack: 69, midfield: 73, faceoff: 76, speed: 72, chemistry: 82,
  },

  // ========================================================== CLASS C EAST
  {
    id: 'plano-east', name: 'Plano East', short: 'Plano East', abbr: 'PLE', mascot: 'Panthers',
    classKey: 'c-east', placement: 'reported', primary: '#0e5c3a', secondary: '#e8c33c', trim: '#ffffff',
    identity: 'balanced',
    description: 'Middle of the table every year. One good class from being a real problem.',
    homeField: { name: 'Williams Stadium', venue: 'stadium', time: 'evening', crowd: 0.64 },
    rivals: ['plano', 'plano-west'],
    overall: 71, offense: 71, defense: 70, goalie: 71, attack: 70, midfield: 73, faceoff: 71, speed: 73, chemistry: 74,
  },
  {
    id: 'plano-west', name: 'Plano West', short: 'Plano West', abbr: 'PLW', mascot: 'Wolves',
    classKey: 'c-east', placement: 'reported', primary: '#1f2a44', secondary: '#9aa4b4', trim: '#ffffff',
    identity: 'defense',
    description: 'Slows every game to a crawl and wins the ugly ones. Nobody enjoys playing them.',
    homeField: { name: 'Clark Stadium', venue: 'stadium', time: 'evening', crowd: 0.66 },
    rivals: ['plano', 'plano-east'],
    overall: 72, offense: 66, defense: 79, goalie: 77, attack: 65, midfield: 70, faceoff: 72, speed: 69, chemistry: 77,
  },
  {
    id: 'hebron', name: 'Hebron', short: 'Hebron', abbr: 'HEB', mascot: 'Hawks',
    classKey: 'c-east', placement: 'assumed', primary: '#14a05a', secondary: '#14161a', trim: '#ffffff',
    identity: 'transition',
    description: 'Athletes first, lacrosse players second, and somehow that keeps working out.',
    homeField: { name: 'Hawk Stadium', venue: 'school', time: 'day', crowd: 0.55 },
    rivals: ['lewisville-marcus', 'plano-east'],
    overall: 68, offense: 69, defense: 65, goalie: 67, attack: 68, midfield: 73, faceoff: 68, speed: 84, chemistry: 64,
  },
  {
    id: 'bishop-lynch', name: 'Bishop Lynch', short: 'Bishop Lynch', abbr: 'BL', mascot: 'Friars',
    classKey: 'c-east', placement: 'assumed', primary: '#5a1d2e', secondary: '#d7c37a', trim: '#ffffff',
    identity: 'faceoff',
    description: 'Their FOGO is the best player on the field most nights, and they build everything around him.',
    homeField: { name: 'Friar Field', venue: 'school', time: 'evening', crowd: 0.58 },
    rivals: ['john-paul-ii', 'plano-east'],
    overall: 69, offense: 66, defense: 68, goalie: 69, attack: 65, midfield: 70, faceoff: 86, speed: 70, chemistry: 71,
  },
  {
    id: 'richardson', name: 'Richardson', short: 'Richardson', abbr: 'RCH', mascot: 'Eagles',
    classKey: 'c-east', placement: 'assumed', primary: '#1a4f9c', secondary: '#f0f0f0', trim: '#ffffff',
    identity: 'balanced',
    description: 'Blue-collar programme. Wins groundballs, loses close games, never stops running.',
    homeField: { name: 'Eagle-Mustang Stadium', venue: 'stadium', time: 'evening', crowd: 0.6 },
    rivals: ['lake-highlands', 'plano-east'],
    overall: 66, offense: 65, defense: 66, goalie: 66, attack: 64, midfield: 68, faceoff: 67, speed: 70, chemistry: 70,
  },
  {
    id: 'rockwall-heath', name: 'Rockwall-Heath', short: 'Rockwall-Heath', abbr: 'RH', mascot: 'Hawks',
    classKey: 'c-east', placement: 'assumed', primary: '#0d2c54', secondary: '#c0392b', trim: '#ffffff',
    identity: 'offense',
    description: 'Shoots from everywhere and apologises for nothing. High-scoring games in both directions.',
    homeField: { name: 'Hawk Stadium', venue: 'stadium', time: 'night', crowd: 0.63 },
    rivals: ['rockwall', 'richardson'],
    overall: 67, offense: 73, defense: 60, goalie: 64, attack: 75, midfield: 70, faceoff: 65, speed: 74, chemistry: 66,
  },

  // ========================================================== CLASS C WEST
  {
    id: 'grapevine', name: 'Grapevine', short: 'Grapevine', abbr: 'GRP', mascot: 'Mustangs',
    classKey: 'c-west', placement: 'reported', primary: '#6d3fa3', secondary: '#f0d24a', trim: '#ffffff',
    identity: 'offense',
    description: 'The class of Class C West. Enough firepower to hang with the bottom of Class B.',
    homeField: { name: 'Mustang-Panther Stadium', venue: 'stadium', time: 'night', crowd: 0.8 },
    rivals: ['colleyville-heritage', 'fwcd'],
    overall: 74, offense: 80, defense: 69, goalie: 71, attack: 82, midfield: 76, faceoff: 72, speed: 78, chemistry: 77,
  },
  {
    id: 'fwcd', name: 'Fort Worth Country Day', short: 'Country Day', abbr: 'FWCD', mascot: 'Falcons',
    classKey: 'c-west', placement: 'reported', primary: '#22a163', secondary: '#f0f0f0', trim: '#ffffff',
    identity: 'goalie',
    description: 'A senior goalie stealing one game a week and a roster that never seems to tire.',
    homeField: { name: 'Falcon Field', venue: 'complex', time: 'day', crowd: 0.55 },
    rivals: ['trinity-valley', 'grapevine'],
    overall: 70, offense: 65, defense: 71, goalie: 86, attack: 64, midfield: 69, faceoff: 69, speed: 70, chemistry: 78,
  },
  {
    id: 'greenhill', name: 'Greenhill', short: 'Greenhill', abbr: 'GRN', mascot: 'Hornets',
    classKey: 'c-west', placement: 'reported', primary: '#0f5132', secondary: '#e9c46a', trim: '#ffffff',
    identity: 'balanced',
    description: 'Smart, patient and well coached. They will not beat themselves.',
    homeField: { name: 'Greenhill Athletic Complex', venue: 'complex', time: 'day', crowd: 0.54 },
    rivals: ['parish-episcopal', 'prestonwood'],
    overall: 69, offense: 68, defense: 70, goalie: 71, attack: 67, midfield: 70, faceoff: 69, speed: 68, chemistry: 84,
  },
  {
    id: 'prestonwood', name: 'Prestonwood Christian', short: 'Prestonwood', abbr: 'PCA', mascot: 'Lions',
    classKey: 'c-west', placement: 'reported', primary: '#7a1f2b', secondary: '#d9cba3', trim: '#ffffff',
    identity: 'defense',
    description: 'Physical, penalty-prone and impossible to dodge on. Games here get ugly in a hurry.',
    homeField: { name: 'Lions Stadium', venue: 'school', time: 'evening', crowd: 0.6 },
    rivals: ['greenhill', 'trinity-valley'],
    overall: 68, offense: 63, defense: 77, goalie: 71, attack: 61, midfield: 67, faceoff: 71, speed: 66, chemistry: 72,
  },
  {
    id: 'guyer', name: 'Denton Guyer', short: 'Guyer', abbr: 'GUY', mascot: 'Wildcats',
    classKey: 'c-west', placement: 'reported', primary: '#123a7a', secondary: '#d92b2b', trim: '#ffffff',
    identity: 'transition',
    description: 'Runs everything. If the game turns into a track meet they are perfectly happy.',
    homeField: { name: 'C.H. Collins Complex', venue: 'stadium', time: 'evening', crowd: 0.66 },
    rivals: ['byron-nelson', 'grapevine'],
    overall: 70, offense: 71, defense: 67, goalie: 68, attack: 69, midfield: 76, faceoff: 70, speed: 86, chemistry: 67,
  },
  {
    id: 'trinity-valley', name: 'Trinity Valley', short: 'Trinity Valley', abbr: 'TVS', mascot: 'Trojans',
    classKey: 'c-west', placement: 'reported', primary: '#1b2a5c', secondary: '#c8b273', trim: '#ffffff',
    identity: 'balanced',
    description: 'Tiny roster, enormous effort. Depth is the only thing that beats them.',
    homeField: { name: 'Trojan Field', venue: 'school', time: 'day', crowd: 0.5 },
    rivals: ['fwcd', 'prestonwood'],
    overall: 65, offense: 64, defense: 66, goalie: 68, attack: 63, midfield: 66, faceoff: 65, speed: 66, chemistry: 86,
  },

  {
    id: 'all-saints', name: "All Saints' Episcopal", short: 'All Saints', abbr: 'ASE', mascot: 'Saints',
    classKey: 'c-west', placement: 'assumed', primary: '#5b2b8a', secondary: '#e6c34a', trim: '#ffffff',
    identity: 'balanced',
    description: 'A small Fort Worth programme that plays a tidy, patient game and rarely beats itself.',
    homeField: { name: 'Saints Field', venue: 'school', time: 'evening', crowd: 0.5 },
    rivals: ['fwcd', 'fort-worth'],
    overall: 72, offense: 71, defense: 73, goalie: 74, attack: 70, midfield: 72, faceoff: 70, speed: 71, chemistry: 79,
  },
  {
    id: 'fort-worth', name: 'Fort Worth Lacrosse', short: 'Fort Worth', abbr: 'FTW', mascot: 'Longhorns',
    classKey: 'c-west', placement: 'assumed', primary: '#8c1d1d', secondary: '#d8cbb4', trim: '#ffffff',
    identity: 'transition',
    description: 'A city co-op drawn from several schools. Athletic, unpolished, and dangerous on the break.',
    homeField: { name: 'Trinity Park Fields', venue: 'complex', time: 'day', crowd: 0.42 },
    rivals: ['all-saints', 'fwcd'],
    overall: 70, offense: 72, defense: 67, goalie: 69, attack: 71, midfield: 73, faceoff: 72, speed: 78, chemistry: 68,
  },
  // ============================================================== CLASS D
  {
    id: 'john-paul-ii', name: 'John Paul II', short: 'John Paul II', abbr: 'JPII', mascot: 'Cardinals',
    classKey: 'd', placement: 'reported', primary: '#8b1a2b', secondary: '#e8e2d0', trim: '#ffffff',
    identity: 'offense',
    description: 'The team to beat in Class D. Two lines that can score and a real goalie behind them.',
    homeField: { name: 'Cardinal Field', venue: 'school', time: 'evening', crowd: 0.58 },
    rivals: ['bishop-lynch', 'cumberland'],
    overall: 66, offense: 71, defense: 61, goalie: 68, attack: 73, midfield: 68, faceoff: 65, speed: 70, chemistry: 74,
  },
  {
    id: 'cumberland', name: 'Cumberland Academy', short: 'Cumberland', abbr: 'CUM', mascot: 'Knights',
    classKey: 'd', placement: 'reported', primary: '#2f3e6b', secondary: '#b9c2d0', trim: '#ffffff',
    identity: 'balanced',
    description: 'Rebuilding year three of a rebuild. The freshmen are good. The record is not.',
    homeField: { name: 'Knight Field', venue: 'school', time: 'day', crowd: 0.48 },
    rivals: ['john-paul-ii', 'bridge'],
    overall: 60, offense: 59, defense: 60, goalie: 62, attack: 58, midfield: 61, faceoff: 60, speed: 63, chemistry: 66,
  },
  {
    id: 'bridge', name: 'Bridge Lacrosse', short: 'Bridge', abbr: 'BRG', mascot: 'Builders',
    classKey: 'd', placement: 'reported', primary: '#0f6f8c', secondary: '#f2b134', trim: '#ffffff',
    identity: 'transition',
    description: 'Fast break or bust. Beautiful when it works, a turnover machine when it does not.',
    homeField: { name: 'Fair Park Fields', venue: 'complex', time: 'day', crowd: 0.52 },
    rivals: ['cumberland', 'lake-highlands'],
    overall: 61, offense: 63, defense: 57, goalie: 60, attack: 62, midfield: 67, faceoff: 60, speed: 82, chemistry: 60,
  },
  {
    id: 'lake-highlands', name: 'Lake Highlands', short: 'Lake Highlands', abbr: 'LH', mascot: 'Wildcats',
    classKey: 'd', placement: 'assumed', primary: '#2f7dc4', secondary: '#f4f4f4', trim: '#ffffff',
    identity: 'faceoff',
    description: 'Bottom half of the table, but nobody in the class can beat them at the X.',
    homeField: { name: 'Wildcat-Ram Stadium', venue: 'stadium', time: 'night', crowd: 0.6 },
    rivals: ['richardson', 'bridge'],
    overall: 62, offense: 59, defense: 61, goalie: 62, attack: 58, midfield: 63, faceoff: 82, speed: 66, chemistry: 64,
  },
  {
    id: 'lewisville-marcus', name: 'Flower Mound Marcus', short: 'Marcus', abbr: 'MAR', mascot: 'Marauders',
    classKey: 'd', placement: 'assumed', primary: '#7d1128', secondary: '#d5d8dd', trim: '#ffffff',
    identity: 'defense',
    description: 'Heavy poles, brutal slides and zero interest in a track meet. Low-scoring by design.',
    homeField: { name: 'Marauder Field', venue: 'school', time: 'evening', crowd: 0.62 },
    rivals: ['flower-mound', 'hebron'],
    overall: 64, offense: 58, defense: 73, goalie: 67, attack: 57, midfield: 62, faceoff: 66, speed: 62, chemistry: 70,
  },
  {
    id: 'lone-star', name: 'Frisco Lone Star', short: 'Lone Star', abbr: 'LS', mascot: 'Rangers',
    classKey: 'd', placement: 'assumed', primary: '#13223f', secondary: '#c9a227', trim: '#ffffff',
    identity: 'goalie',
    description: 'Their keeper keeps them in everything. The rest of the roster is still catching up.',
    homeField: { name: 'Ford Center Fields', venue: 'complex', time: 'evening', crowd: 0.56 },
    rivals: ['frisco', 'cumberland'],
    overall: 62, offense: 57, defense: 63, goalie: 80, attack: 56, midfield: 60, faceoff: 62, speed: 65, chemistry: 68,
  },

  // A few more Class C West programmes so the class carries a full schedule.
  {
    id: 'colleyville-heritage', name: 'Colleyville Heritage', short: 'Colleyville', abbr: 'CHP', mascot: 'Panthers',
    classKey: 'c-west', placement: 'assumed', primary: '#1c2c54', secondary: '#c0c4cc', trim: '#ffffff',
    identity: 'defense',
    description: 'Disciplined six-man defence. Take a bad shot and the clear is going the other way fast.',
    homeField: { name: 'Mustang-Panther Stadium', venue: 'stadium', time: 'evening', crowd: 0.7 },
    rivals: ['grapevine', 'keller'],
    overall: 71, offense: 66, defense: 78, goalie: 76, attack: 65, midfield: 69, faceoff: 71, speed: 68, chemistry: 78,
  },
  {
    id: 'byron-nelson', name: 'Byron Nelson', short: 'Byron Nelson', abbr: 'BYN', mascot: 'Bobcats',
    classKey: 'c-west', placement: 'assumed', primary: '#17233f', secondary: '#b3a369', trim: '#ffffff',
    identity: 'faceoff',
    description: 'Wins the draw, wins the groundball, wins the game. It is not complicated.',
    homeField: { name: 'Bobcat Stadium', venue: 'stadium', time: 'evening', crowd: 0.72 },
    rivals: ['guyer', 'southlake-carroll'],
    overall: 72, offense: 70, defense: 72, goalie: 71, attack: 68, midfield: 76, faceoff: 87, speed: 73, chemistry: 74,
  },
];
/* eslint-enable max-len */

/* -------------------------------------------------- the universal scale */

/**
 * The ratings above are authored as STANDINGS WITHIN THE DISTRICT — Highland
 * Park at 89 means "one of the two best programmes in the district", not "as
 * good as a Division I team". They are written that way because that is how a
 * person editing this file thinks, and how the placement research reads.
 *
 * The rest of the game needs one scale for the whole sport, so the district's
 * range is mapped onto high school's slice of it (see `overallBand` in
 * levels.ts) exactly once, here, at module load. Edit the numbers above in
 * district terms; every consumer sees universal ones.
 *
 * The map is linear and monotonic, so relative strength inside the district —
 * the thing Dynasty balance actually rests on — is preserved exactly.
 */
const AUTHORED_SPAN = (() => {
  const all = AUTHORED_TEAMS.map((t) => t.overall);
  return { min: Math.min(...all), max: Math.max(...all) };
})();

const RATING_KEYS: (keyof TeamRatings)[] = [
  'overall', 'offense', 'defense', 'goalie', 'attack', 'midfield', 'faceoff', 'speed',
];

function toUniversal(team: TeamData): TeamData {
  const out = { ...team };
  for (const key of RATING_KEYS) {
    out[key] = Math.round(universalOverall('hs', team[key], AUTHORED_SPAN));
  }
  // Chemistry is not a strength rating — it is how well a squad plays together,
  // and it is already read as a 0-99 percentage everywhere. It stays as written.
  return out;
}

export const TEAMS: TeamData[] = AUTHORED_TEAMS.map(toUniversal);

/**
 * SIXES. The district also runs a 6v6 short-field competition. This game
 * simulates the ten-a-side field game, so these programmes are listed for
 * completeness — the Teams screen shows them and says why they are not
 * playable — rather than being dropped into a field-lacrosse league where they
 * would misrepresent both the format and the teams.
 *
 * Source: public search results describing the 2026 North District. Not
 * verified against thsll.org, which this project cannot reach.
 */
export const SIXES_PROGRAMS: string[] = [
  'Allen 6s',
  'Cumberland-Legacy Knights 6s',
  'Flower Mound-Marcus 6s',
  'Frisco-Lone Star 6s',
  'Grapevine-Colleyville Heritage 6s',
  'Hebron-TCA 6s',
  'Hillcrest-Lake Highlands 6s',
  'John Paul II 6s',
  'Kaufman Lacrosse 6s',
  'Kemp Lacrosse 6s',
  'Plano East-Wylie 6s',
  'Richardson 6s',
  'Rockwall-Rockwall Heath 6s',
];

const byId = new Map(TEAMS.map((t) => [t.id, t]));

export function getTeam(id: string): TeamData {
  const t = byId.get(id);
  if (!t) throw new Error(`Unknown team id: ${id}`);
  return t;
}

export function tryGetTeam(id: string | null | undefined): TeamData | null {
  return id ? byId.get(id) ?? null : null;
}

export function teamsInClass(key: ClassKey): TeamData[] {
  return TEAMS.filter((t) => t.classKey === key);
}

export function areRivals(a: string, b: string): boolean {
  const ta = byId.get(a);
  const tb = byId.get(b);
  return !!(ta?.rivals.includes(b) || tb?.rivals.includes(a));
}

/** Difficulty of *coaching* this team: strong programmes are easier. 1..5 */
export function coachingDifficulty(t: TeamData): number {
  const peers = teamsInClass(t.classKey);
  const best = Math.max(...peers.map((p) => p.overall));
  const worst = Math.min(...peers.map((p) => p.overall));
  const norm = (t.overall - worst) / Math.max(1, best - worst);
  // Lower classes are a harder job at every level: less talent to work with.
  const classBump = { a: 0, b: 0.5, 'c-east': 1, 'c-west': 1, d: 1.5 }[t.classKey];
  return Math.max(1, Math.min(5, Math.round(5 - norm * 4 + classBump)));
}

export const DIFFICULTY_WORDS = ['', 'Easy', 'Moderate', 'Tough', 'Hard', 'Brutal'] as const;

/** Colours used to draw a team on the field. Home wears its primary shell; the
 *  visitor wears a light shell accented with its primary so the two never clash. */
export function jerseyFor(team: GameTeam, isHome: boolean) {
  if (isHome) {
    return { body: team.primary, accent: team.secondary, trim: team.trim, helmet: team.secondary };
  }
  return { body: '#eef1f6', accent: team.primary, trim: team.primary, helmet: team.primary };
}

/** Sanity checks run once at startup: duplicate ids, dangling rivals, thin classes. */
export function validateLeague(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const t of TEAMS) {
    if (seen.has(t.id)) problems.push(`duplicate team id: ${t.id}`);
    seen.add(t.id);
    for (const r of t.rivals) {
      if (!byId.has(r)) problems.push(`${t.id} lists unknown rival "${r}"`);
    }
  }
  for (const key of CLASS_ORDER) {
    const n = teamsInClass(key).length;
    if (n < 4) problems.push(`class ${key} has only ${n} teams; schedules will be short`);
  }
  for (const id of Object.keys(OFFICIAL_ROSTERS)) {
    if (!byId.has(id)) problems.push(`roster import for unknown team "${id}"`);
  }
  problems.push(...rosterImportProblems());
  return problems;
}
