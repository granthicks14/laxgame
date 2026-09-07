/**
 * End-to-end smoke test for Lone Star Lax.
 *
 * Playwright is deliberately NOT a dependency of this project — the game itself
 * needs nothing but Vite. To run this suite:
 *
 *   npm i -D playwright && npx playwright install chromium
 *   npm run build && npm run preview &
 *   node scripts/e2e.mjs
 *
 * Set BASE_URL to test a deployed build instead of the local preview.
 */
import { chromium, devices } from 'playwright';
import { chromiumPath } from './chromium.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const EXEC = chromiumPath();

const problems = [];
const results = [];
let step = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) problems.push(`${name}${detail ? ` — ${detail}` : ''}`);
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
const back = async (page) => {
  const b = page.locator('.topbar button').first();
  if (await b.count()) { await b.click(); await page.waitForTimeout(300); }
};

async function boot(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Press Start').click();
  await page.waitForTimeout(350);
}

async function desktop(browser) {
  const { ctx, page } = await newPage(browser, { viewport: { width: 1440, height: 900 } });
  await boot(page);
  check('title screen boots into the main menu', await page.locator('.menu-btn').count() >= 6);

  // --- quick game
  await menu(page, 'Play Now');
  await page.waitForTimeout(320);
  await page.getByRole('button', { name: 'Faceoff' }).click();
  await page.waitForTimeout(1600);
  const live = await page.evaluate(() => {
    const g = window.loneStarLax;
    const c = document.querySelector('canvas');
    return g ? { phase: g.match.phase, players: g.match.players.length, w: c.width, h: c.height } : null;
  });
  check('quick game starts and renders', !!live && live.players === 20 && live.w > 400,
    live ? `${live.w}x${live.h}, phase ${live.phase}` : 'no match');

  // clamp the faceoff, then run around
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(700); }
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyD');
  const moved = await page.evaluate(() => {
    const m = window.loneStarLax?.match;
    if (!m) return null;
    const p = m.controlled[m.humanSide];
    return { clock: m.clock, x: p ? p.x : null };
  });
  check('clock runs and the controlled player moves', !!moved && moved.clock < 120 && moved.x !== null);

  // pause, resume, quit
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('pause menu opens', await page.getByRole('button', { name: /^Resume$/i }).count() === 1);
  await page.getByRole('button', { name: /Quit game/i }).click();
  await page.waitForTimeout(500);
  check('quitting returns to the setup screen', await page.locator('.topbar').count() === 1);
  await back(page);

  // --- season: create, sim to the title, check the summary
  await menu(page, 'Season');
  await page.waitForTimeout(340);
  await page.getByRole('button', { name: /Start season/i }).click();
  await page.waitForTimeout(500);
  check('season hub shows a next game', await page.getByRole('button', { name: /^Play game$/i }).count() === 1);

  for (let i = 0; i < 20; i++) {
    const sim = page.getByRole('button', { name: /Simulate this game/i });
    if (!(await sim.count())) break;
    await sim.click();
    await page.waitForTimeout(320);
  }
  const summary = await page.locator('.scroll').innerText();
  check('season reaches a conclusion', /CHAMPIONS|Lost in|Missed the playoffs|Lost the championship/i.test(summary),
    summary.split('\n')[1] ?? '');

  const saved = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes('career.season'));
    const c = JSON.parse(localStorage.getItem(k));
    return {
      games: c.schedule.length,
      played: c.schedule.filter((g) => g.played).length,
      playoffs: c.schedule.filter((g) => g.playoff).length,
      seeds: (c.playoffSeeds || []).length,
      ties: Object.values(c.standings).reduce((n, r) => n + r.ties, 0),
    };
  });
  check('every game was played', saved.played === saved.games, `${saved.played}/${saved.games}`);
  // A single-elimination bracket of N seeds is exactly N-1 games.
  check('a complete playoff bracket was generated',
    saved.seeds >= 4 && saved.playoffs === saved.seeds - 1,
    `${saved.seeds} seeds, ${saved.playoffs} games`);
  check('no game ended level', saved.ties === 0);

  await ctx.close();
}

