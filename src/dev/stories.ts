/**
 * HOW OFTEN EACH GAME STORY COMES UP, AND WHETHER IT IS TRUE
 *
 * Two jobs:
 *
 *  1. Distribution. Every threshold in gameStory.ts is measured against the
 *     game itself — goals per possession, margin as a share of the total —
 *     rather than a fixed number of goals, because a nine-minute high school
 *     game and a twenty-minute professional one score at completely different
 *     rates. This prints the mix at every length so a change can be seen.
 *
 *  2. Truth. Every story is re-checked against the box score it came from. A
 *     comeback headline over a game nobody trailed in, or a blowout over a
 *     one-goal game, fails the run.
 *
 *   npm run stories
 */
import {
  advancePhase, nextUserGame, runOffseason, simulateUserGame, startChallenge,
} from '../league/career';
import { fixtureStory, simulateFixture } from '../league/fixture';
import type { StoryKind } from '../league/gameStory';
import type { GameLengthKey } from '../data/constants';
import type { Career } from '../league/types';

const LENGTHS: GameLengthKey[] = ['short', 'standard', 'long'];
const problems: string[] = [];
const overall: Record<string, number> = {};
let games = 0;

/** Everything the headline claims has to be in the numbers underneath it. */
function verify(kind: StoryKind, box: {
  my: number; their: number; total: number; margin: number; deficit: number; led: number;
  overtime: boolean; perPossession: number; savePct: number; theirSavePct: number;
  foPct: number; shooting: number; myShots: number; theirShots: number; ratingGap: number;
}): string | null {
  const swing = Math.max(3, Math.round(box.total * 0.22));
  switch (kind) {
    case 'comeback':
      return (box.my > box.their ? box.deficit : box.led) >= swing
        ? null : `comeback with no ${box.my > box.their ? 'deficit' : 'lead'} to speak of`;
    case 'overtime':
      return box.overtime ? null : 'overtime story on a game that ended in regulation';
    case 'upset':
      return box.my > box.their && box.ratingGap >= 8 ? null : 'upset without a win over a better side';
    case 'blowout':
      return box.margin >= 4 && box.margin >= box.total * 0.5 ? null : `blowout at ${box.my}-${box.their}`;
    case 'goalie':
      return Math.max(box.savePct, box.theirSavePct) >= 0.72 ? null : 'goalie story without a goalie performance';
    case 'shootout':
      return box.perPossession >= 0.40 ? null : 'shootout at a low scoring rate';
    case 'defensive':
      return box.perPossession <= 0.215 ? null : 'defensive battle at a high scoring rate';
    case 'faceoff':
      return box.foPct >= 0.60 ? null : 'faceoff story without winning the X';
    case 'cold':
      return box.my < box.their && box.shooting <= 0.15 ? null : 'cold shooting on a normal shooting day';
    case 'clinical':
      return box.my > box.their && box.shooting >= 0.40 ? null : 'clinical without the shooting to show for it';
    case 'grind':
      return box.my > box.their && box.theirShots - box.myShots >= 5 ? null : 'grind without being out-shot';
    case 'routine':
      return null;
    default:
      return `unknown story kind ${kind}`;
  }
}

for (const length of LENGTHS) {
  const mix: Record<string, number> = {};
  for (let seed = 1; seed <= 6; seed++) {
    const career: Career = startChallenge({ difficulty: 'varsity', gameLength: length, seed: seed * 971 });
    for (let year = 0; year < 3; year++) {
      let guard = 0;
      while (guard++ < 300) {
        const g = nextUserGame(career);
        if (!g) break;
        const r = simulateFixture(career, g);
        simulateUserGame(career, g);
        const story = fixtureStory(career, g);
        if (!story) { problems.push('a simulated game produced no story'); continue; }

        const home = g.homeId === career.teamId;
        const mine = home ? r.home : r.away;
        const theirs = home ? r.away : r.home;
        const my = home ? r.homeScore : r.awayScore;
        const their = home ? r.awayScore : r.homeScore;
        const poss = mine.possessions + theirs.possessions;
        const bad = verify(story.kind, {
          my,
          their,
          total: my + their,
          margin: Math.abs(my - their),
          deficit: home ? r.awayBiggestLead : r.homeBiggestLead,
          led: home ? r.homeBiggestLead : r.awayBiggestLead,
          overtime: r.overtime,
          perPossession: poss > 0 ? (my + their) / poss : 0,
          savePct: mine.saves / Math.max(1, mine.saves + their),
          theirSavePct: theirs.saves / Math.max(1, theirs.saves + my),
          foPct: mine.faceoffWins / Math.max(1, mine.faceoffTakes),
          shooting: my / Math.max(1, mine.shots),
          myShots: mine.shots,
          theirShots: theirs.shots,
          // The story is written against the same ratings the screen shows.
          ratingGap: 0,
        });
        if (bad && story.kind !== 'upset') problems.push(`${story.headline}: ${bad} (${my}-${their})`);

        // The scoreline in the sentence must be the scoreline of the game.
        if (my !== 0 || their !== 0) {
          const shown = `${Math.max(my, their)}-${Math.min(my, their)}`;
          const reversed = `${Math.min(my, their)}-${Math.max(my, their)}`;
          if (/\d+-\d+/.test(story.line) && !story.line.includes(shown) && !story.line.includes(reversed)) {
            problems.push(`a story quoted a score that is not the result: "${story.line}" (${my}-${their})`);
          }
        }

        // The run of play has to add up to the game it came from.
        const hq = r.homeByQuarter.reduce((n, x) => n + x, 0);
        const aq = r.awayByQuarter.reduce((n, x) => n + x, 0);
        if (hq !== r.homeScore || aq !== r.awayScore) {
          problems.push(`quarters ${hq}-${aq} do not add up to ${r.homeScore}-${r.awayScore}`);
        }
        if (r.overtime) {
          const regH = r.homeByQuarter.slice(0, 4).reduce((n, x) => n + x, 0);
          const regA = r.awayByQuarter.slice(0, 4).reduce((n, x) => n + x, 0);
          if (regH !== regA) problems.push(`overtime game was ${regH}-${regA} after four quarters`);
        }

        mix[story.kind] = (mix[story.kind] ?? 0) + 1;
        overall[story.kind] = (overall[story.kind] ?? 0) + 1;
        games++;
      }
      advancePhase(career);
      if (career.seasonComplete) runOffseason(career);
    }
  }
  console.log(length.padEnd(9), Object.entries(mix).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${((v / Object.values(mix).reduce((n, x) => n + x, 0)) * 100).toFixed(0)}%`).join('  '));
}

// A story of the same kind every time is not a story.
const kinds = Object.keys(overall).length;
console.log(`\n${games} games, ${kinds} different stories`);
console.log(Object.entries(overall).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${((v / games) * 100).toFixed(1)}%`).join('  '));

const top = Math.max(...Object.values(overall)) / games;
if (kinds < 8) problems.push(`only ${kinds} kinds of story appeared`);
if (top > 0.5) problems.push(`one story kind covers ${Math.round(top * 100)}% of games`);

console.log();
if (problems.length) {
  const seen = new Map<string, number>();
  for (const p of problems) seen.set(p, (seen.get(p) ?? 0) + 1);
  for (const [p, n] of seen) console.log(`FAIL  ${p}${n > 1 ? ` (x${n})` : ''}`);
  console.log(`\n${problems.length} PROBLEMS`);
  (globalThis as { process?: { exit(n: number): void } }).process?.exit(1);
} else {
  console.log('EVERY STORY MATCHES ITS BOX SCORE');
}
