/**
 * The Challenge Mode journey, in a real browser.
 *
 * Two things this proves that nothing else can:
 *   1. Winning the top high school championship completes a CHAPTER and opens
 *      the college job market — it does not end the career.
 *   2. A college game is genuinely playable: the Play button loads two real
 *      college rosters into the match engine and produces a real result.
 *
 *   npm run build && npm run preview &
 *   node scripts/ladder-flow.mjs
 */
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const KEY = 'lsl.career.challenge.v6';

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
const save = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), KEY);
const clickText = async (re) => {
  const b = page.getByRole('button', { name: re }).first();
  if (!(await b.count())) return false;
  await b.click().catch(() => {});
  await settle();
  return true;
};

async function load(file) {
  const json = readFileSync(file, 'utf8').trim();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(([k, s]) => { localStorage.clear(); localStorage.setItem(k, s); }, [KEY, json]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Press Start').click();
  await settle(400);
  await page.locator('.menu-btn__label').filter({ hasText: 'Challenge' }).first().click();
  await settle(400);
  await clickText(/Continue the career|See how it ended/i);
  await settle(700);
}

/* ------------------------ 1. the A-Class championship is NOT the end ------ */

await load('/tmp/aclass-champ.json');
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

await load('/tmp/d3-save.json');
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

console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
if (problems.length) console.log(`\nFailed: ${problems.join(', ')}`);
console.log(errors.length ? `\nConsole errors:\n  ${errors.join('\n  ')}` : '\nNo console errors.');
await browser.close();
process.exit(problems.length || errors.length ? 1 : 0);
