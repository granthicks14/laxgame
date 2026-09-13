/* ---------------------------------------------------------------------------
 * EVERY PROGRAMME IN THE GAME
 * ---------------------------------------------------------------------------
 * The whole basketball world as data, and nothing but data. Two hundred and
 * thirty-odd programmes across eight tiers, each one a single line:
 *
 *     'Name|Mascot|ABB|tier'
 *
 * `tier` is prestige WITHIN THE LEVEL, 0-99 — how this programme ranks against
 * its own peers, not against the sport. A 90 is the best high school in the
 * state and the best club in the world, depending on which table it is in.
 * Everything else about a programme — its colours, its arena, its playing
 * identity, its recruiting pull — is derived from that line in world.ts, so
 * adding a programme really is adding a line.
 *
 * Every name here is invented. Any resemblance to a real school or club is
 * accidental and not intended: none of these are modelled on real programmes,
 * real players or real records.
 * ------------------------------------------------------------------------- */

import type { HoopsLevel } from '../levels';

export interface ProgramRow {
  id: string;
  name: string;
  mascot: string;
  abbr: string;
  /** Prestige within the level, 0-99. */
  tier: number;
  conference: string;
}

export interface ConferenceInfo {
  id: string;
  name: string;
  short: string;
  level: HoopsLevel;
}

/** One line per programme: 'Name|Mascot|ABB|tier'. */
type Line = string;

interface ConferenceBlock {
  id: string;
  name: string;
  short: string;
  teams: Line[];
}

/* ------------------------------------------------------------ high school */

const HS_SMALL: ConferenceBlock[] = [
  {
    id: 'hs-s-north', name: 'Northern Small-School District', short: 'North',
    teams: [
      'Vale Creek|Badgers|VLC|72',
      'Rockridge|Miners|RKR|64',
      'Alder Bend|Pioneers|ALB|56',
      'Cold Harbor|Anchors|CHB|48',
      'Whitmore|Wildcats|WHM|41',
      'Pine Hollow|Loggers|PNH|33',
      'Tannery Flats|Tanners|TNF|24',
      'Sable Ridge|Colts|SBR|14',
    ],
  },
  {
    id: 'hs-s-south', name: 'Southern Small-School District', short: 'South',
    teams: [
      'Dunmoor|Hawks|DNM|78',
      'Salt Fork|Drillers|SLF|67',
      'Brandt|Bulldogs|BRA|58',
      'Cypress Hill|Cypress|CYH|50',
      'Marlow|Mustangs|MRL|43',
      'Kettle Creek|Kettles|KTC|30',
      'Ferrier|Ironmen|FER|21',
      'Gullane|Gulls|GUL|9',
    ],
  },
];

const HS_BIG: ConferenceBlock[] = [
  {
    id: 'hs-l-metro', name: 'Metropolitan League', short: 'Metro',
    teams: [
      'Ridgeway Central|Raiders|RWC|93',
      'Fairmont|Foxes|FAI|84',
      'Belmont Park|Spartans|BLP|75',
      'Kingsbury|Kings|KGB|66',
      'Ashton Heights|Eagles|ASH|55',
      'Northgate|Titans|NGT|45',
      'Crosby Union|Crusaders|CBU|34',
      'Merritt|Mariners|MRT|22',
    ],
  },
  {
    id: 'hs-l-valley', name: 'Valley Conference', short: 'Valley',
    teams: [
      'Granite Falls|Chargers|GRF|88',
      'Harlan West|Wolves|HRW|79',
      'Quarry Springs|Quarrymen|QRS|70',
      'Linden|Lions|LDN|61',
      'Osprey Point|Ospreys|OSP|52',
      'Thornbury|Thorns|THB|40',
      'Deerfield|Bucks|DRF|28',
      'Calder|Cardinals|CLD|16',
    ],
  },
];

/* ------------------------------------------------------------ junior college */

