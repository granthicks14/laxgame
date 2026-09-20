/**
 * FOOTBALL, END TO END, IN A REAL BROWSER.
 *
 * The hub's front door, football's own loading screen, a game that is actually
 * coached — plays called, snaps taken, throws made — through to the gun, the box
 * score and the way back out. Then the same thing on a phone, by thumb, because
 * a play-call card that does not fit a phone is a game that cannot be played on
 * one.
 *
 *   npm run build && npm run preview &
 *   node scripts/gridiron-flow.mjs
 */
import { chromium, devices } from 'playwright';
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

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  return { ctx, page };
}

const menu = (page, label) =>
  page.locator('.menu-btn__label').filter({ hasText: label }).first().click();

const state = (page) => page.evaluate(() => {
  const g = window.gridiron?.game;
  if (!g) return null;
  return {
    phase: g.phase,
    quarter: g.quarter,
    clock: g.clock,
    down: g.down,
    toGo: g.toGo,
    los: g.lineOfScrimmage,
    score: { ...g.score },
    possession: g.possession,
    human: g.humanSide,
    players: g.players.length,
    final: g.isFinal(),
    plays: g.history.length,
    banner: g.banner,
  };
});

/**
 * COACH A FEW PLAYS.
 *
 * Answer the card when it is up, snap when it is not, and throw at whatever the
 * aim happens to be pointing at — which is exactly what a person learning the
 * game does, and it exercises the whole loop rather than a scripted happy path.
 */
async function coach(page, seconds, tap = false) {
  const until = Date.now() + seconds * 1000;
  let calls = 0;
  while (Date.now() < until) {
    const card = page.locator('.callcard__play');
    if (await card.count()) {
      const n = await card.count();
      const pick = card.nth(Math.floor(Math.random() * Math.min(n, 6)));
      if (tap) await pick.tap();
      else await pick.click();
      calls++;
      await page.waitForTimeout(120);
      continue;
    }
    const s = await state(page);
    if (!s || s.final) break;
    if (s.phase === 'presnap' && s.possession === s.human) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(80);
      continue;
    }
    if (s.phase === 'live') {
      // Drop back, look, throw at whoever the reticle found.
      await page.keyboard.down('KeyS');
      await page.waitForTimeout(260);
      await page.keyboard.up('KeyS');
      await page.keyboard.press('KeyK');
      await page.waitForTimeout(220);
      continue;
    }
    await page.waitForTimeout(120);
  }
  return calls;
}

