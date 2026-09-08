/* ---------------------------------------------------------------------------
 * PROGRAMMES OF THE LACROSSE WORLD
 * ---------------------------------------------------------------------------
 * PROVENANCE — read this before treating anything here as fact.
 *
 * WHAT IS REAL: the school and franchise NAMES, their nicknames, and the
 * conference each one plays men's lacrosse in. These are public facts about
 * public institutions, checked against publicly available 2026 sources.
 * Conference alignment moves every year and this project cannot reach the
 * NCAA or conference sites directly to verify each membership, so treat the
 * alignments as good but unconfirmed, and correct them freely.
 *
 * WHAT IS NOT REAL: every number. `tier` is a GAMEPLAY value chosen so the
 * world feels right to play in — it is not a ranking of real programmes, not a
 * prediction, and not a claim about anybody's actual quality. Every rating,
 * every player, every result the game produces is fiction built on top of it.
 *
 * WHAT IS INVENTED OUTRIGHT: the semi-professional Continental Lacrosse League
 * and all twelve of its clubs. No such league exists; it is here because the
 * jump from college to the professional game needs a rung in between.
 *
 * Colours are picked for on-field readability between two teams, not to
 * reproduce anybody's official branding, and the game draws its own original
 * emblems rather than using real marks.
 * ------------------------------------------------------------------------- */

import type { Level } from '../levels';

/** A programme in compact form. Everything else is derived from these. */
export interface ProgramRow {
  /** Stable id. */
  id: string;
  /** Display name, e.g. "Johns Hopkins". */
  name: string;
  mascot: string;
  /** Scoreboard abbreviation, 2-4 characters. */
  abbr: string;
  conference: string;
  /**
   * 30-99 gameplay standing within the level. Drives ratings, recruiting pull,
   * expectations and how hard the job is. A gameplay value, not a ranking.
   */
  tier: number;
  primary: string;
  secondary: string;
  region: Region;
}

export type Region =
  | 'northeast' | 'mid-atlantic' | 'south' | 'midwest' | 'west' | 'texas';

export const REGION_LABEL: Record<Region, string> = {
  northeast: 'Northeast',
  'mid-atlantic': 'Mid-Atlantic',
  south: 'South',
  midwest: 'Midwest',
  west: 'West',
  texas: 'Texas',
};

export interface ConferenceInfo {
  id: string;
  name: string;
  short: string;
  level: Level;
  /** Conferences with an automatic bid send their champion to the national bracket. */
  autoBid: boolean;
}

/* ===========================================================================
 * NCAA DIVISION I
 * ========================================================================= */

export const D1_CONFERENCES: ConferenceInfo[] = [
  { id: 'acc', name: 'Atlantic Coast Conference', short: 'ACC', level: 'd1', autoBid: true },
  { id: 'big-ten', name: 'Big Ten Conference', short: 'Big Ten', level: 'd1', autoBid: true },
  { id: 'ivy', name: 'Ivy League', short: 'Ivy', level: 'd1', autoBid: true },
  { id: 'patriot', name: 'Patriot League', short: 'Patriot', level: 'd1', autoBid: true },
  { id: 'big-east', name: 'Big East Conference', short: 'Big East', level: 'd1', autoBid: true },
  { id: 'caa', name: 'Coastal Athletic Association', short: 'CAA', level: 'd1', autoBid: true },
  { id: 'america-east', name: 'America East Conference', short: 'America East', level: 'd1', autoBid: true },
  { id: 'asun', name: 'ASUN Conference', short: 'ASUN', level: 'd1', autoBid: true },
  { id: 'nec', name: 'Northeast Conference', short: 'NEC', level: 'd1', autoBid: true },
  { id: 'atlantic-10', name: 'Atlantic 10 Conference', short: 'A-10', level: 'd1', autoBid: true },
];