const JUCO: ConferenceBlock[] = [
  {
    id: 'juco-east', name: 'Eastern Junior College Conference', short: 'EJCC',
    teams: [
      'Brookvale CC|Bruins|BVC|91',
      'Port Meridian CC|Pilots|PMC|80',
      'Cedar County|Cedars|CDC|70',
      'Halstead CC|Hornets|HLS|60',
      'Ashbury CC|Archers|ASB|50',
      'Fenwick CC|Falcons|FNW|38',
      'Marsh Island CC|Herons|MIC|26',
      'Grindle CC|Millers|GRD|13',
    ],
  },
  {
    id: 'juco-central', name: 'Central Junior College Conference', short: 'CJCC',
    teams: [
      'Redstone CC|Ravens|RDS|86',
      'Trenton Valley|Trailblazers|TRV|76',
      'Keystone CC|Keys|KYS|66',
      'Birchwood CC|Bears|BRW|57',
      'Lamont CC|Lancers|LMT|46',
      'Copper Ridge|Coppers|CPR|35',
      'Waldron CC|Warriors|WLD|23',
      'Stillmont CC|Stallions|STL|11',
    ],
  },
  {
    id: 'juco-west', name: 'Western Junior College Conference', short: 'WJCC',
    teams: [
      'Sierra Mesa|Scorpions|SRM|89',
      'Bayshore CC|Breakers|BSH|78',
      'Alta Verde|Aviators|ALV|68',
      'Junipero CC|Jaguars|JNP|58',
      'Palo Rico|Pumas|PLR|47',
      'Desert Hollow|Dunes|DSH|36',
      'Cascabel CC|Coyotes|CSB|25',
      'Verdugo CC|Vaqueros|VRD|12',
    ],
  },
];

/* ---------------------------------------------------------------- Division III */

const D3: ConferenceBlock[] = [
  {
    id: 'd3-heritage', name: 'Heritage Athletic Conference', short: 'Heritage',
    teams: [
      'Wrenfield|Wrens|WRN|92', 'Ellsworth|Engineers|ELL|81', 'Caldwell|Chargers|CLW|71',
      'Thackery|Tigers|THK|62', 'Norwood|Knights|NRW|52', 'Ambrose|Owls|AMB|41',
      'Pemberton|Pioneers|PMB|29', 'Gilead|Griffins|GLD|15',
    ],
  },
  {
    id: 'd3-lakeland', name: 'Lakeland Conference', short: 'Lakeland',
    teams: [
      'Birchmont|Bobcats|BCM|87', 'Sutter Lake|Storm|SUT|77', 'Harrowgate|Harriers|HRG|67',
      'Vinton|Vikings|VNT|57', 'Stonebridge|Stonemasons|STB|47', 'Marlin Bay|Mariners|MLB|36',
      'Edgeworth|Eagles|EDG|24', 'Quill Hollow|Quills|QLH|12',
    ],
  },
  {
    id: 'd3-summit', name: 'Summit Conference', short: 'Summit',
    teams: [
      'Whitlock|Wolverines|WHT|90', 'Dunbarton|Dragons|DNB|79', 'Aspenfield|Avalanche|ASP|69',
      'Rockhaven|Rams|RKH|59', 'Coverdale|Colonels|CVD|49', 'Tilden|Thunder|TLD|38',
      'Bramble|Bison|BRM|26', 'Foxcroft|Foxes|FXC|14',
    ],
  },
  {
    id: 'd3-tidewater', name: 'Tidewater Conference', short: 'Tidewater',
    teams: [
      'Barrington|Buccaneers|BRG|85', 'Salter Point|Sailors|SLP|75', 'Weymouth|Whalers|WYM|65',
      'Coldstream|Crabs|CLS|55', 'Penfold|Petrels|PNF|45', 'Ashcombe|Anchors|ASC|33',
      'Ravenden|Ravens|RVD|22', 'Larkspur|Larks|LKS|10',
    ],
  },
  {
    id: 'd3-prairie', name: 'Prairie Conference', short: 'Prairie',
    teams: [
      'Kestermont|Kestrels|KSM|83', 'Fallow Ridge|Falcons|FLR|73', 'Rosedale|Roughriders|RSD|63',
      'Winnow|Wheatkings|WNW|53', 'Dalebrook|Dales|DLB|43', 'Cobbett|Cobbers|CBT|31',
      'Harrow Plains|Plainsmen|HRP|20', 'Yarrow|Yellowjackets|YRW|8',
    ],
  },
];

