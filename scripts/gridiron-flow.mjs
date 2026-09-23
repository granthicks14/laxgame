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
    /* SKIP STRAIGHT THROUGH THEIR POSSESSION. He plays offence; a suite that
     * sits through the defensive series is measuring the wall clock rather than
     * the game, and it exercises the skip button while it is there. */
    const skip = page.locator('.fb-defence:not(.is-off) .fb-plan__chip--ghost');
    if (await skip.count()) {
      if (tap) await skip.first().tap();
      else await skip.first().click();
      await page.waitForTimeout(150);
      continue;
    }
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
    check('the setup screen offers both conferences and every club',
      await page.locator('.seg__opt').count() > 6,
      `${await page.locator('.seg__opt').count()} options`);

    await page.locator('button', { hasText: 'Kick off' }).first().click();
    await page.waitForTimeout(700);

    const start = await state(page);
    check('a game starts', !!start, start ? `Q${start.quarter} ${start.phase}` : 'no game');
    check('twenty-two men take the field', start?.players === 22, `${start?.players}`);

    /* LONG ENOUGH FOR SEVERAL DOWNS. A football play now includes a walk to the
     * line and a dead ball, so a handful of seconds is one down and a tight
     * assertion on it is measuring the wall clock rather than the game. */
    const calls = await coach(page, 26);
    check('the play-call card can be answered', calls >= 2, `${calls} calls`);

    const mid = await state(page);
    check('downs advance', mid && mid.plays > 0, `${mid?.plays} plays run`);
    /* THE POINT OF THE WHOLE REBUILD: he is never asked to coach a defence.
     * The card only ever comes up on his own ball, and the defensive strip is
     * what is on screen when it is not. */
    const askedOnDefence = await page.evaluate(() => {
      const g = window.gridiron?.game;
      return !!g && g.offenseOnly && g.phase === 'playcall' && g.possession !== g.humanSide
        && document.querySelector('.callcard') !== null;
    });
    check('he is never asked to call a defence', !askedOnDefence);
    check('the ball moves', mid && mid.los !== start.los,
      `${start?.los?.toFixed(1)} -> ${mid?.los?.toFixed(1)}`);
    check('the clock runs', mid && mid.clock < start.clock,
      `${start?.clock?.toFixed(0)} -> ${mid?.clock?.toFixed(0)}`);
    check('the down is legal', mid && mid.down >= 1 && mid.down <= 4, `down ${mid?.down}`);

    // The pause menu and its box score.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    check('pause opens', await page.locator('.overlay__card').count() === 1);
    await page.locator('.seg__opt', { hasText: 'Box score' }).first().click();
    await page.waitForTimeout(250);
    check('the box score renders', await page.locator('.box').count() > 0);
    await page.locator('.seg__opt', { hasText: 'Paused' }).first().click();
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
    await page.locator('button', { hasText: 'Kick off' }).first().tap();
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

    await coach(page, 20, true);
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

  /* ---------------------------------------------------- a whole franchise */
  {
    const { ctx, page } = await newPage(browser, { viewport: { width: 1280, height: 900 } });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterSport(page, 'football', { title: 'Gridiron' });

    await menu(page, 'Dynasty');
    await page.waitForTimeout(450);
    const clubLines = await page.locator('.club-line').count();
    check('the dynasty start screen lists a conference of clubs', clubLines >= 16,
      `${clubLines} clubs`);
    await page.locator('.club-line').nth(5).click();
    await page.waitForTimeout(200);
    await page.locator('button', { hasText: 'Take the job' }).first().click();
    await page.locator('.career-head').first().waitFor({ timeout: 8000 });
    check('the franchise hub opens', true);

    const save = () => page.evaluate(() => {
      const raw = localStorage.getItem('lsl.gridiron.nfl.dynasty.v1');
      if (!raw) return null;
      const f = JSON.parse(raw);
      return {
        year: f.year,
        stage: f.stage,
        step: f.offseasonStep,
        roster: f.roster.length,
        played: f.schedule.filter((x) => x.played).length,
        total: f.schedule.length,
        history: f.history.length,
        funds: f.funds,
        picks: f.picks.length,
        staff: [f.staff.HC.overall, f.staff.OC.overall, f.staff.DC.overall],
        draftClass: f.draftClass.length,
        freeAgents: f.freeAgents.length,
        cap: f.roster.reduce((n, p) => n + p.salary, 0),
      };
    });

    const opening = await save();
    check('a franchise saves', !!opening, JSON.stringify(opening));
    check('the schedule is seventeen games a club',
      opening && opening.total === 272, `${opening?.total} fixtures`);
    check('the squad is legal and under the cap',
      opening && opening.roster >= 30 && opening.cap <= 200.01,
      `${opening?.roster} players, ${opening?.cap.toFixed(1)}M`);
    check('there are four picks in hand this year',
      (opening?.picks ?? 0) >= 4, `${opening?.picks} picks`);

    /* ------------------------------------------------------------ the league */
    await page.locator('.fo-link', { hasText: 'League' }).first().click();
    await page.waitForTimeout(400);
    check('the division tables render', await page.locator('.standings tbody tr').count() >= 16,
      `${await page.locator('.standings tbody tr').count()} rows`);
    await page.locator('.seg__opt', { hasText: 'Picture' }).first().click();
    await page.waitForTimeout(250);
    check('the playoff picture renders', await page.locator('.fixture').count() >= 7,
      `${await page.locator('.fixture').count()} lines`);
    await page.locator('.seg__opt', { hasText: 'Your games' }).first().click();
    await page.waitForTimeout(250);
    check('your seventeen are listed', await page.locator('.fixture').count() >= 17,
      `${await page.locator('.fixture').count()} fixtures`);
    await page.getByRole('button', { name: 'Back' }).first().click();
    await page.waitForTimeout(300);

    /* ------------------------------------------------------------ the roster */
    await page.locator('.fo-link', { hasText: 'Roster' }).first().click();
    await page.waitForTimeout(400);
    check('the depth chart renders', await page.locator('.roster-row').count() > 24,
      `${await page.locator('.roster-row').count()} players`);
    await page.locator('.seg__opt', { hasText: 'Needs' }).first().click();
    await page.waitForTimeout(250);
    check('needs are named', await page.locator('.kv').count() >= 11,
      `${await page.locator('.kv').count()} positions`);
    await page.locator('.seg__opt', { hasText: 'Depth' }).first().click();
    await page.waitForTimeout(200);
    await page.locator('.roster-row').first().click();
    await page.waitForTimeout(300);
    check('a player page opens', await page.locator('.meter').count() >= 4,
      `${await page.locator('.meter').count()} attributes`);
    await page.getByRole('button', { name: 'Back' }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Back' }).first().click();
    await page.waitForTimeout(300);

    /* ------------------------------------------------------------- the staff */
    await page.locator('.fo-link', { hasText: 'Staff' }).first().click();
    await page.waitForTimeout(350);
    check('all three coaches are rated', await page.locator('.meter').count() >= 9,
      `${await page.locator('.meter').count()} ratings`);
    await page.getByRole('button', { name: 'Back' }).first().click();
    await page.waitForTimeout(250);

    /* -------------------------------------------------------- the trade desk */
    await page.locator('.fo-link', { hasText: 'Trade desk' }).first().click();
    await page.waitForTimeout(400);
    check('every other club can be called', await page.locator('.club-line').count() >= 31,
      `${await page.locator('.club-line').count()} clubs`);
    await page.locator('.club-line').first().click();
    await page.waitForTimeout(450);
    check('the desk opens with both sides', await page.locator('.roster-row').count() > 10,
      `${await page.locator('.roster-row').count()} rows`);
    await page.getByRole('button', { name: 'Back' }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Back' }).first().click();
    await page.waitForTimeout(300);

    await page.locator('.fo-link', { hasText: 'History' }).first().click();
    await page.waitForTimeout(350);
    await page.locator('.seg__opt', { hasText: 'The record' }).first().click();
    await page.waitForTimeout(250);
    check('the franchise record renders', await page.locator('.tile').count() >= 4,
      `${await page.locator('.tile').count()} totals`);
    await page.getByRole('button', { name: 'Back' }).first().click();
    await page.waitForTimeout(250);

    /* ------------------------------------------------------- play the season */
    await page.locator('button', { hasText: 'Simulate the rest of the season' }).first().click();
    await page.waitForTimeout(2600);
    const afterSeason = await save();
    check('the season plays out', afterSeason && afterSeason.played === afterSeason.total,
      `${afterSeason?.played}/${afterSeason?.total}`);
    check('the season is in the history', (afterSeason?.history ?? 0) === 1,
      `${afterSeason?.history} seasons`);
    check('and the offseason is open', afterSeason?.stage === 'offseason', afterSeason?.stage);

    await page.locator('.fo-link', { hasText: 'History' }).first().click();
    await page.waitForTimeout(350);
    await page.locator('.seg__opt', { hasText: 'Leaders' }).first().click();
    await page.waitForTimeout(300);
    check('career leaders are kept', await page.locator('.leader').count() >= 5,
      `${await page.locator('.leader').count()} entries`);
    await page.getByRole('button', { name: 'Back' }).first().click();
    await page.waitForTimeout(250);

    /* ---------------------------------------------------------- the offseason */
    await page.locator('button', { hasText: 'Work the offseason' }).first().click();
    await page.waitForTimeout(450);
    check('the offseason opens on the review', await page.locator('.panel').count() > 2);

    await page.locator('button', { hasText: 'On to the staff' }).first().click();
    await page.waitForTimeout(300);
    await page.locator('button', { hasText: 'On to your contracts' }).first().click();
    await page.waitForTimeout(300);
    check('contracts are shown', await page.locator('.tile').count() >= 4);
    await page.locator('button', { hasText: 'On to free agency' }).first().click();
    await page.waitForTimeout(500);
    const market = await save();
    check('a market is generated', (market?.freeAgents ?? 0) > 10,
      `${market?.freeAgents} free agents`);
    const offer = page.locator('button', { hasText: /^Offer / });
    if (await offer.count()) {
      await offer.first().click();
      await page.waitForTimeout(300);
    }
    check('an offer can be made', await offer.count() > 0, `${await offer.count()} bids available`);
    const close = page.locator('button', { hasText: /Close (this wave|the market)/ });
    for (let i = 0; i < 3 && await close.count(); i++) {
      await close.first().click();
      await page.waitForTimeout(450);
    }

    await page.locator('button', { hasText: 'On to the draft' }).first().click();
    await page.waitForTimeout(500);
    const withClass = await save();
    check('a draft class is generated', (withClass?.draftClass ?? 0) === 140,
      `${withClass?.draftClass} prospects`);
    await page.locator('button', { hasText: /the draft room/ }).first().click();
    await page.waitForTimeout(700);
    check('the draft room opens', await page.locator('.job').count() > 4,
      `${await page.locator('.job').count()} prospects listed`);
    const scoutBtn = page.locator('button', { hasText: /^Scout \(/ });
    if (await scoutBtn.count()) {
      await scoutBtn.first().click();
      await page.waitForTimeout(350);
    }
    const draftBtn = page.locator('button', { hasText: /^Draft at #/ });
    check('you go on the clock', await draftBtn.count() > 0,
      `${await draftBtn.count()} draftable`);
    if (await draftBtn.count()) {
      await draftBtn.first().click();
      await page.waitForTimeout(600);
    }
    await page.getByRole('button', { name: 'Back' }).first().click();
    await page.waitForTimeout(350);

    await page.locator('button', { hasText: 'On to the buildings' }).first().click();
    await page.waitForTimeout(300);
    await page.locator('button', { hasText: 'Open facilities' }).first().click();
    await page.waitForTimeout(400);
    const buildBtn = page.locator('button', { hasText: /^Build — / }).filter({ hasNot: page.locator('[disabled]') });
    check('facilities can be built', await page.locator('.upgrade').count() === 5,
      `${await page.locator('.upgrade').count()} buildings`);
    if (await buildBtn.count()) {
      const fundsBefore = (await save())?.funds ?? 0;
      await buildBtn.first().click();
      await page.waitForTimeout(400);
      const fundsAfter = (await save())?.funds ?? 0;
      check('building one spends the budget', fundsAfter < fundsBefore,
        `${fundsBefore} -> ${fundsAfter}`);
    }
    await page.getByRole('button', { name: 'Back' }).first().click();
    await page.waitForTimeout(250);

    await page.locator('button', { hasText: 'Ready for camp' }).first().click();
    await page.waitForTimeout(350);
    await page.locator('button', { hasText: 'Start the season' }).first().click();
    await page.waitForTimeout(1200);

    const next = await save();
    check('the next season starts', (next?.year ?? 0) === 2, `year ${next?.year}`);
    check('the squad is still viable', (next?.roster ?? 0) >= 30, `${next?.roster} players`);
    check('the new season is under the cap', (next?.cap ?? 999) <= 200.01,
      `${next?.cap?.toFixed(1)}M`);
    check('a new schedule was drawn', (next?.played ?? 1) === 0, `${next?.played} played`);

    /* --------------------------------------------- and a game you actually play */
    await page.locator('button', { hasText: /^Play$/ }).first().click();
    await page.waitForTimeout(1200);
    const live = await state(page);
    check('a franchise game starts', !!live, live ? `Q${live.quarter} ${live.phase}` : 'no game');
    const offOnly = await page.evaluate(() => !!window.gridiron?.game?.offenseOnly);
    check('and it is an offence-only game', offOnly);
    await coach(page, 14);
    const after = await state(page);
    check('plays run in a franchise game', (after?.plays ?? 0) > 0, `${after?.plays} plays`);

    await ctx.close();
  }

  /* ------------------------------- the franchise, by thumb, on a phone */
  {
    /* MOBILE FIRST IS A CLAIM THAT HAS TO BE CHECKED. A management screen is
     * where a phone layout actually breaks — tables, two-column rows, long club
     * names — and none of it is visible from a desktop viewport. So every
     * franchise screen is walked at 412 pixels wide and asked the two questions
     * that matter: does anything run off the side, and can a thumb hit it. */
    const { ctx, page } = await newPage(browser, {
      ...devices['Pixel 7'],
      hasTouch: true,
      isMobile: true,
    });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterSport(page, 'football', { title: 'Gridiron', tap: true });
    await page.locator('.menu-btn__label').filter({ hasText: 'Dynasty' }).first().tap();
    await page.waitForTimeout(500);

    const overflow = async (where) => {
      const n = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`${where}: nothing runs off the side`, n <= 1, `${n}px`);
    };
    const thumbs = async (where) => {
      const small = await page.locator('button:visible').evaluateAll((els) => els
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.height < 36;
        })
        .map((e) => `${e.className.split(' ')[0]}:${Math.round(e.getBoundingClientRect().height)}`));
      check(`${where}: every control is thumb-sized`, small.length === 0,
        small.slice(0, 4).join(', '));
    };

    await overflow('the club picker');
    await thumbs('the club picker');

    await page.locator('.club-line').nth(2).tap();
    await page.waitForTimeout(200);
    await page.locator('button', { hasText: 'Take the job' }).first().tap();
    await page.locator('.career-head').first().waitFor({ timeout: 8000 });
    await overflow('the hub');
    await thumbs('the hub');

    const visit = async (label, name) => {
      await page.locator('.fo-link', { hasText: label }).first().tap();
      await page.waitForTimeout(500);
      await overflow(name);
      await thumbs(name);
      await page.getByRole('button', { name: 'Back' }).first().tap();
      await page.waitForTimeout(300);
    };
    await visit('Roster', 'the roster');
    await visit('League', 'the league');
    await visit('Staff', 'the staff room');
    await visit('Facilities', 'facilities');
    await visit('History', 'history');

    await page.locator('.fo-link', { hasText: 'Trade desk' }).first().tap();
    await page.waitForTimeout(450);
    await page.locator('.club-line').first().tap();
    await page.waitForTimeout(500);
    await overflow('the trade desk');
    await thumbs('the trade desk');
    await page.getByRole('button', { name: 'Back' }).first().tap();
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: 'Back' }).first().tap();
    await page.waitForTimeout(300);

    // Into an offseason, which is the densest screen in the game.
    await page.locator('button', { hasText: 'Simulate the rest of the season' }).first().tap();
    await page.waitForTimeout(3200);
    await page.locator('button', { hasText: 'Work the offseason' }).first().tap();
    await page.waitForTimeout(500);
    await overflow('the offseason');
    await thumbs('the offseason');
    for (const step of ['On to the staff', 'On to your contracts', 'On to free agency']) {
      await page.locator('button', { hasText: step }).first().tap();
      await page.waitForTimeout(400);
    }
    await overflow('free agency');
    await thumbs('free agency');
    await page.locator('button', { hasText: 'On to the draft' }).first().tap();
    await page.waitForTimeout(500);
    await page.locator('button', { hasText: /the draft room/ }).first().tap();
    await page.waitForTimeout(800);
    await overflow('the draft room');
    await thumbs('the draft room');

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
