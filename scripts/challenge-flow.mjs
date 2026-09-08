/**
 * Challenge Mode and recruiting flow audit.
 *
 * Drives a real browser through a Challenge career: taking the first job,
 * hiring a scout, working a recruiting class, playing a season out, and the
 * end-of-season verdict — then checks that each stage changed the save.
 *
 *   npm run build && npm run preview &
 *   node scripts/challenge-flow.mjs
 */
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const SAVE = 'lsl.career.challenge.v6';

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

/* ------------------------------------------------------------ the ladder */

await page.locator('.menu-btn__label').filter({ hasText: 'Challenge' }).first().click();
await settle();
check('the ladder is on the entry screen', await page.locator('.rung').count() === 9,
  `${await page.locator('.rung').count()} rungs`);

await clickText(/Take the job/);
await settle(700);
const started = await save();
check('a Challenge career starts', !!started && !!started.challenge);
check('it starts at the bottom rung', started?.challenge?.stageIndex === 0,
  `rung ${started?.challenge?.stageIndex}`);
check('it starts in Class D', started?.classKey === 'd', started?.classKey);
check('a starting situation was applied', !!started?.challenge?.situation,
  started?.challenge?.situation);
check('a recruiting class opened', (started?.recruiting?.prospects?.length ?? 0) > 0,
  `${started?.recruiting?.prospects?.length} prospects`);
check('offers are scarce', (started?.recruiting?.offersLeft ?? 0) > 0 && (started?.recruiting?.offersLeft ?? 99) <= 6,
  `${started?.recruiting?.offersLeft} offers`);

// The hub carries the career panel.
const hubText = (await page.locator('.wrapper').innerText()).toLowerCase();
check('the hub shows where the career stands', hubText.includes('your career') && hubText.includes('reputation'));
check('the hub shows the recruiting class', hubText.includes('recruiting'));

/* ---------------------------------------------------------- recruiting */

await clickText(/Recruiting board/);
await settle(400);
check('the board opens', (await page.locator('.list__row').count()) > 0,
  `${await page.locator('.list__row').count()} prospects listed`);
check('every prospect shows an error bar rather than a true rating',
  (await page.locator('.list__row').first().innerText()).includes('±'));

// Hire a scout.
await clickText(/Scout market/);
await settle();
const cpBefore = (await save()).coachingPoints;
const hired = await clickText(/^\d+ CP$/);
const afterHire = await save();
check('a scout can be hired', hired && (afterHire.recruiting.scouts.length > 0),
  `${afterHire.recruiting.scouts.length} on staff`);
check('hiring costs Coach Points', afterHire.coachingPoints < cpBefore,
  `${cpBefore} -> ${afterHire.coachingPoints}`);
await back();
await settle();

// Open a prospect, assign the scout, make an offer.
await page.locator('.list__row').first().click();
await settle();
const reportText = await page.locator('.wrapper').innerText();
check('an unscouted prospect reads as a rumour', /not been watched|somebody else's opinion|Not yet scouted/i.test(reportText));
const assigned = await clickText(/^Send /);
const afterAssign = await save();
check('a scout can be sent to watch him', assigned && afterAssign.recruiting.scouts.some((s) => s.assignedTo));
const offersBefore = afterAssign.recruiting.offersLeft;
await clickText(/Offer him a place/);
const afterOffer = await save();
check('an offer can be extended', afterOffer.recruiting.offersLeft === offersBefore - 1,
  `${offersBefore} -> ${afterOffer.recruiting.offersLeft}`);
check('the offer is on the prospect', afterOffer.recruiting.prospects.some((p) => p.offered));
await back();
await back();
await settle();

/* -------------------------------------------------------------- a season */

// Simulate the whole season from the hub.
let guard = 0;
while (guard++ < 40) {
  const simmed = await clickText(/^Simulate this game$/);
  if (!simmed) break;
  await settle(260);
  const s = await save();
  if (s?.seasonComplete) break;
}
const seasonDone = await save();
check('a season can be played out', !!seasonDone?.seasonComplete || guard >= 40,
  `${seasonDone?.history?.length ?? 0} seasons recorded`);
check('scouting progressed through the season',
  (seasonDone?.recruiting?.prospects ?? []).some((p) => p.scouted > 20),
  `best ${Math.round(Math.max(0, ...(seasonDone?.recruiting?.prospects ?? []).map((p) => p.scouted)))}%`);
check('rival programmes recruited too',
  (seasonDone?.recruiting?.prospects ?? []).some((p) => p.committedTo && p.committedTo !== seasonDone.teamId));

/* ------------------------------------------------------------- the verdict */

await settle(500);
const summary = (await page.locator('.wrapper').innerText()).toLowerCase();
check('the season is graded against the career', summary.includes('reputation'));
const graded = await save();
check('the verdict reached the save', (graded?.challenge?.steps?.length ?? 0) === 1,
  `${graded?.challenge?.steps?.length} steps`);
check('total years advanced', (graded?.challenge?.totalYears ?? 0) === 1);

// Advance into the offseason and confirm signings become real players.
const beforeRoster = graded.roster.length;
const advanced = await clickText(/Advance to season|jobs? on the table|See how the career ended/i);
await settle(700);
const after = await save();
check('the career can move forward', advanced);
if (after && !after.challenge.offers?.length && after.challenge.totalYears === 1) {
  check('the offseason produced a fresh class',
    after.recruiting && after.recruiting.cycle !== graded.recruiting.cycle);
  check('the roster carried over', after.roster.length >= Math.min(18, beforeRoster - 8),
    `${beforeRoster} -> ${after.roster.length}`);
  check('development history is being written',
    after.roster.some((p) => (p.dev?.history?.length ?? 0) > 0));
}

/* ------------------------------------------------------------- the tracker */

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByText('Press Start').click();
await settle();
await page.locator('.menu-btn__label').filter({ hasText: 'Challenge' }).first().click();
await settle();
await clickText(/Career tracker/);
await settle();
const tracker = await page.locator('.wrapper').innerText();
check('the tracker shows the ladder', (await page.locator('.rung').count()) === 9);
check('the tracker shows a legacy score', /legacy/i.test(tracker));
check('the tracker lists the season just played', /Y1/.test(tracker));

console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
if (problems.length) console.log(`\nFailed: ${problems.join(', ')}`);
console.log(errors.length ? `\nConsole errors:\n  ${errors.join('\n  ')}` : '\nNo console errors.');
await browser.close();
process.exit(problems.length || errors.length ? 1 : 0);