/* ----------------------------------------------------------------- Division II */

const D2: ConferenceBlock[] = [
  {
    id: 'd2-gateway', name: 'Gateway Athletic Conference', short: 'Gateway',
    teams: [
      'Sterling Heights|Sabres|STH|94', 'Ironbridge|Ironmen|IRB|84', 'Calverton|Cavaliers|CLV|73',
      'Merrowdale|Marauders|MRD|63', 'Ashford Bay|Admirals|AFB|53', 'Brenton|Bulldogs|BRN|42',
      'Hollis Creek|Hawks|HLC|30', 'Trask|Trappers|TRK|16',
    ],
  },
  {
    id: 'd2-piedmont', name: 'Piedmont Conference', short: 'Piedmont',
    teams: [
      'Granby|Greyhounds|GRB|89', 'Wendell Park|Wildcats|WDP|79', 'Loxley|Lancers|LXL|69',
      'Chasewood|Chargers|CHW|59', 'Marbury|Mavericks|MRB|48', 'Pinnacle|Panthers|PNC|37',
      'Redmoor|Redhawks|RDM|25', 'Sable Hill|Stallions|SBH|13',
    ],
  },
  {
    id: 'd2-northland', name: 'Northland Conference', short: 'Northland',
    teams: [
      'Kelvinshore|Krakens|KVS|91', 'Thurgood|Thunderbirds|THG|81', 'Ingleby|Islanders|ING|70',
      'Fairhaven|Frost|FRH|60', 'Clearwater Tech|Techmen|CWT|50', 'Northrop|Nordics|NTP|39',
      'Burnley|Bears|BRL|27', 'Alderport|Anchors|ALP|15',
    ],
  },
  {
    id: 'd2-southern', name: 'Southern Athletic Conference', short: 'Southern',
    teams: [
      'Talbot State|Titans|TBS|92', 'Cypress Grove|Gators|CPG|82', 'Mayfield|Monarchs|MYF|72',
      'Ellerslie|Eagles|ELR|62', 'Havenwood|Hurricanes|HVW|51', 'Rowland|Royals|RWL|40',
      'Duncastle|Dukes|DNC|28', 'Pelham Bay|Pelicans|PLB|17',
    ],
  },
  {
    id: 'd2-pacific', name: 'Pacific Coast Conference', short: 'Pacific',
    teams: [
      'Marisol|Matadors|MRS|88', 'Corbin Point|Condors|CRB|78', 'Silverado|Silversmiths|SLV|68',
      'Ocotillo|Outlaws|OCT|58', 'Grandview|Grizzlies|GRV|47', 'Sequoia Park|Sentinels|SQP|36',
      'Playa Verde|Pilots|PYV|24', 'Cabrillo Heights|Comets|CBH|11',
    ],
  },
];

/* --------------------------------------------------------- Division I mid-major */