export const D1_PROGRAMS: ProgramRow[] = [
  // --- ACC
  { id: 'virginia', name: 'Virginia', mascot: 'Cavaliers', abbr: 'UVA', conference: 'acc', tier: 95, primary: '#232d4b', secondary: '#f84c1e', region: 'mid-atlantic' },
  { id: 'duke', name: 'Duke', mascot: 'Blue Devils', abbr: 'DUKE', conference: 'acc', tier: 93, primary: '#012169', secondary: '#ffffff', region: 'south' },
  { id: 'notre-dame', name: 'Notre Dame', mascot: 'Fighting Irish', abbr: 'ND', conference: 'acc', tier: 96, primary: '#0c2340', secondary: '#c99700', region: 'midwest' },
  { id: 'syracuse', name: 'Syracuse', mascot: 'Orange', abbr: 'CUSE', conference: 'acc', tier: 92, primary: '#f76900', secondary: '#000e54', region: 'northeast' },
  { id: 'north-carolina', name: 'North Carolina', mascot: 'Tar Heels', abbr: 'UNC', conference: 'acc', tier: 90, primary: '#4b9cd3', secondary: '#ffffff', region: 'south' },
  { id: 'boston-college-m', name: 'Boston College', mascot: 'Eagles', abbr: 'BC', conference: 'acc', tier: 82, primary: '#8a100b', secondary: '#b29d6c', region: 'northeast' },

  // --- Big Ten
  { id: 'maryland', name: 'Maryland', mascot: 'Terrapins', abbr: 'MD', conference: 'big-ten', tier: 96, primary: '#e03a3e', secondary: '#ffd200', region: 'mid-atlantic' },
  { id: 'johns-hopkins', name: 'Johns Hopkins', mascot: 'Blue Jays', abbr: 'JHU', conference: 'big-ten', tier: 91, primary: '#002d72', secondary: '#68ace5', region: 'mid-atlantic' },
  { id: 'penn-state', name: 'Penn State', mascot: 'Nittany Lions', abbr: 'PSU', conference: 'big-ten', tier: 90, primary: '#041e42', secondary: '#ffffff', region: 'northeast' },
  { id: 'rutgers', name: 'Rutgers', mascot: 'Scarlet Knights', abbr: 'RUT', conference: 'big-ten', tier: 86, primary: '#cc0033', secondary: '#5f6a72', region: 'northeast' },
  { id: 'ohio-state', name: 'Ohio State', mascot: 'Buckeyes', abbr: 'OSU', conference: 'big-ten', tier: 84, primary: '#bb0000', secondary: '#a7b1b7', region: 'midwest' },
  { id: 'michigan', name: 'Michigan', mascot: 'Wolverines', abbr: 'MICH', conference: 'big-ten', tier: 78, primary: '#00274c', secondary: '#ffcb05', region: 'midwest' },

  // --- Ivy League
  { id: 'princeton', name: 'Princeton', mascot: 'Tigers', abbr: 'PRIN', conference: 'ivy', tier: 93, primary: '#ee7f2d', secondary: '#000000', region: 'northeast' },
  { id: 'cornell', name: 'Cornell', mascot: 'Big Red', abbr: 'COR', conference: 'ivy', tier: 91, primary: '#b31b1b', secondary: '#ffffff', region: 'northeast' },
  { id: 'yale', name: 'Yale', mascot: 'Bulldogs', abbr: 'YALE', conference: 'ivy', tier: 89, primary: '#00356b', secondary: '#ffffff', region: 'northeast' },
  { id: 'penn', name: 'Penn', mascot: 'Quakers', abbr: 'PENN', conference: 'ivy', tier: 85, primary: '#011f5b', secondary: '#990000', region: 'northeast' },
  { id: 'harvard', name: 'Harvard', mascot: 'Crimson', abbr: 'HARV', conference: 'ivy', tier: 80, primary: '#a51c30', secondary: '#000000', region: 'northeast' },
  { id: 'brown', name: 'Brown', mascot: 'Bears', abbr: 'BRWN', conference: 'ivy', tier: 76, primary: '#4e3629', secondary: '#c00404', region: 'northeast' },
  { id: 'dartmouth', name: 'Dartmouth', mascot: 'Big Green', abbr: 'DART', conference: 'ivy', tier: 70, primary: '#00693e', secondary: '#ffffff', region: 'northeast' },

  // --- Patriot League
  { id: 'army', name: 'Army West Point', mascot: 'Black Knights', abbr: 'ARMY', conference: 'patriot', tier: 88, primary: '#000000', secondary: '#d4bf91', region: 'northeast' },
  { id: 'navy', name: 'Navy', mascot: 'Midshipmen', abbr: 'NAVY', conference: 'patriot', tier: 86, primary: '#00205b', secondary: '#c5b783', region: 'mid-atlantic' },
  { id: 'loyola-md', name: 'Loyola Maryland', mascot: 'Greyhounds', abbr: 'LOY', conference: 'patriot', tier: 87, primary: '#00543c', secondary: '#adb3b8', region: 'mid-atlantic' },
  { id: 'lehigh', name: 'Lehigh', mascot: 'Mountain Hawks', abbr: 'LEH', conference: 'patriot', tier: 81, primary: '#653819', secondary: '#a89968', region: 'northeast' },
  { id: 'boston-u', name: 'Boston University', mascot: 'Terriers', abbr: 'BU', conference: 'patriot', tier: 79, primary: '#cc0000', secondary: '#ffffff', region: 'northeast' },
  { id: 'bucknell', name: 'Bucknell', mascot: 'Bison', abbr: 'BUCK', conference: 'patriot', tier: 77, primary: '#e87722', secondary: '#003865', region: 'northeast' },
  { id: 'colgate', name: 'Colgate', mascot: 'Raiders', abbr: 'COLG', conference: 'patriot', tier: 74, primary: '#821019', secondary: '#ffffff', region: 'northeast' },
  { id: 'holy-cross', name: 'Holy Cross', mascot: 'Crusaders', abbr: 'HC', conference: 'patriot', tier: 68, primary: '#602d89', secondary: '#000000', region: 'northeast' },
  { id: 'lafayette', name: 'Lafayette', mascot: 'Leopards', abbr: 'LAF', conference: 'patriot', tier: 66, primary: '#910029', secondary: '#000000', region: 'northeast' },

  // --- Big East
  { id: 'georgetown', name: 'Georgetown', mascot: 'Hoyas', abbr: 'GTWN', conference: 'big-east', tier: 90, primary: '#041e42', secondary: '#8d817b', region: 'mid-atlantic' },
  { id: 'denver', name: 'Denver', mascot: 'Pioneers', abbr: 'DEN', conference: 'big-east', tier: 87, primary: '#8b2332', secondary: '#c8c9c7', region: 'west' },
  { id: 'villanova', name: 'Villanova', mascot: 'Wildcats', abbr: 'NOVA', conference: 'big-east', tier: 80, primary: '#00205b', secondary: '#13b5ea', region: 'northeast' },
  { id: 'providence', name: 'Providence', mascot: 'Friars', abbr: 'PROV', conference: 'big-east', tier: 78, primary: '#000000', secondary: '#8c8f93', region: 'northeast' },
  { id: 'st-johns', name: "St. John's", mascot: 'Red Storm', abbr: 'SJU', conference: 'big-east', tier: 72, primary: '#ba0c2f', secondary: '#ffffff', region: 'northeast' },
  { id: 'marquette', name: 'Marquette', mascot: 'Golden Eagles', abbr: 'MARQ', conference: 'big-east', tier: 74, primary: '#003366', secondary: '#ffcc00', region: 'midwest' },

  // --- CAA
  { id: 'towson', name: 'Towson', mascot: 'Tigers', abbr: 'TOW', conference: 'caa', tier: 82, primary: '#ffb81c', secondary: '#000000', region: 'mid-atlantic' },
  { id: 'drexel', name: 'Drexel', mascot: 'Dragons', abbr: 'DREX', conference: 'caa', tier: 76, primary: '#07294d', secondary: '#ffc600', region: 'northeast' },
  { id: 'stony-brook', name: 'Stony Brook', mascot: 'Seawolves', abbr: 'SBU', conference: 'caa', tier: 77, primary: '#990000', secondary: '#016f92', region: 'northeast' },
  { id: 'monmouth', name: 'Monmouth', mascot: 'Hawks', abbr: 'MONM', conference: 'caa', tier: 70, primary: '#041e42', secondary: '#899baa', region: 'northeast' },
  { id: 'delaware', name: 'Delaware', mascot: 'Blue Hens', abbr: 'DEL', conference: 'caa', tier: 73, primary: '#00539f', secondary: '#ffd200', region: 'mid-atlantic' },
  { id: 'hofstra', name: 'Hofstra', mascot: 'Pride', abbr: 'HOF', conference: 'caa', tier: 75, primary: '#003591', secondary: '#f2a900', region: 'northeast' },
  { id: 'fairfield', name: 'Fairfield', mascot: 'Stags', abbr: 'FAIR', conference: 'caa', tier: 79, primary: '#e4002b', secondary: '#000000', region: 'northeast' },

  // --- America East
  { id: 'albany', name: 'Albany', mascot: 'Great Danes', abbr: 'ALB', conference: 'america-east', tier: 78, primary: '#46166b', secondary: '#eeb211', region: 'northeast' },
  { id: 'vermont', name: 'Vermont', mascot: 'Catamounts', abbr: 'UVM', conference: 'america-east', tier: 76, primary: '#154734', secondary: '#ffb81c', region: 'northeast' },
  { id: 'umbc', name: 'UMBC', mascot: 'Retrievers', abbr: 'UMBC', conference: 'america-east', tier: 68, primary: '#000000', secondary: '#ffcc00', region: 'mid-atlantic' },
  { id: 'binghamton', name: 'Binghamton', mascot: 'Bearcats', abbr: 'BING', conference: 'america-east', tier: 62, primary: '#005a43', secondary: '#ffffff', region: 'northeast' },
  { id: 'njit', name: 'NJIT', mascot: 'Highlanders', abbr: 'NJIT', conference: 'america-east', tier: 58, primary: '#d31245', secondary: '#ffffff', region: 'northeast' },
  { id: 'umass-lowell', name: 'UMass Lowell', mascot: 'River Hawks', abbr: 'UML', conference: 'america-east', tier: 60, primary: '#003da5', secondary: '#d0202f', region: 'northeast' },

  // --- ASUN
  { id: 'richmond', name: 'Richmond', mascot: 'Spiders', abbr: 'RICH', conference: 'atlantic-10', tier: 80, primary: '#990000', secondary: '#000066', region: 'south' },
  { id: 'jacksonville', name: 'Jacksonville', mascot: 'Dolphins', abbr: 'JAX', conference: 'asun', tier: 66, primary: '#0b6623', secondary: '#000000', region: 'south' },
  { id: 'mercer', name: 'Mercer', mascot: 'Bears', abbr: 'MER', conference: 'asun', tier: 64, primary: '#f76900', secondary: '#000000', region: 'south' },
  { id: 'high-point', name: 'High Point', mascot: 'Panthers', abbr: 'HPU', conference: 'asun', tier: 71, primary: '#4d1979', secondary: '#ffffff', region: 'south' },
  { id: 'utah', name: 'Utah', mascot: 'Utes', abbr: 'UTAH', conference: 'asun', tier: 67, primary: '#cc0000', secondary: '#ffffff', region: 'west' },
  { id: 'cleveland-state', name: 'Cleveland State', mascot: 'Vikings', abbr: 'CSU', conference: 'asun', tier: 55, primary: '#006847', secondary: '#ffffff', region: 'midwest' },
  { id: 'detroit-mercy', name: 'Detroit Mercy', mascot: 'Titans', abbr: 'DET', conference: 'asun', tier: 57, primary: '#004b8d', secondary: '#c8102e', region: 'midwest' },

  // --- NEC
  { id: 'robert-morris', name: 'Robert Morris', mascot: 'Colonials', abbr: 'RMU', conference: 'nec', tier: 63, primary: '#00205b', secondary: '#a6192e', region: 'midwest' },
  { id: 'sacred-heart', name: 'Sacred Heart', mascot: 'Pioneers', abbr: 'SHU', conference: 'nec', tier: 61, primary: '#c8102e', secondary: '#ffffff', region: 'northeast' },
  { id: 'wagner', name: 'Wagner', mascot: 'Seahawks', abbr: 'WAG', conference: 'nec', tier: 52, primary: '#046a38', secondary: '#ffffff', region: 'northeast' },
  { id: 'lemoyne-d1', name: 'Le Moyne', mascot: 'Dolphins', abbr: 'LEM', conference: 'nec', tier: 59, primary: '#046a38', secondary: '#ffd100', region: 'northeast' },
  { id: 'stonehill', name: 'Stonehill', mascot: 'Skyhawks', abbr: 'STO', conference: 'nec', tier: 50, primary: '#4b2e83', secondary: '#ffffff', region: 'northeast' },
  { id: 'saint-josephs', name: "Saint Joseph's", mascot: 'Hawks', abbr: 'SJU-P', conference: 'nec', tier: 56, primary: '#9e1b32', secondary: '#a2aaad', region: 'northeast' },

  // --- Atlantic 10
  { id: 'saint-josephs-a10', name: 'Saint Bonaventure', mascot: 'Bonnies', abbr: 'SBU-B', conference: 'atlantic-10', tier: 54, primary: '#78222e', secondary: '#a89968', region: 'northeast' },
  { id: 'umass', name: 'UMass', mascot: 'Minutemen', abbr: 'UMASS', conference: 'atlantic-10', tier: 74, primary: '#881c1c', secondary: '#ffffff', region: 'northeast' },
  { id: 'george-mason', name: 'George Mason', mascot: 'Patriots', abbr: 'GMU', conference: 'atlantic-10', tier: 62, primary: '#006633', secondary: '#ffcc33', region: 'mid-atlantic' },
  { id: 'st-bonaventure', name: 'Siena', mascot: 'Saints', abbr: 'SIE', conference: 'atlantic-10', tier: 58, primary: '#046a38', secondary: '#ffb81c', region: 'northeast' },
  { id: 'davidson', name: 'Davidson', mascot: 'Wildcats', abbr: 'DAV', conference: 'atlantic-10', tier: 56, primary: '#a6192e', secondary: '#000000', region: 'south' },
  { id: 'vcu', name: 'VCU', mascot: 'Rams', abbr: 'VCU', conference: 'atlantic-10', tier: 60, primary: '#000000', secondary: '#f8b800', region: 'south' },
];

