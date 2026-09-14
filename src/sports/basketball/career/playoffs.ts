import { LEVELS } from '../levels';
import { conferencesAt, teamsAtLevel, worldTeam } from '../world';
import { simulateFixture } from './league';
import { conferenceTable, levelTable } from './schedule';
import type { HoopsCareer, HoopsFixture, PostseasonRound } from './types';

/* ---------------------------------------------------------------------------
 * THE POSTSEASON
 * ---------------------------------------------------------------------------
 * Qualifying is the biggest moment of most seasons and it used to be a line of
 * small text. Here it is a bracket: who got in, who they drew, and what happened
 * to everybody after you were knocked out — because a tournament that stops
 * existing the moment you lose is a tournament nobody believes in.
 *
 * The shape follows the tier. A high school plays a state tournament; a college
 * plays its conference tournament and then a national one; a professional league
 * plays a straight bracket of its best clubs. All of them come out of the same
 * machinery: a seeded field, a single-elimination draw, and a champion.
 * ------------------------------------------------------------------------- */

const ROUND_BY_SIZE: Record<number, PostseasonRound[]> = {
  2: ['final'],
  4: ['semi', 'final'],
  8: ['quarter', 'semi', 'final'],
  16: ['first', 'quarter', 'semi', 'final'],
  32: ['first', 'quarter', 'semi', 'final'],
};

/** The field, best first. Conference champions are in whatever their record. */
export function seedField(career: HoopsCareer): string[] {
  const info = LEVELS[career.level];
  const all = teamsAtLevel(career.level);
  const want = fieldSize(Math.round(all.length * info.playoffShare));

  // Every conference sends its winner. That is what makes a conference worth
  // winning when the national field would never have taken you.
  const autoBids: string[] = [];
  for (const c of conferencesAt(career.level)) {
    const table = conferenceTable(career.standings, career.level, c.id);
    if (table.length) autoBids.push(table[0].teamId);
  }

  const overall = levelTable(career.standings, career.level);
  const field = [...autoBids];
  for (const row of overall) {
    if (field.length >= want) break;
    if (!field.includes(row.teamId)) field.push(row.teamId);
  }
  // Seeded by overall record, so an auto-bid from a weak conference draws the
  // worst seed rather than a free pass.
  const rank = new Map(overall.map((r, i) => [r.teamId, i]));
  return field
    .slice(0, want)
    .sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999));
}

/** Rounds down to a bracket that actually works. */
function fieldSize(want: number): number {
  const sizes = [2, 4, 8, 16, 32];
  let best = 2;
  for (const s of sizes) if (s <= Math.max(2, want)) best = s;
  return best;
}

/** The opening round: one against the last seed, two against the second last. */
export function drawBracket(career: HoopsCareer, seeds: string[]): HoopsFixture[] {
  const rounds = ROUND_BY_SIZE[seeds.length] ?? ['final'];
  const first = rounds[0];
  const out: HoopsFixture[] = [];
  for (let i = 0; i < seeds.length / 2; i++) {
    const home = seeds[i];
    const away = seeds[seeds.length - 1 - i];
    out.push(fixture(career, home, away, first, out.length));
  }
  return out;
}

function fixture(
  career: HoopsCareer, home: string, away: string, round: PostseasonRound, n: number,
): HoopsFixture {
  return {
    id: `p${round}-${n}`,
    round: 0,
    homeId: home,
    awayId: away,
    played: false,
    homeScore: 0,
    awayScore: 0,
    featured: home === career.teamId || away === career.teamId,
    conference: false,
    rivalry: false,
    postseason: round,
  };
}

const winnerOf = (f: HoopsFixture): string | null =>
  (f.played ? (f.homeScore > f.awayScore ? f.homeId : f.awayId) : null);

/**
 * The next game waiting to be played, building each round as the one before it
 * finishes. Returns null when the tournament is over.
 */