const D1_MID: ConferenceBlock[] = [
  {
    id: 'd1m-colonial', name: 'Colonial League', short: 'Colonial',
    teams: [
      'Wexford|Wolfpack|WXF|90', 'Beaumont State|Bengals|BMS|80', 'Harrowfield|Hornets|HRF|70',
      'Ludlow|Lightning|LDL|61', 'Pennfield|Patriots|PNL|51', 'Ashgrove|Aces|ASG|40',
      'Carrick|Cougars|CRK|28', 'Stapleton|Stags|STP|14',
    ],
  },
  {
    id: 'd1m-horizon', name: 'Horizon Conference', short: 'Horizon',
    teams: [
      'Vantage State|Voyagers|VNS|92', 'Caldmoor|Cyclones|CLM|82', 'Redbank|Rattlers|RDB|71',
      'Fernhill|Firebirds|FNH|61', 'Talmadge|Tarheels|TLM|50', 'Overton|Otters|OVT|39',
      'Kirkwall|Kestrels|KRK|27', 'Denham|Dragons|DNH|15',
    ],
  },
  {
    id: 'd1m-frontier', name: 'Frontier Conference', short: 'Frontier',
    teams: [
      'Cheyenne Butte|Broncos|CYB|89', 'Laramie Flats|Lobos|LMF|79', 'Ashfall|Antelope|ASF|68',
      'Gunnison Park|Gunners|GNP|58', 'Wildhorse|Wranglers|WDH|48', 'Sandstone|Scorpions|SND|37',
      'Bitterroot|Bighorns|BTR|25', 'Coalridge|Colliers|CLR|12',
    ],
  },
  {
    id: 'd1m-metro', name: 'Metro Athletic Conference', short: 'Metro',
    teams: [
      'Halcyon City|Hawks|HLY|93', 'Dorchester|Dukes|DRC|83', 'Whitmarsh|Wildcats|WTM|73',
      'Eastgate|Explorers|ESG|63', 'Bellhaven|Bluejays|BLH|52', 'Ironmoor|Ironhawks|IRM|41',
      'Southbourne|Sharks|SBN|29', 'Renwick|Ramblers|RNW|16',
    ],
  },
  {
    id: 'd1m-southland', name: 'Southland Conference', short: 'Southland',
    teams: [
      'Magnolia State|Mavericks|MGS|88', 'Bayou Ridge|Bulldogs|BYR|78', 'Terrebonne|Tigers|TRB|67',
      'Pinehurst|Panthers|PNH1|57', 'Delacroix|Demons|DLX|46', 'Chandler|Chargers|CHD|35',
      'Ravenel|Redbirds|RVL|23', 'Willoughby|Warhawks|WLB|10',
    ],
  },
  {
    id: 'd1m-summit', name: 'High Plains Conference', short: 'Plains',
    teams: [
      'Kearney Falls|Falcons|KRF|86', 'Bison Creek|Bison|BSC|76', 'Grand Prairie|Cyclones|GPC|66',
      'Dakota Ridge|Defenders|DKR|56', 'Meadowlark|Larks|MDL|45', 'Silverbrook|Sabres|SVB|34',
      'Cottonwood|Cougars|CTW|22', 'Harveston|Hilltoppers|HVT|9',
    ],
  },
];

/* -------------------------------------------------------- Division I high-major */

const D1_HIGH: ConferenceBlock[] = [
  {
    id: 'd1h-imperial', name: 'Imperial Conference', short: 'Imperial',
    teams: [
      'Wakefield|Warriors|WKF|97', 'Dunmore State|Demons|DNS|89', 'Ashland Union|Aces|ASU|81',
      'Kingsford|Kings|KGF|73', 'Belvedere|Bruins|BVD|64', 'Marchmont|Monarchs|MCM|55',
      'Thornecroft|Thunder|TNC|44', 'Greyling|Grizzlies|GRY|31',
    ],
  },
  {
    id: 'd1h-atlantic', name: 'Atlantic Athletic Conference', short: 'Atlantic',
    teams: [
      'Harrington|Hurricanes|HRT|95', 'Saltmarsh|Seahawks|SLM|87', 'Vandermere|Vikings|VDM|79',
      'Chalmers|Colonels|CHM|71', 'Rothesay|Royals|RTH|62', 'Pemberley|Phoenix|PMY|53',
      'Ashworth Bay|Admirals|AWB|42', 'Lockridge|Lumberjacks|LKR|29',
    ],
  },
  {
    id: 'd1h-pacific', name: 'Pacific Ten Conference', short: 'Pac',
    teams: [
      'Golden Mesa|Grizzlies|GLM|96', 'Coronado State|Condors|CRS|88', 'Redwood Valley|Redwoods|RWV|80',
      'Pacifica|Pioneers|PFC|72', 'Arroyo Verde|Aztecs|ARV|63', 'Sunridge|Sundevils|SNR|54',
      'Monterra|Mustangs|MTR|43', 'Cascadia|Cascades|CSD|30',
    ],
  },
  {
    id: 'd1h-heartland', name: 'Heartland Conference', short: 'Heartland',
    teams: [
      'Ironvale State|Ironmen|IVS|94', 'Cordwood|Cardinals|CDW|86', 'Fort Chandler|Falcons|FTC|78',
      'Blackhawk Ridge|Blackhawks|BHR|70', 'Mill Springs|Millers|MLS|61', 'Wabash Hills|Wolverines|WBH|52',
      'Prairie Grove|Panthers|PRG|41', 'Kensett|Knights|KNS|28',
    ],
  },
];