/* ===========================================================================
 * NCAA DIVISION II
 * ========================================================================= */

export const D2_CONFERENCES: ConferenceInfo[] = [
  { id: 'northeast-10', name: 'Northeast-10 Conference', short: 'NE-10', level: 'd2', autoBid: true },
  { id: 'ecc', name: 'East Coast Conference', short: 'ECC', level: 'd2', autoBid: true },
  { id: 'cacc', name: 'Central Atlantic Collegiate Conference', short: 'CACC', level: 'd2', autoBid: true },
  { id: 'sac', name: 'South Atlantic Conference', short: 'SAC', level: 'd2', autoBid: true },
  { id: 'g-mac', name: 'Great Midwest Athletic Conference', short: 'G-MAC', level: 'd2', autoBid: true },
  { id: 'sunshine', name: 'Sunshine State Conference', short: 'SSC', level: 'd2', autoBid: true },
];

export const D2_PROGRAMS: ProgramRow[] = [
  // --- Northeast-10
  { id: 'adelphi', name: 'Adelphi', mascot: 'Panthers', abbr: 'ADEL', conference: 'northeast-10', tier: 92, primary: '#663399', secondary: '#f0b323', region: 'northeast' },
  { id: 'merrimack-d2', name: 'Saint Anselm', mascot: 'Hawks', abbr: 'ANS', conference: 'northeast-10', tier: 74, primary: '#00205b', secondary: '#ffffff', region: 'northeast' },
  { id: 'bentley', name: 'Bentley', mascot: 'Falcons', abbr: 'BENT', conference: 'northeast-10', tier: 72, primary: '#00427e', secondary: '#c1c6c8', region: 'northeast' },
  { id: 'southern-nh', name: 'Southern New Hampshire', mascot: 'Penmen', abbr: 'SNHU', conference: 'northeast-10', tier: 76, primary: '#003da5', secondary: '#ffc72c', region: 'northeast' },
  { id: 'franklin-pierce', name: 'Franklin Pierce', mascot: 'Ravens', abbr: 'FPU', conference: 'northeast-10', tier: 70, primary: '#00573f', secondary: '#c8c9c7', region: 'northeast' },
  { id: 'assumption', name: 'Assumption', mascot: 'Greyhounds', abbr: 'ASMP', conference: 'northeast-10', tier: 66, primary: '#00205b', secondary: '#c8102e', region: 'northeast' },
  { id: 'american-intl', name: 'American International', mascot: 'Yellow Jackets', abbr: 'AIC', conference: 'northeast-10', tier: 58, primary: '#ffc72c', secondary: '#000000', region: 'northeast' },
  { id: 'saint-michaels', name: "Saint Michael's", mascot: 'Purple Knights', abbr: 'SMC', conference: 'northeast-10', tier: 56, primary: '#4b2e83', secondary: '#c8c9c7', region: 'northeast' },

  // --- East Coast Conference
  { id: 'lemoyne', name: 'Molloy', mascot: 'Lions', abbr: 'MOL', conference: 'ecc', tier: 68, primary: '#8b0000', secondary: '#ffffff', region: 'northeast' },
  { id: 'nyit', name: 'New York Tech', mascot: 'Bears', abbr: 'NYIT', conference: 'ecc', tier: 71, primary: '#f7c600', secondary: '#00539f', region: 'northeast' },
  { id: 'pace', name: 'Pace', mascot: 'Setters', abbr: 'PACE', conference: 'ecc', tier: 64, primary: '#00539f', secondary: '#ffc72c', region: 'northeast' },
  { id: 'mercy', name: 'Mercy', mascot: 'Mavericks', abbr: 'MERC', conference: 'ecc', tier: 60, primary: '#00205b', secondary: '#ffffff', region: 'northeast' },
  { id: 'roberts-wesleyan', name: 'Roberts Wesleyan', mascot: 'Redhawks', abbr: 'RWU', conference: 'ecc', tier: 52, primary: '#8b1a1a', secondary: '#ffffff', region: 'northeast' },

  // --- CACC
  { id: 'chestnut-hill', name: 'Chestnut Hill', mascot: 'Griffins', abbr: 'CHC', conference: 'cacc', tier: 54, primary: '#00205b', secondary: '#ffffff', region: 'northeast' },
  { id: 'jefferson', name: 'Jefferson', mascot: 'Rams', abbr: 'JEFF', conference: 'cacc', tier: 62, primary: '#00205b', secondary: '#c8102e', region: 'northeast' },
  { id: 'holy-family', name: 'Holy Family', mascot: 'Tigers', abbr: 'HFU', conference: 'cacc', tier: 50, primary: '#00539f', secondary: '#ffffff', region: 'northeast' },
  { id: 'post', name: 'Post', mascot: 'Eagles', abbr: 'POST', conference: 'cacc', tier: 48, primary: '#00205b', secondary: '#a2aaad', region: 'northeast' },

  // --- South Atlantic
  { id: 'limestone', name: 'Limestone', mascot: 'Saints', abbr: 'LIME', conference: 'sac', tier: 88, primary: '#00205b', secondary: '#c8102e', region: 'south' },
  { id: 'wingate', name: 'Wingate', mascot: 'Bulldogs', abbr: 'WING', conference: 'sac', tier: 72, primary: '#00205b', secondary: '#ffc72c', region: 'south' },
  { id: 'catawba', name: 'Catawba', mascot: 'Indians', abbr: 'CAT', conference: 'sac', tier: 58, primary: '#00205b', secondary: '#c8102e', region: 'south' },
  { id: 'lenoir-rhyne', name: 'Lenoir-Rhyne', mascot: 'Bears', abbr: 'LR', conference: 'sac', tier: 74, primary: '#8b0000', secondary: '#000000', region: 'south' },
  { id: 'belmont-abbey', name: 'Belmont Abbey', mascot: 'Crusaders', abbr: 'ABBY', conference: 'sac', tier: 60, primary: '#c8102e', secondary: '#000000', region: 'south' },
  { id: 'queens-nc', name: 'Queens', mascot: 'Royals', abbr: 'QUNS', conference: 'sac', tier: 64, primary: '#00205b', secondary: '#ffffff', region: 'south' },

  // --- G-MAC
  { id: 'findlay', name: 'Findlay', mascot: 'Oilers', abbr: 'FIND', conference: 'g-mac', tier: 56, primary: '#f26522', secondary: '#000000', region: 'midwest' },
  { id: 'tiffin', name: 'Tiffin', mascot: 'Dragons', abbr: 'TIFF', conference: 'g-mac', tier: 54, primary: '#00543c', secondary: '#ffc72c', region: 'midwest' },
  { id: 'walsh', name: 'Walsh', mascot: 'Cavaliers', abbr: 'WLSH', conference: 'g-mac', tier: 52, primary: '#00205b', secondary: '#ffc72c', region: 'midwest' },
  { id: 'lake-erie', name: 'Lake Erie', mascot: 'Storm', abbr: 'LEC', conference: 'g-mac', tier: 46, primary: '#00539f', secondary: '#ffffff', region: 'midwest' },
  { id: 'seton-hill', name: 'Seton Hill', mascot: 'Griffins', abbr: 'SETH', conference: 'g-mac', tier: 62, primary: '#ffc72c', secondary: '#00205b', region: 'midwest' },
  { id: 'mercyhurst', name: 'Mercyhurst', mascot: 'Lakers', abbr: 'MERH', conference: 'g-mac', tier: 76, primary: '#00543c', secondary: '#ffffff', region: 'midwest' },

  // --- Sunshine State
  { id: 'tampa', name: 'Tampa', mascot: 'Spartans', abbr: 'TAMP', conference: 'sunshine', tier: 84, primary: '#c8102e', secondary: '#000000', region: 'south' },
  { id: 'rollins', name: 'Rollins', mascot: 'Tars', abbr: 'ROL', conference: 'sunshine', tier: 78, primary: '#00539f', secondary: '#ffc72c', region: 'south' },
  { id: 'florida-southern', name: 'Florida Southern', mascot: 'Moccasins', abbr: 'FSC', conference: 'sunshine', tier: 74, primary: '#c8102e', secondary: '#ffffff', region: 'south' },
  { id: 'palm-beach-atlantic', name: 'Palm Beach Atlantic', mascot: 'Sailfish', abbr: 'PBA', conference: 'sunshine', tier: 50, primary: '#00539f', secondary: '#ffc72c', region: 'south' },
  { id: 'embry-riddle', name: 'Embry-Riddle', mascot: 'Eagles', abbr: 'ERAU', conference: 'sunshine', tier: 48, primary: '#00205b', secondary: '#ffc72c', region: 'south' },
];

