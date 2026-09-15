/**
 * THE WHOLE THING, FROM A TIP-OFF TO A FOURTH SEASON.
 *
 * Every other harness tests one system in isolation, which is how they stay
 * readable and how a failure points at something. This one tests the JOINS —
 * the places where a system hands over to another one, which is where a career
 * mode actually breaks:
 *
 *   a PLAYED game (the real engine, sixty frames a second, a bot at the sticks)
 *     → its box score folded into the career
 *     → the rest of the season simulated around it
 *     → the postseason
 *     → the offseason: departures, the wall, development, recruiting, the portal
 *     → the next season, built out of what the last one left
 *     → and around again, four times.
 *
 * The played engine and the fast one are asked to produce the same KIND of
 * result, because a coach who plays his own games and one who simulates them
 * must be coaching in the same league — a season where hand-played games score
 * forty and simulated ones score seventy is two games wearing one name.
 *
 *   npm run hoops-e2e
 */
import { HoopsGame } from '../sports/basketball/Game';
import { neutralHoopsInput, type HoopsInput } from '../sports/basketball/input';
import { GATHER_TIME, RELEASE_CENTRE } from '../sports/basketball/shot';
import { attackRim } from '../sports/basketball/court';
import { teamsAtLevel, worldTeam } from '../sports/basketball/world';
import { LEVELS } from '../sports/basketball/levels';
import { starters } from '../sports/basketball/data';
import {
  awaitingDecision, coachStature, createCareer, gameConfigFor, needsFor, nextGame,
  recordPlayedGame, recruitWeek, recruitingDone, runOffseason, simulateRestOfSeason,
  startNextSeason,
} from '../sports/basketball/career/season';
import { makeOffer, prospectOdds } from '../sports/basketball/career/recruit';
import { openTargets, pitchTo } from '../sports/basketball/career/portal';
import { buyUpgrade, perksOf, UPGRADES } from '../sports/basketball/career/coach';
import { modsFor } from '../sports/basketball/career/difficulty';
import { standingOf } from '../sports/basketball/career/league';
import { rowFor } from '../sports/basketball/career/schedule';
import { validateCareer } from '../sports/basketball/career/records';
import type { HoopsCareer } from '../sports/basketball/career/types';
import type { Side } from '../sports/basketball/court';

const env = (globalThis as {
  process?: { exit(n: number): void; env?: Record<string, string | undefined> };
}).process;

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

/* ---------------------------------------------------------------- a player */

/**
 * SOMEBODY AT THE STICKS WHO KNOWS THE CONTROLS.
 *
 * Not a good player — a COMPETENT one, which is a different and much more useful
 * thing to test against. He drives at the rim, and when he shoots he holds the
 * button for the length of a gather rather than mashing it.
 *
 * THAT LAST PART IS THE WHOLE TEST. The first version of this bot passed the ball
 * every time it was more than eight feet out and released the shot on a fixed
 * frame counter, and it produced 0-69, 77-2, 2-81 — a side that could not score
 * at all. That looks exactly like an engine bug and it was not one: measured
 * against a clean press-and-hold, field goal percentage runs 22, 22, 23, 26, 42,
 * 23, 24, 15 as the hold goes from an eighth of a second to five sixths, peaking
 * hard at 0.52s, which is precisely where the release window is. The mechanic was
 * working; the bot was mashing.
 *
 * So he holds for `HOLD` frames, which is a full gather, and the assertions below
 * are about what a person who has learned the game gets out of it.
 */
const HOLD = Math.round(RELEASE_CENTRE * GATHER_TIME * 60);

/** How close the nearest man in the other shirt is. */
function nearestOpponent(game: HoopsGame, me: { x: number; y: number; side: Side }): number {
  let best = 99;
  for (const p of game.players) {
    if (p.side === me.side || p.fouledOut) continue;
    best = Math.min(best, Math.hypot(p.x - me.x, p.y - me.y));
  }
  return best;
}