export function nextPostseasonGame(career: HoopsCareer): HoopsFixture | null {
  const pending = career.postseason.find((f) => !f.played);
  if (pending) return pending;
  if (!career.postseason.length) return null;

  const rounds = ROUND_BY_SIZE[career.postseasonSeeds?.length ?? 2] ?? ['final'];
  const lastRound = career.postseason[career.postseason.length - 1].postseason!;
  const at = rounds.indexOf(lastRound);
  if (at < 0 || at >= rounds.length - 1) return null;

  const winners = career.postseason
    .filter((f) => f.postseason === lastRound)
    .map(winnerOf)
    .filter((w): w is string => !!w);
  if (winners.length < 2) return null;

  // Seeding carries through: the best surviving seed keeps home advantage.
  const order = new Map((career.postseasonSeeds ?? []).map((id, i) => [id, i]));
  const sorted = [...winners].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
  const next = rounds[at + 1];
  const made: HoopsFixture[] = [];
  for (let i = 0; i < sorted.length / 2; i++) {
    made.push(fixture(career, sorted[i], sorted[sorted.length - 1 - i], next, i));
  }
  career.postseason.push(...made);
  return made[0] ?? null;
}

/** Play every postseason game that does not involve the coach's own club. */
export function advancePostseason(career: HoopsCareer): void {
  for (let guard = 0; guard < 80; guard++) {
    const g = nextPostseasonGame(career);
    if (!g) break;
    if (g.homeId === career.teamId || g.awayId === career.teamId) return;
    simulateFixture(career, g);
  }
  finishPostseason(career);
}

/** Run the whole tournament out, including the coach's own games. */
export function simulateRestOfPostseason(career: HoopsCareer): void {
  for (let guard = 0; guard < 80; guard++) {
    const g = nextPostseasonGame(career);
    if (!g) break;
    simulateFixture(career, g);
  }
  finishPostseason(career);
}

export function finishPostseason(career: HoopsCareer): void {
  const final = career.postseason.find((f) => f.postseason === 'final' && f.played);
  if (final) career.championId = winnerOf(final);
}

/** Is the coach's club still alive? */
export function stillAlive(career: HoopsCareer): boolean {
  if (!career.postseasonSeeds?.includes(career.teamId)) return false;
  return !career.postseason.some((f) =>
    f.played && (f.homeId === career.teamId || f.awayId === career.teamId)
    && winnerOf(f) !== career.teamId);
}

/** How far the coach got, in words. */
export function postseasonFinish(career: HoopsCareer): string {
  const info = LEVELS[career.level];
  if (!career.postseasonSeeds?.includes(career.teamId)) {
    return `Missed ${info.postseason}`;
  }
  if (career.championId === career.teamId) return `Won the ${info.trophy}`;
  const mine = career.postseason
    .filter((f) => f.played && (f.homeId === career.teamId || f.awayId === career.teamId));
  const lost = mine.find((f) => winnerOf(f) !== career.teamId);
  if (!lost) return `In ${info.postseason}`;
  const round = lost.postseason ?? 'first';
  const label: Record<PostseasonRound, string> = {
    'conf-quarter': 'Lost in the conference quarter-final',
    'conf-semi': 'Lost in the conference semi-final',
    'conf-final': 'Lost the conference final',
    first: 'Lost in the first round',
    quarter: 'Lost in the quarter-final',
    semi: 'Lost in the semi-final',
    final: `Lost the ${info.trophy}`,
  };
  return label[round];
}

/** The bracket as rows, for the screen that shows it. */
export interface BracketRow {
  round: PostseasonRound;
  games: HoopsFixture[];
}

export function bracketRows(career: HoopsCareer): BracketRow[] {
  const order: PostseasonRound[] = ['first', 'quarter', 'semi', 'final'];
  return order
    .map((round) => ({
      round,
      games: career.postseason.filter((f) => f.postseason === round),
    }))
    .filter((r) => r.games.length > 0);
}

/** A seed's number in the field, for the bracket display. */
export function seedNumber(career: HoopsCareer, teamId: string): number {
  const i = career.postseasonSeeds?.indexOf(teamId) ?? -1;
  return i < 0 ? 0 : i + 1;
}

export const champion = (career: HoopsCareer): string | null =>
  (career.championId ? worldTeam(career.championId).city : null);