/* ===========================================================================
 * NCAA DIVISION III — the biggest level in the sport
 * ========================================================================= */

export const D3_CONFERENCES: ConferenceInfo[] = [
  { id: 'nescac', name: 'New England Small College Athletic Conference', short: 'NESCAC', level: 'd3', autoBid: true },
  { id: 'centennial', name: 'Centennial Conference', short: 'Centennial', level: 'd3', autoBid: true },
  { id: 'liberty', name: 'Liberty League', short: 'Liberty', level: 'd3', autoBid: true },
  { id: 'suny', name: 'SUNY Athletic Conference', short: 'SUNYAC', level: 'd3', autoBid: true },
  { id: 'mac-freedom', name: 'Middle Atlantic Conference', short: 'MAC', level: 'd3', autoBid: true },
  { id: 'njac', name: 'New Jersey Athletic Conference', short: 'NJAC', level: 'd3', autoBid: true },
  { id: 'ncac', name: 'North Coast Athletic Conference', short: 'NCAC', level: 'd3', autoBid: true },
  { id: 'odac', name: 'Old Dominion Athletic Conference', short: 'ODAC', level: 'd3', autoBid: true },
  { id: 'ccc', name: 'Commonwealth Coast Conference', short: 'CCC', level: 'd3', autoBid: true },
  { id: 'landmark', name: 'Landmark Conference', short: 'Landmark', level: 'd3', autoBid: true },
];

