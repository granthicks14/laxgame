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

  // --- the goal replay, in the browser it actually runs in
  // A clip needs footage, so the faceoff has to be clamped and the ball has to
  // be live for a couple of seconds first. The goal itself is forced: waiting
  // for the AI to score costs a minute of wall clock, and what is under test is
  // the presentation, not the shooting.
  async function forceGoal() {
    for (let i = 0; i < 6; i++) {
      const phase = await page.evaluate(() => window.loneStarLax.match.phase);
      if (phase === 'live') break;
      await page.keyboard.press('Space');
      await page.waitForTimeout(450);
    }
    const footage = await page.evaluate(async () => {
      const m = window.loneStarLax.match;
      const t0 = Date.now();
      while ((m.phase !== 'live' || m.replay.seconds < 2.2) && Date.now() - t0 < 20000) {
        await new Promise((r) => setTimeout(r, 150));
      }
      return m.replay.seconds;
    });
    await page.evaluate(() => {
      const m = window.loneStarLax.match;
      m.ball.lastCarrier = m.teams.home.find((p) => p.slot === 'A1');
      m.scoreGoal('home');
    });
    // The celebration runs for two seconds before the clip starts.
    await page.waitForTimeout(2500);
    return footage;
  }

  const footage = await forceGoal();
  const replay = await page.evaluate(() => {
    const m = window.loneStarLax.match;
    const tag = document.querySelector('.replay-tag__angle');
    const card = document.querySelector('.goalcard__scorer');
    return {
      phase: m.phase,
      angle: m.replayAngle,
      label: tag ? tag.textContent : '',
      letterboxed: !!document.querySelector('.replay-fx.is-on'),
      skippable: !!document.querySelector('.replay-skip.is-on'),
      scorer: card ? card.textContent : '',
      duration: m.replayDuration,
    };
  });
  check('a goal rolls into a replay', replay.phase === 'replay',
    `${replay.phase}, ${footage.toFixed(1)}s of footage`);
  check('the replay names its camera angle', !!replay.angle && replay.label.length > 0,
    `${replay.angle} / "${replay.label}"`);
  check('the replay is letterboxed and skippable', replay.letterboxed && replay.skippable);
  check('the scorer is named over the replay', replay.scorer.length > 0, replay.scorer);
  check('the camera is cropped in for the clip', await page.evaluate(() => {
    const m = window.loneStarLax.match;
    const c = window.loneStarLax.renderer;
    return m.phase === 'replay' && c.cam.ppy > 0;
  }));

  await page.getByRole('button', { name: /Skip/i }).click();
  await page.waitForTimeout(400);
  const afterSkip = await page.evaluate(() => window.loneStarLax.match.phase);
  check('the skip button ends the replay', afterSkip !== 'replay', afterSkip);

  // Two goals running must not be framed the same way.
  await forceGoal();
  const second = await page.evaluate(() => window.loneStarLax.match.replayAngle);
  check('consecutive replays use different cameras', !!second && second !== replay.angle,
    `${replay.angle} -> ${second}`);
  await page.evaluate(() => window.loneStarLax.match.skipReplay());
  await page.waitForTimeout(300);

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

  for (let i = 0; i < 40; i++) {
    if (!(await advanceSeason(page, 320))) break;
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

/**
 * One step through a season: the next game, or the postseason screen standing
 * between the coach and it (qualifying is shown once, and the bracket opens
 * itself the moment the playoffs are drawn).
 */
async function advanceSeason(page, wait) {
  for (const re of [/^Simulate this game$/i, /^Continue to the (playoffs|season)$/i]) {
    const b = page.getByRole('button', { name: re }).first();
    if (await b.count()) {
      await b.click().catch(() => {});
      await page.waitForTimeout(wait);
      return true;
    }
  }
  // A title gets its own screen on the way to the summary.
  if (await page.locator('.champ').count()) {
    await page.getByRole('button', { name: /^Continue$/i }).first().click().catch(() => {});
    await page.waitForTimeout(wait);
    return true;
  }
  return false;
}

async function dynasty(browser) {
  const { ctx, page } = await newPage(browser, { viewport: { width: 1280, height: 900 } });
  await boot(page);
  await menu(page, 'Dynasty');
  await page.waitForTimeout(340);
  await page.getByRole('button', { name: /Start dynasty/i }).click();
  await page.waitForTimeout(500);
  for (let i = 0; i < 40; i++) {
    if (!(await advanceSeason(page, 300))) break;
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
      // A player anticipates the marker; a polling loop cannot, so lead the
      // press by roughly one round trip. Without this the check measures the
      // harness's latency rather than whether the drill can be won.
      const mid = (s.z0 + s.z1) / 2;
      const lead = 0.03;
      const predicted = s.marker + lead;
      if (predicted >= mid - (s.z1 - s.z0) / 6 && predicted <= mid + (s.z1 - s.z0) / 6) {
        await page.keyboard.press('Space');
      }
    }
    await page.waitForTimeout(6);
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
      info.touch && info.buttons === 5 && !info.overflow,
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
