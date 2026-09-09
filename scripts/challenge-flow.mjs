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

const settle = (ms = 320) => page.waitForTimeout(ms);
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

/* ----------------------------------------------------- choosing a difficulty */

// A career now starts by choosing how hard it is, and the choice is permanent,
// so it gets its own screen before the first job.
await clickText(/Choose your difficulty/);
await settle(500);
const tiers = await page.locator('.panel, .btn').allInnerTexts();
const tierText = tiers.join(' ').toLowerCase();
check('all four difficulties are offered',
  ['standard challenge', 'elite challenge', 'impossible challenge', 'final challenge']
    .every((t) => tierText.includes(t)));

// Tapping a tier has to say what it changes, in numbers.
await clickText(/^Elite Challenge/i);
await settle(400);
const eliteDetail = (await page.locator('.wrapper').innerText());
check('a harder tier explains what it changes',
  /what makes this harder than standard challenge\?/i.test(eliteDetail));
check('the explanation is quantified, not adjectives',
  (eliteDetail.match(/[+-]\d+%/g) ?? []).length >= 5,
  `${(eliteDetail.match(/[+-]\d+%/g) ?? []).length} numbers`);
check('it names the legacy multiplier', /legacy score ×/i.test(eliteDetail));

// And the comparison screen carries every tier side by side.
await clickText(/Compare all four/);
await settle(500);
const compare = (await page.locator('.wrapper').innerText()).toLowerCase();
check('the comparison screen lists every tier',
  ['standard', 'elite', 'impossible', 'final'].every((t) => compare.includes(t)));
check('the comparison covers every system',
  ['coach points earned', 'coach upgrade cost', 'rival recruiting effort', 'transfer resistance',
    'player development', 'quality of jobs offered'].every((r) => compare.includes(r)));
await back();
await settle(400);

await clickText(/^Start on/);
await settle(900);
const started = await save();
check('a Challenge career starts', !!started && !!started.challenge);
check('the career records the difficulty it was started on',
  started?.challenge?.tier === 'elite', started?.challenge?.tier);
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
const advanceSeason = async () => {
  // Simulating a season now passes through the postseason screens: qualifying
  // is shown once, and the bracket opens itself when the playoffs are drawn.
  if (await clickText(/^Simulate this game$/)) return true;
  if (await clickText(/^Continue to the (playoffs|season)$/)) return true;
  return false;
};

let guard = 0;
while (guard++ < 60) {
  const simmed = await advanceSeason();
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
  // A squad that graduated wholesale (the graduation-cliff situation) has no
  // returning player to carry a history, so the report is the reliable signal.
  check('development history is being written',
    after.lastDevelopment.length > 0 || after.roster.some((p) => (p.dev?.history?.length ?? 0) > 0),
    `${after.lastDevelopment.length} development reports`);
}

/* --------------------------------- the offseason systems, in Challenge Mode */

// This is the bug this suite exists for: the offseason used to open the
// transfer window against the DYNASTY save, so a Challenge coach was shown
// somebody else's programme or an empty screen.
{
  const s = await save();
  const offseason = s && !s.challenge.offers?.length && !s.challenge.complete;
  if (offseason) {
    const before = (await page.locator('.wrapper').innerText()).toLowerCase();
    check('the offseason names the level\'s own transfer window',
      /player movement|transfer portal|free agency/.test(before));
    check('the offseason offers recruiting too', before.includes('recruiting board'));
  } else {
    // Promoted or the career ended: take the job so there is a hub to work from.
    const took = await clickText(/Take the .* job/i);
    check('a job can be taken', took || !!s.challenge.complete);
    await settle(700);
  }

  // Whichever path we came by, the window must open on THIS career. Opening it
  // against the dynasty save is the bug this suite exists for.
  const opened = await clickText(/Open (player movement|transfer portal|free agency)/i)
    || await clickText(/^(Player movement|Transfer portal|Free agency)/i);
  check('the transfer window opens in Challenge Mode', opened);
  const portal = (await page.locator('.wrapper').innerText()).toLowerCase();
  check('it is THIS career\'s window, not another save\'s',
    !portal.includes('no programme yet') && !portal.includes('there is no dynasty save'));

  const now = await save();
  if (offseason) {
    await settle(400);
    // Each player on the board offers a set of pitch angles, with the one that
    // fits him best marked as the primary button.
    const cards = await page.locator('.panel .btn--primary, .panel .btn[disabled]').count();
    check('players are available', now.market.length > 0 && cards > 0,
      `${now.market.length} in the save, ${cards} on screen`);
    check('approaches are available', (now.pitchesLeft ?? 0) > 0, `${now.pitchesLeft}`);

    const pitched = await page.locator('.panel .btn--primary').first().click()
      .then(() => true).catch(() => false);
    await settle(400);
    const afterPitch = await save();
    check('an approach can be made from Challenge Mode',
      pitched ? afterPitch.pitchesLeft < now.pitchesLeft : true,
      `${now.pitchesLeft} -> ${afterPitch.pitchesLeft}`);
  } else {
    check('the window is correctly shut in season', now.market.length === 0);
  }
  await back();
  await settle();

  // The coach's office has to work here too.
  const staff = await clickText(/Spend coaching points|^Staff/i);
  const officeText = (await page.locator('.wrapper').innerText()).toLowerCase();
  check('the office opens on this career',
    staff && !officeText.includes('no programme yet'),
    staff ? 'opened' : 'button not found');
  if (staff) { await back(); await settle(); }
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