export const D3_PROGRAMS: ProgramRow[] = [
  // --- NESCAC
  { id: 'tufts', name: 'Tufts', mascot: 'Jumbos', abbr: 'TUFT', conference: 'nescac', tier: 94, primary: '#3e8ede', secondary: '#502d7f', region: 'northeast' },
  { id: 'amherst', name: 'Amherst', mascot: 'Mammoths', abbr: 'AMH', conference: 'nescac', tier: 84, primary: '#4b2e83', secondary: '#ffffff', region: 'northeast' },
  { id: 'williams', name: 'Williams', mascot: 'Ephs', abbr: 'WIL', conference: 'nescac', tier: 82, primary: '#4b2e83', secondary: '#ffc72c', region: 'northeast' },
  { id: 'middlebury', name: 'Middlebury', mascot: 'Panthers', abbr: 'MIDD', conference: 'nescac', tier: 90, primary: '#0d5257', secondary: '#ffffff', region: 'northeast' },
  { id: 'wesleyan', name: 'Wesleyan', mascot: 'Cardinals', abbr: 'WES', conference: 'nescac', tier: 80, primary: '#c8102e', secondary: '#000000', region: 'northeast' },
  { id: 'bowdoin', name: 'Bowdoin', mascot: 'Polar Bears', abbr: 'BOW', conference: 'nescac', tier: 74, primary: '#000000', secondary: '#c8c9c7', region: 'northeast' },
  { id: 'trinity-ct', name: 'Trinity', mascot: 'Bantams', abbr: 'TRIN', conference: 'nescac', tier: 78, primary: '#00539f', secondary: '#ffc72c', region: 'northeast' },
  { id: 'hamilton', name: 'Hamilton', mascot: 'Continentals', abbr: 'HAM', conference: 'nescac', tier: 70, primary: '#00205b', secondary: '#8b1a1a', region: 'northeast' },
  { id: 'colby', name: 'Colby', mascot: 'Mules', abbr: 'COLB', conference: 'nescac', tier: 62, primary: '#00539f', secondary: '#a2aaad', region: 'northeast' },
  { id: 'bates', name: 'Bates', mascot: 'Bobcats', abbr: 'BATE', conference: 'nescac', tier: 58, primary: '#7c2529', secondary: '#ffffff', region: 'northeast' },
  { id: 'conn-college', name: 'Connecticut College', mascot: 'Camels', abbr: 'CONN', conference: 'nescac', tier: 54, primary: '#00539f', secondary: '#ffffff', region: 'northeast' },

  // --- Centennial
  { id: 'gettysburg', name: 'Gettysburg', mascot: 'Bullets', abbr: 'GETT', conference: 'centennial', tier: 86, primary: '#f26522', secondary: '#00205b', region: 'mid-atlantic' },
  { id: 'franklin-marshall', name: 'Franklin & Marshall', mascot: 'Diplomats', abbr: 'F&M', conference: 'centennial', tier: 82, primary: '#00539f', secondary: '#ffffff', region: 'mid-atlantic' },
  { id: 'dickinson', name: 'Dickinson', mascot: 'Red Devils', abbr: 'DICK', conference: 'centennial', tier: 72, primary: '#c8102e', secondary: '#000000', region: 'mid-atlantic' },
  { id: 'haverford', name: 'Haverford', mascot: 'Fords', abbr: 'HAV', conference: 'centennial', tier: 66, primary: '#8b1a1a', secondary: '#000000', region: 'mid-atlantic' },
  { id: 'swarthmore', name: 'Swarthmore', mascot: 'Garnet', abbr: 'SWAR', conference: 'centennial', tier: 56, primary: '#7c2529', secondary: '#ffffff', region: 'mid-atlantic' },
  { id: 'washington-md', name: 'Washington College', mascot: 'Shoremen', abbr: 'WAC', conference: 'centennial', tier: 76, primary: '#7c2529', secondary: '#000000', region: 'mid-atlantic' },
  { id: 'mcdaniel', name: 'McDaniel', mascot: 'Green Terror', abbr: 'MCD', conference: 'centennial', tier: 60, primary: '#00543c', secondary: '#ffc72c', region: 'mid-atlantic' },
  { id: 'ursinus', name: 'Ursinus', mascot: 'Bears', abbr: 'URS', conference: 'centennial', tier: 64, primary: '#8b1a1a', secondary: '#ffffff', region: 'mid-atlantic' },
  { id: 'muhlenberg', name: 'Muhlenberg', mascot: 'Mules', abbr: 'MUHL', conference: 'centennial', tier: 68, primary: '#c8102e', secondary: '#a2aaad', region: 'mid-atlantic' },
  { id: 'johns-hopkins-d3', name: 'Bryn Athyn', mascot: 'Lions', abbr: 'BRYN', conference: 'centennial', tier: 44, primary: '#8b1a1a', secondary: '#ffc72c', region: 'mid-atlantic' },

  // --- Liberty League
  { id: 'rit', name: 'RIT', mascot: 'Tigers', abbr: 'RIT', conference: 'liberty', tier: 90, primary: '#f76902', secondary: '#513127', region: 'northeast' },
  { id: 'union', name: 'Union', mascot: 'Garnet Chargers', abbr: 'UNI', conference: 'liberty', tier: 74, primary: '#7c2529', secondary: '#000000', region: 'northeast' },
  { id: 'rpi', name: 'RPI', mascot: 'Engineers', abbr: 'RPI', conference: 'liberty', tier: 70, primary: '#c8102e', secondary: '#ffffff', region: 'northeast' },
  { id: 'st-lawrence', name: 'St. Lawrence', mascot: 'Saints', abbr: 'STL', conference: 'liberty', tier: 76, primary: '#c8102e', secondary: '#00205b', region: 'northeast' },
  { id: 'ithaca', name: 'Ithaca', mascot: 'Bombers', abbr: 'ITH', conference: 'liberty', tier: 72, primary: '#00539f', secondary: '#ffc72c', region: 'northeast' },
  { id: 'skidmore', name: 'Skidmore', mascot: 'Thoroughbreds', abbr: 'SKID', conference: 'liberty', tier: 66, primary: '#7c2529', secondary: '#ffc72c', region: 'northeast' },
  { id: 'vassar', name: 'Vassar', mascot: 'Brewers', abbr: 'VAS', conference: 'liberty', tier: 50, primary: '#7c2529', secondary: '#c8c9c7', region: 'northeast' },
  { id: 'bard', name: 'Bard', mascot: 'Raptors', abbr: 'BARD', conference: 'liberty', tier: 38, primary: '#7c2529', secondary: '#ffffff', region: 'northeast' },
  { id: 'clarkson', name: 'Clarkson', mascot: 'Golden Knights', abbr: 'CLK', conference: 'liberty', tier: 58, primary: '#00543c', secondary: '#ffc72c', region: 'northeast' },
  { id: 'hobart-d3', name: 'Hobart', mascot: 'Statesmen', abbr: 'HOB', conference: 'liberty', tier: 88, primary: '#4b2e83', secondary: '#ffc72c', region: 'northeast' },

  // --- SUNYAC
  { id: 'cortland', name: 'Cortland', mascot: 'Red Dragons', abbr: 'CORT', conference: 'suny', tier: 88, primary: '#c8102e', secondary: '#ffffff', region: 'northeast' },
  { id: 'geneseo', name: 'Geneseo', mascot: 'Knights', abbr: 'GEN', conference: 'suny', tier: 74, primary: '#00205b', secondary: '#ffffff', region: 'northeast' },
  { id: 'oneonta', name: 'Oneonta', mascot: 'Red Dragons', abbr: 'ONE', conference: 'suny', tier: 62, primary: '#c8102e', secondary: '#000000', region: 'northeast' },
  { id: 'plattsburgh', name: 'Plattsburgh', mascot: 'Cardinals', abbr: 'PLAT', conference: 'suny', tier: 54, primary: '#c8102e', secondary: '#ffffff', region: 'northeast' },
  { id: 'brockport', name: 'Brockport', mascot: 'Golden Eagles', abbr: 'BROC', conference: 'suny', tier: 68, primary: '#00543c', secondary: '#ffc72c', region: 'northeast' },
  { id: 'potsdam', name: 'Potsdam', mascot: 'Bears', abbr: 'POT', conference: 'suny', tier: 42, primary: '#7c2529', secondary: '#ffffff', region: 'northeast' },
  { id: 'new-paltz', name: 'New Paltz', mascot: 'Hawks', abbr: 'NP', conference: 'suny', tier: 48, primary: '#f76902', secondary: '#00205b', region: 'northeast' },
  { id: 'oswego', name: 'Oswego', mascot: 'Lakers', abbr: 'OSW', conference: 'suny', tier: 52, primary: '#00543c', secondary: '#ffc72c', region: 'northeast' },

  // --- MAC
  { id: 'stevenson', name: 'Stevenson', mascot: 'Mustangs', abbr: 'STEV', conference: 'mac-freedom', tier: 84, primary: '#00543c', secondary: '#000000', region: 'mid-atlantic' },
  { id: 'york-pa', name: 'York', mascot: 'Spartans', abbr: 'YORK', conference: 'mac-freedom', tier: 76, primary: '#00539f', secondary: '#ffffff', region: 'mid-atlantic' },
  { id: 'widener', name: 'Widener', mascot: 'Pride', abbr: 'WID', conference: 'mac-freedom', tier: 64, primary: '#00205b', secondary: '#ffc72c', region: 'mid-atlantic' },
  { id: 'lycoming', name: 'Lycoming', mascot: 'Warriors', abbr: 'LYC', conference: 'mac-freedom', tier: 58, primary: '#00205b', secondary: '#ffc72c', region: 'mid-atlantic' },
  { id: 'kings-pa', name: "King's", mascot: 'Monarchs', abbr: 'KING', conference: 'mac-freedom', tier: 50, primary: '#7c2529', secondary: '#ffffff', region: 'mid-atlantic' },
  { id: 'misericordia', name: 'Misericordia', mascot: 'Cougars', abbr: 'MISE', conference: 'mac-freedom', tier: 56, primary: '#00539f', secondary: '#ffc72c', region: 'mid-atlantic' },
  { id: 'delaware-valley', name: 'Delaware Valley', mascot: 'Aggies', abbr: 'DELV', conference: 'mac-freedom', tier: 46, primary: '#00543c', secondary: '#ffc72c', region: 'mid-atlantic' },

  // --- NJAC
  { id: 'rowan', name: 'Rowan', mascot: 'Profs', abbr: 'ROW', conference: 'njac', tier: 78, primary: '#7c2529', secondary: '#ffc72c', region: 'northeast' },
  { id: 'tcnj', name: 'TCNJ', mascot: 'Lions', abbr: 'TCNJ', conference: 'njac', tier: 80, primary: '#00205b', secondary: '#ffc72c', region: 'northeast' },
  { id: 'montclair', name: 'Montclair State', mascot: 'Red Hawks', abbr: 'MONT', conference: 'njac', tier: 68, primary: '#c8102e', secondary: '#ffffff', region: 'northeast' },
  { id: 'stockton', name: 'Stockton', mascot: 'Ospreys', abbr: 'STOC', conference: 'njac', tier: 66, primary: '#00539f', secondary: '#ffffff', region: 'northeast' },
  { id: 'kean', name: 'Kean', mascot: 'Cougars', abbr: 'KEAN', conference: 'njac', tier: 52, primary: '#00205b', secondary: '#c8c9c7', region: 'northeast' },
  { id: 'ramapo', name: 'Ramapo', mascot: 'Roadrunners', abbr: 'RAM', conference: 'njac', tier: 60, primary: '#7c2529', secondary: '#ffffff', region: 'northeast' },
  { id: 'rutgers-newark', name: 'Rutgers-Newark', mascot: 'Scarlet Raiders', abbr: 'RUN', conference: 'njac', tier: 40, primary: '#c8102e', secondary: '#000000', region: 'northeast' },

  // --- NCAC
  { id: 'denison', name: 'Denison', mascot: 'Big Red', abbr: 'DEN-D3', conference: 'ncac', tier: 82, primary: '#c8102e', secondary: '#ffffff', region: 'midwest' },
  { id: 'ohio-wesleyan', name: 'Ohio Wesleyan', mascot: 'Battling Bishops', abbr: 'OWU', conference: 'ncac', tier: 84, primary: '#c8102e', secondary: '#000000', region: 'midwest' },
  { id: 'wooster', name: 'Wooster', mascot: 'Fighting Scots', abbr: 'WOO', conference: 'ncac', tier: 62, primary: '#000000', secondary: '#ffc72c', region: 'midwest' },
  { id: 'kenyon', name: 'Kenyon', mascot: 'Owls', abbr: 'KEN', conference: 'ncac', tier: 66, primary: '#4b2e83', secondary: '#ffffff', region: 'midwest' },
  { id: 'oberlin', name: 'Oberlin', mascot: 'Yeomen', abbr: 'OBER', conference: 'ncac', tier: 44, primary: '#c8102e', secondary: '#00205b', region: 'midwest' },
  { id: 'wabash', name: 'Wabash', mascot: 'Little Giants', abbr: 'WAB', conference: 'ncac', tier: 54, primary: '#c8102e', secondary: '#ffffff', region: 'midwest' },
  { id: 'depauw', name: 'DePauw', mascot: 'Tigers', abbr: 'DEP', conference: 'ncac', tier: 58, primary: '#000000', secondary: '#ffc72c', region: 'midwest' },

  // --- ODAC
  { id: 'washington-lee', name: 'Washington & Lee', mascot: 'Generals', abbr: 'W&L', conference: 'odac', tier: 86, primary: '#00205b', secondary: '#ffffff', region: 'south' },
  { id: 'lynchburg', name: 'Lynchburg', mascot: 'Hornets', abbr: 'LYN', conference: 'odac', tier: 80, primary: '#7c2529', secondary: '#a2aaad', region: 'south' },
  { id: 'roanoke', name: 'Roanoke', mascot: 'Maroons', abbr: 'ROAN', conference: 'odac', tier: 78, primary: '#7c2529', secondary: '#ffffff', region: 'south' },
  { id: 'hampden-sydney', name: 'Hampden-Sydney', mascot: 'Tigers', abbr: 'H-SC', conference: 'odac', tier: 64, primary: '#7c2529', secondary: '#a2aaad', region: 'south' },
  { id: 'randolph-macon', name: 'Randolph-Macon', mascot: 'Yellow Jackets', abbr: 'R-MC', conference: 'odac', tier: 60, primary: '#ffc72c', secondary: '#000000', region: 'south' },
  { id: 'bridgewater-va', name: 'Bridgewater', mascot: 'Eagles', abbr: 'BRI', conference: 'odac', tier: 50, primary: '#c8102e', secondary: '#ffffff', region: 'south' },
  { id: 'shenandoah', name: 'Shenandoah', mascot: 'Hornets', abbr: 'SHEN', conference: 'odac', tier: 46, primary: '#c8102e', secondary: '#00205b', region: 'south' },
  { id: 'virginia-wesleyan', name: 'Virginia Wesleyan', mascot: 'Marlins', abbr: 'VWU', conference: 'odac', tier: 42, primary: '#00205b', secondary: '#c8102e', region: 'south' },

  // --- CCC
  { id: 'endicott', name: 'Endicott', mascot: 'Gulls', abbr: 'END', conference: 'ccc', tier: 76, primary: '#00543c', secondary: '#ffffff', region: 'northeast' },
  { id: 'wentworth', name: 'Wentworth', mascot: 'Leopards', abbr: 'WENT', conference: 'ccc', tier: 60, primary: '#c8102e', secondary: '#000000', region: 'northeast' },
  { id: 'salve-regina', name: 'Salve Regina', mascot: 'Seahawks', abbr: 'SALV', conference: 'ccc', tier: 64, primary: '#00205b', secondary: '#ffffff', region: 'northeast' },
  { id: 'roger-williams', name: 'Roger Williams', mascot: 'Hawks', abbr: 'RWU-C', conference: 'ccc', tier: 56, primary: '#00205b', secondary: '#ffc72c', region: 'northeast' },
  { id: 'curry', name: 'Curry', mascot: 'Colonels', abbr: 'CUR', conference: 'ccc', tier: 48, primary: '#4b2e83', secondary: '#ffffff', region: 'northeast' },
  { id: 'nichols', name: 'Nichols', mascot: 'Bison', abbr: 'NICH', conference: 'ccc', tier: 44, primary: '#00543c', secondary: '#000000', region: 'northeast' },
  { id: 'western-new-england', name: 'Western New England', mascot: 'Golden Bears', abbr: 'WNE', conference: 'ccc', tier: 52, primary: '#00205b', secondary: '#ffc72c', region: 'northeast' },

  // --- Landmark
  { id: 'susquehanna', name: 'Susquehanna', mascot: 'River Hawks', abbr: 'SUSQ', conference: 'landmark', tier: 62, primary: '#7c2529', secondary: '#ffc72c', region: 'mid-atlantic' },
  { id: 'scranton', name: 'Scranton', mascot: 'Royals', abbr: 'SCR', conference: 'landmark', tier: 58, primary: '#7c2529', secondary: '#ffffff', region: 'mid-atlantic' },
  { id: 'catholic', name: 'Catholic', mascot: 'Cardinals', abbr: 'CUA', conference: 'landmark', tier: 68, primary: '#c8102e', secondary: '#000000', region: 'mid-atlantic' },
  { id: 'juniata', name: 'Juniata', mascot: 'Eagles', abbr: 'JUN', conference: 'landmark', tier: 46, primary: '#00205b', secondary: '#ffc72c', region: 'mid-atlantic' },
  { id: 'goucher', name: 'Goucher', mascot: 'Gophers', abbr: 'GOU', conference: 'landmark', tier: 40, primary: '#00539f', secondary: '#ffc72c', region: 'mid-atlantic' },
  { id: 'moravian', name: 'Moravian', mascot: 'Greyhounds', abbr: 'MOR', conference: 'landmark', tier: 54, primary: '#00205b', secondary: '#ffc72c', region: 'mid-atlantic' },
  { id: 'elizabethtown', name: 'Elizabethtown', mascot: 'Blue Jays', abbr: 'ETWN', conference: 'landmark', tier: 50, primary: '#00539f', secondary: '#ffffff', region: 'mid-atlantic' },
  { id: 'drew', name: 'Drew', mascot: 'Rangers', abbr: 'DREW', conference: 'landmark', tier: 38, primary: '#00543c', secondary: '#ffffff', region: 'northeast' },
];

