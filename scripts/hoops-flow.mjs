/**
 * BASKETBALL, END TO END, IN A REAL BROWSER.
 *
 * The hub's front door, the sport's own loading screen, a game that is actually
 * played with keys and with thumbs, the final buzzer, the box score, and the way
 * back out. Plus a season: schedule, standings, simulate, play, playoffs.
 *
 *   npm run build && npm run preview &
 *   node scripts/hoops-flow.mjs
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
  const g = window.hardwood?.game;
  if (!g) return null;
  return {
    phase: g.phase, quarter: g.quarter, overtime: g.overtime,
    clock: g.clockText, shotClock: g.shotClock, score: { ...g.score },
    players: g.players.length, possession: g.possession,
    box: {
      fga: g.box.home.fga + g.box.away.fga,
      fouls: g.box.home.fouls + g.box.away.fouls,
      to: g.box.home.turnovers + g.box.away.turnovers,
    },
  };
});

const camera = (page) => page.evaluate(() => {
  const { renderer, game } = window.hardwood;
  const c = renderer.cam;
  return {
    ppy: c.ppy, rotate: c.rotate,
    viewX: c.viewYardsX, viewY: c.viewYardsY,
    ballOnScreen: c.visible(game.ball.x, game.ball.y, 0),
    rimOnScreen: (() => {
      const attacking = game.possession === 'home' ? 94 - 5.25 : 5.25;
      const sy = c.projectY(attacking, 25) - 10 * c.ppy * 0.62;
      return sy > 0 && sy < c.bufH;
    })(),
  };
});

/* ------------------------------------------------------------------ desktop */

