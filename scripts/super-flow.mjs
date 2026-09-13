/**
 * SUPER CHALLENGE, THE WAY IT IS ACTUALLY PLAYED
 *
 * Two things this proves that nothing else can:
 *
 *   1. A coach who wants to simulate can do it without fighting the screen —
 *      the controls he presses are on the first screenful at phone size and at
 *      desktop size, every time he presses one, for a whole season.
 *   2. The rolling ten-season rule survives contact with the real career: a
 *      career driven through the actual screens is graded every season, ends
 *      only by winning three titles in a window, and never by the clock.
 *
 * The arithmetic of the window itself — every boundary case, the careers that
 * never bunch three titles, the thirty-season runs — is proved exhaustively and
 * far more cheaply by `npm run dominance` and `npm run super`. What only a
 * browser can show is that the screens actually record the seasons, which is
 * exactly what they were not doing when this file was written.
 *
 *   npm run build && npm run preview &
 *   node scripts/super-flow.mjs
 */
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';
import { execFileSync } from 'node:child_process';
import { enterSport as enterLacrosse } from './enter.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const MODE = 'superchallenge';

const results = [];
const problems = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) problems.push(name);
};

/** Super Challenge careers written by the game's own code. */
const seed = (env) => execFileSync('npm', ['run', 'seed-save', '--silent'], {
  env: { ...process.env, MODE: 'superchallenge', ...env },
  encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
}).trim();
/** Five seasons in, and twelve seasons in with nothing to show for them. */
const save = seed({ STAGE: '1', SEASONS: '5' });
const barren = seed({ STAGE: '0', SEASONS: '12' });
const key = `lsl.career.${MODE}.v${JSON.parse(save).version}`;

const browser = await chromium.launch({ executablePath: chromiumPath() });
const errors = [];

async function open(page, which = save) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(([k, v]) => { localStorage.clear(); localStorage.setItem(k, v); }, [key, which]);
  await page.reload({ waitUntil: 'networkidle' });
  await enterLacrosse(page);
  await page.locator('.menu-btn__label').filter({ hasText: 'Super Challenge' }).first().click();
  await page.waitForTimeout(420);
  const cont = page.getByRole('button', { name: /Continue the career|See how it ended/i }).first();
  if (await cont.count()) { await cont.click(); await page.waitForTimeout(800); }
  // A season that ended lands on the summary; press on to the next one.
  for (let i = 0; i < 4; i++) {
    const on = page.getByRole('button', { name: /Advance to (year|season)|Start the season/i }).first();
    if (!(await on.count())) break;
    await on.click();
    await page.waitForTimeout(700);
  }
}

/** Is the control the coach needs on the first screenful, without scrolling? */
const reach = (page, name) => page.evaluate((label) => {
  const btn = [...document.querySelectorAll('button')]
    .find((b) => (b.textContent ?? '').trim().toLowerCase() === label.toLowerCase());
  if (!btn) return { found: false };
  const r = btn.getBoundingClientRect();
  const scroller = document.querySelector('.scroll');
  return {
    found: true,
    bottom: Math.round(r.bottom),
    viewport: window.innerHeight,
    scrolled: Math.round(scroller ? scroller.scrollTop : 0),
    onScreen: r.bottom <= window.innerHeight && r.top >= 0,
  };
}, name);