/* ===========================================================================
 * SEMI-PROFESSIONAL — the Continental Lacrosse League
 *
 * Entirely invented. Twelve clubs in two conferences, in markets the sport
 * actually reaches, so the rung between college and the professional game
 * exists and has somewhere to play.
 * ========================================================================= */

export const SEMIPRO_CONFERENCES: ConferenceInfo[] = [
  { id: 'cll-east', name: 'Continental League — Eastern Conference', short: 'CLL East', level: 'semipro', autoBid: true },
  { id: 'cll-west', name: 'Continental League — Western Conference', short: 'CLL West', level: 'semipro', autoBid: true },
];

export const SEMIPRO_PROGRAMS: ProgramRow[] = [
  { id: 'cll-baltimore', name: 'Baltimore Ironmen', mascot: 'Ironmen', abbr: 'BAL', conference: 'cll-east', tier: 90, primary: '#2a2a2a', secondary: '#e8a33d', region: 'mid-atlantic' },
  { id: 'cll-long-island', name: 'Long Island Surf', mascot: 'Surf', abbr: 'LI', conference: 'cll-east', tier: 84, primary: '#0f6ea8', secondary: '#e6f0f5', region: 'northeast' },
  { id: 'cll-boston', name: 'Boston Harbormen', mascot: 'Harbormen', abbr: 'BOS', conference: 'cll-east', tier: 80, primary: '#0b3d2e', secondary: '#d9c27e', region: 'northeast' },
  { id: 'cll-philadelphia', name: 'Philadelphia Forge', mascot: 'Forge', abbr: 'PHI', conference: 'cll-east', tier: 76, primary: '#7a2230', secondary: '#d9d9d9', region: 'northeast' },
  { id: 'cll-carolina', name: 'Carolina Pines', mascot: 'Pines', abbr: 'CAR', conference: 'cll-east', tier: 70, primary: '#1f5c3a', secondary: '#f0e6c8', region: 'south' },
  { id: 'cll-syracuse', name: 'Syracuse Sentinels', mascot: 'Sentinels', abbr: 'SYR', conference: 'cll-east', tier: 66, primary: '#5b2d8e', secondary: '#f5a623', region: 'northeast' },
  { id: 'cll-denver', name: 'Denver Ridge', mascot: 'Ridge', abbr: 'DEN-C', conference: 'cll-west', tier: 86, primary: '#1b3a5c', secondary: '#c8862f', region: 'west' },
  { id: 'cll-california', name: 'Sacramento Gold', mascot: 'Gold', abbr: 'SAC', conference: 'cll-west', tier: 78, primary: '#a67c1f', secondary: '#1a1a1a', region: 'west' },
  { id: 'cll-seattle', name: 'Seattle Cascades', mascot: 'Cascades', abbr: 'SEA', conference: 'cll-west', tier: 72, primary: '#12595c', secondary: '#cfe3e5', region: 'west' },
  { id: 'cll-chicago', name: 'Chicago Ironworks', mascot: 'Ironworks', abbr: 'CHI', conference: 'cll-west', tier: 74, primary: '#8c1c2b', secondary: '#b7bdc4', region: 'midwest' },
  { id: 'cll-dallas', name: 'Dallas Longhorns Club', mascot: 'Drovers', abbr: 'DAL', conference: 'cll-west', tier: 64, primary: '#1f3d6b', secondary: '#d2b48c', region: 'texas' },
  { id: 'cll-minnesota', name: 'Minnesota North', mascot: 'North', abbr: 'MIN', conference: 'cll-west', tier: 60, primary: '#20476b', secondary: '#9fb8cc', region: 'midwest' },
];

