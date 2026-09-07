/**
 * Regression test for the mobile "player stuck moving in one direction" bug.
 *
 * Drives raw pointer and touch events so the nasty cases can be reproduced
 * exactly: a pointerup that never arrives, a cancelled gesture, the tab being
 * backgrounded mid-drag, and multitouch released out of order.
 *
 *   npm run build && npm run preview &
 *   node scripts/input-stress.mjs
 */
import { chromium, devices } from 'playwright';
import { chromiumPath } from './chromium.mjs';

const b = await chromium.launch({ executablePath: chromiumPath() });
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('C:' + m.text()); });

await p.goto(process.env.BASE_URL ?? 'http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await p.evaluate(() => localStorage.clear());
await p.reload({ waitUntil: 'networkidle' });
await p.getByText('Press Start').tap(); await p.waitForTimeout(350);
await p.locator('.menu-btn__label').filter({ hasText: 'Play Now' }).first().tap(); await p.waitForTimeout(350);
await p.getByRole('button', { name: 'Faceoff' }).tap(); await p.waitForTimeout(1600);

// Raw pointer/touch dispatch so we can simulate the nasty cases exactly.
await p.evaluate(() => {
  window.__pt = (type, id, x, y, extra = {}) => {
    const el = document.elementFromPoint(x, y) || document.querySelector('.game');
    const ev = new PointerEvent(type, {
      pointerId: id, pointerType: 'touch', isPrimary: true, bubbles: true,
      cancelable: type !== 'pointercancel', clientX: x, clientY: y, ...extra,
    });
    (type === 'pointerdown' ? el : window).dispatchEvent(ev);
  };
  window.__touchEnd = (remaining = 0) => {
    const t = [];
    const ev = new TouchEvent('touchend', { bubbles: true, cancelable: false, touches: t, targetTouches: t, changedTouches: t });
    window.dispatchEvent(ev);
    void remaining;
  };
  // Velocity of one specific player. Control can legitimately switch to a
  // team-mate who is already running, so a stuck-input check has to follow the
  // player it was actually driving.
  window.__vel = (uid) => {
    const p = window.loneStarLax.match.players.find((q) => q.uid === uid);
    return p ? Math.hypot(p.vx, p.vy) : -1;
  };
  window.__st = () => {
    const g = window.loneStarLax;
    const i = g.input;
    const m = g.match;
    const pl = m.controlled[m.humanSide];
    return {
      active: i.stick.active, x: +i.stick.x.toFixed(3), y: +i.stick.y.toFixed(3),
      move: i.peekMove(), vel: pl ? Math.hypot(pl.vx, pl.vy) : -1, phase: m.phase,
      uid: pl ? pl.uid : null,
    };
  };
});

const st = () => p.evaluate(() => window.__st());
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

/** Waits for live play. Between a goal and the next faceoff the simulation walks
 *  players back into position, so any velocity sampled then says nothing about
 *  whether input is stuck. Returns false if play never resumed in time. */
async function waitLive(budgetMs = 20000) {
  const until = Date.now() + budgetMs;
  while (Date.now() < until) {
    if ((await st()).phase === 'live') return true;
    await p.waitForTimeout(250);
  }
  return false;
}

/** Runs `body` during live play, retrying when the window was spoiled — a goal,
 *  a whistle, or control legitimately switching to a team-mate mid-check (`body`
 *  returns null to say so). Returns null when no clean window came up, which
 *  fails the calling check rather than quietly passing it. */
async function whileLive(body, attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    if (!await waitLive()) continue;
    const out = await body();
    if (out !== null && (await st()).phase === 'live') return out;
  }
  return null;
}

/** Watches the player we were driving for `settleMs` after their input was
 *  released, sampling until control legitimately moves on. A player who is
 *  merely shoved by a nearby body drifts and dips near zero; one whose input is
 *  stuck holds close to the speed they were driven at. Returns null when the
 *  window was too short to judge (control switched immediately, or the player
 *  came off the field). */
async function releaseProfile(uid, settleMs) {
  const driving = await p.evaluate((u) => window.__vel(u), uid);
  if (driving < 0) return null;
  const samples = [];
  const step = 150;
  for (let t = 0; t < settleMs; t += step) {
    await p.waitForTimeout(step);
    if ((await st()).uid !== uid) break;
    const v = await p.evaluate((u) => window.__vel(u), uid);
    if (v < 0) break;
    samples.push(v);
  }
  if (samples.length < 3) return null;
  const low = Math.min(...samples);
  return { driving, after: samples[samples.length - 1], low, stopped: low < Math.max(0.6, driving * 0.35) };
}

// --- 1. normal drag then release
await p.evaluate(() => { window.__pt('pointerdown', 5, 90, 420); window.__pt('pointermove', 5, 150, 380); });
await p.waitForTimeout(300);
let s = await st();
check('drag produces movement', s.active && Math.hypot(s.move.x, s.move.y) > 0.3, JSON.stringify(s.move));
await p.evaluate(() => window.__pt('pointerup', 5, 150, 380));
await p.waitForTimeout(400);
s = await st();
check('release stops movement', !s.active && s.move.x === 0 && s.move.y === 0);
const decay = await whileLive(async () => {
  await p.evaluate(() => { window.__pt('pointerdown', 5, 90, 420); window.__pt('pointermove', 5, 150, 380); });
  await p.waitForTimeout(300);
  const uid = (await st()).uid;
  const before = await p.evaluate((u) => window.__vel(u), uid);
  await p.evaluate(() => window.__pt('pointerup', 5, 150, 380));
  const prof = await releaseProfile(uid, 900);
  return prof && before > 0 ? prof : null;
});
check('player velocity decays after release', decay !== null && decay.stopped,
  decay === null ? 'play never settled' : `${decay.driving.toFixed(2)} -> ${decay.low.toFixed(2)}`);

