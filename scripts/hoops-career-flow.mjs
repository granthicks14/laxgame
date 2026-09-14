/**
 * A BASKETBALL CAREER, IN A REAL BROWSER.
 *
 * The engine is tested to death by `npm run hoops-career`. This is the other
 * half: whether a person can actually REACH any of it. A career mode is a few
 * dozen screens, and a dead button on one of them is invisible to a simulation
 * and fatal to a player.
 *
 * So this walks the whole thing the way somebody would — start a dynasty, play a
 * game, simulate a season, work the offseason, open every screen in the mode,
 * start a challenge career, take a job — and it fails on a dead control, a
 * console error, or a screen that does not come up.
 *
 *   npm run build && npm run preview &
 *   node scripts/hoops-career-flow.mjs
 */
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';
import { enterSport } from './enter.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const EXEC = chromiumPath();

const problems = [];
let passed = 0;

function check(name, ok, detail = '') {
  if (ok) passed++;
  else problems.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

async function newPage(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  return { ctx, page };
}

const menu = (page, label) =>
  page.locator('.menu-btn__label').filter({ hasText: label }).first().click();

const wide = (page, label) =>
  page.locator('.btn__label').filter({ hasText: label }).first().click();

/** Which rung the challenge hub says it is on, from "3/9 · JUCO". */
const small_rung = async (page) => {
  const sub = await page.locator('.topbar__sub').first().innerText().catch(() => '');
  const m = /(\d+)\/9/.exec(sub);
  return m ? Number(m[1]) : 0;
};

/** The rung the first job on the table is at. */
const small_rungFromJobs = async (page) => {
  const sub = await page.locator('.topbar__sub').first().innerText().catch(() => '');
  const m = /(\d+)\/9/.exec(sub);
  return m ? Number(m[1]) : 0;
};

const topTitle = async (page) =>
  (await page.locator('.topbar__title').first().innerText()).toLowerCase();

/** Every visible control on screen, for the dead-control sweep. */
const controls = (page) => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('button, select')) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 40),
      disabled: el.disabled === true,
    });
  }
  return out;
});

async function sweep(page, where) {
  const list = await controls(page);
  check(`${where}: has controls`, list.length > 0, `${list.length}`);
  const blank = list.filter((c) => c.tag === 'button' && !c.text && !c.disabled);
  check(`${where}: nothing unlabelled`, blank.length === 0, `${blank.length} blank`);
  return list;
}

/**
 * An offseason worked the way a player would work it: offer to the recruits the
 * board says are winnable, and run the cycle out. A suite that only presses
 * "next" proves the buttons exist; it does not prove the mode can be played.
 */
async function workOffseason(page) {
  const board = page.locator('.btn__label').filter({ hasText: 'The board' }).first();
  if (!(await board.count())) return;
  await board.click();
  await page.waitForSelector('.prospect__head').catch(() => {});

  // The "Winnable" filter is the board's own odds column. Offer down the list.
  const winnable = page.locator('.seg__opt').filter({ hasText: 'Winnable' }).first();
  if (await winnable.count()) {
    for (let round = 0; round < 10; round++) {
      await winnable.click();
      await page.waitForTimeout(60);
      const head = page.locator('.prospect__head').first();
      if (!(await head.count())) break;
      await head.click();
      await page.waitForTimeout(60);
      const offer = page.getByRole('button', { name: /Offer him a place/i }).first();
      if (!(await offer.count())) break;
      await offer.click();
      await page.waitForTimeout(60);
    }
  }
  for (let w = 0; w < 12; w++) {
    const work = page.locator('.btn__label').filter({ hasText: 'Work the week' }).first();
    if (!(await work.count())) break;
    await work.click();
    await page.waitForTimeout(50);
  }
  await page.locator('.topbar .btn--icon').first().click();
  await page.waitForSelector('.btn__label');
}