/* ===========================================================================
 * PROFESSIONAL — the Premier Lacrosse League
 *
 * The eight clubs and their home markets are real (2026 season). The ratings,
 * the rosters and every result are the game's own fiction, and the game draws
 * its own original marks rather than using the league's.
 * ========================================================================= */

export const PLL_CONFERENCES: ConferenceInfo[] = [
  { id: 'pll', name: 'Premier Lacrosse League', short: 'PLL', level: 'pll', autoBid: false },
];

export const PLL_PROGRAMS: ProgramRow[] = [
  { id: 'pll-archers', name: 'Utah Archers', mascot: 'Archers', abbr: 'UTA', conference: 'pll', tier: 94, primary: '#1c1c1c', secondary: '#c8102e', region: 'west' },
  { id: 'pll-atlas', name: 'New York Atlas', mascot: 'Atlas', abbr: 'NY', conference: 'pll', tier: 88, primary: '#0b2545', secondary: '#f2f2f2', region: 'northeast' },
  { id: 'pll-cannons', name: 'Boston Cannons', mascot: 'Cannons', abbr: 'BOS', conference: 'pll', tier: 82, primary: '#0d2b45', secondary: '#c8a24a', region: 'northeast' },
  { id: 'pll-chaos', name: 'Carolina Chaos', mascot: 'Chaos', abbr: 'CAR', conference: 'pll', tier: 84, primary: '#1f9c6e', secondary: '#101820', region: 'south' },
  { id: 'pll-outlaws', name: 'Denver Outlaws', mascot: 'Outlaws', abbr: 'DEN', conference: 'pll', tier: 86, primary: '#1b2f4a', secondary: '#e2b13c', region: 'west' },
  { id: 'pll-redwoods', name: 'California Redwoods', mascot: 'Redwoods', abbr: 'CAL', conference: 'pll', tier: 85, primary: '#7a2f1d', secondary: '#d8cbb4', region: 'west' },
  { id: 'pll-waterdogs', name: 'Philadelphia Waterdogs', mascot: 'Waterdogs', abbr: 'PHI', conference: 'pll', tier: 87, primary: '#14657d', secondary: '#e8f1f2', region: 'northeast' },
  { id: 'pll-whipsnakes', name: 'Maryland Whipsnakes', mascot: 'Whipsnakes', abbr: 'MD', conference: 'pll', tier: 90, primary: '#3c2a6e', secondary: '#e9e4f0', region: 'mid-atlantic' },
];

export const ALL_CONFERENCES: ConferenceInfo[] = [
  ...D1_CONFERENCES, ...D2_CONFERENCES, ...D3_CONFERENCES,
  ...SEMIPRO_CONFERENCES, ...PLL_CONFERENCES,
];

export const PROGRAMS_BY_LEVEL: Record<Exclude<Level, 'hs'>, ProgramRow[]> = {
  d1: D1_PROGRAMS,
  d2: D2_PROGRAMS,
  d3: D3_PROGRAMS,
  semipro: SEMIPRO_PROGRAMS,
  pll: PLL_PROGRAMS,
};