function makeBot(side: Side): (game: HoopsGame, frame: number) => HoopsInput {
  let held = -1;
  const rim = attackRim(side);
  return (game, frame) => {
    const input = neutralHoopsInput();
    const me = game.controlled[side];
    if (!me) { held = -1; return input; }
    const mine = game.possession === side;
    const carrying = game.carrier === me;
    /* ON DEFENCE HE GOES TO THE BALL, which is what a person at a controller
     * does. Trying to make him play a proper assignment was measured and made it
     * worse — 23-98 — because a bot holding a position is a bot not contesting
     * anything, and the four men behind him are already playing the scheme. */
    const tx = mine ? rim.x : game.ball.x;
    const ty = mine ? rim.y : game.ball.y;
    const dx = tx - me.x;
    const dy = ty - me.y;
    const d = Math.hypot(dx, dy) || 1;
    input.moveX = dx / d;
    input.moveY = dy / d;
    input.sprint = d > 16;

    if (mine && carrying) {
      /* HE STOPS TO SHOOT, and he does not drive into five men.
       *
       * The version before this one dribbled straight at the rim from seventy
       * feet and was stripped on two thirds of its possessions — fifteen points a
       * game at forty-seven per cent, which is a shooting statistic saying the
       * shooting was fine and there was nothing wrong except that he never got a
       * shot off. A person does not do that: he brings it up, he gets to a spot,
       * and he plants. */
      const guard = nearestOpponent(game, me);
      if (d < 24) {
        if (held < 0) held = 0;
        if (held < HOLD) {
          input.shootHeld = true;
          held++;
          // Planted. A gather is a shot, not a drive.
          input.moveX = 0;
          input.moveY = 0;
          input.sprint = false;
        } else {
          input.shootReleased = true;
          held = -1;
        }
      } else {
        held = -1;
        // Pressed up on, outside the arc: put it on the floor past him, or give
        // it up. Both are things a person does and neither is a dribble into
        // three defenders.
        if (guard < 4 && frame % 9 === 0) input.crossPressed = true;
        else if (guard < 3.2 && frame % 31 === 0) input.passPressed = true;
      }
    } else {
      held = -1;
      /* A reach, but only when he is actually on the ball and only now and then:
       * reaching from ten feet away is how a person fouls out in a quarter. */
      const onBall = game.carrier;
      if (!mine && onBall && Math.hypot(onBall.x - me.x, onBall.y - me.y) < 4
        && frame % 75 === 0) input.passPressed = true;
    }
    return input;
  };
}

/** Play one fixture on the real engine, with a bot on the coach's side. */
function playOut(
  career: HoopsCareer,
): { mine: number; theirs: number; frames: number; fgm: number; fga: number } {
  const f = nextGame(career)!;
  const human: Side = f.homeId === career.teamId ? 'home' : 'away';
  const game = new HoopsGame(gameConfigFor(career, f, human));
  const drive = makeBot(human);
  let frame = 0;
  // A generous ceiling: a standard game is about 16 minutes of clock, and the
  // engine runs at sixty steps a second, so 120k frames is far past any real one.
  while (!game.isFinal() && frame < 120_000) {
    game.update(1 / 60, drive(game, frame));
    frame++;
  }
  recordPlayedGame(career, f, game);
  const other: Side = human === 'home' ? 'away' : 'home';
  return {
    mine: game.score[human],
    theirs: game.score[other],
    frames: frame,
    fgm: game.box[human].fgm,
    fga: game.box[human].fga,
  };
}

/* ------------------------------------------------------- a coach who coaches */