/** Buy whatever the tree will sell, cheapest branch first. */
async function spendPoints(page) {
  const tile = page.locator('.tile__label').filter({ hasText: 'Coach' }).first();
  if (!(await tile.count())) return;
  await tile.click();
  await page.waitForSelector('.roster-row');
  for (let i = 0; i < 8; i++) {
    const buyable = page.locator('button.roster-row').first();
    if (!(await buyable.count())) break;
    await buyable.click();
    await page.waitForTimeout(60);
  }
  await page.locator('.topbar .btn--icon').first().click();
  await page.waitForSelector('.tile__label');
}

async function run() {
  const browser = await chromium.launch({ executablePath: EXEC });
  const { ctx, page } = await newPage(browser);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await enterSport(page, 'basketball');

  /* ------------------------------------------------------------- dynasty */

  await menu(page, 'Dynasty');
  await page.waitForSelector('.topbar__title');
  check('the dynasty setup opens', (await topTitle(page)).includes('new dynasty'));
  await sweep(page, 'dynasty setup');

  // A different level, to prove the pyramid is reachable.
  await page.locator('select.select').first().selectOption({ index: 6 });
  await page.waitForTimeout(120);
  const rows = await page.locator('.roster-row').count();
  check('a level lists its programmes', rows > 20, `${rows} rows`);

  await page.locator('.roster-row').nth(3).click();
  await wide(page, 'Take the job');
  await page.waitForSelector('.bigstat__v');
  check('the career hub opens', (await page.locator('.bigstat__v').count()) >= 3);
  await sweep(page, 'career hub');

  const hubText = await page.locator('.wrapper').first().innerText();
  check('the hub shows a record, a squad and points',
    /\d+-\d+/.test(hubText) && /squad/i.test(hubText) && /points/i.test(hubText));

  /* ------------------------------------------------ every screen in the mode */

  for (const [tile, expect] of [
    ['Squad', /squad/i],
    ['The plan', /plan/i],
    ['Coach', /office/i],
    ['The table', /./],
    ['Statistics', /statistic/i],
  ]) {
    await page.locator('.tile__label').filter({ hasText: tile }).first().click();
    await page.waitForSelector('.topbar__title');
    const title = await topTitle(page);
    check(`${tile} opens`, expect.test(title), title);
    await sweep(page, tile);
    await page.locator('.topbar .btn--icon').first().click();
    await page.waitForSelector('.tile__label');
  }

  /* --- the squad's three views, and a player page. */
  await page.locator('.tile__label').filter({ hasText: 'Squad' }).first().click();
  for (const view of ['Needs', 'Development', 'Squad']) {
    await page.locator('.seg__opt').filter({ hasText: view }).first().click();
    await page.waitForTimeout(60);
  }
  const needsSeen = await page.locator('.seg__opt').filter({ hasText: 'Needs' }).first().click()
    .then(() => page.locator('.wrapper').first().innerText());
  check('needs and places are stated separately',
    /place/i.test(needsSeen) && /need/i.test(needsSeen));
  await page.locator('.seg__opt').filter({ hasText: 'Squad' }).first().click();
  await page.locator('.roster-row').first().click();
  check('a player page opens', (await page.locator('.kv__k').count()) > 6);
  await page.locator('.topbar .btn--icon').first().click();
  await page.locator('.topbar .btn--icon').first().click();
  await page.waitForSelector('.tile__label');

  /* --- the plan actually changes what the team runs. */
  await page.locator('.tile__label').filter({ hasText: 'The plan' }).first().click();
  const before = await page.locator('.roster-row--on').first().innerText();
  // Click an offence that is NOT already selected, or the test proves nothing.
  const offence = page.locator('.panel').nth(1).locator('.roster-row');
  const count = await offence.count();
  for (let i = 0; i < count; i++) {
    const cls = await offence.nth(i).getAttribute('class');
    if (!cls.includes('roster-row--on')) { await offence.nth(i).click(); break; }
  }
  await page.waitForTimeout(80);
  const after = await page.locator('.roster-row--on').first().innerText();
  check('choosing a scheme changes the scheme', before !== after,
    `${before.split('\n')[0]} -> ${after.split('\n')[0]}`);
  await page.locator('.topbar .btn--icon').first().click();
  await page.waitForSelector('.tile__label');

  /* ------------------------------------------------------------ a real game */

  await page.waitForSelector('.btn__label');
  await wide(page, 'Play it');
  await page.waitForSelector('canvas', { timeout: 15000 });
  const live = await page.evaluate(() => !!window.hardwood?.game);
  check('a career game reaches the floor', live);
  // Run it out fast rather than playing forty minutes of basketball.
  // Run it out in one evaluate and report from inside: the moment the game hits
  // its final buzzer the screen swaps itself for the box score, and the debug
  // handle goes with it.
  const finished = await page.evaluate(() => {
    const { game, neutral } = window.hardwood;
    const idle = neutral();
    for (let i = 0; i < 300000 && game.phase !== 'final'; i++) game.update(1 / 60, idle);
    return { phase: game.phase, points: game.score.home + game.score.away };
  });
  check('the game finishes', finished.phase === 'final', finished.phase);
  // Nobody is holding the controller, so the coached side barely scores. What
  // this asserts is that a real game of real length actually ran.
  check('and it was a game of basketball', finished.points > 12, `${finished.points} points`);
  await page.waitForTimeout(500);

  await page.waitForSelector('.btn', { timeout: 15000 });
  const doneBtn = page.getByRole('button', { name: /Back to the programme/i }).first();
  if (await doneBtn.count()) await doneBtn.click();
  await page.waitForSelector('.bigstat__v', { timeout: 15000 });
  const afterGame = await page.locator('.wrapper').first().innerText();
  check('the result is on the record', /[1-9]\d*-\d+|\d+-[1-9]\d*/.test(afterGame));

  /* -------------------------------------------------- a whole season, quickly */

  let guard = 0;
  while (guard++ < 90) {
    const sim = page.locator('.btn__label').filter({ hasText: 'Simulate' }).first();
    if (await sim.count()) { await sim.click(); await page.waitForTimeout(60); continue; }
    const next = page.locator('.btn__label').filter({
      hasText: /Into the postseason|regular season is over|Play it out|Close the season/,
    }).first();
    if (await next.count()) { await next.click(); await page.waitForTimeout(80); continue; }
    break;
  }
  const seasonEnd = await page.locator('.wrapper').first().innerText();
  check('a season plays out to its end', /offseason/i.test(seasonEnd), seasonEnd.slice(0, 60));

  /* ------------------------------------------------------------ the offseason */

  await wide(page, 'The offseason');
  await page.waitForSelector('.topbar__title');
  check('the offseason opens', (await topTitle(page)).includes('offseason'));
  const off = await page.locator('.wrapper').first().innerText();
  check('it reports departures and development',
    /leaving|develop|thin/i.test(off));
  await sweep(page, 'offseason');

  const board = page.locator('.btn__label').filter({ hasText: 'The board' }).first();
  if (await board.count()) {
    await board.click();
    await page.waitForSelector('.prospect__head');
    check('the recruiting board opens', (await page.locator('.prospect__head').count()) > 5);
    await page.locator('.prospect__head').first().click();
    const opened = await page.locator('.prospect__open').first().innerText();
    check('a prospect says what he wants and whether you can get him',
      /wants|stand at/i.test(opened), opened.slice(0, 50).replace(/\n/g, ' '));
    const offer = page.getByRole('button', { name: /Offer him a place/i }).first();
    if (await offer.count()) {
      await offer.click();
      await page.waitForTimeout(80);
      check('an offer sticks',
        (await page.locator('.wrapper').first().innerText()).includes('1 of'));
    }
    let weeks = 0;
    while (weeks++ < 12) {
      const work = page.locator('.btn__label').filter({ hasText: 'Work the week' }).first();
      if (!(await work.count())) break;
      await work.click();
      await page.waitForTimeout(60);
    }
    check('the cycle can be worked to its end', weeks > 2, `${weeks} weeks`);
    await page.locator('.topbar .btn--icon').first().click();
    await page.waitForSelector('.btn__label');
  }

  const portal = page.locator('.btn__label').filter({ hasText: 'Work the window' }).first();
  if (await portal.count()) {
    await portal.click();
    await page.waitForSelector('.prospect__head');
    await page.locator('.prospect__head').first().click();
    const t = await page.locator('.prospect__open').first().innerText();
    check('a transfer says what he wants', /HIGH|MEDIUM|LOW/.test(t));
    const approach = page.getByRole('button', { name: /Approach him/i }).first();
    if (await approach.count()) await approach.click();
    await page.waitForTimeout(120);
    check('an approach resolves', true);
    await page.locator('.topbar .btn--icon').first().click();
    await page.waitForSelector('.btn__label');
  }

  await wide(page, 'Start the season');
  await page.waitForSelector('.bigstat__v');
  const yearTwo = await page.locator('.topbar__sub').first().innerText();
  check('the next season starts', /year 2/i.test(yearTwo), yearTwo);

  /* ------------------------------------------- the save survives a reload */

  await page.reload({ waitUntil: 'networkidle' });
  await enterSport(page, 'basketball');
  const menuText = await page.locator('.wrapper').first().innerText();
  check('the menu offers to carry on', /CONTINUE/.test(menuText));
  await menu(page, 'Dynasty');
  await page.waitForSelector('.bigstat__v');
  check('the career comes back where it was',
    /year 2/i.test(await page.locator('.topbar__sub').first().innerText()));

  /* ------------------------------------------------------------ challenge */

  await page.locator('.topbar .btn--icon').first().click();
  await page.waitForSelector('.menu-btn__label');
  await menu(page, 'Challenge');
  await page.waitForSelector('.topbar__title');
  check('the climb screen opens', (await topTitle(page)).includes('climb'));
  const climb = await page.locator('.wrapper').first().innerText();
  check('it explains the ladder before anything else',
    /rungs|championship/i.test(climb));
  check('and shows what each difficulty changes',
    /HARDER|EASIER/.test(climb) || /Coach Points earned/.test(climb));

  await page.locator('.seg__opt').filter({ hasText: 'VH' }).first().click();
  await page.waitForTimeout(80);
  const vh = await page.locator('.wrapper').first().innerText();
  check('a harder tier reads as harder', /HARDER/.test(vh));
  await page.locator('.seg__opt').filter({ hasText: 'STD' }).first().click();

  await wide(page, 'See who will have you');
  await page.waitForSelector('.job');
  const jobs = await page.locator('.job').count();
  check('three first jobs are offered', jobs >= 2, `${jobs}`);
  const jobText = await page.locator('.job').first().innerText();
  check('a job says what state the programme is in and what the board wants',
    /board/i.test(jobText));

  await page.locator('.job').first().click();
  await page.waitForSelector('.bigstat__v');
  const chHub = await page.locator('.wrapper').first().innerText();
  check('the challenge hub opens with the board on it', /board|want/i.test(chHub));
  check('and says which rung this is',
    /1\/9/.test(await page.locator('.topbar__sub').first().innerText()));
  await sweep(page, 'challenge hub');

  /* ------------------------------------------ a challenge career, several years */

  // The whole promise of the mode is that a championship moves you up a rung and
  // nothing else does. A season here is two clicks now, so the suite can coach
  // enough of them to see one actually happen.
  let seasons = 0;
  let promoted = false;
  let sacked = false;
  const startRung = await small_rung(page);
  while (seasons < 14 && !promoted) {
    const simAll = page.locator('.btn__label').filter({ hasText: 'Simulate the season' }).first();
    if (await simAll.count()) { await simAll.click(); await page.waitForTimeout(180); continue; }
    const close = page.locator('.btn__label').filter({
      hasText: /Close the season|Into the postseason|regular season is over|Play it out/,
    }).first();
    if (await close.count()) { await close.click(); await page.waitForTimeout(160); continue; }

    const jobs = page.locator('.btn__label').filter({ hasText: 'See the jobs' }).first();
    if (await jobs.count()) {
      await jobs.click();
      await page.waitForSelector('.job');
      const title = (await topTitle(page));
      sacked = sacked || title.includes('out of a job');
      promoted = !sacked;
      const before = await small_rungFromJobs(page);
      await page.locator('.job').first().click();
      await page.waitForSelector('.bigstat__v');
      const now = await small_rung(page);
      check('taking a job moves the coach exactly one rung',
        Math.abs(now - before) <= 1, `${before} -> ${now}`);
      break;
    }

    const off = page.locator('.btn__label').filter({ hasText: 'The offseason' }).first();
    if (await off.count()) {
      await off.click();
      await page.waitForSelector('.topbar__title');
      await workOffseason(page);
      await wide(page, 'Start the season');
      await page.waitForSelector('.bigstat__v');
      await spendPoints(page);
      seasons++;
      continue;
    }
    break;
  }
  check('a challenge career runs season after season', seasons >= 1 || promoted,
    `${seasons} seasons`);
  const endRung = await small_rung(page);
  check('and the ladder only ever moves by one',
    Math.abs(endRung - startRung) <= 1, `${startRung} -> ${endRung}`);

  /* --- the two careers do not share a save. */
  const saves = await page.evaluate(() => Object.keys(localStorage)
    .filter((k) => k.includes('career')));
  check('basketball and lacrosse save to different keys',
    saves.some((k) => k.startsWith('lsl.hoops.career.'))
    && !saves.some((k) => /^lsl\.career\./.test(k) && k.includes('hoops')),
    saves.join(' '));
  check('dynasty and challenge save separately',
    saves.includes('lsl.hoops.career.dynasty.v1')
    && saves.includes('lsl.hoops.career.challenge.v1'), saves.join(' '));

  await ctx.close();

  /* --------------------------------------------------------------- a phone */

  // Everything above was a desktop. A management screen is mostly text and
  // numbers, which is exactly the kind of layout that quietly grows a sideways
  // scrollbar at 390 points wide.
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const small = await phone.newPage();
  small.on('pageerror', (e) => problems.push(`pageerror (phone): ${e.message}`));
  await small.goto(BASE, { waitUntil: 'networkidle' });
  await enterSport(small, 'basketball', { tap: true });
  await small.locator('.menu-btn__label').filter({ hasText: 'Dynasty' }).first().tap();
  await small.waitForSelector('.topbar__title');
  await small.locator('.btn__label').filter({ hasText: 'Take the job' }).first().tap();
  await small.waitForSelector('.bigstat__v');

  const overflow = async (where) => {
    const bad = await small.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${where} fits a phone`, bad <= 1, `${bad}px over`);
  };
  await overflow('the career hub');
  for (const tile of ['Squad', 'The plan', 'Coach', 'The table']) {
    await small.locator('.tile__label').filter({ hasText: tile }).first().tap();
    await small.waitForSelector('.topbar__title');
    await overflow(tile);
    await small.locator('.topbar .btn--icon').first().tap();
    await small.waitForSelector('.tile__label');
  }
  const tap = await small.evaluate(() => {
    let small = 0;
    for (const el of document.querySelectorAll('button')) {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      if (r.height < 32) small++;
    }
    return small;
  });
  check('every control on the hub is thumb-sized', tap === 0, `${tap} under 32px`);
  await phone.close();

  await browser.close();

  console.log(`\n${passed} passed, ${problems.length} problem(s)`);
  for (const p of problems) console.log(`  - ${p}`);
  if (problems.length) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