// --- 2. rapid direction changes
await p.evaluate(async () => {
  window.__pt('pointerdown', 6, 90, 420);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    window.__pt('pointermove', 6, 90 + Math.cos(a) * 70, 420 + Math.sin(a) * 70);
    await new Promise(r => setTimeout(r, 12));
  }
});
s = await st();
check('stick follows a full circle', s.active && Math.hypot(s.move.x, s.move.y) > 0.5);
await p.evaluate(() => window.__pt('pointerup', 6, 90, 420));
await p.waitForTimeout(250);
s = await st();
check('release after circle stops movement', !s.active && s.move.x === 0);

// --- 3. THE BUG: pointerup never arrives (capture lost / OS swallowed it)
await p.evaluate(() => { window.__pt('pointerdown', 7, 90, 420); window.__pt('pointermove', 7, 160, 420); });
await p.waitForTimeout(250);
s = await st();
check('stuck-case setup: moving', s.active && s.move.x > 0.4);
await p.evaluate(() => window.__touchEnd());   // only touchend fires, no pointerup
await p.waitForTimeout(300);
s = await st();
check('touchend with no fingers left releases the stick', !s.active && s.move.x === 0);
const lost = await whileLive(async () => {
  await p.evaluate(() => { window.__pt('pointerdown', 7, 90, 420); window.__pt('pointermove', 7, 160, 420); });
  await p.waitForTimeout(250);
  const uid = (await st()).uid;
  await p.evaluate(() => window.__touchEnd());
  return releaseProfile(uid, 900);
});
check('player is not stuck running', lost !== null && lost.stopped,
  lost === null ? 'play never settled' : `${lost.driving.toFixed(2)} -> ${lost.low.toFixed(2)}`);

// --- 4. a NEW touch must work after a lost release
await p.evaluate(() => { window.__pt('pointerdown', 8, 90, 420); window.__pt('pointermove', 8, 40, 420); });
await p.waitForTimeout(250);
s = await st();
check('joystick still usable after a lost release', s.active && s.move.x < -0.4, JSON.stringify(s.move));
await p.evaluate(() => window.__pt('pointercancel', 8, 40, 420));
await p.waitForTimeout(250);
s = await st();
check('pointercancel releases the stick', !s.active && s.move.x === 0);

// --- 5. visibility change while dragging
await p.evaluate(() => { window.__pt('pointerdown', 9, 90, 420); window.__pt('pointermove', 9, 90, 500); });
await p.waitForTimeout(200);
await p.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
});
await p.waitForTimeout(250);
s = await st();
check('backgrounding the tab releases everything', !s.active && s.move.y === 0);
await p.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
});

// --- 6. multitouch: stick + buttons, released out of order.
// A goal or a whistle mid-attempt legitimately drops everything that is held
// (the replay and pause paths both call releaseAll), so the attempt is retried
// if the match left live play rather than weakening the assertion.
const mt = await whileLive(async () => {
  await p.evaluate(() => { window.__pt('pointerdown', 10, 90, 420); window.__pt('pointermove', 10, 150, 420); });
  await p.locator('.tbtn--shoot').dispatchEvent('pointerdown', { pointerId: 11, pointerType: 'touch', clientX: 300, clientY: 560, bubbles: true });
  await p.waitForTimeout(200);
  const bothHeld = await p.evaluate(() => window.loneStarLax.input.shootDown);
  await p.evaluate(() => window.__pt('pointerup', 10, 150, 420));  // lift the stick finger first
  await p.waitForTimeout(200);
  const afterStick = await st();
  const stillHeld = await p.evaluate(() => window.loneStarLax.input.shootDown);
  await p.evaluate(() => window.__pt('pointerup', 11, 300, 560));
  await p.waitForTimeout(200);
  const afterButton = await p.evaluate(() => window.loneStarLax.input.shootDown);
  return { bothHeld, afterStick, stillHeld, afterButton };
});
check('shoot button holds while the stick is active', mt !== null && mt.bothHeld === true);
check('lifting the stick does not release the button', mt !== null && !mt.afterStick.active && mt.stillHeld === true);
check('lifting the button releases it', mt !== null && mt.afterButton === false);

// --- 7. sustained play: 12s of continuous random dragging, then release
const sustained = await whileLive(async () => {
  await p.evaluate(async () => {
    window.__pt('pointerdown', 12, 90, 420);
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      const a = Math.random() * Math.PI * 2;
      window.__pt('pointermove', 12, 90 + Math.cos(a) * 60, 420 + Math.sin(a) * 60);
      await new Promise(r => setTimeout(r, 45));
    }
    window.__pt('pointerup', 12, 90, 420);
  });
  const before = await st();
  const prof = await releaseProfile(before.uid, 1000);
  if (prof === null) return null;
  return { ...(await st()), prof };
}, 3);
check('after 12s of dragging, release still stops the player',
  sustained !== null && !sustained.active && sustained.move.x === 0 && sustained.prof.stopped,
  sustained ? `${sustained.prof.driving.toFixed(2)} -> ${sustained.prof.low.toFixed(2)}` : 'play never settled');
s = sustained ?? s;

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
console.log('ERRORS:', JSON.stringify(errs.slice(0, 5)));
await b.close();
process.exit(results.every(Boolean) && errs.length === 0 ? 0 : 1);
