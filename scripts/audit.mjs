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
  const on = [...document.querySelectorAll('.is-on, .is-selected, .is-listening')].map((b) => b.textContent?.trim()).join('|');
  // Hash the whole button text rather than a prefix: a change far down a long
  // screen (the keybind list, say) is still a change.
  let hash = 2166136261;
  for (let i = 0; i < buttons.length; i++) {
    hash ^= buttons.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${el.className}::${title}::${buttons.length}::${hash >>> 0}::${on}`;
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
    if (sigBefore === sigAfter && !alreadyOn) dead.push(`${label} → "${text}"`);

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
];

for (const [label, fn] of routes) {
  if (!(await backToMenu())) { errors.push(`could not get back to the menu before ${label}`); break; }
  const item = page.locator('.menu-btn__label').filter({ hasText: label }).first();
  if (!(await item.count())) { errors.push(`menu item missing: ${label}`); continue; }
  await item.click();
  await settle();
  await fn();
}

// ---- a live career: hub, team, player, schedule, standings
await backToMenu();
await page.locator('.menu-btn__label').filter({ hasText: 'Season' }).first().click();
await settle();
const start = page.getByRole('button', { name: /Start season/i });
if (await start.count()) { await start.click(); await settle(500); }
await sweep('Season hub', /Play game|Simulate this game|Quit game|Start a new career|Continue/i);

// Sweeping may have wandered; make sure we are back on the hub.
await backToMenu();
await page.locator('.menu-btn__label').filter({ hasText: 'Season' }).first().click();
await settle();
const cont = page.getByRole('button', { name: /^Continue$/i });
if (await cont.count()) { await cont.click(); await settle(500); }

/** Navigates back to the season hub from wherever we ended up. */
async function toHub() {
  for (let i = 0; i < 6; i++) {
    if (await page.getByRole('button', { name: /^Play game$/i }).count()) return true;
    const back = page.locator('.topbar button').first();
    if (await back.count()) { await back.click().catch(() => {}); await settle(340); continue; }
    break;
  }
  await backToMenu();
  await page.locator('.menu-btn__label').filter({ hasText: 'Season' }).first().click();
  await settle();
  const c = page.getByRole('button', { name: /^Continue$/i });
  if (await c.count()) { await c.click(); await settle(500); }
  return await page.getByRole('button', { name: /^Play game$/i }).count() > 0;
}

for (const [name, label] of [
  ['Team', 'Team screen'], ['Schedule', 'Schedule'], ['Standings', 'Standings'],
  ['Statistics', 'Statistics'], ['Staff', "Coach's office"], ['Transfers', 'Transfer portal'],
]) {
  await toHub();
  const b = page.locator('button.btn', { hasText: name }).first();
  if (await b.count()) {
    await b.click(); await settle(400);
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
    errors.push(`season hub is missing the ${name} button`);
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
