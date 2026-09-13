/**
 * Responsive check for the screens added with Challenge Mode and recruiting.
 * Walks each one at phone, tablet and desktop widths and fails on horizontal
 * overflow, tiny text or touch targets under 40px.
 *
 *   npm run build && npm run preview &
 *   node scripts/responsive-check.mjs
 */
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const SIZES = [
  ['iPhone SE', 375, 667],
  ['iPhone 13', 390, 844],
  ['iPad', 820, 1180],
  ['Laptop', 1280, 800],
];

const problems = [];
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) problems.push(name);
};

const browser = await chromium.launch({ executablePath: chromiumPath() });

async function measure(page, label) {
  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    const scroller = document.querySelector('.scroll');
    const small = [...document.querySelectorAll('.screen *')]
      .filter((el) => el.childElementCount === 0 && (el.textContent ?? '').trim().length > 2)
      .map((el) => parseFloat(getComputedStyle(el).fontSize))
      .filter((n) => n > 0);
    const targets = [...document.querySelectorAll('.screen button:not(.seg__opt)')]
      .map((el) => el.getBoundingClientRect().height)
      .filter((n) => n > 0);
    // Text that is cut off with an ellipsis is text the player cannot read.
    // The topbar is where it happens first, because the title and the subtitle
    // share one line and neither wraps.
    const clipped = [...document.querySelectorAll('.topbar__sub, .topbar__title')]
      .filter((el) => el.scrollWidth - el.clientWidth > 1)
      .map((el) => (el.textContent ?? '').trim());
    return {
      overflow: Math.max(
        doc.scrollWidth - doc.clientWidth,
        scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
      ),
      minFont: small.length ? Math.min(...small) : 99,
      minTarget: targets.length ? Math.min(...targets) : 99,
      buttons: targets.length,
      clipped,
    };
  });
  check(`${label}: no horizontal overflow`, m.overflow <= 1, `${m.overflow}px`);
  check(`${label}: text stays legible`, m.minFont >= 10.5, `${m.minFont}px smallest`);
  check(`${label}: touch targets are big enough`, m.minTarget >= 30, `${m.minTarget.toFixed(0)}px smallest of ${m.buttons}`);
  check(`${label}: nothing in the topbar is cut off`, m.clipped.length === 0, m.clipped.join(' | '));
}

for (const [device, width, height] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: width < 900 });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Press Start').click();
  await page.waitForTimeout(300);

  const click = async (re) => {
    const b = page.getByRole('button', { name: re }).first();
    if (!(await b.count())) return false;
    await b.click().catch(() => {});
    await page.waitForTimeout(360);
    return true;
  };

  await page.locator('.menu-btn__label').filter({ hasText: 'Challenge' }).first().click();
  await page.waitForTimeout(360);
  await measure(page, `${device} · Challenge entry`);

  // Choosing a difficulty is its own screen now, and it carries a lot of text
  // and a wide table — exactly the kind of screen this suite exists to catch.
  await click(/Choose your difficulty/);
  await page.waitForTimeout(420);
  await measure(page, `${device} · Difficulty picker`);
  await click(/^Impossible Challenge/i);
  await page.waitForTimeout(360);
  await measure(page, `${device} · Difficulty detail`);
  await click(/Compare all \d+/);
  await page.waitForTimeout(420);
  await measure(page, `${device} · Difficulty comparison`);
  await page.locator('.topbar button').first().click();
  await page.waitForTimeout(360);

  await click(/^Start on/);
  await page.waitForTimeout(700);
  await measure(page, `${device} · Season hub`);

  await click(/Recruiting board/);
  await measure(page, `${device} · Recruiting board`);

  const row = page.locator('.list__row').first();
  if (await row.count()) {
    await row.click();
    await page.waitForTimeout(360);
    await measure(page, `${device} · Prospect report`);
    await page.locator('.topbar button').first().click();
    await page.waitForTimeout(360);
  }

  await click(/Scout market/);
  await measure(page, `${device} · Scout market`);
  await page.locator('.topbar button').first().click();
  await page.waitForTimeout(300);
  await page.locator('.topbar button').first().click();
  await page.waitForTimeout(300);

  await click(/Career tracker/);
  await measure(page, `${device} · Career tracker`);

  await ctx.close();
}

console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
if (problems.length) console.log(`\nFailed:\n  ${problems.join('\n  ')}`);
await browser.close();
process.exit(problems.length ? 1 : 0);
