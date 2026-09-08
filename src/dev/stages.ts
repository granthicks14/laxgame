/**
 * EVERY RUNG OF CHALLENGE MODE, PLAYED.
 *
 * The promise of Challenge Mode is that the whole ladder is real: high school
 * through the professional game, with actual teams, actual rosters, actual
 * schedules, actual standings, actual playoffs — and games you can PLAY rather
 * than only simulate.
 *
 * This proves it. For all nine rungs it builds a career, checks the league data
 * exists, runs one fixture through the REAL match engine using the same config
 * the Play button builds, plays the season out, takes it through the playoffs
 * to a champion, runs the offseason, and confirms that winning promotes the
 * coach instead of ending his career.
 *
 *   npm run stages
 *   STAGE=4 npm run stages     # one rung, verbosely
 */
import { Match } from '../match/Match';
import { buildSeasonMatch } from '../league/careerMatch';
import {
  advancePhase, champion, effectiveTeam, nextUserGame, pitchTo,
  resolveChallengeSeason, runOffseason, seasonFormat, simulateUserGame,
  standingsSorted, startChallenge, takeChallengeJob, userTeam,
} from '../league/career';
import { leaders, leagueStatLines, seasonRoster } from '../league/leagueStats';
import { marketFor } from '../league/transfers';
import { board, classGrade } from '../scouting/recruiting';
import { STAGES, programmesAt, stageAt, stageDivisionName } from '../challenge/ladder';
import {
  completesChapter, chapterOf, evaluateSeason, expectationFor, newChallengeState, type JobOffer,
} from '../challenge/state';
import { teamsAtLevel, teamsInConference } from '../data/world';
import { archetype } from '../data/archetypes';
import type { Career } from '../league/types';

const env = (globalThis as { process?: { env?: Record<string, string | undefined>; exit(n: number): void } }).process;
const ONLY = env?.env?.STAGE ? Number(env.env.STAGE) : null;
const DT = 1 / 60;

