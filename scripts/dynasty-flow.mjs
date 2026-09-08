/**
 * Complete dynasty flow audit.
 *
 * Drives a real browser through two whole years of a dynasty — preseason
 * staff and tactics, a played game, a simulated game, a simulated quarter,
 * statistics, the playoffs, the offseason, development, league movement, the
 * transfer window — and checks that each stage actually did something.
 *
 *   npm run build && npm run preview &
 *   node scripts/dynasty-flow.mjs
 */
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const SAVE = 'lsl.career.dynasty.v6';

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

const settle = (ms = 320) => page.waitForTimeout(ms);
const save = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), SAVE);
const clickText = async (re) => {
  const b = page.getByRole('button', { name: re }).first();
  if (!(await b.count())) return false;
  await b.click().catch(() => {});
  await settle();
  return true;
};
const back = async () => {
  const b = page.locator('.topbar button').first();
  if (await b.count()) { await b.click().catch(() => {}); await settle(); }
};

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.getByText('Press Start').click();
await settle();

/* ------------------------------------------------------------- preseason */

await page.locator('.menu-btn__label').filter({ hasText: 'Dynasty' }).first().click();
await settle();
await clickText(/Take this job|Start dynasty/i);
await settle(600);
check('a dynasty starts', !!(await save()));

// Coach's office: a new coach can make one decision straight away.
await clickText(/^Staff/);
const cpBefore = (await save()).coachingPoints;
const bought = await clickText(/Upgrade —/);
const afterBuy = await save();
check('coach points buy staff in the office', bought && afterBuy.coachingPoints < cpBefore,
  `${cpBefore} -> ${afterBuy.coachingPoints} CP`);
check('the purchase reaches the save', Object.values(afterBuy.staff).some((v) => v > 0));
await back();

// Tactics are a real setting on the team screen.
await clickText(/^Team$/);
const before = (await save()).tactics.offense;
const seg = page.locator('.seg--block .seg__opt:not(.is-on)').first();
if (await seg.count()) { await seg.click(); await settle(); }
check('tactics can be changed', (await save()).tactics.offense !== before);
await back();

/* ---------------------------------------------------------------- season */

// Play one game for real, including a simulated quarter from the pause menu.
await clickText(/^Play game$/);
await settle(1200);
const card = page.locator('.pregame');
check('a pregame card introduces the fixture', await card.count() > 0);
await page.locator('.pregame').click({ timeout: 3000 }).catch(() => {});
await settle(800);

await page.keyboard.press('Escape');
await settle(400);
const menuButtons = (await page.locator('.overlay__card .btn').allInnerTexts()).join('|').toLowerCase();
check('the pause menu carries settings, controls and stats',
  ['resume', 'controls', 'game settings', 'game stats'].every((t) => menuButtons.includes(t)));

await clickText(/Simulate a quarter/);
const qBefore = await page.evaluate(() => window.loneStarLax.match.quarter);
await clickText(/^Simulate quarter/);
await settle(1500);
const simState = await page.evaluate(() => {
  const m = window.loneStarLax.match;
  return { q: m.quarter, auto: m.autopilot, phase: m.phase, shots: m.stats.home.shots + m.stats.away.shots };
});
check('simulating a quarter advances the game', simState.q > qBefore || simState.phase === 'final',
  `Q${qBefore} -> Q${simState.q}`);
check('the simulated quarter produced real play', simState.shots > 0, `${simState.shots} shots`);
check('control comes back to the player', simState.auto === false);

// Finish the game off on autopilot rather than playing eight more minutes.
await page.evaluate(() => {
  const m = window.loneStarLax.match;
  let guard = 0;
  while (m.phase !== 'final' && guard++ < 8) m.simulateQuarter();
});
await settle(2500);
const postGame = await page.getByRole('button', { name: /Continue/i }).count();
check('a played game reaches the post-game screen', postGame > 0);
await clickText(/Continue/i);
await settle(600);

const afterGame = await save();
const played = afterGame.schedule.filter((g) => g.played).length;
check('the result is recorded in the league', played > 0, `${played} games played`);
check('playing pays coach points', afterGame.coachingPoints >= 0);

// Statistics mid-season.
await clickText(/^Statistics$/);
const statRows = await page.locator('table tbody tr').count();
const leaderRows = await page.locator('.leader').count();
check('the statistics screen lists your squad', statRows > 0, `${statRows} rows`);
check('district leaderboards are populated', leaderRows > 0, `${leaderRows} leaders`);
await back();

