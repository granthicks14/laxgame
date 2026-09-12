/**
 * THE SUPER CHALLENGE ROLLING WINDOW
 *
 * Three championships inside any ten consecutive seasons. The rule is one
 * sentence and the arithmetic is where it goes wrong, so every scenario the
 * design calls out is checked here as a fact about the function rather than a
 * belief about it — including the two that matter most: that a window closing
 * short is NOT a failure, and that a career can take as long as it likes.
 *
 *   npm run dominance
 */
import { dominance, DOMINANCE_SPAN, DOMINANCE_TITLES } from '../challenge/dominance';
import type { ChallengeState, ChallengeStep } from '../challenge/state';

const env = (globalThis as { process?: { exit(n: number): void } }).process;
const problems: string[] = [];
let checks = 0;
function check(name: string, ok: boolean, detail = ''): void {
  checks++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) problems.push(name);
}

/** A career of `seasons` seasons, with championships in the years given. */
function career(seasons: number, titleYears: number[], teams?: Record<number, string>): ChallengeState {
  const steps: ChallengeStep[] = [];
  for (let y = 1; y <= seasons; y++) {
    steps.push({
      year: y,
      stageKey: 'hs-d',
      teamShort: teams?.[y] ?? 'Cumberland',
      wins: 10,
      losses: 4,
      finish: '',
      champion: titleYears.includes(y),
      outcome: 'stay',
    });
  }
  return { totalYears: seasons, steps } as ChallengeState;
}

/* ------------------------------------------------------- the six scenarios */

{
  // A: three titles in seasons 1-10.
  const d = dominance(career(10, [2, 5, 9]));
  check('A · three titles in seasons 1-10 completes it', d.achieved,
    d.achievedIn ? `seasons ${d.achievedIn.from}-${d.achievedIn.to}` : 'not achieved');
}
{
  // B: only two in the first ten. NOT a failure — the career simply continues.
  const d = dominance(career(10, [3, 7]));
  check('B · two titles in ten seasons is not a completion', !d.achieved);
  check('B · and it is not a failure either — nothing here can end a career',
    d.short === 1 && d.seasons === 10, `${d.short} short`);
}
{
  // C: seasons 4-13 hold three.
  const d = dominance(career(13, [4, 9, 13]));
  check('C · three titles in seasons 4-13 completes it', d.achieved,
    d.achievedIn ? `seasons ${d.achievedIn.from}-${d.achievedIn.to}` : 'not achieved');
  check('C · and it names the stretch that did it',
    d.achievedIn?.from === 4 && d.achievedIn?.to === 13,
    `${d.achievedIn?.from}-${d.achievedIn?.to}`);
}
{
  // D: seasons 8-17.
  const d = dominance(career(17, [8, 14, 17]));
  check('D · three titles in seasons 8-17 completes it', d.achieved,
    d.achievedIn ? `seasons ${d.achievedIn.from}-${d.achievedIn.to}` : 'not achieved');
}
{
  // E: thirty-plus seasons. Time alone never ends it.
  const d = dominance(career(34, [3, 11, 19, 27, 30, 33]));
  check('E · a thirty-four season career is still allowed to finish', d.achieved,
    d.achievedIn ? `seasons ${d.achievedIn.from}-${d.achievedIn.to}` : 'not achieved');
  const stillShort = dominance(career(40, [5, 20, 35]));
  check('E · and one that never bunches three is still not a failure',
    !stillShort.achieved && stillShort.careerTitles === 3,
    `${stillShort.careerTitles} titles, best window ${stillShort.best.titles}`);
}
{
  // F: changing teams mid-career must not disturb the count.
  const teams: Record<number, string> = {};
  for (let y = 1; y <= 13; y++) teams[y] = y <= 6 ? 'Cumberland' : 'Hartwick';
  const d = dominance(career(13, [5, 8, 12], teams));
  check('F · championships count wherever they were won', d.achieved,
    d.achievedIn ? `seasons ${d.achievedIn.from}-${d.achievedIn.to}` : 'not achieved');
}

/* ------------------------------------------------------- the edges */

{
  const d = dominance(career(0, []));
  check('a career that has not started reads cleanly',
    !d.achieved && d.careerTitles === 0 && d.current.from >= 1, `${d.current.from}-${d.current.to}`);
}
{
  // Exactly ten apart: seasons 1 and 10 are in the same window, 1 and 11 are not.
  check('seasons 1 and 10 share a window', dominance(career(10, [1, 5, 10])).achieved);
  check('seasons 1 and 11 do not', !dominance(career(11, [1, 6, 11])).achieved,
    `best window holds ${dominance(career(11, [1, 6, 11])).best.titles}`);
}
{
  // Three in a row is the fastest possible completion.
  const d = dominance(career(3, [1, 2, 3]));
  check('three straight titles completes it immediately', d.achieved);
}
{
  // More than three in a window is still a completion, and the best window
  // reports the real total rather than capping at the requirement.
  const d = dominance(career(10, [1, 3, 5, 7, 9]));
  check('a dominant stretch reports its real total', d.best.titles === 5, `${d.best.titles}`);
}
{
  // The clock: two in the window and the oldest about to roll out.
  const d = dominance(career(12, [4, 9]));
  check('the window is the last ten seasons', d.current.from === 3 && d.current.to === 12,
    `${d.current.from}-${d.current.to}`);
  check('it counts only the titles inside it', d.current.titles === 2, `${d.current.titles}`);
  check('and it says when the oldest one leaves', d.expiresIn === 2, `${d.expiresIn} seasons`);
}
{
  // Years out of work are seasons too: they count against the window, which is
  // the whole reason being sacked hurts here.
  const d = dominance({ totalYears: 12, steps: career(9, [2, 5, 8]).steps } as ChallengeState);
  check('a career with years out of work still measures from the real season count',
    d.seasons === 12 && d.current.from === 3, `${d.seasons} seasons, window ${d.current.from}-${d.current.to}`);
}

check('the requirement is three in ten',
  DOMINANCE_TITLES === 3 && DOMINANCE_SPAN === 10, `${DOMINANCE_TITLES} in ${DOMINANCE_SPAN}`);

console.log();
if (problems.length) {
  console.log(`${problems.length} of ${checks} checks FAILED:`);
  for (const p of problems) console.log(`  - ${p}`);
  env?.exit(1);
} else {
  console.log(`${checks}/${checks} checks passed — the rolling window is correct`);
}