function offseason(career: HoopsCareer): void {
  const scale = modsFor(career.tier).upgradeCost;
  for (const u of UPGRADES) buyUpgrade(career.coach, u.key, scale);

  let guard = 0;
  while (career.pitchesLeft > 0 && guard++ < 20) {
    const open = openTargets(career.market)
      .sort((a, b) => b.player.overall - a.player.overall)[0];
    if (!open) break;
    career.pitchesLeft--;
    pitchTo(open, {
      standing: standingOf(career, career.teamId),
      form: 0.5,
      perks: perksOf(career.coach),
      needs: needsFor(career),
      level: career.level,
    }, career.teamId, perksOf(career.coach), modsFor(career.tier), career.seed);
  }

  if (career.recruiting) {
    for (let w = 0; w < 12 && !recruitingDone(career); w++) {
      const needs = needsFor(career);
      const row = rowFor(career.standings, career.teamId);
      const pitch = {
        teamId: career.teamId,
        standing: standingOf(career, career.teamId),
        form: row.wins / Math.max(1, row.wins + row.losses),
        perks: perksOf(career.coach),
        needs,
        region: 'in state',
        level: career.level,
        reputation: coachStature(career),
      };
      for (const pos of [...needs.list].sort((a, b) => b.need - a.need)) {
        if (needs.openSpots <= 0) break;
        const best = career.recruiting.prospects
          .filter((x) => !x.committedTo && !x.offered && x.player.pos === pos.pos)
          .map((x) => ({ x, odds: prospectOdds(x, pitch, modsFor(career.tier)) }))
          .filter((c) => c.odds.odds === 'favourite' || c.odds.odds === 'contest')
          .sort((a, b) => b.x.seenCeiling - a.x.seenCeiling)[0];
        if (best) makeOffer(career.recruiting, best.x.id);
      }
      recruitWeek(career);
    }
  }
}

/* -------------------------------------------------------------- the journey */

const club = teamsAtLevel('d2')[3];
const career = createCareer({ mode: 'dynasty', teamId: club.id, seed: 8181 });
console.log(`\n${club.city} ${club.name} — ${LEVELS[career.level].name}\n`);

console.log('--- SEASON ONE, PLAYED ---');

/* THREE GAMES ON THE REAL ENGINE, back to back, inside a live career. This is
 * the join nothing else exercises: a config built from a career, a game played
 * to its final buzzer, and a box score folded back into a season. */
const played: ReturnType<typeof playOut>[] = [];
for (let i = 0; i < 3; i++) played.push(playOut(career));

check('a career game reaches its own final buzzer',
  played.every((r) => r.frames < 120_000),
  played.map((r) => `${(r.frames / 60).toFixed(0)}s`).join(', '));
check('and produces a basketball scoreline',
  played.every((r) => r.mine + r.theirs > 50 && r.mine + r.theirs < 260),
  played.map((r) => `${r.mine}-${r.theirs}`).join(', '));
check('and somebody won each of them',
  played.every((r) => r.mine !== r.theirs),
  played.map((r) => (r.mine > r.theirs ? 'W' : 'L')).join(''));

/* THE QUESTION THE WHOLE GAME RESTS ON: can a person at the controls actually
 * PLAY? Not win — the margin is a fact about how good the player is, and the bot
 * above is a mediocre one on purpose. What has to be true of the ENGINE is that a
 * side driven by a person scores, shoots a percentage that answers to timing, and
 * gets its shots from the man the person is holding. */
const myPoints = played.reduce((n, r) => n + r.mine, 0) / played.length;
const myFg = played.reduce((n, r) => n + r.fgm, 0)
  / Math.max(1, played.reduce((n, r) => n + r.fga, 0));
const myShots = played.reduce((n, r) => n + r.fga, 0) / played.length;
check('a coach at the sticks can score', myPoints >= 24,
  `${myPoints.toFixed(0)} a game`);
check('and gets his side real possessions to shoot from', myShots >= 26,
  `${myShots.toFixed(0)} attempts a game`);
check('and shoots a percentage that answers to his timing',
  myFg >= 0.28 && myFg <= 0.62, `${(myFg * 100).toFixed(0)}% from the field`);

const row0 = rowFor(career.standings, career.teamId);
check('the table counts every game he played', row0.wins + row0.losses === 3,
  `${row0.wins}-${row0.losses}`);
check('and the box scores reached his squad',
  Object.values(career.season).some((l) => l.games > 0 && l.points > 0),
  `${Object.values(career.season).filter((l) => l.games > 0).length} men have a line`);
check('and only men who were on the floor have one',
  Object.entries(career.season).every(([id, l]) =>
    l.games === 0 || career.roster.some((p) => p.id === id)),
  'no strangers in the book');

