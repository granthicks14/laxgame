/**
 * Feature audit: walks every screen, clicks every control, and reports
 * anything that errors, does nothing, or leads nowhere.
 *
 *   npm run build && npm run preview &
 *   node scripts/audit.mjs
 */
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const EXEC = chromiumPath();

const errors = [];
const dead = [];
const visited = [];

const browser = await chromium.launch({ executablePath: EXEC });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

/** A cheap signature of what is on screen, used to tell whether a click did anything. */
const signature = () => page.evaluate(() => {
  const el = document.querySelector('.screen, .game');
  if (!el) return 'none';
  const title = document.querySelector('.topbar__title')?.textContent ?? '';
  const buttons = [...document.querySelectorAll('button')].map((b) => b.textContent?.trim()).join('|');
  // Which option is selected in each segmented control, BY INDEX. Text alone is
  // ambiguous once two controls on a screen both offer "On" and "Off".
  const on = [...document.querySelectorAll('.seg')]
    .map((g) => [...g.children].findIndex((c) => c.classList.contains('is-on')))
    .join(',')
    + '::' + [...document.querySelectorAll('.is-selected, .is-listening')].map((b) => b.textContent?.trim()).join('|');
  // Hash the whole button text rather than a prefix: a change far down a long
  // screen (the keybind list, say) is still a change.
  let hash = 2166136261;
  for (let i = 0; i < buttons.length; i++) {
    hash ^= buttons.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // Text length catches a change the button list alone cannot see: two toggles
  // whose options are both "On"/"Off" produce an identical `on` string.
  const textLen = (el.textContent ?? '').length;
  return `${el.className}::${title}::${buttons.length}::${hash >>> 0}::${on}::${textLen}`;
});

const settle = (ms = 380) => page.waitForTimeout(ms);

async function boot() {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Press Start').click();
  await settle();
}

async function backToMenu() {
  for (let i = 0; i < 8; i++) {
    if (await page.locator('.menu-btn').count()) return true;
    const back = page.locator('.topbar button').first();
    if (await back.count()) { await back.click(); await settle(300); continue; }
    // In a game: pause and quit.
    if (await page.locator('.game').count()) {
      await page.keyboard.press('Escape'); await settle(300);
      const q = page.getByRole('button', { name: /Quit game/i });
      if (await q.count()) { await q.click(); await settle(400); continue; }
    }
    const home = page.getByRole('button', { name: /Main menu|Back to menu/i });
    if (await home.count()) { await home.first().click(); await settle(400); continue; }
    return false;
  }
  return await page.locator('.menu-btn').count() > 0;
}

/** Clicks every control on the current screen and reports the ones that do nothing. */
async function sweep(label, skip = /Quit game|Delete|Start a new|Run it back|Finish and clear/i) {
  visited.push(label);
  const before = await signature();
  const n = await page.locator('.screen button:visible').count();
  for (let i = 0; i < n; i++) {
    const btn = page.locator('.screen button:visible').nth(i);
    if (!(await btn.count())) break;
    const text = ((await btn.textContent()) ?? '').trim();
    if (!text || skip.test(text)) continue;
    const isDisabled = await btn.isDisabled().catch(() => true);
    if (isDisabled) continue;
    // Re-selecting the option that is already active is correctly a no-op.
    const cls = (await btn.getAttribute('class')) ?? '';
    const alreadyOn = cls.includes('is-on');

    const sigBefore = await signature();
    await btn.click({ timeout: 4000 }).catch(() => {});
    await settle(320);
    const sigAfter = await signature();
    // Selecting an option that is now active is a real outcome even when the
    // rest of the screen does not move — a settings toggle that was already in
    // that position is not a dead control.
    const nowOn = ((await btn.getAttribute('class').catch(() => '')) ?? '').includes('is-on');
    if (sigBefore === sigAfter && !alreadyOn && !nowOn) dead.push(`${label} → "${text}"`);

    // If the click navigated away, step back so the rest of this screen's
    // controls still get swept.
    const titleNow = sigAfter.split('::')[1];
    const titleWas = before.split('::')[1];
    if (titleNow !== titleWas) {
      const back = page.locator('.topbar button').first();
      if (await back.count()) { await back.click().catch(() => {}); await settle(340); }
    }
  }
}

await boot();

// ---- main menu
await sweep('Main menu');
await backToMenu();

const routes = [
  ['Play Now', async () => { await sweep('Play Now'); }],
  ['Practice', async () => { await sweep('Practice'); }],
  ['Teams', async () => {
    await sweep('Teams');
    const card = page.locator('.team-card').first();
    if (await card.count()) { await card.click(); await settle(400); await sweep('Team detail'); }
  }],
  ['Records', async () => { await sweep('Records'); }],
  ['How to Play', async () => { await sweep('How to Play', /Start the walkthrough|Quit game/i); }],
  ['Settings', async () => { await sweep('Settings'); }],
  ['Season', async () => { await sweep('Season entry'); }],
  ['Dynasty', async () => { await sweep('Dynasty entry'); }],
  ['Challenge', async () => { await sweep('Challenge entry', /Take the job|Abandon/i); }],
];

for (const [label, fn] of routes) {
  if (!(await backToMenu())) { errors.push(`could not get back to the menu before ${label}`); break; }
  const item = page.locator('.menu-btn__label').filter({ hasText: label }).first();
  if (!(await item.count())) { errors.push(`menu item missing: ${label}`); continue; }
  await item.click();
  await settle();
  await fn();
}

// ---- a live career: hub, team, player, schedule, standings.
// Dynasty, not Season: transfers, recruiting and the offseason belong to the
// career engine, and a one-off Season save correctly does not carry them.
await backToMenu();
await page.locator('.menu-btn__label').filter({ hasText: 'Dynasty' }).first().click();
await settle();
const start = page.getByRole('button', { name: /Take this job|Start dynasty/i });
if (await start.count()) { await start.click(); await settle(600); }
await sweep('Career hub', /Play game|Simulate this game|Quit game|Start a new|Continue/i);

// Sweeping may have wandered; make sure we are back on the hub.
await backToMenu();
await page.locator('.menu-btn__label').filter({ hasText: 'Dynasty' }).first().click();
await settle();
const cont = page.getByRole('button', { name: /^Continue$/i });
if (await cont.count()) { await cont.click(); await settle(500); }

/** Navigates back to the career hub from wherever we ended up. */
async function toHub() {
  // ALWAYS from a hard reload. Sweeping clicks every control on a screen,
  // including back arrows and empty-state buttons, so by the end of one the app
  // can be anywhere — and "is there a Play game button?" is true on the one-off
  // Season hub too, which is how a whole career sweep once ran against the
  // wrong save.
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const ps = page.getByText('Press Start');
  if (await ps.count()) { await ps.click().catch(() => {}); await settle(400); }
  const item = page.locator('.menu-btn__label').filter({ hasText: 'Dynasty' }).first();
  if (!(await item.count())) return false;
  await item.click().catch(() => {});
  await settle(450);
  const cont = page.getByRole('button', { name: /^Continue$/i }).first();
  if (await cont.count()) { await cont.click().catch(() => {}); await settle(700); }
  else {
    const start = page.getByRole('button', { name: /Take this job|Start dynasty/i }).first();
    if (await start.count()) { await start.click().catch(() => {}); await settle(800); }
  }
  return (await page.getByRole('button', { name: /^Play game$/i }).count()) > 0
    && (await page.locator('button.btn', { hasText: 'Recruiting board' }).count()) > 0;
}

/**
 * Navigates to the career hub and opens one of its buttons in a single step.
 * Doing the lookup inside the navigation retry is the only reliable way: the
 * hub the previous sweep left behind is not necessarily the one we want.
 */
async function openFromHub(name) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await toHub())) continue;
    const b = page.locator('button.btn', { hasText: name }).first();
    if (!(await b.count())) continue;
    await b.click().catch(() => {});
    await settle(450);
    return true;
  }
  return false;
}

