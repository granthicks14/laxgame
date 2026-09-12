/**
 * The Challenge / Dynasty compatibility checklist, printed from the code that
 * actually decides it rather than from a document that can drift.
 *
 *   npm run checklist
 */
import { isCareerMode, isClimbMode, ALL_MODES, MODE_LABEL } from '../league/modes';
import type { CareerMode } from '../league/types';
import { marketFor } from '../league/transfers';
import { LEVEL_ORDER, LEVELS } from '../data/levels';
import { classSize, maxScouts, offerBudget } from '../scouting/recruiting';

interface Feature {
  group: string;
  name: string;
  /** Which modes it is meant to work in. */
  modes: CareerMode[];
  note?: string;
}

const CAREER = ['dynasty', 'challenge', 'superchallenge'] as const;
const ALL = ['season', 'dynasty', 'challenge', 'superchallenge'] as const;
/** Everything the ladder adds, which Super Challenge shares in full. */
const CLIMB = ['challenge', 'superchallenge'] as const;

const FEATURES: Feature[] = [
  { group: 'In season', name: 'Schedule', modes: [...ALL] },
  { group: 'In season', name: 'Standings', modes: [...ALL] },
  { group: 'In season', name: 'Statistics and league leaders', modes: [...ALL] },
  { group: 'In season', name: 'Team management and depth chart', modes: [...ALL] },
  { group: 'In season', name: 'Tactics', modes: [...ALL] },
  { group: 'In season', name: 'Play a game', modes: [...ALL] },
  { group: 'In season', name: 'Simulate a game or a quarter', modes: [...ALL] },
  { group: 'In season', name: 'Practice focus', modes: [...ALL] },
  { group: 'In season', name: "Coach's office", modes: [...ALL] },
  { group: 'In season', name: 'Training players with Coach Points', modes: [...ALL] },
  { group: 'In season', name: 'Recruiting and scouting', modes: [...CAREER], note: 'a class needs a next year' },
  { group: 'In season', name: 'News feed', modes: [...ALL] },
  { group: 'In season', name: 'Playoffs and championships', modes: [...ALL] },

  { group: 'Offseason', name: 'Player development', modes: [...CAREER] },
  { group: 'Offseason', name: 'Development projects', modes: [...CAREER] },
  { group: 'Offseason', name: 'Graduations and departures', modes: [...CAREER] },
  { group: 'Offseason', name: 'Recruits arrive on the roster', modes: [...CAREER] },
  { group: 'Offseason', name: 'Transfer window (level-aware)', modes: [...CAREER] },
  { group: 'Offseason', name: 'Losing your own players', modes: [...CAREER], note: 'college and above' },
  { group: 'Offseason', name: 'Staff upgrades', modes: [...CAREER] },
  { group: 'Offseason', name: 'Promotion and relegation', modes: [...CAREER], note: 'high school only' },
  { group: 'Offseason', name: 'League drift', modes: [...CAREER] },

  { group: 'Career', name: 'Programme history', modes: [...CAREER] },
  { group: 'Career', name: 'Career wins and losses', modes: [...ALL] },
  { group: 'Career', name: 'Championship history', modes: [...CAREER] },
  { group: 'Career', name: 'Alumni and player history', modes: [...CAREER] },
  { group: 'Career', name: 'Records screen', modes: [...ALL] },
  { group: 'Career', name: 'Prestige', modes: [...ALL] },

  { group: 'Challenge only', name: 'The ladder and career climbing', modes: [...CLIMB] },
  { group: 'Challenge only', name: 'Championship requirements', modes: [...CLIMB] },
  { group: 'Challenge only', name: 'Job offers and changing programme', modes: [...CLIMB] },
  { group: 'Challenge only', name: 'Coach reputation and the hot seat', modes: [...CLIMB] },
  { group: 'Challenge only', name: 'Multiple levels of lacrosse', modes: [...CLIMB] },
  { group: 'Challenge only', name: 'Career tracker and legacy score', modes: [...CLIMB] },
];

console.log('MODE FEATURE CHECKLIST\n');
console.log('                                              season  dynasty  challenge');
let group = '';
for (const f of FEATURES) {
  if (f.group !== group) {
    group = f.group;
    console.log(`\n${group.toUpperCase()}`);
  }
  const cells = ALL_MODES.map((m) => (f.modes.includes(m) ? '  ✓   ' : '  —   ')).join('  ');
  console.log(`  ${f.name.padEnd(42)}${cells}${f.note ? `   (${f.note})` : ''}`);
}

const careerOnly = FEATURES.filter((f) => !f.modes.includes('season'));
const challengeMissing = careerOnly.filter((f) => !f.modes.includes('challenge'));
console.log(`\n${careerOnly.length} systems belong to the career engine.`);
console.log(challengeMissing.length === 0
  ? 'Challenge Mode has every one of them.'
  : `MISSING FROM CHALLENGE: ${challengeMissing.map((f) => f.name).join(', ')}`);

console.log('\nWHAT EACH MODE IS');
for (const m of ALL_MODES) {
  console.log(`  ${MODE_LABEL[m].padEnd(10)} career engine: ${isCareerMode(m) ? 'yes' : 'no '}   `
    + `the job can change: ${isClimbMode(m) ? 'yes' : 'no'}`);
}

console.log('\nWHAT EACH LEVEL GETS');
for (const level of LEVEL_ORDER) {
  const m = marketFor(level);
  console.log(
    `  ${LEVELS[level].short.padEnd(8)} ${m.title.padEnd(17)} `
    + `${m.pitches} ${m.pitchesWord.padEnd(10)} pool ${String(m.size).padStart(2)}  `
    + `own players can leave: ${m.outgoing ? 'yes' : 'no '}  `
    + `class ${String(classSize(level)).padStart(2)}, ${offerBudget(level)} offers, `
    + `${maxScouts(level)} scouts`,
  );
}
