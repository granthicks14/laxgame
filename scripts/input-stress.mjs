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
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
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
  window.__st = () => {
    const g = window.loneStarLax;
    const i = g.input;
    const m = g.match;
    const pl = m.controlled[m.humanSide];
    return {
      active: i.stick.active, x: +i.stick.x.toFixed(3), y: +i.stick.y.toFixed(3),
      move: i.peekMove(), vel: pl ? Math.hypot(pl.vx, pl.vy) : -1,
    };
  };
});

const st = () => p.evaluate(() => window.__st());
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// --- 1. normal drag then release
await p.evaluate(() => { window.__pt('pointerdown', 5, 90, 420); window.__pt('pointermove', 5, 150, 380); });
await p.waitForTimeout(300);
let s = await st();
check('drag produces movement', s.active && Math.hypot(s.move.x, s.move.y) > 0.3, JSON.stringify(s.move));
await p.evaluate(() => window.__pt('pointerup', 5, 150, 380));
await p.waitForTimeout(400);
s = await st();
check('release stops movement', !s.active && s.move.x === 0 && s.move.y === 0);
await p.waitForTimeout(900);
s = await st();
check('player velocity decays after release', s.vel < 0.6, `v=${s.vel.toFixed(2)}`);

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
await p.waitForTimeout(900);
s = await st();
check('player is not stuck running', s.vel < 0.6, `v=${s.vel.toFixed(2)}`);

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

// --- 6. multitouch: stick + buttons, released out of order
await p.evaluate(() => { window.__pt('pointerdown', 10, 90, 420); window.__pt('pointermove', 10, 150, 420); });
await p.locator('.tbtn--shoot').dispatchEvent('pointerdown', { pointerId: 11, pointerType: 'touch', clientX: 300, clientY: 560, bubbles: true });
await p.waitForTimeout(200);
let held = await p.evaluate(() => window.loneStarLax.input.shootDown);
check('shoot button holds while the stick is active', held === true);
await p.evaluate(() => window.__pt('pointerup', 10, 150, 420));  // lift the stick finger first
await p.waitForTimeout(200);
s = await st();
held = await p.evaluate(() => window.loneStarLax.input.shootDown);
check('lifting the stick does not release the button', !s.active && held === true);
await p.evaluate(() => window.__pt('pointerup', 11, 300, 560));
await p.waitForTimeout(200);
held = await p.evaluate(() => window.loneStarLax.input.shootDown);
check('lifting the button releases it', held === false);

// --- 7. sustained play: 20s of continuous random dragging, then release
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
await p.waitForTimeout(1200);
s = await st();
check('after 12s of dragging, release still stops the player', !s.active && s.move.x === 0 && s.vel < 0.6,
  `v=${s.vel.toFixed(2)}`);

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
console.log('ERRORS:', JSON.stringify(errs.slice(0, 5)));
await b.close();
process.exit(results.every(Boolean) && errs.length === 0 ? 0 : 1);
