/**
 * The Challenge Mode journey, in a real browser.
 *
 * Two things this proves that nothing else can:
 *   1. Winning the top high school championship completes a CHAPTER and opens
 *      the college job market — it does not end the career.
 *   2. A college game is genuinely playable: the Play button loads two real
 *      college rosters into the match engine and produces a real result.
 *
 * The two saves it starts from are generated here, so the fixtures can never go
 * stale against the current save format.
 *
 *   npm run build && npm run preview &
 *   node scripts/ladder-flow.mjs
 */
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A Challenge save at a chosen rung, written by the game's own code. */
const SEEDS = mkdtempSync(join(tmpdir(), 'lsl-seeds-'));
function seed(name, env) {
  const file = join(SEEDS, `${name}.json`);
  const json = execFileSync('npm', ['run', 'seed-save', '--silent'], {
    env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  writeFileSync(file, json.trim());
  return file;
}
// The A-Class champion, a Division III coach with a season in front of him, and
// the two ends of the invariant: a Division I title (which must NOT finish the
// career) and the PLL title (which is the only thing that does).
const A_CLASS_CHAMPION = seed('aclass-champ', { STAGE: '3', CHAMPION: '1' });
const D3_SEASON = seed('d3', { STAGE: '4' });
const D1_CHAMPION = seed('d1-champ', { STAGE: '6', CHAMPION: '1' });
const PLL_CHAMPION = seed('pll-champ', { STAGE: '8', CHAMPION: '1' });

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
// The save version moves with the game; find whatever the build actually wrote.
const MODE = 'challenge';

const results = [];
const problems = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) problems.push(name);
};

const browser = await chromium.launch({ executablePath: chromiumPath() });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const settle = (ms = 350) => page.waitForTimeout(ms);
const saveKey = () => page.evaluate((m) => {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(`lsl.career.${m}.v`));
  keys.sort((a, b) => Number(b.split('.v')[1]) - Number(a.split('.v')[1]));
  return keys[0] ?? null;
}, MODE);
const save = async () => {
  const k = await saveKey();
  return k ? page.evaluate((kk) => JSON.parse(localStorage.getItem(kk) ?? 'null'), k) : null;
};
const clickText = async (re) => {
  const b = page.getByRole('button', { name: re }).first();
  if (!(await b.count())) return false;
  await b.click().catch(() => {});
  await settle();
  return true;
};