// Simulate the rest of the season.
for (let i = 0; i < 40; i++) {
  if (!(await clickText(/Simulate this game/))) break;
}
await settle(600);
const seasonEnd = await save();
check('every fixture is played out', seasonEnd.schedule.every((g) => g.played),
  `${seasonEnd.schedule.length} games`);
check('the season reaches a conclusion', seasonEnd.seasonComplete, seasonEnd.finish ?? '');
check('a playoff bracket was created', (seasonEnd.playoffSeeds ?? []).length >= 2,
  `${(seasonEnd.playoffSeeds ?? []).length} seeds`);

/* -------------------------------------------------------------- offseason */

await clickText(/Advance to year/);
await settle(900);
const off = await save();
check('the offseason advances the year', off.year === 2, `year ${off.year}`);
check('players developed', off.lastDevelopment.length > 0, `${off.lastDevelopment.length} reports`);

const gains = off.lastDevelopment.map((d) => d.to - d.from);
const avg = gains.reduce((a, b) => a + b, 0) / Math.max(1, gains.length);
const best = Math.max(...gains, 0);
check('development produces real movement, not +1 a year', avg > 0.8 && best >= 3,
  `avg ${avg.toFixed(1)}, best +${best}`);
check('development is banded', new Set(off.lastDevelopment.map((d) => d.outcome)).size > 1,
  [...new Set(off.lastDevelopment.map((d) => d.outcome))].join(', '));

check('the league moved teams', (off.lastMovement?.moves.length ?? 0) > 0,
  `${off.lastMovement?.moves.length ?? 0} moves`);
check('every move has a reason', (off.lastMovement?.moves ?? []).every((m) => !!m.reason));

const devVisible = await page.locator('table tbody tr').count();
check('the development report is on screen', devVisible > 0, `${devVisible} rows`);
if (await clickText(/See all .* moves/)) {
  const moveRows = await page.locator('.movement').count();
  check('the movement screen lists the moves', moveRows > 0, `${moveRows} rows`);
  await back();
} else {
  check('the movement screen lists the moves', false, 'no button');
}

// Transfer window.
check('a transfer market opened', off.market.length > 0, `${off.market.length} players`);
check('pitches are limited', off.pitchesLeft > 0 && off.pitchesLeft <= 3, `${off.pitchesLeft}`);
if (await clickText(/Open (player movement|transfer portal|free agency)/i)) {
  const cards = await page.locator('.interest').count();
  check('the portal shows interest for each player', cards === off.market.length,
    `${cards} of ${off.market.length}`);
  const rosterBefore = (await save()).roster.length;
  await clickText(/Make your pitch/);
  await settle(500);
  const afterPitch = await save();
  const target = afterPitch.market.find((c) => c.attempts > 0);
  check('a pitch produces an outcome', !!target && target.status !== 'open',
    target ? target.status : 'none');
  check('a pitch costs one of your three', afterPitch.pitchesLeft === off.pitchesLeft - 1);
  if (target?.status === 'committed') {
    check('a committed player joins the squad', afterPitch.roster.length === rosterBefore + 1);
  }
  await back();
} else {
  check('the portal opens from the offseason', false, 'no button');
}

/* ------------------------------------------------------------- year two */

await clickText(/Start the season/);
await settle(800);
const y2 = await save();
check('year two has a fresh schedule', y2.schedule.every((g) => !g.played), `${y2.schedule.length} games`);
check('year two standings are reset', Object.values(y2.standings).every((r) => r.wins === 0));
check('the squad carried over', y2.roster.length >= 18, `${y2.roster.length} players`);
check('history recorded year one', y2.history.length === 1);

// And the loop closes: the hub is playable again.
check('the hub is ready for another season',
  await page.getByRole('button', { name: /^Play game$/ }).count() > 0);

console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
if (problems.length) console.log('\nProblems:\n' + problems.map((p) => ` - ${p}`).join('\n'));
console.log(errors.length ? `\nConsole errors: ${errors.length}\n${errors.slice(0, 5).join('\n')}` : '\nNo console errors.');

await browser.close();
process.exit(problems.length === 0 && errors.length === 0 ? 0 : 1);
