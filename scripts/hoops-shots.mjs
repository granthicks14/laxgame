/**
 * PHOTOGRAPHS OF THE FLOOR.
 *
 * A graphics pass cannot be done from source. This drops into an exhibition
 * game, lets it play itself for a few seconds so there are bodies in motion and
 * a ball in the air, and writes a PNG per moment per width.
 *
 *   npm run build && npm run preview &
 *   node scripts/hoops-shots.mjs [outdir]
 */
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { enterSport } from './enter.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const OUT = process.argv[2] ?? 'shots/hoops';
mkdirSync(OUT, { recursive: true });

const SIZES = [
  { name: 'phone', width: 390, height: 844, touch: true },
  { name: 'desktop', width: 1440, height: 900, touch: false },
];

const browser = await chromium.launch({ executablePath: chromiumPath() });
const problems = [];

for (const size of SIZES) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
    hasTouch: size.touch,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${size.name}: pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${size.name}: ${m.text()}`); });

  const shot = async (name) => {
    writeFileSync(join(OUT, `${size.name}-${name}.png`), await page.screenshot());
    console.log(`${size.name}-${name}.png`);
  };
  const tap = async (re) => {
    const b = page.getByRole('button', { name: re }).first();
    await b.waitFor({ state: 'visible', timeout: 8000 });
    await b.click();
    await page.waitForTimeout(320);
  };

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await enterSport(page, 'basketball');
  await page.locator('.menu-btn__label').filter({ hasText: 'Play Now' }).first().click();
  await page.waitForTimeout(400);
  await shot('setup');
  await tap(/Tip off \(home\)/i);
  await page.waitForSelector('canvas', { timeout: 10000 });
  // The lineups hold the clock; photograph them before they go.
  await page.waitForTimeout(500);
  await shot('lineups');
  await page.waitForTimeout(4200);

  for (const [i, wait] of [1200, 2600, 4200, 6000].entries()) {
    await page.waitForTimeout(i === 0 ? wait : wait - [1200, 2600, 4200, 6000][i - 1]);
    await shot(`court-${i + 1}`);
  }

  /* THE BREAK. Waiting three and a half minutes of real time for a quarter to
   * end is not a screenshot script, so the clock is wound forward through the
   * game's own debug handle — the same one the browser suites use. */
  await page.evaluate(() => { window.hardwood.game.clock = 0.6; });
  await page.waitForTimeout(1600);
  await shot('quarter-break');
  await ctx.close();
}

await browser.close();
if (problems.length) {
  for (const p of problems) console.log(`PROBLEM  ${p}`);
  process.exit(1);
}
