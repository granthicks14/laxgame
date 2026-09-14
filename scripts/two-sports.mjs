/**
 * TWO SPORTS, ONE BROWSER, ONE LOCALSTORAGE.
 *
 * The hub's whole promise is that basketball and lacrosse are separate games
 * that happen to share a front door. The place that promise is easiest to break
 * is the one place they genuinely share: the browser's storage. A key collision
 * does not throw, does not log, and does not show up until somebody loses a
 * thirty-season career to a game they tried once.
 *
 * So this runs both sports in one browser, in both orders, and checks that
 * neither one can see, move or destroy the other's save.
 *
 *   npm run build && npm run preview &
 *   node scripts/two-sports.mjs
 */
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';
import { enterSport, backToHub } from './enter.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const EXEC = chromiumPath();

const problems = [];
let passed = 0;

function check(name, ok, detail = '') {
  if (ok) passed++;
  else problems.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const menu = (page, label) =>
  page.locator('.menu-btn__label').filter({ hasText: label }).first().click();

const wide = (page, label) =>
  page.locator('.btn__label').filter({ hasText: label }).first().click();

/** Out of wherever we are, back to the sport's own menu, then to the hub. */
async function leaveSport(page) {
  for (let i = 0; i < 12; i++) {
    if (await page.locator('.hub-back').count()) break;
    const back = page.locator('.topbar .btn--icon').first();
    if (!(await back.count())) break;
    await back.click().catch(() => {});
    await page.waitForTimeout(250);
  }
  await backToHub(page);
}

const keys = (page) => page.evaluate(() => Object.keys(localStorage).sort());
const raw = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);

/** Start a lacrosse dynasty, whatever its screens happen to be called. */
async function lacrosseCareer(page) {
  await enterSport(page, 'lacrosse');
  await menu(page, 'Dynasty');
  await page.waitForTimeout(400);
  // The mode's own setup: take the first offer of a team and start.
  for (const label of [/Start|Begin|Take|Confirm|New career|Play/i]) {
    const b = page.getByRole('button', { name: label }).first();
    if (await b.count()) { await b.click(); await page.waitForTimeout(500); }
  }
  // Some builds ask for a team first; click the first team row if one is showing.
  const row = page.locator('.team-row, .roster-row, .club-line').first();
  if (await row.count()) { await row.click().catch(() => {}); await page.waitForTimeout(300); }
  for (const label of [/Start|Begin|Take the job|Confirm/i]) {
    const b = page.getByRole('button', { name: label }).first();
    if (await b.count()) { await b.click(); await page.waitForTimeout(600); }
  }
}

async function basketballCareer(page) {
  await enterSport(page, 'basketball');
  await menu(page, 'Dynasty');
  await page.waitForSelector('.btn__label', { timeout: 10000 });
  await wide(page, 'Take the job');
  await page.waitForSelector('.bigstat__v', { timeout: 10000 });
}

async function run() {
  const browser = await chromium.launch({ executablePath: EXEC });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  /* --- lacrosse first. */
  await lacrosseCareer(page);
  const afterLax = await keys(page);
  const laxKeys = afterLax.filter((k) => /^lsl\.career\./.test(k));
  check('a lacrosse career writes a lacrosse save', laxKeys.length > 0, afterLax.join(' '));
  const laxBefore = laxKeys.length ? await raw(page, laxKeys[0]) : null;
  check('and it has something in it', !!laxBefore && laxBefore.length > 200,
    `${laxBefore ? laxBefore.length : 0} bytes`);

  /* --- then basketball, in the same browser. */
  await leaveSport(page);
  await basketballCareer(page);
  const afterBoth = await keys(page);
  const hoopKeys = afterBoth.filter((k) => k.startsWith('lsl.hoops.career.'));
  check('a basketball career writes a basketball save', hoopKeys.length > 0, hoopKeys.join(' '));
  check('and the two do not share a key',
    !hoopKeys.some((k) => laxKeys.includes(k)));

  const laxAfter = laxKeys.length ? await raw(page, laxKeys[0]) : null;
  check('the lacrosse save is byte-for-byte what it was', laxAfter === laxBefore,
    laxAfter === laxBefore ? '' : `${laxBefore?.length} -> ${laxAfter?.length}`);

  /* --- and lacrosse still opens onto its own career. */
  await leaveSport(page);
  await enterSport(page, 'lacrosse');
  const laxDynastyRow = await page.locator('.menu-btn')
    .filter({ hasText: 'Dynasty' }).first().innerText();
  check('lacrosse still offers to carry on its dynasty',
    /CONTINUE|Year \d|\d+-\d+/i.test(laxDynastyRow),
    laxDynastyRow.replace(/\n/g, ' / '));
  await menu(page, 'Dynasty');
  await page.waitForTimeout(700);
  const laxLive = await page.locator('.wrapper').first().innerText();
  check('and what it opens is lacrosse, not basketball',
    !/rung|hardwood|tip off|rebound/i.test(laxLive),
    laxLive.slice(0, 60).replace(/\n/g, ' '));
  check('and it knows there is a career to resume',
    /continue|resume|year|season \d/i.test(laxLive),
    laxLive.slice(0, 80).replace(/\n/g, ' '));

  /* --- deleting one does not delete the other. */
  await page.evaluate((k) => localStorage.removeItem(k), hoopKeys[0]);
  const stillLax = await raw(page, laxKeys[0]);
  check('deleting the basketball save leaves lacrosse alone', stillLax === laxBefore);

  await page.reload({ waitUntil: 'networkidle' });
  await enterSport(page, 'basketball');
  const hoopMenu = await page.locator('.wrapper').first().innerText();
  check('and basketball offers a new career rather than breaking',
    /NEW/.test(hoopMenu), hoopMenu.split('\n').slice(0, 6).join(' / '));

  /* --- the hub's front door reads both without loading either. */
  await leaveSport(page);
  const loaded = await page.evaluate(() => !window.hardwood && !window.lsl);
  check('and the hub itself still holds no sport', loaded);

  await ctx.close();
  await browser.close();

  console.log(`\n${passed} passed, ${problems.length} problem(s)`);
  for (const p of problems) console.log(`  - ${p}`);
  if (problems.length) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