/* ------------------------------------------------------ the development league */

const DEV: ConferenceBlock[] = [
  {
    id: 'dev-east', name: 'Development League East', short: 'DL East',
    teams: [
      'Fallsburgh|Foundry|FLB|88', 'Rockaway|Riptide|RCK|76', 'Brightline|Bolts|BRT|64',
      'Ironport|Ingots|IRP|52', 'Camden Row|Cutters|CMR|40', 'Harbor Gate|Hammers|HBG|28',
      'Talley Creek|Tanagers|TLC|18', 'Quarrytown|Quarry|QRT|8',
    ],
  },
  {
    id: 'dev-west', name: 'Development League West', short: 'DL West',
    teams: [
      'Cinder Peak|Cinders|CNP|84', 'Vela Bay|Voyagers|VLB|72', 'Dust Ridge|Drifters|DSR|60',
      'Junction City|Junction|JCT|48', 'Alkali Flats|Alkali|ALK|36', 'Saguaro|Sidewinders|SGR|26',
      'Windward|Windjammers|WDW|15', 'Lone Mesa|Longhorns|LNM|6',
    ],
  },
];

/* ------------------------------------------------------------------ the tables */

const BLOCKS: Record<Exclude<HoopsLevel, 'pro'>, ConferenceBlock[]> = {
  'hs-small': HS_SMALL,
  'hs-big': HS_BIG,
  juco: JUCO,
  d3: D3,
  d2: D2,
  'd1-mid': D1_MID,
  'd1-high': D1_HIGH,
  dev: DEV,
};

function parse(level: HoopsLevel, block: ConferenceBlock): ProgramRow[] {
  return block.teams.map((line) => {
    const [name, mascot, abbr, tier] = line.split('|');
    return {
      id: `${level}:${abbr.toLowerCase()}`,
      name,
      mascot,
      abbr,
      tier: Number(tier),
      conference: block.id,
    };
  });
}

export const PROGRAMS_BY_LEVEL: Record<Exclude<HoopsLevel, 'pro'>, ProgramRow[]> =
  Object.fromEntries(
    (Object.keys(BLOCKS) as Exclude<HoopsLevel, 'pro'>[])
      .map((level) => [level, BLOCKS[level].flatMap((b) => parse(level, b))]),
  ) as Record<Exclude<HoopsLevel, 'pro'>, ProgramRow[]>;

export const CONFERENCES_BY_LEVEL: Record<Exclude<HoopsLevel, 'pro'>, ConferenceInfo[]> =
  Object.fromEntries(
    (Object.keys(BLOCKS) as Exclude<HoopsLevel, 'pro'>[])
      .map((level) => [
        level,
        BLOCKS[level].map((b) => ({ id: b.id, name: b.name, short: b.short, level })),
      ]),
  ) as Record<Exclude<HoopsLevel, 'pro'>, ConferenceInfo[]>;