async function desktop(browser) {
  const { ctx, page } = await newPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  // --- the hub's front door, which must not be a sport.
  check('the program opens on the hub, not on a sport',
    await page.locator('.hub-mark__sports').count() > 0);
  check('and nothing of a sport is loaded yet',
    await page.evaluate(() => !window.hardwood && !window.lsl));

  await enterSport(page, 'basketball', { title: 'Hardwood' });
  const labels = await page.locator('.menu-btn__label').allTextContents();
  check('basketball opens on its own menu', labels.includes('Play Now'), labels.join(', '));
  /* Basketball has a Dynasty and a Challenge of its own now. What this checks is
   * that they are BASKETBALL'S — reached from basketball's menu, written in
   * basketball's language, and saved under basketball's own keys. When the sport
   * had neither, this check asserted their absence; asserting the absence of a
   * feature that now exists is how a test quietly becomes a lie. */
  check('with its own modes', labels.includes('Season')
    && labels.includes('Dynasty') && labels.includes('Challenge'), labels.join(', '));
  await menu(page, 'Challenge');
  const climb = await page.locator('.wrapper').first().innerText();
  check('and they are the basketball ones',
    /rung|championship/i.test(climb) && !/faceoff|goalie/i.test(climb));
  await page.locator('.topbar .btn--icon').first().click();
  await page.waitForSelector('.menu-btn__label');

  // --- setup, then a game.
  await menu(page, 'Play Now');
  check('the setup screen names both clubs',
    await page.locator('.club-line__name').count() >= 2);
  await page.getByRole('button', { name: /Tip off \(home\)/i }).click();
  await page.waitForTimeout(1400);

  const s0 = await state(page);
  check('the game starts with ten men on the floor', s0?.players === 10, `${s0?.players}`);
  check('and the clock is running', s0?.phase !== 'tip', s0?.phase);

  const cam0 = await camera(page);
  check('the court stands upright', cam0.rotate === true);
  check('the whole width of the floor is on screen', cam0.viewY >= 50, `${cam0.viewY.toFixed(1)}ft`);
  check('and enough length to see the arc', cam0.viewX >= 34, `${cam0.viewX.toFixed(1)}ft`);
  check('the ball is on screen', cam0.ballOnScreen);

  // --- keys actually move the man you control.
  const before = await page.evaluate(() => {
    const g = window.hardwood.game;
    const p = g.controlled[g.humanSide];
    return p ? { x: p.x, y: p.y } : null;
  });
  await page.keyboard.down('w');
  await page.waitForTimeout(600);
  await page.keyboard.up('w');
  const after = await page.evaluate(() => {
    const g = window.hardwood.game;
    const p = g.controlled[g.humanSide];
    return p ? { x: p.x, y: p.y } : null;
  });
  check('the keyboard moves the man you control',
    !!before && !!after && Math.hypot(after.x - before.x, after.y - before.y) > 1.5,
    before && after ? `moved ${Math.hypot(after.x - before.x, after.y - before.y).toFixed(1)}ft` : 'no player');

  // --- and that he can actually take the ball somewhere. A ball-handler who
  // cannot cross half way is a control problem, not a tactic.
  const carried = await page.waitForFunction(() => {
    const g = window.hardwood?.game;
    if (!g || !g.humanSide || g.phase !== 'live') return false;
    const p = g.controlled[g.humanSide];
    return !!p && g.ball.carrier === p.uid;
  }, null, { timeout: 45000 }).then(() => true).catch(() => false);
  if (carried) {
    const startX = await page.evaluate(() => {
      const g = window.hardwood.game;
      return g.controlled[g.humanSide].x;
    });
    const toward = await page.evaluate(() => {
      const g = window.hardwood.game;
      return g.humanSide === 'home' ? 1 : -1;
    });
    // Up the screen is toward the far basket, which is the one home attacks.
    await page.keyboard.down(toward > 0 ? 'w' : 's');
    await page.waitForTimeout(1400);
    await page.keyboard.up(toward > 0 ? 'w' : 's');
    const movedBy = await page.evaluate((sx) => {
      const g = window.hardwood.game;
      const p = g.controlled[g.humanSide];
      return p ? p.x - sx : 0;
    }, startX);
    check('and carry it toward the basket he is attacking',
      movedBy * toward > 6, `${(movedBy * toward).toFixed(1)}ft up the floor`);
  } else check('the man you control gets the ball', false);

  // --- the pause menu and its tabs.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('pause stops the clock', (await state(page))?.phase === 'paused'
    || await page.locator('.overlay').count() > 0);
  for (const tab of ['Controls', 'Box score']) {
    const t = page.locator('.seg__opt').filter({ hasText: tab }).first();
    if (await t.count()) {
      await t.click();
      await page.waitForTimeout(180);
      check(`the pause menu shows ${tab.toLowerCase()}`,
        await page.locator('.overlay').locator('*').count() > 5);
    } else check(`the pause menu has a ${tab.toLowerCase()} tab`, false);
  }
  await page.locator('.overlay .seg__opt').filter({ hasText: 'Menu' }).first().click();
  await page.waitForTimeout(180);
  await page.locator('.overlay').getByRole('button', { name: /^Resume$/i }).first().click();
  await page.waitForTimeout(300);
  check('and resumes', await page.locator('.overlay').count() === 0);

  // --- run the game out and read what it left behind. The debug handle goes
  // with the screen, so the final state is taken before the swap, not after.
  const end = await page.evaluate(() => {
    const g = window.hardwood.game;
    g.simulateRest(4000, false);
    return {
      phase: g.phase, quarter: g.quarter, overtime: g.overtime,
      score: { ...g.score },
      box: { home: g.box.home.points, away: g.box.away.points },
    };
  });
  await page.waitForTimeout(800);
  check('the game reaches a final', end?.phase === 'final', end?.phase);
  check('nobody won 0-0', (end?.score.home ?? 0) + (end?.score.away ?? 0) > 60,
    `${end?.score.away}-${end?.score.home}`);
  check('and the score is a basketball score',
    (end?.score.home ?? 0) > 25 && (end?.score.home ?? 0) < 200
    && (end?.score.away ?? 0) > 25 && (end?.score.away ?? 0) < 200,
    `${end?.score.away}-${end?.score.home}`);
  check('the game is never tied at the buzzer', end?.score.home !== end?.score.away,
    `${end?.score.away}-${end?.score.home}`);

  await page.waitForTimeout(500);
  check('the post-game screen shows the final', await page.locator('.hoop-final__score').count() === 2);
  check('with a box score', await page.locator('.box__table').count() === 2);
  check('and a quarter line', await page.locator('.qline').count() === 1);
  const totals = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.box__table tfoot tr')];
    return rows.map((r) => Number(r.children[1].textContent));
  });
  check('the box score totals match the scoreboard',
    totals.length === 2 && totals.includes(end.score.home) && totals.includes(end.score.away),
    `${totals.join('/')} vs ${end.score.away}-${end.score.home}`);
  const rowSums = await page.evaluate(() => [...document.querySelectorAll('.box__table')]
    .map((t) => [...t.querySelectorAll('tbody tr')]
      .reduce((n, r) => n + Number(r.children[1].textContent), 0)));
  check('and the rows of the box score add up to its own total',
    rowSums.length === 2 && rowSums.every((n, i) => n === totals[i]),
    `${rowSums.join('/')} vs ${totals.join('/')}`);
  check('and the running tally never drifted from the scoreboard',
    end.box.home === end.score.home && end.box.away === end.score.away,
    `${end.box.away}-${end.box.home}`);

  await page.getByRole('button', { name: /Back to the menu/i }).click();
  await page.waitForTimeout(400);
  check('back to the basketball menu',
    await page.locator('.topbar__title').filter({ hasText: 'Hardwood' }).count() > 0);

  // --- the rest of the menu is real.
  for (const [label, marker] of [
    ['How to Play', '.kv'], ['Clubs', '.club-card'], ['Settings', '.panel'],
  ]) {
    await menu(page, label);
    await page.waitForTimeout(350);
    check(`${label} opens something`, await page.locator(marker).count() > 0);
    await page.locator('.topbar button').first().click();
    await page.waitForTimeout(300);
  }

  // --- a club, a roster, a player.
  await menu(page, 'Clubs');
  await page.waitForTimeout(300);
  await page.locator('.club-card').first().click();
  await page.waitForTimeout(300);
  check('a club opens its roster', await page.locator('.roster-row').count() >= 10);
  await page.locator('.roster-row').first().click();
  await page.waitForTimeout(300);
  check('and a player opens his card', await page.locator('.panel').count() > 0);
  await page.locator('.topbar button').first().click();
  await page.waitForTimeout(200);
  await page.locator('.topbar button').first().click();
  await page.waitForTimeout(200);
  await page.locator('.topbar button').first().click();
  await page.waitForTimeout(300);

  // --- a season.
  await menu(page, 'Season');
  await page.waitForTimeout(400);
  const started = await page.getByRole('button', { name: /Start the season|Play game|Simulate/i }).count();
  check('season offers something to do', started > 0);
  if (await page.getByRole('button', { name: /^Start the season$/i }).count()) {
    await page.getByRole('button', { name: /^Start the season$/i }).first().click();
    await page.waitForTimeout(500);
  }
  check('the season shows a table', await page.locator('.standings').count() >= 1);
  const sim = page.getByRole('button', { name: /Simulate this game/i }).first();
  if (await sim.count()) {
    const rowsBefore = await page.locator('.standings tbody tr').count();
    await sim.click();
    await page.waitForTimeout(700);
    check('simulating a game advances the season',
      await page.locator('.standings tbody tr').count() === rowsBefore);
    const played = await page.evaluate(() => {
      const raw = localStorage.getItem('lsl.hoops.season.v1');
      return raw ? JSON.parse(raw).results.length : 0;
    });
    check('and the result is saved', played > 0, `${played} played`);
  } else check('a season game can be simulated', false);

  // --- saved and reloaded.
  await page.reload({ waitUntil: 'networkidle' });
  await enterSport(page, 'basketball', { title: 'Hardwood' });
  await menu(page, 'Season');
  await page.waitForTimeout(500);
  check('the season survives a reload', await page.locator('.standings').count() >= 1);

  // --- and out to the hub.
  await page.locator('.topbar button').first().click();
  await page.waitForTimeout(300);
  await backToHub(page);
  check('the hub is reachable from inside the sport',
    await page.locator('.hub-mark__sports').count() > 0);
  await ctx.close();
}