const results: { stage: number; name: string; ok: boolean; detail: string }[] = [];
let current = 0;
function check(name: string, ok: boolean, detail = ''): void {
  results.push({ stage: current, name, ok, detail });
  if (ONLY !== null) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

/** Plays one fixture through the real engine, exactly as the Play button does. */
function playOneGame(career: Career): { goals: number; shots: number; players: number } | null {
  const g = nextUserGame(career);
  if (!g) return null;
  const cfg = buildSeasonMatch(career, g, false);
  const m = new Match(cfg);
  let guard = 0;
  while (!m.isFinal() && guard++ < 60 * 60 * 40) m.update(DT);
  const stats = m.playerStats();
  return {
    goals: m.score.home + m.score.away,
    shots: m.stats.home.shots + m.stats.away.shots,
    players: stats.size,
  };
}

function playSeason(career: Career): void {
  let guard = 0;
  while (guard++ < 500) {
    const g = nextUserGame(career);
    if (!g) break;
    simulateUserGame(career, g);
  }
  advancePhase(career);
}

/** Moves a career onto a given rung by taking the job, as the coach would. */
function jumpTo(career: Career, stageIndex: number): void {
  const state = career.challenge!;
  state.reputation = 88;
  const pool = programmesAt(stageIndex);
  // Mid-table, so the test is a normal job rather than the best or worst one.
  const sorted = [...pool].sort((a, b) => a.prestige - b.prestige);
  const target = sorted[Math.floor(sorted.length / 2)];
  const offer: JobOffer = {
    teamId: target.id,
    teamName: target.name,
    teamShort: target.short,
    stageIndex,
    prestige: target.prestige,
    situation: 'stable',
    expectation: expectationFor(stageAt(stageIndex), target.prestige, 'stable', 88),
    note: '',
  };
  takeChallengeJob(career, offer);
}

/* ------------------------------------------------------------- the audit */

for (let stage = 0; stage < STAGES.length; stage++) {
  if (ONLY !== null && stage !== ONLY) continue;
  current = stage;
  const info = stageAt(stage);
  if (ONLY !== null) console.log(`\n=== rung ${stage + 1}/9 — ${info.name}\n`);

  const career = startChallenge({ difficulty: 'varsity', gameLength: 'short', seed: 31337 + stage });
  const state = career.challenge!;
  if (stage > 0) jumpTo(career, stage);

  // --- the league exists
  const level = career.level;
  const pool = level === 'hs' ? programmesAt(stage) : teamsAtLevel(level);
  check('the league has teams', pool.length >= 4, `${pool.length} programmes`);
  const complete = (level === 'hs' ? programmesAt(stage) : teamsAtLevel(level)).every((t) => {
    const team = effectiveTeam(career, t.id);
    return !!team.name && !!team.short && !!team.abbr && !!team.primary
      && team.overall > 0 && team.offense > 0 && team.defense > 0 && team.goalie > 0
      && team.attack > 0 && team.midfield > 0 && team.faceoff > 0 && !!team.homeField;
  });
  check('every team carries full ratings and an identity', complete);
  if (level !== 'hs') {
    const conf = teamsInConference(career.conferenceId);
    const wt = teamsAtLevel(level);
    check('teams are assigned to conferences', conf.length >= 4,
      `${career.conferenceId}: ${conf.length} teams`);
    check('every programme has prestige and recruiting', wt.every((t) => t.prestige > 0 && t.recruiting > 0));
  }

  // --- rosters
  check('your squad is generated', career.roster.length >= 18, `${career.roster.length} players`);
  const p = career.roster[0];
  check('players carry a full profile',
    !!p.first && !!p.last && !!p.pos && p.overall > 0 && p.potential >= p.overall
    && !!p.dev && !!archetype(p.dev.archetype) && !!p.dev.curve && !!p.attrs && !!p.season,
    `${p.first} ${p.last}, ${archetype(p.dev!.archetype)?.label}, ${p.dev!.curve}`);
  const opponentId = standingsSorted(career).map((r) => r.teamId).find((id) => id !== career.teamId)!;
  check('opponents have real rosters too', seasonRoster(career, opponentId).length >= 18,
    `${seasonRoster(career, opponentId).length} players`);

  // --- schedule
  const fmt = seasonFormat(career);
  check('a schedule is generated', career.schedule.length > 0, `${career.schedule.length} fixtures`);
  check('you are on the schedule', career.schedule.filter((g) => g.featured).length >= 8,
    `${career.schedule.filter((g) => g.featured).length} of your games`);
  check('standings are initialised', Object.keys(career.standings).length >= 4,
    `${Object.keys(career.standings).length} teams`);

  // --- A GAME YOU CAN ACTUALLY PLAY
  const played = playOneGame(career);
  check('a fixture is playable in the match engine', !!played && played.shots > 0,
    played ? `${played.goals} goals from ${played.shots} shots, ${played.players} players recorded` : 'no game');

  // --- recruiting exists at this level
  check('a recruiting class is open', (career.recruiting?.prospects.length ?? 0) > 0,
    `${career.recruiting?.prospects.length} prospects`);
  check('the board sorts', board(career.recruiting!, career.teamId, 'targets').length > 0);
  check('the class can be graded', !!classGrade(career.recruiting!, career.teamId).grade);

  // --- the season, the playoffs and a champion
  playSeason(career);
  check('every fixture is played', career.schedule.every((g) => g.played),
    `${career.schedule.length} games`);
  check('the season reached a conclusion', career.seasonComplete, career.finish ?? '');
  check('a postseason was played', career.schedule.some((g) => g.playoff),
    `${career.schedule.filter((g) => g.playoff).length} playoff games`);
  check('a champion was decided', !!champion(career),
    champion(career) ? effectiveTeam(career, champion(career)!).short : 'none');
  check('the title is the level\'s own', !!fmt.titleName, fmt.titleName);
  check('statistics were recorded', leagueStatLines(career).length > 0,
    `${leagueStatLines(career).length} player lines`);
  check('there are league leaders', leaders(leagueStatLines(career), 'points').length > 0);

  // --- winning must PROMOTE, never end the career (except at the very top)
  const last = career.history[career.history.length - 1];
  last.champion = true;
  last.finish = 'CHAMPIONS';
  const verdict = resolveChallengeSeason(career);
  const isTop = stage === STAGES.length - 1;
  check('a championship is recognised', verdict?.outcome === (isTop ? 'complete' : 'promoted'),
    verdict?.outcome ?? 'none');
  check(isTop ? 'the PLL title ends the career' : 'the career does NOT end here',
    isTop ? state.complete : !state.complete);
  if (!isTop) {
    check('jobs at the next rung are offered', (state.offers?.length ?? 0) > 0,
      (state.offers ?? []).map((o) => `${o.teamShort} (${stageAt(o.stageIndex).short})`).join(', '));
    check('at least one offer is a step up',
      (state.offers ?? []).some((o) => o.stageIndex > stage));
    if (completesChapter(stage)) {
      check('the chapter is marked complete, not the career',
        verdict!.messages.some((m) => m.toUpperCase().includes('CHAPTER COMPLETE')),
        chapterOf(stage).headline);
    }
  }

  // --- the offseason: development, graduations, recruits, the window
  if (!isTop) {
    const before = career.roster.length;
    const report = runOffseason(career);
    check('players developed', report.development.length > 0, `${report.development.length} reports`);
    check('the intake arrived', report.arrived.length > 0, `${report.arrived.length} players`);
    check('the squad survives the offseason', career.roster.length >= 18,
      `${before} → ${career.roster.length}`);
    const market = marketFor(career.level);
    check(`${market.title.toLowerCase()} opened`, career.market.length > 0,
      `${career.market.length} available, ${career.pitchesLeft} ${market.pitchesWord}`);
    const out = career.market[0] ? pitchTo(career, career.market[0].id) : null;
    check('a transfer approach works', !!out, out?.result.outcome ?? 'none');
    check('a new season is scheduled', career.schedule.length > 0 && career.schedule.every((g) => !g.played));
  }

  if (ONLY === null) {
    const mine = results.filter((r) => r.stage === stage);
    const bad = mine.filter((r) => !r.ok);
    console.log(
      `${bad.length ? 'FAIL' : 'PASS'}  rung ${String(stage + 1).padStart(2)}/9  `
      + `${info.short.padEnd(8)} ${stageDivisionName(stage).padEnd(26)} `
      + `${userTeam(career).short.padEnd(18)} ${mine.length - bad.length}/${mine.length}`
      + (bad.length ? `   ${bad.map((r) => r.name).join('; ')}` : ''),
    );
  }
}

/* ------------------------------------------------------------- invariant */

/**
 * The one rule this mode is built on: a career ENDS in exactly two ways — the
 * PLL championship, or two years out of work. Nothing else, at any rung, under
 * any combination of results, may ever set it. This is exhaustive rather than
 * illustrative because the bug it guards against shipped once already: winning
 * the Class A championship ended the career.
 */
if (ONLY === null) {
  current = -1;
  let violations = 0;
  let cases = 0;
  for (let stage = 0; stage < STAGES.length; stage++) {
    for (const champ of [true, false]) {
      for (const heat of [0, 1, 2, 3]) {
        for (const pct of [0, 0.25, 0.5, 0.75, 1]) {
          const st = newChallengeState(stage, 'stable', expectationFor(stageAt(stage), 60, 'stable', 40));
          st.stageIndex = stage;
          st.heat = heat;
          st.tenure = 3;
          const games = 12;
          const wins = Math.round(games * pct);
          evaluateSeason(st, {
            wins, losses: games - wins, champion: champ, finish: '', teamShort: 'X', prestige: 60,
          });
          cases++;
          const mayEnd = champ && stage === STAGES.length - 1;
          if (st.complete !== mayEnd) violations++;
        }
      }
    }
  }
  console.log(`
INVARIANT — a career may only end at the PLL: ${cases - violations}/${cases} cases hold`);
  if (violations) results.push({ stage: -1, name: 'a career ends only at the PLL', ok: false, detail: `${violations} violations` });
  else results.push({ stage: -1, name: 'a career ends only at the PLL', ok: true, detail: `${cases} cases` });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\nFailures:');
  for (const f of failed) console.log(`  rung ${f.stage + 1}: ${f.name} ${f.detail}`);
  env?.exit(1);
}
