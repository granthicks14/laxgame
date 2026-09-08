/**
 * Writes a Challenge save at a chosen rung to stdout, so the browser suites can
 * start a test from a specific point in the ladder rather than playing twenty
 * seasons to get there.
 *
 *   STAGE=4 node ... seed-save.mjs > save.json
 *   STAGE=3 CHAMPION=1 ...          # a save sitting on the Class A title
 */
import {
  advancePhase, nextUserGame, runOffseason, simulateUserGame, startChallenge, takeChallengeJob,
} from '../league/career';
import { programmesAt, stageAt } from '../challenge/ladder';
import { expectationFor } from '../challenge/state';
import type { Career } from '../league/types';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const STAGE = Number(env.STAGE ?? 4);
const CHAMPION = env.CHAMPION === '1';
const PLAY = env.PLAY === '1';

function playSeason(c: Career) {
  let g = 0;
  while (g++ < 500) { const x = nextUserGame(c); if (!x) break; simulateUserGame(c, x); }
  advancePhase(c);
}

/** Did the coach actually win the thing, according to his own record book? */
function wonIt(c: Career): boolean {
  return c.history[c.history.length - 1]?.champion === true;
}

const career = startChallenge({ difficulty: 'varsity', gameLength: 'short', seed: 2468 });
const state = career.challenge!;
if (STAGE > 0) {
  state.reputation = 88;
  const pool = [...programmesAt(STAGE)].sort((a, b) => a.prestige - b.prestige);
  const target = pool[Math.floor(pool.length / 2)];
  takeChallengeJob(career, {
    teamId: target.id, teamName: target.name, teamShort: target.short,
    stageIndex: STAGE, prestige: target.prestige, situation: 'stable',
    expectation: expectationFor(stageAt(STAGE), target.prestige, 'stable', 88),
    note: '',
  });
}
if (PLAY || CHAMPION) {
  playSeason(career);
  // A championship save has to be a season the coach GENUINELY won: forging the
  // flag produces a save whose own screens contradict each other ("champions",
  // and underneath it "lost the final"). So keep playing seasons at this rung
  // until he wins one for real.
  if (CHAMPION) {
    let seasons = 1;
    while (!wonIt(career) && seasons++ < 60) {
      runOffseason(career);
      playSeason(career);
    }
    if (!wonIt(career)) {
      throw new Error(`no championship at stage ${STAGE} in ${seasons} seasons — pick another team or seed`);
    }
  }
}
console.log(JSON.stringify(career));
