/**
 * MODE COMPATIBILITY AUDIT
 *
 * Dynasty and Challenge are the same career engine. This walks a full season
 * and offseason in BOTH and checks that every system produced the same kind of
 * result in each — so a feature can never quietly work in one and not the other
 * again, which is exactly what happened to the transfer window.
 *
 *   npm run modes
 */
import {
  advancePhase, createCareer, nextUserGame, pitchTo, runOffseason, seasonFormat,
  simulateUserGame, standingsSorted, startChallenge,
} from '../league/career';
import { leaders, leagueStatLines, seasonRoster } from '../league/leagueStats';
import { newsFeed } from '../league/news';
import { isCareerMode, CAREER_MODES, MODE_LABEL } from '../league/modes';
import { marketFor } from '../league/transfers';
import { board, classGrade } from '../scouting/recruiting';
import { TRACK_ORDER, upgradeCost } from '../league/coaching';
import { projectsFor } from '../league/projects';
import type { Career, CareerMode } from '../league/types';

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
}

function playSeason(career: Career): void {
  let guard = 0;
  while (guard++ < 400) {
    const g = nextUserGame(career);
    if (!g) break;
    simulateUserGame(career, g);
  }
  advancePhase(career);
}

/** Everything a long-term career save is supposed to be able to do. */
function auditCareer(label: string, career: Career): void {
  const p = (name: string) => `${label}: ${name}`;

  check(p('is recognised as a career save'), isCareerMode(career.mode), career.mode);
  check(p('has a schedule'), career.schedule.length > 0, `${career.schedule.length} games`);
  check(p('has standings'), Object.keys(career.standings).length > 1);
  check(p('has a squad'), career.roster.length >= 18, `${career.roster.length} players`);
  check(p('has a season format'), !!seasonFormat(career).titleName, seasonFormat(career).titleName);
  check(p('opened a recruiting class'), (career.recruiting?.prospects.length ?? 0) > 0,
    `${career.recruiting?.prospects.length} prospects`);
  check(p('can hire scouts'), (career.recruiting?.market.length ?? 0) > 0,
    `${career.recruiting?.market.length} available`);
  check(p('has development projects'), projectsFor(career.roster[0]).length > 0);
  check(p('has coaching tracks to buy'), TRACK_ORDER.every((t) => upgradeCost(career.staff[t]) !== null));

  // --- in season
  playSeason(career);
  check(p('played a full season'), career.schedule.every((g) => g.played),
    `${career.schedule.filter((g) => g.played).length}/${career.schedule.length}`);
  check(p('the season reached a conclusion'), career.seasonComplete, career.finish ?? '');
  check(p('standings recorded a record'),
    (career.standings[career.teamId]?.wins ?? 0) + (career.standings[career.teamId]?.losses ?? 0) > 0,
    `${career.standings[career.teamId]?.wins}-${career.standings[career.teamId]?.losses}`);
  check(p('the table is sortable'), standingsSorted(career).length > 1);
  check(p('player statistics accumulated'),
    career.roster.some((x) => x.season.gamesPlayed > 0));
  check(p('league-wide statistics exist'), leagueStatLines(career).length > 0,
    `${leagueStatLines(career).length} lines`);
  const lines = leagueStatLines(career);
  check(p('there are league leaders'), leaders(lines, 'points').length > 0,
    `${leaders(lines, 'points').length}`);
  check(p('other teams have rosters'), seasonRoster(career, standingsSorted(career)
    .map((r) => r.teamId).find((id) => id !== career.teamId)!).length > 0);
  check(p('the news feed has something to say'), newsFeed(career).length > 0,
    `${newsFeed(career).length} items`);
  check(p('recruiting advanced during the season'),
    (career.recruiting?.week ?? 0) > 0, `week ${career.recruiting?.week}`);
  check(p('the recruiting board sorts'), board(career.recruiting!, career.teamId, 'targets').length > 0);
  check(p('the class can be graded'), !!classGrade(career.recruiting!, career.teamId).grade);

  // --- offseason
  const before = career.roster.length;
  const yearBefore = career.year;
  const report = runOffseason(career);
  check(p('the offseason advanced the year'), career.year === yearBefore + 1);
  check(p('players developed'), report.development.length > 0, `${report.development.length} reports`);
  check(p('players graduated or moved on'), report.graduated.length + report.portalOut.length > 0,
    `${report.graduated.length} out, ${report.portalOut.length} through the portal`);
  check(p('new players arrived'), report.arrived.length > 0, `${report.arrived.length} arrivals`);
  check(p('the squad is still whole'), career.roster.length >= 18, `${before} → ${career.roster.length}`);
  check(p('a new schedule was drawn'), career.schedule.every((g) => !g.played));
  check(p('history was recorded'), career.history.length > 0, `${career.history.length} seasons`);
  check(p('a fresh recruiting class opened'), (career.recruiting?.prospects.length ?? 0) > 0);
  check(p('development history is being kept'),
    career.roster.some((x) => (x.dev?.history.length ?? 0) > 0));

  // --- the transfer window, which is what started all this
  const info = marketFor(career.level);
  check(p(`${info.title.toLowerCase()} opened`), career.market.length > 0,
    `${career.market.length} available`);
  check(p('approaches are available'), career.pitchesLeft === info.pitches,
    `${career.pitchesLeft} ${info.pitchesWord}`);
  const target = career.market[0];
  const out = target ? pitchTo(career, target.id) : null;
  check(p('an approach produces an outcome'), !!out, out?.result.outcome ?? 'none');
  check(p('the approach was spent'), career.pitchesLeft === info.pitches - 1);
  check(p('every candidate carries an estimate'), career.market.every((c) => typeof c.known === 'number'));
}

/* ------------------------------------------------------------------- run */

console.log('MODE COMPATIBILITY — the same career engine, driven twice\n');

const dynasty = createCareer({
  mode: 'dynasty', teamId: 'lake-highlands', difficulty: 'varsity', gameLength: 'standard', seed: 4242,
});
auditCareer('Dynasty (HS)', dynasty);

const challenge = startChallenge({ difficulty: 'varsity', gameLength: 'standard', seed: 4242 });
auditCareer('Challenge (HS)', challenge);

// And at a college level, where the portal is the whole point.
const college = createCareer({
  mode: 'challenge', teamId: 'syracuse', difficulty: 'allstate', gameLength: 'standard',
  seed: 909, level: 'd1',
});
college.challenge = challenge.challenge;
auditCareer('Challenge (D-I)', college);

const grouped = new Map<string, { ok: number; fail: string[] }>();
for (const r of results) {
  const label = r.name.split(':')[0];
  const g = grouped.get(label) ?? { ok: 0, fail: [] };
  if (r.ok) g.ok++; else g.fail.push(r.name.split(': ')[1]);
  grouped.set(label, g);
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
}

console.log('\nSUMMARY');
for (const [label, g] of grouped) {
  console.log(`  ${label.padEnd(18)} ${g.ok}/${g.ok + g.fail.length}`
    + (g.fail.length ? `  FAILED: ${g.fail.join(', ')}` : ''));
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
void CAREER_MODES;
void MODE_LABEL;
void (undefined as CareerMode | undefined);
if (failed.length) {
  const proc = (globalThis as { process?: { exit(code: number): void } }).process;
  proc?.exit(1);
}