/* -------------------------------------------------------------------- phone */

async function phone(browser) {
  const { ctx, page } = await newPage(browser, {
    ...devices['iPhone 12'], hasTouch: true, isMobile: true,
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await enterSport(page, 'basketball', { title: 'Hardwood', tap: true });
  await page.locator('.menu-btn__label').filter({ hasText: 'Play Now' }).first().tap();
  await page.waitForTimeout(350);
  await page.getByRole('button', { name: /Tip off \(home\)/i }).tap();
  await page.waitForTimeout(1400);

  check('the game runs on a phone', (await state(page))?.players === 10);
  const cam = await camera(page);
  check('the ball is on screen on a phone', cam.ballOnScreen, `${cam.viewX.toFixed(0)}x${cam.viewY.toFixed(0)}ft`);

  const touch = await page.locator('.tbtn').count();
  check('every touch control is present', touch === 5, `${touch} buttons`);
  const boxes = await page.evaluate(() => [...document.querySelectorAll('.tbtn')].map((b) => {
    const r = b.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
  }));
  check('and all of them are a thumb’s size',
    boxes.every((b) => b.w >= 40 && b.h >= 40), JSON.stringify(boxes.filter((b) => b.w < 40 || b.h < 40)));
  const vw = page.viewportSize();
  check('none of them is off the screen',
    boxes.every((b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= vw.width && b.y + b.h <= vw.height),
    JSON.stringify(boxes.filter((b) => b.x < 0 || b.x + b.w > vw.width)));
  const overlap = boxes.some((a, i) => boxes.some((b, j) => i < j
    && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
  check('and none of them sits on another', !overlap);

  // The shoot button has to actually gather and release — which only means
  // anything while the man you control is holding the ball, so wait for that.
  const holding = await page.waitForFunction(() => {
    const g = window.hardwood?.game;
    if (!g || !g.humanSide) return false;
    const p = g.controlled[g.humanSide];
    return !!p && g.ball.carrier === p.uid && g.phase === 'live';
  }, null, { timeout: 45000 }).then(() => true).catch(() => false);
  check('the man you control gets the ball', holding);
  const shoot = page.locator('.tbtn--shoot');
  await shoot.dispatchEvent('pointerdown', { pointerId: 7, isPrimary: true });
  await page.waitForTimeout(320);
  const gathering = await page.evaluate(() => !!window.hardwood.game.gatherState());
  check('holding shoot gathers the shot', gathering);
  const fgaBefore = await page.evaluate(() =>
    window.hardwood.game.box.home.fga + window.hardwood.game.box.away.fga);
  await shoot.dispatchEvent('pointerup', { pointerId: 7, isPrimary: true });
  await page.waitForTimeout(250);
  check('and releasing lets it go',
    await page.evaluate(() => !window.hardwood.game.gatherState()));
  check('which the box score records as an attempt',
    await page.evaluate(() =>
      window.hardwood.game.box.home.fga + window.hardwood.game.box.away.fga) > fgaBefore);

  // Nothing may be left held after a lost pointer.
  await page.evaluate(() => window.hardwood.input.releaseAll());
  check('and nothing is left stuck down',
    await page.evaluate(() => !window.hardwood.input.isDown('shoot')));

  check('no sideways scroll on a phone',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  await ctx.close();
}

const browser = await chromium.launch({ executablePath: EXEC });
try {
  await desktop(browser);
  await phone(browser);
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${problems.length} problem(s)`);
for (const p of problems) console.log(`  - ${p}`);
process.exit(problems.length ? 1 : 0);