async function main() {
  const browser = await chromium.launch({ executablePath: EXEC });

  /* ------------------------------------------------------- desktop, by key */
  {
    const { ctx, page } = await newPage(browser, { viewport: { width: 1280, height: 800 } });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterSport(page, 'football', { title: 'Gridiron' });
    check('football menu opens from the hub', true);

    const labels = await page.locator('.menu-btn__label').allTextContents();
    check('every menu item is real', !labels.some((l) => /soon|coming/i.test(l)),
      labels.join(', '));

    await menu(page, 'Clubs');
    await page.waitForTimeout(400);
    const clubs = await page.locator('.club-line').count();
    check('the clubs screen lists rosters', clubs > 4, `${clubs} shown`);
    // The in-app back arrow, never the browser's: this is a single-page app.
    await page.getByRole('button', { name: 'Back' }).first().click();
    await page.locator('.topbar__title').filter({ hasText: 'Gridiron' }).first()
      .waitFor({ state: 'visible', timeout: 5000 });
    check('back from the clubs screen returns to the menu', true);

    await menu(page, 'Play Now');
    await page.waitForTimeout(350);
    check('the setup screen offers a level', await page.locator('.seg__opt').count() > 6,
      `${await page.locator('.seg__opt').count()} options`);

    await page.locator('button', { hasText: 'Coach the home side' }).first().click();
    await page.waitForTimeout(700);

    const start = await state(page);
    check('a game starts', !!start, start ? `Q${start.quarter} ${start.phase}` : 'no game');
    check('twenty-two men take the field', start?.players === 22, `${start?.players}`);

    const calls = await coach(page, 14);
    check('the play-call card can be answered', calls > 2, `${calls} calls`);

    const mid = await state(page);
    check('downs advance', mid && mid.plays > 0, `${mid?.plays} plays run`);
    check('the ball moves', mid && mid.los !== start.los,
      `${start?.los?.toFixed(1)} -> ${mid?.los?.toFixed(1)}`);
    check('the clock runs', mid && mid.clock < start.clock,
      `${start?.clock?.toFixed(0)} -> ${mid?.clock?.toFixed(0)}`);
    check('the down is legal', mid && mid.down >= 1 && mid.down <= 4, `down ${mid?.down}`);

    // The pause menu and its box score.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    check('pause opens', await page.locator('.overlay__panel').count() === 1);
    await page.locator('.seg__btn', { hasText: 'Box score' }).first().click();
    await page.waitForTimeout(250);
    check('the box score renders', await page.locator('.box').count() > 0);
    await page.locator('.seg__btn', { hasText: 'Paused' }).first().click();
    await page.locator('.btn', { hasText: 'Resume' }).first().click();
    await page.waitForTimeout(200);

    /* RUN IT OUT. The engine is driven straight, with nobody at the sticks, so a
     * whole game finishes in a couple of seconds and the final screen is real. */
    await page.evaluate(() => {
      const g = window.gridiron.game;
      const n = window.gridiron.neutral;
      g.humanSide = null;
      for (let i = 0; i < 60 * 60 * 25 && !g.isFinal(); i++) g.update(1 / 60, n());
    });
    await page.waitForTimeout(700);
    const end = await state(page);
    check('the game reaches a final', !end || end.final, end ? `phase ${end.phase}` : 'gone');

    await page.locator('.topbar__title', { hasText: 'Final' }).first()
      .waitFor({ state: 'visible', timeout: 6000 });
    check('the final screen opens', true);
    const boxes = await page.locator('.box').count();
    check('the final box score has sections', boxes >= 2, `${boxes} tables`);
    const finalScore = await page.locator('.fb-final__pts').allTextContents();
    check('both scores are shown', finalScore.length === 2, finalScore.join(' - '));

    await page.locator('.btn', { hasText: 'Back' }).first().click();
    await page.waitForTimeout(400);
    await backToHub(page);
    check('the way back to the hub works', true);
    await ctx.close();
  }

  /* ---------------------------------------------------------- phone, by thumb */
  {
    const { ctx, page } = await newPage(browser, {
      ...devices['Pixel 7'],
      hasTouch: true,
      isMobile: true,
    });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterSport(page, 'football', { title: 'Gridiron', tap: true });
    await page.locator('.menu-btn__label').filter({ hasText: 'Play Now' }).first().tap();
    await page.waitForTimeout(400);
    await page.locator('button', { hasText: 'Coach the home side' }).first().tap();
    await page.waitForTimeout(700);

    /* THE GAME OPENS ON A KICKOFF, so the first play call is a couple of
     * seconds away rather than immediate. Waiting for the card rather than for a
     * timer is also the only way this check means anything. */
    const card = page.locator('.callcard__inner');
    await card.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    check('the play card fits a phone', await card.count() === 1);
    if (await card.count()) {
      const box = await card.boundingBox();
      const vp = page.viewportSize();
      check('the card stays inside the screen',
        box && box.width <= vp.width + 1 && box.height <= vp.height + 1,
        box ? `${Math.round(box.width)}x${Math.round(box.height)} in ${vp.width}x${vp.height}` : '');
    }
    // Every play row has to be a thumb target.
    const small = await page.locator('.callcard__play').evaluateAll((els) =>
      els.filter((e) => e.getBoundingClientRect().height < 40).length);
    check('every play row is thumb-sized', small === 0, `${small} too short`);

    await coach(page, 8, true);
    const s = await state(page);
    check('a phone can actually run a play', s && s.plays > 0, `${s?.plays} plays`);

    const tbtns = await page.locator('.tbtn').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      }));
    const tiny = tbtns.filter((b) => b.w < 40 || b.h < 40);
    check('touch buttons are big enough', tiny.length === 0,
      tiny.length ? JSON.stringify(tiny) : `${tbtns.length} buttons`);

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('nothing overflows sideways', overflow <= 1, `${overflow}px`);
    await ctx.close();
  }

  /* ------------------------------------------------------- a whole career */
  {
    const { ctx, page } = await newPage(browser, { viewport: { width: 1280, height: 900 } });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterSport(page, 'football', { title: 'Gridiron' });

    await menu(page, 'Dynasty');
    await page.waitForTimeout(450);
    check('the dynasty start screen offers programmes',
      await page.locator('.pick').count() > 6,
      `${await page.locator('.pick').count()} clubs`);
    await page.locator('.pick').nth(5).click();
    await page.locator('button', { hasText: 'Take the job' }).first().click();
    await page.locator('.career-head').first().waitFor({ timeout: 8000 });
    check('the career hub opens', true);

    // Simulate a season and get into the offseason.
    await page.locator('button', { hasText: 'Simulate the rest of the season' }).first().click();
    await page.waitForTimeout(1600);
    const hub = () => page.evaluate(() => {
      const raw = localStorage.getItem('lsl.gridiron.career.dynasty.v1');
      if (!raw) return null;
      const c = JSON.parse(raw);
      return {
        year: c.year, stage: c.stage, roster: c.roster.length,
        played: c.schedule.filter((f) => f.played).length,
        total: c.schedule.length,
        history: c.history.length, points: c.coach.points,
        recruits: c.recruits.length,
      };
    });
    const afterSeason = await hub();
    check('a season saves', !!afterSeason, JSON.stringify(afterSeason));
    check('every fixture was played',
      afterSeason && afterSeason.played === afterSeason.total,
      `${afterSeason?.played}/${afterSeason?.total}`);
    check('the season is in the history', (afterSeason?.history ?? 0) === 1);
    check('the coach was paid', (afterSeason?.points ?? 0) > 0, `${afterSeason?.points} points`);

    // The league screen.
    await page.locator('button', { hasText: 'League and standings' }).first().click();
    await page.waitForTimeout(400);
    check('the table renders', await page.locator('.box tbody tr').count() > 6,
      `${await page.locator('.box tbody tr').count()} rows`);
    await page.locator('.seg__opt', { hasText: 'Schedule' }).first().click();
    await page.waitForTimeout(250);
    check('the fixture list renders', await page.locator('.fixture').count() > 8);
    await page.getByRole('button', { name: 'Back' }).first().click();
    await page.waitForTimeout(300);

    // The roster and the coaching tree.
    await page.locator('button', { hasText: 'Roster and coaching' }).first().click();
    await page.waitForTimeout(400);
    check('the depth chart renders', await page.locator('.roster-row').count() > 18,
      `${await page.locator('.roster-row').count()} players`);
    await page.locator('.seg__opt', { hasText: 'Coaching' }).first().click();
    await page.waitForTimeout(250);
    const before = (await hub())?.points ?? 0;
    const buyable = page.locator('.upgrade:not(.is-off)');
    if (await buyable.count()) await buyable.first().click();
    await page.waitForTimeout(300);
    const after = (await hub())?.points ?? 0;
    check('an upgrade can be bought', after < before, `${before} -> ${after}`);
    await page.getByRole('button', { name: 'Back' }).first().click();
    await page.waitForTimeout(300);

    // The offseason and recruiting.
    await page.locator('button', { hasText: 'Work the offseason' }).first().click();
    await page.waitForTimeout(450);
    check('the offseason opens', await page.locator('.panel').count() > 1);
    await page.locator('.seg__opt', { hasText: 'Recruiting' }).first().click();
    await page.waitForTimeout(350);
    const offers = page.locator('button', { hasText: /^Offer/ });
    check('there is a recruiting board', await offers.count() > 4,
      `${await offers.count()} recruits`);
    for (let i = 0; i < Math.min(5, await offers.count()); i++) {
      const b = offers.nth(i);
      if (await b.isEnabled()) await b.click();
      await page.waitForTimeout(90);
    }
    await page.locator('.seg__opt', { hasText: 'What happened' }).first().click();
    await page.waitForTimeout(250);
    await page.locator('button', { hasText: /^Sign the class/ }).first().click();
    await page.waitForTimeout(900);

    const next = await hub();
    check('the next season starts', (next?.year ?? 0) === 2, `year ${next?.year}`);
    check('the squad is still viable', (next?.roster ?? 0) >= 22, `${next?.roster} players`);
    check('a new schedule was drawn', (next?.played ?? 1) === 0, `${next?.played} played`);

    await ctx.close();
  }

  await browser.close();

  console.log(`\n${passed} checks passed`);
  if (problems.length) {
    console.log(`${problems.length} problem(s):`);
    for (const p of problems) console.log(`  ! ${p}`);
    process.exitCode = 1;
  } else {
    console.log('No console errors, no page errors.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