for (const [name, label] of [
  ['Team', 'Team screen'], ['Schedule', 'Schedule'], ['Standings', 'Standings'],
  ['Statistics', 'Statistics'], ['Staff', "Coach's office"],
  ['Player movement', 'Transfer window'], ['Recruiting board', 'Recruiting board'],
]) {
  if (await openFromHub(name)) {
    if (name === 'Recruiting board') {
      // The prospect page and the scout market are both a click deeper. Do them
      // before sweeping the board itself, because sweeping clicks the back
      // arrow and wanders off the screen.
      const openBoard = async () => {
        if (await page.locator('.list__row').count()) return true;
        // Sweeping clicks the back arrow too, so we may be anywhere. Getting
        // home can fail outright — that is not an audit failure, just the end
        // of what this branch can reach.
        try { await toHub(); } catch { return false; }
        const again = page.locator('button.btn', { hasText: 'Recruiting board' }).first();
        if (await again.count()) { await again.click().catch(() => {}); await settle(420); }
        return await page.locator('.list__row').count() > 0;
      };
      if (await openBoard()) {
        await page.locator('.list__row').first().click();
        await settle(400);
        await sweep('Prospect report', /Offer him a place|Draft him|Sign as an undrafted/i);
      }
      if (await openBoard()) {
        const market = page.getByRole('button', { name: /Scout market/i }).first();
        if (await market.count()) {
          await market.click(); await settle(400);
          await sweep('Scout market', /^\d+ CP$/);
        }
      }
      await openBoard();
    }
    await sweep(label, /Quit game|Delete|Start a new|Run it back|Finish and clear|Needs \d+ CP|Nothing more to say|No pitches left/i);
    if (name === 'Staff') {
      // Buying staff is a spend, not a no-op; the sweep skips it because a
      // programme with no points cannot upgrade anything.
    }
    if (name === 'Team') {
      const row = page.locator('table tbody tr').first();
      if (await row.count()) { await row.click(); await settle(400); await sweep('Player screen'); const bk = page.locator('.topbar button').first(); if (await bk.count()) { await bk.click(); await settle(320); } }
    }
    const back = page.locator('.topbar button').first();
    if (await back.count()) { await back.click(); await settle(320); }
  } else {
    errors.push(`career hub is missing the ${name} button`);
  }
}

console.log(`screens swept: ${visited.length}`);
console.log(visited.map((v) => `  - ${v}`).join('\n'));
console.log(`\ncontrols that produced no visible change: ${dead.length}`);
for (const d of dead) console.log('  -', d);
console.log(`\nerrors: ${errors.length}`);
for (const e of errors.slice(0, 20)) console.log('  -', e);
await browser.close();
process.exit(errors.length === 0 ? 0 : 1);
