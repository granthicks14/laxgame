/**
 * Dynasty loop harness: runs a programme through several full seasons and
 * reports what the systems actually produced — development, promotion and
 * relegation, transfers and league statistics.
 *
 *   npm run dynasty
 */
import { Rng } from '../core/rng';
import {
  createCareer, advancePhase, classMembers, effectiveClass, nextUserGame, pitchTo,
  runOffseason, spendCoachPoints, simulateUserGame, standingsSorted, userTeam,
} from '../league/career';
import { leaders, leagueStatLines } from '../league/leagueStats';
import { LADDER_LABEL, ordinal } from '../league/promotion';
import { TRACK_ORDER, upgradeCost } from '../league/coaching';
import { CLASS_ORDER, TEAMS } from '../data/teams';
import type { Career } from '../league/types';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const YEARS = Number(env.YEARS ?? 6);
const TEAM = env.TEAM ?? 'lake-highlands'; // a weak programme, on purpose

function playSeason(career: Career): void {
  let guard = 0;
  while (guard++ < 400) {
    const g = nextUserGame(career);
    if (!g) break;
    simulateUserGame(career, g);
  }
  advancePhase(career);
}

function spend(career: Career): string[] {
  // A plausible coach: development first, then defense, then culture.
  const order = ['development', 'defense', 'culture', 'offense', 'conditioning'] as const;
  const bought: string[] = [];
  for (const track of order) {
    for (;;) {
      const cost = upgradeCost(career.staff[track]);
      if (cost === null || career.coachingPoints < cost) break;
      spendCoachPoints(career, cost);
      career.staff[track]++;
      bought.push(`${track}→${career.staff[track]}`);
    }
  }
  return bought;
}

const career = createCareer({
  mode: 'dynasty', teamId: TEAM, difficulty: 'varsity', gameLength: 'short', seed: 1234,
});

console.log(`${userTeam(career).name} — starting in ${LADDER_LABEL[career.classKey]}\n`);

const rng = new Rng('dynasty-harness');
for (let year = 1; year <= YEARS; year++) {
  playSeason(career);

  const row = career.standings[career.teamId];
  const place = standingsSorted(career).findIndex((r) => r.teamId === career.teamId) + 1;
  const lines = leagueStatLines(career);
  const top = leaders(lines, 'points', 1)[0];
  const mine = leaders(lines.filter((l) => l.teamId === career.teamId), 'points', 1)[0];

  const report = runOffseason(career);
  const bought = spend(career);

  // Take the pitches, best interest first.
  const pitched: string[] = [];
  for (let i = 0; i < 3 && career.pitchesLeft > 0; i++) {
    const target = career.market.find((c) => c.status === 'open' || c.status === 'considering');
    if (!target) break;
    const out = pitchTo(career, target.id);
    if (out) pitched.push(`${target.player.last} ${out.joined ? 'JOINED' : out.result.outcome}`);
  }
  void rng;

  const dev = report.development;
  const breakouts = dev.filter((d) => d.outcome === 'breakout').length;
  const gains = dev.map((d) => d.to - d.from);
  const avg = gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : 0;
  const best = dev[0];
  const move = report.movement?.moves.find((m) => m.teamId === career.teamId);

  console.log(`YEAR ${year}  ${row?.wins}-${row?.losses}  ${ordinal(place)}  ${career.finish ?? ''}`);
  console.log(`  development: avg ${avg.toFixed(1)} OVR, ${breakouts} breakouts, best ${best ? `${best.name} ${best.from}→${best.to} (${best.label})` : 'none'}`);
  console.log(`  league:      ${report.movement?.moves.length ?? 0} moves${move ? `, YOU ${move.direction === 'up' ? 'PROMOTED' : 'RELEGATED'} to ${LADDER_LABEL[move.to]}` : ''}`);
  console.log(`  staff:       ${bought.length ? bought.join(' ') : '(saving)'}  [${TRACK_ORDER.map((t) => career.staff[t]).join('')}]`);
  console.log(`  transfers:   ${pitched.length ? pitched.join(', ') : 'no pitches made'} (market ${career.market.length})`);
  console.log(`  leaders:     district ${top ? `${top.name} ${top.goals}g ${top.assists}a` : '—'} | yours ${mine ? `${mine.name} ${mine.goals}g ${mine.assists}a` : '—'}`);
  console.log(`  squad:       OVR ${userTeam(career).overall}, ${career.roster.length} players`);
}

// Division sizes must stay legal after all that movement.
console.log('\nDivision sizes after movement:');
for (const key of CLASS_ORDER) {
  console.log(`  ${LADDER_LABEL[key]}: ${classMembers(career, key).length}`);
}
const orphans = TEAMS.filter((t) => !CLASS_ORDER.includes(effectiveClass(career, t.id)));
console.log(`Teams in no division: ${orphans.length}`);