for (const [device, width, height] of [['phone', 390, 844], ['desktop', 1440, 900]]) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: width < 900 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${device}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${device}: ${m.text()}`); });

  await open(page);

  // --- the objective is on screen, and it is compact
  const tracker = await page.evaluate(() => {
    const el = document.querySelector('.dom-card');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      height: Math.round(r.height),
      top: Math.round(r.top),
      onScreen: r.top < window.innerHeight,
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    };
  });
  check(`${device}: the dominance tracker is on the hub`, !!tracker, tracker?.text ?? 'missing');
  check(`${device}: it is visible without scrolling`, !!tracker?.onScreen, `top ${tracker?.top}px`);
  check(`${device}: it is compact`, (tracker?.height ?? 999) <= 150, `${tracker?.height}px tall`);
  check(`${device}: it states the window and the count`,
    /\d\/3/.test(tracker?.text ?? '') && /Seasons \d+/.test(tracker?.text ?? ''),
    tracker?.text ?? '');

  // --- the controls are reachable, and STAY reachable
  const first = await reach(page, 'Simulate this game');
  check(`${device}: the simulate button is on the first screenful`, first.onScreen,
    `bottom ${first.bottom} of ${first.viewport}`);
  const playBtn = await reach(page, 'Play game');
  check(`${device}: so is the play button`, playBtn.onScreen,
    `bottom ${playBtn.bottom} of ${playBtn.viewport}`);
  const seasonBtn = await reach(page, 'Simulate the season');
  check(`${device}: and the simulate-the-season button`, seasonBtn.onScreen,
    `bottom ${seasonBtn.bottom} of ${seasonBtn.viewport}`);

  // Press it repeatedly: every press must land without scrolling, which is the
  // whole complaint this layout exists to answer.
  let worst = 0;
  let presses = 0;
  for (let i = 0; i < 8; i++) {
    const sim = page.getByRole('button', { name: /^Simulate this game$/ }).first();
    if (!(await sim.count())) break;
    const before = await reach(page, 'Simulate this game');
    if (!before.onScreen) worst++;
    await sim.click();
    await page.waitForTimeout(420);
    presses++;
  }
  check(`${device}: simulating never needs a scroll`, worst === 0 && presses > 0,
    `${presses} games simulated, ${worst} out of reach`);

  await ctx.close();
}

/* ------------------------------------------- the rule itself, in the browser */

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`rule: ${e.message}`));
  await open(page);

  // Simulate whole seasons until the career is well past ten, then confirm it
  // is still going and the window has rolled.
  // Four or five screens go by per season, so this is roughly twenty seasons.
  // The list is ordered: simulate when there is something to simulate, then
  // whatever screen the season has landed on — the summary, the offseason, a
  // championship, a job list, or a year out of the game when nobody calls.
  const STEPS = [
    /^Simulate the season$/,
    /Advance to (year|season)|Start the season|Continue to the (playoffs|season)|^Continue$/i,
    /jobs? on the table|^Find a job$/i,
    /^Take the .* job$/i,
    /take a year out of the game/i,
  ];
  let guard = 0;
  while (guard++ < 90) {
    let moved = false;
    for (const re of STEPS) {
      const btn = page.getByRole('button', { name: re }).first();
      if (!(await btn.count())) continue;
      await btn.click().catch(() => {});
      await page.waitForTimeout(620);
      moved = true;
      break;
    }
    if (!moved) break;
  }

  const state = await page.evaluate((k) => {
    const c = JSON.parse(localStorage.getItem(k) ?? 'null');
    if (!c) return null;
    return {
      seasons: c.challenge?.steps?.length ?? 0,
      complete: !!c.challenge?.complete,
      ended: c.challenge?.endedReason ?? '',
      titles: (c.challenge?.steps ?? []).filter((s) => s.champion).length,
    };
  }, key);

  // A Super Challenge career ends exactly one way — three championships inside
  // a ten-season window — and never because seasons went by. Which of the two
  // outcomes this run reaches depends on how the coach did, so both are checked
  // for what they must be rather than assumed.
  check('the career kept going past the seeded seasons', (state?.seasons ?? 0) > 5,
    `${state?.seasons} seasons, ${state?.titles} titles`);
  if (state?.complete) {
    check('a completed Super Challenge was completed by winning',
      /championship/i.test(state.ended ?? ''), state.ended);
    check('and it took three titles to do it', (state.titles ?? 0) >= 3, `${state.titles} titles`);
  } else {
    check('an unfinished career is still being coached', (state?.seasons ?? 0) >= 11,
      `${state?.seasons} seasons and still going`);
    check('and nothing in it reads as a failure',
      !/fail|over|out of time/i.test(state?.ended ?? ''), state?.ended || 'no ending');
  }

  const dom = await page.evaluate(() => {
    const el = document.querySelector('.dom-card');
    return el ? (el.textContent ?? '').replace(/\s+/g, ' ').trim() : '';
  });
  if (dom) {
    const m = dom.match(/Seasons (\d+)[–-](\d+)/);
    check('the window has rolled forward with the career', !!m && Number(m[1]) > 1,
      dom);
  } else {
    // The hub is only on screen between seasons; the save-level check above is
    // the one that matters, so this is reported rather than failed.
    console.log('note  the tracker was not on screen at the end of the run');
  }
  await ctx.close();
}

/* ------------------------- twelve seasons, no titles, and no way to fail out */

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`barren: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`barren: ${m.text()}`); });
  await open(page, barren);

  const long = await page.evaluate((k) => {
    const c = JSON.parse(localStorage.getItem(k) ?? 'null');
    const el = document.querySelector('.dom-card');
    return {
      seasons: c?.challenge?.steps?.length ?? 0,
      titles: (c?.challenge?.steps ?? []).filter((s) => s.champion).length,
      complete: !!c?.challenge?.complete,
      ended: c?.challenge?.endedReason ?? '',
      card: el ? (el.textContent ?? '').replace(/\s+/g, ' ').trim() : '',
    };
  }, key);

  check('a twelve-season career with no titles is still being coached',
    long.seasons >= 12 && !long.complete, `${long.seasons} seasons, ${long.titles} titles`);
  check('nothing about it reads as a failure', !/fail|over|out of time/i.test(long.ended),
    long.ended || 'no ending');
  check('the window has rolled past the first ten seasons',
    /Seasons (\d+)[–-](\d+)/.test(long.card)
    && Number(long.card.match(/Seasons (\d+)[–-](\d+)/)[1]) > 1,
    long.card || 'no tracker on screen');
  check('and the tracker says so in words',
    /not yet|short|no championships|0\/3/i.test(long.card), long.card);

  await ctx.close();
}

console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
if (problems.length) console.log(`\nFailed: ${problems.join(', ')}`);
console.log(errors.length ? `\nConsole errors:\n  ${errors.join('\n  ')}` : '\nNo console errors.');
await browser.close();
process.exit(problems.length || errors.length ? 1 : 0);