async function dynasty(browser) {
  const { ctx, page } = await newPage(browser, { viewport: { width: 1280, height: 900 } });
  await boot(page);
  await menu(page, 'Dynasty');
  await page.waitForTimeout(340);
  await page.getByRole('button', { name: /Start dynasty/i }).click();
  await page.waitForTimeout(500);
  for (let i = 0; i < 20; i++) {
    const sim = page.getByRole('button', { name: /Simulate this game/i });
    if (!(await sim.count())) break;
    await sim.click();
    await page.waitForTimeout(300);
  }
  await page.getByRole('button', { name: /Advance to year 2/i }).click();
  await page.waitForTimeout(700);
  const off = await page.locator('.scroll').innerText();
  check('offseason reports graduation and recruiting',
    /GRADUATING/i.test(off) && /ARRIVALS/i.test(off));
  await page.getByRole('button', { name: /Start the season/i }).click();
  await page.waitForTimeout(500);

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Press Start').click();
  await page.waitForTimeout(400);
  const menuText = await page.locator('.scroll').innerText();
  check('dynasty save survives a reload', /Year 2/.test(menuText), menuText.match(/Year \d+/)?.[0] ?? '');
  await ctx.close();
}

async function practice(browser) {
  const { ctx, page } = await newPage(browser, { viewport: { width: 1280, height: 800 } });
  await boot(page);
  await menu(page, 'Practice');
  await page.waitForTimeout(340);
  const drills = await page.locator('.team-card__name').allTextContents();
  check('all five drills are listed', drills.length === 6, drills.slice(1).join(', '));

  await page.getByText('Faceoff Reps').first().click();
  await page.waitForTimeout(1200);
  // Clamp inside the window every time by reading the live meter.
  const t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    const s = await page.evaluate(() => {
      const g = window.loneStarLax;
      if (!g) return null;
      const m = g.match;
      if (m.isFinal()) return { done: true, reps: m.practice.reps, ok: m.practice.success };
      const fo = m.faceoff;
      return fo ? { stage: fo.stage, marker: fo.marker, z0: fo.zoneStart, z1: fo.zoneEnd } : {};
    });
    if (!s) break;
    if (s.done) {
      check('faceoff drill runs its reps and can be won',
        s.reps === 10 && s.ok >= 3, `${s.ok}/${s.reps} clamps won`);
      break;
    }
    if (s.stage === 'sweep') {
      const mid = (s.z0 + s.z1) / 2;
      if (Math.abs(s.marker - mid) < (s.z1 - s.z0) / 3) await page.keyboard.press('Space');
    }
    await page.waitForTimeout(14);
  }
  await ctx.close();
}

async function mobile(browser) {
  for (const [name, dev] of [['iPhone 13', devices['iPhone 13']], ['iPad', devices['iPad (gen 7)']]]) {
    const { ctx, page } = await newPage(browser, { ...dev });
    await boot(page);
    await menu(page, 'Play Now');
    await page.waitForTimeout(340);
    await page.getByRole('button', { name: 'Faceoff' }).tap();
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => ({
      touch: !document.querySelector('.touch').classList.contains('is-off'),
      buttons: document.querySelectorAll('.tbtn').length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      rotated: window.loneStarLax?.renderer.cam.rotate,
    }));
    check(`${name}: touch controls active, no horizontal overflow`,
      info.touch && info.buttons === 4 && !info.overflow,
      `rotated camera: ${info.rotated}`);
    await ctx.close();
  }
}

async function perf(browser) {
  const { ctx, page } = await newPage(browser, { viewport: { width: 1440, height: 900 } });
  await boot(page);
  await menu(page, 'Play Now');
  await page.waitForTimeout(340);
  await page.getByRole('button', { name: 'Faceoff' }).click();
  await page.waitForTimeout(2500);
  const fps = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = (t) => {
      frames++;
      if (t - start < 4000) requestAnimationFrame(tick);
      else resolve(frames / ((t - start) / 1000));
    };
    requestAnimationFrame(tick);
  }));
  check('holds a smooth frame rate', fps > 50, `${fps.toFixed(1)} fps`);
  await ctx.close();
}

const browser = await chromium.launch({ executablePath: EXEC });
try {
  for (const suite of [desktop, dynasty, practice, mobile, perf]) {
    step++;
    await suite(browser);
  }
} finally {
  await browser.close();
}

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
if (problems.length) {
  console.log('\nProblems:');
  for (const p of problems) console.log(' -', p);
  process.exit(1);
}
console.log('No console errors, no page errors.');