async function load(file) {
  const json = readFileSync(file, 'utf8').trim();
  // The seeded save says which version it is; write it under that key so the
  // app loads it directly instead of migrating or ignoring it.
  const key = `lsl.career.${MODE}.v${JSON.parse(json).version}`;
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(([k, s]) => { localStorage.clear(); localStorage.setItem(k, s); }, [key, json]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Press Start').click();
  await settle(400);
  await page.locator('.menu-btn__label').filter({ hasText: 'Challenge' }).first().click();
  await settle(400);
  await clickText(/Continue the career|See how it ended/i);
  await settle(700);
}

/* ------------------------ 1. the A-Class championship is NOT the end ------ */

await load(A_CLASS_CHAMPION);
const afterTitle = await save();
check('the Class A title did not end the career', !afterTitle.challenge.complete,
  `complete=${afterTitle.challenge.complete}`);
check('the career is still at the high school rung', afterTitle.challenge.stageIndex === 3);

const summary = (await page.locator('.wrapper').innerText()).toLowerCase();
check('the chapter is announced, not the career', summary.includes('high school chapter complete'));
check('the next chapter is named', summary.includes('college lacrosse'));
check('no completion screen is shown',
  !summary.includes('legendary coaching journey') && !summary.includes('it ends here'));

const offersBtn = page.getByRole('button', { name: /jobs? on the table/i }).first();
check('college jobs are on the table', await offersBtn.count() > 0);
check('the offers reached the save', (afterTitle.challenge.offers ?? []).length > 0,
  (afterTitle.challenge.offers ?? []).map((o) => o.teamShort).join(', '));
check('at least one offer is a college programme',
  (afterTitle.challenge.offers ?? []).some((o) => o.stageIndex >= 4));

await offersBtn.click();
await settle(600);
const jobs = (await page.locator('.wrapper').innerText());
check('the job screen is headed as a college market', /coaching opportunities/i.test(jobs));
check('each job shows the squad you would inherit', /TEAM OVR \d+/i.test(jobs));
check('each job shows prestige in words', /PRESTIGE (LOW|MEDIUM|HIGH)/i.test(jobs));
check('each job states its expectation', /they expect:/i.test(jobs));

// Take a college job and confirm the career carries on into a real season.
const took = await clickText(/^Take the .* job$/i);
await settle(900);
const inCollege = await save();
check('a college job can be taken', took && inCollege.challenge.stageIndex >= 4,
  `rung ${inCollege.challenge.stageIndex + 1}`);
check('the level changed to college', ['d3', 'd2'].includes(inCollege.level), inCollege.level);
check('a college roster was loaded', inCollege.roster.length >= 24, `${inCollege.roster.length} players`);
check('a college schedule was drawn', inCollege.schedule.length > 0,
  `${inCollege.schedule.length} fixtures, ${inCollege.schedule.filter((g) => g.featured).length} yours`);
check('college standings exist', Object.keys(inCollege.standings).length >= 4,
  `${Object.keys(inCollege.standings).length} teams`);
check('the career still has not ended', !inCollege.challenge.complete);

/* ------------------------ 2. a college game is actually playable ---------- */

await load(D3_SEASON);
const d3 = await save();
check('the seeded Division III career loaded', d3.level === 'd3', d3.level);
const hub = (await page.locator('.wrapper').innerText());
check('the hub shows a college opponent', /next game/i.test(hub));

check('the Play button is available at college level',
  await page.getByRole('button', { name: /^Play game$/i }).count() > 0);
await clickText(/^Play game$/);
await settle(1400);
check('a pregame card introduces the college fixture', await page.locator('.pregame').count() > 0);
await page.locator('.pregame').click({ timeout: 3000 }).catch(() => {});
await settle(900);

const live = await page.evaluate(() => {
  const m = window.loneStarLax?.match;
  if (!m) return null;
  return {
    home: m.setups.home.roster.length,
    away: m.setups.away.roster.length,
    homeTeam: m.setups.home.team.short,
    awayTeam: m.setups.away.team.short,
    homeOvr: m.setups.home.team.overall,
    quarter: m.quarter,
  };
});
check('the match engine loaded two college squads', !!live && live.home >= 24 && live.away >= 24,
  live ? `${live.homeTeam} ${live.home} v ${live.awayTeam} ${live.away}` : 'no match');
check('the teams carry their college ratings', !!live && live.homeOvr > 0, `OVR ${live?.homeOvr}`);

// Play it out on autopilot and confirm a real result reaches the league. The
// reading has to happen inside the same call: once the game ends the screen is
// replaced and the handle to the match goes with it.
const final = await page.evaluate(() => {
  const m = window.loneStarLax.match;
  let guard = 0;
  while (m.phase !== 'final' && guard++ < 12) m.simulateQuarter();
  return {
    phase: m.phase,
    score: `${m.score.home}-${m.score.away}`,
    shots: m.stats.home.shots + m.stats.away.shots,
    saves: m.stats.home.saves + m.stats.away.saves,
  };
});
await settle(2800);
check('the college game reached a final whistle', final.phase === 'final', final.score);
check('the college game produced real play', final.shots > 0 && final.saves > 0,
  `${final.shots} shots, ${final.saves} saves`);

check('a post-game screen appears',
  await page.getByRole('button', { name: /Continue/i }).count() > 0);
await clickText(/Continue/i);
await settle(800);
const recorded = await save();
check('the college result is recorded in the league',
  recorded.schedule.filter((g) => g.played).length > 0,
  `${recorded.schedule.filter((g) => g.played).length} games played`);
check('college players recorded statistics',
  recorded.roster.some((p) => p.season.gamesPlayed > 0));

/* -------------------- 3. the ONE ending, and the ones that are not ---------- */

await load(D1_CHAMPION);
const afterD1 = await save();
check('a Division I title does not end the career', !afterD1.challenge.complete,
  afterD1.challenge.endedReason ?? 'still coaching');
const d1Screen = (await page.locator('.wrapper').innerText()).toLowerCase();
check('a Division I champion is not shown the final screen',
  !/legendary coaching journey complete/.test(d1Screen));

await load(PLL_CHAMPION);
const afterPll = await save();
check('winning the PLL ends the career', !!afterPll.challenge.complete,
  afterPll.challenge.endedReason ?? 'none');
check('the ending is the PLL championship',
  /premier lacrosse league/i.test(afterPll.challenge.endedReason ?? ''),
  afterPll.challenge.endedReason ?? 'none');
// The coach sees the season he just won first; the ending is the step after it.
const verdict = (await page.locator('.wrapper').innerText()).toLowerCase();
check('the winning season is reported before the career ends',
  /pll championship/.test(verdict), verdict.split('\n').find((l) => l.trim()) ?? '');
await clickText(/See how the career ended/i);
await settle(700);
const endScreen = (await page.locator('.wrapper').innerText()).toLowerCase();
check('the final completion screen is shown', /legendary coaching journey complete/.test(endScreen),
  endScreen.split('\n').filter((l) => l.trim()).slice(0, 4).join(' / '));
check('the ending names the difficulty it was won on', /standard challenge/.test(endScreen));
// A finished career is filed, so the next one on a harder tier has something to
// beat. Without this the four difficulties are four ways to have one evening.
check('the career is filed in the hall', /your record on standard challenge/.test(endScreen));
check('the hall records the climb', /fastest climb to the pll/.test(endScreen));

console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
if (problems.length) console.log(`\nFailed: ${problems.join(', ')}`);
console.log(errors.length ? `\nConsole errors:\n  ${errors.join('\n  ')}` : '\nNo console errors.');
await browser.close();
process.exit(problems.length || errors.length ? 1 : 0);