const five = new Set(starters(career.roster).map((p) => p.id));
check('and the five who started are credited with starts',
  [...five].every((id) => (career.season[id]?.starts ?? 0) > 0),
  `${[...five].filter((id) => (career.season[id]?.starts ?? 0) > 0).length} of 5`);

/* AND THE TWO ENGINES HAVE TO BE PLAYING THE SAME SPORT. The rest of the season
 * is simulated; the scores from it must sit in the same range as the ones the
 * played engine produced, or a coach who plays his games is in a different
 * league from one who does not. */
const playedTotal = played.reduce((n, r) => n + r.mine + r.theirs, 0) / played.length;
simulateRestOfSeason(career);
const simmed = career.schedule.filter((f) => f.featured && f.played).slice(3);
const simTotal = simmed.reduce((n, f) => n + f.homeScore + f.awayScore, 0)
  / Math.max(1, simmed.length);
check('a played game and a simulated one are the same sport',
  Math.abs(playedTotal - simTotal) < playedTotal * 0.3,
  `${playedTotal.toFixed(0)} played v ${simTotal.toFixed(0)} simulated, both sides`);

console.log('\n--- THE SEASON CLOSES ---');
const beforeRoster = career.roster.length;
const report = runOffseason(career);
check('the season produced a verdict a coach can read',
  !!career.finish && career.history.length === 1,
  `${career.history[0].wins}-${career.history[0].losses} · ${career.finish}`);
check('the offseason paid him for it', report.pointsEarned > 0,
  `${report.pointsEarned} coach points`);
check('and development happened to somebody',
  report.development.length > 0
  && report.development.some((d) => d.to !== d.from),
  `${report.development.filter((d) => d.to !== d.from).length} of ${report.development.length} moved`);
check('anybody who left is on the wall', career.lastDepartures.length === 0
  || career.alumni.length > 0,
  `${career.lastDepartures.length} left, ${career.alumni.length} remembered`);

offseason(career);
startNextSeason(career);
check('the next season has a full squad',
  career.roster.length >= LEVELS[career.level].rosterSize - 1,
  `${beforeRoster} became ${career.roster.length}`);
check('and a fresh fixture list', career.schedule.filter((f) => f.featured).length > 10
  && career.schedule.every((f) => !f.played),
  `${career.schedule.filter((f) => f.featured).length} of his own`);
check('and an empty book', Object.values(career.season).every((l) => l.games === 0));

/* ------------------------------------------------- three more, at full speed */

console.log('\n--- AND THREE MORE SEASONS ---');
for (let y = 0; y < 3; y++) {
  // One played game a season, so the join is exercised every year rather than once.
  playOut(career);
  simulateRestOfSeason(career);
  runOffseason(career);
  if (awaitingDecision(career)) break;
  offseason(career);
  startNextSeason(career);
}

check('four seasons are on the record', career.history.length === 4,
  career.history.map((h) => `${h.wins}-${h.losses}`).join(', '));
check('the career record matches the seasons',
  career.careerWins === career.history.reduce((n, h) => n + h.wins, 0),
  `${career.careerWins}-${career.careerLosses}`);
check('career statistics survived four graduations',
  Object.values(career.careerStats).some((l) => l.seasons >= 2),
  `${Object.values(career.careerStats).filter((l) => l.seasons >= 2).length} men with more than a season`);
check('the wall has names on it', career.alumni.length > 0,
  `${career.alumni.length} former players`);
check('and every one of them has a finished line',
  career.alumni.every((a) => a.line.games > 0 && a.seasons >= 1));

const problems = validateCareer(career);
check('and the whole save still adds up', problems.length === 0,
  problems.join('; ') || 'nothing to repair');

const me = worldTeam(career.teamId);
console.log(`\n  ${me.abbr}: ${career.careerWins}-${career.careerLosses} over `
  + `${career.history.length} seasons, ${career.championships} title(s), `
  + `${career.alumni.length} alumni, ${career.coach.points} points unspent`);

console.log(`\n${passed} passed, ${failures.length} problem(s)`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  env?.exit(1);
}
