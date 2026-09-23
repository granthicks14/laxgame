/**
 * A TOUR OF EVERY SPORT, PHOTOGRAPHED.
 *
 * The UI pass for three sports cannot be done from the source. This walks the
 * screens that matter in each of them at a phone's width and a desktop's, and
 * writes a PNG for each so they can be looked at.
 *
 *   npm run build && npm run preview &
 *   node scripts/tour.mjs [outdir] [sport...]
 */
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { enterSport } from './enter.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const OUT = process.argv[2] ?? 'tour';
const ONLY = process.argv.slice(3);
mkdirSync(OUT, { recursive: true });

const SIZES = (process.env.SIZES ?? 'phone,desktop').split(',').map((n) => ({
  phone: { name: 'phone', width: 390, height: 844 },
  desktop: { name: 'desktop', width: 1440, height: 900 },
}[n]));

const browser = await chromium.launch({ executablePath: chromiumPath() });
const problems = [];

for (const size of SIZES) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
    hasTouch: size.name === 'phone',
    isMobile: size.name === 'phone',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${size.name}: pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${size.name}: ${m.text()}`); });
  const settle = (ms = 380) => page.waitForTimeout(ms);
  /* THE APP SCROLLS INSIDE ITS OWN CONTAINERS, so a full-page screenshot is
   * one viewport tall. A "full" shot grows the viewport to the content instead,
   * then puts it back. */
  const shot = async (name, full = false) => {
    if (full) {
      const tall = await page.evaluate(() => {
        const el = [...document.querySelectorAll('.scroll')].pop();
        return el ? el.scrollHeight + (el.getBoundingClientRect().top) + 40 : 0;
      });
      if (tall > size.height) await page.setViewportSize({ width: size.width, height: Math.ceil(Math.min(tall, 6000)) });
      await page.waitForTimeout(120);
    }
    writeFileSync(join(OUT, `${size.name}-${name}.png`), await page.screenshot());
    if (full) await page.setViewportSize({ width: size.width, height: size.height });
    const over = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 1) problems.push(`${size.name}/${name}: ${over}px horizontal overflow`);
  };
  const click = async (loc) => (size.name === 'phone' ? loc.tap() : loc.click());
  const btn = (text) => page.locator('button', { hasText: text }).first();
  const back = async () => { await click(page.getByRole('button', { name: 'Back' }).first()); await settle(); };
  const home = async () => { await page.goto(BASE, { waitUntil: 'networkidle' }); await settle(); };
  const want = (s) => !ONLY.length || ONLY.includes(s);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await home();

  if (want('hub')) {
    await shot('hub-title');
    await click(page.getByRole('button', { name: /^Play Now$/i }).first());
    await settle();
    await shot('hub-sports', true);
    await home();
  }

  if (want('football')) {
    await enterSport(page, 'football', { title: 'Gridiron', tap: size.name === 'phone' });
    await shot('fb-menu');
    await click(page.locator('.menu-btn__label').filter({ hasText: 'How to Play' }).first());
    await settle(); await shot('fb-howto', true); await back();
    await click(page.locator('.menu-btn__label').filter({ hasText: 'Play Now' }).first());
    await settle(); await shot('fb-setup', true);
    await click(btn('Kick off')); await settle(1500);
    // Wait for the play card.
    await page.locator('.callcard__inner, .fb-defence:not(.is-off)').first().waitFor({ timeout: 20000 }).catch(() => {});
    await shot('fb-game-first');
    for (let i = 0; i < 40; i++) {
      if (await page.locator('.callcard__play').count()) break;
      if (await page.locator('.fb-defence:not(.is-off)').count()) {
        await shot('fb-game-defence');
        await click(page.locator('.fb-plan__chip').first()); await settle(250);
        await shot('fb-game-plan');
        await click(page.locator('.fb-plan__opt').first()); await settle(200);
        await click(page.locator('.fb-plan__chip--ghost').first()); await settle(400);
      }
      await settle(300);
    }
    await shot('fb-game-card');
    if (await page.locator('.callcard__play').count()) {
      await click(page.locator('.callcard__play').nth(3)); await settle(900);
      await shot('fb-game-presnap');
      await page.keyboard.press('Space'); await settle(1200);
      await shot('fb-game-live');
    }
    await page.keyboard.press('Escape'); await settle();
    await shot('fb-pause');
    await click(page.locator('.seg__opt', { hasText: 'Box score' }).first()); await settle();
    await shot('fb-pause-box');
    await page.evaluate(() => {
      const g = window.gridiron.game; const n = window.gridiron.neutral;
      g.humanSide = null;
      for (let i = 0; i < 60 * 60 * 25 && !g.isFinal(); i++) g.update(1 / 60, n());
    });
    await settle(1800);
    await shot('fb-final', true);
    await home();

    await enterSport(page, 'football', { title: 'Gridiron', tap: size.name === 'phone' });
    await click(page.locator('.menu-btn__label').filter({ hasText: 'Dynasty' }).first());
    await settle(); await shot('fb-start', true);
    await click(page.locator('.club-line').nth(4)); await settle();
    await click(btn('Take the job'));
    await page.locator('.career-head').first().waitFor({ timeout: 8000 });
    await settle(); await shot('fb-hub', true);
    await click(page.locator('.fo-link', { hasText: 'Roster' }).first()); await settle(); await shot('fb-roster', true);
    await click(page.locator('.roster-row').first()); await settle(); await shot('fb-player', true); await back();
    await click(page.locator('.seg__opt', { hasText: 'Needs' }).first()); await settle(); await shot('fb-needs', true);
    await back();
    await click(page.locator('.fo-link', { hasText: 'League' }).first()); await settle(); await shot('fb-league', true);
    await click(page.locator('.seg__opt', { hasText: 'Picture' }).first()); await settle(); await shot('fb-picture', true);
    await click(page.locator('.seg__opt', { hasText: 'Your games' }).first()); await settle(); await shot('fb-schedule', true);
    await back();
    await click(page.locator('.fo-link', { hasText: 'Staff' }).first()); await settle(); await shot('fb-staff', true); await back();
    await click(page.locator('.fo-link', { hasText: 'Facilities' }).first()); await settle(); await shot('fb-facilities', true); await back();
    await click(page.locator('.fo-link', { hasText: 'Trade desk' }).first()); await settle(); await shot('fb-trade', true);
    await click(page.locator('.club-line').first()); await settle(); await shot('fb-trade-desk', true);
    await back(); await back();
    await click(btn('Simulate the rest of the season')); await settle(3000);
    await shot('fb-hub-offseason', true);
    await click(page.locator('.fo-link', { hasText: 'History' }).first()); await settle(); await shot('fb-history', true);
    await click(page.locator('.seg__opt', { hasText: 'Leaders' }).first()); await settle(); await shot('fb-leaders', true);
    await back();
    await click(btn('Work the offseason')); await settle(); await shot('fb-off-review', true);
    await click(btn('On to the staff')); await settle(); await shot('fb-off-staff', true);
    await click(btn('On to your contracts')); await settle(); await shot('fb-off-contracts', true);
    await click(btn('On to free agency')); await settle(); await shot('fb-off-fa', true);
    await click(btn('On to the draft')); await settle();
    await click(page.locator('button', { hasText: /draft room/ }).first()); await settle(800);
    await shot('fb-draft', true);
    await back();
    await click(btn('On to the buildings')); await settle();
    await click(btn('Ready for camp')); await settle(); await shot('fb-off-ready', true);
    await home();
  }

  if (want('basketball')) {
    await enterSport(page, 'basketball', { tap: size.name === 'phone' });
    await shot('bb-menu');
    await click(page.locator('.menu-btn__label').filter({ hasText: 'Play Now' }).first());
    await settle(); await shot('bb-setup', true);
    await click(btn('Tip off')); await settle(2500);
    await shot('bb-game-intro');
    await settle(3500); await shot('bb-game');
    await page.keyboard.press('Escape'); await settle(); await shot('bb-pause');
    await home();
    await enterSport(page, 'basketball', { tap: size.name === 'phone' });
    await click(page.locator('.menu-btn__label').filter({ hasText: 'Dynasty' }).first());
    await settle(); await shot('bb-dynasty-start', true);
    await page.locator('select.select').first().selectOption({ index: 6 }).catch(() => {});
    await settle();
    await click(page.locator('.roster-row').nth(3)); await settle(1200);
    await shot('bb-career-hub', true);
    await home();
  }

  if (want('lacrosse')) {
    await enterSport(page, 'lacrosse', { tap: size.name === 'phone' });
    await shot('lax-menu');
    const items = await page.locator('.menu-btn__label').allTextContents();
    console.log(`${size.name} lacrosse menu: ${items.join(' | ')}`);
    for (const label of items) {
      if (/settings/i.test(label)) continue;
      await click(page.locator('.menu-btn__label').filter({ hasText: label }).first());
      await settle(700);
      await shot(`lax-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`, true);
      await home();
      await enterSport(page, 'lacrosse', { tap: size.name === 'phone' });
    }
    await home();
  }
  await ctx.close();
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'no problems');
